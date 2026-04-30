import { spawnSync } from "node:child_process";

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function listProcessIds(port) {
  const result = run("lsof", ["-ti", `tcp:${port}`]);

  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr.trim() || `Failed to inspect port ${port}.`);
  }

  return result.stdout
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export async function stopProcessOnPort(port) {
  const processIds = listProcessIds(port);

  if (processIds.length === 0) {
    return false;
  }

  const killResult = run("kill", ["-TERM", ...processIds]);

  if (killResult.status !== 0) {
    throw new Error(killResult.stderr.trim() || `Failed to stop port ${port}.`);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(150);

    if (listProcessIds(port).length === 0) {
      return true;
    }
  }

  const forceKillResult = run("kill", ["-KILL", ...processIds]);

  if (forceKillResult.status !== 0) {
    throw new Error(forceKillResult.stderr.trim() || `Failed to force stop port ${port}.`);
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(150);

    if (listProcessIds(port).length === 0) {
      return true;
    }
  }

  throw new Error(`Port ${port} is still in use after stopping existing processes.`);
}

