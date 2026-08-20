import { describe, expect, it } from "vitest";
import { decideNavigation } from "./navigation";

describe("renderer navigation policy", () => {
  const runtimeOrigin = "http://127.0.0.1:45678";

  it("allows only the shell and exact runtime origin", () => {
    expect(decideNavigation("seekdock://shell/index.html", runtimeOrigin)).toBe(
      "allow",
    );
    expect(
      decideNavigation(`${runtimeOrigin}/api/settings`, runtimeOrigin),
    ).toBe("allow");
    expect(decideNavigation("http://127.0.0.1:45679/", runtimeOrigin)).toBe(
      "block",
    );
    expect(decideNavigation("http://localhost:45678/", runtimeOrigin)).toBe(
      "block",
    );
  });

  it("classifies restart and external HTTPS links", () => {
    expect(
      decideNavigation(
        "seekdock://shell/index.html?action=restart",
        runtimeOrigin,
      ),
    ).toBe("restart");
    expect(
      decideNavigation(
        "https://github.com/deepseek-ai/deepseek-harness",
        runtimeOrigin,
      ),
    ).toBe("external");
    expect(decideNavigation("file:///etc/passwd", runtimeOrigin)).toBe("block");
  });
});
