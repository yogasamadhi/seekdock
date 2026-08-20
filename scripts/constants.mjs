import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BUN_VERSION = "1.3.14";
export const DSH_COMMIT = "141eb6fef83422698aef7a981029e843e8161534";
export const OPENCODE_COMMIT = "b155b15694dbcc6768f11d2f25cc2bdd1f738ab4";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const dshRoot = resolve(repositoryRoot, "vendor/deepseek-harness");
export const openCodeRoot = resolve(repositoryRoot, "vendor/opencode");

export function assertBunVersion() {
  if (process.versions.bun !== BUN_VERSION) {
    throw new Error(
      `SeekDock requires Bun ${BUN_VERSION}; the current process is ${process.versions.bun ?? "not Bun"}`,
    );
  }
}
