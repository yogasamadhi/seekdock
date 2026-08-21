import {
  assertBunVersion,
  DSH_COMMIT,
  dshRoot,
  PNPM_COMMAND,
} from "./constants.mjs";
import { run } from "./process.mjs";
import { assertSubmodule } from "./vendor.mjs";

assertBunVersion();
await assertSubmodule(dshRoot, DSH_COMMIT, "DeepSeek Harness");
await run(PNPM_COMMAND, ["install", "--frozen-lockfile"], {
  cwd: dshRoot,
  env: { ...process.env, CI: "true" },
});
await run(PNPM_COMMAND, ["run", "build"], {
  cwd: dshRoot,
  env: { ...process.env, CI: "true" },
});
