import type { Ticket } from "@gtd/contracts";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { TicketViewMode } from "../board/TicketViewToggle";
import { TicketCard } from "./TicketCard";

type SortableTicketCardProps = {
  ticket: Ticket;
  onEdit: () => void;
  onTitleUpdate: (nextTitle: string) => Promise<void>;
  viewMode: TicketViewMode;
};

export function SortableTicketCard({ ticket, onEdit, onTitleUpdate, viewMode }: SortableTicketCardProps) {
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
        onTitleUpdate={onTitleUpdate}
        isDragging={isDragging}
        viewMode={viewMode}
        dragHandleProps={{
          ...attributes,
          ...listeners,
        }}
      />
    </div>
  );
}
