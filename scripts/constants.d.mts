export const MINIMUM_BUN_VERSION: string;
export const DSH_COMMIT: string;
export const DSH_KOFFI_VERSION: string;
export const OPENCODE_COMMIT: string;
export const PI_COMMIT: string;
export const PI_VERSION: string;
export const PNPM_COMMAND: string;
export const repositoryRoot: string;
export const dshRoot: string;
export const openCodeRoot: string;
export const piRoot: string;

export function assertBunVersion(): string;
export function isBunVersionSupported(version: string | undefined): boolean;
