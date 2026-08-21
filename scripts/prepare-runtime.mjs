import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  assertBunVersion,
  DSH_COMMIT,
  DSH_KOFFI_VERSION,
  dshRoot,
  PNPM_COMMAND,
  PI_COMMIT,
  PI_VERSION,
  piRoot,
  repositoryRoot,
} from "./constants.mjs";
import { capture, run } from "./process.mjs";
import { assertSubmodule } from "./vendor.mjs";
import { materializeDshClosure } from "./materialize-dsh-closure.mjs";
import { patchDshRuntime } from "./patch-dsh-runtime.mjs";

assertBunVersion();

const target = `${process.platform}-${process.arch}`;
if (!["darwin-arm64", "darwin-x64", "win32-x64"].includes(target)) {
  throw new Error(`Runtime preparation is unsupported on ${target}`);
}

const require = createRequire(import.meta.url);
const electronExecutable = require("electron");
const electronManifest = JSON.parse(
  readFileSync(require.resolve("electron/package.json"), "utf8"),
);
if (typeof electronExecutable !== "string" || !existsSync(electronExecutable)) {
  throw new Error("The Electron executable is not installed");
}

await Promise.all([
  assertSubmodule(dshRoot, DSH_COMMIT, "DeepSeek Harness"),
  assertSubmodule(piRoot, PI_COMMIT, "Pi"),
]);
await run(PNPM_COMMAND, ["install", "--frozen-lockfile"], {
  cwd: dshRoot,
  env: { ...process.env, CI: "true" },
});
await run(PNPM_COMMAND, ["run", "build"], {
  cwd: dshRoot,
  env: { ...process.env, CI: "true" },
});

const runtimeRoot = resolve(repositoryRoot, ".runtime");
const stageDirectory = resolve(runtimeRoot, "stage", target);
rmSync(stageDirectory, { recursive: true, force: true });
mkdirSync(stageDirectory, { recursive: true });

const dshDeployment = resolve(stageDirectory, "dsh");
await run(
  PNPM_COMMAND,
  [
    "--filter",
    "@deepseek-ai/dsh",
    "deploy",
    "--prod",
    "--legacy",
    "--config.node-linker=hoisted",
    "--config.auto-install-peers=false",
    "--config.link-workspace-packages=true",
    "--config.ignore-scripts=true",
    dshDeployment,
  ],
  { cwd: dshRoot, env: { ...process.env, CI: "true" } },
);
materializeDshClosure(dshDeployment);
const koffiPrebuildPackage = materializeLockedKoffi(dshDeployment, target);
const compatibilityPatches = patchDshRuntime(dshDeployment, target);

const launcher = resolve(stageDirectory, "dsh-launcher.mjs");
copyFileSync(
  resolve(repositoryRoot, "apps/desktop/resources/dsh-launcher.mjs"),
  launcher,
);
const seekDockPatch = resolve(stageDirectory, "seekdock.patch.yml");
copyFileSync(
  resolve(repositoryRoot, "apps/desktop/resources/seekdock.patch.yml"),
  seekDockPatch,
);

const electronNodeEnvironment = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: "1",
};
const embeddedNodeVersion = await capture(
  electronExecutable,
  ["-p", "process.versions.node"],
  { env: electronNodeEnvironment },
);
const validationHome = resolve(runtimeRoot, "validation-home", target);
rmSync(validationHome, { recursive: true, force: true });
const stagedDshVersion = await capture(
  electronExecutable,
  ["--expose-internals", resolve(dshDeployment, "lib/bin.js"), "--version"],
  {
    env: {
      ...electronNodeEnvironment,
      DSH_HOME: validationHome,
    },
  },
);
rmSync(validationHome, { recursive: true, force: true });
if (!stagedDshVersion) {
  throw new Error("Staged DeepSeek Harness did not report a version");
}

const licenseDirectory = resolve(stageDirectory, "licenses");
mkdirSync(licenseDirectory, { recursive: true });
copyFileSync(
  resolve(repositoryRoot, "LICENSE"),
  resolve(licenseDirectory, "SeekDock-LICENSE"),
);
copyFileSync(
  resolve(dshRoot, "LICENSE"),
  resolve(licenseDirectory, "DeepSeek-Harness-LICENSE"),
);
copyFileSync(
  resolve(dshRoot, "THIRD_PARTY_NOTICES.md"),
  resolve(licenseDirectory, "DeepSeek-Harness-THIRD_PARTY_NOTICES.md"),
);
copyFileSync(
  resolve(repositoryRoot, "THIRD_PARTY_NOTICES.md"),
  resolve(licenseDirectory, "SeekDock-THIRD_PARTY_NOTICES.md"),
);

writeFileSync(
  resolve(stageDirectory, "runtime-manifest.json"),
  `${JSON.stringify(
    {
      target,
      electron: {
        version: electronManifest.version,
        embeddedNodeVersion,
      },
      deepSeekHarness: {
        commit: DSH_COMMIT,
        version: stagedDshVersion,
        koffiVersion: DSH_KOFFI_VERSION,
        koffiPrebuildPackage,
        compatibilityPatches,
      },
      sourceReferences: {
        pi: { commit: PI_COMMIT, version: PI_VERSION },
      },
    },
    null,
    2,
  )}\n`,
);

console.log(`Prepared SeekDock runtime at ${stageDirectory}`);

function materializeLockedKoffi(deploymentDirectory, runtimeTarget) {
  const sourceLink = resolve(
    dshRoot,
    "packages/host/directory-picker-native/node_modules/koffi",
  );
  if (!existsSync(sourceLink)) {
    throw new Error("The pinned DSH Koffi dependency is not installed");
  }

  const source = realpathSync(sourceLink);
  const sourceManifest = JSON.parse(
    readFileSync(resolve(source, "package.json"), "utf8"),
  );
  if (sourceManifest.version !== DSH_KOFFI_VERSION) {
    throw new Error(
      `Expected DSH Koffi ${DSH_KOFFI_VERSION}, found ${String(sourceManifest.version)}`,
    );
  }

  const prebuildPackage =
    runtimeTarget === "win32-x64"
      ? "@koromix/koffi-win32-x64"
      : runtimeTarget === "darwin-arm64"
        ? "@koromix/koffi-darwin-arm64"
        : "@koromix/koffi-darwin-x64";
  const sourceNodeModules = resolve(source, "..");
  const prebuildSourceLink = resolve(
    sourceNodeModules,
    ...prebuildPackage.split("/"),
  );
  if (!existsSync(prebuildSourceLink)) {
    throw new Error(
      `The pinned DSH Koffi prebuild is not installed: ${prebuildPackage}`,
    );
  }

  copyPackage(source, resolve(deploymentDirectory, "node_modules/koffi"));
  copyPackage(
    realpathSync(prebuildSourceLink),
    resolve(deploymentDirectory, "node_modules", ...prebuildPackage.split("/")),
  );

  const deployedPrebuildManifest = JSON.parse(
    readFileSync(
      resolve(
        deploymentDirectory,
        "node_modules",
        ...prebuildPackage.split("/"),
        "package.json",
      ),
      "utf8",
    ),
  );
  if (deployedPrebuildManifest.version !== DSH_KOFFI_VERSION) {
    throw new Error(
      `Expected ${prebuildPackage} ${DSH_KOFFI_VERSION}, found ${String(deployedPrebuildManifest.version)}`,
    );
  }

  return prebuildPackage;
}

function copyPackage(source, destination) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(resolve(destination, ".."), { recursive: true });
  cpSync(source, destination, { recursive: true, dereference: true });
}
