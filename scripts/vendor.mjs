import { capture } from "./process.mjs";

export async function assertSubmodule(directory, expectedCommit, label) {
  const actualCommit = await capture("git", ["rev-parse", "HEAD"], {
    cwd: directory,
  });
  if (actualCommit !== expectedCommit) {
    throw new Error(
      `${label} must be pinned at ${expectedCommit}; found ${actualCommit}`,
    );
  }
}
