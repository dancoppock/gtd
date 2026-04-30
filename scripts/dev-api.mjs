import { spawn } from "node:child_process";

import { stopProcessOnPort } from "./kill-port.mjs";

const apiPort = 3001;
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

await stopProcessOnPort(apiPort);

const child = spawn(pnpmCommand, ["--filter", "@gtd/api", "dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: String(apiPort),
  },
});

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, () => {
    child.kill(signal);
  });
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
