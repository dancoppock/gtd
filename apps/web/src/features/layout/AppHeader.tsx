import type { ReactNode } from "react";
import { useState } from "react";
import { NavLink } from "react-router-dom";

import {
  isBoardTheme,
  themeOptions,
  type BoardTheme,
} from "../theme/themes";

type AppHeaderProps = {
  boardSlug: string;
  title: string;
  description: string;
  theme: BoardTheme;
  onThemeChange: (theme: BoardTheme) => void;
  actions?: ReactNode;
};

export function AppHeader({
  boardSlug,
  title,
  description,
  theme,
  onThemeChange,
  actions,
}: AppHeaderProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <section className={`hero-panel ${isCollapsed ? "hero-panel--collapsed" : ""}`}>
      <div className="hero-panel__header">
        <div>
          <h1>{title}</h1>
        </div>
        <button
          aria-label={isCollapsed ? "Expand header panel" : "Collapse header panel"}
          aria-expanded={!isCollapsed}
          className="hero-panel__toggle"
          data-testid="hero-toggle"
          type="button"
          onClick={() => setIsCollapsed((currentValue) => !currentValue)}
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

      {!isCollapsed ? (
        <div className="hero-panel__body">
          <div className="hero-panel__content">
            <p>{description}</p>

            <nav aria-label="Primary navigation" className="app-nav">
              <NavLink className={({ isActive }) => `app-nav__link ${isActive ? "app-nav__link--active" : ""}`} end to="/boards/default">
                Home
              </NavLink>
              <NavLink className={({ isActive }) => `app-nav__link ${isActive ? "app-nav__link--active" : ""}`} end to={`/boards/${boardSlug}`}>
                Boards
              </NavLink>
              <NavLink className={({ isActive }) => `app-nav__link ${isActive ? "app-nav__link--active" : ""}`} to={`/boards/${boardSlug}/labels`}>
                Labels
              </NavLink>
              <span aria-disabled="true" className="app-nav__placeholder">
                Insights
              </span>
            </nav>
          </div>

          <div className="hero-panel__actions">
            <label className="theme-select">
              <span>Theme</span>
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
      ) : null}
    </section>
  );
}
