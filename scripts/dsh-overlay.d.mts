export interface DshOverlayManifest {
  id: string;
  baseCommit: string;
  sourceCommit: string;
  modules: Record<string, string>;
  runtimePackages: Record<string, string>;
  contentDigests: {
    compatibilityPatch: string;
    modules: string;
  };
}

export const dshOverlayRoot: string;
export const dshOverlayManifestPath: string;
export const dshOverlayPatchPath: string;
export const dshOverlayModulesRoot: string;
export function readDshOverlayManifest(): DshOverlayManifest;
export function calculateDshOverlayContentDigests(): {
  compatibilityPatch: string;
  modules: string;
};
export function calculateDshOverlayDigest(): string;
export function assertDshVendorPristine(): Promise<void>;
export function materializePatchedDshSource(target: string): Promise<string>;
export function removePatchedDshSource(target: string): void;
