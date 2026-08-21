import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface RuntimePaths {
  dshBin: string;
  electronExecutable: string;
  launcher: string;
  seekDockPatch: string;
}

export interface RuntimePathOptions {
  arch: string;
  electronExecutable: string;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  repositoryRoot: string;
  resourcesPath: string;
}

export function resolveRuntimePaths(options: RuntimePathOptions): RuntimePaths {
  const runtimeRoot = options.isPackaged
    ? resolve(options.resourcesPath, "runtime")
    : resolve(
        options.repositoryRoot,
        ".runtime/stage",
        `${options.platform}-${options.arch}`,
      );
  return {
    dshBin: resolve(runtimeRoot, "dsh/lib/bin.js"),
    electronExecutable: options.electronExecutable,
    launcher: resolve(runtimeRoot, "dsh-launcher.mjs"),
    seekDockPatch: resolve(runtimeRoot, "seekdock.patch.yml"),
  };
}

export function assertRuntimePaths(paths: RuntimePaths): void {
  for (const [label, path] of Object.entries(paths)) {
    if (!existsSync(path)) {
      throw new Error(`SeekDock runtime ${label} is missing: ${path}`);
    }
  }
}
