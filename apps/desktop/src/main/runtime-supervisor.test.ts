import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeLogger } from "./logger";
import {
  buildElectronNodeEnvironment,
  DshRuntimeSupervisor,
  type RuntimeFailure,
} from "./runtime-supervisor";

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly pid: number;
  connected = true;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  readonly send = vi.fn(
    (_message: unknown, callback?: (error: Error | null) => void): boolean => {
      callback?.(null);
      queueMicrotask(() => this.exit(0, null));
      return true;
    },
  );
  readonly kill = vi.fn((signal: NodeJS.Signals = "SIGTERM"): boolean => {
    queueMicrotask(() => this.exit(null, signal));
    return true;
  });

  constructor(pid: number) {
    super();
    this.pid = pid;
  }

  exit(code: number | null, signal: NodeJS.Signals | null): void {
    if (this.exitCode !== null || this.signalCode !== null) return;
    this.exitCode = code;
    this.signalCode = signal;
    this.connected = false;
    this.emit("exit", code, signal);
  }

  asChildProcess(): ChildProcess {
    return this as unknown as ChildProcess;
  }
}

const logger: RuntimeLogger = {
  info: vi.fn(),
  error: vi.fn(),
  stdout: vi.fn(),
  stderr: vi.fn(),
};

function createSupervisor(spawn: () => ChildProcess, startupTimeoutMs = 100) {
  return new DshRuntimeSupervisor({
    paths: {
      dshBin: process.execPath,
      electronExecutable: process.execPath,
      launcher: process.execPath,
    },
    cwd: process.cwd(),
    environment: {},
    logger,
    spawn,
    probe: async () => undefined,
    startupTimeoutMs,
    stopTimeoutMs: 20,
  });
}

describe("DshRuntimeSupervisor", () => {
  it("starts the DSH child in Electron's Node mode", () => {
    expect(
      buildElectronNodeEnvironment({ SEEKDOCK_TEST_VALUE: "kept" }),
    ).toEqual({
      ELECTRON_RUN_AS_NODE: "1",
      SEEKDOCK_TEST_VALUE: "kept",
    });
  });

  it("moves from idle through starting and ready to stopped", async () => {
    const child = new FakeChild(101);
    const supervisor = createSupervisor(() => child.asChildProcess());
    const states: string[] = [];
    supervisor.on("state", (state) => states.push(String(state)));

    const started = supervisor.start();
    child.stdout.write("dsh web: http://127.0.");
    child.stdout.write("0.1:41001\n");

    await expect(started).resolves.toEqual({
      origin: "http://127.0.0.1:41001",
      pid: 101,
    });
    expect(supervisor.state).toBe("ready");
    await supervisor.stop();
    expect(child.send).toHaveBeenCalledWith(
      { type: "stop" },
      expect.any(Function),
    );
    expect(supervisor.state).toBe("stopped");
    expect(states).toEqual(["starting", "ready", "stopping", "stopped"]);
  });

  it("fails when startup times out and cleans up the child", async () => {
    const child = new FakeChild(102);
    const supervisor = createSupervisor(() => child.asChildProcess(), 5);

    await expect(supervisor.start()).rejects.toThrow(/did not become ready/u);
    expect(supervisor.state).toBe("failed");
    expect(child.send).toHaveBeenCalled();
  });

  it("reports an unexpected crash after readiness", async () => {
    const child = new FakeChild(103);
    const supervisor = createSupervisor(() => child.asChildProcess());
    const failures: RuntimeFailure[] = [];
    supervisor.on("failure", (failure: RuntimeFailure) =>
      failures.push(failure),
    );

    const started = supervisor.start();
    child.stdout.write("dsh web: http://127.0.0.1:41003\n");
    await started;
    child.exit(17, null);

    expect(supervisor.state).toBe("failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.unexpectedExit).toBe(true);
  });

  it("stops the old runtime before restart and publishes the new origin", async () => {
    const children: FakeChild[] = [];
    const supervisor = createSupervisor(() => {
      const child = new FakeChild(200 + children.length);
      children.push(child);
      const port = 42_000 + children.length;
      queueMicrotask(() =>
        child.stdout.write(`dsh web: http://127.0.0.1:${String(port)}\n`),
      );
      return child.asChildProcess();
    });

    await expect(supervisor.start()).resolves.toMatchObject({
      origin: "http://127.0.0.1:42001",
    });
    await expect(supervisor.restart()).resolves.toMatchObject({
      origin: "http://127.0.0.1:42002",
    });
    expect(children).toHaveLength(2);
    expect(children[0]?.send).toHaveBeenCalled();
    await supervisor.stop();
  });
});
