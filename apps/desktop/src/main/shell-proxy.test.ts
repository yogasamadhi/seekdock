import { describe, expect, it } from "vitest";
import {
  createDevelopmentProxyRequest,
  fetchDevelopmentShellRequest,
} from "./shell-proxy";

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

  it("turns a cancelled Vite request into a controlled response", async () => {
    const response = await fetchDevelopmentShellRequest(
      new Request("seekdock://shell/styles.css"),
      "http://localhost:5174/",
      async () => {
        throw new Error("net::ERR_FAILED");
      },
    );

    expect(response.status).toBe(502);
    expect(response.statusText).toBe(
      "Development renderer request was cancelled",
    );
  });
});
