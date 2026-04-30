import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const boards = sqliteTable("boards", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => ({
  slugUnique: uniqueIndex("boards_slug_unique").on(table.slug),
}));

export const columns = sqliteTable("columns", {
  id: text("id").primaryKey(),
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
}, (table) => ({
  boardPositionUnique: uniqueIndex("columns_board_position_unique").on(
    table.boardId,
    table.position,
  ),
  boardKeyUnique: uniqueIndex("columns_board_key_unique").on(
    table.boardId,
    table.key,
  ),
}));

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
}, (table) => ({
  boardNormalizedNameUnique: uniqueIndex("labels_board_normalized_name_unique").on(
    table.boardId,
    table.normalizedName,
  ),
}));

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  columnId: text("column_id")
    .notNull()
    .references(() => columns.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  priority: text("priority").notNull().default("medium"),
  uiOrder: integer("ui_order").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => ({
  boardOrderIndex: index("tickets_board_ui_order_idx").on(table.boardId, table.uiOrder),
  boardColumnOrderIndex: index("tickets_board_column_ui_order_idx").on(
    table.boardId,
    table.columnId,
    table.uiOrder,
  ),
  boardPriorityIndex: index("tickets_board_priority_idx").on(
    table.boardId,
    table.priority,
  ),
}));

export const ticketLabels = sqliteTable("ticket_labels", {
  ticketId: text("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  labelId: text("label_id")
    .notNull()
    .references(() => labels.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.ticketId, table.labelId] }),
  labelIndex: index("ticket_labels_label_idx").on(table.labelId),
}));
