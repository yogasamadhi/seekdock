import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  hasWin32NativePickerPatch,
  patchDshRuntime,
  WIN32_NATIVE_PICKER_PATCH_ID,
} from "./patch-dsh-runtime.mjs";

const temporaryDirectories: string[] = [];
const workerRelativePath =
  "node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs";
const originalWorker = `function readUtf16(koffi, address) {
\tconst bytes = Buffer.from(koffi.view(address, 32768));
\tlet end = 0;
\twhile (end + 1 < bytes.length && bytes[end] !== 0) end += 2;
\treturn bytes.toString("utf16le", 0, end);
}`;

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("DSH runtime compatibility patches", () => {
  it("replaces the crashing Win32 Koffi view with bounded uint16 reads", () => {
    const deployment = createDeployment(originalWorker);

    expect(patchDshRuntime(deployment, "win32-x64")).toEqual([
      WIN32_NATIVE_PICKER_PATCH_ID,
    ]);
    expect(hasWin32NativePickerPatch(deployment)).toBe(true);
    const patched = readFileSync(
      resolve(deployment, workerRelativePath),
      "utf8",
    );
    expect(patched).not.toContain("koffi.view(address, 32768)");
    expect(patched).toContain('koffi.decode(address, offset, "uint16")');
  });

  it("is idempotent and leaves non-Windows deployments untouched", () => {
    const deployment = createDeployment(originalWorker);

    expect(patchDshRuntime(deployment, "darwin-arm64")).toEqual([]);
    expect(readFileSync(resolve(deployment, workerRelativePath), "utf8")).toBe(
      originalWorker,
    );
    patchDshRuntime(deployment, "win32-x64");
    expect(patchDshRuntime(deployment, "win32-x64")).toEqual([
      WIN32_NATIVE_PICKER_PATCH_ID,
    ]);
  });

  it("fails loudly when the pinned DSH worker shape changes", () => {
    const deployment = createDeployment("unexpected worker");

    expect(() => patchDshRuntime(deployment, "win32-x64")).toThrow(
      "the DSH worker shape changed",
    );
  });
});

function createDeployment(workerSource: string): string {
  const deployment = mkdtempSync(resolve(tmpdir(), "seekdock-dsh-patch-"));
  temporaryDirectories.push(deployment);
  const worker = resolve(deployment, workerRelativePath);
  mkdirSync(resolve(worker, ".."), { recursive: true });
  writeFileSync(worker, workerSource);
  return deployment;
}
