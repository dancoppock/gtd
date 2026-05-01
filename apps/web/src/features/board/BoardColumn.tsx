import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column, Ticket } from "@gtd/contracts";
import { useDroppable } from "@dnd-kit/core";

import type { TicketViewMode } from "./TicketViewToggle";
import { SortableTicketCard } from "../tickets/SortableTicketCard";

type BoardColumnProps = {
  column: Column;
  tickets: Ticket[];
  isArchiving?: boolean;
  onEditTicket: (ticket: Ticket) => void;
  onCreateTicket: (columnId: string) => void;
  onArchiveDoneTickets?: () => void;
  onInlineTitleUpdate: (ticket: Ticket, nextTitle: string) => Promise<void>;
  viewMode: TicketViewMode;
};

export function BoardColumn({
  column,
  tickets,
  isArchiving = false,
  onEditTicket,
  onCreateTicket,
  onArchiveDoneTickets,
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
          <div className="board-column__header-actions">
            {column.key === "done" && onArchiveDoneTickets ? (
              <button
                aria-label="Archive done tickets"
                className="board-column__archive-button"
                data-testid="column-archive-done"
                disabled={isArchiving || tickets.length === 0}
                title="Archive done tickets"
                type="button"
                onClick={onArchiveDoneTickets}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M3.75 4A1.75 1.75 0 0 1 5.5 2.25h9A1.75 1.75 0 0 1 16.25 4v1.09a2.5 2.5 0 0 1 .86 1.89v1.27a2.5 2.5 0 0 1-2.5 2.5h-.36l-.53 4.26A2.25 2.25 0 0 1 11.49 17H8.51a2.25 2.25 0 0 1-2.23-1.99l-.53-4.26h-.36a2.5 2.5 0 0 1-2.5-2.5V6.98a2.5 2.5 0 0 1 .86-1.89V4Zm1.5.06v.94h9V4a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v.06ZM4.39 6.5a1 1 0 0 0-1 1v.75a1 1 0 0 0 1 1h11.22a1 1 0 0 0 1-1V7.5a1 1 0 0 0-1-1H4.39Zm2.87 4.25.5 4a.75.75 0 0 0 .74.66h2.98a.75.75 0 0 0 .74-.66l.5-4H7.26Zm3.49.43a.75.75 0 0 1 1.06 0l.94.94.94-.94a.75.75 0 1 1 1.06 1.06l-1.47 1.47a.75.75 0 0 1-1.06 0l-1.47-1.47a.75.75 0 0 1 0-1.06Z" />
                </svg>
              </button>
            ) : null}
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
                tone={column.key === "done" ? "done" : "default"}
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
