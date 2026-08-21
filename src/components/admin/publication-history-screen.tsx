"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { IconArrowLeft, IconClock, IconDatabase, IconHistory, IconRefresh, IconShieldLock } from "@tabler/icons-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { AuditEventList } from "@/components/admin/audit-event-list";
import { compactIdentifier, historyDate, historyStatusLabel } from "@/components/admin/history-format";
import { RollbackDialog } from "@/components/admin/rollback-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getDesktopAuthoringCapability,
  getServerDesktopAuthoringCapability,
  subscribeDesktopAuthoringCapability,
} from "@/lib/admin/authoring-capability";
import {
  listLayerAuditEvents,
  listLayerPublicationHistory,
  listLayerRevisionHistory,
  rollbackLayer,
  type AuditEvents,
  type HistoryResource,
  type LayerPublicationHistory,
  type LayerRevisionHistory,
  type PublicationHistoryResource,
  type RollbackResult,
} from "@/lib/api/history";

export interface PublicationHistoryTransport {
  revisions: typeof listLayerRevisionHistory;
  publications: typeof listLayerPublicationHistory;
  audit: typeof listLayerAuditEvents;
  rollback: typeof rollbackLayer;
}

const defaultTransport: PublicationHistoryTransport = {
  revisions: listLayerRevisionHistory,
  publications: listLayerPublicationHistory,
  audit: listLayerAuditEvents,
  rollback: rollbackLayer,
};

function ScreenSkeleton() {
  return <main className="mx-auto max-w-6xl p-4 pb-24 sm:p-6 md:p-8" role="status" aria-label="Đang tải lịch sử lớp dữ liệu">
    <div className="flex flex-col gap-3"><Skeleton className="h-9 w-72"/><Skeleton className="h-5 w-full max-w-xl"/></div>
    <div className="mt-8 flex flex-col gap-5"><Skeleton className="h-72 w-full rounded-panel"/><Skeleton className="h-64 w-full rounded-panel"/><Skeleton className="h-64 w-full rounded-panel"/></div>
  </main>;
}

function progressText(publication: LayerPublicationHistory["items"][number]) {
  if (publication.status === "published") return `${publication.progress ?? 100}%`;
  if (publication.progress === null) return "Chưa có số đo";
  return `${publication.progress}%`;
}

function eligibilityText(reason: LayerPublicationHistory["items"][number]["rollbackEligibility"]["reasonCode"]) {
  if (reason === "ROLE_FORBIDDEN") return "Vai trò hiện tại không được rollback.";
  if (reason === "ROLLBACK_TARGET_ACTIVE") return "Publication này đang active.";
  if (reason === "SEPARATION_OF_DUTIES") return "Separation of duties không cho phép rollback bản này.";
  if (reason === "ROLLBACK_TARGET_INVALID") return "Publication này chưa từng active hoặc không hợp lệ.";
  return "Publication không đủ điều kiện rollback.";
}

