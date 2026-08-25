export type SyncActivity = {
  workspaceId: string;
  ownerId: string;
  state: "started" | "finished";
  at: string;
};

export type SyncOwnershipResult<T> =
  | { acquired: true; value: T }
  | { acquired: false };

type LockManagerLike = {
  request<T>(
    name: string,
    options: { mode: "exclusive"; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<T>,
  ): Promise<T>;
};

const ownerId = crypto.randomUUID();
const channelName = "danangmap-editor-sync";

function publish(activity: SyncActivity) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(channelName);
  channel.postMessage(activity);
  channel.close();
}

export function subscribeSyncActivity(
  workspaceId: string,
  listener: (activity: SyncActivity) => void,
) {
  if (typeof BroadcastChannel === "undefined") return () => undefined;
  const channel = new BroadcastChannel(channelName);
  channel.addEventListener("message", (event: MessageEvent<SyncActivity>) => {
    if (event.data?.workspaceId === workspaceId) listener(event.data);
  });
  return () => channel.close();
}

export async function withEditorSyncOwnership<T>(
  workspaceId: string,
  task: () => Promise<T>,
): Promise<SyncOwnershipResult<T>> {
  const locks = navigator.locks as unknown as LockManagerLike | undefined;
  if (!locks)
    throw new Error(
      "Trình duyệt không hỗ trợ Web Locks nên không thể bảo đảm một tab đồng bộ duy nhất.",
    );
  return locks.request(
    `danangmap:editor-sync:${workspaceId}`,
    { mode: "exclusive", ifAvailable: true },
    async (lock) => {
      if (!lock) return { acquired: false } as const;
      publish({
        workspaceId,
        ownerId,
        state: "started",
        at: new Date().toISOString(),
      });
      try {
        return { acquired: true, value: await task() } as const;
      } finally {
        publish({
          workspaceId,
          ownerId,
          state: "finished",
          at: new Date().toISOString(),
        });
      }
    },
  );
}
