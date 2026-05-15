import {
  boardFiltersSchema,
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
const EXPANDED_COLUMN_WIDTH_PX = 400;
const APP_TITLE = "GTD";

type CreateTicketIntent = {
  statusKey: Ticket["statusKey"];
  position: CreateTicketPosition;
};

export function BoardPage() {
  const { boardSlug = "default" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [createTicketIntent, setCreateTicketIntent] = useState<CreateTicketIntent | null>(null);
  const [collapsedStatusKeys, setCollapsedStatusKeys] = useState<Set<string>>(() => new Set());
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [expandedTicketIds, setExpandedTicketIds] = useState<Set<string>>(() => new Set());
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
        ? buildSwimlanes(data.board.columns, visibleTickets, implicitSwimlaneLabelNames)
        : [],
    [data, implicitSwimlaneLabelNames, showSwimlanes, visibleTickets],
  );
  const swimlaneDropTargets = useMemo(() => {
    const dropTargets = new Map<string, { columnId: string; laneKey: string }>();

    if (!data || !showSwimlanes) {
      return dropTargets;
    }

    swimlanes.forEach((swimlane) => {
      data.board.columns.forEach((column) => {
        dropTargets.set(buildSwimlaneDropTargetId(swimlane.key, column.id), {
          columnId: column.id,
          laneKey: swimlane.key,
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
                : `${EXPANDED_COLUMN_WIDTH_PX}px`,
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

        if (!activeLaneKey || !overLaneKey || activeLaneKey !== overLaneKey) {
          return displayedDataTickets;
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
        const overTicket = currentTickets.find((ticket) => ticket.id === overId);
        const activeLaneKey = activeTicket
          ? resolveTicketSwimlane(activeTicket, implicitSwimlaneLabelNames).key
          : null;
        const overLaneKey = overTicket
          ? resolveTicketSwimlane(overTicket, implicitSwimlaneLabelNames).key
          : (swimlaneDropTargets.get(overId)?.laneKey ?? null);

        if (!activeLaneKey || !overLaneKey || activeLaneKey !== overLaneKey) {
          return displayedDataTickets;
        }

        const mappedOverId = swimlaneDropTargets.get(overId)?.columnId ?? overId;
        const nextTickets = moveTicket(data.board.columns, currentTickets, activeId, mappedOverId);
        const didChange = !haveSameTicketLayout(displayedDataTickets, nextTickets);

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

        return nextTickets;
      }

      const nextTickets = moveTicket(data.board.columns, currentTickets, activeId, overId);
      const didChange = !haveSameTicketLayout(displayedDataTickets, nextTickets);

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

  function openCreateTicket(statusKey: Ticket["statusKey"], position: CreateTicketPosition) {
    setCreateTicketIntent({ statusKey, position });
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
        theme={theme}
        title={data?.board.name ?? "Loading board..."}
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

                  {swimlanes.map((swimlane) => (
                    <section key={swimlane.key} className="board-swimlane">
                      <div className="board-swimlane__rule">
                        <span>{swimlane.name}</span>
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
                              showTail={false}
                              variant="swimlane"
                              tickets={laneTickets}
                              onEditTicket={setEditingTicket}
                              onCreateTicket={openCreateTicket}
                              onInlineTitleUpdate={handleInlineTitleUpdate}
                              onToggleTicketExpanded={handleToggleTicketExpanded}
                              viewMode={ticketViewMode}
                            />
                          );
                        })}
                      </section>
                    </section>
                  ))}
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
          implicitLabels={data.board.filterLabels}
          defaultStatusKey={createTicketIntent.statusKey}
          onClose={() => setCreateTicketIntent(null)}
          onSubmit={async (input) => {
            await createTicketMutation.mutateAsync({
              ...input,
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
