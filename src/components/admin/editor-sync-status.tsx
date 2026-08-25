"use client";

import {
  IconAlertTriangle,
  IconCloudCheck,
  IconCloudOff,
  IconDeviceDesktop,
  IconRefresh,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { FeatureMutationLedgerEntry } from "@/lib/editor/draft-db";

export type EditorSyncPhase =
  | "idle"
  | "syncing"
  | "observing"
  | "offline"
  | "issues";

function issueText(issue: FeatureMutationLedgerEntry) {
  if (issue.response?.status === "conflict")
    return `Máy chủ đã đổi ${issue.response.conflict.changedPaths.join(", ") || "đối tượng này"}.`;
  if (issue.response?.status === "rejected") return issue.response.error.message;
  return issue.lastError?.message ?? "Mutation cần được xử lý lại.";
}

export function EditorSyncStatus({
  phase,
  pendingCount,
  issues,
  remoteChanges,
  onKeepServer,
  onRetryLocal,
}: {
  phase: EditorSyncPhase;
  pendingCount: number;
  issues: FeatureMutationLedgerEntry[];
  remoteChanges: number;
  onKeepServer: (issue: FeatureMutationLedgerEntry) => void;
  onRetryLocal: (issue: FeatureMutationLedgerEntry) => void;
}) {
  const Icon =
    phase === "offline"
      ? IconCloudOff
      : phase === "issues"
        ? IconAlertTriangle
        : phase === "observing"
          ? IconDeviceDesktop
          : phase === "syncing"
            ? IconRefresh
            : IconCloudCheck;
  const label =
    phase === "syncing"
      ? "Đang đồng bộ"
      : phase === "observing"
        ? "Tab khác đang đồng bộ"
        : phase === "offline"
          ? "Đang chờ kết nối"
          : issues.length
            ? `${issues.length} thay đổi cần xử lý`
            : pendingCount
              ? `${pendingCount} thay đổi đang chờ`
              : "Đã đồng bộ";

  return (
    <section
      className="w-[min(360px,calc(100vw-32px))] rounded-panel border bg-surface p-3 map-panel-shadow"
      aria-label="Trạng thái đồng bộ editor"
    >
      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <span className="grid size-9 shrink-0 place-items-center rounded-map-control bg-accent-subtle text-primary">
          <Icon
            size={19}
            stroke={1.75}
            className={phase === "syncing" ? "animate-spin" : undefined}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {remoteChanges > 0
              ? `Đã nhận ${remoteChanges} thay đổi mới từ máy chủ.`
              : "Mutation được lưu bền vững trên thiết bị này."}
          </p>
        </div>
      </div>
      {issues.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {issues.map((issue) => (
            <article
              key={issue.id}
              className="rounded-control bg-amber-50 p-3 text-xs text-warning"
            >
              <p className="font-semibold text-foreground">
                {issue.mutation.operation === "create"
                  ? "Tạo đối tượng"
                  : issue.mutation.operation === "update"
                    ? "Cập nhật đối tượng"
                    : "Xóa đối tượng"}
              </p>
              <p className="mt-1 leading-5">{issueText(issue)}</p>
              {issue.responseRequestId && (
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  Mã yêu cầu: {issue.responseRequestId}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onKeepServer(issue)}
                >
                  Giữ bản máy chủ
                </Button>
                <Button size="sm" onClick={() => onRetryLocal(issue)}>
                  {issue.status === "conflict"
                    ? "Dùng bản cục bộ"
                    : "Sửa và thử lại"}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
