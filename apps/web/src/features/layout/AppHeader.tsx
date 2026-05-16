import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

import { fetchBoards } from "../board/api";
import {
  isBoardTheme,
  themeOptions,
  type BoardTheme,
} from "../theme/themes";

type AppHeaderProps = {
  activeNav: "home" | "boards" | "labels" | "insights" | "help";
  title: string;
  description: string;
  theme: BoardTheme;
  onThemeChange: (theme: BoardTheme) => void;
  actions?: ReactNode;
  isCollapsed?: boolean;
  onCollapsedChange?: (isCollapsed: boolean) => void;
};

function navClass(activeNav: AppHeaderProps["activeNav"], target: AppHeaderProps["activeNav"]) {
  return `app-nav__link ${activeNav === target ? "app-nav__link--active" : ""}`;
}

export function AppHeader({
  activeNav,
  title,
  description,
  theme,
  onThemeChange,
  actions,
  isCollapsed: controlledIsCollapsed,
  onCollapsedChange,
}: AppHeaderProps) {
  const [uncontrolledIsCollapsed, setUncontrolledIsCollapsed] = useState(false);
  const location = useLocation();
  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
  });
  const pinnedBoards = (boardsQuery.data ?? []).filter((board) => board.isPinned);
  const isCollapsed = controlledIsCollapsed ?? uncontrolledIsCollapsed;

  function setHeaderCollapsed(nextValue: boolean) {
    setUncontrolledIsCollapsed(nextValue);
    onCollapsedChange?.(nextValue);
  }

  if (isCollapsed) {
    return (
      <button
        aria-label="Expand header panel"
        aria-expanded={false}
        className="hero-panel__toggle hero-panel__toggle--floating"
        data-testid="hero-toggle"
        type="button"
        onClick={() => setHeaderCollapsed(false)}
      >
        <svg
          aria-hidden="true"
          className="hero-panel__toggle-icon hero-panel__toggle-icon--collapsed"
          viewBox="0 0 20 20"
        >
          <path d="M5.22 12.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.56l-3.72 3.72a.75.75 0 0 1-1.06 0Z" />
        </svg>
      </button>
    );
  }

  return (
    <section className="hero-panel">
      <div className="hero-panel__header">
        <div className="hero-panel__title-row">
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button
          aria-label={isCollapsed ? "Expand header panel" : "Collapse header panel"}
          aria-expanded={!isCollapsed}
          className="hero-panel__toggle"
          data-testid="hero-toggle"
          type="button"
          onClick={() => setHeaderCollapsed(true)}
        >
          <svg
            aria-hidden="true"
            className={isCollapsed ? "hero-panel__toggle-icon hero-panel__toggle-icon--collapsed" : "hero-panel__toggle-icon"}
            viewBox="0 0 20 20"
          >
            <path d="M5.22 12.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 1 1-1.06 1.06L10 8.56l-3.72 3.72a.75.75 0 0 1-1.06 0Z" />
          </svg>
        </button>
      </div>

      <div className="hero-panel__body">
        <div className="hero-panel__content">
          <nav aria-label="Primary navigation" className="app-nav">
            <Link className={navClass(activeNav, "home")} to="/">
              Home
            </Link>
            <Link className={navClass(activeNav, "boards")} to="/boards">
              Boards
            </Link>
            <Link className={navClass(activeNav, "labels")} to="/labels">
              Labels
            </Link>
            <Link className={navClass(activeNav, "insights")} to="/insights">
              Insights
            </Link>
            <Link className={navClass(activeNav, "help")} to="/help">
              Help
            </Link>
          </nav>

          {pinnedBoards.length > 0 ? (
            <nav aria-label="Pinned boards" className="pinned-boards-nav">
              {pinnedBoards.map((board) => {
                const boardPath = `/boards/${board.slug}`;
                const isActiveBoard = location.pathname === boardPath
                  || location.pathname.startsWith(`${boardPath}/`);

                return (
                  <Link
                    key={board.id}
                    className={`pinned-boards-nav__link ${isActiveBoard ? "pinned-boards-nav__link--active" : ""}`}
                    to={boardPath}
                  >
                    {board.name}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>

        <div className="hero-panel__actions">
          <label className="theme-select">
            <select
              aria-label="Theme"
              data-testid="theme-select"
              value={theme}
              onChange={(event) => {
                const nextTheme = event.target.value;

                if (isBoardTheme(nextTheme)) {
                  onThemeChange(nextTheme);
                }
              }}
            >
              {themeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {actions}
        </div>
      </div>
    </section>
  );
}
