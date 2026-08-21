import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const WIN32_NATIVE_PICKER_PATCH_ID =
  "win32-native-picker-utf16-decode-v1";

const WORKER_RELATIVE_PATH =
  "node_modules/@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs";
const ORIGINAL_READ_UTF16 = `function readUtf16(koffi, address) {
\tconst bytes = Buffer.from(koffi.view(address, 32768));
\tlet end = 0;
\twhile (end + 1 < bytes.length && bytes[end] !== 0) end += 2;
\treturn bytes.toString("utf16le", 0, end);
}`;
const PATCHED_READ_UTF16 = `function readUtf16(koffi, address) {
\tconst units = [];
\tfor (let offset = 0; offset < 32768; offset += 2) {
\t\tconst unit = koffi.decode(address, offset, "uint16");
\t\tif (unit === 0) break;
\t\tunits.push(unit);
\t}
\treturn String.fromCharCode(...units);
}`;

export function patchDshRuntime(deploymentDirectory, runtimeTarget) {
  if (runtimeTarget !== "win32-x64") return [];

  const worker = resolve(deploymentDirectory, WORKER_RELATIVE_PATH);
  const source = readFileSync(worker, "utf8");
  if (source.includes(PATCHED_READ_UTF16)) {
    return [WIN32_NATIVE_PICKER_PATCH_ID];
  }
  if (!source.includes(ORIGINAL_READ_UTF16)) {
    throw new Error(
      `Cannot apply ${WIN32_NATIVE_PICKER_PATCH_ID}: the DSH worker shape changed`,
    );
  }

  writeFileSync(
    worker,
    source.replace(ORIGINAL_READ_UTF16, PATCHED_READ_UTF16),
  );
  return [WIN32_NATIVE_PICKER_PATCH_ID];
}

export function hasWin32NativePickerPatch(deploymentDirectory) {
  const worker = resolve(deploymentDirectory, WORKER_RELATIVE_PATH);
  return readFileSync(worker, "utf8").includes(PATCHED_READ_UTF16);
}
