PRAGMA foreign_keys = ON;

CREATE TABLE `boards` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `slug` TEXT NOT NULL,
  `name` TEXT NOT NULL,
  `description` TEXT NOT NULL DEFAULT '',
  `is_system` INTEGER NOT NULL DEFAULT 0,
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
  `name` TEXT NOT NULL,
  `normalized_name` TEXT NOT NULL
);

CREATE UNIQUE INDEX `labels_normalized_name_unique`
  ON `labels` (`normalized_name`);

CREATE TABLE `board_label_filters` (
  `board_id` TEXT NOT NULL,
  `label_id` TEXT NOT NULL,
  PRIMARY KEY (`board_id`, `label_id`),
  FOREIGN KEY (`board_id`) REFERENCES `boards` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`label_id`) REFERENCES `labels` (`id`) ON DELETE CASCADE
);

CREATE INDEX `board_label_filters_label_idx`
  ON `board_label_filters` (`label_id`);

CREATE TABLE `tickets` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `status_key` TEXT NOT NULL,
  `title` TEXT NOT NULL,
  `description` TEXT NOT NULL DEFAULT '',
  `priority` TEXT NOT NULL DEFAULT 'medium',
  `ui_order` INTEGER NOT NULL,
  `archived_at` INTEGER,
  `created_at` INTEGER NOT NULL,
  `updated_at` INTEGER NOT NULL,
  CHECK (`priority` IN ('highest', 'high', 'medium', 'low'))
);

CREATE INDEX `tickets_ui_order_idx`
  ON `tickets` (`ui_order`);

CREATE INDEX `tickets_status_ui_order_idx`
  ON `tickets` (`status_key`, `ui_order`);

CREATE INDEX `tickets_priority_idx`
  ON `tickets` (`priority`);

CREATE INDEX `tickets_archived_ui_order_idx`
  ON `tickets` (`archived_at`, `ui_order`);

CREATE TABLE `ticket_labels` (
  `ticket_id` TEXT NOT NULL,
  `label_id` TEXT NOT NULL,
  PRIMARY KEY (`ticket_id`, `label_id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`label_id`) REFERENCES `labels` (`id`) ON DELETE CASCADE
);

CREATE INDEX `ticket_labels_label_idx`
  ON `ticket_labels` (`label_id`);

INSERT INTO `boards` (`id`, `slug`, `name`, `description`, `is_system`, `created_at`, `updated_at`)
VALUES (
  'board_default',
  'default',
  'My Board',
  'Default kanban board',
  1,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000,
  CAST(strftime('%s', 'now') AS INTEGER) * 1000
);

INSERT INTO `columns` (`id`, `board_id`, `key`, `name`, `position`)
VALUES
  ('col_todo', 'board_default', 'todo', 'Todo', 0),
  ('col_in_progress', 'board_default', 'in_progress', 'In Progress', 1),
  ('col_done', 'board_default', 'done', 'Done', 2);
