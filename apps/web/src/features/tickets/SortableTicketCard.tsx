import type { Ticket } from "@gtd/contracts";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { TicketViewMode } from "../board/TicketViewToggle";
import { TicketCard } from "./TicketCard";

type TicketCardTone = "default" | "done";

type SortableTicketCardProps = {
  ticket: Ticket;
  tone: TicketCardTone;
  onEdit: () => void;
  onTitleUpdate: (nextTitle: string) => Promise<void>;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
  viewMode: TicketViewMode;
};

export function SortableTicketCard({
  ticket,
  tone,
  onEdit,
  onTitleUpdate,
  isExpanded = false,
  onToggleExpanded,
  viewMode,
}: SortableTicketCardProps) {
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
        dragHandleProps={{
          attributes,
          listeners,
        }}
        isExpanded={isExpanded}
        ticket={ticket}
        tone={tone}
        onEdit={onEdit}
        onToggleExpanded={onToggleExpanded}
        onTitleUpdate={onTitleUpdate}
        isDragging={isDragging}
        viewMode={viewMode}
      />
    </div>
  );
}
