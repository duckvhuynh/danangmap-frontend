"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RefreshCw as IconRefresh,
  Shield as IconShieldLock,
} from "lucide-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { AuditEventList } from "@/components/admin/audit-event-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { listAuditEvents, type HistoryResource, type SystemAuditEvents } from "@/lib/api/history";

export interface SystemAuditTransport {
  load: typeof listAuditEvents;
}

const defaultTransport: SystemAuditTransport = { load: listAuditEvents };

export function SystemAuditScreen({ transport = defaultTransport }: { transport?: SystemAuditTransport }) {
  const { principal } = useAdminSession();
  const [resource, setResource] = useState<HistoryResource<SystemAuditEvents> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(principal.role === "system_admin");
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

  const reload = useCallback(() => {
    setResource(null);
    setError(null);
    setLoading(true);
    setReloadVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (principal.role !== "system_admin") return;
    let active = true;
    transport.load({ limit: 25 }).then((next) => {
      if (active) setResource(next);
    }).catch((reason: unknown) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [principal.role, reloadVersion, transport]);

  async function loadMore() {
    if (!resource?.data.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await transport.load({ limit: resource.data.limit, cursor: resource.data.nextCursor });
      setResource({ ...next, data: { ...next.data, items: [...resource.data.items, ...next.data.items] } });
    } catch (reason) { setError(reason); } finally { setLoadingMore(false); }
  }

  if (principal.role !== "system_admin") return <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 md:p-8" aria-labelledby="system-audit-title">
    <h1 id="system-audit-title" className="sr-only">Nhật ký hoạt động</h1>
    <Alert>
      <IconShieldLock aria-hidden="true" strokeWidth={1.75}/>
      <AlertTitle>Bạn không có quyền xem nhật ký toàn hệ thống</AlertTitle>
      <AlertDescription>Bạn có thể xem lịch sử thao tác trong từng lớp dữ liệu.</AlertDescription>
    </Alert>
  </main>;

  return <main className="mx-auto max-w-6xl p-4 pb-24 sm:p-6 md:p-8" aria-labelledby="system-audit-title" aria-busy={loading}>
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 id="system-audit-title" className="text-2xl font-semibold tracking-[-0.02em]">Nhật ký hoạt động</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Tra cứu ai đã thực hiện thao tác nào và vào lúc nào. Nhật ký được lưu tự động, không thể chỉnh sửa.</p></div>
      <Button type="button" variant="outline" aria-controls="system-audit-feed" aria-busy={loading} disabled={loading} onClick={reload}><IconRefresh aria-hidden="true" data-icon="inline-start" strokeWidth={1.75}/>{loading ? "Đang làm mới..." : "Làm mới"}</Button>
    </header>
    <div id="system-audit-feed" className="mt-5">
      <AuditEventList events={resource?.data ?? null} loading={loading} loadingMore={loadingMore} error={resource ? null : error} onRetry={reload} onLoadMore={resource?.data.hasMore ? loadMore : undefined}/>
    </div>
    {error !== null && resource && <div className="mt-4"><AdminErrorNotice error={error} onRetry={loadMore}/></div>}
  </main>;
}
