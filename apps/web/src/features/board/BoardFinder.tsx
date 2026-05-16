import type { Board } from "@gtd/contracts";
import { useEffect, useMemo, useRef, useState } from "react";

type BoardFinderProps = {
  boards: Board[];
  error: unknown;
  isLoading: boolean;
  onOpenBoard: (board: Board) => void;
};

function boardMatchesQuery(board: Board, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return board.name.toLowerCase().includes(normalizedQuery) || board.slug.toLowerCase().includes(normalizedQuery);
}

function scoreBoardMatch(board: Board, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  const name = board.name.toLowerCase();
  const slug = board.slug.toLowerCase();

  if (!normalizedQuery) {
    return 0;
  }

  if (name === normalizedQuery || slug === normalizedQuery) {
    return 0;
  }

  if (name.startsWith(normalizedQuery) || slug.startsWith(normalizedQuery)) {
    return 1;
  }

  return 2;
}

export function BoardFinder({ boards, isLoading, error, onOpenBoard }: BoardFinderProps) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => {
    return boards
      .filter((board) => boardMatchesQuery(board, query))
      .sort((left, right) => {
        const scoreDifference = scoreBoardMatch(left, query) - scoreBoardMatch(right, query);

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

  function openBoard(board: Board | undefined) {
    if (!board) {
      return;
    }

    onOpenBoard(board);
  }

  return (
    <section className="board-finder" aria-label="Board finder">
      <label className="board-finder__terminal">
        <span className="board-finder__prompt" aria-hidden="true">$</span>
        <input
          ref={inputRef}
          aria-activedescendant={matches[activeIndex] ? `board-finder-option-${matches[activeIndex].id}` : undefined}
          aria-autocomplete="list"
          aria-controls="board-finder-results"
          aria-expanded={matches.length > 0}
          aria-label="Find a board"
          autoCapitalize="none"
          autoComplete="off"
          className="board-finder__input"
          placeholder={isLoading ? "loading boards" : "find board"}
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
              openBoard(matches[activeIndex] ?? matches[0]);
            }
          }}
        />
      </label>

      <div className="board-finder__results" id="board-finder-results" role="listbox">
        {matches.map((board, index) => (
          <button
            key={board.id}
            className={`board-finder__option ${index === activeIndex ? "board-finder__option--active" : ""}`}
            id={`board-finder-option-${board.id}`}
            role="option"
            type="button"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => openBoard(board)}
          >
            <span>{board.name}</span>
            <small>/{board.slug}</small>
          </button>
        ))}

        {!isLoading && query.trim() && matches.length === 0 ? (
          <p className="board-finder__status">No boards match "{query}".</p>
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
