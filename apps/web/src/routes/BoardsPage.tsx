import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { fetchBoards } from "../features/board/api";
import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";

export function BoardsPage() {
  const { theme, setTheme } = useBoardTheme();
  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
  });

  const boards = boardsQuery.data ?? [];

  return (
    <main className="page-shell">
      <AppHeader
        activeNav="boards"
        actions={(
          <Link className="primary-button" to="/boards/new">
            Create Board
          </Link>
        )}
        description="Boards are configurable views over the shared ticket pool. Each board defines visible statuses and optional label filters."
        theme={theme}
        title="Boards"
        onThemeChange={setTheme}
      />

      {boardsQuery.isError ? (
        <section className="message-panel message-panel--error">
          <h2>Boards failed to load</h2>
          <p>{boardsQuery.error instanceof Error ? boardsQuery.error.message : "Unknown error"}</p>
        </section>
      ) : null}

      {boardsQuery.isLoading ? (
        <section className="message-panel">
          <h2>Loading boards</h2>
          <p>Fetching board summaries and metadata.</p>
        </section>
      ) : null}

      {!boardsQuery.isLoading ? (
        <section className="labels-panel">
          <div className="labels-panel__header">
            <div>
              <h2>All Boards</h2>
              <p>{boards.length} boards configured.</p>
            </div>
          </div>

          {boards.length > 0 ? (
            <div className="labels-list">
              {boards.map((board) => (
                <article key={board.id} className="label-row">
                  <div className="label-row__main">
                    <strong>{board.name}</strong>
                    <span className="muted-text">
                      {board.slug}
                      {board.isSystem ? " • system board" : ""}
                    </span>
                    {board.description ? <span className="muted-text">{board.description}</span> : null}
                  </div>

                  <div className="label-row__actions">
                    <Link className="ghost-button" to={`/boards/${board.slug}`}>
                      Open
                    </Link>
                    <Link className="primary-button" to={`/boards/${board.slug}/edit`}>
                      Edit
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="message-panel">
              <h2>No boards yet</h2>
              <p>Create your first board to define a new ticket view.</p>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
