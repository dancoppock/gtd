import path from "node:path";

import { defineConfig, devices } from "@playwright/test";

const apiPort = 3101;
const webPort = 4173;
const apiBaseURL = `http://127.0.0.1:${apiPort}`;
const baseURL = `http://127.0.0.1:${webPort}`;
const e2eDatabaseFilename = path.join(process.cwd(), "apps/api/data/gtd.e2e.sqlite");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
  webServer: [
    {
      command:
        `zsh -lic 'nvm use 20.20.0 >/dev/null; ` +
        `PORT=${apiPort} GTD_DATABASE_FILENAME=${e2eDatabaseFilename} GTD_ENABLE_TEST_ROUTES=true ` +
        `pnpm --filter @gtd/api exec tsx src/server.ts'`,
      url: `${apiBaseURL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command:
        `zsh -lic 'nvm use 20.20.0 >/dev/null; ` +
        `VITE_API_PROXY_TARGET=${apiBaseURL} VITE_STRICT_PORT=true ` +
        `pnpm --filter @gtd/web exec vite --host 127.0.0.1 --port ${webPort}'`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
