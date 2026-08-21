import {
  assertBunVersion,
  DSH_COMMIT,
  dshRoot,
  PNPM_COMMAND,
} from "./constants.mjs";
import { run } from "./process.mjs";
import { assertSubmodule } from "./vendor.mjs";
import {
  materializePatchedDshSource,
  removePatchedDshSource,
} from "./dsh-overlay.mjs";

assertBunVersion();
await assertSubmodule(dshRoot, DSH_COMMIT, "DeepSeek Harness");
const target = `${process.platform}-${process.arch}`;
const buildDshRoot = await materializePatchedDshSource(target);
try {
  await run(PNPM_COMMAND, ["install", "--frozen-lockfile"], {
    cwd: buildDshRoot,
    env: { ...process.env, CI: "true" },
  });
  await run(PNPM_COMMAND, ["run", "build"], {
    cwd: buildDshRoot,
    env: { ...process.env, CI: "true" },
  });
} finally {
  removePatchedDshSource(target);
}
