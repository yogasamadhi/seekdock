#!/usr/bin/env bun

import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const BUN_VERSION = "1.3.14";
const PNPM_VERSION = "11.7.0";
const DSH_COMMIT = "465cf1d2fa446209c7e83eae343d0b9dda0a8576";
const OPENCODE_COMMIT = "b155b15694dbcc6768f11d2f25cc2bdd1f738ab4";
const PI_COMMIT = "914cf1472e715297caa30db4b9535d534a9eb718";

const repositoryRoot = dirname(fileURLToPath(import.meta.url));
const dshRoot = resolve(repositoryRoot, "vendor/deepseek-harness");
const openCodeRoot = resolve(repositoryRoot, "vendor/opencode");
const piRoot = resolve(repositoryRoot, "vendor/pi");
const argumentsSet = new Set(
  process.argv.slice(2).filter((argument) => argument !== "--"),
);

try {
  if (argumentsSet.has("--help")) {
    printHelp();
  } else {
    await main();
  }
} catch (cause) {
  console.error(`\nSeekDock 启动失败：${toError(cause).message}`);
  process.exitCode = 1;
}

interface CommandResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  interrupted: boolean;
}

async function main(): Promise<void> {
  rejectUnknownArguments();
  process.chdir(repositoryRoot);

  console.log("\nSeekDock 开发启动器\n");
  assertBunVersion();

  await runChecked(
    "初始化固定版本的 Git Submodule",
    "git",
    ["submodule", "update", "--init", "--recursive"],
    repositoryRoot,
  );
  await assertVendorSnapshot(dshRoot, DSH_COMMIT, "DeepSeek Harness");
  await assertVendorSnapshot(openCodeRoot, OPENCODE_COMMIT, "OpenCode");
  await assertVendorSnapshot(piRoot, PI_COMMIT, "Pi");
  assertPnpmVersion();

  await runChecked(
    "安装 SeekDock 依赖",
    "bun",
    ["install", "--frozen-lockfile"],
    repositoryRoot,
  );

  await runChecked(
    "准备 Electron Node + DeepSeek Harness Runtime",
    "bun",
    ["scripts/ensure-dsh-runtime.mjs"],
    repositoryRoot,
  );

  if (!argumentsSet.has("--skip-check")) {
    await runChecked(
      "运行 SeekDock 静态检查和单元测试",
      "bun",
      ["run", "check"],
      repositoryRoot,
    );
  }

  console.log("\n▶ 启动 SeekDock Electron 开发环境（Ctrl+C 退出）\n");
  const result = await runInteractive(
    "bun",
    ["run", "--filter", "@seekdock/desktop", "dev"],
    repositoryRoot,
    process.env,
  );
  if (result.interrupted) {
    process.exitCode = result.signal === "SIGINT" ? 130 : 143;
  } else if (result.code !== 0) {
    throw new Error(`SeekDock 开发进程退出，状态码 ${String(result.code)}`);
  }
}

function assertBunVersion(): void {
  const version = process.versions.bun;
  if (version !== BUN_VERSION) {
    throw new Error(`需要 Bun ${BUN_VERSION}，当前版本为 ${version ?? "未知"}`);
  }
  console.log(`✓ Bun ${BUN_VERSION}`);
}

function assertPnpmVersion(): void {
  const result = spawnSync("pnpm", ["--version"], {
    cwd: dshRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.error) {
    throw new Error("无法执行 pnpm，请先运行 corepack enable", {
      cause: result.error,
    });
  }
  const version = result.stdout.trim();
  if (result.status !== 0 || version !== PNPM_VERSION) {
    throw new Error(
      `DeepSeek Harness 需要 pnpm ${PNPM_VERSION}，当前版本为 ${version || result.stderr.trim() || "未知"}`,
    );
  }
  console.log(`✓ pnpm ${PNPM_VERSION}`);
}

async function assertVendorSnapshot(
  directory: string,
  commit: string,
  label: string,
): Promise<void> {
  const actualCommit = await capture("git", ["rev-parse", "HEAD"], directory);
  if (actualCommit !== commit) {
    throw new Error(`${label} 应固定在 ${commit}，当前为 ${actualCommit}`);
  }

  const changes = await capture(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    directory,
  );
  if (changes !== "") {
    throw new Error(`${label} Submodule 包含源码修改；vendor 必须保持只读`);
  }
  console.log(`✓ ${label} @ ${commit.slice(0, 12)}`);
}

async function runChecked(
  label: string,
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  console.log(`\n→ ${label}`);
  const result = await spawnAndWait(command, args, { cwd, env });
  if (result.code !== 0) {
    throw new Error(
      `${label}失败（状态码 ${String(result.code)}，信号 ${String(result.signal)}）`,
    );
  }
  console.log(`✓ ${label}`);
}

async function capture(
  command: string,
  args: string[],
  cwd: string,
): Promise<string> {
  return await new Promise<string>((resolveResult, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolveResult(stdout.trim());
      } else {
        reject(
          new Error(
            `${command} ${args.join(" ")} 失败（状态码 ${String(code)}，信号 ${String(signal)}）：${stderr.trim()}`,
          ),
        );
      }
    });
  });
}

async function runInteractive(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  let interruptedSignal: NodeJS.Signals | undefined;
  const child = spawn(command, args, {
    cwd,
    env,
    shell: false,
    stdio: "inherit",
  });

  const forwardSignal = (signal: NodeJS.Signals): void => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    child.kill(signal);
  };
  const onSigint = () => forwardSignal("SIGINT");
  const onSigterm = () => forwardSignal("SIGTERM");
  process.once("SIGINT", onSigint);
  process.once("SIGTERM", onSigterm);

  try {
    const result = await new Promise<CommandResult>((resolveResult, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) =>
        resolveResult({
          code,
          signal,
          interrupted: interruptedSignal !== undefined,
        }),
      );
    });
    return result;
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  }
}

function spawnAndWait(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<CommandResult> {
  return new Promise<CommandResult>((resolveResult, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      resolveResult({ code, signal, interrupted: false }),
    );
  });
}

function rejectUnknownArguments(): void {
  const allowed = new Set(["--skip-check"]);
  const unknown = [...argumentsSet].filter(
    (argument) => !allowed.has(argument),
  );
  if (unknown.length > 0) {
    throw new Error(`未知参数：${unknown.join(", ")}。使用 --help 查看说明。`);
  }
}

function printHelp(): void {
  console.log(`SeekDock 开发启动器

用法：
  bun run.ts                 准备环境、执行检查并启动 Electron
  bun run.ts --skip-check    跳过检查，直接启动开发环境
  bun run.ts --help          显示帮助

也可以通过 bun start 调用；bun dev 是快速开发入口。`);
}

function toError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause));
}
