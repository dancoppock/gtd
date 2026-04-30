import type { Ticket } from "@gtd/contracts";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { TicketCard } from "./TicketCard";

type SortableTicketCardProps = {
  ticket: Ticket;
  onEdit: () => void;
};

export function SortableTicketCard({ ticket, onEdit }: SortableTicketCardProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: ticket.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={`ticket-card-shell ${isDragging ? "ticket-card-shell--dragging" : ""}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <TicketCard
        ticket={ticket}
        onEdit={onEdit}
        isDragging={isDragging}
        dragHandleProps={{
          ...attributes,
          ...listeners,
        }}
      />
    </div>
  );
}
