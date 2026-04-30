import { stopProcessOnPort } from "./kill-port.mjs";

const stopped = await stopProcessOnPort(3001);

if (stopped) {
  console.log("Stopped process on port 3001.");
} else {
  console.log("No process was using port 3001.");
}

