import type { BoardDetail, CreateBoardInput, Status, UpdateBoardInput } from "@gtd/contracts";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { CSS } from "@dnd-kit/utilities";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  createBoard,
  createStatus,
  deleteBoard,
  fetchBoard,
  fetchLabels,
  fetchStatuses,
  updateBoard,
} from "../features/board/api";
import { AppHeader } from "../features/layout/AppHeader";
import { useBoardTheme } from "../features/theme/useBoardTheme";

type BoardColumnFormState = {
  rowId: string;
  name: string;
  statusKey: string;
};

type BoardFormState = {
  name: string;
  description: string;
  isDefault: boolean;
  isPinned: boolean;
  showPriorityColors: boolean;
  columns: BoardColumnFormState[];
  filterLabelIds: string[];
};

type CreateStatusModalProps = {
  errorMessage?: string | null;
  isBusy: boolean;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
};

type SortableBoardColumnRowProps = {
  availableStatuses: Status[];
  canRemove: boolean;
  column: BoardColumnFormState;
  index: number;
  onColumnNameChange: (index: number, value: string) => void;
  onRemove: (index: number) => void;
  onStatusChange: (index: number, value: string, rowId: string) => void;
};

const NEW_STATUS_VALUE = "__new_status__";

function createClientId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(8, "0")).join("");
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function createRowId() {
  return `board-column-${createClientId()}`;
}

function uniqueStatuses(statuses: Status[]) {
  const seen = new Set<string>();

  return statuses.filter((status) => {
    if (seen.has(status.key)) {
      return false;
    }

    seen.add(status.key);
    return true;
  });
}

function defaultColumn(statusKey: string, name: string): BoardColumnFormState {
  return {
    rowId: createRowId(),
    name,
    statusKey,
  };
}

function emptyBoardFormState(): BoardFormState {
  return {
    name: "",
    description: "",
    isDefault: false,
    isPinned: false,
    showPriorityColors: true,
    columns: [
      defaultColumn("todo", "Todo"),
      defaultColumn("in_progress", "In Progress"),
      defaultColumn("done", "Done"),
    ],
    filterLabelIds: [],
  };
}

function toBoardFormState(board: BoardDetail): BoardFormState {
  return {
    name: board.name,
    description: board.description,
    isDefault: board.isDefault,
    isPinned: board.isPinned,
    showPriorityColors: board.showPriorityColors,
    columns: board.columns.map((column) => ({
      rowId: createRowId(),
      name: column.name,
      statusKey: column.statusKey,
    })),
    filterLabelIds: board.filterLabels.map((label) => label.id),
  };
}

