import process from "node:process";
import { pathToFileURL } from "node:url";

const [dshBin, ...dshArgs] = process.argv.slice(2);

if (!dshBin) {
  throw new Error("SeekDock DSH launcher requires the dsh entry path");
}

let dshLoaded = false;
let stopRequested = false;

function requestStop() {
  if (stopRequested) return;
  stopRequested = true;
  if (dshLoaded) emitStop();
}

function emitStop() {
  process.emit("SIGTERM", "SIGTERM");
}

process.on("message", (message) => {
  if (message && typeof message === "object" && message.type === "stop") {
    requestStop();
  }
});

process.on("disconnect", requestStop);

process.argv = [process.execPath, dshBin, ...dshArgs];
await import(pathToFileURL(dshBin).href);
dshLoaded = true;

if (stopRequested) emitStop();
