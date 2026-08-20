import {
  assertBunVersion,
  BUN_VERSION,
  DSH_COMMIT,
  dshRoot,
  OPENCODE_COMMIT,
  openCodeRoot,
  PI_COMMIT,
  piRoot,
  repositoryRoot,
} from "./constants.mjs";
import { run } from "./process.mjs";
import { assertSubmodule } from "./vendor.mjs";

assertBunVersion();

await run("git", ["submodule", "update", "--init", "--recursive"], {
  cwd: repositoryRoot,
});
await Promise.all([
  assertSubmodule(dshRoot, DSH_COMMIT, "DeepSeek Harness"),
  assertSubmodule(openCodeRoot, OPENCODE_COMMIT, "OpenCode"),
  assertSubmodule(piRoot, PI_COMMIT, "Pi"),
]);

await run("bun", ["install", "--frozen-lockfile"], { cwd: repositoryRoot });
await run("bun", ["scripts/prepare-runtime.mjs"], { cwd: repositoryRoot });

console.log(`SeekDock bootstrap complete with Bun ${BUN_VERSION}.`);
