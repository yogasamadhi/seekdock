import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createConnection } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { buildRuntimeEnvironment } from "../src/main/runtime-environment";
import type { RuntimeLogger } from "../src/main/logger";
import { DshRuntimeSupervisor } from "../src/main/runtime-supervisor";

const desktopDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(desktopDirectory, "../..");
const require = createRequire(import.meta.url);
const electronExecutable = require("electron") as string;
const runtimeRoot = resolve(
  repositoryRoot,
  ".runtime/stage",
  `${process.platform}-${process.arch}`,
);
const temporaryDirectories: string[] = [];

const logger: RuntimeLogger = {
  info: () => undefined,
  error: () => undefined,
  stdout: () => undefined,
  stderr: () => undefined,
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("real pinned DeepSeek Harness runtime", () => {
  it("starts on a random port, serves its boot manifest, isolates data, and releases the port", async () => {
    const testRoot = mkdtempSync(resolve(tmpdir(), "seekdock-runtime-"));
    temporaryDirectories.push(testRoot);
    const userData = resolve(testRoot, "user-data");
    const workspace = resolve(testRoot, "workspace");
    mkdirSync(workspace, { recursive: true });

    const runtimeManifest = JSON.parse(
      readFileSync(resolve(runtimeRoot, "runtime-manifest.json"), "utf8"),
    );
    expect(runtimeManifest.sourceReferences.pi).toEqual({
      commit: "914cf1472e715297caa30db4b9535d534a9eb718",
      version: "0.84.2",
    });

    const supervisor = new DshRuntimeSupervisor({
      paths: {
        dshBin: resolve(runtimeRoot, "dsh/lib/bin.js"),
        electronExecutable,
        launcher: resolve(runtimeRoot, "dsh-launcher.mjs"),
        seekDockPatch: resolve(runtimeRoot, "seekdock.patch.yml"),
      },
      cwd: workspace,
      environment: buildRuntimeEnvironment(process.env, userData),
      logger,
    });

    try {
      const ready = await supervisor.start();
      const url = new URL(ready.origin);
      expect(url.hostname).toBe("127.0.0.1");
      expect(url.port).not.toBe("");

      const response = await fetch(url);
      const html = await response.text();
      expect(response.ok).toBe(true);
      expect(html).toMatch(/id=["']root["']/u);
      expect(html).toContain("__DSH_BOOT__");
      expect(
        readFileSync(resolve(runtimeRoot, "seekdock.patch.yml"), "utf8"),
      ).toContain("displayName: Pi");

      const providers = await callRuntimeApi(ready.origin, "llm.providers");
      expect(providers).toMatchObject({
        result: {
          ok: true,
          value: {
            providers: expect.arrayContaining([
              {
                provider: "deepseek",
                displayName: "Pi",
                settingsNs: "llm-pi-ai",
                settingsPath: ["providers", "deepseek"],
                active: true,
                declared: false,
              },
            ]),
          },
        },
      });
      const models = await callRuntimeApi(ready.origin, "llm.models");
      expect(models).toMatchObject({
        result: {
          ok: true,
          value: {
            groups: expect.arrayContaining([
              {
                id: "deepseek",
                name: "Pi",
                models: expect.arrayContaining([
                  expect.objectContaining({ id: expect.any(String) }),
                ]),
              },
            ]),
          },
        },
      });
      if (process.platform === "win32") {
        expect(html).toContain(
          "@deepseek-ai/dsh-client-ui-directory-picker-native",
        );
        expect(html).not.toContain(
          "@deepseek-ai/dsh-client-ui-directory-picker-browse",
        );
        expect(
          readFileSync(
            resolve(
              runtimeRoot,
              "dsh/node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs",
            ),
            "utf8",
          ),
        ).toContain('koffi.decode(address, offset, "uint16")');
      }

      await supervisor.stop();
      await expect
        .poll(() => canConnect(Number(url.port)), { timeout: 5_000 })
        .toBe(false);
      expect(existsSync(resolve(userData, "dsh"))).toBe(true);
      expect(
        JSON.parse(
          readFileSync(
            resolve(runtimeRoot, "dsh/node_modules/koffi/package.json"),
            "utf8",
          ),
        ).version,
      ).toBe("3.1.1");
    } finally {
      await supervisor.stop();
    }
  }, 90_000);
});

async function callRuntimeApi(
  origin: string,
  method: string,
): Promise<unknown> {
  const rpcId = `seekdock-e2e-${method}`;
  const response = await fetch(new URL(`/api/${method}`, origin), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId,
      method,
      payload: {},
    }),
  });
  expect(response.ok).toBe(true);
  return response.json();
}

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolveResult) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.setTimeout(250);
    socket.once("connect", () => {
      socket.destroy();
      resolveResult(true);
    });
    socket.once("error", () => resolveResult(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolveResult(false);
    });
  });
}
