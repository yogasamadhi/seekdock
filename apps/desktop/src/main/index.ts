import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, session } from "electron";
import { buildRuntimeEnvironment } from "./runtime-environment";
import { createRuntimeLogger, type RuntimeLogger } from "./logger";
import { resolveRuntimePaths } from "./runtime-paths";
import { DshRuntimeSupervisor } from "./runtime-supervisor";
import { handleShellProtocol, registerShellScheme } from "./shell-protocol";
import { WindowController } from "./window-controller";

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot =
  process.env.SEEKDOCK_REPOSITORY_ROOT ??
  resolve(moduleDirectory, "../../../..");

if (process.env.SEEKDOCK_USER_DATA_DIR) {
  app.setPath("userData", resolve(process.env.SEEKDOCK_USER_DATA_DIR));
}

registerShellScheme();

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

let logger: RuntimeLogger | undefined;
let supervisor: DshRuntimeSupervisor | undefined;
let controller: WindowController | undefined;
let quitting = false;

if (hasSingleInstanceLock) {
  app.on("second-instance", () => controller?.focus());
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void (async () => {
      try {
        await supervisor?.stop();
      } catch (cause) {
        logger?.error(`Runtime shutdown failed: ${toError(cause).message}`);
      } finally {
        app.exit(0);
      }
    })();
  });

  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => controller?.focus());

  void app.whenReady().then(() => {
    const userDataDirectory = app.getPath("userData");
    logger = createRuntimeLogger(userDataDirectory);

    const rendererDirectory = resolve(moduleDirectory, "../renderer");
    handleShellProtocol(rendererDirectory, process.env.ELECTRON_RENDERER_URL);

    const paths = resolveRuntimePaths({
      arch: process.arch,
      electronExecutable: process.execPath,
      isPackaged: app.isPackaged,
      platform: process.platform,
      repositoryRoot,
      resourcesPath: process.resourcesPath,
    });
    supervisor = new DshRuntimeSupervisor({
      paths,
      cwd: homedir(),
      environment: buildRuntimeEnvironment(process.env, userDataDirectory),
      logger,
    });
    controller = new WindowController(supervisor, logger);
    configurePermissions(() => controller?.allowedRuntimeOrigin);
    controller.create();
    void controller.startRuntime();
  });
}

function configurePermissions(runtimeOrigin: () => string | undefined): void {
  const allowed = new Set(["clipboard-sanitized-write", "notifications"]);

  session.defaultSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      requestingOrigin === runtimeOrigin() && allowed.has(permission),
  );
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback, details) => {
      let requestingOrigin: string | undefined;
      try {
        requestingOrigin = new URL(details.requestingUrl).origin;
      } catch {
        requestingOrigin = undefined;
      }
      callback(requestingOrigin === runtimeOrigin() && allowed.has(permission));
    },
  );
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
