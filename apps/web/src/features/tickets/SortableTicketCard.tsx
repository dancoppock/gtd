import type { Ticket } from "@gtd/contracts";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { MouseEvent } from "react";

import type { TicketViewMode } from "../board/TicketViewToggle";
import { TicketCard } from "./TicketCard";

type TicketCardTone = "default" | "done";

type SortableTicketCardProps = {
  ticket: Ticket;
  tone: TicketCardTone;
  beginEditingKey?: number;
  onEdit: () => void;
  onTitleEditEnd?: () => void;
  onTitleUpdate: (nextTitle: string) => Promise<void>;
  onTicketClick?: (event: MouseEvent) => void;
  isExpanded?: boolean;
  isSelected?: boolean;
  isTagged?: boolean;
  onToggleExpanded?: () => void;
  showPriorityColor: boolean;
  viewMode: TicketViewMode;
};

export function SortableTicketCard({
  beginEditingKey,
  ticket,
  tone,
  onEdit,
  onTitleEditEnd,
  onTitleUpdate,
  onTicketClick,
  showPriorityColor,
  isExpanded = false,
  isSelected = false,
  isTagged = false,
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
      onClick={onTicketClick}
    >
      <TicketCard
        beginEditingKey={beginEditingKey}
        dragHandleProps={{
          attributes,
          listeners,
        }}
        isExpanded={isExpanded}
        isSelected={isSelected}
        isTagged={isTagged}
        ticket={ticket}
        tone={tone}
        onEdit={onEdit}
        onTitleEditEnd={onTitleEditEnd}
        onToggleExpanded={onToggleExpanded}
        onTitleUpdate={onTitleUpdate}
        showPriorityColor={showPriorityColor}
        isDragging={isDragging}
        viewMode={viewMode}
      />
    </div>
  );
}
