import type Database from "better-sqlite3";
import type {
  ArchiveDoneTicketsResponse,
  Board,
  BoardDetail,
  BoardFilters,
  Column,
  CreateStatusInput,
  CreateBoardInput,
  CreateTicketInput,
  InsightsResponse,
  Label,
  RepositionTicketInput,
  Status,
  Ticket,
  UpdateBoardInput,
  UpdateBoardSwimlaneOrderInput,
  UpdateLabelInput,
  UpdateTicketInput,
} from "@gtd/contracts";
import {
  SYSTEM_BOARD_ACTIVE_STATUS_KEY as SYSTEM_BOARD_ACTIVE_STATUS_KEY_VALUE,
  SYSTEM_BOARD_DESCRIPTION as SYSTEM_BOARD_DESCRIPTION_VALUE,
  SYSTEM_BOARD_DONE_STATUS_KEY as SYSTEM_BOARD_DONE_STATUS_KEY_VALUE,
  SYSTEM_BOARD_NAME as SYSTEM_BOARD_NAME_VALUE,
} from "@gtd/contracts";

import { createSeedData } from "../data/seed.js";
import { createDatabaseClient, type DatabaseClient } from "../db/client.js";

const ORDER_STEP = 1_000_000;
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

type BoardRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_default: number;
  is_pinned: number;
  show_priority_colors: number;
  collapse_menus_by_default: number;
  swimlane_layout: Board["swimlaneLayout"];
  swimlane_label_order: string;
  is_system: number;
  default_label_id: string | null;
  created_at: number;
  updated_at: number;
};

type ColumnRow = {
  id: string;
  board_id: string;
  key: Column["statusKey"];
  status_name: string;
  status_category: Column["statusCategory"];
  name: string;
  position: number;
};

type StatusRow = {
  key: string;
  name: string;
  category: Status["category"];
  is_system: number;
};

type LabelRow = {
  id: string;
  name: string;
  normalized_name: string;
};

type TicketRow = {
  id: string;
  status_key: Ticket["statusKey"];
  title: string;
  description: string;
  priority: Ticket["priority"];
  ui_order: number;
  completed_at: number | null;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
};

type LabelUsageRow = LabelRow & {
  activeTicketCount: number;
  archivedTicketCount: number;
};

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

function parseSwimlaneLabelOrder(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return Array.from(
      new Set(
        parsed
          .filter((labelName): labelName is string => typeof labelName === "string")
          .map(normalizeLabelName)
          .filter(Boolean),
      ),
    );
  } catch {
    return [];
  }
}

