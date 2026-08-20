import { EventEmitter } from "node:events";
import { fork, type ChildProcess } from "node:child_process";
import type { RuntimeLogger } from "./logger";
import { assertRuntimePaths, type RuntimePaths } from "./runtime-paths";
import { DshReadyLineDecoder } from "./runtime-url";

export type RuntimeState =
  | "idle"
  | "starting"
  | "ready"
  | "stopping"
  | "stopped"
  | "failed";

export interface RuntimeReady {
  origin: string;
  pid: number | undefined;
}

export interface RuntimeFailure {
  error: Error;
  unexpectedExit: boolean;
}

export interface RuntimeSpawnOptions {
  cwd: string;
  environment: NodeJS.ProcessEnv;
  paths: RuntimePaths;
}

export interface DshRuntimeSupervisorOptions extends RuntimeSpawnOptions {
  logger: RuntimeLogger;
  probe?: (url: URL) => Promise<void>;
  spawn?: (options: RuntimeSpawnOptions) => ChildProcess;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
}

interface ActiveRun {
  child: ChildProcess;
  intentionalStop: boolean;
}

const DEFAULT_STARTUP_TIMEOUT_MS = 60_000;
const DEFAULT_STOP_TIMEOUT_MS = 5_000;

export class DshRuntimeSupervisor extends EventEmitter {
  private activeRun: ActiveRun | undefined;
  private currentReady: RuntimeReady | undefined;
  private startPromise: Promise<RuntimeReady> | undefined;
  private stopPromise: Promise<void> | undefined;
  private stateValue: RuntimeState = "idle";

  constructor(private readonly options: DshRuntimeSupervisorOptions) {
    super();
  }

  get state(): RuntimeState {
    return this.stateValue;
  }

  get ready(): RuntimeReady | undefined {
    return this.currentReady;
  }

  start(): Promise<RuntimeReady> {
    if (this.stateValue === "ready" && this.currentReady) {
      return Promise.resolve(this.currentReady);
    }
    if (this.startPromise) return this.startPromise;

    const promise = this.startFresh();
    this.startPromise = promise;
    void promise.then(
      () => {
        if (this.startPromise === promise) this.startPromise = undefined;
      },
      () => {
        if (this.startPromise === promise) this.startPromise = undefined;
      },
    );
    return promise;
  }

  stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;

