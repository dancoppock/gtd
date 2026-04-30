import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema.js";

const defaultDatabaseFilename = fileURLToPath(new URL("../../data/gtd.sqlite", import.meta.url));
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

function ensureDatabaseSchema(sqlite: Database.Database) {
  if (hasTable(sqlite, "boards")) {
    return;
  }

  const migrationSql = readFileSync(initialMigrationFilename, "utf8");
  sqlite.exec(migrationSql);
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
