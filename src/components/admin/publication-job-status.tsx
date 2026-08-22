"use client";

import { forwardRef } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconCloudOff,
  IconDatabaseExport,
  IconLoader2,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import type { PublicationJob } from "@/lib/api/publication-jobs";
import type { PublicationTrackingIssue, PublicationTrackingState } from "@/lib/publications/publication-job-tracking";

const phaseText: Record<PublicationJob["phase"], string> = {
  queued: "Đang chờ xử lý",
  preparing: "Đang chuẩn bị snapshot",
  scanning_features: "Đang dựng dữ liệu công khai",
  switching: "Đang chuyển publication pointer",
  completed: "Đã công bố",
  failed: "Công bố không thành công",
};

function statusIcon(job: PublicationJob) {
  if (job.status === "succeeded") return <IconCheck stroke={1.75}/>;
  if (job.status === "failed") return <IconAlertTriangle stroke={1.75}/>;
  if (job.status === "queued") return <IconClock stroke={1.75}/>;
  if (job.phase === "switching") return <IconDatabaseExport stroke={1.75}/>;
  return <IconLoader2 stroke={1.75}/>;
}

function measuredProgress(job: PublicationJob) {
  const { completedUnits, totalUnits, percent } = job.progress;
  if (totalUnits === null) return `${completedUnits.toLocaleString("vi-VN")} đối tượng đã xử lý. Tổng số đang được đo.`;
  if (totalUnits === 0) return "Revision không có đối tượng cần dựng.";
  return `${completedUnits.toLocaleString("vi-VN")} trên ${totalUnits.toLocaleString("vi-VN")} đối tượng, ${percent ?? 0}%.`;
}

export const PublicationJobStatus = forwardRef<HTMLElement, {
  job: PublicationJob;
  trackingState?: PublicationTrackingState;
  trackingIssue?: PublicationTrackingIssue | null;
  compact?: boolean;
}>(({ job, trackingState = "connected", trackingIssue = null, compact = false }, ref) => {
  const percent = job.progress.percent;
  const determinate = job.status !== "queued" && job.progress.totalUnits !== null && job.progress.totalUnits > 0 && percent !== null;
  const liveText = job.status === "failed"
    ? "Công bố không thành công."
    : job.status === "succeeded"
      ? "Dữ liệu đã được công bố."
      : phaseText[job.phase];

  return <section
    ref={ref}
    tabIndex={-1}
    className="rounded-panel border bg-surface p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    aria-label={`Publication job ${job.id}`}
  >
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <Badge>{statusIcon(job)}{phaseText[job.phase]}</Badge>
        {!compact && <p className="mt-2 font-mono text-xs text-muted-foreground">Job {job.id}</p>}
      </div>
      <p className="text-xs text-muted-foreground">Lần thử {job.attempt}</p>
    </div>

    {!compact && <p className="sr-only" aria-live="polite" aria-atomic="true">{liveText}</p>}

    <div className="mt-3">
      <p className="text-sm text-muted-foreground">{measuredProgress(job)}</p>
      {determinate && <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-accent-subtle"
        role="progressbar"
        aria-label="Tiến độ dựng publication"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent!}
        aria-valuetext={measuredProgress(job)}
      >
        <div className="h-full rounded-full bg-primary transition-[width] duration-150" style={{ width: `${percent}%` }}/>
      </div>}
    </div>

    {job.phase === "switching" && <p className="mt-3 text-sm text-muted-foreground">Bản đồ công khai vẫn dùng publication hiện hành cho đến khi bước chuyển hoàn tất.</p>}

    {job.status === "succeeded" && job.result && <p className="mt-3 text-sm text-success">Đã tạo generation {job.result.generation}.</p>}

    {job.status === "failed" && job.failure && <div className="mt-3 rounded-control border border-destructive/25 p-3 text-sm text-destructive" role="alert">
      <p className="font-medium">{job.failure.userMessage}</p>
      <p className="mt-1 text-xs">Mã lỗi: {job.failure.code}</p>
      {job.failure.requestId && <p className="mt-1 text-xs">Mã yêu cầu: {job.failure.requestId}</p>}
      <p className="mt-1 text-xs">{job.failure.retryable ? "Có thể thử công bố lại bằng một yêu cầu mới." : "Cần xử lý nguyên nhân trước khi công bố lại."}</p>
    </div>}

    {!compact && job.status !== "succeeded" && job.status !== "failed" && trackingState !== "connected" && <div className="mt-3 flex items-start gap-2 text-sm text-warning" role="status">
      <IconCloudOff className="mt-0.5 shrink-0" size={18} stroke={1.75}/>
      <div>
        <p>{trackingIssue?.userMessage ?? (trackingState === "paused" ? "Tab đang ở nền. Tần suất theo dõi đã được giảm." : "Đã mất kết nối theo dõi. Công việc trên máy chủ vẫn tiếp tục.")}</p>
        {trackingIssue && <p className="mt-1 text-xs">Mã theo dõi: {trackingIssue.code}</p>}
      </div>
    </div>}
  </section>;
});

PublicationJobStatus.displayName = "PublicationJobStatus";