function CreateStatusModal({
  errorMessage,
  isBusy,
  value,
  onChange,
  onClose,
  onSubmit,
}: CreateStatusModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-status-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-card__header">
          <div>
            <h2 id="create-status-title">Create Status</h2>
            <p>Create the status now so it is immediately available to this board.</p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <form
          className="modal-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <label className="field">
            <span>Status Name</span>
            <input
              autoFocus
              data-testid="status-modal-name-input"
              placeholder="Blocked"
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          </label>

          {errorMessage ? <p className="labels-panel__error">{errorMessage}</p> : null}

          <div className="modal-card__actions">
            <div className="modal-card__actions-secondary" />
            <div className="modal-card__actions-main">
              <button className="ghost-button" disabled={isBusy} type="button" onClick={onClose}>
                Cancel
              </button>
              <button
                className="primary-button"
                data-testid="status-modal-submit"
                disabled={isBusy || !value.trim()}
                type="submit"
              >
                {isBusy ? "Creating..." : "Create Status"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function SortableBoardColumnRow({
  availableStatuses,
  canRemove,
  column,
  index,
  onColumnNameChange,
  onRemove,
  onStatusChange,
}: SortableBoardColumnRowProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: column.rowId,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <article
      ref={setNodeRef}
      className={`label-row board-edit__column-row ${isDragging ? "board-edit__column-row--dragging" : ""}`}
      style={style}
    >
      <button
        aria-label={`Reorder column ${column.name}`}
        className="board-edit__drag-handle"
        type="button"
        {...attributes}
        {...listeners}
      >
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M7 5.25A1.25 1.25 0 1 1 5.75 4 1.25 1.25 0 0 1 7 5.25Zm0 4.75A1.25 1.25 0 1 1 5.75 8.75 1.25 1.25 0 0 1 7 10Zm0 4.75A1.25 1.25 0 1 1 5.75 13.5 1.25 1.25 0 0 1 7 14.75Zm7.25-9.5A1.25 1.25 0 1 1 13 4a1.25 1.25 0 0 1 1.25 1.25Zm0 4.75A1.25 1.25 0 1 1 13 8.75 1.25 1.25 0 0 1 14.25 10Zm0 4.75A1.25 1.25 0 1 1 13 13.5a1.25 1.25 0 0 1 1.25 1.25Z" />
        </svg>
      </button>

      <div className="label-row__main">
        <label className="field">
          <span>Column Name</span>
          <input
            value={column.name}
            onChange={(event) => onColumnNameChange(index, event.target.value)}
          />
        </label>
      </div>

      <div className="label-row__actions">
        <label className="field">
          <span>Status</span>
          <select
            value={column.statusKey || ""}
            onChange={(event) => onStatusChange(index, event.target.value, column.rowId)}
          >
            <option value="">Select status...</option>
            {availableStatuses.map((status) => (
              <option key={status.key} value={status.key}>
                {status.name}
              </option>
            ))}
            <option value={NEW_STATUS_VALUE}>Create new status...</option>
          </select>
        </label>

        <div className="field board-edit__column-action">
          <span aria-hidden="true" className="board-edit__column-action-label">
            Action
          </span>
          <button
            className="ghost-button danger-button"
            disabled={!canRemove}
            type="button"
            onClick={() => onRemove(index)}
          >
            Remove
          </button>
        </div>
      </div>
    </article>
  );
}

export function BoardEditPage() {
  const { boardSlug } = useParams();
  const isCreateMode = boardSlug === undefined;
  const { theme, setTheme } = useBoardTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<BoardFormState>(emptyBoardFormState);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusModalValue, setStatusModalValue] = useState("");
  const [statusModalError, setStatusModalError] = useState<string | null>(null);
  const [statusModalRowId, setStatusModalRowId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );

  const boardQuery = useQuery({
    enabled: !isCreateMode,
    queryKey: ["board-detail", boardSlug],
    queryFn: () => fetchBoard(boardSlug ?? "default"),
  });

  const labelsQuery = useQuery({
    queryKey: ["labels"],
    queryFn: fetchLabels,
  });

  const statusesQuery = useQuery({
    queryKey: ["statuses"],
    queryFn: fetchStatuses,
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
      await queryClient.invalidateQueries({ queryKey: ["statuses"] });
      navigate(`/boards/${board.slug}`);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create board");
    },
  });

  const updateBoardMutation = useMutation({
    mutationFn: (args: { boardId: string; input: UpdateBoardInput }) => updateBoard(args.boardId, args.input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["boards"] });
      await queryClient.invalidateQueries({ queryKey: ["board"] });
      await queryClient.invalidateQueries({ queryKey: ["board-detail", boardSlug] });
      await queryClient.invalidateQueries({ queryKey: ["statuses"] });
      navigate("/boards");
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update board");
    },
  });

  const createStatusMutation = useMutation({
    mutationFn: createStatus,
    onSuccess: async (status) => {
      await queryClient.invalidateQueries({ queryKey: ["statuses"] });
      setFormState((currentValue) => ({
        ...currentValue,
        columns: currentValue.columns.map((column) =>
          column.rowId === statusModalRowId
            ? {
                ...column,
                statusKey: status.key,
              }
            : column,
        ),
      }));
      setStatusModalValue("");
      setStatusModalError(null);
      setStatusModalRowId(null);
    },
    onError: (error) => {
      setStatusModalError(error instanceof Error ? error.message : "Failed to create status");
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
  const isSystemBoard = !isCreateMode && Boolean(boardQuery.data?.isSystem);
  const availableStatuses = useMemo(
    () => uniqueStatuses(statusesQuery.data?.statuses ?? boardQuery.data?.availableStatuses ?? []),
    [boardQuery.data?.availableStatuses, statusesQuery.data?.statuses],
  );
  const duplicateStatuses = useMemo(() => {
    const statusKeys = formState.columns
      .map((column) => column.statusKey)
      .filter(Boolean);

    return new Set(statusKeys).size !== statusKeys.length;
  }, [formState.columns]);
  const hasInvalidColumns = formState.columns.some((column) => !column.name.trim() || !column.statusKey);
  const canSubmit = formState.name.trim() && formState.columns.length > 0 && !duplicateStatuses && !hasInvalidColumns;

  function updateColumnAt(index: number, updater: (column: BoardColumnFormState) => BoardColumnFormState) {
    setFormState((currentValue) => ({
      ...currentValue,
      columns: currentValue.columns.map((column, candidateIndex) =>
        candidateIndex === index ? updater(column) : column,
      ),
    }));
  }

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setFormState((currentValue) => {
      const oldIndex = currentValue.columns.findIndex((column) => column.rowId === active.id);
      const newIndex = currentValue.columns.findIndex((column) => column.rowId === over.id);

      if (oldIndex < 0 || newIndex < 0) {
        return currentValue;
      }

      return {
        ...currentValue,
        columns: arrayMove(currentValue.columns, oldIndex, newIndex),
      };
    });
  }

  return (
    <main className="page-shell">
      <AppHeader
        activeNav="boards"
        description={isCreateMode
          ? "Create a new board by choosing which statuses to expose as columns and optionally filtering to a subset of labels."
          : isSystemBoard
            ? "The system board is a built-in Active and Done view across all tickets."
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
              <p>
                {isSystemBoard
                  ? "The system board always shows two built-in columns: Active and Done."
                  : "Boards reuse the shared ticket pool and can filter by one or more labels."}
              </p>
            </div>
          </div>

          {errorMessage ? <p className="labels-panel__error">{errorMessage}</p> : null}
          {duplicateStatuses ? (
            <p className="labels-panel__error">Each column must map to a different status.</p>
          ) : null}
          {hasInvalidColumns ? (
            <p className="labels-panel__error">Each column must choose a status before saving.</p>
          ) : null}

          <form
            className="modal-form"
            onSubmit={(event) => {
              event.preventDefault();
              setErrorMessage(null);

              if (formState.columns.some((column) => !column.statusKey)) {
                setErrorMessage("Select a status for each column before saving the board.");
                return;
              }

              const payload: CreateBoardInput = {
                name: formState.name.trim(),
                description: formState.description.trim(),
                isDefault: formState.isDefault,
                isPinned: formState.isPinned,
                showPriorityColors: formState.showPriorityColors,
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
                disabled={isSystemBoard}
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
                disabled={isSystemBoard}
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

            <label className="chip-toggle">
              <input
                checked={formState.isPinned}
                data-testid="board-pinned-input"
                type="checkbox"
                onChange={(event) =>
                  setFormState((currentValue) => ({
                    ...currentValue,
                    isPinned: event.target.checked,
                  }))
                }
              />
              <span>Pin this board in navigation</span>
            </label>

            <label className="chip-toggle">
              <input
                checked={formState.showPriorityColors}
                data-testid="board-priority-colors-input"
                type="checkbox"
                onChange={(event) =>
                  setFormState((currentValue) => ({
                    ...currentValue,
                    showPriorityColors: event.target.checked,
                  }))
                }
              />
              <span>Show priority colour stripe on tickets</span>
            </label>

            {isSystemBoard ? (
              <>
                <div className="filter-group">
                  <span className="filter-group__title">Columns</span>
                  <p className="muted-text">
                    The system board columns are fixed to Active and Done and cannot be edited.
                  </p>
                </div>

                <div className="filter-group">
                  <span className="filter-group__title">Board Filter</span>
                  <p className="muted-text">
                    The system board always shows all tickets, so board-level label filters are disabled.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="filter-group">
                  <span className="filter-group__title">Columns</span>
                  {availableStatuses.length > 0 ? (
                    <p className="muted-text">
                      Existing statuses: {availableStatuses.map((status) => status.name).join(", ")}
                    </p>
                  ) : null}

                  <DndContext collisionDetection={closestCenter} onDragEnd={handleColumnDragEnd} sensors={sensors}>
                    <SortableContext
                      items={formState.columns.map((column) => column.rowId)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="labels-list">
                        {formState.columns.map((column, index) => (
                          <SortableBoardColumnRow
                            key={column.rowId}
                            availableStatuses={availableStatuses}
                            canRemove={formState.columns.length > 1}
                            column={column}
                            index={index}
                            onColumnNameChange={(candidateIndex, value) =>
                              updateColumnAt(candidateIndex, (candidate) => ({
                                ...candidate,
                                name: value,
                              }))}
                            onRemove={(candidateIndex) =>
                              setFormState((currentValue) => ({
                                ...currentValue,
                                columns: currentValue.columns.filter((_, rowIndex) => rowIndex !== candidateIndex),
                              }))}
                            onStatusChange={(candidateIndex, value, rowId) => {
                              if (value === NEW_STATUS_VALUE) {
                                setStatusModalError(null);
                                setStatusModalValue("");
                                setStatusModalRowId(rowId);
                                return;
                              }

                              updateColumnAt(candidateIndex, (candidate) => ({
                                ...candidate,
                                statusKey: value,
                              }));
                            }}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>

                  <button
                    className="ghost-button board-edit__add-column"
                    type="button"
                    onClick={() =>
                      setFormState((currentValue) => ({
                        ...currentValue,
                        columns: [
                          ...currentValue.columns,
                          {
                            rowId: createRowId(),
                            name: "New Column",
                            statusKey: "",
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
              </>
            )}

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

      {statusModalRowId ? (
        <CreateStatusModal
          errorMessage={statusModalError}
          isBusy={createStatusMutation.isPending}
          value={statusModalValue}
          onChange={setStatusModalValue}
          onClose={() => {
            setStatusModalError(null);
            setStatusModalValue("");
            setStatusModalRowId(null);
          }}
          onSubmit={() => {
            setStatusModalError(null);
            void createStatusMutation.mutateAsync({
              name: statusModalValue.trim(),
            });
          }}
        />
      ) : null}
    </main>
  );
}
