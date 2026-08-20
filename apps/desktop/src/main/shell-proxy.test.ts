import { describe, expect, it } from "vitest";
import { createDevelopmentProxyRequest } from "./shell-proxy";

describe("development shell proxy", () => {
  it("preserves Vite query parameters and request headers", () => {
    const request = new Request("seekdock://shell/styles.css?direct&t=1234", {
      headers: {
        accept: "text/css,*/*;q=0.1",
        "sec-fetch-dest": "style",
      },
    });

    const upstream = createDevelopmentProxyRequest(
      request,
      "http://localhost:5174/",
    );

    expect(upstream.url).toBe("http://localhost:5174/styles.css?direct&t=1234");
    expect(upstream.headers.get("accept")).toBe("text/css,*/*;q=0.1");
    expect(upstream.headers.get("sec-fetch-dest")).toBe("style");
  });
});
