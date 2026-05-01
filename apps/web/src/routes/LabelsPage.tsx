import type {
  LabelUsage,
  UpdateLabelInput,
} from "@gtd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";
import {
  deleteLabel,
  fetchLabels,
  updateLabel,
} from "../features/board/api";

export function LabelsPage() {
  const { theme, setTheme } = useBoardTheme();
  const queryClient = useQueryClient();
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const labelsQuery = useQuery({
    queryKey: ["labels"],
    queryFn: fetchLabels,
  });

  const updateLabelMutation = useMutation({
    mutationFn: (args: { labelId: string; input: UpdateLabelInput }) => updateLabel(args.labelId, args.input),
    onSuccess: async () => {
      setEditingLabelId(null);
      setDraftName("");
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["labels"] });
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update label");
    },
  });

  const deleteLabelMutation = useMutation({
    mutationFn: (labelId: string) => deleteLabel(labelId),
    onSuccess: async () => {
      setEditingLabelId(null);
      setDraftName("");
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ["labels"] });
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete label");
    },
  });

  const data = labelsQuery.data;

  function startEditing(label: LabelUsage) {
    setEditingLabelId(label.id);
    setDraftName(label.name);
    setErrorMessage(null);
  }

  function formatLabelUsage(label: LabelUsage) {
    const activeLabel = label.activeTicketCount === 1 ? "active ticket" : "active tickets";
    return `(${label.activeTicketCount} ${activeLabel}, ${label.archivedTicketCount} archived)`;
  }

  return (
    <main className="page-shell">
      <AppHeader
        activeNav="labels"
        description="Manage the global label catalogue. Deleting a label removes it from all active tickets, archived tickets, and board filters."
        theme={theme}
        title="Labels"
        onThemeChange={setTheme}
      />

      {labelsQuery.isError ? (
        <section className="message-panel message-panel--error">
          <h2>Labels failed to load</h2>
          <p>{labelsQuery.error instanceof Error ? labelsQuery.error.message : "Unknown error"}</p>
        </section>
      ) : null}

      {data ? (
        <section className="labels-panel">
          <div className="labels-panel__header">
            <div>
              <h2>All Labels</h2>
              <p>{data.labels.length} labels stored across all boards.</p>
            </div>
          </div>

          {errorMessage ? <p className="labels-panel__error">{errorMessage}</p> : null}

          {data.labels.length > 0 ? (
            <div className="labels-list">
              {data.labels.map((label) => {
                const isEditing = editingLabelId === label.id;
                const isBusy = updateLabelMutation.isPending || deleteLabelMutation.isPending;

                return (
                  <article
                    key={label.id}
                    className="label-row"
                    data-testid={`label-row-${label.normalizedName}`}
                  >
                    <div className="label-row__main">
                      {isEditing ? (
                        <label className="field">
                          <span>Label Name</span>
                          <input
                            autoFocus
                            data-testid={`label-input-${label.id}`}
                            value={draftName}
                            onChange={(event) => setDraftName(event.target.value)}
                          />
                        </label>
                      ) : (
                        <>
                          <strong>
                            {label.name} <span className="label-row__meta">{formatLabelUsage(label)}</span>
                          </strong>
                          <span className="muted-text">{label.normalizedName}</span>
                        </>
                      )}
                    </div>

                    <div className="label-row__actions">
                      {isEditing ? (
                        <>
                          <button
                            className="ghost-button"
                            disabled={isBusy}
                            type="button"
                            onClick={() => {
                              setEditingLabelId(null);
                              setDraftName("");
                              setErrorMessage(null);
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            className="primary-button"
                            data-testid={`label-save-${label.id}`}
                            disabled={isBusy || !draftName.trim()}
                            type="button"
                            onClick={() => {
                              void updateLabelMutation.mutateAsync({
                                labelId: label.id,
                                input: {
                                  name: draftName,
                                },
                              });
                            }}
                          >
                            Save
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="ghost-button"
                            data-testid={`label-edit-${label.normalizedName}`}
                            disabled={isBusy}
                            type="button"
                            onClick={() => startEditing(label)}
                          >
                            Edit
                          </button>
                          <button
                            className="ghost-button danger-button"
                            data-testid={`label-delete-${label.normalizedName}`}
                            disabled={isBusy}
                            type="button"
                            onClick={() => {
                              setErrorMessage(null);
                              void deleteLabelMutation.mutateAsync(label.id);
                            }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="message-panel">
              <h2>No labels yet</h2>
              <p>Labels will appear here as tickets are created or boards begin filtering by them.</p>
            </div>
          )}
        </section>
      ) : (
        <section className="message-panel">
          <h2>Loading labels</h2>
          <p>Fetching the full label catalogue.</p>
        </section>
      )}
    </main>
  );
}
