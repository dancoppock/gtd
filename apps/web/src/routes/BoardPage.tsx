import {
  boardFiltersSchema,
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
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import {
  createTicket,
  deleteTicket,
  fetchBoardTickets,
  repositionTicket,
  updateTicket,
} from "../features/board/api";
import { BoardColumn } from "../features/board/BoardColumn";
import {
  buildRepositionInput,
  findColumnId,
  haveSameTicketLayout,
  moveTicket,
} from "../features/board/drag";
import { TicketViewToggle, type TicketViewMode } from "../features/board/TicketViewToggle";
import { BoardFilters as BoardFiltersPanel } from "../features/filters/BoardFilters";
import {
  defaultTheme,
  isBoardTheme,
  themeOptions,
  themeStorageKey,
  type BoardTheme,
} from "../features/theme/themes";
import { TicketCard } from "../features/tickets/TicketCard";
import { TicketModal } from "../features/tickets/TicketModal";

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

function resolveTicketTone(
  ticket: Ticket,
  columns: { id: string; key: "todo" | "in_progress" | "done" }[],
) {
  const column = columns.find((candidate) => candidate.id === ticket.columnId);
  return column?.key === "done" ? "done" : "default";
}

export function BoardPage() {
  const { boardSlug = "default" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [createColumnId, setCreateColumnId] = useState<string | null>(null);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);
  const [ticketViewMode, setTicketViewMode] = useState<TicketViewMode>("compact");
  const [theme, setTheme] = useState<BoardTheme>(() => {
    if (typeof window === "undefined") {
      return defaultTheme;
    }

    const storedTheme = window.localStorage.getItem(themeStorageKey);
    return storedTheme && isBoardTheme(storedTheme) ? storedTheme : defaultTheme;
  });
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
      columnId: string;
      title: string;
      description: string;
      priority: "highest" | "high" | "medium" | "low";
      labels: string[];
    }) => {
      if (!boardQuery.data) {
        throw new Error("Board data is not ready");
      }

      return createTicket(boardQuery.data.board.id, input);
    },
    onSuccess: async () => {
      setCreateColumnId(null);
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
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
    },
  });

  const deleteTicketMutation = useMutation({
    mutationFn: (ticketId: string) => deleteTicket(ticketId),
    onSuccess: async () => {
      setEditingTicket(null);
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
    },
  });

  const repositionTicketMutation = useMutation({
    mutationFn: (args: { ticketId: string; input: { columnId: string; prevVisibleTicketId: string | null; nextVisibleTicketId: string | null } }) =>
      repositionTicket(args.ticketId, args.input),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
    },
  });

  const data = boardQuery.data;
  const activeTicket = activeTicketId
    ? visibleTickets.find((ticket) => ticket.id === activeTicketId) ?? null
    : null;

  useEffect(() => {
    if (data) {
      setVisibleTickets(data.tickets);
    }
  }, [data]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

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
      const activeColumnId = findColumnId(data.board.columns, currentTickets, activeId);
      const overColumnId = findColumnId(data.board.columns, currentTickets, overId);

      if (!activeColumnId || !overColumnId || activeColumnId === overColumnId) {
        return currentTickets;
      }

      const nextTickets = moveTicket(data.board.columns, currentTickets, activeId, overId);
      return haveSameTicketLayout(currentTickets, nextTickets) ? currentTickets : nextTickets;
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicketId(null);

    if (!data || !event.over) {
      setVisibleTickets(data?.tickets ?? []);
      return;
    }

    const activeId = String(event.active.id);
    const overId = String(event.over.id);

    setVisibleTickets((currentTickets) => {
      const nextTickets = moveTicket(data.board.columns, currentTickets, activeId, overId);
      const didChange = !haveSameTicketLayout(data.tickets, nextTickets);

      if (didChange) {
        const repositionInput = buildRepositionInput(data.board.columns, nextTickets, activeId);

        if (repositionInput) {
          repositionTicketMutation.mutate({
            ticketId: activeId,
            input: repositionInput,
          });
        }
      }

      return nextTickets;
    });
  }

  function handleDragCancel() {
    setActiveTicketId(null);
    if (data) {
      setVisibleTickets(data.tickets);
    }
  }

  async function handleInlineTitleUpdate(ticket: Ticket, nextTitle: string) {
    const previousTitle = ticket.title;

    setVisibleTickets((currentTickets) =>
      currentTickets.map((currentTicket) =>
        currentTicket.id === ticket.id
          ? {
              ...currentTicket,
              title: nextTitle,
            }
          : currentTicket,
      ),
    );

    try {
      await updateTicketMutation.mutateAsync({
        ticketId: ticket.id,
        input: {
          title: nextTitle,
        },
      });
    } catch (error) {
      setVisibleTickets((currentTickets) =>
        currentTickets.map((currentTicket) =>
          currentTicket.id === ticket.id
            ? {
                ...currentTicket,
                title: previousTitle,
              }
            : currentTicket,
        ),
      );
      throw error;
    }
  }

  return (
    <main className="page-shell">
      <section className={`hero-panel ${isHeaderCollapsed ? "hero-panel--collapsed" : ""}`}>
        <div className="hero-panel__header">
          <div>
            <h1>{data?.board.name ?? "Loading board..."}</h1>
          </div>
          <button
            aria-label={isHeaderCollapsed ? "Expand header panel" : "Collapse header panel"}
            aria-expanded={!isHeaderCollapsed}
            className="hero-panel__toggle"
            data-testid="hero-toggle"
            type="button"
            onClick={() => setIsHeaderCollapsed((currentValue) => !currentValue)}
          >
            <svg
              aria-hidden="true"
              className={isHeaderCollapsed ? "hero-panel__toggle-icon hero-panel__toggle-icon--collapsed" : "hero-panel__toggle-icon"}
              viewBox="0 0 20 20"
            >
              <path d="M5.22 12.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.56l-3.72 3.72a.75.75 0 0 1-1.06 0Z" />
            </svg>
          </button>
        </div>

        {!isHeaderCollapsed ? (
          <div className="hero-panel__body">
            <p>
              The board model already supports multiple boards and board-owned columns, while v1 stays
              fixed to Todo, In Progress, and Done.
            </p>

            <div className="hero-panel__actions">
              <label className="theme-select">
                <span>Theme</span>
                <select
                  aria-label="Theme"
                  data-testid="theme-select"
                  value={theme}
                  onChange={(event) => {
                    const nextTheme = event.target.value;

                    if (isBoardTheme(nextTheme)) {
                      setTheme(nextTheme);
                    }
                  }}
                >
                  {themeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <TicketViewToggle value={ticketViewMode} onChange={setTicketViewMode} />
              <button
                className="primary-button"
                disabled={!data}
                type="button"
                onClick={() => setCreateColumnId(data?.board.columns[0]?.id ?? null)}
              >
                New Ticket
              </button>
            </div>
          </div>
        ) : null}
      </section>

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
            availableLabels={data.board.labels}
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
            <section className="board-grid">
              {data.board.columns.map((column) => {
                const tickets = visibleTickets.filter((ticket) => ticket.columnId === column.id);

                return (
                  <BoardColumn
                    key={column.id}
                    column={column}
                    tickets={tickets}
                    onEditTicket={setEditingTicket}
                    onCreateTicket={setCreateColumnId}
                    onInlineTitleUpdate={handleInlineTitleUpdate}
                    viewMode={ticketViewMode}
                  />
                );
              })}
            </section>

            <DragOverlay>
              {activeTicket ? (
                <TicketCard
                  ticket={activeTicket}
                  tone={resolveTicketTone(activeTicket, data.board.columns)}
                  onEdit={() => undefined}
                  onTitleUpdate={async () => undefined}
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

      {createColumnId && data ? (
        <TicketModal
          mode="create"
          ticket={null}
          columns={data.board.columns}
          availableLabels={data.board.labels}
          defaultColumnId={createColumnId}
          onClose={() => setCreateColumnId(null)}
          onSubmit={async (input) => {
            await createTicketMutation.mutateAsync(input);
          }}
        />
      ) : null}

      {editingTicket && data ? (
        <TicketModal
          mode="edit"
          ticket={editingTicket}
          columns={data.board.columns}
          availableLabels={data.board.labels}
          onClose={() => setEditingTicket(null)}
          onDelete={async () => {
            await deleteTicketMutation.mutateAsync(editingTicket.id);
          }}
          onSubmit={async (input) => {
            await updateTicketMutation.mutateAsync({
              ticketId: editingTicket.id,
              input,
            });
          }}
        />
      ) : null}
    </main>
  );
}
