import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column, Ticket } from "@gtd/contracts";
import { useDroppable } from "@dnd-kit/core";

import type { TicketViewMode } from "./TicketViewToggle";
import { SortableTicketCard } from "../tickets/SortableTicketCard";

export type CreateTicketPosition = "top" | "bottom";

type BoardColumnProps = {
  column: Column;
  collapsed?: boolean;
  droppableId?: string;
  emptyMessage?: string | null;
  expandedTicketIds: ReadonlySet<string>;
  showHeader?: boolean;
  showPriorityColors: boolean;
  showTail?: boolean;
  tickets: Ticket[];
  isArchiving?: boolean;
  onEditTicket: (ticket: Ticket) => void;
  onCreateTicket: (statusKey: Column["statusKey"], position: CreateTicketPosition) => void;
  onArchiveDoneTickets?: () => void;
  onInlineTitleUpdate: (ticket: Ticket, nextTitle: string) => Promise<void>;
  onToggleCollapsed?: () => void;
  onToggleTicketExpanded: (ticketId: string) => void;
  variant?: "default" | "swimlane";
  viewMode: TicketViewMode;
};

function CollapseIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      {direction === "left" ? (
        <path d="M12.78 4.97a.75.75 0 0 1 0 1.06L8.81 10l3.97 3.97a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06l4.5-4.5a.75.75 0 0 1 1.06 0Z" />
      ) : (
        <path d="M7.22 15.03a.75.75 0 0 1 0-1.06L11.19 10 7.22 6.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0Z" />
      )}
    </svg>
  );
}

function formatTicketCount(count: number) {
  return `${count} ${count === 1 ? "ticket" : "tickets"}`;
}

export function BoardColumn({
  column,
  collapsed = false,
  droppableId,
  emptyMessage = "No tickets match the current filters.",
  expandedTicketIds,
  showHeader = true,
  showPriorityColors,
  showTail = true,
  tickets,
  isArchiving = false,
  onEditTicket,
  onCreateTicket,
  onArchiveDoneTickets,
  onInlineTitleUpdate,
  onToggleCollapsed,
  onToggleTicketExpanded,
  variant = "default",
  viewMode,
}: BoardColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: droppableId ?? column.id,
  });

  if (collapsed) {
    return (
      <section
        className={`board-column board-column--collapsed ${column.statusKey === "in_progress" ? "board-column--in-progress" : ""} ${variant === "swimlane" ? "board-column--swimlane" : ""}`}
        data-testid={`column-${column.statusKey}`}
      >
        {showHeader ? (
          <header className="board-column__header board-column__header--collapsed">
            <div className="board-column__header-row board-column__header-row--collapsed">
              <button
                aria-label={`Expand ${column.name}`}
                className="board-column__collapse-button"
                data-testid={`column-expand-${column.statusKey}`}
                title={`Expand ${column.name}`}
                type="button"
                onClick={onToggleCollapsed}
              >
                <CollapseIcon direction="right" />
              </button>
              <div className="board-column__collapsed-label">
                <h2 title={formatTicketCount(tickets.length)}>{column.name}</h2>
              </div>
            </div>
          </header>
        ) : (
          <div className="board-column__collapsed-spacer" />
        )}
      </section>
    );
  }

  return (
    <section
      className={`board-column ${column.statusKey === "in_progress" ? "board-column--in-progress" : ""} ${variant === "swimlane" ? "board-column--swimlane" : ""} ${isOver ? "board-column--over" : ""}`}
      data-testid={`column-${column.statusKey}`}
    >
      {showHeader ? (
        <header className="board-column__header">
          <div className="board-column__header-row">
            <div className="board-column__header-main">
              <button
                aria-label={`Collapse ${column.name}`}
                className="board-column__collapse-button"
                data-testid={`column-collapse-${column.statusKey}`}
                title={`Collapse ${column.name}`}
                type="button"
                onClick={onToggleCollapsed}
              >
                <CollapseIcon direction="left" />
              </button>
              <div>
                <h2 title={formatTicketCount(tickets.length)}>{column.name}</h2>
              </div>
            </div>
            <div className="board-column__header-actions">
              {column.statusCategory === "completed" && onArchiveDoneTickets ? (
                <button
                  aria-label={`Archive completed tickets in ${column.name}`}
                  className="board-column__archive-button"
                  data-testid={`column-archive-${column.statusKey}`}
                  disabled={isArchiving || tickets.length === 0}
                  title="Archive completed tickets"
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
                data-testid={`column-add-${column.statusKey}`}
                type="button"
                onClick={() => onCreateTicket(column.statusKey, "top")}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20">
                  <path d="M9 4a1 1 0 1 1 2 0v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H4a1 1 0 1 1 0-2h5V4Z" />
                </svg>
              </button>
            </div>
          </div>
        </header>
      ) : null}

      <div
        ref={setNodeRef}
        className={`board-column__body ${tickets.length === 0 ? "board-column__body--empty" : ""} ${variant === "swimlane" ? "board-column__body--swimlane" : ""} ${isOver ? "board-column__body--over" : ""}`}
        data-testid={`column-body-${column.statusKey}`}
      >
        <SortableContext
          items={tickets.map((ticket) => ticket.id)}
          strategy={verticalListSortingStrategy}
        >
          {tickets.length > 0 ? (
            tickets.map((ticket) => (
              <SortableTicketCard
                key={ticket.id}
                isExpanded={expandedTicketIds.has(ticket.id)}
                ticket={ticket}
                tone={column.statusCategory === "completed" ? "done" : "default"}
                onEdit={() => onEditTicket(ticket)}
                onToggleExpanded={() => onToggleTicketExpanded(ticket.id)}
                onTitleUpdate={(nextTitle) => onInlineTitleUpdate(ticket, nextTitle)}
                showPriorityColor={showPriorityColors && column.statusCategory !== "completed"}
                viewMode={viewMode}
              />
            ))
          ) : (
            <div className={`board-column__empty ${emptyMessage ? "" : "board-column__empty--quiet"}`}>
              {emptyMessage ? <span>{emptyMessage}</span> : null}
            </div>
          )}
        </SortableContext>

        {showTail ? (
          <div
            className="board-column__tail"
            data-testid={`column-tail-${column.statusKey}`}
            onClick={() => onCreateTicket(column.statusKey, "bottom")}
          />
        ) : null}
      </div>
    </section>
  );
}
