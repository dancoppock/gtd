import type { Ticket } from "@gtd/contracts";
import type { useSortable } from "@dnd-kit/sortable";
import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useRef, useState } from "react";

import type { TicketViewMode } from "../board/TicketViewToggle";

type TicketCardTone = "default" | "done";

type TicketCardProps = {
  dragHandleProps?: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  };
  isDragging?: boolean;
  isExpanded?: boolean;
  ticket: Ticket;
  tone?: TicketCardTone;
  onEdit: () => void;
  onToggleExpanded?: () => void;
  onTitleUpdate?: (nextTitle: string) => Promise<void>;
  viewMode?: TicketViewMode;
};

export function TicketCard({
  dragHandleProps,
  isDragging = false,
  isExpanded = false,
  ticket,
  tone = "default",
  onEdit,
  onToggleExpanded,
  onTitleUpdate,
  viewMode = "full",
}: TicketCardProps) {
  const isCompact = viewMode === "compact";
  const hasDescription = Boolean(ticket.description.trim());
  const showExpandedContent = viewMode === "full" || isExpanded;
  const showToggleHint = isCompact && !isExpanded && hasDescription;
  const [draftTitle, setDraftTitle] = useState(ticket.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleClickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(ticket.title);
      setTitleError(null);
    }
  }, [isEditingTitle, ticket.title]);

  useEffect(() => {
    return () => {
      if (titleClickTimeoutRef.current !== null) {
        window.clearTimeout(titleClickTimeoutRef.current);
      }
    };
  }, []);

  function beginTitleEdit() {
    setDraftTitle(ticket.title);
    setTitleError(null);
    setIsEditingTitle(true);
  }

  function cancelTitleEdit() {
    setDraftTitle(ticket.title);
    setTitleError(null);
    setIsEditingTitle(false);
  }

  async function commitTitleEdit() {
    const trimmedTitle = draftTitle.trim();

    if (!trimmedTitle) {
      cancelTitleEdit();
      return;
    }

    if (trimmedTitle === ticket.title) {
      setIsEditingTitle(false);
      setTitleError(null);
      return;
    }

    if (!onTitleUpdate || isSavingTitle) {
      return;
    }

    setIsSavingTitle(true);
    setTitleError(null);

    try {
      await onTitleUpdate(trimmedTitle);
      setIsEditingTitle(false);
    } catch (error) {
      setTitleError(error instanceof Error ? error.message : "Title update failed");
    } finally {
      setIsSavingTitle(false);
    }
  }

  function handleTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitTitleEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      cancelTitleEdit();
    }
  }

  function handleCardClick(event: MouseEvent<HTMLDivElement>) {
    if (!isCompact || !onToggleExpanded || isEditingTitle) {
      return;
    }

    const selection = window.getSelection()?.toString().trim();
    if (selection) {
      return;
    }

    const target = event.target;
    if (target instanceof Element) {
      const interactiveTarget = target.closest(
        "button, input, textarea, select, a, [data-no-card-toggle='true']",
      );

      if (interactiveTarget) {
        return;
      }
    }

    onToggleExpanded();
  }

  function handleTitleClick(event: MouseEvent<HTMLHeadingElement>) {
    if (!isCompact || !onToggleExpanded || isEditingTitle) {
      return;
    }

    event.stopPropagation();

    if (titleClickTimeoutRef.current !== null) {
      window.clearTimeout(titleClickTimeoutRef.current);
    }

    titleClickTimeoutRef.current = window.setTimeout(() => {
      const selection = window.getSelection()?.toString().trim();
      if (selection) {
        return;
      }

      onToggleExpanded();
      titleClickTimeoutRef.current = null;
    }, 220);
  }

  function handleTitleDoubleClick(event: MouseEvent<HTMLHeadingElement>) {
    event.stopPropagation();

    if (titleClickTimeoutRef.current !== null) {
      window.clearTimeout(titleClickTimeoutRef.current);
      titleClickTimeoutRef.current = null;
    }

    beginTitleEdit();
  }

  return (
    <article
      className={`ticket-card ${dragHandleProps ? "ticket-card--with-drag-rail" : ""} ${isDragging ? "ticket-card--dragging" : ""} ${isCompact ? "ticket-card--compact" : ""} ${showExpandedContent ? "ticket-card--expanded" : ""} ${tone === "done" ? "ticket-card--done" : ""}`}
      data-testid={`ticket-${ticket.id}`}
    >
      <div
        className={`ticket-card__content ${isCompact ? "ticket-card__content--toggleable" : ""}`}
        data-testid={`ticket-content-${ticket.id}`}
        onClick={handleCardClick}
      >
        <div className="ticket-card__header">
          <div className="ticket-card__heading">
            <div className="ticket-card__heading-row">
              {isEditingTitle ? (
                <div className="ticket-card__title-editor">
                  <input
                    aria-label={`Edit title for ${ticket.title}`}
                    className="ticket-card__title-input"
                    data-testid={`ticket-title-input-${ticket.id}`}
                    disabled={isSavingTitle}
                    maxLength={200}
                    value={draftTitle}
                    onBlur={() => {
                      void commitTitleEdit();
                    }}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    autoFocus
                  />
                </div>
              ) : (
                <h3
                  className="ticket-card__title"
                  data-testid={`ticket-title-${ticket.id}`}
                  title="Double click to edit"
                  onClick={handleTitleClick}
                  onDoubleClick={handleTitleDoubleClick}
                >
                  <span className="ticket-card__title-text">{ticket.title}</span>
                  {showToggleHint ? <span className="ticket-card__toggle-hint">[...]</span> : null}
                </h3>
              )}
            </div>

            {titleError ? <p className="ticket-card__title-error">{titleError}</p> : null}
          </div>
        </div>

        {showExpandedContent && hasDescription ? <p>{ticket.description}</p> : null}

        {showExpandedContent ? (
          <div className="ticket-card__footer">
            <span className={`priority-badge priority-badge--${ticket.priority}`}>
              {ticket.priority}
            </span>

            {ticket.labels.length > 0 ? (
              <div className="ticket-card__labels">
                {ticket.labels.map((label) => (
                  <span key={label.id} className="ticket-label">
                    {label.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {dragHandleProps ? (
        <div
          className="ticket-card__rail"
          data-no-card-toggle="true"
          {...dragHandleProps.attributes}
          {...dragHandleProps.listeners}
        >
          <button
            aria-label={`Edit ${ticket.title}`}
            className="ticket-card__edit-icon"
            data-testid={`ticket-edit-${ticket.id}`}
            type="button"
            disabled={isEditingTitle}
            onClick={onEdit}
          >
            <svg aria-hidden="true" viewBox="0 0 20 20">
              <path d="M14.69 2.86a1.5 1.5 0 0 1 2.12 0l.33.33a1.5 1.5 0 0 1 0 2.12l-8.6 8.6a2 2 0 0 1-.83.49l-2.55.73a.75.75 0 0 1-.93-.93l.73-2.55a2 2 0 0 1 .49-.83l8.6-8.6ZM6.17 11.86l-.39 1.36 1.36-.39 8.23-8.23-.97-.97-8.23 8.23Z" />
            </svg>
          </button>
        </div>
      ) : null}
    </article>
  );
}
