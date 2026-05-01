import type {
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
import {
  and,
  asc,
  eq,
  exists,
  inArray,
  sql,
  type SQL,
} from "drizzle-orm";

import { createSeedData } from "../data/seed.js";
import { createDatabaseClient, type DatabaseClient } from "../db/client.js";
import {
  boards,
  columns,
  labels,
  ticketLabels,
  tickets,
} from "../db/schema.js";

const ORDER_STEP = 1_000_000;

function normalizeLabelName(label: string) {
  return label.trim().toLowerCase();
}

function uniqueNames(labelsToNormalize: string[]) {
  return Array.from(
    new Set(
      labelsToNormalize
        .map((label) => label.trim())
        .filter(Boolean),
    ),
  );
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function toIsoString(date: Date) {
  return date.toISOString();
}

function buildWhereClause(conditions: SQL[]) {
  if (conditions.length === 1) {
    return conditions[0];
  }

  return and(...conditions);
}

export class SqliteBoardStore {
  private readonly client: DatabaseClient;
  private readonly db: DatabaseClient["db"];

  constructor(client = createDatabaseClient()) {
    this.client = client;
    this.db = client.db;
    this.seedDemoDataIfNeeded();
  }

  listBoards() {
    return this.db
      .select()
      .from(boards)
      .orderBy(asc(boards.name))
      .all()
      .map((board) => this.toBoard(board));
  }

  getBoardById(boardId: string) {
    const board = this.db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .all()[0];

    return board ? this.toBoard(board) : null;
  }

  getBoardBySlug(slug: string) {
    const board = this.db
      .select()
      .from(boards)
      .where(eq(boards.slug, slug))
      .all()[0];

    return board ? this.toBoard(board) : null;
  }

  getBoardDetail(boardId: string): BoardDetail | null {
    const board = this.db
      .select()
      .from(boards)
      .where(eq(boards.id, boardId))
      .all()[0];

    if (!board) {
      return null;
    }

    return {
      ...this.toBoard(board),
      columns: this.getColumnsForBoard(boardId),
      labels: this.getLabelsForBoard(boardId),
    };
  }

  listTickets(boardId: string, filters: BoardFilters) {
    const conditions: SQL[] = [eq(tickets.boardId, boardId)];
    const normalizedLabels = uniqueNames(filters.labels).map(normalizeLabelName);

    if (filters.priorities.length > 0) {
      conditions.push(inArray(tickets.priority, filters.priorities));
    }

    if (normalizedLabels.length > 0) {
      const labelFilterQuery = this.db
        .select({ one: sql<number>`1` })
        .from(ticketLabels)
        .innerJoin(labels, eq(ticketLabels.labelId, labels.id))
        .where(
          and(
            eq(ticketLabels.ticketId, tickets.id),
            inArray(labels.normalizedName, normalizedLabels),
          ),
        );

      conditions.push(exists(labelFilterQuery));
    }

    if (filters.q.trim()) {
      const query = `%${escapeLike(filters.q.trim().toLowerCase())}%`;
      conditions.push(
        sql`(
          lower(${tickets.title}) like ${query} escape '\\'
          or lower(${tickets.description}) like ${query} escape '\\'
        )`,
      );
    }

    const ticketRows = this.db
      .select()
      .from(tickets)
      .where(buildWhereClause(conditions))
      .orderBy(asc(tickets.uiOrder))
      .all();

    return this.hydrateTickets(ticketRows);
  }

  createTicket(boardId: string, input: CreateTicketInput) {
    const board = this.getBoardById(boardId);
    if (!board) {
      return null;
    }

    const column = this.getBoardColumn(boardId, input.columnId);
    if (!column) {
      return null;
    }

    return this.db.transaction((tx) => {
      const labelRows = this.getOrCreateBoardLabels(tx, boardId, input.labels);
      const now = new Date();
      const ticketId = `ticket_${crypto.randomUUID()}`;
      const nextOrder = this.getNextBoardOrder(tx, boardId);

      tx.insert(tickets)
        .values({
          id: ticketId,
          boardId,
          columnId: column.id,
          title: input.title,
          description: input.description,
          priority: input.priority,
          uiOrder: nextOrder,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      if (labelRows.length > 0) {
        tx.insert(ticketLabels)
          .values(
            labelRows.map((label) => ({
              ticketId,
              labelId: label.id,
            })),
          )
          .run();
      }

      tx.update(boards)
        .set({ updatedAt: now })
        .where(eq(boards.id, boardId))
        .run();

      const insertedTicket = tx
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .all()[0];

      if (!insertedTicket) {
        return null;
      }

      return this.hydrateTickets([insertedTicket], tx)[0] ?? null;
    });
  }

  updateTicket(ticketId: string, input: UpdateTicketInput) {
    return this.db.transaction((tx) => {
      const existingTicket = tx
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .all()[0];

      if (!existingTicket) {
        return null;
      }

      if (input.columnId) {
        const column = this.getBoardColumn(existingTicket.boardId, input.columnId, tx);
        if (!column) {
          return null;
        }
      }

      tx.update(tickets)
        .set({
          title: input.title ?? existingTicket.title,
          description: input.description ?? existingTicket.description,
          columnId: input.columnId ?? existingTicket.columnId,
          priority: input.priority ?? existingTicket.priority,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticketId))
        .run();

      if (input.labels) {
        const labelRows = this.getOrCreateBoardLabels(tx, existingTicket.boardId, input.labels);

        tx.delete(ticketLabels)
          .where(eq(ticketLabels.ticketId, ticketId))
          .run();

        if (labelRows.length > 0) {
          tx.insert(ticketLabels)
            .values(
              labelRows.map((label) => ({
                ticketId,
                labelId: label.id,
              })),
            )
            .run();
        }

        this.deleteOrphanBoardLabels(tx, existingTicket.boardId);
      }

      tx.update(boards)
        .set({ updatedAt: new Date() })
        .where(eq(boards.id, existingTicket.boardId))
        .run();

      const updatedTicket = tx
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .all()[0];

      if (!updatedTicket) {
        return null;
      }

      return this.hydrateTickets([updatedTicket], tx)[0] ?? null;
    });
  }

  deleteTicket(ticketId: string) {
    return this.db.transaction((tx) => {
      const existingTicket = tx
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .all()[0];

      if (!existingTicket) {
        return false;
      }

      tx.delete(tickets)
        .where(eq(tickets.id, ticketId))
        .run();

      this.deleteOrphanBoardLabels(tx, existingTicket.boardId);

      tx.update(boards)
        .set({ updatedAt: new Date() })
        .where(eq(boards.id, existingTicket.boardId))
        .run();

      return true;
    });
  }

  repositionTicket(ticketId: string, input: RepositionTicketInput) {
    return this.db.transaction((tx) => {
      const existingTicket = tx
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .all()[0];

      if (!existingTicket) {
        return null;
      }

      const nextColumn = this.getBoardColumn(existingTicket.boardId, input.columnId, tx);
      if (!nextColumn) {
        return null;
      }

      let previousTicket = input.prevVisibleTicketId
        ? tx.select().from(tickets).where(eq(tickets.id, input.prevVisibleTicketId)).all()[0] ?? null
        : null;
      let nextTicket = input.nextVisibleTicketId
        ? tx.select().from(tickets).where(eq(tickets.id, input.nextVisibleTicketId)).all()[0] ?? null
        : null;

      let nextOrder = this.computeOrder(previousTicket?.uiOrder ?? null, nextTicket?.uiOrder ?? null);

      if (nextOrder === null) {
        this.rebalanceBoard(tx, existingTicket.boardId);
        previousTicket = input.prevVisibleTicketId
          ? tx.select().from(tickets).where(eq(tickets.id, input.prevVisibleTicketId)).all()[0] ?? null
          : null;
        nextTicket = input.nextVisibleTicketId
          ? tx.select().from(tickets).where(eq(tickets.id, input.nextVisibleTicketId)).all()[0] ?? null
          : null;
        nextOrder = this.computeOrder(previousTicket?.uiOrder ?? null, nextTicket?.uiOrder ?? null);
      }

      if (nextOrder === null) {
        return null;
      }

      tx.update(tickets)
        .set({
          columnId: nextColumn.id,
          uiOrder: nextOrder,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, ticketId))
        .run();

      tx.update(boards)
        .set({ updatedAt: new Date() })
        .where(eq(boards.id, existingTicket.boardId))
        .run();

      const updatedTicket = tx
        .select()
        .from(tickets)
        .where(eq(tickets.id, ticketId))
        .all()[0];

      if (!updatedTicket) {
        return null;
      }

      return this.hydrateTickets([updatedTicket], tx)[0] ?? null;
    });
  }

  dispose() {
    this.client.sqlite.close();
  }

  private seedDemoDataIfNeeded() {
    const existingTicketCount =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(tickets)
        .all()[0]?.count ?? 0;

    if (existingTicketCount > 0) {
      return;
    }

    const seedData = createSeedData();

    this.db.transaction((tx) => {
      tx.insert(boards)
        .values(
          seedData.boards.map((board) => ({
            id: board.id,
            slug: board.slug,
            name: board.name,
            createdAt: new Date(board.createdAt),
            updatedAt: new Date(board.updatedAt),
          })),
        )
        .onConflictDoNothing()
        .run();

      tx.insert(columns)
        .values(
          seedData.columns.map((column) => ({
            id: column.id,
            boardId: column.boardId,
            key: column.key,
            name: column.name,
            position: column.position,
          })),
        )
        .onConflictDoNothing()
        .run();

      tx.insert(labels)
        .values(
          seedData.labels.map((label) => ({
            id: label.id,
            boardId: label.boardId,
            name: label.name,
            normalizedName: label.normalizedName,
          })),
        )
        .onConflictDoNothing()
        .run();

      tx.insert(tickets)
        .values(
          seedData.tickets.map((ticket) => ({
            id: ticket.id,
            boardId: ticket.boardId,
            columnId: ticket.columnId,
            title: ticket.title,
            description: ticket.description,
            priority: ticket.priority,
            uiOrder: ticket.uiOrder,
            createdAt: new Date(ticket.createdAt),
            updatedAt: new Date(ticket.updatedAt),
          })),
        )
        .onConflictDoNothing()
        .run();

      tx.insert(ticketLabels)
        .values(
          seedData.tickets.flatMap((ticket) =>
            ticket.labelIds.map((labelId) => ({
              ticketId: ticket.id,
              labelId,
            })),
          ),
        )
        .onConflictDoNothing()
        .run();
    });
  }

  private getColumnsForBoard(boardId: string) {
    return this.db
      .select()
      .from(columns)
      .where(eq(columns.boardId, boardId))
      .orderBy(asc(columns.position))
      .all()
      .map((column) => this.toColumn(column));
  }

  private getLabelsForBoard(boardId: string) {
    return this.db
      .select()
      .from(labels)
      .where(eq(labels.boardId, boardId))
      .orderBy(asc(labels.name))
      .all()
      .map((label) => this.toLabel(label));
  }

  private getBoardColumn(
    boardId: string,
    columnId: string,
    executor: DatabaseClient["db"] = this.db,
  ) {
    return executor
      .select()
      .from(columns)
      .where(and(eq(columns.id, columnId), eq(columns.boardId, boardId)))
      .all()[0] ?? null;
  }

  private getNextBoardOrder(executor: DatabaseClient["db"], boardId: string) {
    const currentMax =
      executor
        .select({ maxOrder: sql<number>`max(${tickets.uiOrder})` })
        .from(tickets)
        .where(eq(tickets.boardId, boardId))
        .all()[0]?.maxOrder ?? 0;

    return currentMax + ORDER_STEP;
  }

  private getOrCreateBoardLabels(
    executor: DatabaseClient["db"],
    boardId: string,
    labelNames: string[],
  ) {
    const names = uniqueNames(labelNames);
    if (names.length === 0) {
      return [];
    }

    const normalizedNames = names.map(normalizeLabelName);
    const existingLabels = executor
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.boardId, boardId),
          inArray(labels.normalizedName, normalizedNames),
        ),
      )
      .all();

    const existingByName = new Map(
      existingLabels.map((label) => [label.normalizedName, label]),
    );

    const labelsToInsert = names
      .map((name) => ({
        id: `label_${crypto.randomUUID()}`,
        boardId,
        name,
        normalizedName: normalizeLabelName(name),
      }))
      .filter((label) => !existingByName.has(label.normalizedName));

    if (labelsToInsert.length > 0) {
      executor
        .insert(labels)
        .values(labelsToInsert)
        .onConflictDoNothing()
        .run();
    }

    return executor
      .select()
      .from(labels)
      .where(
        and(
          eq(labels.boardId, boardId),
          inArray(labels.normalizedName, normalizedNames),
        ),
      )
      .all();
  }

  private deleteOrphanBoardLabels(
    executor: DatabaseClient["db"],
    boardId: string,
  ) {
    executor.delete(labels)
      .where(
        sql`${labels.boardId} = ${boardId}
          and not exists (
            select 1
            from ${ticketLabels}
            where ${ticketLabels.labelId} = ${labels.id}
          )`,
      )
      .run();
  }

  private computeOrder(previousOrder: number | null, nextOrder: number | null) {
    if (previousOrder === null && nextOrder === null) {
      return ORDER_STEP;
    }

    if (previousOrder !== null && nextOrder === null) {
      return previousOrder + ORDER_STEP;
    }

    if (previousOrder === null && nextOrder !== null) {
      const proposed = nextOrder - ORDER_STEP;
      return proposed > 0 ? proposed : null;
    }

    if (previousOrder !== null && nextOrder !== null) {
      const gap = nextOrder - previousOrder;
      if (gap <= 1) {
        return null;
      }

      return previousOrder + Math.floor(gap / 2);
    }

    return null;
  }

  private rebalanceBoard(executor: DatabaseClient["db"], boardId: string) {
    const boardTickets = executor
      .select()
      .from(tickets)
      .where(eq(tickets.boardId, boardId))
      .orderBy(asc(tickets.uiOrder))
      .all();

    boardTickets.forEach((ticket, index) => {
      executor
        .update(tickets)
        .set({
          uiOrder: (index + 1) * ORDER_STEP,
        })
        .where(eq(tickets.id, ticket.id))
        .run();
    });
  }

  private hydrateTickets(
    ticketRows: Array<typeof tickets.$inferSelect>,
    executor: DatabaseClient["db"] = this.db,
  ) {
    if (ticketRows.length === 0) {
      return [];
    }

    const ticketIds = ticketRows.map((ticket) => ticket.id);
    const labelRows = executor
      .select({
        ticketId: ticketLabels.ticketId,
        id: labels.id,
        boardId: labels.boardId,
        name: labels.name,
        normalizedName: labels.normalizedName,
      })
      .from(ticketLabels)
      .innerJoin(labels, eq(ticketLabels.labelId, labels.id))
      .where(inArray(ticketLabels.ticketId, ticketIds))
      .orderBy(asc(labels.name))
      .all();

    const labelsByTicket = new Map<string, Label[]>();

    labelRows.forEach((label) => {
      const ticketLabelsForTicket = labelsByTicket.get(label.ticketId) ?? [];
      ticketLabelsForTicket.push({
        id: label.id,
        boardId: label.boardId,
        name: label.name,
        normalizedName: label.normalizedName,
      });
      labelsByTicket.set(label.ticketId, ticketLabelsForTicket);
    });

    return ticketRows.map((ticket) => ({
      id: ticket.id,
      boardId: ticket.boardId,
      columnId: ticket.columnId,
      title: ticket.title,
      description: ticket.description,
      priority: ticket.priority as Ticket["priority"],
      uiOrder: ticket.uiOrder,
      labels: labelsByTicket.get(ticket.id) ?? [],
      createdAt: toIsoString(ticket.createdAt),
      updatedAt: toIsoString(ticket.updatedAt),
    }));
  }

  private toBoard(board: typeof boards.$inferSelect): Board {
    return {
      id: board.id,
      slug: board.slug,
      name: board.name,
      createdAt: toIsoString(board.createdAt),
      updatedAt: toIsoString(board.updatedAt),
    };
  }

  private toColumn(column: typeof columns.$inferSelect): Column {
    return {
      id: column.id,
      boardId: column.boardId,
      key: column.key as Column["key"],
      name: column.name,
      position: column.position,
    };
  }

  private toLabel(label: typeof labels.$inferSelect): Label {
    return {
      id: label.id,
      boardId: label.boardId,
      name: label.name,
      normalizedName: label.normalizedName,
    };
  }
}
