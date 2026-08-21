import { describe, expect, it } from "vitest";
import { isBunVersionSupported } from "./constants.mjs";

describe("isBunVersionSupported", () => {
  it.each([
    ["1.3.14", true],
    ["1.4.0", true],
    ["v1.4.0", true],
    ["1.3.13", false],
    ["1.3.14-canary.1", false],
    [undefined, false],
    ["not-a-version", false],
  ])("returns %s for %s", (version, expected) => {
    expect(isBunVersionSupported(version)).toBe(expected);
  });
});
