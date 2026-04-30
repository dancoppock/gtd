import { stopProcessOnPort } from "./kill-port.mjs";

const stopped = await stopProcessOnPort(3000);

if (stopped) {
  console.log("Stopped process on port 3000.");
} else {
  console.log("No process was using port 3000.");
}
