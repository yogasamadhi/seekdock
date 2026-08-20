import { assertBunVersion, DSH_COMMIT, dshRoot } from "./constants.mjs";
import { run } from "./process.mjs";
import { assertSubmodule } from "./vendor.mjs";

assertBunVersion();
await assertSubmodule(dshRoot, DSH_COMMIT, "DeepSeek Harness");
await run("pnpm", ["install", "--frozen-lockfile"], {
  cwd: dshRoot,
  env: { ...process.env, CI: "true" },
});
await run("pnpm", ["run", "build"], {
  cwd: dshRoot,
  env: { ...process.env, CI: "true" },
});
