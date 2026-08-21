import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  assertBunVersion,
  DSH_COMMIT,
  DSH_KOFFI_VERSION,
  PI_COMMIT,
  PI_VERSION,
  repositoryRoot,
} from "./constants.mjs";
import { run } from "./process.mjs";
import {
  hasWin32NativePickerPatch,
  WIN32_NATIVE_PICKER_PATCH_ID,
} from "./patch-dsh-runtime.mjs";

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
  const sourcePatch = resolve(
    repositoryRoot,
    "apps/desktop/resources/seekdock.patch.yml",
  );
  const stagedLauncher = resolve(stageDirectory, "dsh-launcher.mjs");
  const stagedPatch = resolve(stageDirectory, "seekdock.patch.yml");
  const requiredFiles = [
    manifestPath,
    resolve(stageDirectory, "dsh/lib/bin.js"),
    resolve(stageDirectory, "dsh/node_modules/koffi/package.json"),
    sourceLauncher,
    sourcePatch,
    stagedLauncher,
    stagedPatch,
  ];
  if (requiredFiles.some((file) => !existsSync(file))) return false;
  if (!readFileSync(sourceLauncher).equals(readFileSync(stagedLauncher))) {
    return false;
  }
  if (!readFileSync(sourcePatch).equals(readFileSync(stagedPatch)))
    return false;

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const stagedKoffi = JSON.parse(
      readFileSync(
        resolve(stageDirectory, "dsh/node_modules/koffi/package.json"),
        "utf8",
      ),
    );
    return (
      manifest.target === target &&
      manifest.deepSeekHarness?.commit === DSH_COMMIT &&
      manifest.sourceReferences?.pi?.commit === PI_COMMIT &&
      manifest.sourceReferences?.pi?.version === PI_VERSION &&
      manifest.deepSeekHarness?.koffiVersion === DSH_KOFFI_VERSION &&
      stagedKoffi.version === DSH_KOFFI_VERSION &&
      (target !== "win32-x64" ||
        (manifest.deepSeekHarness?.compatibilityPatches?.includes(
          WIN32_NATIVE_PICKER_PATCH_ID,
        ) &&
          hasWin32NativePickerPatch(resolve(stageDirectory, "dsh")))) &&
      manifest.electron?.version === electronVersion
    );
  } catch {
    return false;
  }
}
