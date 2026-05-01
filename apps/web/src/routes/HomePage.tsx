import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";

import { fetchBoards } from "../features/board/api";

export function HomePage() {
  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
  });

  const defaultBoard = boardsQuery.data?.find((board) => board.isDefault) ?? boardsQuery.data?.[0] ?? null;

  if (defaultBoard) {
    return <Navigate replace to={`/boards/${defaultBoard.slug}`} />;
  }

  if (boardsQuery.isError) {
    return (
      <main className="page-shell">
        <section className="message-panel message-panel--error">
          <h2>Home failed to load</h2>
          <p>{boardsQuery.error instanceof Error ? boardsQuery.error.message : "Unknown error"}</p>
        </section>
      </main>
    );
  }

  if (boardsQuery.isLoading) {
    return (
      <main className="page-shell">
        <section className="message-panel">
          <h2>Loading home board</h2>
          <p>Resolving the current default board.</p>
        </section>
      </main>
    );
  }

  return <Navigate replace to="/boards" />;
}
