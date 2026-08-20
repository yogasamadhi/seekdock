import { describe, expect, it } from "vitest";
import { redactLogMessage } from "./logger";

describe("log redaction", () => {
  it("removes common credential forms", () => {
    const message = redactLogMessage(
      "Authorization: Bearer abc.def api_key=very-secret sk-abcdefghijklmnopqrstuvwxyz",
    );
    expect(message).not.toContain("abc.def");
    expect(message).not.toContain("very-secret");
    expect(message).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
  });
});
