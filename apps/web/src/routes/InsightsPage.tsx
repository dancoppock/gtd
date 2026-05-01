import { useQuery } from "@tanstack/react-query";

import { fetchInsights } from "../features/board/api";
import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";

function formatCompletedAt(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function InsightsPage() {
  const { theme, setTheme } = useBoardTheme();
  const insightsQuery = useQuery({
    queryKey: ["insights"],
    queryFn: fetchInsights,
  });

  const data = insightsQuery.data;

  return (
    <main className="page-shell">
      <AppHeader
        activeNav="insights"
        description="Track recently completed work across your ticket pool."
        theme={theme}
        title="Insights"
        onThemeChange={setTheme}
      />

      {insightsQuery.isError ? (
        <section className="message-panel message-panel--error">
          <h2>Insights failed to load</h2>
          <p>{insightsQuery.error instanceof Error ? insightsQuery.error.message : "Unknown error"}</p>
        </section>
      ) : null}

      {insightsQuery.isLoading ? (
        <section className="message-panel">
          <h2>Loading insights</h2>
          <p>Calculating completion metrics and recently finished tickets.</p>
        </section>
      ) : null}

      {data ? (
        <section className="insights-layout">
          <section className="insights-metrics">
            <article className="insight-card insight-card--today">
              <span className="insight-card__label">Done Today</span>
              <strong>{data.summary.doneToday}</strong>
            </article>
            <article className="insight-card insight-card--week">
              <span className="insight-card__label">Done This Week</span>
              <strong>{data.summary.doneThisWeek}</strong>
            </article>
            <article className="insight-card insight-card--last-week">
              <span className="insight-card__label">Done Last Week</span>
              <strong>{data.summary.doneLastWeek}</strong>
            </article>
          </section>

          <section className="insights-lists">
            <article className="labels-panel">
              <div className="labels-panel__header">
                <div>
                  <h2>Done Today</h2>
                  <p>{data.tickets.doneToday.length} tickets completed today.</p>
                </div>
              </div>

              {data.tickets.doneToday.length > 0 ? (
                <div className="labels-list">
                  {data.tickets.doneToday.map((ticket) => (
                    <article key={ticket.id} className="label-row">
                      <div className="label-row__main">
                        <strong>{ticket.title}</strong>
                        <span className="muted-text">{formatCompletedAt(ticket.completedAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="message-panel">
                  <h2>No tickets done today</h2>
                  <p>Completed tickets will appear here as work is finished.</p>
                </div>
              )}
            </article>

            <article className="labels-panel">
              <div className="labels-panel__header">
                <div>
                  <h2>Done This Week</h2>
                  <p>{data.tickets.doneThisWeek.length} tickets completed since Monday.</p>
                </div>
              </div>

              {data.tickets.doneThisWeek.length > 0 ? (
                <div className="labels-list">
                  {data.tickets.doneThisWeek.map((ticket) => (
                    <article key={ticket.id} className="label-row">
                      <div className="label-row__main">
                        <strong>{ticket.title}</strong>
                        <span className="muted-text">{formatCompletedAt(ticket.completedAt)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="message-panel">
                  <h2>No tickets done this week</h2>
                  <p>Completed tickets since Monday will appear here.</p>
                </div>
              )}
            </article>
          </section>
        </section>
      ) : null}
    </main>
  );
}
