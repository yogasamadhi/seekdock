import { describe, expect, it } from "vitest";
import { DshReadyLineDecoder, parseDshReadyLine } from "./runtime-url";

describe("DSH readiness URL parsing", () => {
  it("reassembles a readiness line split across stdout chunks", () => {
    const decoder = new DshReadyLineDecoder();
    expect(decoder.push("booting\ndsh web: http://127.0.")).toEqual([]);
    expect(
      decoder.push("0.1:43127\nnext line\n").map((url) => url.origin),
    ).toEqual(["http://127.0.0.1:43127"]);
  });

  it("ignores DSH web status messages after the readiness URL", () => {
    const decoder = new DshReadyLineDecoder();
    expect(
      decoder
        .push(
          "dsh web: http://127.0.0.1:43128\n" +
            "dsh web: opening the default browser; pass --no-open to disable\n",
        )
        .map((url) => url.origin),
    ).toEqual(["http://127.0.0.1:43128"]);
    expect(
      parseDshReadyLine(
        "dsh web: opening the default browser; pass --no-open to disable",
      ),
    ).toBeUndefined();
  });

  it("accepts only the exact IPv4 loopback form", () => {
    expect(parseDshReadyLine("ordinary log line")).toBeUndefined();
    expect(() => parseDshReadyLine("dsh web: http://localhost:1234")).toThrow(
      /malformed/u,
    );
    expect(() => parseDshReadyLine("dsh web: http://127.0.0.1:0")).toThrow(
      /port/u,
    );
    expect(() => parseDshReadyLine("dsh web: http://127.0.0.1:65536")).toThrow(
      /port/u,
    );
    expect(() =>
      parseDshReadyLine("dsh web: http://127.0.0.1:1234/path"),
    ).toThrow(/malformed/u);
  });
});
