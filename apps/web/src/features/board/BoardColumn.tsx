import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column, Ticket } from "@gtd/contracts";
import { useDroppable } from "@dnd-kit/core";

import type { TicketViewMode } from "./TicketViewToggle";
import { SortableTicketCard } from "../tickets/SortableTicketCard";

type BoardColumnProps = {
  column: Column;
  tickets: Ticket[];
  onEditTicket: (ticket: Ticket) => void;
  onCreateTicket: (columnId: string) => void;
  onInlineTitleUpdate: (ticket: Ticket, nextTitle: string) => Promise<void>;
  viewMode: TicketViewMode;
};

export function BoardColumn({
  column,
  tickets,
  onEditTicket,
  onCreateTicket,
  onInlineTitleUpdate,
  viewMode,
}: BoardColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
  });

  return (
    <section
      className={`board-column ${isOver ? "board-column--over" : ""}`}
      data-testid={`column-${column.key}`}
    >
      <header className="board-column__header">
        <div className="board-column__header-row">
          <div>
            <h2>{column.name}</h2>
            <p>{tickets.length} tickets</p>
          </div>
          <button
            aria-label={`Add ticket in ${column.name}`}
            className="board-column__add-button"
            data-testid={`column-add-${column.key}`}
            type="button"
            onClick={() => onCreateTicket(column.id)}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M9 4a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4Z" />
            </svg>
          </button>
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
                onTitleUpdate={(nextTitle) => onInlineTitleUpdate(ticket, nextTitle)}
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
