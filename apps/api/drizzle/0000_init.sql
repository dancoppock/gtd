PRAGMA foreign_keys = ON;

CREATE TABLE `boards` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `slug` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `created_at` INTEGER NOT NULL,
  `updated_at` INTEGER NOT NULL
);

CREATE UNIQUE INDEX `boards_slug_unique`
  ON `boards` (`slug`);

CREATE TABLE `columns` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `board_id` TEXT NOT NULL,
  `key` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `position` INTEGER NOT NULL,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX `columns_board_position_unique`
  ON `columns` (`board_id`, `position`);

CREATE UNIQUE INDEX `columns_board_key_unique`
  ON `columns` (`board_id`, `key`);

CREATE TABLE `labels` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `board_id` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `normalized_name` TEXT NOT NULL,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX `labels_board_normalized_name_unique`
  ON `labels` (`board_id`, `normalized_name`);

CREATE TABLE `tickets` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `board_id` TEXT NOT NULL,
  `column_id` TEXT NOT NULL,
  `title` TEXT NOT NULL,
  `description` TEXT NOT NULL DEFAULT '',
  `priority` TEXT NOT NULL DEFAULT 'medium',
  `ui_order` INTEGER NOT NULL,
  `archived_at` INTEGER,
  `created_at` INTEGER NOT NULL,
  `updated_at` INTEGER NOT NULL,
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`column_id`) REFERENCES `columns` (`id`) ON DELETE RESTRICT,
  CHECK (`priority` IN ('highest', 'high', 'medium', 'low'))
);

CREATE INDEX `tickets_board_ui_order_idx`
  ON `tickets` (`board_id`, `ui_order`);

CREATE INDEX `tickets_board_column_ui_order_idx`
  ON `tickets` (`board_id`, `column_id`, `ui_order`);

CREATE INDEX `tickets_board_priority_idx`
  ON `tickets` (`board_id`, `priority`);

CREATE INDEX `tickets_board_archived_ui_order_idx`
  ON `tickets` (`board_id`, `archived_at`, `ui_order`);

CREATE TABLE `ticket_labels` (
  `ticket_id` TEXT NOT NULL,
  `label_id` TEXT NOT NULL,
  PRIMARY KEY (`ticket_id`, `label_id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`label_id`) REFERENCES `labels` (`id`) ON DELETE CASCADE
);

CREATE INDEX `ticket_labels_label_idx`
  ON `ticket_labels` (`label_id`);

INSERT INTO `boards` (`id`, `slug`, `name`, `created_at`, `updated_at`)
VALUES (
  'board_default',
  'default',
  'My Board',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

INSERT INTO `columns` (`id`, `board_id`, `key`, `name`, `position`)
VALUES
  ('col_todo', 'board_default', 'todo', 'Todo', 0),
  ('col_in_progress', 'board_default', 'in_progress', 'In Progress', 1),
  ('col_done', 'board_default', 'done', 'Done', 2);
