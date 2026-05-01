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
  description: text("description").notNull().default(""),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
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
  statusKey: text("key").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull(),
}, (table) => ({
  boardPositionUnique: uniqueIndex("columns_board_position_unique").on(
    table.boardId,
    table.position,
  ),
  boardStatusUnique: uniqueIndex("columns_board_key_unique").on(
    table.boardId,
    table.statusKey,
  ),
}));

export const labels = sqliteTable("labels", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  normalizedName: text("normalized_name").notNull(),
}, (table) => ({
  normalizedNameUnique: uniqueIndex("labels_normalized_name_unique").on(
    table.normalizedName,
  ),
}));

export const boardLabelFilters = sqliteTable("board_label_filters", {
  boardId: text("board_id")
    .notNull()
    .references(() => boards.id, { onDelete: "cascade" }),
  labelId: text("label_id")
    .notNull()
    .references(() => labels.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.boardId, table.labelId] }),
  labelIndex: index("board_label_filters_label_idx").on(table.labelId),
}));

export const tickets = sqliteTable("tickets", {
  id: text("id").primaryKey(),
  statusKey: text("status_key").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  priority: text("priority").notNull().default("medium"),
  uiOrder: integer("ui_order").notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => ({
  orderIndex: index("tickets_ui_order_idx").on(table.uiOrder),
  statusOrderIndex: index("tickets_status_ui_order_idx").on(table.statusKey, table.uiOrder),
  priorityIndex: index("tickets_priority_idx").on(table.priority),
  archivedOrderIndex: index("tickets_archived_ui_order_idx").on(table.archivedAt, table.uiOrder),
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
