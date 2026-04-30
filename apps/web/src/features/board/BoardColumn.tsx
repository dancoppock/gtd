import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column, Ticket } from "@gtd/contracts";
import { useDroppable } from "@dnd-kit/core";

import type { TicketViewMode } from "./TicketViewToggle";
import { SortableTicketCard } from "../tickets/SortableTicketCard";

type BoardColumnProps = {
  column: Column;
  tickets: Ticket[];
  onEditTicket: (ticket: Ticket) => void;
  viewMode: TicketViewMode;
};

export function BoardColumn({ column, tickets, onEditTicket, viewMode }: BoardColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
  });

  return (
    <section
      className={`board-column ${isOver ? "board-column--over" : ""}`}
      data-testid={`column-${column.key}`}
    >
      <header className="board-column__header">
        <div>
          <h2>{column.name}</h2>
          <p>{tickets.length} tickets</p>
        </div>
      </header>

      <div
        ref={setNodeRef}
        className={`board-column__body ${isOver ? "board-column__body--over" : ""}`}
        data-testid={`column-body-${column.key}`}
      >
        <SortableContext
          items={tickets.map((ticket) => ticket.id)}
          strategy={verticalListSortingStrategy}
        >
          {tickets.length > 0 ? (
            tickets.map((ticket) => (
              <SortableTicketCard
                key={ticket.id}
                ticket={ticket}
                onEdit={() => onEditTicket(ticket)}
                viewMode={viewMode}
              />
            ))
          ) : (
            <div className="board-column__empty">
              <span>No tickets match the current filters.</span>
            </div>
          )}
        </SortableContext>
      </div>
    </section>
  );
}
