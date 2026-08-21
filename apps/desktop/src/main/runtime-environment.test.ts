import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRuntimeEnvironment, mergeNoProxy } from "./runtime-environment";

describe("runtime environment", () => {
  it("preserves proxy exclusions and always adds loopback", () => {
    expect(mergeNoProxy("example.com,127.0.0.1")).toBe(
      "example.com,127.0.0.1,localhost,::1",
    );
  });

  it("isolates DSH_HOME without mutating the source environment", () => {
    const source = { HOME: "/users/test", no_proxy: "internal.test" };
    const environment = buildRuntimeEnvironment(source, "/seekdock/user-data");
    expect(environment.DSH_HOME).toBe(resolve("/seekdock/user-data", "dsh"));
    expect(environment.NO_PROXY).toContain("127.0.0.1");
    expect(environment.no_proxy).toBe(environment.NO_PROXY);
    expect(source).toEqual({ HOME: "/users/test", no_proxy: "internal.test" });
  });
});
