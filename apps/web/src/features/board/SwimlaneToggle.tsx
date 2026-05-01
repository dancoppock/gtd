type SwimlaneToggleProps = {
  value: boolean;
  onChange: (nextValue: boolean) => void;
};

function SwimlaneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M3 5.25A1.25 1.25 0 0 1 4.25 4h11.5A1.25 1.25 0 0 1 17 5.25v1.5A1.25 1.25 0 0 1 15.75 8H4.25A1.25 1.25 0 0 1 3 6.75v-1.5Zm0 4.5A1.25 1.25 0 0 1 4.25 8.5h11.5A1.25 1.25 0 0 1 17 9.75v.5A1.25 1.25 0 0 1 15.75 11.5H4.25A1.25 1.25 0 0 1 3 10.25v-.5Zm0 3.5A1.25 1.25 0 0 1 4.25 12h11.5A1.25 1.25 0 0 1 17 13.25v1.5A1.25 1.25 0 0 1 15.75 16H4.25A1.25 1.25 0 0 1 3 14.75v-1.5Zm2-4.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 5 8.5Zm0 3.5a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5A.75.75 0 0 1 5 12Zm0-7a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5h-3.5A.75.75 0 0 1 5 5Z" />
    </svg>
  );
}

export function SwimlaneToggle({ value, onChange }: SwimlaneToggleProps) {
  return (
    <button
      aria-label="Toggle swimlanes"
      aria-pressed={value}
      className={`ghost-button swimlane-toggle ${value ? "swimlane-toggle--active" : ""}`}
      data-testid="swimlane-toggle"
      title="Toggle swimlanes"
      type="button"
      onClick={() => onChange(!value)}
    >
      <SwimlaneIcon />
      <span>Swimlanes</span>
    </button>
  );
}
