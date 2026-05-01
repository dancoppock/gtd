import type { BoardDetail, CreateBoardInput, TicketStatus } from "@gtd/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createBoard,
  deleteBoard,
  fetchBoard,
  fetchLabels,
  updateBoard,
} from "../features/board/api";
import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";

type BoardFormState = CreateBoardInput;

const STATUS_OPTIONS: Array<{ value: TicketStatus; label: string }> = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

function emptyBoardFormState(): BoardFormState {
  return {
    name: "",
    description: "",
    isDefault: false,
    columns: [
      { name: "Todo", statusKey: "todo" },
      { name: "In Progress", statusKey: "in_progress" },
      { name: "Done", statusKey: "done" },
    ],
    filterLabelIds: [],
  };
}

function toBoardFormState(board: BoardDetail): BoardFormState {
  return {
    name: board.name,
    description: board.description,
    isDefault: board.isDefault,
    columns: board.columns.map((column) => ({
      name: column.name,
      statusKey: column.statusKey,
    })),
    filterLabelIds: board.filterLabels.map((label) => label.id),
  };
}

export function BoardEditPage() {
  const { boardSlug } = useParams();
  const isCreateMode = boardSlug === undefined;
  const { theme, setTheme } = useBoardTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<BoardFormState>(emptyBoardFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const boardQuery = useQuery({
    enabled: !isCreateMode,
    queryKey: ["board-detail", boardSlug],
    queryFn: () => fetchBoard(boardSlug ?? "default"),
  });

  const labelsQuery = useQuery({
    queryKey: ["labels"],
    queryFn: fetchLabels,
  });

  useEffect(() => {
    if (boardQuery.data) {
      setFormState(toBoardFormState(boardQuery.data));
    }
  }, [boardQuery.data]);

  const createBoardMutation = useMutation({
    mutationFn: createBoard,
    onSuccess: async (board) => {
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      navigate(`/boards/${board.slug}`);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create board");
    },
  });

  const updateBoardMutation = useMutation({
    mutationFn: (args: { boardId: string; input: CreateBoardInput }) => updateBoard(args.boardId, args.input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      await queryClient.invalidateQueries({ queryKey: ["board-detail", boardSlug] });
      navigate("/boards");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update board");
    },
  });

  const deleteBoardMutation = useMutation({
    mutationFn: deleteBoard,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      navigate("/boards");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to delete board");
    },
  });

  const isBusy = createBoardMutation.isPending || updateBoardMutation.isPending || deleteBoardMutation.isPending;
  const labels = labelsQuery.data?.labels ?? [];
  const duplicateStatuses = useMemo(
    () => new Set(formState.columns.map((column) => column.statusKey)).size !== formState.columns.length,
    [formState.columns],
  );

  const canSubmit = formState.name.trim() && formState.columns.length > 0 && !duplicateStatuses;

  return (
    <main className="page-shell">
      <AppHeader
        activeNav="boards"
        description={isCreateMode
          ? "Create a new board by choosing which statuses to expose as columns and optionally filtering to a subset of labels."
          : "Update board metadata, visible columns, and the board-level label filter."}
        theme={theme}
        title={isCreateMode ? "Create Board" : `Edit ${boardQuery.data?.name ?? "Board"}`}
        onThemeChange={setTheme}
      />

      {boardQuery.isError ? (
        <section className="message-panel message-panel--error">
          <h2>Board failed to load</h2>
          <p>{boardQuery.error instanceof Error ? boardQuery.error.message : "Unknown error"}</p>
        </section>
      ) : null}

      {!isCreateMode && boardQuery.isLoading ? (
        <section className="message-panel">
          <h2>Loading board</h2>
          <p>Fetching board configuration.</p>
        </section>
      ) : null}

      {(isCreateMode || boardQuery.data) ? (
        <section className="labels-panel">
          <div className="labels-panel__header">
            <div>
              <h2>{isCreateMode ? "New Board" : "Board Settings"}</h2>
              <p>Boards reuse the shared ticket pool and can filter by one or more labels.</p>
            </div>
          </div>

          {errorMessage ? <p className="labels-panel__error">{errorMessage}</p> : null}
          {duplicateStatuses ? (
            <p className="labels-panel__error">Each column must map to a different status.</p>
          ) : null}

          <form
            className="modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              setErrorMessage(null);

              const payload: CreateBoardInput = {
                name: formState.name.trim(),
                description: formState.description.trim(),
                isDefault: formState.isDefault,
                columns: formState.columns.map((column) => ({
                  name: column.name.trim(),
                  statusKey: column.statusKey,
                })),
                filterLabelIds: formState.filterLabelIds,
              };

              if (isCreateMode) {
                void createBoardMutation.mutateAsync(payload);
                return;
              }

              const boardId = boardQuery.data?.id;
              if (!boardId) {
                return;
              }

              void updateBoardMutation.mutateAsync({
                boardId,
                input: payload,
              });
            }}
          >
            <label className="field">
              <span>Name</span>
              <input
                autoFocus
                data-testid="board-name-input"
                value={formState.name}
                onChange={(event) =>
                  setFormState((currentValue) => ({
                    ...currentValue,
                    name: event.target.value,
                  }))
                }
              />
            </label>

            <label className="field">
              <span>Description</span>
              <textarea
                data-testid="board-description-input"
                rows={4}
                value={formState.description}
                onChange={(event) =>
                  setFormState((currentValue) => ({
                    ...currentValue,
                    description: event.target.value,
                  }))
                }
              />
            </label>

            <label className="chip-toggle">
              <input
                checked={formState.isDefault}
                type="checkbox"
                onChange={(event) =>
                  setFormState((currentValue) => ({
                    ...currentValue,
                    isDefault: event.target.checked,
                  }))
                }
              />
              <span>Make this the default board</span>
            </label>

            <div className="filter-group">
              <span className="filter-group__title">Columns</span>
              <div className="labels-list">
                {formState.columns.map((column, index) => (
                  <article key={`${column.statusKey}-${index}`} className="label-row">
                    <div className="label-row__main">
                      <label className="field">
                        <span>Column Name</span>
                        <input
                          value={column.name}
                          onChange={(event) =>
                            setFormState((currentValue) => ({
                              ...currentValue,
                              columns: currentValue.columns.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? {
                                      ...candidate,
                                      name: event.target.value,
                                    }
                                  : candidate,
                              ),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className="label-row__actions">
                      <label className="field">
                        <span>Status</span>
                        <select
                          value={column.statusKey}
                          onChange={(event) =>
                            setFormState((currentValue) => ({
                              ...currentValue,
                              columns: currentValue.columns.map((candidate, candidateIndex) =>
                                candidateIndex === index
                                  ? {
                                      ...candidate,
                                      statusKey: event.target.value as TicketStatus,
                                    }
                                  : candidate,
                              ),
                            }))
                          }
                        >
                          {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <button
                        className="ghost-button danger-button"
                        disabled={formState.columns.length <= 1}
                        type="button"
                        onClick={() =>
                          setFormState((currentValue) => ({
                            ...currentValue,
                            columns: currentValue.columns.filter((_, candidateIndex) => candidateIndex !== index),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              <button
                className="ghost-button"
                type="button"
                onClick={() =>
                  setFormState((currentValue) => ({
                    ...currentValue,
                    columns: [
                      ...currentValue.columns,
                      {
                        name: "New Column",
                        statusKey: "todo",
                      },
                    ],
                  }))
                }
              >
                Add Column
              </button>
            </div>

            <div className="filter-group">
              <span className="filter-group__title">Board Filter</span>
              <div className="chip-list">
                {labels.length > 0 ? (
                  labels.map((label) => (
                    <label key={label.id} className="chip-toggle">
                      <input
                        checked={formState.filterLabelIds.includes(label.id)}
                        type="checkbox"
                        onChange={() =>
                          setFormState((currentValue) => ({
                            ...currentValue,
                            filterLabelIds: currentValue.filterLabelIds.includes(label.id)
                              ? currentValue.filterLabelIds.filter((candidateId) => candidateId !== label.id)
                              : [...currentValue.filterLabelIds, label.id],
                          }))
                        }
                      />
                      <span>{label.name}</span>
                    </label>
                  ))
                ) : (
                  <span className="muted-text">Create labels on tickets first, then use them as board filters.</span>
                )}
              </div>
            </div>

            <div className="modal-card__actions">
              <div className="modal-card__actions-secondary">
                {!isCreateMode && boardQuery.data && !boardQuery.data.isSystem ? (
                  <button
                    className="ghost-button danger-button"
                    disabled={isBusy}
                    type="button"
                    onClick={() => {
                      if (!boardQuery.data || !window.confirm(`Delete board "${boardQuery.data.name}"?`)) {
                        return;
                      }

                      void deleteBoardMutation.mutateAsync(boardQuery.data.id);
                    }}
                  >
                    Delete Board
                  </button>
                ) : null}
              </div>

              <div className="modal-card__actions-main">
                <Link
                  className="ghost-button"
                  to={isCreateMode ? "/boards" : `/boards/${boardSlug ?? "default"}`}
                >
                  Cancel
                </Link>
                <button className="primary-button" disabled={!canSubmit || isBusy} type="submit">
                  {isCreateMode ? "Create Board" : "Save Board"}
                </button>
              </div>
            </div>
          </form>
        </section>
      ) : null}
    </main>
  );
}
