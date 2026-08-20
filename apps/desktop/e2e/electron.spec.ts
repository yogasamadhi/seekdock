import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from "@playwright/test";

const desktopDirectory = resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = resolve(desktopDirectory, "../..");

test("loads DSH, enforces external navigation, and recovers after a runtime crash", async () => {
  const testRoot = mkdtempSync(resolve(tmpdir(), "seekdock-electron-"));
  let electronApp: ElectronApplication | undefined;

  try {
    electronApp = await electron.launch({
      args: [resolve(desktopDirectory, "out/main/index.js")],
      cwd: desktopDirectory,
      env: {
        ...process.env,
        SEEKDOCK_E2E: "1",
        SEEKDOCK_REPOSITORY_ROOT: repositoryRoot,
        SEEKDOCK_USER_DATA_DIR: resolve(testRoot, "user-data"),
      },
    });

    const page = await electronApp.firstWindow();
    await expect
      .poll(() => page.url())
      .toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/u);
    await assertDshWebUi(page);
    const firstOrigin = new URL(page.url()).origin;

    await page.evaluate(() => {
      const anchor = document.createElement("a");
      anchor.id = "seekdock-e2e-external";
      anchor.href = "https://github.com/deepseek-ai/deepseek-harness";
      anchor.target = "_blank";
      anchor.textContent = "external";
      document.body.append(anchor);
    });
    await page.locator("#seekdock-e2e-external").click({ force: true });
    await expect.poll(() => electronApp?.windows().length).toBe(1);
    expect(new URL(page.url()).origin).toBe(firstOrigin);

    test.skip(
      process.platform === "win32",
      "The runtime crash locator uses the POSIX process table",
    );
    const mainPid = electronApp.process().pid;
    if (!mainPid) throw new Error("Electron main process has no PID");
    const runtimePid = findRuntimePid(mainPid);
    process.kill(runtimePid, "SIGKILL");

    await expect
      .poll(() => page.url())
      .toContain("seekdock://shell/index.html?state=failed");
    await expect(page.locator("#restart")).toBeVisible();
    await expect
      .poll(() =>
        page.locator(".shell").evaluate((element) => {
          const style = getComputedStyle(element);
          return { color: style.color, display: style.display };
        }),
      )
      .toEqual({ color: "rgb(245, 247, 255)", display: "grid" });
    await page.locator("#restart").click();
    await expect
      .poll(() => page.url(), { timeout: 60_000 })
      .toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/u);
    await assertDshWebUi(page);

    const log = readFileSync(
      resolve(testRoot, "user-data/logs/seekdock.log"),
      "utf8",
    );
    expect(log).toContain("DeepSeek Harness is ready");
    expect(log).toContain("exited unexpectedly");
    expect(log).not.toContain("opening the default browser");
  } finally {
    await electronApp?.close();
    rmSync(testRoot, { recursive: true, force: true });
  }
});

async function assertDshWebUi(page: Page): Promise<void> {
  await expect(page).toHaveTitle("DSH Local Build");
  await expect(page.locator("#root")).toBeAttached();
  await expect(
    page.getByRole("button", { name: "新建会话" }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "设置" })).toBeVisible();
  await expect(page.getByRole("button", { name: "选择工作区" })).toBeVisible();
  await expect(page.getByRole("button", { name: "标准模式" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "选择工作区" })).toBeVisible();
}

function findRuntimePid(mainPid: number): number {
  const processTable = execFileSync("ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
  });
  for (const line of processTable.split("\n")) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
    if (!match) continue;
    if (
      Number(match[2]) === mainPid &&
      match[3]?.includes("dsh-launcher.mjs")
    ) {
      return Number(match[1]);
    }
  }
  throw new Error(
    `Unable to locate the DSH child of Electron process ${String(mainPid)}`,
  );
}