    const promise = this.stopFresh();
    this.stopPromise = promise;
    void promise.then(
      () => {
        if (this.stopPromise === promise) this.stopPromise = undefined;
      },
      () => {
        if (this.stopPromise === promise) this.stopPromise = undefined;
      },
    );
    return promise;
  }

  async restart(): Promise<RuntimeReady> {
    await this.stop();
    return this.start();
  }

  private async startFresh(): Promise<RuntimeReady> {
    if (this.stopPromise) await this.stopPromise;

    this.setState("starting");
    this.currentReady = undefined;

    try {
      assertRuntimePaths(this.options.paths);
      const spawnRuntime = this.options.spawn ?? defaultSpawnRuntime;
      const child = spawnRuntime(this.options);
      const run: ActiveRun = { child, intentionalStop: false };
      this.activeRun = run;
      this.options.logger.info(
        `Starting DeepSeek Harness (pid ${String(child.pid ?? "unknown")})`,
      );

      const url = await this.waitUntilReady(run);
      if (this.activeRun !== run || run.intentionalStop) {
        throw new Error("DeepSeek Harness startup was cancelled");
      }

      this.currentReady = { origin: url.origin, pid: child.pid };
      this.setState("ready");
      this.options.logger.info(`DeepSeek Harness is ready at ${url.origin}`);
      return this.currentReady;
    } catch (cause) {
      const error = toError(cause);
      const run = this.activeRun;
      if (run) {
        run.intentionalStop = true;
        await this.stopRun(run);
        if (this.activeRun === run) this.activeRun = undefined;
      }
      this.currentReady = undefined;
      if (this.stateValue !== "stopping" && this.stateValue !== "stopped") {
        this.fail(error, false);
      }
      throw error;
    }
  }

  private waitUntilReady(run: ActiveRun): Promise<URL> {
    const { child } = run;
    const decoder = new DshReadyLineDecoder();
    const startupTimeoutMs =
      this.options.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;

    return new Promise<URL>((resolve, reject) => {
      let settled = false;
      let probing = false;
      const timeout = setTimeout(() => {
        finishReject(
          new Error(
            `DeepSeek Harness did not become ready within ${String(startupTimeoutMs)}ms`,
          ),
        );
      }, startupTimeoutMs);
      timeout.unref();

      const cleanupStartupListeners = (): void => {
        clearTimeout(timeout);
        child.off("error", onError);
      };

      const finishReject = (error: Error): void => {
        if (settled) return;
        settled = true;
        cleanupStartupListeners();
        reject(error);
      };

      const finishReady = (url: URL): void => {
        if (settled || probing) return;
        probing = true;
        const probe = this.options.probe ?? probeDshHomepage;
        void probe(url).then(
          () => {
            if (settled) return;
            settled = true;
            cleanupStartupListeners();
            resolve(url);
          },
          (cause: unknown) => finishReject(toError(cause)),
        );
      };

      const inspectChunk = (chunk: Buffer): void => {
        this.options.logger.stdout(chunk.toString("utf8"));
        try {
          for (const url of decoder.push(chunk)) finishReady(url);
        } catch (cause) {
          finishReject(toError(cause));
        }
      };

      const onError = (error: Error): void => {
        finishReject(
          new Error(`Unable to start DeepSeek Harness: ${error.message}`, {
            cause: error,
          }),
        );
      };

      child.stdout?.on("data", inspectChunk);
      child.stderr?.on("data", (chunk: Buffer) => {
        this.options.logger.stderr(chunk.toString("utf8"));
      });
      child.once("error", onError);
      child.once("exit", (code, signal) => {
        if (!settled) {
          finishReject(
            new Error(
              `DeepSeek Harness exited before readiness (code ${String(code)}, signal ${String(signal)})`,
            ),
          );
          return;
        }

        if (
          this.activeRun === run &&
          !run.intentionalStop &&
          this.stateValue === "ready"
        ) {
          this.activeRun = undefined;
          this.currentReady = undefined;
          this.fail(
            new Error(
              `DeepSeek Harness exited unexpectedly (code ${String(code)}, signal ${String(signal)})`,
            ),
            true,
          );
        }
      });
    });
  }

  private async stopFresh(): Promise<void> {
    const run = this.activeRun;
    if (!run) {
      this.currentReady = undefined;
      this.setState("stopped");
      return;
    }

    this.setState("stopping");
    run.intentionalStop = true;
    await this.stopRun(run);
    if (this.activeRun === run) this.activeRun = undefined;
    this.currentReady = undefined;
    this.setState("stopped");
    this.options.logger.info("DeepSeek Harness stopped");
  }

  private async stopRun(run: ActiveRun): Promise<void> {
    const { child } = run;
    if (child.exitCode !== null || child.signalCode !== null) return;

    const exited = new Promise<void>((resolve) =>
      child.once("exit", () => resolve()),
    );
    if (child.connected) {
      child.send({ type: "stop" }, (error) => {
        if (error)
          this.options.logger.error(
            `Unable to send DSH stop request: ${error.message}`,
          );
      });
    } else {
      child.kill("SIGTERM");
    }

    const stopTimeoutMs = this.options.stopTimeoutMs ?? DEFAULT_STOP_TIMEOUT_MS;
    const graceful = await Promise.race([
      exited.then(() => true),
      new Promise<false>((resolve) => {
        const timeout = setTimeout(() => resolve(false), stopTimeoutMs);
        timeout.unref();
      }),
    ]);

    if (!graceful && child.exitCode === null && child.signalCode === null) {
      this.options.logger.error(
        `DeepSeek Harness did not stop within ${String(stopTimeoutMs)}ms; terminating it`,
      );
      child.kill("SIGKILL");
      await exited;
    }
  }

  private fail(error: Error, unexpectedExit: boolean): void {
    this.options.logger.error(error.message);
    this.setState("failed");
    this.emit("failure", { error, unexpectedExit } satisfies RuntimeFailure);
  }

  private setState(state: RuntimeState): void {
    if (this.stateValue === state) return;
    this.stateValue = state;
    this.emit("state", state);
  }
}

function defaultSpawnRuntime(options: RuntimeSpawnOptions): ChildProcess {
  return fork(
    options.paths.launcher,
    [options.paths.dshBin, "web", "--host", "127.0.0.1", "--port", "0"],
    {
      cwd: options.cwd,
      env: buildElectronNodeEnvironment(options.environment),
      execArgv: ["--expose-internals"],
      execPath: options.paths.electronExecutable,
      silent: true,
    },
  );
}

export function buildElectronNodeEnvironment(
  environment: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return { ...environment, ELECTRON_RUN_AS_NODE: "1" };
}

export async function probeDshHomepage(url: URL): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  timeout.unref();
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(
        `DeepSeek Harness homepage returned HTTP ${String(response.status)}`,
      );
    }
    const html = await response.text();
    if (!/id=["']root["']/u.test(html) || !html.includes("__DSH_BOOT__")) {
      throw new Error(
        "DeepSeek Harness homepage failed the SeekDock boot probe",
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
