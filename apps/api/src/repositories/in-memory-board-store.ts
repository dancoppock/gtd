import type {
  ArchiveDoneTicketsResponse,
  Board,
  BoardDetail,
  BoardFilters,
  Column,
  CreateBoardInput,
  CreateTicketInput,
  Label,
  LabelUsage,
  RepositionTicketInput,
  Ticket,
  UpdateBoardInput,
  UpdateLabelInput,
  UpdateTicketInput,
} from "@gtd/contracts";

import { createSeedData, type SeedTicketRecord } from "../data/seed.js";

const ORDER_STEP = 1_000_000;

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

function matchesText(ticket: SeedTicketRecord, query: string) {
  if (!query.trim()) {
    return true;
  }

  const haystack = `${ticket.title} ${ticket.description}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

export class InMemoryBoardStore {
  private boards = new Map<string, Board>();
  private columns = new Map<string, Column>();
  private labels = new Map<string, Label>();
  private tickets = new Map<string, SeedTicketRecord>();
  private boardLabelFilters = new Map<string, Set<string>>();

  constructor() {
    const seed = createSeedData();

    seed.boards.forEach((board) => {
      this.boards.set(board.id, board);
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
  }

  listBoards() {
    return Array.from(this.boards.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
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
      columns: this.getColumnsForBoard(boardId),
      availableLabels: this.getAllLabels(),
      filterLabels: this.getBoardFilterLabels(boardId),
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

    this.boards.set(boardId, {
      ...existingBoard,
      name: input.name,
      description: input.description,
      isDefault: input.isDefault || (existingBoard.isDefault && this.getDefaultBoard()?.id === boardId),
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

  listTickets(boardId: string, filters: BoardFilters) {
    const board = this.getBoardById(boardId);
    if (!board) {
      return [];
    }

    const normalizedLabels = uniqueNames(filters.labels).map(normalizeLabelName);

    return this.getVisibleTicketRecordsForBoard(board.id)
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

    const statusKeys = new Set(this.getColumnsForBoard(boardId).map((column) => column.statusKey));
    if (!statusKeys.has(input.statusKey)) {
      return null;
    }

    const boardFilterLabelNames = this.getBoardFilterLabels(boardId).map((label) => label.name);
    const labelIds = this.getOrCreateLabels([...input.labels, ...boardFilterLabelNames]).map(
      (label) => label.id,
    );
    const now = new Date().toISOString();
    const ticketId = `ticket_${crypto.randomUUID()}`;
    const nextOrder = this.getNextGlobalOrder();

    const record: SeedTicketRecord = {
      id: ticketId,
      statusKey: input.statusKey,
      title: input.title,
      description: input.description,
      priority: input.priority,
      uiOrder: nextOrder,
      labelIds,
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

    const updatedRecord: SeedTicketRecord = {
      ...record,
      statusKey: input.statusKey ?? record.statusKey,
      title: input.title ?? record.title,
      description: input.description ?? record.description,
      priority: input.priority ?? record.priority,
      labelIds: nextLabels,
      updatedAt: new Date().toISOString(),
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

    const visibleDoneTickets = this.getVisibleTicketRecordsForBoard(boardId).filter(
      (ticket) => ticket.statusKey === "done",
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
      updatedAt: new Date().toISOString(),
    };

    this.tickets.set(ticketId, updatedRecord);
    this.touchAllBoards(updatedRecord.updatedAt);

    return this.toTicket(updatedRecord);
  }

  private getColumnsForBoard(boardId: string) {
    return Array.from(this.columns.values())
      .filter((column) => column.boardId === boardId)
      .sort((left, right) => left.position - right.position);
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

  private getVisibleTicketRecordsForBoard(boardId: string) {
    const statusKeys = new Set(this.getColumnsForBoard(boardId).map((column) => column.statusKey));
    const filterLabelIds = this.boardLabelFilters.get(boardId) ?? new Set<string>();

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
      const columnId = `col_${crypto.randomUUID()}`;

      this.columns.set(columnId, {
        id: columnId,
        boardId,
        name: column.name,
        statusKey: column.statusKey,
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
}

export const boardStore = new InMemoryBoardStore();
