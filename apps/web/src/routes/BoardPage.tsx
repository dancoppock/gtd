import {
  boardFiltersSchema,
  type Label,
  SYSTEM_BOARD_ACTIVE_STATUS_KEY,
  SYSTEM_BOARD_DONE_STATUS_KEY,
  type BoardFilters,
  type Ticket,
  type TicketPriority,
  type UpdateTicketInput,
} from "@gtd/contracts";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  archiveDoneTickets,
  createTicket,
  deleteTicket,
  fetchBoardTickets,
  repositionTicket,
  updateTicket,
  updateBoardSwimlaneOrder,
} from "../features/board/api";
import { BoardColumn, type CreateTicketPosition } from "../features/board/BoardColumn";
import { BoardColumnHeader } from "../features/board/BoardColumnHeader";
import {
  buildRepositionInput,
  findStatusKey,
  haveSameTicketLayout,
  moveTicket,
} from "../features/board/drag";
import {
  getNextTicketId,
  getTicketMoveTarget,
  type BoardTicketLane,
  type TicketMoveDirection,
} from "../features/board/keyboard";
import {
  clampTitleCursorIndex,
  clampTitleInsertionIndex,
  getLastTitleCursorIndex,
  moveTitleCursorToNextWord,
  moveTitleCursorToPreviousWord,
  resolveNavigationTitleCursorIndex,
} from "../features/board/titleCursor";
import { SwimlaneToggle } from "../features/board/SwimlaneToggle";
import {
  buildSwimlaneRepositionInput,
  buildSwimlanes,
  resolveTicketSwimlane,
  UNLABELED_SWIMLANE_KEY,
  updateTicketSwimlaneLabels,
} from "../features/board/swimlanes";
import { TicketViewToggle, type TicketViewMode } from "../features/board/TicketViewToggle";
import { BoardFilters as BoardFiltersPanel } from "../features/filters/BoardFilters";
import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";
import { TicketCard } from "../features/tickets/TicketCard";
import { TicketModal } from "../features/tickets/TicketModal";
import { extractHashtagLabels, stripHashtagsFromTitle } from "../features/tickets/titleTags";

function readFilters(searchParams: URLSearchParams): BoardFilters {
  const candidateFilters = {
    priorities: searchParams.getAll("priority") as BoardFilters["priorities"],
    labels: searchParams.getAll("label"),
    q: searchParams.get("q") ?? "",
  };

  const parsed = boardFiltersSchema.safeParse(candidateFilters);

  return parsed.success
    ? parsed.data
    : {
        priorities: [],
        labels: [],
        q: "",
      };
}

function writeFilters(nextFilters: BoardFilters) {
  const params = new URLSearchParams();

  nextFilters.priorities.forEach((priority) => params.append("priority", priority));
  nextFilters.labels.forEach((label) => params.append("label", label));

  if (nextFilters.q) {
    params.set("q", nextFilters.q);
  }

  return params;
}

function resolveTicketTone(columns: Array<{ statusKey: string; statusCategory: string }>, ticket: Ticket) {
  return columns.find((column) => column.statusKey === ticket.statusKey)?.statusCategory === "completed"
    ? "done"
    : "default";
}

function buildSwimlaneDropTargetId(swimlaneKey: string, columnId: string) {
  return `swimlane:${swimlaneKey}:${columnId}`;
}

function normalizeLabelName(labelName: string) {
  return labelName.trim().toLowerCase();
}

function buildCreateTicketLabels(
  inputLabels: string[],
  laneLabels: string[],
  boardFilterLabels: Label[],
  defaultLabel: Label | null,
) {
  const labels = new Map<string, string>();

  [...inputLabels, ...laneLabels].forEach((label) => {
    const normalizedName = normalizeLabelName(label);

    if (normalizedName && !labels.has(normalizedName)) {
      labels.set(normalizedName, label);
    }
  });

  const defaultLabelName = defaultLabel?.normalizedName ?? null;
  const boardFilterLabelNames = new Set(boardFilterLabels.map((label) => label.normalizedName));
  const hasNonDefaultBoardFilterLabel = Array.from(labels.keys()).some(
    (labelName) => boardFilterLabelNames.has(labelName) && labelName !== defaultLabelName,
  );

  if (defaultLabelName && hasNonDefaultBoardFilterLabel) {
    labels.delete(defaultLabelName);
  }

  return Array.from(labels.values());
}

function toDisplayStatusKey(ticket: Ticket) {
  return ticket.completedAt ? SYSTEM_BOARD_DONE_STATUS_KEY : SYSTEM_BOARD_ACTIVE_STATUS_KEY;
}

function mapTicketsForBoardDisplay(isSystemBoard: boolean, tickets: Ticket[]) {
  if (!isSystemBoard) {
    return tickets;
  }

  return tickets.map((ticket) => ({
    ...ticket,
    statusKey: toDisplayStatusKey(ticket),
  }));
}

function moveSwimlaneLabelOrder(swimlanes: Array<{ key: string }>, laneKey: string, direction: -1 | 1) {
  const orderedKeys = swimlanes
    .map((swimlane) => swimlane.key)
    .filter((key) => key !== UNLABELED_SWIMLANE_KEY);
  const currentIndex = orderedKeys.indexOf(laneKey);
  const nextIndex = currentIndex + direction;

  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= orderedKeys.length) {
    return null;
  }

  const nextOrder = [...orderedKeys];
  const [movedKey] = nextOrder.splice(currentIndex, 1);
  if (!movedKey) {
    return null;
  }

  nextOrder.splice(nextIndex, 0, movedKey);

  return nextOrder;
}

function resolveMutationStatusKey(
  isSystemBoard: boolean,
  requestedStatusKey: string,
  actualTicket?: Ticket | null,
) {
  if (!isSystemBoard) {
    return requestedStatusKey;
  }

  if (requestedStatusKey === SYSTEM_BOARD_DONE_STATUS_KEY) {
    return "done";
  }

  if (requestedStatusKey === SYSTEM_BOARD_ACTIVE_STATUS_KEY) {
    return actualTicket && !actualTicket.completedAt ? actualTicket.statusKey : "todo";
  }

  return requestedStatusKey;
}

const COLLAPSED_COLUMN_WIDTH_PX = 48;
const EXPANDED_COLUMN_WIDTH_PX = 450;
const IN_PROGRESS_COLUMN_WIDTH_PX = 500;
const APP_TITLE = "GTD";
const SELECTED_TICKET_VIEWPORT_BUFFER_PX = 300;
const QUICK_PRIORITY_BY_KEY: Record<string, TicketPriority> = {
  "1": "highest",
  "2": "high",
  "3": "medium",
  "4": "low",
};

type CreateTicketIntent = {
  statusKey: Ticket["statusKey"];
  position: CreateTicketPosition;
  labels: string[];
};

