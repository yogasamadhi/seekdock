import { describe, expect, it } from "vitest";
import { resolveRuntimePaths } from "./runtime-paths";

describe("runtime path selection", () => {
  it("uses the materialized runtime and Electron executable during development", () => {
    const paths = resolveRuntimePaths({
      arch: "arm64",
      electronExecutable: "/repo/node_modules/electron/Electron",
      isPackaged: false,
      platform: "darwin",
      repositoryRoot: "/repo",
      resourcesPath: "/resources",
    });
    expect(paths.dshBin).toBe(
      "/repo/.runtime/stage/darwin-arm64/dsh/lib/bin.js",
    );
    expect(paths.launcher).toBe(
      "/repo/.runtime/stage/darwin-arm64/dsh-launcher.mjs",
    );
    expect(paths.electronExecutable).toBe(
      "/repo/node_modules/electron/Electron",
    );
  });

  it("uses the packaged closure but still executes it with Electron", () => {
    const paths = resolveRuntimePaths({
      arch: "x64",
      electronExecutable: "C:\\SeekDock\\SeekDock.exe",
      isPackaged: true,
      platform: "win32",
      repositoryRoot: "C:\\repo",
      resourcesPath: "/app/resources",
    });
    expect(paths.dshBin).toBe("/app/resources/runtime/dsh/lib/bin.js");
    expect(paths.electronExecutable).toBe("C:\\SeekDock\\SeekDock.exe");
  });
});
