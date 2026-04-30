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
    <article className={`ticket-card ${isDragging ? "ticket-card--dragging" : ""}`}>
      <div className="ticket-card__meta">
        <span className={`priority-badge priority-badge--${ticket.priority}`}>
          {ticket.priority}
        </span>
        <div className="ticket-card__actions">
          <button className="ticket-card__drag-handle" type="button" {...dragHandleProps}>
            Drag
          </button>
          <button className="link-button" type="button" onClick={onEdit}>
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
