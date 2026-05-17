import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";

import { BoardFinder } from "../features/board/BoardFinder";
import { fetchBoards } from "../features/board/api";
import { router } from "../routes/router";

const queryClient = new QueryClient();

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function BoardFinderOverlay({ onClose }: { onClose: () => void }) {
  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="board-finder-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        aria-label="Board finder"
        aria-modal="true"
        className="board-finder-overlay__panel"
        role="dialog"
      >
        <BoardFinder
          boards={boardsQuery.data ?? []}
          error={boardsQuery.isError ? boardsQuery.error : null}
          isLoading={boardsQuery.isLoading}
          onOpenBoard={(board) => {
            onClose();
            void router.navigate(`/boards/${board.slug}`);
          }}
          onOpenPage={(path) => {
            onClose();
            void router.navigate(path);
          }}
        />
      </div>
    </div>
  );
}

function AppContent() {
  const [isFinderOverlayOpen, setFinderOverlayOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) {
        return;
      }

      event.preventDefault();
      if (window.location.pathname === "/") {
        document.dispatchEvent(new Event("board-finder:focus"));
        return;
      }

      setFinderOverlayOpen(true);
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isFinderOverlayOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFinderOverlayOpen]);

  return (
    <>
      <RouterProvider router={router} />
      {isFinderOverlayOpen ? <BoardFinderOverlay onClose={() => setFinderOverlayOpen(false)} /> : null}
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