export function PublicationHistoryScreen({ layerId, transport = defaultTransport }: { layerId: string; transport?: PublicationHistoryTransport }) {
  const { principal, csrfToken } = useAdminSession();
  const desktopCapable = useSyncExternalStore(subscribeDesktopAuthoringCapability, getDesktopAuthoringCapability, getServerDesktopAuthoringCapability);
  const [revisions, setRevisions] = useState<HistoryResource<LayerRevisionHistory> | null>(null);
  const [publications, setPublications] = useState<PublicationHistoryResource | null>(null);
  const [audit, setAudit] = useState<HistoryResource<AuditEvents> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [success, setSuccess] = useState<RollbackResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<"revisions" | "publications" | "audit" | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const reload = useCallback(() => {
    setError(null);
    setMutationError(null);
    setLoading(true);
    setReloadVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      transport.revisions(layerId, { limit: 25 }),
      transport.publications(layerId, { limit: 25 }),
      transport.audit(layerId, { limit: 25 }),
    ]).then(([nextRevisions, nextPublications, nextAudit]) => {
      if (!active) return;
      setRevisions(nextRevisions);
      setPublications(nextPublications);
      setAudit(nextAudit);
    }).catch((reason: unknown) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [layerId, reloadVersion, transport]);

  async function moreRevisions() {
    if (!revisions?.data.nextCursor || loadingMore) return;
    setLoadingMore("revisions");
    try {
      const next = await transport.revisions(layerId, { limit: revisions.data.limit, cursor: revisions.data.nextCursor });
      setRevisions({ ...next, data: { ...next.data, items: [...revisions.data.items, ...next.data.items] } });
    } catch (reason) { setMutationError(reason); } finally { setLoadingMore(null); }
  }

  async function morePublications() {
    if (!publications?.data.nextCursor || loadingMore) return;
    setLoadingMore("publications");
    try {
      const next = await transport.publications(layerId, { limit: publications.data.limit, cursor: publications.data.nextCursor });
      setPublications({ ...next, data: { ...next.data, items: [...publications.data.items, ...next.data.items] } });
    } catch (reason) { setMutationError(reason); } finally { setLoadingMore(null); }
  }

  async function moreAudit() {
    if (!audit?.data.nextCursor || loadingMore) return;
    setLoadingMore("audit");
    try {
      const next = await transport.audit(layerId, { limit: audit.data.limit, cursor: audit.data.nextCursor });
      setAudit({ ...next, data: { ...next.data, items: [...audit.data.items, ...next.data.items] } });
    } catch (reason) { setMutationError(reason); } finally { setLoadingMore(null); }
  }

  function rollbackSucceeded(result: RollbackResult) {
    setSuccess(result);
    setMutationError(null);
    reload();
  }

  function rollbackStale(staleError: unknown) {
    setMutationError(staleError);
    setLoading(true);
    setReloadVersion((value) => value + 1);
  }

  if (loading && !revisions) return <ScreenSkeleton/>;
  if (error && (!revisions || !publications || !audit)) return <main className="mx-auto max-w-2xl p-4 sm:p-6"><AdminErrorNotice error={error} onRetry={reload}/></main>;
  if (!revisions || !publications || !audit) return null;

  const title = revisions.data.items[0]?.title ?? "Lớp dữ liệu";
  const pointer = publications.activePointerEtag;
  const publisherOnMobile = principal.role === "publisher" && !desktopCapable;

  return <main className="mx-auto max-w-6xl p-4 pb-24 sm:p-6 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2"><Link href={`/admin/layers/${layerId}`}><IconArrowLeft data-icon="inline-start" stroke={1.75}/>Cấu hình lớp</Link></Button>
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">Lịch sử {title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Theo dõi revision, publication, active pointer và sự kiện audit trong phạm vi vai trò hiện tại.</p>
      </div>
      <Button type="button" variant="outline" onClick={reload}><IconRefresh data-icon="inline-start" stroke={1.75}/>Làm mới</Button>
    </header>

    <div className="mt-6 flex flex-col gap-4">
      {success && <Alert><IconHistory stroke={1.75}/><AlertTitle>Khôi phục hoàn tất</AlertTitle><AlertDescription>Generation {success.generation} đã được tạo. Publication pointer và lịch sử đang được tải lại.</AlertDescription></Alert>}
      {mutationError !== null && (
        <AdminErrorNotice error={mutationError} onRetry={reload}/>
      )}
      {publisherOnMobile && <Alert><IconShieldLock stroke={1.75}/><AlertTitle>Rollback chỉ dùng trên desktop</AlertTitle><AlertDescription>Mobile admin vẫn có thể xem lịch sử và review. Hành động thay đổi active pointer cần viewport desktop và thiết bị trỏ chính xác.</AlertDescription></Alert>}
    </div>

    <section className="mt-8" aria-labelledby="publication-history-heading">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="publication-history-heading" className="text-lg font-semibold">Publication history</h2><p className="mt-1 text-sm text-muted-foreground">Publish hiện là checkpoint đồng bộ. Chỉ publication đã commit hiển thị 100%.</p></div>
        <div className="text-right text-xs text-muted-foreground"><p>History ETag: <code>{publications.historyEtag}</code></p><p className="mt-1">Pointer ETag: <code>{pointer ?? "Chưa có"}</code></p></div>
      </div>
      {publications.data.items.length === 0 ? <Empty className="mt-4 border"><EmptyHeader><EmptyMedia variant="icon"><IconDatabase stroke={1.75}/></EmptyMedia><EmptyTitle>Chưa có publication</EmptyTitle><EmptyDescription>Layer sẽ có lịch sử publication sau lần công bố thành công đầu tiên.</EmptyDescription></EmptyHeader></Empty> : <div className="mt-4 rounded-panel border bg-surface">
        <Table>
          <TableHeader><TableRow><TableHead>Generation</TableHead><TableHead>Revision</TableHead><TableHead>Trạng thái</TableHead><TableHead>Tiến độ</TableHead><TableHead>Kích hoạt</TableHead><TableHead className="text-right">Hành động</TableHead></TableRow></TableHeader>
          <TableBody>{publications.data.items.map((publication) => {
            const canRollback = principal.role === "publisher" && desktopCapable && publication.rollbackEligibility.eligible && pointer !== null;
            return <TableRow key={publication.snapshotId}>
              <TableCell><div className="flex flex-wrap items-center gap-2"><span className="font-medium">{publication.generation}</span>{publication.isActive && <Badge>Đang active</Badge>}</div><p className="mt-1 font-mono text-xs text-muted-foreground" title={publication.snapshotId}>{compactIdentifier(publication.snapshotId)}</p></TableCell>
              <TableCell>#{publication.revisionNo}<p className="mt-1 text-xs text-muted-foreground">{publication.featureCount.toLocaleString("vi-VN")} đối tượng</p></TableCell>
              <TableCell><Badge>{historyStatusLabel(publication.status)}</Badge>{publication.rollbackOf && <p className="mt-1 text-xs text-muted-foreground">Rollback từ {compactIdentifier(publication.rollbackOf)}</p>}</TableCell>
              <TableCell>{progressText(publication)}</TableCell>
              <TableCell>{historyDate(publication.activatedAt)}</TableCell>
              <TableCell className="text-right">{canRollback && pointer ? <RollbackDialog layerId={layerId} publication={publication} activePointerEtag={pointer} auth={{ csrfToken }} transport={{ rollback: transport.rollback }} onSuccess={rollbackSucceeded} onStale={rollbackStale}/> : <span className="text-xs text-muted-foreground">{publication.rollbackEligibility.eligible ? publisherOnMobile ? "Cần desktop" : principal.role !== "publisher" ? "Chỉ Publisher" : "Thiếu pointer ETag" : eligibilityText(publication.rollbackEligibility.reasonCode)}</span>}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table>
      </div>}
      {publications.data.hasMore && <Button type="button" variant="outline" disabled={loadingMore !== null} onClick={morePublications} className="mt-4">{loadingMore === "publications" ? "Đang tải thêm..." : "Tải thêm publication"}</Button>}
    </section>

    <section className="mt-10" aria-labelledby="revision-history-heading">
      <div><h2 id="revision-history-heading" className="text-lg font-semibold">Revision history</h2><p className="mt-1 text-sm text-muted-foreground">Mở revision để xem validation, feature diff và workflow đầy đủ.</p></div>
      {revisions.data.items.length === 0 ? <Empty className="mt-4 border"><EmptyHeader><EmptyMedia variant="icon"><IconClock stroke={1.75}/></EmptyMedia><EmptyTitle>Chưa có revision</EmptyTitle><EmptyDescription>Revision sẽ xuất hiện sau khi layer được tạo.</EmptyDescription></EmptyHeader></Empty> : <ol className="mt-4 divide-y rounded-panel border bg-surface" aria-label="Revision history">
        {revisions.data.items.map((revision) => <li key={revision.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link className="font-medium text-primary hover:underline" href={`/admin/layers/${layerId}/revisions/${revision.id}/review`}>Revision #{revision.revisionNo}</Link><Badge>{historyStatusLabel(revision.status)}</Badge>{revision.activeSnapshotId && <Badge>Generation {revision.activeGeneration}</Badge>}</div><p className="mt-1 text-sm text-muted-foreground">{revision.createdByDisplayName ?? "Người dùng nội bộ"}, {historyDate(revision.updatedAt)}</p></div>
          <div className="text-right text-sm"><p>{revision.featureCount.toLocaleString("vi-VN")} đối tượng</p><p className="mt-1 text-xs text-muted-foreground">{revision.participantCount} người tham gia</p></div>
        </li>)}
      </ol>}
      {revisions.data.hasMore && <Button type="button" variant="outline" disabled={loadingMore !== null} onClick={moreRevisions} className="mt-4">{loadingMore === "revisions" ? "Đang tải thêm..." : "Tải thêm revision"}</Button>}
    </section>

    <section className="mt-10" aria-labelledby="audit-heading">
      <div className="mb-4"><h2 id="audit-heading" className="text-lg font-semibold">Audit theo layer</h2><p className="mt-1 text-sm text-muted-foreground">Backend áp dụng action allowlist theo vai trò. Filter phía client không thể mở rộng phạm vi này.</p></div>
      <AuditEventList events={audit.data} loadingMore={loadingMore === "audit"} onLoadMore={audit.data.hasMore ? moreAudit : undefined}/>
    </section>
  </main>;
}
