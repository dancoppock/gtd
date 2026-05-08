import type {
  ArchiveDoneTicketsResponse,
  Board,
  BoardDetail,
  BoardFilters,
  CreateStatusInput,
  Column,
  CreateBoardInput,
  CreateTicketInput,
  InsightsResponse,
  Label,
  LabelUsage,
  RepositionTicketInput,
  Status,
  Ticket,
  UpdateBoardInput,
  UpdateLabelInput,
  UpdateTicketInput,
} from "@gtd/contracts";
import {
  SYSTEM_BOARD_ACTIVE_STATUS_KEY as SYSTEM_BOARD_ACTIVE_STATUS_KEY_VALUE,
  SYSTEM_BOARD_DESCRIPTION as SYSTEM_BOARD_DESCRIPTION_VALUE,
  SYSTEM_BOARD_DONE_STATUS_KEY as SYSTEM_BOARD_DONE_STATUS_KEY_VALUE,
  SYSTEM_BOARD_NAME as SYSTEM_BOARD_NAME_VALUE,
} from "@gtd/contracts";

import { createSeedData, type SeedTicketRecord } from "../data/seed.js";

const ORDER_STEP = 1_000_000;
const SYSTEM_BOARD_COLUMNS: CreateBoardInput["columns"] = [
  { name: "Active", statusKey: "todo" },
  { name: "Done", statusKey: "done" },
];

function buildSystemBoardColumns(boardId: string): Column[] {
  return [
    {
      id: `${boardId}_system_active`,
      boardId,
      name: "Active",
      statusKey: SYSTEM_BOARD_ACTIVE_STATUS_KEY_VALUE,
      statusName: "Active",
      statusCategory: "active",
      position: 0,
    },
    {
      id: `${boardId}_system_done`,
      boardId,
      name: "Done",
      statusKey: SYSTEM_BOARD_DONE_STATUS_KEY_VALUE,
      statusName: "Done",
      statusCategory: "completed",
      position: 1,
    },
  ];
}

function normalizeLabelName(label: string) {
  return label.trim().toLowerCase();
}

function uniqueNames(labels: string[]) {
  return Array.from(
    new Set(
      labels
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  );
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "board";
}

function statusKeyFromName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "status";
}

function humanizeStatusKey(value: string) {
  return value
    .trim()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Status";
}

