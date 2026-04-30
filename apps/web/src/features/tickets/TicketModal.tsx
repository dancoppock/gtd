import type { Column, Label, Ticket, TicketPriority } from "@gtd/contracts";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

type TicketModalProps = {
  mode: "create" | "edit";
  ticket: Ticket | null;
  columns: Column[];
  availableLabels: Label[];
  defaultColumnId?: string;
  onClose: () => void;
  onSubmit: (input: {
    columnId: string;
    title: string;
    description: string;
    priority: TicketPriority;
    labels: string[];
  }) => Promise<void>;
};

type TicketFormValues = {
  columnId: string;
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

export function TicketModal({
  mode,
  ticket,
  columns,
  availableLabels,
  defaultColumnId,
  onClose,
  onSubmit,
}: TicketModalProps) {
  const { formState, handleSubmit, register, reset } = useForm<TicketFormValues>({
    defaultValues: {
      columnId: defaultColumnId ?? columns[0]?.id ?? "",
      title: "",
      description: "",
      priority: "medium",
      labelsText: "",
    },
  });

  useEffect(() => {
    reset({
      columnId: ticket?.columnId ?? defaultColumnId ?? columns[0]?.id ?? "",
      title: ticket?.title ?? "",
      description: ticket?.description ?? "",
      priority: ticket?.priority ?? "medium",
      labelsText: ticket ? labelsToText(ticket.labels) : "",
    });
  }, [columns, defaultColumnId, reset, ticket]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const submitLabel = mode === "create" ? "Create Ticket" : "Save Changes";
  const title = mode === "create" ? "Create Ticket" : "Edit Ticket";

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        data-testid="ticket-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-modal-title"
        onClick={(event) => event.stopPropagation()}
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
          onSubmit={handleSubmit(async (values) => {
            await onSubmit({
              columnId: values.columnId,
              title: values.title.trim(),
              description: values.description.trim(),
              priority: values.priority,
              labels: parseLabels(values.labelsText),
            });
          })}
        >
          <label className="field">
            <span>Title</span>
            <input
              {...register("title", { required: true, maxLength: 200 })}
              autoFocus
              data-testid="ticket-modal-title-input"
              placeholder="Write concise ticket title"
            />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea
              {...register("description")}
              data-testid="ticket-modal-description-input"
              rows={5}
              placeholder="Add context, notes, or acceptance details"
            />
          </label>

          <div className="modal-form__row">
            <label className="field">
              <span>Column</span>
              <select {...register("columnId", { required: true })}>
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>
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
            {availableLabels.length > 0 ? (
              <small className="field__hint">
                Existing labels: {availableLabels.map((label) => label.name).join(", ")}
              </small>
            ) : null}
          </label>

          <div className="modal-card__actions">
            <button className="ghost-button" data-testid="ticket-modal-cancel" type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-button"
              data-testid="ticket-modal-submit"
              type="submit"
              disabled={formState.isSubmitting}
            >
              {formState.isSubmitting ? "Saving..." : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
