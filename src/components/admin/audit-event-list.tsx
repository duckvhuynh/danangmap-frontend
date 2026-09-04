import { useEffect, useId, useRef } from "react";
import {
  ClipboardList as IconClipboardList,
  Shield as IconShieldLock,
} from "lucide-react";
import { AdminErrorNotice } from "@/components/admin/admin-session";
import { historyDate, historyRoleLabel } from "@/components/admin/history-format";
import { auditActionLabel, auditResourceLabel } from "@/lib/admin/audit-labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditEvents } from "@/lib/api/history";

export function AuditEventList({
  events,
  loading = false,
  loadingMore = false,
  error = null,
  onRetry,
  onLoadMore,
}: {
  events: AuditEvents | null;
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

  if (loading) {
    return <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-label="Đang tải nhật ký hoạt động">
      <Skeleton className="h-16 w-full"/>
      <Skeleton className="h-16 w-full"/>
      <Skeleton className="h-16 w-full"/>
    </div>;
  }

  if (error) return <AdminErrorNotice error={error} onRetry={onRetry}/>;

  if (!events || events.items.length === 0) {
    return <Empty className="border" role="status" aria-live="polite">
      <EmptyHeader>
        <EmptyMedia variant="icon"><IconClipboardList aria-hidden="true" strokeWidth={1.75}/></EmptyMedia>
        <EmptyTitle>Chưa có hoạt động</EmptyTitle>
        <EmptyDescription>Các thao tác quản trị sẽ được ghi lại tại đây để bạn tra cứu.</EmptyDescription>
      </EmptyHeader>
    </Empty>;
  }

  return <div className="flex flex-col gap-4">
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      Đã tải {events.items.length.toLocaleString("vi-VN")} hoạt động.
    </p>
    <ol ref={listRef} id={listId} tabIndex={-1} className="divide-y rounded-panel border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Nhật ký hoạt động" aria-busy={loadingMore}>
      {events.items.map((event) => {
        const eventLabel = `${auditActionLabel(event.action)}, ${event.actorDisplayName ?? "Hệ thống"}, ${historyDate(event.occurredAt)}`;
        return <li key={event.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <IconShieldLock aria-hidden="true" className="shrink-0 text-muted-foreground" size={18} strokeWidth={1.75}/>
            <p className="break-words text-sm font-medium">{auditActionLabel(event.action)}</p>
            <Badge>{historyRoleLabel(event.actorRole)}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {event.actorDisplayName ?? "Hệ thống"} · {auditResourceLabel(event.resourceType)}
          </p>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer rounded-control font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Thông tin hỗ trợ: ${eventLabel}`}>Thông tin hỗ trợ</summary>
            <dl className="mt-2 flex flex-col gap-2 break-all rounded-control bg-surface-subtle p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label={`Mã tham chiếu: ${eventLabel}`}><div><dt>Mã thao tác</dt><dd>{event.action}</dd></div><div><dt>Mã yêu cầu</dt><dd>{event.requestId}</dd></div>{event.resourceId && <div><dt>Mã đối tượng</dt><dd>{event.resourceId}</dd></div>}</dl>
          </details>
        </div>
        <div className="text-xs text-muted-foreground lg:text-right">
          <time dateTime={event.occurredAt}>{historyDate(event.occurredAt)}</time>
        </div>
      </li>;
      })}
    </ol>
    {events.hasMore && onLoadMore && <Button type="button" variant="outline" disabled={loadingMore} aria-controls={listId} aria-busy={loadingMore} onClick={onLoadMore} className="self-start">
      {loadingMore ? "Đang tải thêm..." : "Xem thêm hoạt động"}
    </Button>}
  </div>;
}
