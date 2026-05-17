import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { BoardFinder } from "../features/board/BoardFinder";
import { fetchBoards } from "../features/board/api";
import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";

export function HomePage() {
  const { theme, setTheme } = useBoardTheme();
  const navigate = useNavigate();

  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
  });

  return (
    <main className="page-shell page-shell--home">
      <AppHeader
        activeNav="home"
        description="Organize your tasks, notes and thoughts"
        theme={theme}
        title="GTD"
        onThemeChange={setTheme}
      />

      <section className="home-finder-region">
        <BoardFinder
          boards={boardsQuery.data ?? []}
          error={boardsQuery.isError ? boardsQuery.error : null}
          isLoading={boardsQuery.isLoading}
          onOpenBoard={(board) => navigate(`/boards/${board.slug}`)}
          onOpenPage={(path) => navigate(path)}
        />
      </section>
    </main>
  );
}
