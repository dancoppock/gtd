import type { Ticket } from "@gtd/contracts";
import type { ButtonHTMLAttributes, KeyboardEvent } from "react";
import { useEffect, useState } from "react";

import type { TicketViewMode } from "../board/TicketViewToggle";

type TicketCardProps = {
  dragHandleProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
  ticket: Ticket;
  onEdit: () => void;
  onTitleUpdate?: (nextTitle: string) => Promise<void>;
  viewMode?: TicketViewMode;
};

export function TicketCard({
  dragHandleProps,
  isDragging = false,
  ticket,
  onEdit,
  onTitleUpdate,
  viewMode = "full",
}: TicketCardProps) {
  const isCompact = viewMode === "compact";
  const [draftTitle, setDraftTitle] = useState(ticket.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(ticket.title);
      setTitleError(null);
    }
  }, [isEditingTitle, ticket.title]);

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

  return (
    <article
      className={`ticket-card ${isDragging ? "ticket-card--dragging" : ""} ${isCompact ? "ticket-card--compact" : ""}`}
      data-testid={`ticket-${ticket.id}`}
    >
      <div className="ticket-card__header">
        <button
          aria-label={`Drag ${ticket.title}`}
          className="ticket-card__drag-handle"
          data-testid={`ticket-drag-${ticket.id}`}
          type="button"
          {...dragHandleProps}
        >
          <svg aria-hidden="true" viewBox="0 0 20 20">
            <circle cx="6" cy="5" r="1.4" />
            <circle cx="6" cy="10" r="1.4" />
            <circle cx="6" cy="15" r="1.4" />
            <circle cx="14" cy="5" r="1.4" />
            <circle cx="14" cy="10" r="1.4" />
            <circle cx="14" cy="15" r="1.4" />
          </svg>
        </button>
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
              <h3>
                <button
                  aria-label={`Title ${ticket.title}. Double click to edit`}
                  className="ticket-card__title-button"
                  data-testid={`ticket-title-${ticket.id}`}
                  type="button"
                  onDoubleClick={beginTitleEdit}
                >
                  {ticket.title}
                </button>
              </h3>
            )}

            <div className="ticket-card__actions">
              <button
                aria-label={`Edit ${ticket.title}`}
                className="link-button"
                data-testid={`ticket-edit-${ticket.id}`}
                type="button"
                disabled={isEditingTitle}
                onClick={onEdit}
              >
                Edit
              </button>
            </div>
          </div>

          {titleError ? <p className="ticket-card__title-error">{titleError}</p> : null}
        </div>
      </div>

      {!isCompact ? <p>{ticket.description}</p> : null}

      {!isCompact ? (
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
    </article>
  );
}
