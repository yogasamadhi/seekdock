import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DSH_COMMIT } from "./constants.mjs";
import {
  assertDshVendorPristine,
  calculateDshOverlayContentDigests,
  calculateDshOverlayDigest,
  dshOverlayModulesRoot,
  dshOverlayPatchPath,
  materializePatchedDshSource,
  readDshOverlayManifest,
  removePatchedDshSource,
} from "./dsh-overlay.mjs";

const target = `overlay-test-${String(process.pid)}`;

afterAll(() => {
  removePatchedDshSource(target);
});

describe("DeepSeek Harness Pi overlay", () => {
  it("is locked to the official DSH commit and has a stable content digest", () => {
    const manifest = readDshOverlayManifest();
    expect(manifest.baseCommit).toBe(DSH_COMMIT);
    expect(manifest.sourceCommit).toBe(
      "465cf1d2fa446209c7e83eae343d0b9dda0a8576",
    );
    expect(manifest.modules).toEqual({
      "@seekdock/dsh-agent-backend-pi": "0.1.1-rc.2",
      "@seekdock/dsh-client-ui-agent-backend": "0.1.1-rc.2",
    });
    expect(manifest.runtimePackages).toEqual({
      "@earendil-works/pi-agent-core": "0.84.2",
      "@earendil-works/pi-ai": "0.84.2",
    });
    expect(manifest.contentDigests).toEqual(
      calculateDshOverlayContentDigests(),
    );
    expect(calculateDshOverlayDigest()).toMatch(/^[a-f0-9]{64}$/u);
    expect(calculateDshOverlayDigest()).toBe(calculateDshOverlayDigest());
  });

  it("contains only the compatibility surface and SeekDock-namespaced modules", () => {
    const patch = readFileSync(dshOverlayPatchPath, "utf8");
    expect(patch).toContain("packages/core/agent-loop/src/backend.ts");
    expect(patch).toContain("packages/host/apiproxy/src/api/agent-backends.ts");
    expect(patch).toContain("conversation.hero.agentBackend");
    expect(patch).toContain("@earendil-works/pi-agent-core");
    expect(patch).not.toContain("tests/snapshots/");
    expect(patch).not.toContain("deepseek-harness-pi");

    for (const packageDirectory of [
      "packages/core/agent-backend-pi",
      "packages/client/ui-agent-backend",
    ]) {
      const directory = resolve(dshOverlayModulesRoot, packageDirectory);
      const manifest = JSON.parse(
        readFileSync(resolve(directory, "package.json"), "utf8"),
      ) as { name: string };
      expect(manifest.name).toMatch(/^@seekdock\//u);
      expect(
        readFileSync(resolve(directory, "src/invariant.ts"), "utf8"),
      ).toContain(manifest.name);
    }
  });

  it("exports and patches a disposable copy without changing vendor", async () => {
    const sourceRoot = await materializePatchedDshSource(target);
    try {
      expect(sourceRoot).toBe(
        resolve(".runtime/build", target, "deepseek-harness"),
      );
      expect(
        existsSync(
          resolve(sourceRoot, "packages/core/agent-backend-pi/src/index.ts"),
        ),
      ).toBe(true);
      expect(
        readFileSync(
          resolve(sourceRoot, "packages/core/agent-loop/src/backend.ts"),
          "utf8",
        ),
      ).toContain("AgentBackendDriver");
      await expect(assertDshVendorPristine()).resolves.toBeUndefined();
    } finally {
      removePatchedDshSource(target);
    }
    expect(existsSync(sourceRoot)).toBe(false);
  }, 30_000);
});
