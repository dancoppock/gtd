import type { Board } from "@gtd/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

type BoardFinderProps = {
  boards: Board[];
  error: unknown;
  isLoading: boolean;
  onOpenBoard: (board: Board) => void;
  onOpenPage: (path: string) => void;
};

type PageShortcut = {
  id: string;
  name: string;
  path: string;
};

type FinderItem =
  | {
      type: "board";
      board: Board;
      id: string;
      name: string;
      path: string;
    }
  | {
      type: "page";
      page: PageShortcut;
      id: string;
      name: string;
      path: string;
    };

const pageShortcuts: PageShortcut[] = [
  { id: "home", name: "Home", path: "/" },
  { id: "boards", name: "Boards", path: "/boards" },
  { id: "labels", name: "Labels", path: "/labels" },
  { id: "insights", name: "Insights", path: "/insights" },
  { id: "help", name: "Help", path: "/help" },
];

function itemMatchesQuery(item: FinderItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return item.name.toLowerCase().includes(normalizedQuery) || item.path.toLowerCase().includes(normalizedQuery);
}

function scoreItemMatch(item: FinderItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const name = item.name.toLowerCase();
  const path = item.path.toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  if (name === normalizedQuery || path === normalizedQuery) {
    return 0;
  }

  if (name.startsWith(normalizedQuery) || path.startsWith(normalizedQuery)) {
    return 1;
  }

  return 2;
}

function toBoardItem(board: Board): FinderItem {
  return {
    type: "board",
    board,
    id: board.id,
    name: board.name,
    path: `/${board.slug}`,
  };
}

function toPageItem(page: PageShortcut): FinderItem {
  return {
    type: "page",
    page,
    id: page.id,
    name: page.name,
    path: page.path,
  };
}

function getOptionId(item: FinderItem) {
  return `board-finder-option-${item.type}-${item.id}`;
}

export function BoardFinder({ boards, isLoading, error, onOpenBoard, onOpenPage }: BoardFinderProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    const items = [...boards.map(toBoardItem), ...pageShortcuts.map(toPageItem)];

    return items
      .filter((item) => itemMatchesQuery(item, query))
      .sort((left, right) => {
        const scoreDifference = scoreItemMatch(left, query) - scoreItemMatch(right, query);

        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        return left.name.localeCompare(right.name);
      })
      .slice(0, 8);
  }, [boards, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleFinderFocus() {
      inputRef.current?.focus();
    }

    document.addEventListener("board-finder:focus", handleFinderFocus);
    return () => document.removeEventListener("board-finder:focus", handleFinderFocus);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex > Math.max(matches.length - 1, 0)) {
      setActiveIndex(0);
    }
  }, [activeIndex, matches.length]);

  function openItem(item: FinderItem | undefined) {
    if (!item) {
      return;
    }

    if (item.type === "board") {
      onOpenBoard(item.board);
      return;
    }

    onOpenPage(item.page.path);
  }

  return (
    <section className="board-finder" aria-label="Board finder">
      <label className="board-finder__terminal">
        <span className="board-finder__prompt" aria-hidden="true">$</span>
        <input
          ref={inputRef}
          aria-activedescendant={matches[activeIndex] ? getOptionId(matches[activeIndex]) : undefined}
          aria-autocomplete="list"
          aria-controls="board-finder-results"
          aria-expanded={matches.length > 0}
          aria-label="Find a board"
          autoCapitalize="none"
          autoComplete="off"
          className="board-finder__input"
          placeholder={isLoading ? "loading boards" : "find board or page"}
          role="combobox"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((currentIndex) => (matches.length > 0 ? (currentIndex + 1) % matches.length : 0));
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((currentIndex) => (
                matches.length > 0 ? (currentIndex - 1 + matches.length) % matches.length : 0
              ));
              return;
            }

            if (event.key === "Enter") {
              event.preventDefault();
              openItem(matches[activeIndex] ?? matches[0]);
            }
          }}
        />
      </label>

      <div className="board-finder__results" id="board-finder-results" role="listbox">
        {matches.map((item, index) => (
          <button
            key={`${item.type}:${item.id}`}
            className={`board-finder__option ${index === activeIndex ? "board-finder__option--active" : ""}`}
            id={getOptionId(item)}
            role="option"
            type="button"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openItem(item)}
          >
            <span className="board-finder__option-main">
              <span className="board-finder__option-label">{item.type === "board" ? "BOARD" : "PAGE"}</span>
              <span>{item.name}</span>
            </span>
            <small>{item.path}</small>
          </button>
        ))}

        {!isLoading && query.trim() && matches.length === 0 ? (
          <p className="board-finder__status">No boards or pages match "{query}".</p>
        ) : null}

        {error ? (
          <p className="board-finder__status board-finder__status--error">
            {error instanceof Error ? error.message : "Boards failed to load."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
