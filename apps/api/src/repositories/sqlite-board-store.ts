import type Database from "better-sqlite3";
import type {
  ArchiveDoneTicketsResponse,
  Board,
  BoardDetail,
  BoardFilters,
  Column,
  CreateBoardInput,
  CreateTicketInput,
  Label,
  RepositionTicketInput,
  Ticket,
  UpdateBoardInput,
  UpdateLabelInput,
  UpdateTicketInput,
} from "@gtd/contracts";

import { createSeedData } from "../data/seed.js";
import { createDatabaseClient, type DatabaseClient } from "../db/client.js";

const ORDER_STEP = 1_000_000;

type BoardRow = {
  id: string;
  slug: string;
  name: string;
  description: string;
  is_default: number;
  is_system: number;
  created_at: number;
  updated_at: number;
};

type ColumnRow = {
  id: string;
  board_id: string;
  key: Column["statusKey"];
  name: string;
  position: number;
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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "board";
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
  }

  listBoards() {
    const rows = this.sqlite
      .prepare("select * from boards order by name asc")
      .all() as BoardRow[];

    return rows.map((row) => this.toBoard(row));
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
      columns: this.getColumnsForBoard(boardId),
      availableLabels: this.getAllLabels(),
      filterLabels: this.getBoardFilterLabels(boardId),
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
          insert into boards (id, slug, name, description, is_default, is_system, created_at, updated_at)
          values (?, ?, ?, ?, ?, 0, ?, ?)
        `)
        .run(boardId, slug, input.name, input.description, isDefault ? 1 : 0, now, now);

      this.replaceBoardColumns(boardId, input.columns);
      this.replaceBoardLabelFilters(boardId, input.filterLabelIds);
    })();

    return this.getBoardDetail(boardId)!;
  }

  updateBoard(boardId: string, input: UpdateBoardInput) {
    const existingBoard = this.getBoardById(boardId);
    if (!existingBoard) {
      return null;
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
          set name = ?, description = ?, is_default = ?, updated_at = ?
          where id = ?
        `)
        .run(input.name, input.description, shouldStayDefault ? 1 : 0, updatedAt, boardId);

      this.replaceBoardColumns(boardId, input.columns);
      this.replaceBoardLabelFilters(boardId, input.filterLabelIds);
    })();

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

  listTickets(boardId: string, filters: BoardFilters) {
    return this.hydrateTickets(this.selectVisibleTicketRows(boardId, filters));
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

    const ticketId = `ticket_${crypto.randomUUID()}`;
    const now = Date.now();

    this.sqlite.transaction(() => {
      const boardFilterLabelNames = this.getBoardFilterLabels(boardId).map((label) => label.name);
      const labels = this.getOrCreateLabels([...input.labels, ...boardFilterLabelNames]);
      const nextOrder = this.getNextGlobalOrder();

      this.sqlite
        .prepare(`
          insert into tickets (id, status_key, title, description, priority, ui_order, archived_at, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, null, ?, ?)
        `)
        .run(
          ticketId,
          input.statusKey,
          input.title,
          input.description,
          input.priority,
          nextOrder,
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

    this.sqlite.transaction(() => {
      this.sqlite
        .prepare(`
          update tickets
          set
            status_key = ?,
            title = ?,
            description = ?,
            priority = ?,
            updated_at = ?
          where id = ?
        `)
        .run(
          input.statusKey ?? existingTicket.status_key,
          input.title ?? existingTicket.title,
          input.description ?? existingTicket.description,
          input.priority ?? existingTicket.priority,
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
      .filter((ticket) => ticket.status_key === "done")
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
      this.sqlite
        .prepare(`
          update tickets
          set status_key = ?, ui_order = ?, updated_at = ?
          where id = ?
        `)
        .run(input.statusKey, nextOrder, updatedAt, ticketId);

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
        insert or ignore into boards (id, slug, name, description, is_default, is_system, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
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
        insert or ignore into tickets (id, status_key, title, description, priority, ui_order, archived_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          board.isSystem ? 1 : 0,
          Date.parse(board.createdAt),
          Date.parse(board.updatedAt),
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

  private getColumnsForBoard(boardId: string) {
    const rows = this.sqlite
      .prepare(`
        select * from columns
        where board_id = ?
        order by position asc
      `)
      .all(boardId) as ColumnRow[];

    return rows.map((row) => this.toColumn(row));
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

  private selectVisibleTicketRows(boardId: string, filters: BoardFilters) {
    const columns = this.getColumnsForBoard(boardId);
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
      insert.run(
        `col_${crypto.randomUUID()}`,
        boardId,
        column.statusKey,
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
    `);
  }

  private getNextGlobalOrder() {
    const row = this.sqlite
      .prepare("select coalesce(max(ui_order), 0) as maxOrder from tickets")
      .get() as { maxOrder: number };

    return row.maxOrder + ORDER_STEP;
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

  private clearDefaultBoard(nextDefaultBoardId: string) {
    this.sqlite
      .prepare("update boards set is_default = 0 where id != ?")
      .run(nextDefaultBoardId);
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
      position: row.position,
    };
  }

  private toLabel(row: Pick<LabelRow, "id" | "name" | "normalized_name">): Label {
    return {
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
    };
  }
}
