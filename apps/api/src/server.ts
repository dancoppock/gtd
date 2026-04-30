import { rmSync } from "node:fs";

import { buildApp } from "./app.js";
import { createDatabaseClient, defaultDatabaseFilename } from "./db/client.js";
import { SqliteBoardStore } from "./repositories/sqlite-board-store.js";

const port = Number(process.env.PORT ?? 3001);
const databaseFilename = process.env.GTD_DATABASE_FILENAME ?? defaultDatabaseFilename;
const enableTestRoutes = process.env.GTD_ENABLE_TEST_ROUTES === "true";

function createBoardStore() {
  return new SqliteBoardStore(createDatabaseClient(databaseFilename));
}

function resetState() {
  rmSync(databaseFilename, { force: true });
  rmSync(`${databaseFilename}-shm`, { force: true });
  rmSync(`${databaseFilename}-wal`, { force: true });
}

const app = buildApp({
  boardStoreFactory: createBoardStore,
  logger: !enableTestRoutes,
  resetState,
  testMode: enableTestRoutes,
});

app.listen({
  host: "0.0.0.0",
  port,
}).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
