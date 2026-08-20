import { resolve } from "node:path";

const REQUIRED_NO_PROXY = ["127.0.0.1", "localhost", "::1"];

export function mergeNoProxy(current: string | undefined): string {
  const entries = (current ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const normalized = new Set(entries.map((entry) => entry.toLowerCase()));
  for (const entry of REQUIRED_NO_PROXY) {
    if (!normalized.has(entry)) entries.push(entry);
  }
  return entries.join(",");
}

export function buildRuntimeEnvironment(
  source: NodeJS.ProcessEnv,
  userDataDirectory: string,
): NodeJS.ProcessEnv {
  const environment = { ...source };
  const noProxy = mergeNoProxy(source.NO_PROXY ?? source.no_proxy);

  environment.DSH_HOME = resolve(userDataDirectory, "dsh");
  environment.NO_PROXY = noProxy;
  environment.no_proxy = noProxy;
  environment.FORCE_COLOR = "0";
  return environment;
}
