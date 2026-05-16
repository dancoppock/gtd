import {
  boardFiltersSchema,
  type Label,
  SYSTEM_BOARD_ACTIVE_STATUS_KEY,
  SYSTEM_BOARD_DONE_STATUS_KEY,
  type BoardFilters,
  type Ticket,
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
import { useEffect, useMemo, useState } from "react";
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
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [showSwimlanes, setShowSwimlanes] = useState(false);
  const [ticketViewMode, setTicketViewMode] = useState<TicketViewMode>("compact");
  const { theme, setTheme } = useBoardTheme();
  const [visibleTickets, setVisibleTickets] = useState<Ticket[]>([]);
  const queryClient = useQueryClient();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
  );

  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

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
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
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
    if (data) {
      setVisibleTickets(displayedDataTickets);
    }
  }, [data, displayedDataTickets]);

  useEffect(() => {
    if (boardId) {
      setShowSwimlanes(boardSwimlaneDefault);
    }
  }, [boardId, boardSwimlaneDefault]);

  useEffect(() => {
    if (boardId) {
      setIsHeaderCollapsed(Boolean(data?.board.collapseMenusByDefault));
    }
  }, [boardId, data?.board.collapseMenusByDefault]);

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

    setVisibleTickets((currentTickets) => {
      if (showSwimlanes) {
        const activeTicket = currentTickets.find((ticket) => ticket.id === activeId);
        const originalActiveTicket =
          displayedDataTickets.find((ticket) => ticket.id === activeId) ?? activeTicket;
        const overTicket = currentTickets.find((ticket) => ticket.id === overId);
        const activeLaneKey = originalActiveTicket
          ? resolveTicketSwimlane(originalActiveTicket, implicitSwimlaneLabelNames).key
          : null;
        const overLaneKey = overTicket
          ? resolveTicketSwimlane(overTicket, implicitSwimlaneLabelNames).key
          : (swimlaneDropTargets.get(overId)?.laneKey ?? null);

        if (!activeTicket || !originalActiveTicket || !activeLaneKey || !overLaneKey) {
          return displayedDataTickets;
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
            ? currentTickets
            : currentTickets.map((ticket) =>
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

        return nextTickets;
      }

      const originalActiveTicket = displayedDataTickets.find((ticket) => ticket.id === activeId) ?? null;
      const nextTickets = moveTicket(data.board.columns, currentTickets, activeId, overId);
      const didChange = !haveSameTicketLayout(displayedDataTickets, nextTickets);
      const nextActiveTicket = nextTickets.find((ticket) => ticket.id === activeId);

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

      return nextTickets;
    });
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

  function handleToggleTicketExpanded(ticketId: string) {
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

  function openCreateTicket(
    statusKey: Ticket["statusKey"],
    position: CreateTicketPosition,
    labels: string[] = [],
  ) {
    setCreateTicketIntent({ statusKey, position, labels });
  }

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
                              showHeader={false}
                              showPriorityColors={data.board.showPriorityColors}
                              variant="swimlane"
                              tickets={laneTickets}
                              onEditTicket={setEditingTicket}
                              onCreateTicket={(statusKey, position) =>
                                openCreateTicket(
                                  statusKey,
                                  position,
                                  swimlane.key === UNLABELED_SWIMLANE_KEY ? [] : [swimlane.name],
                                )
                              }
                              onInlineTitleUpdate={handleInlineTitleUpdate}
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
                      isArchiving={
                        archiveDoneTicketsMutation.isPending && column.statusCategory === "completed"
                      }
                      showPriorityColors={data.board.showPriorityColors}
                      tickets={tickets}
                      onArchiveDoneTickets={() => {
                        void archiveDoneTicketsMutation.mutateAsync(data.board.id);
                      }}
                      onEditTicket={setEditingTicket}
                      onCreateTicket={openCreateTicket}
                      onInlineTitleUpdate={handleInlineTitleUpdate}
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
