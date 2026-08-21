import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MINIMUM_BUN_VERSION = "1.3.14";
export const DSH_COMMIT = "141eb6fef83422698aef7a981029e843e8161534";
export const DSH_KOFFI_VERSION = "3.1.1";
export const OPENCODE_COMMIT = "b155b15694dbcc6768f11d2f25cc2bdd1f738ab4";
export const PI_COMMIT = "914cf1472e715297caa30db4b9535d534a9eb718";
export const PI_VERSION = "0.84.2";
export const PNPM_COMMAND = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const dshRoot = resolve(repositoryRoot, "vendor/deepseek-harness");
export const openCodeRoot = resolve(repositoryRoot, "vendor/opencode");
export const piRoot = resolve(repositoryRoot, "vendor/pi");

export function assertBunVersion() {
  const version = process.versions.bun;
  if (!isBunVersionSupported(version)) {
    throw new Error(
      `SeekDock requires Bun ${MINIMUM_BUN_VERSION} or later; the current process is ${version ?? "not Bun"}`,
    );
  }
  return version;
}

export function isBunVersionSupported(version) {
  if (typeof version !== "string") return false;

  const current = parseVersion(version);
  const minimum = parseVersion(MINIMUM_BUN_VERSION);
  if (!current || !minimum) return false;

  for (const part of ["major", "minor", "patch"]) {
    if (current[part] !== minimum[part]) {
      return current[part] > minimum[part];
    }
  }

  return current.prerelease === undefined;
}

function parseVersion(version) {
  const match =
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
      version,
    );
  if (!match) return undefined;

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4],
  };
}
