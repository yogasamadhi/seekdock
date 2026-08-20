import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BUN_VERSION = "1.3.14";
export const DSH_COMMIT = "465cf1d2fa446209c7e83eae343d0b9dda0a8576";
export const OPENCODE_COMMIT = "b155b15694dbcc6768f11d2f25cc2bdd1f738ab4";
export const PI_COMMIT = "914cf1472e715297caa30db4b9535d534a9eb718";
export const PI_VERSION = "0.84.2";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const dshRoot = resolve(repositoryRoot, "vendor/deepseek-harness");
export const openCodeRoot = resolve(repositoryRoot, "vendor/opencode");
export const piRoot = resolve(repositoryRoot, "vendor/pi");

export function assertBunVersion() {
  if (process.versions.bun !== BUN_VERSION) {
    throw new Error(
      `SeekDock requires Bun ${BUN_VERSION}; the current process is ${process.versions.bun ?? "not Bun"}`,
    );
  }
}