export function BoardPage() {
  const { boardSlug = "default" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [createTicketIntent, setCreateTicketIntent] = useState<CreateTicketIntent | null>(null);
  const [collapsedStatusKeys, setCollapsedStatusKeys] = useState<Set<string>>(() => new Set());
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [expandedTicketIds, setExpandedTicketIds] = useState<Set<string>>(() => new Set());
  const [inlineEditingCursorIndex, setInlineEditingCursorIndex] = useState<number | undefined>(undefined);
  const [inlineEditingKey, setInlineEditingKey] = useState(0);
  const [inlineEditingTicketId, setInlineEditingTicketId] = useState<string | null>(null);
  const [inlineEditingTitle, setInlineEditingTitle] = useState<string | undefined>(undefined);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [showSwimlanes, setShowSwimlanes] = useState(false);
  const [taggedTicketIds, setTaggedTicketIds] = useState<Set<string>>(() => new Set());
  const [titleCursorIndex, setTitleCursorIndex] = useState(0);
  const [ticketViewMode, setTicketViewMode] = useState<TicketViewMode>("compact");
  const { theme, setTheme } = useBoardTheme();
  const [visibleTickets, setVisibleTickets] = useState<Ticket[]>([]);
  const pendingOptimisticRepositionCountRef = useRef(0);
  const [pendingOptimisticRepositionCount, setPendingOptimisticRepositionCount] = useState(0);
  const queryClient = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  function beginOptimisticReposition() {
    pendingOptimisticRepositionCountRef.current += 1;
    setPendingOptimisticRepositionCount(pendingOptimisticRepositionCountRef.current);
  }

  function endOptimisticReposition() {
    pendingOptimisticRepositionCountRef.current = Math.max(
      pendingOptimisticRepositionCountRef.current - 1,
      0,
    );
    setPendingOptimisticRepositionCount(pendingOptimisticRepositionCountRef.current);
  }

  const boardQuery = useQuery({
    queryKey: ["board", boardSlug, filters],
    queryFn: () => fetchBoardTickets(boardSlug, filters),
    placeholderData: (previousData) => previousData,
  });

  const createTicketMutation = useMutation({
    mutationFn: (input: {
      statusKey: Ticket["statusKey"];
      title: string;
      description: string;
      priority: Ticket["priority"];
      labels: string[];
      position: CreateTicketPosition;
    }) => {
      if (!boardQuery.data) {
        throw new Error("Board data is not ready");
      }

      return createTicket(boardQuery.data.board.id, input);
    },
    onSuccess: async () => {
      setCreateTicketIntent(null);
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: (args: {
      ticketId: string;
      input: UpdateTicketInput;
    }) => updateTicket(args.ticketId, args.input),
    onSuccess: async () => {
      setEditingTicket(null);
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  const deleteTicketMutation = useMutation({
    mutationFn: (ticketId: string) => deleteTicket(ticketId),
    onSuccess: async () => {
      setEditingTicket(null);
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  const archiveDoneTicketsMutation = useMutation({
    mutationFn: (boardId: string) => archiveDoneTickets(boardId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["labels"] });
    },
  });

  const updateSwimlaneOrderMutation = useMutation({
    mutationFn: (labelNames: string[]) => {
      if (!boardQuery.data) {
        throw new Error("Board data is not ready");
      }

      return updateBoardSwimlaneOrder(boardQuery.data.board.id, { labelNames });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
  });

  const repositionTicketMutation = useMutation({
    mutationFn: (args: {
      ticketId: string;
      input: {
        statusKey: Ticket["statusKey"];
        prevVisibleTicketId: string | null;
        nextVisibleTicketId: string | null;
      };
    }) => repositionTicket(args.ticketId, args.input),
    onMutate: () => {
      beginOptimisticReposition();
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      endOptimisticReposition();
    },
  });

  const data = boardQuery.data;
  const boardId = data?.board.id;
  const boardSwimlaneDefault = data?.board.swimlaneLayout === "labels";
  const actualTicketsById = useMemo(
    () => new Map((data?.tickets ?? []).map((ticket) => [ticket.id, ticket])),
    [data?.tickets],
  );
  const displayedDataTickets = useMemo(
    () => (data ? mapTicketsForBoardDisplay(data.board.isSystem, data.tickets) : []),
    [data],
  );
  const implicitSwimlaneLabelNames = useMemo(
    () => new Set((data?.board.filterLabels ?? []).map((label) => label.normalizedName)),
    [data?.board.filterLabels],
  );
  const swimlanes = useMemo(
    () =>
      data && showSwimlanes
        ? buildSwimlanes(
            data.board.columns,
            visibleTickets,
            implicitSwimlaneLabelNames,
            data.board.swimlaneLabelOrder,
          )
        : [],
    [data, implicitSwimlaneLabelNames, showSwimlanes, visibleTickets],
  );
  const swimlaneDropTargets = useMemo(() => {
    const dropTargets = new Map<string, { columnId: string; laneKey: string; laneName: string }>();

    if (!data || !showSwimlanes) {
      return dropTargets;
    }

    swimlanes.forEach((swimlane) => {
      data.board.columns.forEach((column) => {
        dropTargets.set(buildSwimlaneDropTargetId(swimlane.key, column.id), {
          columnId: column.id,
          laneKey: swimlane.key,
          laneName: swimlane.name,
        });
      });
    });

    return dropTargets;
  }, [data, showSwimlanes, swimlanes]);
  const boardGridStyle = useMemo(
    () =>
      ({
        gridTemplateColumns:
          data?.board.columns
            .map((column) =>
              collapsedStatusKeys.has(column.statusKey)
                ? `${COLLAPSED_COLUMN_WIDTH_PX}px`
                : `${column.statusKey === "in_progress" ? IN_PROGRESS_COLUMN_WIDTH_PX : EXPANDED_COLUMN_WIDTH_PX}px`,
            )
            .join(" ") ?? "",
      }) as CSSProperties,
    [collapsedStatusKeys, data?.board.columns],
  );
  const keyboardLanes = useMemo<BoardTicketLane[]>(
    () =>
      showSwimlanes
        ? swimlanes.map((swimlane) => ({
            key: swimlane.key,
            tickets: swimlane.tickets,
          }))
        : [
            {
              key: "board",
              tickets: visibleTickets,
            },
          ],
    [showSwimlanes, swimlanes, visibleTickets],
  );
  const activeTicket = activeTicketId
    ? visibleTickets.find((ticket) => ticket.id === activeTicketId) ?? null
    : null;

  useEffect(() => {
    const previousTitle = document.title;
    document.title = data?.board.name ? `${APP_TITLE} - ${data.board.name}` : APP_TITLE;

    return () => {
      document.title = previousTitle;
    };
  }, [data?.board.name]);

  useEffect(() => {
    if (data && pendingOptimisticRepositionCount === 0) {
      setVisibleTickets(displayedDataTickets);
    }
  }, [data, displayedDataTickets, pendingOptimisticRepositionCount]);

  useEffect(() => {
    if (boardId) {
      setShowSwimlanes(boardSwimlaneDefault);
      setSelectedTicketId(null);
      setTaggedTicketIds(new Set());
      setInlineEditingCursorIndex(undefined);
      setInlineEditingTicketId(null);
      setInlineEditingTitle(undefined);
      setTitleCursorIndex(0);
    }
  }, [boardId, boardSwimlaneDefault]);

  useEffect(() => {
    if (boardId) {
      setIsHeaderCollapsed(Boolean(data?.board.collapseMenusByDefault));
    }
  }, [boardId, data?.board.collapseMenusByDefault]);

  useEffect(() => {
    const visibleTicketIds = new Set(visibleTickets.map((ticket) => ticket.id));

    setSelectedTicketId((currentSelectedTicketId) =>
      currentSelectedTicketId && visibleTicketIds.has(currentSelectedTicketId)
        ? currentSelectedTicketId
        : null,
    );
    setTaggedTicketIds((currentTaggedTicketIds) => {
      const nextTaggedTicketIds = new Set(
        Array.from(currentTaggedTicketIds).filter((ticketId) => visibleTicketIds.has(ticketId)),
      );

      return nextTaggedTicketIds.size === currentTaggedTicketIds.size
        ? currentTaggedTicketIds
        : nextTaggedTicketIds;
    });
  }, [visibleTickets]);

  useEffect(() => {
    const selectedTicket = selectedTicketId
      ? visibleTickets.find((ticket) => ticket.id === selectedTicketId) ?? null
      : null;

    setTitleCursorIndex((currentCursorIndex) =>
      selectedTicket ? clampTitleCursorIndex(selectedTicket.title, currentCursorIndex) : 0,
    );
  }, [selectedTicketId, visibleTickets]);

  useEffect(() => {
    if (!selectedTicketId) {
      return;
    }

    window.requestAnimationFrame(() => {
      const selectedTicketElement = document.querySelector<HTMLElement>(
        `[data-ticket-id="${CSS.escape(selectedTicketId)}"]`,
      );

      if (!selectedTicketElement) {
        return;
      }

      selectedTicketElement.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });

      const rect = selectedTicketElement.getBoundingClientRect();
      const topLimit = SELECTED_TICKET_VIEWPORT_BUFFER_PX;
      const bottomLimit = window.innerHeight - SELECTED_TICKET_VIEWPORT_BUFFER_PX;
      const comfortableViewportHeight = bottomLimit - topLimit;

      if (rect.top < topLimit || rect.height > comfortableViewportHeight) {
        window.scrollBy({
          top: rect.top - topLimit,
          behavior: "smooth",
        });
        return;
      }

      if (rect.bottom > bottomLimit) {
        window.scrollBy({
          top: rect.bottom - bottomLimit,
          behavior: "smooth",
        });
      }
    });
  }, [selectedTicketId, visibleTickets]);

  function handleDragStart(event: DragStartEvent) {
    setActiveTicketId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    if (!data || !event.over) {
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);

    setVisibleTickets((currentTickets) => {
      if (showSwimlanes) {
        const activeTicket = currentTickets.find((ticket) => ticket.id === activeId);
        const overTicket = currentTickets.find((ticket) => ticket.id === overId);
        const activeLaneKey = activeTicket
          ? resolveTicketSwimlane(activeTicket, implicitSwimlaneLabelNames).key
          : null;
        const overLaneKey = overTicket
          ? resolveTicketSwimlane(overTicket, implicitSwimlaneLabelNames).key
          : (swimlaneDropTargets.get(overId)?.laneKey ?? null);

        if (!activeTicket || !activeLaneKey || !overLaneKey) {
          return currentTickets;
        }

        if (activeLaneKey !== overLaneKey) {
          return currentTickets;
        }

        const mappedOverId = swimlaneDropTargets.get(overId)?.columnId ?? overId;
        const nextTickets = moveTicket(data.board.columns, currentTickets, activeId, mappedOverId);

        return haveSameTicketLayout(currentTickets, nextTickets) ? currentTickets : nextTickets;
      }

      const activeStatusKey = findStatusKey(data.board.columns, currentTickets, activeId);
      const overStatusKey = findStatusKey(data.board.columns, currentTickets, overId);

      if (!activeStatusKey || !overStatusKey || activeStatusKey === overStatusKey) {
        return currentTickets;
      }

      const nextTickets = moveTicket(data.board.columns, currentTickets, activeId, overId);
      return haveSameTicketLayout(currentTickets, nextTickets) ? currentTickets : nextTickets;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicketId(null);

    if (!data || !event.over) {
      setVisibleTickets(displayedDataTickets);
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);

    if (showSwimlanes) {
      const activeTicket = visibleTickets.find((ticket) => ticket.id === activeId);
      const originalActiveTicket =
        displayedDataTickets.find((ticket) => ticket.id === activeId) ?? activeTicket;
      const overTicket = visibleTickets.find((ticket) => ticket.id === overId);
      const activeLaneKey = originalActiveTicket
        ? resolveTicketSwimlane(originalActiveTicket, implicitSwimlaneLabelNames).key
        : null;
      const overLaneKey = overTicket
        ? resolveTicketSwimlane(overTicket, implicitSwimlaneLabelNames).key
        : (swimlaneDropTargets.get(overId)?.laneKey ?? null);

      if (!activeTicket || !originalActiveTicket || !activeLaneKey || !overLaneKey) {
        setVisibleTickets(displayedDataTickets);
        return;
      }

      const overLaneName = overTicket
        ? resolveTicketSwimlane(overTicket, implicitSwimlaneLabelNames).name
        : (swimlaneDropTargets.get(overId)?.laneName ?? overLaneKey);
      const mappedOverId = swimlaneDropTargets.get(overId)?.columnId ?? overId;
      const nextLabels = updateTicketSwimlaneLabels(
        originalActiveTicket,
        { key: overLaneKey, name: overLaneName },
        implicitSwimlaneLabelNames,
        data.board.defaultLabel?.normalizedName,
      );
      const ticketsWithTargetLane =
        activeLaneKey === overLaneKey
          ? visibleTickets
          : visibleTickets.map((ticket) =>
              ticket.id === activeId
                ? {
                    ...ticket,
                    labels: nextLabels,
                  }
                : ticket,
            );
      const nextTickets = moveTicket(data.board.columns, ticketsWithTargetLane, activeId, mappedOverId);
      const didChange = !haveSameTicketLayout(displayedDataTickets, nextTickets);
      const didChangeLane = activeLaneKey !== overLaneKey;
      const nextActiveTicket = nextTickets.find((ticket) => ticket.id === activeId);

      setVisibleTickets(nextTickets);

      if (didChange) {
        const repositionInput = buildSwimlaneRepositionInput(
          data.board.columns,
          nextTickets,
          activeId,
          implicitSwimlaneLabelNames,
        );

        if (repositionInput) {
          repositionTicketMutation.mutate({
            ticketId: activeId,
            input: {
              ...repositionInput,
              statusKey: resolveMutationStatusKey(
                data.board.isSystem,
                repositionInput.statusKey,
                actualTicketsById.get(activeId) ?? null,
              ),
            },
          });
        }
      }

      if (didChangeLane) {
        updateTicketMutation.mutate({
          ticketId: activeId,
          input: {
            labels: nextLabels.map((label) => label.name),
          },
        });
      }

      if (nextActiveTicket) {
        collapseExpandedTicketAfterColumnMove(
          activeId,
          originalActiveTicket.statusKey,
          nextActiveTicket.statusKey,
        );
      }

      return;
    }

    const originalActiveTicket = displayedDataTickets.find((ticket) => ticket.id === activeId) ?? null;
    const nextTickets = moveTicket(data.board.columns, visibleTickets, activeId, overId);
    const didChange = !haveSameTicketLayout(displayedDataTickets, nextTickets);
    const nextActiveTicket = nextTickets.find((ticket) => ticket.id === activeId);

    setVisibleTickets(nextTickets);

    if (didChange) {
      const repositionInput = buildRepositionInput(data.board.columns, nextTickets, activeId);

      if (repositionInput) {
        repositionTicketMutation.mutate({
          ticketId: activeId,
          input: {
            ...repositionInput,
            statusKey: resolveMutationStatusKey(
              data.board.isSystem,
              repositionInput.statusKey,
              actualTicketsById.get(activeId) ?? null,
            ),
          },
        });
      }
    }

    if (originalActiveTicket && nextActiveTicket) {
      collapseExpandedTicketAfterColumnMove(
        activeId,
        originalActiveTicket.statusKey,
        nextActiveTicket.statusKey,
      );
    }
  }

  function handleDragCancel() {
    setActiveTicketId(null);
    if (data) {
      setVisibleTickets(displayedDataTickets);
    }
  }

  async function handleInlineTitleUpdate(ticket: Ticket, nextTitle: string) {
    const previousTitle = ticket.title;
    const previousLabels = ticket.labels;
    const hashtagLabels = extractHashtagLabels(nextTitle);
    const sanitizedTitle = stripHashtagsFromTitle(nextTitle);

    if (!sanitizedTitle) {
      throw new Error("Title cannot be empty");
    }

    const mergedLabels = Array.from(
      new Set([
        ...ticket.labels.map((label) => label.name),
        ...hashtagLabels,
      ]),
    );

    setVisibleTickets((currentTickets) =>
      currentTickets.map((currentTicket) =>
        currentTicket.id === ticket.id
          ? {
              ...currentTicket,
              title: sanitizedTitle,
              labels: Array.from(
                new Map(
                  [
                    ...currentTicket.labels.map((label) => [label.normalizedName, label] as const),
                    ...hashtagLabels.map((label) => [
                      label,
                      {
                        id: `inline-label-${label}`,
                        name: label,
                        normalizedName: label,
                      },
                    ] as const),
                  ],
                ).values(),
              ),
            }
          : currentTicket,
      ),
    );

    try {
      await updateTicketMutation.mutateAsync({
        ticketId: ticket.id,
        input: {
          title: sanitizedTitle,
          labels: mergedLabels,
        },
      });
    } catch (error) {
      setVisibleTickets((currentTickets) =>
        currentTickets.map((currentTicket) =>
          currentTicket.id === ticket.id
            ? {
                ...currentTicket,
                title: previousTitle,
                labels: previousLabels,
              }
            : currentTicket,
        ),
      );
      throw error;
    }
  }

  function findVisibleTicket(ticketId: string | null) {
    return ticketId ? (visibleTickets.find((ticket) => ticket.id === ticketId) ?? null) : null;
  }

  function selectOnlyTicket(ticketId: string, options: { resetTitleCursor?: boolean } = {}) {
    setSelectedTicketId(ticketId);
    setTaggedTicketIds(new Set());

    if (options.resetTitleCursor) {
      setTitleCursorIndex(0);
    }
  }

  function selectTicketWithKeyboard(ticketId: string) {
    if (ticketId === selectedTicketId) {
      setSelectedTicketId(ticketId);
      return;
    }

    const currentTicket = findVisibleTicket(selectedTicketId);
    const nextTicket = findVisibleTicket(ticketId);

    setSelectedTicketId(ticketId);
    setTitleCursorIndex(
      currentTicket && nextTicket
        ? resolveNavigationTitleCursorIndex(currentTicket.title, titleCursorIndex, nextTicket.title)
        : 0,
    );
  }

  function handleToggleTicketExpanded(ticketId: string, options?: { selectTicket?: boolean }) {
    if (options?.selectTicket) {
      selectOnlyTicket(ticketId, { resetTitleCursor: true });
    }

    setExpandedTicketIds((currentExpandedTicketIds) => {
      const nextExpandedTicketIds = new Set(currentExpandedTicketIds);

      if (nextExpandedTicketIds.has(ticketId)) {
        nextExpandedTicketIds.delete(ticketId);
      } else {
        nextExpandedTicketIds.add(ticketId);
      }

      return nextExpandedTicketIds;
    });
  }

  function handleInlineTitleEditEnd(ticket: Ticket) {
    setInlineEditingTicketId((currentTicketId) =>
      currentTicketId === ticket.id ? null : currentTicketId,
    );
    setInlineEditingCursorIndex(undefined);
    setInlineEditingTitle(undefined);
  }

  function handleInlineTitleEditStart(ticket: Ticket) {
    setSelectedTicketId(ticket.id);
    setInlineEditingTicketId(ticket.id);
    setInlineEditingCursorIndex(undefined);
    setInlineEditingTitle(undefined);
  }

  function handleToggleCollapsed(statusKey: string) {
    setCollapsedStatusKeys((currentCollapsedStatusKeys) => {
      const nextCollapsedStatusKeys = new Set(currentCollapsedStatusKeys);

      if (nextCollapsedStatusKeys.has(statusKey)) {
        nextCollapsedStatusKeys.delete(statusKey);
      } else {
        nextCollapsedStatusKeys.add(statusKey);
      }

      return nextCollapsedStatusKeys;
    });
  }

  function collapseExpandedTicketAfterColumnMove(
    ticketId: string,
    previousStatusKey: Ticket["statusKey"],
    nextStatusKey: Ticket["statusKey"],
  ) {
    if (ticketViewMode !== "compact" || previousStatusKey === nextStatusKey) {
      return;
    }

    setExpandedTicketIds((currentExpandedTicketIds) => {
      if (!currentExpandedTicketIds.has(ticketId)) {
        return currentExpandedTicketIds;
      }

      const nextExpandedTicketIds = new Set(currentExpandedTicketIds);
      nextExpandedTicketIds.delete(ticketId);
      return nextExpandedTicketIds;
    });
  }

  function requestInlineTitleEdit(ticketId: string, initialTitle?: string, cursorIndex?: number) {
    const ticket = findVisibleTicket(ticketId);
    const nextTitle = initialTitle ?? ticket?.title ?? "";
    const nextCursorIndex = clampTitleInsertionIndex(nextTitle, cursorIndex ?? nextTitle.length);

    setSelectedTicketId(ticketId);
    setTitleCursorIndex(clampTitleCursorIndex(nextTitle, nextCursorIndex));
    setInlineEditingCursorIndex(nextCursorIndex);
    setInlineEditingTicketId(ticketId);
    setInlineEditingTitle(initialTitle);
    setInlineEditingKey((currentKey) => currentKey + 1);
  }

  function handleTicketClick(ticket: Ticket, event: ReactMouseEvent) {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, input, textarea, select, a, [data-no-card-toggle='true']")
    ) {
      return;
    }

    if (event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      setTaggedTicketIds((currentTaggedTicketIds) => {
        const nextTaggedTicketIds = new Set(currentTaggedTicketIds);

        if (nextTaggedTicketIds.has(ticket.id)) {
          nextTaggedTicketIds.delete(ticket.id);
        } else {
          nextTaggedTicketIds.add(ticket.id);
        }

        return nextTaggedTicketIds;
      });
      return;
    }

    selectOnlyTicket(ticket.id, { resetTitleCursor: true });
  }

  function persistReposition(ticketId: string, nextTickets: Ticket[]) {
    if (!data) {
      return;
    }

    const repositionInput = buildResolvedRepositionInput(ticketId, nextTickets);

    if (!repositionInput) {
      return;
    }

    repositionTicketMutation.mutate({
      ticketId,
      input: repositionInput,
    });
  }

  function isOptimisticRepositionPending() {
    return pendingOptimisticRepositionCountRef.current > 0;
  }

  function buildResolvedRepositionInput(ticketId: string, nextTickets: Ticket[]) {
    if (!data) {
      return null;
    }

    const repositionInput = showSwimlanes
      ? buildSwimlaneRepositionInput(
          data.board.columns,
          nextTickets,
          ticketId,
          implicitSwimlaneLabelNames,
        )
      : buildRepositionInput(data.board.columns, nextTickets, ticketId);

    if (!repositionInput) {
      return null;
    }

    return {
      ...repositionInput,
      statusKey: resolveMutationStatusKey(
        data.board.isSystem,
        repositionInput.statusKey,
        actualTicketsById.get(ticketId) ?? null,
      ),
    };
  }

  function getTaggedTicketsInSingleColumn() {
    if (taggedTicketIds.size === 0) {
      return null;
    }

    const taggedTickets = visibleTickets.filter((ticket) => taggedTicketIds.has(ticket.id));
    const firstTaggedTicket = taggedTickets[0];

    if (!firstTaggedTicket || taggedTickets.length !== taggedTicketIds.size) {
      return null;
    }

    const statusKey = firstTaggedTicket.statusKey;
    if (taggedTickets.some((ticket) => ticket.statusKey !== statusKey)) {
      return null;
    }

    return {
      statusKey,
      tickets: taggedTickets,
    };
  }

  function flattenTicketsByColumn(nextGroups: Map<Ticket["statusKey"], Ticket[]>) {
    if (!data) {
      return visibleTickets;
    }

    return data.board.columns.flatMap((column) => nextGroups.get(column.statusKey) ?? []);
  }

  function moveTaggedTicketsVertically(direction: "up" | "down") {
    if (!data) {
      return null;
    }

    const taggedContext = getTaggedTicketsInSingleColumn();
    if (!taggedContext) {
      return null;
    }

    const taggedIds = new Set(taggedContext.tickets.map((ticket) => ticket.id));
    const sourceSwimlaneKey = showSwimlanes
      ? resolveTicketSwimlane(taggedContext.tickets[0]!, implicitSwimlaneLabelNames).key
      : null;
    if (
      sourceSwimlaneKey
      && taggedContext.tickets.some(
        (ticket) => resolveTicketSwimlane(ticket, implicitSwimlaneLabelNames).key !== sourceSwimlaneKey,
      )
    ) {
      return null;
    }

    const sourceTickets = visibleTickets.filter(
      (ticket) =>
        ticket.statusKey === taggedContext.statusKey
        && (
          !sourceSwimlaneKey
          || resolveTicketSwimlane(ticket, implicitSwimlaneLabelNames).key === sourceSwimlaneKey
        ),
    );
    const firstTaggedIndex = sourceTickets.findIndex((ticket) => taggedIds.has(ticket.id));
    const lastTaggedIndex = sourceTickets.reduce(
      (lastIndex, ticket, index) => (taggedIds.has(ticket.id) ? index : lastIndex),
      -1,
    );

    if (firstTaggedIndex < 0 || lastTaggedIndex < 0) {
      return null;
    }

    const nextGroups = new Map(
      data.board.columns.map((column) => [
        column.statusKey,
        visibleTickets.filter((ticket) => ticket.statusKey === column.statusKey),
      ]),
    );
    const movingTickets = sourceTickets.filter((ticket) => taggedIds.has(ticket.id));
    const remainingTickets = sourceTickets.filter((ticket) => !taggedIds.has(ticket.id));

    if (direction === "up") {
      const previousTicket = sourceTickets
        .slice(0, firstTaggedIndex)
        .reverse()
        .find((ticket) => !taggedIds.has(ticket.id));

      if (!previousTicket) {
        return null;
      }

      const insertIndex = remainingTickets.findIndex((ticket) => ticket.id === previousTicket.id);
      remainingTickets.splice(insertIndex, 0, ...movingTickets);
    } else {
      const nextTicket = sourceTickets
        .slice(lastTaggedIndex + 1)
        .find((ticket) => !taggedIds.has(ticket.id));

      if (!nextTicket) {
        return null;
      }

      const insertIndex = remainingTickets.findIndex((ticket) => ticket.id === nextTicket.id);
      remainingTickets.splice(insertIndex + 1, 0, ...movingTickets);
    }

    if (sourceSwimlaneKey) {
      let nextSourceTicketIndex = 0;
      nextGroups.set(
        taggedContext.statusKey,
        visibleTickets
          .filter((ticket) => ticket.statusKey === taggedContext.statusKey)
          .map((ticket) => {
            if (resolveTicketSwimlane(ticket, implicitSwimlaneLabelNames).key !== sourceSwimlaneKey) {
              return ticket;
            }

            const nextSourceTicket = remainingTickets[nextSourceTicketIndex];
            nextSourceTicketIndex += 1;
            return nextSourceTicket ?? ticket;
          }),
      );
    } else {
      nextGroups.set(taggedContext.statusKey, remainingTickets);
    }

    return flattenTicketsByColumn(nextGroups);
  }

  function moveTaggedTicketsHorizontally(direction: "left" | "right") {
    if (!data) {
      return null;
    }

    const taggedContext = getTaggedTicketsInSingleColumn();
    if (!taggedContext) {
      return null;
    }

    const sourceColumnIndex = data.board.columns.findIndex(
      (column) => column.statusKey === taggedContext.statusKey,
    );
    const destinationColumn = data.board.columns[sourceColumnIndex + (direction === "left" ? -1 : 1)];

    if (!destinationColumn) {
      return null;
    }

    const taggedIds = new Set(taggedContext.tickets.map((ticket) => ticket.id));
    const sourceTickets = visibleTickets.filter((ticket) => ticket.statusKey === taggedContext.statusKey);
    const destinationTickets = visibleTickets.filter(
      (ticket) => ticket.statusKey === destinationColumn.statusKey,
    );
    const firstTaggedIndex = sourceTickets.findIndex((ticket) => taggedIds.has(ticket.id));
    const movingTickets = sourceTickets
      .filter((ticket) => taggedIds.has(ticket.id))
      .map((ticket) => ({
        ...ticket,
        statusKey: destinationColumn.statusKey,
      }));
    const nextDestinationTickets = [...destinationTickets];
    const insertIndex = Math.min(Math.max(firstTaggedIndex, 0), nextDestinationTickets.length);
    const nextGroups = new Map(
      data.board.columns.map((column) => [
        column.statusKey,
        visibleTickets.filter((ticket) => ticket.statusKey === column.statusKey),
      ]),
    );

    nextDestinationTickets.splice(insertIndex, 0, ...movingTickets);
    nextGroups.set(
      taggedContext.statusKey,
      sourceTickets.filter((ticket) => !taggedIds.has(ticket.id)),
    );
    nextGroups.set(destinationColumn.statusKey, nextDestinationTickets);

    return flattenTicketsByColumn(nextGroups);
  }

  async function persistTaggedVerticalMove(
    direction: "up" | "down",
    taggedTickets: Ticket[],
    nextTickets: Ticket[],
  ) {
    if (!data) {
      return;
    }

    const statusKey = taggedTickets[0]?.statusKey;
    if (!statusKey) {
      return;
    }

    const taggedIds = new Set(taggedTickets.map((ticket) => ticket.id));
    const sourceSwimlaneKey = showSwimlanes
      ? resolveTicketSwimlane(taggedTickets[0]!, implicitSwimlaneLabelNames).key
      : null;

    if (
      sourceSwimlaneKey
      && taggedTickets.some(
        (ticket) => resolveTicketSwimlane(ticket, implicitSwimlaneLabelNames).key !== sourceSwimlaneKey,
      )
    ) {
      return;
    }

    const sourceTickets = visibleTickets.filter(
      (ticket) =>
        ticket.statusKey === statusKey
        && (
          !sourceSwimlaneKey
          || resolveTicketSwimlane(ticket, implicitSwimlaneLabelNames).key === sourceSwimlaneKey
        ),
    );
    const firstTaggedIndex = sourceTickets.findIndex((ticket) => taggedIds.has(ticket.id));
    const lastTaggedIndex = sourceTickets.reduce(
      (lastIndex, ticket, index) => (taggedIds.has(ticket.id) ? index : lastIndex),
      -1,
    );
    const orderedTaggedTickets =
      direction === "up"
        ? [...taggedTickets].reverse()
        : taggedTickets;
    const previousAnchorTicket =
      direction === "up"
        ? sourceTickets
            .slice(0, firstTaggedIndex)
            .reverse()
            .find((ticket) => !taggedIds.has(ticket.id)) ?? null
        : null;
    const nextAnchorTicket =
      direction === "down"
        ? sourceTickets
            .slice(lastTaggedIndex + 1)
            .find((ticket) => !taggedIds.has(ticket.id)) ?? null
        : null;
    const anchorTicket =
      direction === "up"
        ? previousAnchorTicket
        : nextAnchorTicket;

    if (!anchorTicket) {
      return;
    }

    let previousMovedTicketId: string | null = null;

    beginOptimisticReposition();
    try {
      for (const movingTicket of orderedTaggedTickets) {
        const prevVisibleTicketId =
          direction === "up"
            ? (previousAnchorTicket ? sourceTickets[sourceTickets.indexOf(previousAnchorTicket) - 1]?.id ?? null : null)
            : (previousMovedTicketId ?? anchorTicket.id);
        const nextVisibleTicketId =
          direction === "up"
            ? (previousMovedTicketId ?? anchorTicket.id)
            : (nextAnchorTicket ? sourceTickets[sourceTickets.indexOf(nextAnchorTicket) + 1]?.id ?? null : null);

        await repositionTicket(movingTicket.id, {
          statusKey: resolveMutationStatusKey(
            data.board.isSystem,
            statusKey,
            actualTicketsById.get(movingTicket.id) ?? movingTicket,
          ),
          prevVisibleTicketId,
          nextVisibleTicketId,
        });
        previousMovedTicketId = movingTicket.id;
      }

      setVisibleTickets(nextTickets);
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
    } finally {
      endOptimisticReposition();
    }
  }

  async function persistTaggedHorizontalMove(
    direction: "left" | "right",
    taggedTickets: Ticket[],
    nextTickets: Ticket[],
  ) {
    if (!data) {
      return;
    }

    const sourceStatusKey = taggedTickets[0]?.statusKey;
    const sourceColumnIndex = data.board.columns.findIndex((column) => column.statusKey === sourceStatusKey);
    const destinationColumn = data.board.columns[sourceColumnIndex + (direction === "left" ? -1 : 1)];

    if (!sourceStatusKey || !destinationColumn) {
      return;
    }

    const sourceTickets = visibleTickets.filter((ticket) => ticket.statusKey === sourceStatusKey);
    const destinationTickets = visibleTickets.filter(
      (ticket) => ticket.statusKey === destinationColumn.statusKey,
    );
    const taggedIds = new Set(taggedTickets.map((ticket) => ticket.id));
    const firstTaggedIndex = sourceTickets.findIndex((ticket) => taggedIds.has(ticket.id));
    const insertIndex = Math.min(Math.max(firstTaggedIndex, 0), destinationTickets.length);
    const nextVisibleTicketId = destinationTickets[insertIndex]?.id ?? null;
    let prevVisibleTicketId = destinationTickets[insertIndex - 1]?.id ?? null;

    beginOptimisticReposition();
    try {
      for (const movingTicket of taggedTickets) {
        await repositionTicket(movingTicket.id, {
          statusKey: resolveMutationStatusKey(
            data.board.isSystem,
            destinationColumn.statusKey,
            actualTicketsById.get(movingTicket.id) ?? movingTicket,
          ),
          prevVisibleTicketId,
          nextVisibleTicketId,
        });
        prevVisibleTicketId = movingTicket.id;
      }

      setVisibleTickets(nextTickets);
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
    } finally {
      endOptimisticReposition();
    }
  }

  function handleTaggedQuickMove(direction: TicketMoveDirection) {
    const taggedContext = getTaggedTicketsInSingleColumn();
    if (!taggedContext) {
      return false;
    }

    const nextTickets =
      direction === "up" || direction === "down"
        ? moveTaggedTicketsVertically(direction)
        : moveTaggedTicketsHorizontally(direction);

    if (!nextTickets || haveSameTicketLayout(visibleTickets, nextTickets)) {
      return false;
    }

    void queryClient.cancelQueries({ queryKey: ["board", boardSlug] });
    setVisibleTickets(nextTickets);

    if (direction === "up" || direction === "down") {
      void persistTaggedVerticalMove(direction, taggedContext.tickets, nextTickets);
    } else {
      void persistTaggedHorizontalMove(direction, taggedContext.tickets, nextTickets);
    }

    return true;
  }

  function getKeyboardMoveTickets() {
    if (taggedTicketIds.size > 0) {
      const taggedTickets = visibleTickets.filter((ticket) => taggedTicketIds.has(ticket.id));
      return taggedTickets.length === taggedTicketIds.size ? taggedTickets : [];
    }

    return selectedTicketId
      ? visibleTickets.filter((ticket) => ticket.id === selectedTicketId)
      : [];
  }

  function handleQuickSwimlaneMove(direction: "up" | "down") {
    if (!data || !showSwimlanes || swimlanes.length < 2) {
      return false;
    }

    const movingTickets = getKeyboardMoveTickets();
    const firstMovingTicket = movingTickets[0];

    if (!firstMovingTicket) {
      return false;
    }

    const sourceSwimlane = resolveTicketSwimlane(firstMovingTicket, implicitSwimlaneLabelNames);
    const sourceSwimlaneIndex = swimlanes.findIndex((swimlane) => swimlane.key === sourceSwimlane.key);
    const targetSwimlane = swimlanes[sourceSwimlaneIndex + (direction === "up" ? -1 : 1)];

    if (!targetSwimlane) {
      return false;
    }

    const sourceStatusKey = firstMovingTicket.statusKey;
    const canMoveTogether = movingTickets.every((ticket) => {
      const ticketSwimlane = resolveTicketSwimlane(ticket, implicitSwimlaneLabelNames);
      return ticket.statusKey === sourceStatusKey && ticketSwimlane.key === sourceSwimlane.key;
    });

    if (!canMoveTogether) {
      return false;
    }

    const nextLabelsByTicketId = new Map(
      movingTickets.map((ticket) => [
        ticket.id,
        updateTicketSwimlaneLabels(
          ticket,
          targetSwimlane,
          implicitSwimlaneLabelNames,
          data.board.defaultLabel?.normalizedName,
        ),
      ]),
    );
    const nextTickets = visibleTickets.map((ticket) => {
      const nextLabels = nextLabelsByTicketId.get(ticket.id);

      return nextLabels
        ? {
            ...ticket,
            labels: nextLabels,
          }
        : ticket;
    });

    void queryClient.cancelQueries({ queryKey: ["board", boardSlug] });
    setVisibleTickets(nextTickets);

    beginOptimisticReposition();
    void Promise.all(
      movingTickets.map((ticket) => {
        const nextLabels = nextLabelsByTicketId.get(ticket.id) ?? ticket.labels;
        return updateTicket(ticket.id, {
          labels: nextLabels.map((label) => label.name),
        });
      }),
    ).then(async () => {
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["labels"] });
    }).finally(() => {
      endOptimisticReposition();
    });

    return true;
  }

  function handleKeyboardTagRange(direction: "up" | "down") {
    if (!data) {
      return;
    }

    const nextTicketId = getNextTicketId(
      data.board.columns,
      keyboardLanes,
      selectedTicketId,
      direction,
    );

    if (!nextTicketId) {
      return;
    }

    setTaggedTicketIds((currentTaggedTicketIds) => {
      const nextTaggedTicketIds = new Set(currentTaggedTicketIds);

      if (
        selectedTicketId &&
        nextTaggedTicketIds.has(selectedTicketId) &&
        nextTaggedTicketIds.has(nextTicketId)
      ) {
        nextTaggedTicketIds.delete(selectedTicketId);
        return nextTaggedTicketIds;
      }

      if (selectedTicketId) {
        nextTaggedTicketIds.add(selectedTicketId);
      }

      nextTaggedTicketIds.add(nextTicketId);
      return nextTaggedTicketIds;
    });
    selectTicketWithKeyboard(nextTicketId);
  }

  function handleQuickMove(direction: TicketMoveDirection) {
    if (isOptimisticRepositionPending()) {
      return false;
    }

    if (taggedTicketIds.size > 0) {
      return handleTaggedQuickMove(direction);
    }

    if (!data || !selectedTicketId) {
      return false;
    }

    const overId = getTicketMoveTarget(data.board.columns, keyboardLanes, selectedTicketId, direction);
    const columnIds = new Set(data.board.columns.map((column) => column.id));

    if (!overId || (showSwimlanes && columnIds.has(overId) && (direction === "up" || direction === "down"))) {
      return false;
    }

    const originalTicket = visibleTickets.find((ticket) => ticket.id === selectedTicketId) ?? null;
    const nextTickets = moveTicket(data.board.columns, visibleTickets, selectedTicketId, overId);
    const nextTicket = nextTickets.find((ticket) => ticket.id === selectedTicketId) ?? null;

    if (haveSameTicketLayout(visibleTickets, nextTickets)) {
      return false;
    }

    void queryClient.cancelQueries({ queryKey: ["board", boardSlug] });
    setVisibleTickets(nextTickets);
    persistReposition(selectedTicketId, nextTickets);

    if (originalTicket && nextTicket) {
      collapseExpandedTicketAfterColumnMove(
        selectedTicketId,
        originalTicket.statusKey,
        nextTicket.statusKey,
      );
    }

    return true;
  }

  async function handleQuickPriority(priority: TicketPriority) {
    if (taggedTicketIds.size > 0) {
      const taggedTickets = visibleTickets.filter((ticket) => taggedTicketIds.has(ticket.id));
      if (taggedTickets.length === 0) {
        return;
      }

      setVisibleTickets((currentTickets) =>
        currentTickets.map((ticket) =>
          taggedTicketIds.has(ticket.id)
            ? {
                ...ticket,
                priority,
              }
            : ticket,
        ),
      );

      await Promise.all(
        taggedTickets
          .filter((ticket) => ticket.priority !== priority)
          .map((ticket) =>
            updateTicketMutation.mutateAsync({
              ticketId: ticket.id,
              input: { priority },
            }),
          ),
      );
      return;
    }

    if (!selectedTicketId) {
      return;
    }

    const selectedTicket = visibleTickets.find((ticket) => ticket.id === selectedTicketId);
    if (!selectedTicket || selectedTicket.priority === priority) {
      return;
    }

    setVisibleTickets((currentTickets) =>
      currentTickets.map((ticket) =>
        ticket.id === selectedTicketId
          ? {
              ...ticket,
              priority,
            }
          : ticket,
      ),
    );

    await updateTicketMutation.mutateAsync({
      ticketId: selectedTicketId,
      input: { priority },
    });
  }

  function findLaneLabelsForTicket(ticket: Ticket) {
    if (!showSwimlanes) {
      return [];
    }

    const lane = swimlanes.find((candidate) =>
      candidate.tickets.some((candidateTicket) => candidateTicket.id === ticket.id),
    );

    return lane && lane.key !== UNLABELED_SWIMLANE_KEY ? [lane.name] : [];
  }

  async function handleQuickCreate(position: "above" | "below") {
    if (!data || !selectedTicketId) {
      return;
    }

    const selectedTicket = visibleTickets.find((ticket) => ticket.id === selectedTicketId);
    if (!selectedTicket) {
      return;
    }

    const laneLabels = findLaneLabelsForTicket(selectedTicket);
    const nextTicket = await createTicketMutation.mutateAsync({
      statusKey: resolveMutationStatusKey(
        data.board.isSystem,
        selectedTicket.statusKey,
        actualTicketsById.get(selectedTicket.id) ?? selectedTicket,
      ),
      title: "New ticket",
      description: "",
      priority: selectedTicket.priority,
      labels: buildCreateTicketLabels([], laneLabels, data.board.filterLabels, data.board.defaultLabel),
      position: position === "above" ? "top" : "bottom",
    });
    const sameLaneTickets = showSwimlanes
      ? (swimlanes
          .find((swimlane) => swimlane.tickets.some((ticket) => ticket.id === selectedTicket.id))
          ?.tickets.filter((ticket) => ticket.statusKey === selectedTicket.statusKey) ?? [])
      : visibleTickets.filter((ticket) => ticket.statusKey === selectedTicket.statusKey);
    const selectedIndex = sameLaneTickets.findIndex((ticket) => ticket.id === selectedTicket.id);
    const prevVisibleTicketId =
      position === "above"
        ? (sameLaneTickets[selectedIndex - 1]?.id ?? null)
        : selectedTicket.id;
    const nextVisibleTicketId =
      position === "above"
        ? selectedTicket.id
        : (sameLaneTickets[selectedIndex + 1]?.id ?? null);

    await repositionTicketMutation.mutateAsync({
      ticketId: nextTicket.id,
      input: {
        statusKey: resolveMutationStatusKey(
          data.board.isSystem,
          selectedTicket.statusKey,
          actualTicketsById.get(selectedTicket.id) ?? selectedTicket,
        ),
        prevVisibleTicketId,
        nextVisibleTicketId,
      },
    });
    requestInlineTitleEdit(nextTicket.id, "");
  }

  function openCreateTicket(
    statusKey: Ticket["statusKey"],
    position: CreateTicketPosition,
    labels: string[] = [],
  ) {
    setCreateTicketIntent({ statusKey, position, labels });
  }

  useEffect(() => {
    function shouldIgnoreShortcut(event: KeyboardEvent) {
      if (createTicketIntent || editingTicket) {
        return true;
      }

      const target = event.target;
      return (
        target instanceof Element &&
        Boolean(target.closest("button, input, textarea, select, a, [contenteditable='true']"))
      );
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreShortcut(event) || !data) {
        return;
      }

      if (event.shiftKey && !event.metaKey && !event.altKey && !event.ctrlKey && event.key.toLowerCase() === "h") {
        event.preventDefault();
        setIsHeaderCollapsed((currentValue) => !currentValue);
        return;
      }

      const vimDirectionByKey: Partial<Record<string, TicketMoveDirection>> = {
        h: "left",
        j: "down",
        k: "up",
        l: "right",
      };
      const vimKey =
        event.code === "KeyH"
          ? "h"
          : event.code === "KeyJ"
            ? "j"
            : event.code === "KeyK"
              ? "k"
              : event.code === "KeyL"
                ? "l"
                : event.key.toLowerCase();
      const vimDirection = vimDirectionByKey[vimKey] ?? null;
      const arrowDirection = event.key.startsWith("Arrow")
        ? event.key.replace("Arrow", "").toLowerCase()
        : null;
      const direction = (vimDirection ?? arrowDirection) as TicketMoveDirection | null;

      if (direction) {
        event.preventDefault();

        if (event.metaKey || event.altKey) {
          if (showSwimlanes && (direction === "up" || direction === "down")) {
            if (handleQuickMove(direction) || handleQuickSwimlaneMove(direction)) {
              return;
            }

            return;
          }

          handleQuickMove(direction);
          return;
        }

        if (event.shiftKey && (direction === "up" || direction === "down")) {
          handleKeyboardTagRange(direction);
          return;
        }

        const nextTicketId = getNextTicketId(
          data.board.columns,
          keyboardLanes,
          selectedTicketId,
          direction,
        );

        if (nextTicketId) {
          selectTicketWithKeyboard(nextTicketId);
        }
        return;
      }

      if (event.key === " " && selectedTicketId) {
        event.preventDefault();
        setTaggedTicketIds((currentTaggedTicketIds) => {
          const nextTaggedTicketIds = new Set(currentTaggedTicketIds);

          if (nextTaggedTicketIds.has(selectedTicketId)) {
            nextTaggedTicketIds.delete(selectedTicketId);
          } else {
            nextTaggedTicketIds.add(selectedTicketId);
          }

          return nextTaggedTicketIds;
        });
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        setTaggedTicketIds(new Set());
        return;
      }

      if (!event.shiftKey && event.key.toLowerCase() === "t" && selectedTicketId) {
        event.preventDefault();
        handleToggleTicketExpanded(selectedTicketId);
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        setTicketViewMode((currentViewMode) => (currentViewMode === "compact" ? "full" : "compact"));
        return;
      }

      const quickPriority = QUICK_PRIORITY_BY_KEY[event.key];
      if (quickPriority) {
        event.preventDefault();
        void handleQuickPriority(quickPriority);
        return;
      }

      if (event.key.toLowerCase() === "o" || event.key.toLowerCase() === "n") {
        event.preventDefault();
        void handleQuickCreate(event.shiftKey ? "above" : "below");
        return;
      }

      const selectedTicket = findVisibleTicket(selectedTicketId);

      if (
        selectedTicket &&
        !event.metaKey &&
        !event.altKey &&
        !event.ctrlKey
      ) {
        if (event.key === "0") {
          event.preventDefault();
          setTitleCursorIndex(0);
          return;
        }

        if (event.key === "$") {
          event.preventDefault();
          setTitleCursorIndex(getLastTitleCursorIndex(selectedTicket.title));
          return;
        }

        if (event.key === "w" || event.key === "W") {
          event.preventDefault();
          setTitleCursorIndex((currentCursorIndex) =>
            moveTitleCursorToNextWord(selectedTicket.title, currentCursorIndex, event.key === "W"),
          );
          return;
        }

        if (event.key === "b" || event.key === "B") {
          event.preventDefault();
          setTitleCursorIndex((currentCursorIndex) =>
            moveTitleCursorToPreviousWord(selectedTicket.title, currentCursorIndex, event.key === "B"),
          );
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();

          if (event.shiftKey) {
            setEditingTicket(selectedTicket);
          } else {
            requestInlineTitleEdit(selectedTicket.id);
          }

          return;
        }

        if (event.key === "i") {
          event.preventDefault();
          requestInlineTitleEdit(
            selectedTicket.id,
            undefined,
            clampTitleCursorIndex(selectedTicket.title, titleCursorIndex),
          );
          return;
        }

        if (event.key === "a") {
          event.preventDefault();
          requestInlineTitleEdit(
            selectedTicket.id,
            undefined,
            clampTitleCursorIndex(selectedTicket.title, titleCursorIndex) + 1,
          );
          return;
        }
      } else if (event.key === "Enter" && selectedTicketId) {
        event.preventDefault();
        if (event.shiftKey) {
          const ticket = findVisibleTicket(selectedTicketId);

          if (ticket) {
            setEditingTicket(ticket);
          }
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // The shortcut listener intentionally closes over the latest board state and rebinds as it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    createTicketIntent,
    data,
    editingTicket,
    keyboardLanes,
    selectedTicketId,
    taggedTicketIds,
    titleCursorIndex,
    visibleTickets,
  ]);

  return (
    <main className="page-shell">
      <AppHeader
        activeNav={data?.board.isDefault ? "home" : "boards"}
        actions={
          <>
            <TicketViewToggle value={ticketViewMode} onChange={setTicketViewMode} />
            <SwimlaneToggle value={showSwimlanes} onChange={setShowSwimlanes} />
            <Link className="ghost-button" to={`/boards/${boardSlug}/edit`}>
              Edit Board
            </Link>
            <button
              className="primary-button"
              disabled={!data}
              type="button"
              onClick={() => openCreateTicket(data?.board.columns[0]?.statusKey ?? "todo", "bottom")}
            >
              New Ticket
            </button>
          </>
        }
        description={data?.board.description ?? "Loading board configuration..."}
        isCollapsed={isHeaderCollapsed}
        theme={theme}
        title={data?.board.name ?? "Loading board..."}
        onCollapsedChange={setIsHeaderCollapsed}
        onThemeChange={setTheme}
      />

      {boardQuery.isError ? (
        <section className="message-panel message-panel--error">
          <h2>Board failed to load</h2>
          <p>{boardQuery.error instanceof Error ? boardQuery.error.message : "Unknown error"}</p>
        </section>
      ) : null}

      {data ? (
        <>
          <div hidden={isHeaderCollapsed}>
            <BoardFiltersPanel
              filters={filters}
              availableLabels={data.board.availableLabels}
              implicitLabels={data.board.filterLabels}
              onChange={(nextFilters) => setSearchParams(writeFilters(nextFilters))}
              onClear={() =>
                setSearchParams(
                  writeFilters({
                    priorities: [],
                    labels: [],
                    q: "",
                  }),
                )
              }
            />
          </div>

          <DndContext
            collisionDetection={closestCorners}
            onDragCancel={handleDragCancel}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragStart={handleDragStart}
            sensors={sensors}
          >
            {showSwimlanes ? (
              <section className="board-grid-scroll">
                <div className="board-swimlane-table">
                  <section className="board-grid board-grid--swimlane-header" style={boardGridStyle}>
                    {data.board.columns.map((column) => {
                      const tickets = visibleTickets.filter((ticket) => ticket.statusKey === column.statusKey);

                      return (
                        <BoardColumnHeader
                          key={column.id}
                          column={column}
                          collapsed={collapsedStatusKeys.has(column.statusKey)}
                          isArchiving={
                            archiveDoneTicketsMutation.isPending &&
                            column.statusCategory === "completed"
                          }
                          ticketCount={tickets.length}
                          onArchiveDoneTickets={() => {
                            void archiveDoneTicketsMutation.mutateAsync(data.board.id);
                          }}
                          onCreateTicket={openCreateTicket}
                          onToggleCollapsed={() => handleToggleCollapsed(column.statusKey)}
                        />
                      );
                    })}
                  </section>

                  {swimlanes.map((swimlane) => {
                    const isUnlabeledSwimlane = swimlane.key === UNLABELED_SWIMLANE_KEY;
                    const orderedSwimlanes = swimlanes.filter((candidate) => candidate.key !== UNLABELED_SWIMLANE_KEY);
                    const orderedSwimlaneIndex = orderedSwimlanes.findIndex((candidate) => candidate.key === swimlane.key);

                    return (
                    <section key={swimlane.key} className="board-swimlane">
                      <div className="board-swimlane__rule">
                        <span>{swimlane.name}</span>
                        {!isUnlabeledSwimlane ? (
                          <div className="board-swimlane__order-actions">
                            <button
                              aria-label={`Move ${swimlane.name} swimlane up`}
                              className="board-swimlane__order-button"
                              disabled={orderedSwimlaneIndex <= 0 || updateSwimlaneOrderMutation.isPending}
                              type="button"
                              onClick={() => {
                                const nextOrder = moveSwimlaneLabelOrder(swimlanes, swimlane.key, -1);
                                if (nextOrder) {
                                  void updateSwimlaneOrderMutation.mutateAsync(nextOrder);
                                }
                              }}
                            >
                              <svg aria-hidden="true" viewBox="0 0 20 20">
                                <path d="M10 4.5a.75.75 0 0 1 .53.22l4.25 4.25a.75.75 0 1 1-1.06 1.06L10.75 7.06v7.69a.75.75 0 0 1-1.5 0V7.06l-2.97 2.97a.75.75 0 0 1-1.06-1.06l4.25-4.25A.75.75 0 0 1 10 4.5Z" />
                              </svg>
                            </button>
                            <button
                              aria-label={`Move ${swimlane.name} swimlane down`}
                              className="board-swimlane__order-button"
                              disabled={orderedSwimlaneIndex >= orderedSwimlanes.length - 1 || updateSwimlaneOrderMutation.isPending}
                              type="button"
                              onClick={() => {
                                const nextOrder = moveSwimlaneLabelOrder(swimlanes, swimlane.key, 1);
                                if (nextOrder) {
                                  void updateSwimlaneOrderMutation.mutateAsync(nextOrder);
                                }
                              }}
                            >
                              <svg aria-hidden="true" viewBox="0 0 20 20">
                                <path d="M10 15.5a.75.75 0 0 1-.53-.22L5.22 11.03a.75.75 0 1 1 1.06-1.06l2.97 2.97V5.25a.75.75 0 0 1 1.5 0v7.69l2.97-2.97a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-.53.22Z" />
                              </svg>
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <section className="board-grid board-grid--swimlane-row" style={boardGridStyle}>
                        {data.board.columns.map((column) => {
                          const laneTickets = swimlane.tickets.filter(
                            (ticket) => ticket.statusKey === column.statusKey,
                          );

                          return (
                            <BoardColumn
                              key={`${swimlane.key}-${column.id}`}
                              collapsed={collapsedStatusKeys.has(column.statusKey)}
                              column={column}
                              droppableId={buildSwimlaneDropTargetId(swimlane.key, column.id)}
                              emptyMessage={null}
                              expandedTicketIds={expandedTicketIds}
                              inlineEditingCursorIndex={inlineEditingCursorIndex}
                              inlineEditingKey={inlineEditingKey}
                              inlineEditingTicketId={inlineEditingTicketId}
                              inlineEditingTitle={inlineEditingTitle}
                              selectedTicketId={selectedTicketId}
                              showHeader={false}
                              showPriorityColors={data.board.showPriorityColors}
                              variant="swimlane"
                              taggedTicketIds={taggedTicketIds}
                              titleCursorIndex={titleCursorIndex}
                              tickets={laneTickets}
                              onEditTicket={setEditingTicket}
                              onCreateTicket={(statusKey, position) =>
                                openCreateTicket(
                                  statusKey,
                                  position,
                                  swimlane.key === UNLABELED_SWIMLANE_KEY ? [] : [swimlane.name],
                                )
                              }
                              onInlineTitleEditEnd={handleInlineTitleEditEnd}
                              onInlineTitleEditStart={handleInlineTitleEditStart}
                              onInlineTitleUpdate={handleInlineTitleUpdate}
                              onTicketClick={handleTicketClick}
                              onToggleTicketExpanded={handleToggleTicketExpanded}
                              viewMode={ticketViewMode}
                            />
                          );
                        })}
                      </section>
                    </section>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="board-grid">
                {data.board.columns.map((column) => {
                  const tickets = visibleTickets.filter((ticket) => ticket.statusKey === column.statusKey);

                  return (
                    <BoardColumn
                      key={column.id}
                      collapsed={collapsedStatusKeys.has(column.statusKey)}
                      column={column}
                      expandedTicketIds={expandedTicketIds}
                      inlineEditingCursorIndex={inlineEditingCursorIndex}
                      inlineEditingKey={inlineEditingKey}
                      inlineEditingTicketId={inlineEditingTicketId}
                      inlineEditingTitle={inlineEditingTitle}
                      isArchiving={
                        archiveDoneTicketsMutation.isPending && column.statusCategory === "completed"
                      }
                      selectedTicketId={selectedTicketId}
                      showPriorityColors={data.board.showPriorityColors}
                      taggedTicketIds={taggedTicketIds}
                      titleCursorIndex={titleCursorIndex}
                      tickets={tickets}
                      onArchiveDoneTickets={() => {
                        void archiveDoneTicketsMutation.mutateAsync(data.board.id);
                      }}
                      onEditTicket={setEditingTicket}
                      onCreateTicket={openCreateTicket}
                      onInlineTitleEditEnd={handleInlineTitleEditEnd}
                      onInlineTitleEditStart={handleInlineTitleEditStart}
                      onInlineTitleUpdate={handleInlineTitleUpdate}
                      onTicketClick={handleTicketClick}
                      onToggleCollapsed={() => handleToggleCollapsed(column.statusKey)}
                      onToggleTicketExpanded={handleToggleTicketExpanded}
                      viewMode={ticketViewMode}
                    />
                  );
                })}
              </section>
            )}

            <DragOverlay>
              {activeTicket ? (
                <TicketCard
                  isExpanded={expandedTicketIds.has(activeTicket.id)}
                  isSelected={selectedTicketId === activeTicket.id}
                  isTagged={taggedTicketIds.has(activeTicket.id)}
                  titleCursorIndex={titleCursorIndex}
                  ticket={activeTicket}
                  tone={resolveTicketTone(data.board.columns, activeTicket)}
                  onEdit={() => undefined}
                  onTitleUpdate={async () => undefined}
                  showPriorityColor={data.board.showPriorityColors}
                  viewMode={ticketViewMode}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      ) : (
        <section className="message-panel">
          <h2>Loading board</h2>
          <p>Fetching columns, labels, and tickets.</p>
        </section>
      )}

      {createTicketIntent && data ? (
        <TicketModal
          mode="create"
          ticket={null}
          columns={data.board.columns}
          availableLabels={data.board.availableLabels}
          boardFilterLabels={data.board.filterLabels}
          implicitLabels={data.board.defaultLabel ? [data.board.defaultLabel] : []}
          defaultStatusKey={createTicketIntent.statusKey}
          onClose={() => setCreateTicketIntent(null)}
          onSubmit={async (input) => {
            await createTicketMutation.mutateAsync({
              ...input,
              labels: buildCreateTicketLabels(
                input.labels,
                createTicketIntent.labels,
                data.board.filterLabels,
                data.board.defaultLabel,
              ),
              statusKey: resolveMutationStatusKey(data.board.isSystem, input.statusKey),
              position: createTicketIntent.position,
            });
          }}
        />
      ) : null}

      {editingTicket && data ? (
        <TicketModal
          mode="edit"
          ticket={editingTicket}
          columns={data.board.columns}
          availableLabels={data.board.availableLabels}
          onClose={() => setEditingTicket(null)}
          onDelete={async () => {
            await deleteTicketMutation.mutateAsync(editingTicket.id);
          }}
          onSubmit={async (input) => {
            const actualTicket = actualTicketsById.get(editingTicket.id) ?? null;
            await updateTicketMutation.mutateAsync({
              ticketId: editingTicket.id,
              input: {
                ...input,
                statusKey: resolveMutationStatusKey(
                  data.board.isSystem,
                  input.statusKey,
                  actualTicket,
                ),
              },
            });
          }}
        />
      ) : null}
    </main>
  );
}
