export type TicketViewMode = "full" | "compact";

type TicketViewToggleProps = {
  value: TicketViewMode;
  onChange: (nextValue: TicketViewMode) => void;
};

function CompactViewIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="3" y="4" width="14" height="2" rx="1" />
      <rect x="3" y="9" width="14" height="2" rx="1" />
      <rect x="3" y="14" width="8" height="2" rx="1" />
    </svg>
  );
}

function FullViewIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="3" y="3" width="14" height="2" rx="1" />
      <rect x="3" y="7.5" width="14" height="5" rx="1.5" />
      <rect x="3" y="14.5" width="5.5" height="2" rx="1" />
      <rect x="9.5" y="14.5" width="7.5" height="2" rx="1" />
    </svg>
  );
}

export function TicketViewToggle({ value, onChange }: TicketViewToggleProps) {
  return (
    <div className="view-toggle" aria-label="Ticket view mode" role="group">
      <button
        aria-label="Full ticket view"
        aria-pressed={value === "full"}
        className={`icon-toggle-button ${value === "full" ? "icon-toggle-button--active" : ""}`}
        data-testid="ticket-view-full"
        title="Full ticket view"
        type="button"
        onClick={() => onChange("full")}
      >
        <FullViewIcon />
      </button>

      <button
        aria-label="Compact ticket view"
        aria-pressed={value === "compact"}
        className={`icon-toggle-button ${value === "compact" ? "icon-toggle-button--active" : ""}`}
        data-testid="ticket-view-compact"
        title="Compact ticket view"
        type="button"
        onClick={() => onChange("compact")}
      >
        <CompactViewIcon />
      </button>
    </div>
  );
}
