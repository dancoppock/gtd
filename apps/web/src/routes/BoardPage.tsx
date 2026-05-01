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
import { Link, useParams, useSearchParams } from "react-router-dom";

import {
  archiveDoneTickets,
  createTicket,
  deleteTicket,
  fetchBoardTickets,
  repositionTicket,
  updateTicket,
} from "../features/board/api";
import { BoardColumn } from "../features/board/BoardColumn";
import {
  buildRepositionInput,
  findStatusKey,
  haveSameTicketLayout,
  moveTicket,
} from "../features/board/drag";
import { TicketViewToggle, type TicketViewMode } from "../features/board/TicketViewToggle";
import { BoardFilters as BoardFiltersPanel } from "../features/filters/BoardFilters";
import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";
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

function resolveTicketTone(columns: Array<{ statusKey: string; statusCategory: string }>, ticket: Ticket) {
  return columns.find((column) => column.statusKey === ticket.statusKey)?.statusCategory === "completed"
    ? "done"
    : "default";
}

export function BoardPage() {
  const { boardSlug = "default" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [createStatusKey, setCreateStatusKey] = useState<Ticket["statusKey"] | null>(null);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
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
    }) => {
      if (!boardQuery.data) {
        throw new Error("Board data is not ready");
      }

      return createTicket(boardQuery.data.board.id, input);
    },
    onSuccess: async () => {
      setCreateStatusKey(null);
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
  const activeTicket = activeTicketId
    ? visibleTickets.find((ticket) => ticket.id === activeTicketId) ?? null
    : null;

  useEffect(() => {
    if (data) {
      setVisibleTickets(data.tickets);
    }
  }, [data]);

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
      <AppHeader
        activeNav={data?.board.isDefault ? "home" : "boards"}
        actions={
          <>
            <TicketViewToggle value={ticketViewMode} onChange={setTicketViewMode} />
            <Link className="ghost-button" to={`/boards/${boardSlug}/edit`}>
              Edit Board
            </Link>
            <button
              className="primary-button"
              disabled={!data}
              type="button"
              onClick={() => setCreateStatusKey(data?.board.columns[0]?.statusKey ?? "todo")}
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
            <section className="board-grid">
              {data.board.columns.map((column) => {
                const tickets = visibleTickets.filter((ticket) => ticket.statusKey === column.statusKey);

                return (
                  <BoardColumn
                    key={column.id}
                    column={column}
                    isArchiving={archiveDoneTicketsMutation.isPending && column.statusCategory === "completed"}
                    tickets={tickets}
                    onArchiveDoneTickets={() => {
                      void archiveDoneTicketsMutation.mutateAsync(data.board.id);
                    }}
                    onEditTicket={setEditingTicket}
                    onCreateTicket={setCreateStatusKey}
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
                  tone={resolveTicketTone(data.board.columns, activeTicket)}
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

      {createStatusKey && data ? (
        <TicketModal
          mode="create"
          ticket={null}
          columns={data.board.columns}
          availableLabels={data.board.availableLabels}
          implicitLabels={data.board.filterLabels}
          defaultStatusKey={createStatusKey}
          onClose={() => setCreateStatusKey(null)}
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
          availableLabels={data.board.availableLabels}
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
