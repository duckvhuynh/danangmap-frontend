import type { SpatialImportJob } from "@/lib/api/imports";
import { shouldPollImport } from "@/lib/imports/import-wizard-state";

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); }, { once: true });
  });
}

export async function pollSpatialImport(
  importId: string,
  load: (id: string) => Promise<SpatialImportJob>,
  onUpdate: (job: SpatialImportJob) => void,
  signal: AbortSignal,
  intervalMs = 1_000,
) {
  while (!signal.aborted) {
    const job = await load(importId);
    onUpdate(job);
    if (!shouldPollImport(job.status)) return job;
    await abortableDelay(intervalMs, signal);
  }
  throw new DOMException("Aborted", "AbortError");
}
