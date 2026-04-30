import { spawn } from "node:child_process";

import { stopProcessOnPort } from "./kill-port.mjs";

const webPort = 3000;
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

await stopProcessOnPort(webPort);

const child = spawn(pnpmCommand, ["--filter", "@gtd/web", "dev"], {
  stdio: "inherit",
  env: {
    ...process.env,
    VITE_STRICT_PORT: "true",
    VITE_API_PROXY_TARGET: "http://127.0.0.1:3001",
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
