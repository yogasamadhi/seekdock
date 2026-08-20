export type NavigationDecision = "allow" | "external" | "restart" | "block";

export function decideNavigation(
  rawUrl: string,
  runtimeOrigin: string | undefined,
): NavigationDecision {
  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return "block";
  }

  if (target.protocol === "seekdock:" && target.hostname === "shell") {
    return target.searchParams.get("action") === "restart"
      ? "restart"
      : "allow";
  }

  if (runtimeOrigin && target.origin === runtimeOrigin) return "allow";
  if (target.protocol === "https:") return "external";
  return "block";
}
