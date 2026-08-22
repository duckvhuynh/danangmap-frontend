import type { UserImportActions, UserImportJob } from "@/lib/api/user-imports";
import { shouldPollUserImport } from "@/lib/user-imports/user-import-state";

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

export async function pollUserImport(
  actions: Pick<UserImportActions, "get">,
  initial: UserImportJob,
  options: { intervalMs?: number; signal?: AbortSignal; maxPolls?: number; onUpdate?: (job: UserImportJob) => void } = {},
): Promise<UserImportJob> {
  const { intervalMs = 800, signal, maxPolls = 120, onUpdate } = options;
  let current = initial;
  for (let attempt = 0; shouldPollUserImport(current.status) && attempt < maxPolls; attempt += 1) {
    signal?.throwIfAborted();
    await abortableDelay(intervalMs, signal);
    current = await actions.get(current.id, signal);
    onUpdate?.(current);
  }
  if (shouldPollUserImport(current.status)) throw new Error("Theo dõi import quá thời gian chờ. Hãy cập nhật trạng thái mà không tạo phiên mới.");
  return current;
}
