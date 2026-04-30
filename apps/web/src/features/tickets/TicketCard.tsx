import type { Ticket } from "@gtd/contracts";
import type { ButtonHTMLAttributes } from "react";

type TicketCardProps = {
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  ticket: Ticket;
  onEdit: () => void;
};

export function TicketCard({ dragHandleProps, isDragging = false, ticket, onEdit }: TicketCardProps) {
  return (
    <article
      className={`ticket-card ${isDragging ? "ticket-card--dragging" : ""}`}
      data-testid={`ticket-${ticket.id}`}
    >
      <div className="ticket-card__meta">
        <span className={`priority-badge priority-badge--${ticket.priority}`}>
          {ticket.priority}
        </span>
        <div className="ticket-card__actions">
          <button
            aria-label={`Drag ${ticket.title}`}
            className="ticket-card__drag-handle"
            data-testid={`ticket-drag-${ticket.id}`}
            type="button"
            {...dragHandleProps}
          >
            Drag
          </button>
          <button
            aria-label={`Edit ${ticket.title}`}
            className="link-button"
            data-testid={`ticket-edit-${ticket.id}`}
            type="button"
            onClick={onEdit}
          >
            Edit
          </button>
        </div>
      </div>

      <h3>{ticket.title}</h3>
      <p>{ticket.description}</p>

      {ticket.labels.length > 0 ? (
        <div className="ticket-card__labels">
          {ticket.labels.map((label) => (
            <span key={label.id} className="ticket-label">
              {label.name}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}
