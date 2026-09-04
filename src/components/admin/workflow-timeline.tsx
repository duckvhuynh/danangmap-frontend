import { useEffect, useId, useRef } from "react";
import {
  GitCommit as IconGitCommit,
  History as IconHistory,
} from "lucide-react";
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
  const listId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const wasLoadingMore = useRef(false);

  useEffect(() => {
    if (wasLoadingMore.current && !loadingMore) listRef.current?.focus();
    wasLoadingMore.current = loadingMore;
  }, [events?.items.length, loadingMore]);

  if (loading) return <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-label="Đang tải lịch sử duyệt"><Skeleton className="h-16 w-full"/><Skeleton className="h-16 w-full"/></div>;
  if (error) return <AdminErrorNotice error={error} onRetry={onRetry}/>;
  if (!events || events.items.length === 0) return <Empty className="border" role="status" aria-live="polite"><EmptyHeader><EmptyMedia variant="icon"><IconHistory aria-hidden="true" strokeWidth={1.75}/></EmptyMedia><EmptyTitle>Chưa có thao tác duyệt</EmptyTitle><EmptyDescription>Các lần gửi duyệt, phê duyệt và yêu cầu chỉnh sửa sẽ xuất hiện tại đây.</EmptyDescription></EmptyHeader></Empty>;

  return <div className="flex flex-col gap-4">
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      Đã tải {events.items.length.toLocaleString("vi-VN")} thao tác duyệt.
    </p>
    <ol ref={listRef} id={listId} tabIndex={-1} className="divide-y rounded-panel border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Lịch sử duyệt" aria-busy={loadingMore}>
      {events.items.map((event) => <li key={event.id} className="flex gap-3 p-4">
        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary"><IconGitCommit size={19} strokeWidth={1.75}/></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span aria-hidden="true">{historyStatusLabel(event.fromStatus)}</span>
            <span aria-hidden="true">→</span>
            <span aria-hidden="true">{historyStatusLabel(event.toStatus)}</span>
            <span className="sr-only">Từ {historyStatusLabel(event.fromStatus)} sang {historyStatusLabel(event.toStatus)}.</span>
            <Badge>{historyRoleLabel(event.role)}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{event.actorDisplayName ?? "Người dùng nội bộ"}, <time dateTime={event.occurredAt}>{historyDate(event.occurredAt)}</time></p>
          {event.reason && <p className="mt-2 text-sm leading-6">{event.reason}</p>}
        </div>
      </li>)}
    </ol>
    {events.hasMore && onLoadMore && <Button type="button" variant="outline" disabled={loadingMore} aria-controls={listId} aria-busy={loadingMore} onClick={onLoadMore} className="self-start">{loadingMore ? "Đang tải thêm..." : "Xem thêm lịch sử duyệt"}</Button>}
  </div>;
}
