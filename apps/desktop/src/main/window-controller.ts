import { BrowserWindow, shell, type Event } from "electron";
import type { RuntimeLogger } from "./logger";
import { decideNavigation } from "./navigation";
import type {
  DshRuntimeSupervisor,
  RuntimeFailure,
} from "./runtime-supervisor";
import { SHELL_URL } from "./shell-protocol";

export class WindowController {
  private runtimeOrigin: string | undefined;
  private window: BrowserWindow | undefined;

  constructor(
    private readonly supervisor: DshRuntimeSupervisor,
    private readonly logger: RuntimeLogger,
  ) {
    supervisor.on("failure", (failure: RuntimeFailure) => {
      if (failure.unexpectedExit) void this.showFailure(failure.error);
    });
  }

  create(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const window = new BrowserWindow({
      width: 1280,
      height: 840,
      minWidth: 920,
      minHeight: 640,
      show: false,
      backgroundColor: "#101413",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    this.window = window;

    window.once("ready-to-show", () => window.show());
    window.on("closed", () => {
      if (this.window === window) this.window = undefined;
    });

    const handleNavigation = (event: Event, target: string): void => {
      const decision = decideNavigation(target, this.runtimeOrigin);
      if (decision === "allow") return;
      event.preventDefault();

      if (decision === "restart") {
        void this.restart();
      } else if (decision === "external") {
        this.openExternal(target);
      } else {
        this.logger.error(
          `Blocked renderer navigation to ${safeNavigationLabel(target)}`,
        );
      }
    };

    window.webContents.on("will-navigate", handleNavigation);
    window.webContents.on("will-redirect", handleNavigation);
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (decideNavigation(url, this.runtimeOrigin) === "external")
        this.openExternal(url);
      return { action: "deny" };
    });

    void window.loadURL(SHELL_URL);
    return window;
  }

  async startRuntime(): Promise<void> {
    try {
      const ready = await this.supervisor.start();
      this.runtimeOrigin = ready.origin;
      if (this.window && !this.window.isDestroyed()) {
        await this.window.loadURL(ready.origin);
      }
    } catch (cause) {
      await this.showFailure(toError(cause));
    }
  }

  focus(): void {
    const window = this.create();
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  get allowedRuntimeOrigin(): string | undefined {
    return this.runtimeOrigin;
  }

  private async restart(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    this.runtimeOrigin = undefined;
    await this.window.loadURL(`${SHELL_URL}?state=restarting`);
    try {
      const ready = await this.supervisor.restart();
      this.runtimeOrigin = ready.origin;
      if (!this.window.isDestroyed()) await this.window.loadURL(ready.origin);
    } catch (cause) {
      await this.showFailure(toError(cause));
    }
  }

  private async showFailure(error: Error): Promise<void> {
    this.runtimeOrigin = undefined;
    if (!this.window || this.window.isDestroyed()) return;
    const url = new URL(SHELL_URL);
    url.searchParams.set("state", "failed");
    url.searchParams.set("message", error.message);
    try {
      await this.window.loadURL(url.href);
    } catch (cause) {
      this.logger.error(
        `Unable to show the runtime failure page: ${toError(cause).message}`,
      );
    }
  }

  private openExternal(url: string): void {
    this.logger.info(
      `Opening HTTPS link in the system browser: ${safeNavigationLabel(url)}`,
    );
    if (process.env.SEEKDOCK_E2E !== "1") void shell.openExternal(url);
  }
}

function safeNavigationLabel(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "an invalid URL";
  }
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
