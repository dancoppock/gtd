import type { Column, Label, Ticket, TicketPriority } from "@gtd/contracts";
import type { KeyboardEvent } from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import { extractHashtagLabels, stripHashtagsFromTitle } from "./titleTags";

type TicketModalProps = {
  mode: "create" | "edit";
  ticket: Ticket | null;
  columns: Column[];
  availableLabels: Label[];
  boardFilterLabels?: Label[];
  implicitLabels?: Label[];
  defaultStatusKey?: Ticket["statusKey"];
  onClose: () => void;
  onDelete?: () => Promise<void>;
  onSubmit: (input: {
    statusKey: Ticket["statusKey"];
    title: string;
    description: string;
    priority: TicketPriority;
    labels: string[];
  }) => Promise<void>;
};

type TicketFormValues = {
  statusKey: Ticket["statusKey"];
  title: string;
  description: string;
  priority: TicketPriority;
  labelsText: string;
};

const PRIORITIES: TicketPriority[] = ["highest", "high", "medium", "low"];

function labelsToText(labels: Label[]) {
  return labels.map((label) => label.name).join(", ");
}

function parseLabels(labelsText: string) {
  return Array.from(
    new Set(
      labelsText
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeLabelName(label: string) {
  return label.trim().toLowerCase();
}

export function TicketModal({
  mode,
  ticket,
  columns,
  availableLabels,
  boardFilterLabels = [],
  implicitLabels = [],
  defaultStatusKey,
  onClose,
  onDelete,
  onSubmit,
}: TicketModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { formState, handleSubmit, register, reset } = useForm<TicketFormValues>({
    defaultValues: {
      statusKey: defaultStatusKey ?? columns[0]?.statusKey ?? "todo",
      title: "",
      description: "",
      priority: "medium",
      labelsText: "",
    },
  });

  useEffect(() => {
    reset({
      statusKey: ticket?.statusKey ?? defaultStatusKey ?? columns[0]?.statusKey ?? "todo",
      title: ticket?.title ?? "",
      description: ticket?.description ?? "",
      priority: ticket?.priority ?? "medium",
      labelsText: ticket ? labelsToText(ticket.labels) : "",
    });
  }, [columns, defaultStatusKey, reset, ticket]);

  const submitLabel = mode === "create" ? "Create Ticket" : "Save Changes";
  const title = mode === "create" ? "Create Ticket" : "Edit Ticket";
  const isBusy = formState.isSubmitting || isDeleting;

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  const implicitLabelNames = implicitLabels.map((label) => label.name);
  const handleFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    const target = event.target;

    if (
      mode === "edit" &&
      event.key === "Escape" &&
      target instanceof HTMLInputElement &&
      target.name === "title"
    ) {
      onClose();
      return;
    }

    const isCommandEnter =
      event.metaKey
      && (event.key === "Enter" || event.key === "NumpadEnter" || event.code === "NumpadEnter");

    if (
      isCommandEnter
      && target instanceof HTMLElement
      && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
    ) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-card"
        data-testid="ticket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-modal-title"
      >
        <div className="modal-card__header">
          <div>
            <h2 id="ticket-modal-title">{title}</h2>
            <p>Tickets default to medium priority and can carry multiple labels.</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form
          className="modal-form"
          onKeyDown={handleFormKeyDown}
          onSubmit={handleSubmit(async (values) => {
            const hashtagLabels = extractHashtagLabels(values.title);
            const explicitLabels = Array.from(
              new Set([...parseLabels(values.labelsText), ...hashtagLabels]),
            );
            const boardFilterLabelNames = new Set(
              boardFilterLabels.map((label) => label.normalizedName),
            );
            const hasExplicitBoardFilterLabel =
              boardFilterLabelNames.size > 0
              && explicitLabels
                .map(normalizeLabelName)
                .some((labelName) => boardFilterLabelNames.has(labelName));

            await onSubmit({
              statusKey: values.statusKey,
              title: stripHashtagsFromTitle(values.title),
              description: values.description.trim(),
              priority: values.priority,
              labels: Array.from(
                new Set([
                  ...explicitLabels,
                  ...(hasExplicitBoardFilterLabel ? [] : implicitLabelNames),
                ]),
              ),
            });
          })}
        >
          <label className="field">
            <span>Title</span>
            <input
              {...register("title", { required: true, maxLength: 200 })}
              autoFocus
              data-testid="ticket-modal-title-input"
              placeholder="Write concise ticket title, e.g. Test task #backend"
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              {...register("description")}
              data-testid="ticket-modal-description-input"
              rows={10}
              placeholder="Add context, notes, or acceptance details"
            />
          </label>

          <div className="modal-form__row">
            <label className="field">
              <span>Column</span>
              <select {...register("statusKey", { required: true })}>
                {columns.map((column) => (
                  <option key={column.id} value={column.statusKey}>
                    {column.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Priority</span>
              <select {...register("priority", { required: true })}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="field">
            <span>Labels</span>
            <input
              {...register("labelsText")}
              data-testid="ticket-modal-labels-input"
              placeholder="frontend, backend, product"
            />
            {mode === "create" && implicitLabels.length > 0 ? (
              <small className="field__hint" data-testid="ticket-modal-implicit-labels">
                Board default label added automatically: {implicitLabelNames.join(", ")}
              </small>
            ) : null}
            {availableLabels.length > 0 ? (
              <small className="field__hint">
                Existing labels: {availableLabels.map((label) => label.name).join(", ")}
              </small>
            ) : null}
          </label>

          <div className="modal-card__actions">
            <div className="modal-card__actions-secondary">
              {mode === "edit" && onDelete ? (
                <button
                  aria-label="Delete ticket"
                  className="danger-icon-button"
                  data-testid="ticket-modal-delete"
                  disabled={isBusy}
                  title="Delete ticket"
                  type="button"
                  onClick={async () => {
                    setIsDeleting(true);

                    try {
                      await onDelete();
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                >
                  <svg aria-hidden="true" viewBox="0 0 20 20">
                    <path d="M7.5 3.75A1.25 1.25 0 0 1 8.75 2.5h2.5A1.25 1.25 0 0 1 12.5 3.75v.5h2.75a.75.75 0 0 1 0 1.5h-.53l-.56 8.13A2 2 0 0 1 12.17 15.75H7.83a2 2 0 0 1-1.99-1.87l-.56-8.13h-.53a.75.75 0 0 1 0-1.5H7.5v-.5Zm1.5.5h2v-.25h-2v.25Zm-1.78 1.5.55 8.03a.5.5 0 0 0 .5.47h4.46a.5.5 0 0 0 .5-.47l.55-8.03H7.22Zm1.53 1.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Zm2.5 0a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5a.75.75 0 0 1 .75-.75Z" />
                  </svg>
                </button>
              ) : null}
            </div>

            <div className="modal-card__actions-main">
              <button className="ghost-button" data-testid="ticket-modal-cancel" disabled={isBusy} type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                className="primary-button"
                data-testid="ticket-modal-submit"
                type="submit"
                disabled={isBusy}
              >
                {formState.isSubmitting ? "Saving..." : submitLabel}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
