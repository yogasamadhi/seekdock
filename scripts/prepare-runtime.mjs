import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import {
  assertBunVersion,
  DSH_COMMIT,
  dshRoot,
  repositoryRoot,
} from "./constants.mjs";
import { capture, run } from "./process.mjs";
import { assertSubmodule } from "./vendor.mjs";
import { materializeDshClosure } from "./materialize-dsh-closure.mjs";

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

await assertSubmodule(dshRoot, DSH_COMMIT, "DeepSeek Harness");
await run("pnpm", ["install", "--frozen-lockfile"], {
  cwd: dshRoot,
  env: { ...process.env, CI: "true" },
});
await run("pnpm", ["run", "build"], {
  cwd: dshRoot,
  env: { ...process.env, CI: "true" },
});

const runtimeRoot = resolve(repositoryRoot, ".runtime");
const stageDirectory = resolve(runtimeRoot, "stage", target);
rmSync(stageDirectory, { recursive: true, force: true });
mkdirSync(stageDirectory, { recursive: true });

const dshDeployment = resolve(stageDirectory, "dsh");
await run(
  "pnpm",
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

const launcher = resolve(stageDirectory, "dsh-launcher.mjs");
copyFileSync(
  resolve(repositoryRoot, "apps/desktop/resources/dsh-launcher.mjs"),
  launcher,
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
      deepSeekHarness: { commit: DSH_COMMIT, version: stagedDshVersion },
    },
    null,
    2,
  )}\n`,
);

console.log(`Prepared SeekDock runtime at ${stageDirectory}`);