function serializeSwimlaneLabelOrder(labelNames: string[]) {
  return JSON.stringify(
    Array.from(
      new Set(
        labelNames
          .map(normalizeLabelName)
          .filter(Boolean),
      ),
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

function toIsoString(timestamp: number | null) {
  return timestamp === null ? null : new Date(timestamp).toISOString();
}

function placeholders(values: readonly unknown[]) {
  return values.map(() => "?").join(", ");
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
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

const emptyFilters: BoardFilters = {
  priorities: [],
  labels: [],
  q: "",
};

export class SqliteBoardStore {
  private readonly client: DatabaseClient;
  private readonly sqlite: Database.Database;

  constructor(client = createDatabaseClient()) {
    this.client = client;
    this.sqlite = client.sqlite;
    this.seedDemoDataIfNeeded();
    this.ensureSystemBoard();
  }

  listBoards() {
    const rows = this.sqlite
      .prepare("select * from boards order by name asc")
      .all() as BoardRow[];

    return rows.map((row) => this.toBoard(row));
  }

  listStatuses() {
    const rows = this.sqlite
      .prepare("select * from statuses order by name asc")
      .all() as StatusRow[];

    return rows.map((row) => this.toStatus(row));
  }

  createStatus(input: CreateStatusInput) {
    return this.getOrCreateStatus(statusKeyFromName(input.name), input.name);
  }

  getDefaultBoard() {
    const row = this.sqlite
      .prepare("select * from boards where is_default = 1 limit 1")
      .get() as BoardRow | undefined;

    return row ? this.toBoard(row) : null;
  }

  getBoardById(boardId: string) {
    const row = this.sqlite
      .prepare("select * from boards where id = ? limit 1")
      .get(boardId) as BoardRow | undefined;

    return row ? this.toBoard(row) : null;
  }

  getBoardBySlug(slug: string) {
    const row = this.sqlite
      .prepare("select * from boards where slug = ? limit 1")
      .get(slug) as BoardRow | undefined;

    return row ? this.toBoard(row) : null;
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
      defaultLabel: board.isSystem ? null : this.getBoardDefaultLabel(boardId),
      filterLabels: board.isSystem ? [] : this.getBoardFilterLabels(boardId),
    };
  }

  createBoard(input: CreateBoardInput) {
    const now = Date.now();
    const boardId = `board_${crypto.randomUUID()}`;

    this.sqlite.transaction(() => {
      const slug = this.createUniqueSlug(input.name);
      const isDefault = input.isDefault || this.getDefaultBoard() === null;

      if (isDefault) {
        this.clearDefaultBoard(boardId);
      }

      this.sqlite
        .prepare(`
          insert into boards (id, slug, name, description, is_default, is_pinned, show_priority_colors, collapse_menus_by_default, swimlane_layout, swimlane_label_order, is_system, default_label_id, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, ?, ?)
        `)
        .run(
          boardId,
          slug,
          input.name,
          input.description,
          isDefault ? 1 : 0,
          input.isPinned ? 1 : 0,
          input.showPriorityColors ? 1 : 0,
          input.collapseMenusByDefault ? 1 : 0,
          input.swimlaneLayout,
          serializeSwimlaneLabelOrder(input.swimlaneLabelOrder),
          now,
          now,
        );

      this.replaceBoardColumns(boardId, input.columns);
      this.replaceBoardLabelFilters(boardId, input.filterLabelIds);
      this.replaceBoardDefaultLabel(boardId, input.filterLabelIds, input.defaultLabelId ?? null);
    })();

    return this.getBoardDetail(boardId)!;
  }

  updateBoard(boardId: string, input: UpdateBoardInput) {
    const existingBoard = this.getBoardById(boardId);
    if (!existingBoard) {
      return null;
    }

    if (existingBoard.isSystem) {
      const updatedAt = Date.now();

      this.sqlite.transaction(() => {
        const shouldStayDefault = input.isDefault
          || (existingBoard.isDefault && this.getDefaultBoard()?.id === boardId);

        if (input.isDefault) {
          this.clearDefaultBoard(boardId);
        }

        this.sqlite
          .prepare(`
            update boards
            set name = ?, description = ?, is_default = ?, is_pinned = ?, show_priority_colors = ?, collapse_menus_by_default = ?, swimlane_layout = ?, swimlane_label_order = ?, is_system = 1, updated_at = ?
            where id = ?
          `)
          .run(
            SYSTEM_BOARD_NAME_VALUE,
            SYSTEM_BOARD_DESCRIPTION_VALUE,
            shouldStayDefault ? 1 : 0,
            input.isPinned ? 1 : 0,
            input.showPriorityColors ? 1 : 0,
            input.collapseMenusByDefault ? 1 : 0,
            input.swimlaneLayout,
            serializeSwimlaneLabelOrder(input.swimlaneLabelOrder),
            updatedAt,
            boardId,
          );
      })();

      this.ensureSystemBoard();
      return this.getBoardDetail(boardId);
    }

    const updatedAt = Date.now();

    this.sqlite.transaction(() => {
      const shouldStayDefault = input.isDefault
        || (existingBoard.isDefault && this.getDefaultBoard()?.id === boardId);

      if (input.isDefault) {
        this.clearDefaultBoard(boardId);
      }

      this.sqlite
        .prepare(`
          update boards
          set name = ?, description = ?, is_default = ?, is_pinned = ?, show_priority_colors = ?, collapse_menus_by_default = ?, swimlane_layout = ?, swimlane_label_order = ?, updated_at = ?
          where id = ?
        `)
        .run(
          input.name,
          input.description,
          shouldStayDefault ? 1 : 0,
          input.isPinned ? 1 : 0,
          input.showPriorityColors ? 1 : 0,
          input.collapseMenusByDefault ? 1 : 0,
          input.swimlaneLayout,
          serializeSwimlaneLabelOrder(input.swimlaneLabelOrder),
          updatedAt,
          boardId,
        );

      this.replaceBoardColumns(boardId, input.columns);
      this.replaceBoardLabelFilters(boardId, input.filterLabelIds);
      this.replaceBoardDefaultLabel(boardId, input.filterLabelIds, input.defaultLabelId ?? null);
    })();

    return this.getBoardDetail(boardId);
  }

  updateBoardSwimlaneOrder(boardId: string, input: UpdateBoardSwimlaneOrderInput) {
    const existingBoard = this.getBoardById(boardId);
    if (!existingBoard) {
      return null;
    }

    const updatedAt = Date.now();
    this.sqlite
      .prepare(`
        update boards
        set swimlane_label_order = ?, updated_at = ?
        where id = ?
      `)
      .run(serializeSwimlaneLabelOrder(input.labelNames), updatedAt, boardId);

    return this.getBoardDetail(boardId);
  }

  deleteBoard(boardId: string) {
    const existingBoard = this.getBoardById(boardId);
    if (!existingBoard || existingBoard.isSystem || existingBoard.isDefault) {
      return false;
    }

    const didDelete = this.sqlite.transaction(() => {
      const changes = this.sqlite
        .prepare("delete from boards where id = ?")
        .run(boardId).changes;

      this.deleteOrphanLabels();
      return changes > 0;
    })();

    return didDelete;
  }

  getLabelById(labelId: string) {
    const row = this.sqlite
      .prepare("select * from labels where id = ? limit 1")
      .get(labelId) as LabelRow | undefined;

    return row ? this.toLabel(row) : null;
  }

  listAllLabels() {
    const rows = this.sqlite
      .prepare(`
        select
          labels.id,
          labels.name,
          labels.normalized_name,
          coalesce(sum(case when tickets.archived_at is null and tickets.id is not null then 1 else 0 end), 0) as activeTicketCount,
          coalesce(sum(case when tickets.archived_at is not null then 1 else 0 end), 0) as archivedTicketCount
        from labels
        left join ticket_labels on ticket_labels.label_id = labels.id
        left join tickets on tickets.id = ticket_labels.ticket_id
        group by labels.id, labels.name, labels.normalized_name
        order by labels.name asc
      `)
      .all() as LabelUsageRow[];

    return rows.map((row) => ({
      ...this.toLabel(row),
      activeTicketCount: row.activeTicketCount,
      archivedTicketCount: row.archivedTicketCount,
    }));
  }

  getInsights(): InsightsResponse {
    const now = new Date();
    const todayStart = startOfDay(now);
    const weekStart = startOfWeekMonday(now);
    const lastWeekStart = addDays(weekStart, -7);
    const completedTickets = this.hydrateTickets(
      this.sqlite.prepare(`
        select *
        from tickets
        where completed_at is not null
        order by completed_at desc
      `).all() as TicketRow[],
    );

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
    return this.hydrateTickets(this.selectVisibleTicketRows(boardId, filters));
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

    const ticketId = `ticket_${crypto.randomUUID()}`;
    const now = Date.now();

    this.sqlite.transaction(() => {
      const labels = this.getOrCreateLabels([
        ...input.labels,
        ...this.getCreateTicketDefaultLabels(boardId, input.labels),
      ]);
      const nextOrder = this.getCreateTicketOrder(
        boardId,
        resolvedStatusKey,
        input.position ?? "bottom",
      );

      this.sqlite
        .prepare(`
          insert into tickets (id, status_key, title, description, priority, ui_order, completed_at, archived_at, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, null, ?, ?)
        `)
        .run(
          ticketId,
          resolvedStatusKey,
          input.title,
          input.description,
          input.priority,
          nextOrder,
          this.getStatusCategory(resolvedStatusKey) === "completed" ? now : null,
          now,
          now,
        );

      if (labels.length > 0) {
        const insert = this.sqlite.prepare(
          "insert into ticket_labels (ticket_id, label_id) values (?, ?)",
        );

        labels.forEach((label) => {
          insert.run(ticketId, label.id);
        });
      }

      this.touchAllBoards(now);
    })();

    return this.hydrateTickets(this.selectTicketRowsByIds([ticketId]))[0] ?? null;
  }

  updateLabel(labelId: string, input: UpdateLabelInput) {
    const existingLabel = this.getLabelById(labelId);
    if (!existingLabel) {
      return null;
    }

    const updatedAt = Date.now();
    this.sqlite.transaction(() => {
      this.sqlite
        .prepare("update labels set name = ?, normalized_name = ? where id = ?")
        .run(input.name, normalizeLabelName(input.name), labelId);
      this.touchAllBoards(updatedAt);
    })();

    return this.getLabelById(labelId);
  }

  deleteLabel(labelId: string) {
    const existingLabel = this.getLabelById(labelId);
    if (!existingLabel) {
      return false;
    }

    const didDelete = this.sqlite.transaction(() => {
      const changes = this.sqlite
        .prepare("delete from labels where id = ?")
        .run(labelId).changes;
      this.touchAllBoards(Date.now());
      return changes > 0;
    })();

    return didDelete;
  }

  updateTicket(ticketId: string, input: UpdateTicketInput) {
    const existingTicket = this.selectTicketRowsByIds([ticketId])[0];
    if (!existingTicket) {
      return null;
    }

    const updatedAt = Date.now();
    const nextStatusKey = input.statusKey ?? existingTicket.status_key;
    const wasCompleted = this.getStatusCategory(existingTicket.status_key) === "completed";
    const isCompleted = this.getStatusCategory(nextStatusKey) === "completed";
    const nextCompletedAt = !wasCompleted && isCompleted
      ? updatedAt
      : wasCompleted && !isCompleted
        ? null
        : existingTicket.completed_at;

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(`
          update tickets
          set
            status_key = ?,
            title = ?,
            description = ?,
            priority = ?,
            completed_at = ?,
            updated_at = ?
          where id = ?
        `)
        .run(
          nextStatusKey,
          input.title ?? existingTicket.title,
          input.description ?? existingTicket.description,
          input.priority ?? existingTicket.priority,
          nextCompletedAt,
          updatedAt,
          ticketId,
        );

      if (input.labels) {
        const labels = this.getOrCreateLabels(input.labels);

        this.sqlite.prepare("delete from ticket_labels where ticket_id = ?").run(ticketId);

        if (labels.length > 0) {
          const insert = this.sqlite.prepare(
            "insert into ticket_labels (ticket_id, label_id) values (?, ?)",
          );

          labels.forEach((label) => {
            insert.run(ticketId, label.id);
          });
        }

        this.deleteOrphanLabels();
      }

      this.touchAllBoards(updatedAt);
    })();

    return this.hydrateTickets(this.selectTicketRowsByIds([ticketId]))[0] ?? null;
  }

  deleteTicket(ticketId: string) {
    const existingTicket = this.selectTicketRowsByIds([ticketId])[0];
    if (!existingTicket) {
      return false;
    }

    const didDelete = this.sqlite.transaction(() => {
      const changes = this.sqlite
        .prepare("delete from tickets where id = ?")
        .run(ticketId).changes;

      this.deleteOrphanLabels();
      this.touchAllBoards(Date.now());
      return changes > 0;
    })();

    return didDelete;
  }

  archiveDoneTickets(boardId: string): ArchiveDoneTicketsResponse | null {
    const board = this.getBoardById(boardId);
    if (!board) {
      return null;
    }

    const visibleDoneIds = this.selectVisibleTicketRows(boardId, emptyFilters)
      .filter((ticket) => this.getStatusCategory(ticket.status_key) === "completed")
      .map((ticket) => ticket.id);

    if (visibleDoneIds.length === 0) {
      return { archivedCount: 0 };
    }

    const updatedAt = Date.now();
    this.sqlite.transaction(() => {
      const statement = this.sqlite.prepare(`
        update tickets
        set archived_at = ?, updated_at = ?
        where id = ?
      `);

      visibleDoneIds.forEach((ticketId) => {
        statement.run(updatedAt, updatedAt, ticketId);
      });

      this.touchAllBoards(updatedAt);
    })();

    return {
      archivedCount: visibleDoneIds.length,
    };
  }

  repositionTicket(ticketId: string, input: RepositionTicketInput) {
    const existingTicket = this.selectTicketRowsByIds([ticketId])[0];
    if (!existingTicket) {
      return null;
    }

    let previousTicket = input.prevVisibleTicketId
      ? this.selectTicketRowsByIds([input.prevVisibleTicketId])[0] ?? null
      : null;
    let nextTicket = input.nextVisibleTicketId
      ? this.selectTicketRowsByIds([input.nextVisibleTicketId])[0] ?? null
      : null;
    let nextOrder = this.computeOrder(previousTicket?.ui_order ?? null, nextTicket?.ui_order ?? null);

    this.sqlite.transaction(() => {
      if (nextOrder === null) {
        this.rebalanceTickets();
        previousTicket = input.prevVisibleTicketId
          ? this.selectTicketRowsByIds([input.prevVisibleTicketId])[0] ?? null
          : null;
        nextTicket = input.nextVisibleTicketId
          ? this.selectTicketRowsByIds([input.nextVisibleTicketId])[0] ?? null
          : null;
        nextOrder = this.computeOrder(previousTicket?.ui_order ?? null, nextTicket?.ui_order ?? null);
      }

      if (nextOrder === null) {
        return;
      }

      const updatedAt = Date.now();
      const nextCompletedAt =
        this.getStatusCategory(existingTicket.status_key) !== "completed"
          && this.getStatusCategory(input.statusKey) === "completed"
          ? updatedAt
          : this.getStatusCategory(existingTicket.status_key) === "completed"
              && this.getStatusCategory(input.statusKey) !== "completed"
            ? null
            : existingTicket.completed_at;
      this.sqlite
        .prepare(`
          update tickets
          set status_key = ?, ui_order = ?, completed_at = ?, updated_at = ?
          where id = ?
        `)
        .run(input.statusKey, nextOrder, nextCompletedAt, updatedAt, ticketId);

      this.touchAllBoards(updatedAt);
    })();

    if (nextOrder === null) {
      return null;
    }

    return this.hydrateTickets(this.selectTicketRowsByIds([ticketId]))[0] ?? null;
  }

  dispose() {
    this.sqlite.close();
  }

  private seedDemoDataIfNeeded() {
    const existingTicketCount = (
      this.sqlite
        .prepare("select count(*) as count from tickets")
        .get() as { count: number }
    ).count;

    if (existingTicketCount > 0) {
      return;
    }

    const seed = createSeedData();

    this.sqlite.transaction(() => {
      const insertBoard = this.sqlite.prepare(`
        insert or ignore into boards (id, slug, name, description, is_default, is_pinned, show_priority_colors, collapse_menus_by_default, swimlane_layout, swimlane_label_order, is_system, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertStatus = this.sqlite.prepare(`
        insert or ignore into statuses (key, name, category, is_system)
        values (?, ?, ?, ?)
      `);
      const insertColumn = this.sqlite.prepare(`
        insert or ignore into columns (id, board_id, key, name, position)
        values (?, ?, ?, ?, ?)
      `);
      const insertLabel = this.sqlite.prepare(`
        insert or ignore into labels (id, name, normalized_name)
        values (?, ?, ?)
      `);
      const insertBoardFilter = this.sqlite.prepare(`
        insert or ignore into board_label_filters (board_id, label_id)
        values (?, ?)
      `);
      const insertTicket = this.sqlite.prepare(`
        insert or ignore into tickets (id, status_key, title, description, priority, ui_order, completed_at, archived_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertTicketLabel = this.sqlite.prepare(`
        insert or ignore into ticket_labels (ticket_id, label_id)
        values (?, ?)
      `);

      seed.boards.forEach((board) => {
        insertBoard.run(
          board.id,
          board.slug,
          board.name,
          board.description,
          board.isDefault ? 1 : 0,
          board.isPinned ? 1 : 0,
          board.showPriorityColors ? 1 : 0,
          board.collapseMenusByDefault ? 1 : 0,
          board.swimlaneLayout,
          serializeSwimlaneLabelOrder(board.swimlaneLabelOrder),
          board.isSystem ? 1 : 0,
          Date.parse(board.createdAt),
          Date.parse(board.updatedAt),
        );
      });

      seed.statuses.forEach((status) => {
        insertStatus.run(
          status.key,
          status.name,
          status.category,
          status.isSystem ? 1 : 0,
        );
      });

      seed.columns.forEach((column) => {
        insertColumn.run(
          column.id,
          column.boardId,
          column.statusKey,
          column.name,
          column.position,
        );
      });

      seed.labels.forEach((label) => {
        insertLabel.run(label.id, label.name, label.normalizedName);
      });

      seed.boardLabelFilters.forEach((filter) => {
        insertBoardFilter.run(filter.boardId, filter.labelId);
      });

      seed.tickets.forEach((ticket) => {
        insertTicket.run(
          ticket.id,
          ticket.statusKey,
          ticket.title,
          ticket.description,
          ticket.priority,
          ticket.uiOrder,
          ticket.completedAt ? Date.parse(ticket.completedAt) : null,
          ticket.archivedAt ? Date.parse(ticket.archivedAt) : null,
          Date.parse(ticket.createdAt),
          Date.parse(ticket.updatedAt),
        );

        ticket.labelIds.forEach((labelId) => {
          insertTicketLabel.run(ticket.id, labelId);
        });
      });
    })();
  }

  private getStoredColumnsForBoard(boardId: string) {
    const rows = this.sqlite
      .prepare(`
        select
          columns.*,
          statuses.name as status_name,
          statuses.category as status_category
        from columns
        inner join statuses on statuses.key = columns.key
        where board_id = ?
        order by position asc
      `)
      .all(boardId) as ColumnRow[];

    return rows.map((row) => this.toColumn(row));
  }

  private getEffectiveColumnsForBoard(board: Board) {
    return board.isSystem ? buildSystemBoardColumns(board.id) : this.getStoredColumnsForBoard(board.id);
  }

  private getAllLabels() {
    const rows = this.sqlite
      .prepare("select * from labels order by name asc")
      .all() as LabelRow[];

    return rows.map((row) => this.toLabel(row));
  }

  private getBoardFilterLabels(boardId: string) {
    const rows = this.sqlite
      .prepare(`
        select labels.*
        from labels
        inner join board_label_filters on board_label_filters.label_id = labels.id
        where board_label_filters.board_id = ?
        order by labels.name asc
      `)
      .all(boardId) as LabelRow[];

    return rows.map((row) => this.toLabel(row));
  }

  private getBoardDefaultLabel(boardId: string) {
    const row = this.sqlite
      .prepare(`
        select labels.*
        from boards
        inner join labels on labels.id = boards.default_label_id
        where boards.id = ?
        limit 1
      `)
      .get(boardId) as LabelRow | undefined;

    return row ? this.toLabel(row) : null;
  }

  private getCreateTicketDefaultLabels(boardId: string, inputLabels: string[]) {
    const defaultLabel = this.getBoardDefaultLabel(boardId);
    if (!defaultLabel) {
      return [];
    }

    const filterLabelNames = new Set(
      this.getBoardFilterLabels(boardId).map((label) => label.normalizedName),
    );
    const hasBoardFilterLabel = inputLabels
      .map(normalizeLabelName)
      .some((labelName) => filterLabelNames.has(labelName));

    return hasBoardFilterLabel ? [] : [defaultLabel.name];
  }

  private selectVisibleTicketRows(boardId: string, filters: BoardFilters) {
    const board = this.getBoardById(boardId);
    if (!board) {
      return [] as TicketRow[];
    }

    if (board.isSystem) {
      return this.selectSystemBoardTicketRows(filters);
    }

    const columns = this.getStoredColumnsForBoard(boardId);
    if (columns.length === 0) {
      return [] as TicketRow[];
    }

    const statusKeys = Array.from(new Set(columns.map((column) => column.statusKey)));
    const boardFilterLabelIds = this.getBoardFilterLabels(boardId).map((label) => label.id);
    const normalizedLabels = uniqueNames(filters.labels).map(normalizeLabelName);

    const conditions = [
      "tickets.archived_at is null",
      `tickets.status_key in (${placeholders(statusKeys)})`,
    ];
    const params: unknown[] = [...statusKeys];

    if (boardFilterLabelIds.length > 0) {
      conditions.push(`
        exists (
          select 1
          from ticket_labels
          where ticket_labels.ticket_id = tickets.id
            and ticket_labels.label_id in (${placeholders(boardFilterLabelIds)})
        )
      `);
      params.push(...boardFilterLabelIds);
    }

    if (filters.priorities.length > 0) {
      conditions.push(`tickets.priority in (${placeholders(filters.priorities)})`);
      params.push(...filters.priorities);
    }

    if (normalizedLabels.length > 0) {
      conditions.push(`
        exists (
          select 1
          from ticket_labels
          inner join labels on labels.id = ticket_labels.label_id
          where ticket_labels.ticket_id = tickets.id
            and labels.normalized_name in (${placeholders(normalizedLabels)})
        )
      `);
      params.push(...normalizedLabels);
    }

    if (filters.q.trim()) {
      const query = `%${escapeLike(filters.q.trim().toLowerCase())}%`;
      conditions.push(`
        (
          lower(tickets.title) like ? escape '\\'
          or lower(tickets.description) like ? escape '\\'
        )
      `);
      params.push(query, query);
    }

    const sql = `
      select tickets.*
      from tickets
      where ${conditions.join(" and ")}
      order by tickets.ui_order asc
    `;

    return this.sqlite.prepare(sql).all(...params) as TicketRow[];
  }

  private selectSystemBoardTicketRows(filters: BoardFilters) {
    const normalizedLabels = uniqueNames(filters.labels).map(normalizeLabelName);
    const conditions = ["tickets.archived_at is null"];
    const params: unknown[] = [];

    if (filters.priorities.length > 0) {
      conditions.push(`tickets.priority in (${placeholders(filters.priorities)})`);
      params.push(...filters.priorities);
    }

    if (normalizedLabels.length > 0) {
      conditions.push(`
        exists (
          select 1
          from ticket_labels
          inner join labels on labels.id = ticket_labels.label_id
          where ticket_labels.ticket_id = tickets.id
            and labels.normalized_name in (${placeholders(normalizedLabels)})
        )
      `);
      params.push(...normalizedLabels);
    }

    if (filters.q.trim()) {
      const query = `%${escapeLike(filters.q.trim().toLowerCase())}%`;
      conditions.push(`
        (
          lower(tickets.title) like ? escape '\\'
          or lower(tickets.description) like ? escape '\\'
        )
      `);
      params.push(query, query);
    }

    return this.sqlite.prepare(`
      select tickets.*
      from tickets
      where ${conditions.join(" and ")}
      order by tickets.ui_order asc
    `).all(...params) as TicketRow[];
  }

  private selectTicketRowsByIds(ticketIds: string[]) {
    if (ticketIds.length === 0) {
      return [] as TicketRow[];
    }

    return this.sqlite
      .prepare(`
        select *
        from tickets
        where id in (${placeholders(ticketIds)})
        order by ui_order asc
      `)
      .all(...ticketIds) as TicketRow[];
  }

  private hydrateTickets(ticketRows: TicketRow[]) {
    if (ticketRows.length === 0) {
      return [] as Ticket[];
    }

    const ticketIds = ticketRows.map((ticket) => ticket.id);
    const labelRows = this.sqlite
      .prepare(`
        select
          ticket_labels.ticket_id as ticketId,
          labels.id,
          labels.name,
          labels.normalized_name
        from ticket_labels
        inner join labels on labels.id = ticket_labels.label_id
        where ticket_labels.ticket_id in (${placeholders(ticketIds)})
        order by labels.name asc
      `)
      .all(...ticketIds) as Array<{
        ticketId: string;
        id: string;
        name: string;
        normalized_name: string;
      }>;

    const labelsByTicketId = new Map<string, Label[]>();

    labelRows.forEach((row) => {
      const existing = labelsByTicketId.get(row.ticketId) ?? [];
      existing.push(this.toLabel(row));
      labelsByTicketId.set(row.ticketId, existing);
    });

    return ticketRows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      priority: row.priority,
      statusKey: row.status_key,
      uiOrder: row.ui_order,
      labels: labelsByTicketId.get(row.id) ?? [],
      completedAt: toIsoString(row.completed_at),
      archivedAt: toIsoString(row.archived_at),
      createdAt: toIsoString(row.created_at)!,
      updatedAt: toIsoString(row.updated_at)!,
    }));
  }

  private getOrCreateLabels(labelNames: string[]) {
    const names = uniqueNames(labelNames);
    if (names.length === 0) {
      return [] as Label[];
    }

    const normalizedNames = names.map(normalizeLabelName);
    const existingRows = this.sqlite
      .prepare(`
        select *
        from labels
        where normalized_name in (${placeholders(normalizedNames)})
      `)
      .all(...normalizedNames) as LabelRow[];

    const existingByNormalizedName = new Map(
      existingRows.map((label) => [label.normalized_name, label]),
    );

    const insert = this.sqlite.prepare(`
      insert into labels (id, name, normalized_name)
      values (?, ?, ?)
    `);

    names.forEach((name) => {
      const normalizedName = normalizeLabelName(name);

      if (existingByNormalizedName.has(normalizedName)) {
        return;
      }

      const row: LabelRow = {
        id: `label_${crypto.randomUUID()}`,
        name,
        normalized_name: normalizedName,
      };

      insert.run(row.id, row.name, row.normalized_name);
      existingByNormalizedName.set(normalizedName, row);
    });

    return normalizedNames
      .map((normalizedName) => existingByNormalizedName.get(normalizedName))
      .filter((label): label is LabelRow => Boolean(label))
      .map((label) => this.toLabel(label));
  }

  private replaceBoardColumns(boardId: string, columnsInput: CreateBoardInput["columns"]) {
    this.sqlite.prepare("delete from columns where board_id = ?").run(boardId);

    const insert = this.sqlite.prepare(`
      insert into columns (id, board_id, key, name, position)
      values (?, ?, ?, ?, ?)
    `);

    columnsInput.forEach((column, index) => {
      const status = this.getOrCreateStatus(column.statusKey, column.statusName);
      insert.run(
        `col_${crypto.randomUUID()}`,
        boardId,
        status.key,
        column.name,
        index,
      );
    });
  }

  private replaceBoardLabelFilters(boardId: string, labelIds: string[]) {
    this.sqlite.prepare("delete from board_label_filters where board_id = ?").run(boardId);

    const existingLabelIds = labelIds.length > 0
      ? new Set(
        (
          this.sqlite
            .prepare(`select id from labels where id in (${placeholders(labelIds)})`)
            .all(...labelIds) as Array<{ id: string }>
        ).map((label) => label.id),
      )
      : new Set<string>();

    if (existingLabelIds.size > 0) {
      const insert = this.sqlite.prepare(`
        insert into board_label_filters (board_id, label_id)
        values (?, ?)
      `);

      existingLabelIds.forEach((labelId) => {
        insert.run(boardId, labelId);
      });
    }

    this.deleteOrphanLabels();
  }

  private replaceBoardDefaultLabel(
    boardId: string,
    filterLabelIds: string[],
    defaultLabelId: string | null,
  ) {
    const nextDefaultLabelId =
      defaultLabelId && filterLabelIds.includes(defaultLabelId) && this.getLabelById(defaultLabelId)
        ? defaultLabelId
        : null;

    this.sqlite
      .prepare("update boards set default_label_id = ? where id = ?")
      .run(nextDefaultLabelId, boardId);
    this.deleteOrphanLabels();
  }

  private deleteOrphanLabels() {
    this.sqlite.exec(`
      delete from labels
      where not exists (
        select 1
        from ticket_labels
        where ticket_labels.label_id = labels.id
      )
      and not exists (
        select 1
        from board_label_filters
        where board_label_filters.label_id = labels.id
      )
      and not exists (
        select 1
        from boards
        where boards.default_label_id = labels.id
      )
    `);
  }

  private getNextGlobalOrder() {
    const row = this.sqlite
      .prepare("select coalesce(max(ui_order), 0) as maxOrder from tickets")
      .get() as { maxOrder: number };

    return row.maxOrder + ORDER_STEP;
  }

  private getCreateTicketOrder(
    boardId: string,
    statusKey: Ticket["statusKey"],
    position: CreateTicketInput["position"],
  ) {
    if (position === "bottom") {
      return this.getNextGlobalOrder();
    }

    const firstTicketInStatus = this.selectVisibleTicketRows(boardId, {
      priorities: [],
      labels: [],
      q: "",
    }).find((ticket) => ticket.status_key === statusKey);

    if (!firstTicketInStatus) {
      return this.getNextGlobalOrder();
    }

    if (firstTicketInStatus.ui_order > 1) {
      return Math.floor(firstTicketInStatus.ui_order / 2);
    }

    this.rebalanceTickets();

    const rebalancedFirstTicketInStatus = this.selectVisibleTicketRows(boardId, {
      priorities: [],
      labels: [],
      q: "",
    }).find((ticket) => ticket.status_key === statusKey);

    return rebalancedFirstTicketInStatus
      ? Math.floor(rebalancedFirstTicketInStatus.ui_order / 2)
      : this.getNextGlobalOrder();
  }

  private computeOrder(prevOrder: number | null, nextOrder: number | null) {
    if (prevOrder === null && nextOrder === null) {
      return ORDER_STEP;
    }

    if (prevOrder !== null && nextOrder === null) {
      return prevOrder + ORDER_STEP;
    }

    if (prevOrder === null && nextOrder !== null) {
      const proposed = Math.floor(nextOrder / 2);
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
    const tickets = this.sqlite
      .prepare("select id from tickets order by ui_order asc")
      .all() as Array<{ id: string }>;
    const update = this.sqlite.prepare("update tickets set ui_order = ? where id = ?");

    tickets.forEach((ticket, index) => {
      update.run((index + 1) * ORDER_STEP, ticket.id);
    });
  }

  private touchAllBoards(updatedAt = Date.now()) {
    this.sqlite.prepare("update boards set updated_at = ?").run(updatedAt);
  }

  private getStatusCategory(statusKey: string) {
    const row = this.sqlite
      .prepare("select category from statuses where key = ?")
      .get(statusKey) as { category: Status["category"] } | undefined;

    return row?.category ?? "active";
  }

  private clearDefaultBoard(nextDefaultBoardId: string) {
    this.sqlite
      .prepare("update boards set is_default = 0 where id != ?")
      .run(nextDefaultBoardId);
  }

  private getOrCreateStatus(statusKey: string, statusName?: string) {
    const normalizedKey = statusKeyFromName(statusKey);
    const existingStatus = this.sqlite
      .prepare("select * from statuses where key = ? limit 1")
      .get(normalizedKey) as StatusRow | undefined;

    if (existingStatus) {
      return this.toStatus(existingStatus);
    }

    const status: Status = {
      key: normalizedKey,
      name: statusName?.trim() || humanizeStatusKey(normalizedKey),
      category: normalizedKey === "done" ? "completed" : "active",
      isSystem: normalizedKey === "todo" || normalizedKey === "in_progress" || normalizedKey === "done",
    };

    this.sqlite
      .prepare(`
        insert into statuses (key, name, category, is_system)
        values (?, ?, ?, ?)
      `)
      .run(status.key, status.name, status.category, status.isSystem ? 1 : 0);

    return status;
  }

  private createUniqueSlug(name: string) {
    const base = slugify(name);
    const rows = this.sqlite
      .prepare("select slug from boards")
      .all() as Array<{ slug: string }>;
    const existingSlugs = new Set(rows.map((row) => row.slug));

    if (!existingSlugs.has(base)) {
      return base;
    }

    let suffix = 2;
    while (existingSlugs.has(`${base}-${suffix}`)) {
      suffix += 1;
    }

    return `${base}-${suffix}`;
  }

  private toBoard(row: BoardRow): Board {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isDefault: Boolean(row.is_default),
      isPinned: Boolean(row.is_pinned),
      showPriorityColors: Boolean(row.show_priority_colors),
      collapseMenusByDefault: Boolean(row.collapse_menus_by_default),
      swimlaneLayout: row.swimlane_layout,
      swimlaneLabelOrder: parseSwimlaneLabelOrder(row.swimlane_label_order),
      isSystem: Boolean(row.is_system),
      createdAt: toIsoString(row.created_at)!,
      updatedAt: toIsoString(row.updated_at)!,
    };
  }

  private toColumn(row: ColumnRow): Column {
    return {
      id: row.id,
      boardId: row.board_id,
      name: row.name,
      statusKey: row.key,
      statusName: row.status_name,
      statusCategory: row.status_category,
      position: row.position,
    };
  }

  private toStatus(row: StatusRow): Status {
    return {
      key: row.key,
      name: row.name,
      category: row.category,
      isSystem: Boolean(row.is_system),
    };
  }

  private toLabel(row: Pick<LabelRow, "id" | "name" | "normalized_name">): Label {
    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
    };
  }

  private resolveSystemBoardStatusKey(
    requestedStatusKey: string,
    existingStatusKey?: string | null,
  ) {
    if (requestedStatusKey === SYSTEM_BOARD_DONE_STATUS_KEY_VALUE) {
      return "done";
    }

    if (requestedStatusKey === SYSTEM_BOARD_ACTIVE_STATUS_KEY_VALUE) {
      return existingStatusKey && this.getStatusCategory(existingStatusKey) === "active"
        ? existingStatusKey
        : "todo";
    }

    return requestedStatusKey;
  }

  private ensureSystemBoard() {
    const now = Date.now();
    const systemBoards = this.sqlite
      .prepare("select * from boards where is_system = 1 order by created_at asc, id asc")
      .all() as BoardRow[];
    let systemBoard = systemBoards[0] ? this.toBoard(systemBoards[0]) : null;

    this.sqlite.transaction(() => {
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
          collapseMenusByDefault: false,
          swimlaneLayout: "none",
          swimlaneLabelOrder: [],
          isSystem: true,
          createdAt: new Date(now).toISOString(),
          updatedAt: new Date(now).toISOString(),
        };

        if (systemBoard.isDefault) {
          this.clearDefaultBoard(systemBoard.id);
        }

        this.sqlite
          .prepare(`
            insert into boards (id, slug, name, description, is_default, is_pinned, show_priority_colors, collapse_menus_by_default, swimlane_layout, swimlane_label_order, is_system, created_at, updated_at)
            values (?, ?, ?, ?, ?, 1, 1, 0, ?, ?, 1, ?, ?)
          `)
          .run(
            systemBoard.id,
            systemBoard.slug,
            SYSTEM_BOARD_NAME_VALUE,
            SYSTEM_BOARD_DESCRIPTION_VALUE,
            systemBoard.isDefault ? 1 : 0,
            systemBoard.swimlaneLayout,
            serializeSwimlaneLabelOrder(systemBoard.swimlaneLabelOrder),
            now,
            now,
          );
      } else {
        this.sqlite
          .prepare(`
            update boards
            set name = ?, description = ?, is_system = 1, updated_at = ?
            where id = ?
          `)
          .run(
            SYSTEM_BOARD_NAME_VALUE,
            SYSTEM_BOARD_DESCRIPTION_VALUE,
            now,
            systemBoard.id,
          );
      }

      if (systemBoards.length > 1) {
        this.sqlite
          .prepare("update boards set is_system = 0, updated_at = ? where is_system = 1 and id != ?")
          .run(now, systemBoard.id);
      }

    })();
  }
}
