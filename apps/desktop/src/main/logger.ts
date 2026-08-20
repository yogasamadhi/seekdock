import { createWriteStream, mkdirSync } from "node:fs";
import { resolve } from "node:path";

export interface RuntimeLogger {
  info(message: string): void;
  error(message: string): void;
  stdout(message: string): void;
  stderr(message: string): void;
}

export function redactLogMessage(message: string): string {
  return message
    .replace(/\bBearer\s+[^\s"']+/giu, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/gu, "[REDACTED]")
    .replace(
      /\b(api[_-]?key|token|secret|password)\s*[:=]\s*[^\s,;]+/giu,
      "$1=[REDACTED]",
    );
}

export function createRuntimeLogger(userDataDirectory: string): RuntimeLogger {
  const logDirectory = resolve(userDataDirectory, "logs");
  mkdirSync(logDirectory, { recursive: true, mode: 0o700 });
  const stream = createWriteStream(resolve(logDirectory, "seekdock.log"), {
    flags: "a",
    mode: 0o600,
  });

  function write(level: string, message: string): void {
    const safe = redactLogMessage(message).replace(/[\r\n]+$/u, "");
    stream.write(`${new Date().toISOString()} ${level} ${safe}\n`);
  }

  return {
    info: (message) => write("INFO", message),
    error: (message) => write("ERROR", message),
    stdout: (message) => write("DSH-OUT", message),
    stderr: (message) => write("DSH-ERR", message),
  };
}
