import type { Column } from "@gtd/contracts";
import type { CreateTicketPosition } from "./BoardColumn";

type BoardColumnHeaderProps = {
  column: Column;
  collapsed?: boolean;
  ticketCount: number;
  isArchiving?: boolean;
  onArchiveDoneTickets?: () => void;
  onCreateTicket: (statusKey: Column["statusKey"], position: CreateTicketPosition) => void;
  onToggleCollapsed?: () => void;
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

export function BoardColumnHeader({
  column,
  collapsed = false,
  ticketCount,
  isArchiving = false,
  onArchiveDoneTickets,
  onCreateTicket,
  onToggleCollapsed,
}: BoardColumnHeaderProps) {
  if (collapsed) {
    return (
      <section className="board-column board-column--header-only board-column--collapsed" data-testid={`column-header-${column.statusKey}`}>
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
              <h2>{column.name}</h2>
            </div>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="board-column board-column--header-only" data-testid={`column-header-${column.statusKey}`}>
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
            <h2>{column.name}</h2>
            <p>{ticketCount} tickets</p>
            </div>
          </div>
          <div className="board-column__header-actions">
            {column.statusCategory === "completed" && onArchiveDoneTickets ? (
              <button
                aria-label={`Archive completed tickets in ${column.name}`}
                className="board-column__archive-button"
                data-testid={`column-archive-${column.statusKey}`}
                disabled={isArchiving || ticketCount === 0}
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
    </section>
  );
}
