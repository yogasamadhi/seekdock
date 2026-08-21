import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { extract } from "tar";
import { DSH_COMMIT, dshRoot, repositoryRoot } from "./constants.mjs";
import { capture, run } from "./process.mjs";

export const dshOverlayRoot = resolve(
  repositoryRoot,
  "overlays/deepseek-harness/pi-backend",
);
export const dshOverlayManifestPath = resolve(dshOverlayRoot, "manifest.json");
export const dshOverlayPatchPath = resolve(
  dshOverlayRoot,
  "compatibility.patch",
);
export const dshOverlayModulesRoot = resolve(dshOverlayRoot, "modules");

export function readDshOverlayManifest() {
  const manifest = JSON.parse(readFileSync(dshOverlayManifestPath, "utf8"));
  if (manifest.baseCommit !== DSH_COMMIT) {
    throw new Error(
      `DSH overlay targets ${String(manifest.baseCommit)}; expected ${DSH_COMMIT}`,
    );
  }
  const actualDigests = calculateDshOverlayContentDigests();
  if (
    manifest.contentDigests?.compatibilityPatch !==
      actualDigests.compatibilityPatch ||
    manifest.contentDigests?.modules !== actualDigests.modules
  ) {
    throw new Error(
      "DSH overlay content changed without updating manifest.json digests",
    );
  }
  return manifest;
}

export function calculateDshOverlayContentDigests() {
  return {
    compatibilityPatch: createHash("sha256")
      .update(readFileSync(dshOverlayPatchPath))
      .digest("hex"),
    modules: digestTree(dshOverlayModulesRoot),
  };
}

export function calculateDshOverlayDigest() {
  return digestTree(dshOverlayRoot);
}

export async function assertDshVendorPristine() {
  const commit = await capture("git", ["rev-parse", "HEAD"], { cwd: dshRoot });
  if (commit !== DSH_COMMIT) {
    throw new Error(`DeepSeek Harness must be ${DSH_COMMIT}; found ${commit}`);
  }
  const status = await capture(
    "git",
    ["status", "--short", "--untracked-files=all", "--ignored=matching"],
    { cwd: dshRoot },
  );
  if (status !== "") {
    throw new Error(
      `DeepSeek Harness vendor contains generated or local files:\n${status}`,
    );
  }
}

export async function materializePatchedDshSource(target) {
  readDshOverlayManifest();
  await assertDshVendorPristine();

  const buildParent = resolve(repositoryRoot, ".runtime/build", target);
  const sourceRoot = resolve(buildParent, "deepseek-harness");
  const archivePath = resolve(buildParent, "deepseek-harness.tar");
  rmSync(buildParent, { recursive: true, force: true });
  mkdirSync(sourceRoot, { recursive: true });
  try {
    await run(
      "git",
      ["archive", "--format=tar", `--output=${archivePath}`, DSH_COMMIT],
      { cwd: dshRoot },
    );
    await extract({ file: archivePath, cwd: sourceRoot, strict: true });
    rmSync(archivePath, { force: true });
    cpSync(dshOverlayModulesRoot, sourceRoot, { recursive: true });

    const applyDirectory = relative(repositoryRoot, sourceRoot)
      .split(sep)
      .join("/");
    await run(
      "git",
      [
        "apply",
        "--check",
        `--directory=${applyDirectory}`,
        dshOverlayPatchPath,
      ],
      { cwd: repositoryRoot },
    );
    await run(
      "git",
      ["apply", `--directory=${applyDirectory}`, dshOverlayPatchPath],
      { cwd: repositoryRoot },
    );
    await assertDshVendorPristine();
    return sourceRoot;
  } catch (error) {
    rmSync(buildParent, { recursive: true, force: true });
    await assertDshVendorPristine();
    throw error;
  }
}

export function removePatchedDshSource(target) {
  rmSync(resolve(repositoryRoot, ".runtime/build", target), {
    recursive: true,
    force: true,
  });
}

function listFiles(root) {
  const result = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) result.push(path);
    }
  };
  visit(root);
  return result.sort();
}

function digestTree(root) {
  const hash = createHash("sha256");
  for (const path of listFiles(root)) {
    hash.update(relative(root, path).split(sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}
