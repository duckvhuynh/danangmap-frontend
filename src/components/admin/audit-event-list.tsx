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
  if (loading) {
    return <div className="flex flex-col gap-3" role="status" aria-label="Đang tải nhật ký kiểm toán">
      <Skeleton className="h-16 w-full"/>
      <Skeleton className="h-16 w-full"/>
      <Skeleton className="h-16 w-full"/>
    </div>;
  }

  if (error) return <AdminErrorNotice error={error} onRetry={onRetry}/>;

  if (!events || events.items.length === 0) {
    return <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><IconClipboardList stroke={1.75}/></EmptyMedia>
        <EmptyTitle>Chưa có sự kiện kiểm toán</EmptyTitle>
        <EmptyDescription>Các thao tác hợp lệ trong phạm vi quyền hiện tại sẽ xuất hiện tại đây.</EmptyDescription>
      </EmptyHeader>
    </Empty>;
  }

  return <div className="flex flex-col gap-4">
    <ol className="divide-y rounded-panel border bg-surface" aria-label="Sự kiện kiểm toán">
      {events.items.map((event) => <li key={event.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <IconShieldLock className="shrink-0 text-muted-foreground" size={18} stroke={1.75}/>
            <p className="break-words text-sm font-medium">{event.action}</p>
            <Badge>{historyRoleLabel(event.actorRole)}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {event.actorDisplayName ?? "Hệ thống"}, {event.resourceType}
            {event.resourceId ? ` ${compactIdentifier(event.resourceId)}` : ""}
          </p>
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Metadata đã lọc</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-control bg-surface-subtle p-3">{JSON.stringify(event.metadata, null, 2)}</pre>
          </details>
        </div>
        <div className="text-xs text-muted-foreground lg:text-right">
          <p>{historyDate(event.occurredAt)}</p>
          <p className="mt-1 font-mono" title={event.requestId}>Request {compactIdentifier(event.requestId)}</p>
        </div>
      </li>)}
    </ol>
    {events.hasMore && onLoadMore && <Button type="button" variant="outline" disabled={loadingMore} onClick={onLoadMore} className="self-start">
      {loadingMore ? "Đang tải thêm..." : "Tải thêm sự kiện"}
    </Button>}
  </div>;
}