function matchesText(ticket: SeedTicketRecord, query: string) {
  if (!query.trim()) {
    return true;
  }

  const haystack = `${ticket.title} ${ticket.description}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfWeekMonday(date: Date) {
  const day = date.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  const next = new Date(date);
  next.setDate(next.getDate() + offset);
  return startOfDay(next);
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export class InMemoryBoardStore {
  private boards = new Map<string, Board>();
  private statuses = new Map<string, Status>();
  private columns = new Map<string, Column>();
  private labels = new Map<string, Label>();
  private tickets = new Map<string, SeedTicketRecord>();
  private boardLabelFilters = new Map<string, Set<string>>();

  constructor() {
    const seed = createSeedData();

    seed.boards.forEach((board) => {
      this.boards.set(board.id, board);
    });

    seed.statuses.forEach((status) => {
      this.statuses.set(status.key, status);
    });

    seed.columns.forEach((column) => {
      this.columns.set(column.id, column);
    });

    seed.labels.forEach((label) => {
      this.labels.set(label.id, label);
    });

    seed.boardLabelFilters.forEach((filter) => {
      const labelIds = this.boardLabelFilters.get(filter.boardId) ?? new Set<string>();
      labelIds.add(filter.labelId);
      this.boardLabelFilters.set(filter.boardId, labelIds);
    });

    seed.tickets.forEach((ticket) => {
      this.tickets.set(ticket.id, ticket);
    });

    this.ensureSystemBoard();
  }

  listBoards() {
    return Array.from(this.boards.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  listStatuses() {
    return Array.from(this.statuses.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  createStatus(input: CreateStatusInput) {
    return this.getOrCreateStatus(statusKeyFromName(input.name), input.name);
  }

  getDefaultBoard() {
    return this.listBoards().find((board) => board.isDefault) ?? null;
  }

  getBoardById(boardId: string) {
    return this.boards.get(boardId) ?? null;
  }

  getBoardBySlug(slug: string) {
    return this.listBoards().find((board) => board.slug === slug) ?? null;
  }

  getBoardDetail(boardId: string): BoardDetail | null {
    const board = this.getBoardById(boardId);
    if (!board) {
      return null;
    }

    return {
      ...board,
      columns: this.getEffectiveColumnsForBoard(board),
      availableLabels: this.getAllLabels(),
      availableStatuses: this.listStatuses(),
      filterLabels: board.isSystem ? [] : this.getBoardFilterLabels(boardId),
    };
  }

  createBoard(input: CreateBoardInput): BoardDetail {
    const now = new Date().toISOString();
    const boardId = `board_${crypto.randomUUID()}`;
    const board: Board = {
      id: boardId,
      slug: this.createUniqueSlug(input.name),
      name: input.name,
      description: input.description,
      isDefault: input.isDefault || this.getDefaultBoard() === null,
      isPinned: input.isPinned,
      showPriorityColors: input.showPriorityColors,
      isSystem: false,
      createdAt: now,
      updatedAt: now,
    };

    if (board.isDefault) {
      this.clearDefaultBoard(board.id);
    }

    this.boards.set(board.id, board);
    this.replaceBoardColumns(board.id, input.columns);
    this.replaceBoardLabelFilters(board.id, input.filterLabelIds);

    return this.getBoardDetail(board.id)!;
  }

  updateBoard(boardId: string, input: UpdateBoardInput): BoardDetail | null {
    const existingBoard = this.getBoardById(boardId);
    if (!existingBoard) {
      return null;
    }

    if (existingBoard.isSystem) {
      this.boards.set(boardId, {
        ...existingBoard,
        name: SYSTEM_BOARD_NAME_VALUE,
        description: SYSTEM_BOARD_DESCRIPTION_VALUE,
        isDefault:
          input.isDefault
          || (existingBoard.isDefault && this.getDefaultBoard()?.id === boardId),
        isPinned: input.isPinned,
        showPriorityColors: input.showPriorityColors,
        updatedAt: new Date().toISOString(),
      });

      if (input.isDefault) {
        this.clearDefaultBoard(boardId);
      }

      this.ensureSystemBoard();
      return this.getBoardDetail(boardId);
    }

    this.boards.set(boardId, {
      ...existingBoard,
      name: input.name,
      description: input.description,
      isDefault: input.isDefault || (existingBoard.isDefault && this.getDefaultBoard()?.id === boardId),
      isPinned: input.isPinned,
      showPriorityColors: input.showPriorityColors,
      updatedAt: new Date().toISOString(),
    });

    if (input.isDefault) {
      this.clearDefaultBoard(boardId);
    }

    this.replaceBoardColumns(boardId, input.columns);
    this.replaceBoardLabelFilters(boardId, input.filterLabelIds);

    return this.getBoardDetail(boardId);
  }

  deleteBoard(boardId: string) {
    const existingBoard = this.getBoardById(boardId);
    if (!existingBoard || existingBoard.isSystem || existingBoard.isDefault) {
      return false;
    }

    this.boards.delete(boardId);
    this.boardLabelFilters.delete(boardId);

    Array.from(this.columns.values()).forEach((column) => {
      if (column.boardId === boardId) {
        this.columns.delete(column.id);
      }
    });

    this.deleteOrphanLabels();
    return true;
  }

  getLabelById(labelId: string) {
    return this.labels.get(labelId) ?? null;
  }

  listAllLabels() {
    return this.getAllLabels().map((label) => {
      let activeTicketCount = 0;
      let archivedTicketCount = 0;

      this.tickets.forEach((ticket) => {
        if (!ticket.labelIds.includes(label.id)) {
          return;
        }

        if (ticket.archivedAt === null) {
          activeTicketCount += 1;
        } else {
          archivedTicketCount += 1;
        }
      });

      return {
        ...label,
        activeTicketCount,
        archivedTicketCount,
      } satisfies LabelUsage;
    });
  }

  getInsights(): InsightsResponse {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeekMonday(now);
    const lastWeekStart = addDays(weekStart, -7);
    const completedTickets = Array.from(this.tickets.values())
      .filter((ticket) => ticket.completedAt !== null)
      .map((ticket) => this.toTicket(ticket))
      .sort((left, right) => (right.completedAt ?? "").localeCompare(left.completedAt ?? ""));

    const doneToday = completedTickets.filter((ticket) => {
      const completedAt = ticket.completedAt ? new Date(ticket.completedAt) : null;
      return completedAt !== null && completedAt >= todayStart;
    });
    const doneThisWeek = completedTickets.filter((ticket) => {
      const completedAt = ticket.completedAt ? new Date(ticket.completedAt) : null;
      return completedAt !== null && completedAt >= weekStart;
    });
    const doneLastWeek = completedTickets.filter((ticket) => {
      const completedAt = ticket.completedAt ? new Date(ticket.completedAt) : null;
      return completedAt !== null && completedAt >= lastWeekStart && completedAt < weekStart;
    });

    return {
      summary: {
        doneToday: doneToday.length,
        doneThisWeek: doneThisWeek.length,
        doneLastWeek: doneLastWeek.length,
      },
      tickets: {
        doneToday,
        doneThisWeek,
      },
    };
  }

  listTickets(boardId: string, filters: BoardFilters) {
    const board = this.getBoardById(boardId);
    if (!board) {
      return [];
    }

    const normalizedLabels = uniqueNames(filters.labels).map(normalizeLabelName);

    return this.getVisibleTicketRecordsForBoard(board)
      .filter((ticket) => {
        if (filters.priorities.length > 0 && !filters.priorities.includes(ticket.priority)) {
          return false;
        }

        if (normalizedLabels.length > 0) {
          const ticketLabels = new Set(
            ticket.labelIds
              .map((labelId) => this.labels.get(labelId)?.normalizedName)
              .filter((labelName): labelName is string => Boolean(labelName)),
          );

          if (!normalizedLabels.some((labelName) => ticketLabels.has(labelName))) {
            return false;
          }
        }

        return matchesText(ticket, filters.q);
      })
      .map((ticket) => this.toTicket(ticket));
  }

  createTicket(boardId: string, input: CreateTicketInput) {
    const board = this.getBoardById(boardId);
    if (!board) {
      return null;
    }

    const resolvedStatusKey = board.isSystem
      ? this.resolveSystemBoardStatusKey(input.statusKey)
      : input.statusKey;
    const statusKeys = board.isSystem
      ? new Set(this.listStatuses().map((status) => status.key))
      : new Set(this.getStoredColumnsForBoard(boardId).map((column) => column.statusKey));
    if (!statusKeys.has(resolvedStatusKey)) {
      return null;
    }

    const boardFilterLabelNames = board.isSystem
      ? []
      : this.getBoardFilterLabels(boardId).map((label) => label.name);
    const labelIds = this.getOrCreateLabels([...input.labels, ...boardFilterLabelNames]).map(
      (label) => label.id,
    );
    const now = new Date().toISOString();
    const ticketId = `ticket_${crypto.randomUUID()}`;
    const nextOrder = this.getNextGlobalOrder();

    const record: SeedTicketRecord = {
      id: ticketId,
      statusKey: resolvedStatusKey,
      title: input.title,
      description: input.description,
      priority: input.priority,
      uiOrder: nextOrder,
      labelIds,
      completedAt: this.statuses.get(resolvedStatusKey)?.category === "completed" ? now : null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.tickets.set(record.id, record);
    this.touchAllBoards(now);

    return this.toTicket(record);
  }

  updateLabel(labelId: string, input: UpdateLabelInput) {
    const existingLabel = this.labels.get(labelId);
    if (!existingLabel) {
      return null;
    }

    const updatedLabel: Label = {
      ...existingLabel,
      name: input.name,
      normalizedName: normalizeLabelName(input.name),
    };

    this.labels.set(labelId, updatedLabel);
    this.touchAllBoards();

    return updatedLabel;
  }

  deleteLabel(labelId: string) {
    const existingLabel = this.labels.get(labelId);
    if (!existingLabel) {
      return false;
    }

    this.labels.delete(labelId);

    this.tickets.forEach((ticket) => {
      if (!ticket.labelIds.includes(labelId)) {
        return;
      }

      this.tickets.set(ticket.id, {
        ...ticket,
        labelIds: ticket.labelIds.filter((candidateLabelId) => candidateLabelId !== labelId),
        updatedAt: new Date().toISOString(),
      });
    });

    this.boardLabelFilters.forEach((labelIds, boardId) => {
      if (labelIds.has(labelId)) {
        labelIds.delete(labelId);
        this.boardLabelFilters.set(boardId, new Set(labelIds));
      }
    });

    this.touchAllBoards();
    return true;
  }

  updateTicket(ticketId: string, input: UpdateTicketInput) {
    const record = this.tickets.get(ticketId);
    if (!record) {
      return null;
    }

    const nextLabels = input.labels
      ? this.getOrCreateLabels(input.labels).map((label) => label.id)
      : record.labelIds;
    const nextStatusKey = input.statusKey ?? record.statusKey;
    const updatedAt = new Date().toISOString();
    const wasCompleted = this.statuses.get(record.statusKey)?.category === "completed";
    const isCompleted = this.statuses.get(nextStatusKey)?.category === "completed";

    const updatedRecord: SeedTicketRecord = {
      ...record,
      statusKey: nextStatusKey,
      title: input.title ?? record.title,
      description: input.description ?? record.description,
      priority: input.priority ?? record.priority,
      labelIds: nextLabels,
      completedAt:
        !wasCompleted && isCompleted
          ? updatedAt
          : wasCompleted && !isCompleted
            ? null
            : record.completedAt,
      updatedAt,
    };

    this.tickets.set(ticketId, updatedRecord);

    if (input.labels) {
      this.deleteOrphanLabels();
    }

    this.touchAllBoards(updatedRecord.updatedAt);
    return this.toTicket(updatedRecord);
  }

  deleteTicket(ticketId: string) {
    const record = this.tickets.get(ticketId);
    if (!record) {
      return false;
    }

    this.tickets.delete(ticketId);
    this.deleteOrphanLabels();
    this.touchAllBoards();

    return true;
  }

  archiveDoneTickets(boardId: string): ArchiveDoneTicketsResponse | null {
    const board = this.getBoardById(boardId);
    if (!board) {
      return null;
    }

    const visibleDoneTickets = this.getVisibleTicketRecordsForBoard(board).filter(
      (ticket) => this.statuses.get(ticket.statusKey)?.category === "completed",
    );
    const archivedAt = new Date().toISOString();

    visibleDoneTickets.forEach((ticket) => {
      this.tickets.set(ticket.id, {
        ...ticket,
        archivedAt,
        updatedAt: archivedAt,
      });
    });

    if (visibleDoneTickets.length > 0) {
      this.touchAllBoards(archivedAt);
    }

    return {
      archivedCount: visibleDoneTickets.length,
    };
  }

  repositionTicket(ticketId: string, input: RepositionTicketInput) {
    const record = this.tickets.get(ticketId);
    if (!record) {
      return null;
    }

    let previousTicket = input.prevVisibleTicketId
      ? this.tickets.get(input.prevVisibleTicketId) ?? null
      : null;
    let nextTicket = input.nextVisibleTicketId
      ? this.tickets.get(input.nextVisibleTicketId) ?? null
      : null;

    let nextOrder = this.computeOrder(previousTicket?.uiOrder ?? null, nextTicket?.uiOrder ?? null);

    if (nextOrder === null) {
      this.rebalanceTickets();
      previousTicket = input.prevVisibleTicketId
        ? this.tickets.get(input.prevVisibleTicketId) ?? null
        : null;
      nextTicket = input.nextVisibleTicketId
        ? this.tickets.get(input.nextVisibleTicketId) ?? null
        : null;
      nextOrder = this.computeOrder(previousTicket?.uiOrder ?? null, nextTicket?.uiOrder ?? null);
    }

    if (nextOrder === null) {
      return null;
    }

    const updatedRecord: SeedTicketRecord = {
      ...record,
      statusKey: input.statusKey,
      uiOrder: nextOrder,
      completedAt:
        this.statuses.get(record.statusKey)?.category !== "completed"
          && this.statuses.get(input.statusKey)?.category === "completed"
          ? new Date().toISOString()
          : this.statuses.get(record.statusKey)?.category === "completed"
              && this.statuses.get(input.statusKey)?.category !== "completed"
            ? null
            : record.completedAt,
      updatedAt: new Date().toISOString(),
    };

    this.tickets.set(ticketId, updatedRecord);
    this.touchAllBoards(updatedRecord.updatedAt);

    return this.toTicket(updatedRecord);
  }

  private getStoredColumnsForBoard(boardId: string) {
    return Array.from(this.columns.values())
      .filter((column) => column.boardId === boardId)
      .sort((left, right) => left.position - right.position);
  }

  private getEffectiveColumnsForBoard(board: Board) {
    return board.isSystem ? buildSystemBoardColumns(board.id) : this.getStoredColumnsForBoard(board.id);
  }

  private getAllLabels() {
    return Array.from(this.labels.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  private getBoardFilterLabels(boardId: string) {
    const labelIds = this.boardLabelFilters.get(boardId) ?? new Set<string>();

    return Array.from(labelIds)
      .map((labelId) => this.labels.get(labelId))
      .filter((label): label is Label => Boolean(label))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private getVisibleTicketRecordsForBoard(board: Board) {
    if (board.isSystem) {
      return Array.from(this.tickets.values())
        .filter((ticket) => ticket.archivedAt === null)
        .sort((left, right) => left.uiOrder - right.uiOrder);
    }

    const statusKeys = new Set(this.getStoredColumnsForBoard(board.id).map((column) => column.statusKey));
    const filterLabelIds = this.boardLabelFilters.get(board.id) ?? new Set<string>();

    return Array.from(this.tickets.values())
      .filter((ticket) => ticket.archivedAt === null)
      .filter((ticket) => statusKeys.has(ticket.statusKey))
      .filter((ticket) => {
        if (filterLabelIds.size === 0) {
          return true;
        }

        return ticket.labelIds.some((labelId) => filterLabelIds.has(labelId));
      })
      .sort((left, right) => left.uiOrder - right.uiOrder);
  }

  private getOrCreateLabels(labelNames: string[]) {
    const names = uniqueNames(labelNames);

    return names.map((name) => {
      const normalizedName = normalizeLabelName(name);
      const existingLabel = this.getAllLabels().find(
        (label) => label.normalizedName === normalizedName,
      );

      if (existingLabel) {
        return existingLabel;
      }

      const label: Label = {
        id: `label_${crypto.randomUUID()}`,
        name,
        normalizedName,
      };

      this.labels.set(label.id, label);
      return label;
    });
  }

  private replaceBoardColumns(boardId: string, columnsInput: CreateBoardInput["columns"]) {
    Array.from(this.columns.values()).forEach((column) => {
      if (column.boardId === boardId) {
        this.columns.delete(column.id);
      }
    });

    columnsInput.forEach((column, index) => {
      const status = this.getOrCreateStatus(column.statusKey, column.statusName);
      const columnId = `col_${crypto.randomUUID()}`;

      this.columns.set(columnId, {
        id: columnId,
        boardId,
        name: column.name,
        statusKey: status.key,
        statusName: status.name,
        statusCategory: status.category,
        position: index,
      });
    });
  }

  private replaceBoardLabelFilters(boardId: string, filterLabelIds: string[]) {
    const nextLabelIds = new Set(
      filterLabelIds.filter((labelId) => this.labels.has(labelId)),
    );

    this.boardLabelFilters.set(boardId, nextLabelIds);
    this.deleteOrphanLabels();
  }

  private deleteOrphanLabels() {
    const referencedLabelIds = new Set(
      Array.from(this.tickets.values()).flatMap((ticket) => ticket.labelIds),
    );

    this.boardLabelFilters.forEach((labelIds) => {
      labelIds.forEach((labelId) => referencedLabelIds.add(labelId));
    });

    this.getAllLabels().forEach((label) => {
      if (!referencedLabelIds.has(label.id)) {
        this.labels.delete(label.id);
      }
    });
  }

  private getNextGlobalOrder() {
    const currentMax = Array.from(this.tickets.values()).reduce(
      (maxOrder, ticket) => Math.max(maxOrder, ticket.uiOrder),
      0,
    );

    return currentMax + ORDER_STEP;
  }

  private computeOrder(prevOrder: number | null, nextOrder: number | null) {
    if (prevOrder === null && nextOrder === null) {
      return ORDER_STEP;
    }

    if (prevOrder !== null && nextOrder === null) {
      return prevOrder + ORDER_STEP;
    }

    if (prevOrder === null && nextOrder !== null) {
      const proposed = nextOrder - ORDER_STEP;
      return proposed > 0 ? proposed : null;
    }

    if (prevOrder !== null && nextOrder !== null) {
      const gap = nextOrder - prevOrder;
      if (gap <= 1) {
        return null;
      }

      return prevOrder + Math.floor(gap / 2);
    }

    return null;
  }

  private rebalanceTickets() {
    Array.from(this.tickets.values())
      .sort((left, right) => left.uiOrder - right.uiOrder)
      .forEach((ticket, index) => {
        this.tickets.set(ticket.id, {
          ...ticket,
          uiOrder: (index + 1) * ORDER_STEP,
        });
      });
  }

  private toTicket(ticket: SeedTicketRecord): Ticket {
    return {
      ...ticket,
      labels: ticket.labelIds
        .map((labelId) => this.labels.get(labelId))
        .filter((label): label is Label => Boolean(label))
        .sort((left, right) => left.name.localeCompare(right.name)),
    };
  }

  private touchAllBoards(updatedAt = new Date().toISOString()) {
    this.boards.forEach((board, boardId) => {
      this.boards.set(boardId, {
        ...board,
        updatedAt,
      });
    });
  }

  private createUniqueSlug(name: string) {
    const base = slugify(name);
    const existingSlugs = new Set(this.listBoards().map((board) => board.slug));

    if (!existingSlugs.has(base)) {
      return base;
    }

    let suffix = 2;
    while (existingSlugs.has(`${base}-${suffix}`)) {
      suffix += 1;
    }

    return `${base}-${suffix}`;
  }

  private getOrCreateStatus(statusKey: string, statusName?: string) {
    const normalizedKey = statusKeyFromName(statusKey);
    const existingStatus = this.statuses.get(normalizedKey);
    if (existingStatus) {
      return existingStatus;
    }

    const status: Status = {
      key: normalizedKey,
      name: statusName?.trim() || humanizeStatusKey(normalizedKey),
      category: normalizedKey === "done" ? "completed" : "active",
      isSystem: normalizedKey === "todo" || normalizedKey === "in_progress" || normalizedKey === "done",
    };

    this.statuses.set(status.key, status);
    return status;
  }

  private clearDefaultBoard(nextDefaultBoardId: string) {
    this.boards.forEach((board, boardId) => {
      if (board.isDefault && boardId !== nextDefaultBoardId) {
        this.boards.set(boardId, {
          ...board,
          isDefault: false,
        });
      }
    });
  }

  private resolveSystemBoardStatusKey(
    requestedStatusKey: string,
    existingStatusKey?: string | null,
  ) {
    if (requestedStatusKey === SYSTEM_BOARD_DONE_STATUS_KEY_VALUE) {
      return "done";
    }

    if (requestedStatusKey === SYSTEM_BOARD_ACTIVE_STATUS_KEY_VALUE) {
      return existingStatusKey && this.statuses.get(existingStatusKey)?.category === "active"
        ? existingStatusKey
        : "todo";
    }

    return requestedStatusKey;
  }

  private ensureSystemBoard() {
    const now = new Date().toISOString();
    const systemBoards = this.listBoards().filter((board) => board.isSystem);
    let systemBoard = systemBoards[0] ?? null;

    if (!systemBoard) {
      const hasDefaultBoard = this.getDefaultBoard() !== null;
      systemBoard = {
        id: "board_system",
        slug: this.createUniqueSlug("System Board"),
        name: SYSTEM_BOARD_NAME_VALUE,
        description: SYSTEM_BOARD_DESCRIPTION_VALUE,
        isDefault: !hasDefaultBoard,
        isPinned: true,
        showPriorityColors: true,
        isSystem: true,
        createdAt: now,
        updatedAt: now,
      };
      this.boards.set(systemBoard.id, systemBoard);

      if (systemBoard.isDefault) {
        this.clearDefaultBoard(systemBoard.id);
      }
    } else {
      this.boards.set(systemBoard.id, {
        ...systemBoard,
        name: SYSTEM_BOARD_NAME_VALUE,
        description: SYSTEM_BOARD_DESCRIPTION_VALUE,
        isSystem: true,
        updatedAt: now,
      });
    }

    systemBoards.slice(1).forEach((board) => {
      this.boards.set(board.id, {
        ...board,
        isSystem: false,
        updatedAt: now,
      });
    });

    this.replaceBoardColumns(systemBoard.id, SYSTEM_BOARD_COLUMNS);
    this.replaceBoardLabelFilters(systemBoard.id, []);
  }
}

export const boardStore = new InMemoryBoardStore();
