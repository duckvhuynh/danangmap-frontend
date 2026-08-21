export interface RestoreRequest { version: number; features: unknown[] }

interface RestorableDraw {
  enabled: boolean;
  clear(): void;
  addFeatures(features: never[]): unknown;
  getSnapshot(): unknown[];
}

export function applyPendingRestore(draw: RestorableDraw | null, request: RestoreRequest, appliedVersion: number, onSnapshot: (features: unknown[]) => void) {
  if (!draw?.enabled || request.version === 0 || request.version <= appliedVersion) return appliedVersion;
  draw.clear();
  if (request.features.length) draw.addFeatures(request.features as never[]);
  onSnapshot(draw.getSnapshot());
  return request.version;
}
