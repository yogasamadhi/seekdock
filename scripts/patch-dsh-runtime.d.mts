export const WIN32_NATIVE_PICKER_PATCH_ID: string;

export function patchDshRuntime(
  deploymentDirectory: string,
  runtimeTarget: string,
): string[];

export function hasWin32NativePickerPatch(deploymentDirectory: string): boolean;
