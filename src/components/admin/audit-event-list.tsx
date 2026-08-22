import { useEffect, useId, useRef } from "react";
import { IconClipboardList, IconShieldLock } from "@tabler/icons-react";
import { AdminErrorNotice } from "@/components/admin/admin-session";
import { compactIdentifier, historyDate, historyRoleLabel } from "@/components/admin/history-format";
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
    return <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-label="Đang tải nhật ký kiểm toán">
      <Skeleton className="h-16 w-full"/>
      <Skeleton className="h-16 w-full"/>
      <Skeleton className="h-16 w-full"/>
    </div>;
  }

  if (error) return <AdminErrorNotice error={error} onRetry={onRetry}/>;

  if (!events || events.items.length === 0) {
    return <Empty className="border" role="status" aria-live="polite">
      <EmptyHeader>
        <EmptyMedia variant="icon"><IconClipboardList aria-hidden="true" stroke={1.75}/></EmptyMedia>
        <EmptyTitle>Chưa có sự kiện kiểm toán</EmptyTitle>
        <EmptyDescription>Các thao tác hợp lệ trong phạm vi quyền hiện tại sẽ xuất hiện tại đây.</EmptyDescription>
      </EmptyHeader>
    </Empty>;
  }

  return <div className="flex flex-col gap-4">
    <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      Đã tải {events.items.length.toLocaleString("vi-VN")} sự kiện kiểm toán.
    </p>
    <ol ref={listRef} id={listId} tabIndex={-1} className="divide-y rounded-panel border bg-surface outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Sự kiện kiểm toán" aria-busy={loadingMore}>
      {events.items.map((event) => {
        const eventLabel = `${event.action}, ${event.actorDisplayName ?? "Hệ thống"}, ${historyDate(event.occurredAt)}`;
        return <li key={event.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <IconShieldLock aria-hidden="true" className="shrink-0 text-muted-foreground" size={18} stroke={1.75}/>
            <p className="break-words text-sm font-medium">{event.action}</p>
            <Badge>{historyRoleLabel(event.actorRole)}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {event.actorDisplayName ?? "Hệ thống"}, {event.resourceType}
            {event.resourceId ? ` ${compactIdentifier(event.resourceId)}` : ""}
          </p>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer rounded-control font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Metadata đã lọc cho ${eventLabel}`}>Metadata đã lọc</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-control bg-surface-subtle p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring" tabIndex={0} aria-label={`Nội dung metadata đã lọc cho ${eventLabel}`}>{JSON.stringify(event.metadata, null, 2)}</pre>
          </details>
        </div>
        <div className="text-xs text-muted-foreground lg:text-right">
          <time dateTime={event.occurredAt}>{historyDate(event.occurredAt)}</time>
          <p className="mt-1 font-mono" title={event.requestId}>Request {compactIdentifier(event.requestId)}</p>
        </div>
      </li>;
      })}
    </ol>
    {events.hasMore && onLoadMore && <Button type="button" variant="outline" disabled={loadingMore} aria-controls={listId} aria-busy={loadingMore} onClick={onLoadMore} className="self-start">
      {loadingMore ? "Đang tải thêm..." : "Tải thêm sự kiện"}
    </Button>}
  </div>;
}
