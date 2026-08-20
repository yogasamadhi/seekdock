import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { assertBunVersion, DSH_COMMIT, repositoryRoot } from "./constants.mjs";
import { run } from "./process.mjs";

assertBunVersion();

const target = `${process.platform}-${process.arch}`;
const stageDirectory = resolve(repositoryRoot, ".runtime/stage", target);
const manifestPath = resolve(stageDirectory, "runtime-manifest.json");
const require = createRequire(import.meta.url);
const electronVersion = JSON.parse(
  readFileSync(require.resolve("electron/package.json"), "utf8"),
).version;

if (!runtimeIsCurrent()) {
  await run("bun", ["scripts/prepare-runtime.mjs"], { cwd: repositoryRoot });
} else {
  console.log(`SeekDock DSH runtime is ready for ${target}.`);
}

function runtimeIsCurrent() {
  const sourceLauncher = resolve(
    repositoryRoot,
    "apps/desktop/resources/dsh-launcher.mjs",
  );
  const stagedLauncher = resolve(stageDirectory, "dsh-launcher.mjs");
  const requiredFiles = [
    manifestPath,
    resolve(stageDirectory, "dsh/lib/bin.js"),
    sourceLauncher,
    stagedLauncher,
  ];
  if (requiredFiles.some((file) => !existsSync(file))) return false;
  if (!readFileSync(sourceLauncher).equals(readFileSync(stagedLauncher))) {
    return false;
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    return (
      manifest.target === target &&
      manifest.deepSeekHarness?.commit === DSH_COMMIT &&
      manifest.electron?.version === electronVersion
    );
  } catch {
    return false;
  }
}
