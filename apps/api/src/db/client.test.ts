import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDatabaseClient, type DatabaseClient } from "./client.js";

describe("createDatabaseClient", () => {
  let tempDir: string;
  let filename: string;
  let client: DatabaseClient | null = null;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "gtd-db-client-tests-"));
    filename = path.join(tempDir, "legacy.sqlite");
  });

  afterEach(() => {
    client?.sqlite.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("migrates legacy ticket schemas that do not yet have archived_at", () => {
    const sqlite = new Database(filename);

    sqlite.exec(`
      pragma foreign_keys = off;

      create table boards (
        id text primary key not null,
        slug text not null,
        name text not null,
        created_at integer not null,
        updated_at integer not null
      );

      create table columns (
        id text primary key not null,
        board_id text not null,
        key text not null,
        name text not null,
        position integer not null
      );

      create table labels (
        id text primary key not null,
        board_id text not null,
        name text not null,
        normalized_name text not null
      );

      create table tickets (
        id text primary key not null,
        board_id text not null,
        column_id text not null,
        title text not null,
        description text not null default '',
        priority text not null default 'medium',
        ui_order integer not null,
        created_at integer not null,
        updated_at integer not null
      );

      create table ticket_labels (
        ticket_id text not null,
        label_id text not null,
        primary key (ticket_id, label_id)
      );

      create index ticket_labels_label_idx on ticket_labels (label_id);

      insert into boards (id, slug, name, created_at, updated_at)
      values ('board_default', 'default', 'My Board', 1, 1);

      insert into columns (id, board_id, key, name, position)
      values ('col_todo', 'board_default', 'todo', 'Todo', 0);

      insert into labels (id, board_id, name, normalized_name)
      values ('label_frontend', 'board_default', 'frontend', 'frontend');

      insert into tickets (id, board_id, column_id, title, description, priority, ui_order, created_at, updated_at)
      values ('ticket_1', 'board_default', 'col_todo', 'Legacy Ticket', '', 'medium', 1000000, 1, 1);

      insert into ticket_labels (ticket_id, label_id)
      values ('ticket_1', 'label_frontend');
    `);

    sqlite.close();

    client = createDatabaseClient(filename);

    const migratedTicket = client.sqlite
      .prepare("select status_key, archived_at from tickets where id = ?")
      .get("ticket_1") as { status_key: string; archived_at: number | null };

    expect(migratedTicket).toEqual({
      status_key: "todo",
      archived_at: null,
    });

    const migratedBoard = client.sqlite
      .prepare("select is_default, is_system, description from boards where id = ?")
      .get("board_default") as { is_default: number; is_system: number; description: string };

    expect(migratedBoard).toEqual({
      is_default: 1,
      is_system: 1,
      description: "",
    });
  });
});
