import { boardFiltersSchema, type BoardFilters, type Ticket } from "@gtd/contracts";
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
import { BoardFilters as BoardFiltersPanel } from "../features/filters/BoardFilters";
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

export function BoardPage() {
  const { boardSlug = "default" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
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
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["board", boardSlug] });
    },
  });

  const updateTicketMutation = useMutation({
    mutationFn: (args: {
      ticketId: string;
      input: {
        columnId: string;
        title: string;
        description: string;
        priority: "highest" | "high" | "medium" | "low";
        labels: string[];
      };
    }) => updateTicket(args.ticketId, args.input),
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

  return (
    <main className="page-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Single-board kanban starter</p>
          <h1>{data?.board.name ?? "Loading board..."}</h1>
          <p>
            The board model already supports multiple boards and board-owned columns, while v1 stays
            fixed to Todo, In Progress, and Done.
          </p>
        </div>

        <div className="hero-panel__actions">
          <button className="primary-button" type="button" onClick={() => setCreateOpen(true)}>
            New Ticket
          </button>
        </div>
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
                  />
                );
              })}
            </section>

            <DragOverlay>
              {activeTicket ? <TicketCard ticket={activeTicket} onEdit={() => undefined} /> : null}
            </DragOverlay>
          </DndContext>
        </>
      ) : (
        <section className="message-panel">
          <h2>Loading board</h2>
          <p>Fetching columns, labels, and tickets.</p>
        </section>
      )}

      {createOpen && data ? (
        <TicketModal
          mode="create"
          ticket={null}
          columns={data.board.columns}
          availableLabels={data.board.labels}
          onClose={() => setCreateOpen(false)}
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
