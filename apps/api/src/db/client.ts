import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

export const defaultDatabaseFilename = fileURLToPath(new URL("../../data/gtd.sqlite", import.meta.url));
const initialMigrationFilename = fileURLToPath(new URL("../../drizzle/0000_init.sql", import.meta.url));

export type DatabaseClient = {
  db: BetterSQLite3Database<typeof schema>;
  filename: string;
  sqlite: Database.Database;
};

function hasTable(sqlite: Database.Database, tableName: string) {
  const row = sqlite
    .prepare(
      "select name from sqlite_master where type = 'table' and name = ? limit 1",
    )
    .get(tableName);

  return Boolean(row);
}

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string) {
  if (!hasTable(sqlite, tableName)) {
    return false;
  }

  const rows = sqlite.prepare(`pragma table_info(${tableName})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === columnName);
}

function ensureBoardFields(sqlite: Database.Database) {
  if (!hasColumn(sqlite, "boards", "description")) {
    sqlite.exec("alter table boards add column description text not null default ''");
  }

  if (!hasColumn(sqlite, "boards", "is_default")) {
    sqlite.exec("alter table boards add column is_default integer not null default 0");
  }

  if (!hasColumn(sqlite, "boards", "is_pinned")) {
    sqlite.exec("alter table boards add column is_pinned integer not null default 0");
    sqlite.exec("update boards set is_pinned = 1 where slug = 'default'");
  }

  if (!hasColumn(sqlite, "boards", "show_priority_colors")) {
    sqlite.exec("alter table boards add column show_priority_colors integer not null default 1");
  }

  if (!hasColumn(sqlite, "boards", "is_system")) {
    sqlite.exec("alter table boards add column is_system integer not null default 0");
  }

  sqlite.exec("update boards set is_system = 1 where slug = 'default'");

  const firstDefaultRow = sqlite
    .prepare(`
      select id
      from boards
      where is_default = 1
      order by created_at asc, name asc
      limit 1
    `)
    .get() as { id: string } | undefined;

  const fallbackDefaultRow = firstDefaultRow ?? sqlite
    .prepare(`
      select id
      from boards
      order by case when slug = 'default' then 0 else 1 end, created_at asc, name asc
      limit 1
    `)
    .get() as { id: string } | undefined;

  if (fallbackDefaultRow) {
    sqlite.prepare("update boards set is_default = case when id = ? then 1 else 0 end").run(
      fallbackDefaultRow.id,
    );
  }
}

function humanizeStatusKey(statusKey: string) {
  return statusKey
    .trim()
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Status";
}

function ensureStatusesTable(sqlite: Database.Database) {
  sqlite.exec(`
    create table if not exists statuses (
      key text primary key not null,
      name text not null,
      category text not null default 'active',
      is_system integer not null default 0
    );
    create unique index if not exists statuses_name_unique on statuses (name);
  `);

  if (!hasColumn(sqlite, "statuses", "category")) {
    sqlite.exec("alter table statuses add column category text not null default 'active'");
  }

  if (!hasColumn(sqlite, "statuses", "is_system")) {
    sqlite.exec("alter table statuses add column is_system integer not null default 0");
  }
}

function ensureStatusesData(sqlite: Database.Database) {
  ensureStatusesTable(sqlite);

  sqlite.exec(`
    insert or ignore into statuses (key, name, category, is_system)
    values
      ('todo', 'Todo', 'active', 1),
      ('in_progress', 'In Progress', 'active', 1),
      ('done', 'Done', 'completed', 1);
  `);

  sqlite.exec(`
    update statuses
    set
      category = case when key = 'done' then 'completed' else coalesce(category, 'active') end,
      is_system = case when key in ('todo', 'in_progress', 'done') then 1 else is_system end
    where key in ('todo', 'in_progress', 'done');
  `);

  const statusRows = sqlite.prepare(`
    select distinct status_key as key
    from tickets
    where status_key is not null and trim(status_key) != ''
    union
    select distinct key
    from columns
    where key is not null and trim(key) != ''
  `).all() as Array<{ key: string }>;

  const insert = sqlite.prepare(`
    insert or ignore into statuses (key, name, category, is_system)
    values (?, ?, ?, 0)
  `);

  statusRows.forEach(({ key }) => {
    insert.run(key, humanizeStatusKey(key), key === "done" ? "completed" : "active");
  });
}

function createBoardLabelFilters(sqlite: Database.Database) {
  sqlite.exec(`
    create table if not exists board_label_filters (
      board_id text not null references boards(id) on delete cascade,
      label_id text not null references labels(id) on delete cascade,
      primary key (board_id, label_id)
    );
    create index if not exists board_label_filters_label_idx on board_label_filters (label_id);
  `);
}

function createLabelsTable(sqlite: Database.Database) {
  sqlite.exec(`
    create table labels (
      id text primary key not null,
      name text not null,
      normalized_name text not null
    );
    create unique index labels_normalized_name_unique on labels (normalized_name);
  `);
}

function createTicketsTable(sqlite: Database.Database) {
  sqlite.exec(`
    create table tickets (
      id text primary key not null,
      status_key text not null,
      title text not null,
      description text not null default '',
      priority text not null default 'medium',
      ui_order integer not null,
      completed_at integer,
      archived_at integer,
      created_at integer not null,
      updated_at integer not null,
      check (priority in ('highest', 'high', 'medium', 'low'))
    );
    create index tickets_ui_order_idx on tickets (ui_order);
    create index tickets_status_ui_order_idx on tickets (status_key, ui_order);
    create index tickets_priority_idx on tickets (priority);
    create index tickets_completed_at_idx on tickets (completed_at);
    create index tickets_archived_ui_order_idx on tickets (archived_at, ui_order);
  `);
}

function ensureTicketCompletionFields(sqlite: Database.Database) {
  if (!hasColumn(sqlite, "tickets", "completed_at")) {
    sqlite.exec("alter table tickets add column completed_at integer");
  }

  sqlite.exec(`
    update tickets
    set completed_at = updated_at
    where completed_at is null
      and status_key in (
        select key
        from statuses
        where category = 'completed'
      )
  `);

  sqlite.exec(`
    update tickets
    set completed_at = null
    where completed_at is not null
      and status_key not in (
        select key
        from statuses
        where category = 'completed'
      )
  `);
}

function createTicketLabelsTable(sqlite: Database.Database) {
  sqlite.exec(`
    drop index if exists ticket_labels_label_idx;
    create table ticket_labels (
      ticket_id text not null references tickets(id) on delete cascade,
      label_id text not null references labels(id) on delete cascade,
      primary key (ticket_id, label_id)
    );
    create index if not exists ticket_labels_label_idx on ticket_labels (label_id);
  `);
}

function migrateLegacyDataModel(sqlite: Database.Database) {
  const needsLabelsMigration = hasColumn(sqlite, "labels", "board_id");
  const needsTicketsMigration = hasColumn(sqlite, "tickets", "board_id")
    || hasColumn(sqlite, "tickets", "column_id")
    || !hasColumn(sqlite, "tickets", "status_key");
  const needsBoardLabelFilters = !hasTable(sqlite, "board_label_filters");
  const legacyTicketsHaveArchivedAt = hasColumn(sqlite, "tickets", "archived_at");

  if (!needsLabelsMigration && !needsTicketsMigration && !needsBoardLabelFilters) {
    return;
  }

  sqlite.exec("pragma foreign_keys = OFF");

  try {
    const hasLegacyTicketLabels = hasTable(sqlite, "ticket_labels");
    if (hasLegacyTicketLabels) {
      sqlite.exec("alter table ticket_labels rename to ticket_labels_legacy");
    }

    if (needsLabelsMigration) {
      sqlite.exec("alter table labels rename to labels_legacy");
      createLabelsTable(sqlite);
      sqlite.exec(`
        insert into labels (id, name, normalized_name)
        select min(id), min(name), normalized_name
        from labels_legacy
        group by normalized_name
      `);
    }

    if (needsTicketsMigration) {
      sqlite.exec("alter table tickets rename to tickets_legacy");
      createTicketsTable(sqlite);
      sqlite.exec(`
        insert into tickets (id, status_key, title, description, priority, ui_order, completed_at, archived_at, created_at, updated_at)
        select
          tickets_legacy.id,
          coalesce(columns.key, 'todo'),
          tickets_legacy.title,
          tickets_legacy.description,
          tickets_legacy.priority,
          tickets_legacy.ui_order,
          null,
          ${legacyTicketsHaveArchivedAt ? "tickets_legacy.archived_at" : "null"},
          tickets_legacy.created_at,
          tickets_legacy.updated_at
        from tickets_legacy
        left join columns on columns.id = tickets_legacy.column_id
      `);
    }

    createBoardLabelFilters(sqlite);

    if (hasLegacyTicketLabels) {
      createTicketLabelsTable(sqlite);

      if (needsLabelsMigration) {
        sqlite.exec(`
          insert or ignore into ticket_labels (ticket_id, label_id)
          select
            ticket_labels_legacy.ticket_id,
            labels.id
          from ticket_labels_legacy
          inner join labels_legacy on labels_legacy.id = ticket_labels_legacy.label_id
          inner join labels on labels.normalized_name = labels_legacy.normalized_name
        `);
      } else {
        sqlite.exec(`
          insert or ignore into ticket_labels (ticket_id, label_id)
          select ticket_id, label_id
          from ticket_labels_legacy
        `);
      }
    }

    if (hasTable(sqlite, "tickets_legacy")) {
      sqlite.exec("drop table tickets_legacy");
    }

    if (hasTable(sqlite, "labels_legacy")) {
      sqlite.exec("drop table labels_legacy");
    }

    if (hasTable(sqlite, "ticket_labels_legacy")) {
      sqlite.exec("drop table ticket_labels_legacy");
    }
  } finally {
    sqlite.exec("pragma foreign_keys = ON");
  }
}

function ensureCurrentIndexes(sqlite: Database.Database) {
  sqlite.exec(`
    create unique index if not exists boards_slug_unique on boards (slug);
    create unique index if not exists statuses_name_unique on statuses (name);
    create unique index if not exists columns_board_position_unique on columns (board_id, position);
    create unique index if not exists columns_board_key_unique on columns (board_id, key);
    create unique index if not exists labels_normalized_name_unique on labels (normalized_name);
    create index if not exists board_label_filters_label_idx on board_label_filters (label_id);
    create index if not exists tickets_ui_order_idx on tickets (ui_order);
    create index if not exists tickets_status_ui_order_idx on tickets (status_key, ui_order);
    create index if not exists tickets_priority_idx on tickets (priority);
    create index if not exists tickets_completed_at_idx on tickets (completed_at);
    create index if not exists tickets_archived_ui_order_idx on tickets (archived_at, ui_order);
    create index if not exists ticket_labels_label_idx on ticket_labels (label_id);
  `);
}

function ensureDatabaseSchema(sqlite: Database.Database) {
  if (!hasTable(sqlite, "boards")) {
    const migrationSql = readFileSync(initialMigrationFilename, "utf8");
    sqlite.exec(migrationSql);
  }

  ensureBoardFields(sqlite);
  migrateLegacyDataModel(sqlite);
  ensureStatusesData(sqlite);
  ensureTicketCompletionFields(sqlite);
  createBoardLabelFilters(sqlite);
  ensureCurrentIndexes(sqlite);
}

export function createDatabaseClient(filename = defaultDatabaseFilename): DatabaseClient {
  mkdirSync(path.dirname(filename), { recursive: true });

  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  ensureDatabaseSchema(sqlite);

  return {
    db: drizzle(sqlite, { schema }),
    filename,
    sqlite,
  };
}
