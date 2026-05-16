import type { BoardFilters, Label, TicketPriority } from "@gtd/contracts";
import { useState } from "react";

const ALL_PRIORITIES: TicketPriority[] = ["highest", "high", "medium", "low"];

type BoardFiltersProps = {
  filters: BoardFilters;
  availableLabels: Label[];
  implicitLabels?: Label[];
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
  implicitLabels = [],
  onChange,
  onClear,
}: BoardFiltersProps) {
  const { priorities, labels, q } = filters;
  const [isCollapsed, setIsCollapsed] = useState(true);
  const implicitLabelNames = new Set(implicitLabels.map((label) => label.normalizedName));

  return (
    <section
      className={`filters-panel ${isCollapsed ? "filters-panel--collapsed" : ""}`}
      data-testid="filters-panel"
    >
      <div className="filters-panel__header">
        <div>
          <span className="filters-panel__title">Search & Filters</span>
        </div>
        <button
          aria-label={isCollapsed ? "Expand filters panel" : "Collapse filters panel"}
          aria-expanded={!isCollapsed}
          className="filters-panel__toggle"
          data-testid="filters-toggle"
          type="button"
          onClick={() => setIsCollapsed((currentValue) => !currentValue)}
        >
          <svg
            aria-hidden="true"
            className={isCollapsed ? "filters-panel__toggle-icon filters-panel__toggle-icon--collapsed" : "filters-panel__toggle-icon"}
            viewBox="0 0 20 20"
          >
            <path d="M5.22 12.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.56l-3.72 3.72a.75.75 0 0 1-1.06 0Z" />
          </svg>
        </button>
      </div>

      {!isCollapsed ? (
        <>
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
                    <label
                      key={label.id}
                      className={`chip-toggle ${implicitLabelNames.has(label.normalizedName) ? "chip-toggle--implicit" : ""}`}
                    >
                      <input
                        data-testid={`label-filter-${label.normalizedName}`}
                        type="checkbox"
                        checked={
                          implicitLabelNames.has(label.normalizedName)
                          || labels.includes(label.normalizedName)
                        }
                        disabled={implicitLabelNames.has(label.normalizedName)}
                        onChange={() => {
                          if (implicitLabelNames.has(label.normalizedName)) {
                            return;
                          }

                          onChange({
                            priorities,
                            labels: toggleValue(labels, label.normalizedName),
                            q,
                          });
                        }}
                      />
                      <span>
                        {label.name}
                        {implicitLabelNames.has(label.normalizedName) ? " (board)" : ""}
                      </span>
                    </label>
                  ))
                ) : (
                  <span className="muted-text">Labels appear here as they are created.</span>
                )}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
