"use client";

import {
  TriangleAlert as IconAlertTriangle,
  CloudCheck as IconCloudCheck,
  CloudOff as IconCloudOff,
  Monitor as IconDeviceDesktop,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminApiError, adminErrorMessage } from "@/lib/api/admin";
import type { FeatureMutationLedgerEntry } from "@/lib/editor/draft-db";

export type EditorSyncPhase =
  | "idle"
  | "syncing"
  | "observing"
  | "offline"
  | "issues";

function issueText(issue: FeatureMutationLedgerEntry) {
  if (issue.response?.status === "conflict")
    return "Đối tượng này đã có thay đổi mới. Chọn giữ bản đã lưu hoặc giữ thay đổi của bạn để lưu lại.";
  if (issue.response?.status === "rejected")
    return adminErrorMessage(new AdminApiError(422, issue.response.error.code, issue.response.error.message));
  return "Chưa lưu được thay đổi này. Kiểm tra kết nối rồi thử lại.";
}

export function EditorSyncStatus({
  phase,
  hasLocalChanges = false,
  pendingCount,
  issues,
  remoteChanges,
  onKeepServer,
  onRetryLocal,
}: {
  phase: EditorSyncPhase;
  hasLocalChanges?: boolean;
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
              : hasLocalChanges
                ? "Có thay đổi chưa lưu"
                : "Đã lưu lên hệ thống";

  return (
    <section
      className="w-full max-w-[360px] rounded-panel border bg-surface p-3 map-panel-shadow"
      aria-label="Trạng thái lưu dữ liệu"
    >
      <div className="flex items-center gap-2" role="status" aria-live="polite">
        <span className="grid size-9 shrink-0 place-items-center rounded-map-control bg-accent-subtle text-primary">
          <Icon
            size={19}
            strokeWidth={1.75}
            className={phase === "syncing" ? "animate-spin" : undefined}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {remoteChanges > 0
              ? `Đã nhận ${remoteChanges} thay đổi mới từ máy chủ.`
              : hasLocalChanges || pendingCount > 0
                ? "Thay đổi chưa được lưu lên hệ thống."
                : "Bạn có thể tiếp tục biên tập hoặc gửi duyệt."}
          </p>
        </div>
      </div>
      {issues.length > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          {issues.map((issue) => (
            <article
              key={issue.id}
              className="rounded-control bg-warning/10 p-3 text-xs text-warning"
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
                <details className="mt-2 text-muted-foreground">
                  <summary className="cursor-pointer">Thông tin hỗ trợ kỹ thuật</summary>
                  <p className="mt-1 break-all">Mã hỗ trợ: {issue.responseRequestId}</p>
                </details>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onKeepServer(issue)}
                >
                  Giữ bản đã lưu
                </Button>
                <Button size="sm" onClick={() => onRetryLocal(issue)}>
                  {issue.status === "conflict"
                    ? "Giữ thay đổi của tôi"
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
