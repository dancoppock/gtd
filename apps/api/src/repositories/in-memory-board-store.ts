import type {
  ArchiveDoneTicketsResponse,
  Board,
  BoardDetail,
  BoardFilters,
  Column,
  CreateTicketInput,
  Label,
  RepositionTicketInput,
  Ticket,
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

export class InMemoryBoardStore {
  private boards = new Map<string, Board>();
  private columns = new Map<string, Column>();
  private labels = new Map<string, Label>();
  private tickets = new Map<string, SeedTicketRecord>();

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

    seed.tickets.forEach((ticket) => {
      this.tickets.set(ticket.id, ticket);
    });
  }

  listBoards() {
    return Array.from(this.boards.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
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
      labels: this.getVisibleLabelsForBoard(boardId),
    };
  }

  listTickets(boardId: string, filters: BoardFilters) {
    return this.getVisibleTicketsForBoard(boardId).filter((ticket) => {
      if (filters.priorities.length > 0 && !filters.priorities.includes(ticket.priority)) {
        return false;
      }

      if (filters.labels.length > 0) {
        const ticketLabelSet = new Set(ticket.labels.map((label) => label.normalizedName));
        const normalizedFilters = filters.labels.map(normalizeLabelName);
        const matchesAnyLabel = normalizedFilters.some((label) => ticketLabelSet.has(label));

        if (!matchesAnyLabel) {
          return false;
        }
      }

      if (filters.q) {
        const query = filters.q.toLowerCase();
        const haystack = `${ticket.title} ${ticket.description}`.toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }

  createTicket(boardId: string, input: CreateTicketInput) {
    const board = this.getBoardById(boardId);
    if (!board) {
      return null;
    }

    const now = new Date().toISOString();
    const labelIds = this.getOrCreateBoardLabels(boardId, input.labels).map((label) => label.id);
    const ticketId = `ticket_${crypto.randomUUID()}`;
    const nextOrder = this.getNextBoardOrder(boardId);

    const record: SeedTicketRecord = {
      id: ticketId,
      boardId,
      columnId: input.columnId,
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
    this.touchBoard(boardId);

    return this.toTicket(record);
  }

  updateTicket(ticketId: string, input: UpdateTicketInput) {
    const record = this.tickets.get(ticketId);
    if (!record) {
      return null;
    }

    const nextLabels = input.labels
      ? this.getOrCreateBoardLabels(record.boardId, input.labels).map((label) => label.id)
      : record.labelIds;

    const updatedRecord: SeedTicketRecord = {
      ...record,
      title: input.title ?? record.title,
      description: input.description ?? record.description,
      columnId: input.columnId ?? record.columnId,
      priority: input.priority ?? record.priority,
      labelIds: nextLabels,
      updatedAt: new Date().toISOString(),
    };

    this.tickets.set(ticketId, updatedRecord);
    if (input.labels) {
      this.deleteOrphanBoardLabels(record.boardId);
    }
    this.touchBoard(record.boardId);

    return this.toTicket(updatedRecord);
  }

  deleteTicket(ticketId: string) {
    const record = this.tickets.get(ticketId);
    if (!record) {
      return false;
    }

    this.tickets.delete(ticketId);
    this.deleteOrphanBoardLabels(record.boardId);
    this.touchBoard(record.boardId);

    return true;
  }

  archiveDoneTickets(boardId: string): ArchiveDoneTicketsResponse | null {
    const board = this.getBoardById(boardId);
    if (!board) {
      return null;
    }

    const doneColumnId = this.getColumnsForBoard(boardId).find((column) => column.key === "done")?.id;
    if (!doneColumnId) {
      return {
        archivedCount: 0,
      };
    }

    const archivedAt = new Date().toISOString();
    let archivedCount = 0;

    this.getTicketRecordsForBoard(boardId).forEach((ticket) => {
      if (ticket.columnId === doneColumnId && ticket.archivedAt === null) {
        this.tickets.set(ticket.id, {
          ...ticket,
          archivedAt,
          updatedAt: archivedAt,
        });
        archivedCount += 1;
      }
    });

    if (archivedCount > 0) {
      this.touchBoard(boardId, archivedAt);
    }

    return {
      archivedCount,
    };
  }

  repositionTicket(ticketId: string, input: RepositionTicketInput) {
    const record = this.tickets.get(ticketId);
    if (!record) {
      return null;
    }

    let prevTicket = input.prevVisibleTicketId
      ? this.tickets.get(input.prevVisibleTicketId) ?? null
      : null;
    let nextTicket = input.nextVisibleTicketId
      ? this.tickets.get(input.nextVisibleTicketId) ?? null
      : null;

    let nextOrder = this.computeOrder(prevTicket?.uiOrder ?? null, nextTicket?.uiOrder ?? null);

    if (nextOrder === null) {
      this.rebalanceBoard(record.boardId);
      prevTicket = input.prevVisibleTicketId
        ? this.tickets.get(input.prevVisibleTicketId) ?? null
        : null;
      nextTicket = input.nextVisibleTicketId
        ? this.tickets.get(input.nextVisibleTicketId) ?? null
        : null;
      nextOrder = this.computeOrder(prevTicket?.uiOrder ?? null, nextTicket?.uiOrder ?? null);
    }

    if (nextOrder === null) {
      return null;
    }

    const updatedRecord: SeedTicketRecord = {
      ...record,
      columnId: input.columnId,
      uiOrder: nextOrder,
      updatedAt: new Date().toISOString(),
    };

    this.tickets.set(ticketId, updatedRecord);
    this.touchBoard(record.boardId);

    return this.toTicket(updatedRecord);
  }

  private getColumnsForBoard(boardId: string) {
    return Array.from(this.columns.values())
      .filter((column) => column.boardId === boardId)
      .sort((left, right) => left.position - right.position);
  }

  private getAllLabelsForBoard(boardId: string) {
    return Array.from(this.labels.values())
      .filter((label) => label.boardId === boardId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  private getVisibleLabelsForBoard(boardId: string) {
    const visibleLabelIds = new Set(
      this.getTicketRecordsForBoard(boardId)
        .filter((ticket) => ticket.archivedAt === null)
        .flatMap((ticket) => ticket.labelIds),
    );

    return this.getAllLabelsForBoard(boardId).filter((label) => visibleLabelIds.has(label.id));
  }

  private getTicketRecordsForBoard(boardId: string) {
    return Array.from(this.tickets.values())
      .filter((ticket) => ticket.boardId === boardId)
      .sort((left, right) => left.uiOrder - right.uiOrder);
  }

  private getVisibleTicketsForBoard(boardId: string) {
    return this.getTicketRecordsForBoard(boardId)
      .filter((ticket) => ticket.archivedAt === null)
      .map((ticket) => this.toTicket(ticket));
  }

  private getOrCreateBoardLabels(boardId: string, labelNames: string[]) {
    const names = uniqueNames(labelNames);

    return names.map((name) => {
      const normalizedName = normalizeLabelName(name);
      const existing = this.getAllLabelsForBoard(boardId).find(
        (label) => label.normalizedName === normalizedName,
      );

      if (existing) {
        return existing;
      }

      const label: Label = {
        id: `label_${crypto.randomUUID()}`,
        boardId,
        name,
        normalizedName,
      };

      this.labels.set(label.id, label);
      return label;
    });
  }

  private deleteOrphanBoardLabels(boardId: string) {
    const referencedLabelIds = new Set(
      this.getTicketRecordsForBoard(boardId).flatMap((ticket) => ticket.labelIds),
    );

    this.getAllLabelsForBoard(boardId).forEach((label) => {
      if (!referencedLabelIds.has(label.id)) {
        this.labels.delete(label.id);
      }
    });
  }

  private getNextBoardOrder(boardId: string) {
    const existing = this.getTicketRecordsForBoard(boardId);
    const currentMax = existing.at(-1)?.uiOrder ?? 0;
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

  private rebalanceBoard(boardId: string) {
    this.getTicketRecordsForBoard(boardId).forEach((ticket, index) => {
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

  private touchBoard(boardId: string, updatedAt = new Date().toISOString()) {
    const board = this.boards.get(boardId);
    if (!board) {
      return;
    }

    this.boards.set(boardId, {
      ...board,
      updatedAt,
    });
  }
}

export const boardStore = new InMemoryBoardStore();
