import type { Ticket } from "@gtd/contracts";
import type { useSortable } from "@dnd-kit/sortable";
import type { KeyboardEvent, MouseEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { TicketViewMode } from "../board/TicketViewToggle";

type TicketCardTone = "default" | "done";

type TicketCardProps = {
  dragHandleProps?: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  };
  beginEditingKey?: number;
  isDragging?: boolean;
  isExpanded?: boolean;
  isSelected?: boolean;
  isTagged?: boolean;
  ticket: Ticket;
  tone?: TicketCardTone;
  onEdit: () => void;
  onTitleEditEnd?: () => void;
  onToggleExpanded?: () => void;
  onTitleUpdate?: (nextTitle: string) => Promise<void>;
  showPriorityColor?: boolean;
  viewMode?: TicketViewMode;
};

export function TicketCard({
  beginEditingKey,
  dragHandleProps,
  isDragging = false,
  isExpanded = false,
  isSelected = false,
  isTagged = false,
  ticket,
  tone = "default",
  onEdit,
  onTitleEditEnd,
  onToggleExpanded,
  onTitleUpdate,
  showPriorityColor = false,
  viewMode = "full",
}: TicketCardProps) {
  const isCompact = viewMode === "compact";
  const hasDescription = Boolean(ticket.description.trim());
  const showExpandedContent = viewMode === "full" || isExpanded;
  const canClampDescription = viewMode === "full";
  const showToggleHint = isCompact && !isExpanded && hasDescription;
  const [draftTitle, setDraftTitle] = useState(ticket.title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [isDescriptionFullyExpanded, setIsDescriptionFullyExpanded] = useState(false);
  const [isDescriptionTruncated, setIsDescriptionTruncated] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleClickTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(ticket.title);
      setTitleError(null);
    }
  }, [isEditingTitle, ticket.title]);

  useEffect(() => {
    setIsDescriptionFullyExpanded(false);
  }, [ticket.description, ticket.id, viewMode]);

  useLayoutEffect(() => {
    const descriptionElement = descriptionRef.current;
    if (!descriptionElement || !canClampDescription) {
      setIsDescriptionTruncated(false);
      return;
    }

    if (isDescriptionFullyExpanded) {
      return;
    }

    setIsDescriptionTruncated(descriptionElement.scrollHeight > descriptionElement.clientHeight + 1);
  }, [canClampDescription, isDescriptionFullyExpanded, showExpandedContent, ticket.description]);

  useEffect(() => {
    return () => {
      if (titleClickTimeoutRef.current !== null) {
        window.clearTimeout(titleClickTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (beginEditingKey !== undefined) {
      setDraftTitle(ticket.title);
      setTitleError(null);
      setIsEditingTitle(true);
    }
  }, [beginEditingKey, ticket.title]);

  useEffect(() => {
    if (!isEditingTitle) {
      return;
    }

    const titleInput = titleInputRef.current;
    titleInput?.setSelectionRange(titleInput.value.length, titleInput.value.length);
  }, [isEditingTitle]);

  function beginTitleEdit() {
    setDraftTitle(ticket.title);
    setTitleError(null);
    setIsEditingTitle(true);
  }

  function cancelTitleEdit() {
    setDraftTitle(ticket.title);
    setTitleError(null);
    setIsEditingTitle(false);
    onTitleEditEnd?.();
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
      onTitleEditEnd?.();
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
      onTitleEditEnd?.();
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
    if (isEditingTitle) {
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

    if (isCompact && onToggleExpanded) {
      onToggleExpanded();
      return;
    }

    if (canClampDescription && (isDescriptionTruncated || isDescriptionFullyExpanded)) {
      setIsDescriptionFullyExpanded((currentValue) => !currentValue);
    }
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
      data-ticket-id={ticket.id}
      data-ticket-selected={isSelected ? "true" : undefined}
      data-ticket-tagged={isTagged ? "true" : undefined}
    >
      <div
        className={`ticket-card__content ${isCompact || isDescriptionTruncated ? "ticket-card__content--toggleable" : ""} ${showPriorityColor ? `ticket-card__content--priority-color ticket-card__content--priority-${ticket.priority}` : ""}`}
        data-testid={`ticket-content-${ticket.id}`}
        onClick={handleCardClick}
      >
        <div className="ticket-card__header">
          <div className="ticket-card__heading">
            <div className="ticket-card__heading-row">
              {isEditingTitle ? (
                <div className="ticket-card__title-editor">
                  <input
                    ref={titleInputRef}
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

        {showExpandedContent && hasDescription ? (
          <>
            <p
              ref={descriptionRef}
              className={`ticket-card__description ${!canClampDescription || isDescriptionFullyExpanded ? "ticket-card__description--full" : ""}`}
              data-testid={`ticket-description-${ticket.id}`}
            >
              {ticket.description}
            </p>
            {canClampDescription && isDescriptionTruncated && !isDescriptionFullyExpanded ? (
              <span className="ticket-card__description-truncation">[...]</span>
            ) : null}
          </>
        ) : null}

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
