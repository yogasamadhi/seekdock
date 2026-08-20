const READY_PREFIX = "dsh web: ";
const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:(\d{1,5}))$/u;
const URL_LIKE_PATTERN = /^[a-z][a-z0-9+.-]*:\/\//iu;

export function parseDshReadyLine(line: string): URL | undefined {
  if (!line.startsWith(READY_PREFIX)) return undefined;

  const value = line.slice(READY_PREFIX.length);
  if (!URL_LIKE_PATTERN.test(value)) return undefined;

  const match = READY_PATTERN.exec(line);
  if (!match) {
    throw new Error(`Rejected malformed DSH readiness line: ${line}`);
  }

  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Rejected invalid DSH readiness port: ${match[2]}`);
  }

  const url = new URL(match[1]!);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.port !== String(port) ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`Rejected non-loopback DSH readiness URL: ${url.href}`);
  }

  return url;
}

export class DshReadyLineDecoder {
  private buffer = "";

  push(chunk: string | Uint8Array): URL[] {
    this.buffer +=
      typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    const lines = this.buffer.split(/\r?\n/u);
    this.buffer = lines.pop() ?? "";
    return lines.flatMap((line) => {
      const url = parseDshReadyLine(line);
      return url ? [url] : [];
    });
  }

  flush(): URL[] {
    if (this.buffer === "") return [];
    const line = this.buffer;
    this.buffer = "";
    const url = parseDshReadyLine(line);
    return url ? [url] : [];
  }
}
