import { IconGitCommit, IconHistory } from "@tabler/icons-react";
import { AdminErrorNotice } from "@/components/admin/admin-session";
import { historyDate, historyRoleLabel, historyStatusLabel } from "@/components/admin/history-format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { WorkflowEvents } from "@/lib/api/history";

export function WorkflowTimeline({
  events,
  loading = false,
  loadingMore = false,
  error = null,
  onRetry,
  onLoadMore,
}: {
  events: WorkflowEvents | null;
  loading?: boolean;
  loadingMore?: boolean;
  error?: unknown;
  onRetry?: () => void;
  onLoadMore?: () => void;
}) {
  if (loading) return <div className="flex flex-col gap-3" role="status" aria-label="Đang tải tiến trình workflow"><Skeleton className="h-16 w-full"/><Skeleton className="h-16 w-full"/></div>;
  if (error) return <AdminErrorNotice error={error} onRetry={onRetry}/>;
  if (!events || events.items.length === 0) return <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><IconHistory stroke={1.75}/></EmptyMedia><EmptyTitle>Chưa có chuyển trạng thái</EmptyTitle><EmptyDescription>Workflow sẽ ghi lại người thực hiện, vai trò, lý do và thời điểm.</EmptyDescription></EmptyHeader></Empty>;

  return <div className="flex flex-col gap-4">
    <ol className="divide-y rounded-panel border bg-surface" aria-label="Tiến trình workflow">
      {events.items.map((event) => <li key={event.id} className="flex gap-3 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary"><IconGitCommit size={19} stroke={1.75}/></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span>{historyStatusLabel(event.fromStatus)}</span>
            <span aria-hidden="true">→</span>
            <span>{historyStatusLabel(event.toStatus)}</span>
            <Badge>{historyRoleLabel(event.role)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{event.actorDisplayName ?? "Người dùng nội bộ"}, {historyDate(event.occurredAt)}</p>
          {event.reason && <p className="mt-2 text-sm leading-6">{event.reason}</p>}
        </div>
      </li>)}
    </ol>
    {events.hasMore && onLoadMore && <Button type="button" variant="outline" disabled={loadingMore} onClick={onLoadMore} className="self-start">{loadingMore ? "Đang tải thêm..." : "Tải thêm workflow"}</Button>}
  </div>;
}
