import { relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { net, protocol } from "electron";
import { createDevelopmentProxyRequest } from "./shell-proxy";

export const SHELL_URL = "seekdock://shell/index.html";

export function registerShellScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "seekdock",
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

export function handleShellProtocol(
  rendererDirectory: string,
  developmentUrl?: string,
): void {
  protocol.handle("seekdock", async (request) => {
    if (request.method !== "GET") return new Response(null, { status: 405 });

    const requestUrl = new URL(request.url);
    if (requestUrl.hostname !== "shell")
      return new Response(null, { status: 404 });

    let pathname: string;
    try {
      pathname = decodeURIComponent(requestUrl.pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (pathname === "/" || pathname === "") pathname = "/index.html";

    if (developmentUrl) {
      return net.fetch(createDevelopmentProxyRequest(request, developmentUrl));
    }

    const target = resolve(rendererDirectory, `.${pathname}`);
    const relation = relative(rendererDirectory, target);
    if (
      relation.startsWith("..") ||
      relation.includes(":") ||
      relation === ""
    ) {
      return new Response(null, { status: 404 });
    }
    return net.fetch(pathToFileURL(target).href);
  });
}
