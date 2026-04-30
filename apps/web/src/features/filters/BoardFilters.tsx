import type { BoardFilters, Label, TicketPriority } from "@gtd/contracts";

const ALL_PRIORITIES: TicketPriority[] = ["highest", "high", "medium", "low"];

type BoardFiltersProps = {
  filters: BoardFilters;
  availableLabels: Label[];
  onChange: (next: BoardFilters) => void;
  onClear: () => void;
};

function toggleValue<T extends string>(values: T[], nextValue: T) {
  return values.includes(nextValue)
    ? values.filter((value) => value !== nextValue)
    : [...values, nextValue];
}

export function BoardFilters({
  filters,
  availableLabels,
  onChange,
  onClear,
}: BoardFiltersProps) {
  const { priorities, labels, q } = filters;

  return (
    <section className="filters-panel" data-testid="filters-panel">
      <div className="filters-panel__top">
        <label className="field">
          <span>Search</span>
          <input
            data-testid="filters-search"
            type="search"
            value={q}
            placeholder="Search titles and descriptions"
            onChange={(event) =>
              onChange({
                priorities,
                labels,
                q: event.target.value,
              })
            }
          />
        </label>

        <button className="ghost-button" data-testid="clear-filters" type="button" onClick={onClear}>
          Clear Filters
        </button>
      </div>

      <div className="filters-grid">
        <div className="filter-group">
          <span className="filter-group__title">Priority</span>
          <div className="chip-list">
            {ALL_PRIORITIES.map((priority) => (
              <label key={priority} className="chip-toggle">
                <input
                  data-testid={`priority-filter-${priority}`}
                  type="checkbox"
                  checked={priorities.includes(priority)}
                  onChange={() =>
                    onChange({
                      priorities: toggleValue(priorities, priority),
                      labels,
                      q,
                    })
                  }
                />
                <span>{priority}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-group__title">Labels</span>
          <div className="chip-list">
            {availableLabels.length > 0 ? (
              availableLabels.map((label) => (
                <label key={label.id} className="chip-toggle">
                  <input
                    data-testid={`label-filter-${label.normalizedName}`}
                    type="checkbox"
                    checked={labels.includes(label.normalizedName)}
                    onChange={() =>
                      onChange({
                        priorities,
                        labels: toggleValue(labels, label.normalizedName),
                        q,
                      })
                    }
                  />
                  <span>{label.name}</span>
                </label>
              ))
            ) : (
              <span className="muted-text">Labels appear here as they are created.</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
