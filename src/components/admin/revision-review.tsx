"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconCloudUpload,
  IconMessage,
  IconPolygon,
  IconX,
} from "@tabler/icons-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { AuditEventList } from "@/components/admin/audit-event-list";
import { RevisionDiffView } from "@/components/admin/revision-diff-view";
import { ReviewMapPreview } from "@/components/admin/review-map-preview";
import { ValidationReport } from "@/components/admin/validation-report";
import { WorkflowTimeline } from "@/components/admin/workflow-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  getDesktopAuthoringCapability,
  getServerDesktopAuthoringCapability,
  subscribeDesktopAuthoringCapability,
} from "@/lib/admin/authoring-capability";
import {
  AdminApiError,
  approveRevision,
  loadRevisionBundle,
  publishRevision,
  requestRevisionChanges,
  type RevisionBundle,
} from "@/lib/api/admin";
import {
  getRevisionHistory,
  listLayerAuditEvents,
  listRevisionWorkflowEvents,
  type AuditEvents,
  type HistoryResource,
  type RevisionHistory,
  type WorkflowEvents,
} from "@/lib/api/history";

function ReviewSkeleton() {
  return <main className="min-h-[100dvh] bg-surface-subtle p-4 md:p-6" role="status" aria-label="Đang tải revision">
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Skeleton className="h-16 w-full"/>
      <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
        <Skeleton className="h-[32rem] w-full"/>
        <div className="flex flex-col gap-4"><Skeleton className="h-48 w-full"/><Skeleton className="h-40 w-full"/></div>
      </div>
    </div>
  </main>;
}

export function RevisionReview({ revisionId, layerId }: { revisionId: string; layerId?: string }) {
  const { principal, csrfToken } = useAdminSession();
  const canPublishHere = useSyncExternalStore(
    subscribeDesktopAuthoringCapability,
    getDesktopAuthoringCapability,
    getServerDesktopAuthoringCapability,
  );
  const [bundle, setBundle] = useState<RevisionBundle | null>(null);
  const [history, setHistory] = useState<HistoryResource<RevisionHistory> | null>(null);
  const [workflow, setWorkflow] = useState<HistoryResource<WorkflowEvents> | null>(null);
  const [audit, setAudit] = useState<HistoryResource<AuditEvents> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [comment, setComment] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "changes" | "publish" | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const operationKeys = useRef<Record<string, string>>({});

  const operationKey = (action: string) => operationKeys.current[action] ??= crypto.randomUUID();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHistoryError(null);
    let bundleLoaded = false;
    try {
      const nextBundle = await loadRevisionBundle(revisionId);
      const resolvedLayerId = layerId ?? nextBundle.revision.layerId;
      if (layerId && layerId !== nextBundle.revision.layerId) {
        throw new AdminApiError(404, "REVISION_LAYER_MISMATCH", "Revision không thuộc layer trên đường dẫn hiện tại.", undefined, {
          requestedLayerId: layerId,
          actualLayerId: nextBundle.revision.layerId,
        });
      }
      bundleLoaded = true;
      setBundle(nextBundle);
      if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true") {
        const [nextHistory, nextWorkflow, nextAudit] = await Promise.all([
          getRevisionHistory(revisionId),
          listRevisionWorkflowEvents(revisionId, { limit: 25 }),
          listLayerAuditEvents(resolvedLayerId, { limit: 25, resourceId: revisionId }),
        ]);
        setHistory(nextHistory);
        setWorkflow(nextWorkflow);
        setAudit(nextAudit);
      }
    } catch (reason) {
      if (bundleLoaded) setHistoryError(reason);
      else setError(reason);
    } finally {
      setLoading(false);
    }
  }, [layerId, revisionId]);

  useEffect(() => {
    let active = true;
    let bundleLoaded = false;
    loadRevisionBundle(revisionId).then(async (nextBundle) => {
      if (!active) return;
      const resolvedLayerId = layerId ?? nextBundle.revision.layerId;
      if (layerId && layerId !== nextBundle.revision.layerId) {
        throw new AdminApiError(404, "REVISION_LAYER_MISMATCH", "Revision không thuộc layer trên đường dẫn hiện tại.", undefined, {
          requestedLayerId: layerId,
          actualLayerId: nextBundle.revision.layerId,
        });
      }
      setBundle(nextBundle);
      bundleLoaded = true;
      if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return;
      const [nextHistory, nextWorkflow, nextAudit] = await Promise.all([
        getRevisionHistory(revisionId),
        listRevisionWorkflowEvents(revisionId, { limit: 25 }),
        listLayerAuditEvents(resolvedLayerId, { limit: 25, resourceId: revisionId }),
      ]);
      if (!active) return;
      setHistory(nextHistory);
      setWorkflow(nextWorkflow);
      setAudit(nextAudit);
    }).catch((reason: unknown) => {
      if (active) {
        if (bundleLoaded) setHistoryError(reason);
        else setError(reason);
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [layerId, revisionId]);

  async function loadMoreWorkflow() {
    if (!workflow?.data.nextCursor || loadingWorkflow) return;
    setLoadingWorkflow(true);
    setHistoryError(null);
    try {
      const next = await listRevisionWorkflowEvents(revisionId, { limit: workflow.data.limit, cursor: workflow.data.nextCursor });
      setWorkflow({ ...next, data: { ...next.data, items: [...workflow.data.items, ...next.data.items] } });
    } catch (reason) {
      setHistoryError(reason);
    } finally {
      setLoadingWorkflow(false);
    }
  }

  async function loadMoreAudit() {
    const resolvedLayerId = layerId ?? bundle?.revision.layerId;
    if (!resolvedLayerId || !audit?.data.nextCursor || loadingAudit) return;
    setLoadingAudit(true);
    setHistoryError(null);
    try {
      const next = await listLayerAuditEvents(resolvedLayerId, {
        limit: audit.data.limit,
        cursor: audit.data.nextCursor,
        resourceId: revisionId,
      });
      setAudit({ ...next, data: { ...next.data, items: [...audit.data.items, ...next.data.items] } });
    } catch (reason) {
      setHistoryError(reason);
    } finally {
      setLoadingAudit(false);
    }
  }

  async function mutate(action: "approve" | "changes" | "publish") {
    setBusy(action);
    setError(null);
    setSuccess(null);
    try {
      if (action === "approve") await approveRevision(revisionId, comment.trim(), operationKey(action), { csrfToken });
      if (action === "changes") await requestRevisionChanges(revisionId, comment.trim(), operationKey(action), { csrfToken });
      if (action === "publish") await publishRevision(revisionId, releaseNote.trim(), operationKey(action), { csrfToken });
      setSuccess(action === "approve" ? "Đã duyệt revision." : action === "changes" ? "Đã trả revision cho Editor." : "Đã công bố revision.");
      delete operationKeys.current[action];
      if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true") await load();
    } catch (reason) {
      const retryable = !(reason instanceof AdminApiError) || reason.status >= 500 || reason.code === "IDEMPOTENCY_IN_PROGRESS";
      if (!retryable) delete operationKeys.current[action];
      setError(reason);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !bundle) return <ReviewSkeleton/>;
  if (!bundle) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6"><div className="max-w-lg"><AdminErrorNotice error={error} onRetry={load}/></div></main>;

  const resolvedLayerId = layerId ?? bundle.revision.layerId;
  const publicationStale = error instanceof AdminApiError && error.code === "PUBLICATION_BASE_STALE";
  const activeRevisionId = publicationStale && typeof error.details.activeRevisionId === "string" ? error.details.activeRevisionId : null;
  const reviewerActions = principal.role === "reviewer" && bundle.revision.status === "in_review";
  const publisherAction = principal.role === "publisher" && bundle.revision.status === "approved" && !publicationStale && canPublishHere;

  return <main className="min-h-[100dvh] bg-surface-subtle pb-40">
    <header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b bg-surface px-4">
      <Button asChild variant="ghost" size="icon-sm"><Link href={`/admin/layers/${resolvedLayerId}/history`} aria-label="Quay lại lịch sử layer"><IconArrowLeft stroke={1.75}/></Link></Button>
      <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold">{bundle.revision.title}</h1><p className="text-xs text-muted-foreground">Revision #{bundle.revision.revisionNo}, {bundle.revision.id}</p></div>
      <Badge>{bundle.revision.status}</Badge>
    </header>

    <div className="mx-auto grid max-w-5xl gap-4 p-4 md:grid-cols-[1.25fr_0.75fr] md:p-6">
      <section className="overflow-hidden rounded-panel border bg-surface" aria-labelledby="review-content-title">
        <ReviewMapPreview revision={bundle.revision} features={bundle.features}/>
        <div className="border-t p-4"><h2 id="review-content-title" className="font-semibold">Nội dung revision</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{bundle.revision.description || "Không có mô tả."}</p><dl className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-control bg-accent-subtle p-3"><dt className="text-xs text-muted-foreground">Đối tượng</dt><dd className="mt-1 text-lg font-semibold text-primary">{bundle.workspace.featureCount}</dd></div><div className="rounded-control bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Trường metadata</dt><dd className="mt-1 text-lg font-semibold">{bundle.fields.length}</dd></div></dl></div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-panel border bg-surface p-4" aria-labelledby="workspace-title">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-control bg-accent-subtle text-primary"><IconPolygon stroke={1.75}/></span><div><h2 id="workspace-title" className="text-sm font-semibold">Workspace server</h2><p className="text-xs text-muted-foreground">WGS84, đơn vị bán kính mét</p></div></div>
          <dl className="mt-4 divide-y text-sm"><div className="flex justify-between py-3"><dt className="text-muted-foreground">Người tạo</dt><dd className="max-w-[12rem] truncate font-medium">{bundle.revision.createdBy}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Cập nhật</dt><dd className="font-medium">{new Date(bundle.revision.updatedAt).toLocaleString("vi-VN")}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Workspace ETag</dt><dd className="max-w-[12rem] truncate font-mono text-xs">{bundle.etag}</dd></div>{history && <div className="flex justify-between py-3"><dt className="text-muted-foreground">History ETag</dt><dd className="max-w-[12rem] truncate font-mono text-xs">{history.historyEtag}</dd></div>}</dl>
        </section>
        {error !== null && <div className="space-y-2"><AdminErrorNotice error={error} onRetry={load}/>{activeRevisionId && <Button asChild variant="outline" className="w-full"><Link href={`/admin/layers/${resolvedLayerId}/revisions/${activeRevisionId}/review`}>Mở revision đang công bố</Link></Button>}</div>}
        {success && <Alert role="status"><IconCheck stroke={1.75}/><AlertTitle>Hoàn tất</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
        {reviewerActions && <section className="rounded-panel border bg-surface p-4"><label htmlFor="review-comment" className="text-sm font-semibold">Bình luận review</label><textarea id="review-comment" className="mt-3 min-h-24 w-full resize-y rounded-control border bg-surface p-3 text-sm" value={comment} onChange={(event) => { setComment(event.target.value); delete operationKeys.current.approve; delete operationKeys.current.changes; }} placeholder="Bắt buộc khi yêu cầu chỉnh sửa"/><p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><IconMessage size={16}/>Bình luận duyệt có thể để trống.</p></section>}
        {publisherAction && <section className="rounded-panel border bg-surface p-4"><label htmlFor="release-note" className="text-sm font-semibold">Ghi chú công bố</label><textarea id="release-note" className="mt-3 min-h-24 w-full resize-y rounded-control border bg-surface p-3 text-sm" value={releaseNote} onChange={(event) => { setReleaseNote(event.target.value); delete operationKeys.current.publish; }} placeholder="Mô tả dữ liệu được công bố"/></section>}
        {!reviewerActions && !publisherAction && <section className="rounded-panel border bg-surface p-4 text-sm text-muted-foreground">Revision đang ở chế độ chỉ đọc đối với vai trò {principal.role.replace("_", " ")}.</section>}
      </aside>
    </div>

    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-8 md:px-6">
      {historyError !== null && <AdminErrorNotice error={historyError} onRetry={load}/>}
      {history && <section className="space-y-3" aria-labelledby="validation-title"><h2 id="validation-title" className="text-base font-semibold">Kết quả kiểm tra</h2><ValidationReport validation={history.data.validation}/></section>}
      <section className="space-y-3" aria-labelledby="diff-title"><h2 id="diff-title" className="text-base font-semibold">So sánh thay đổi</h2><RevisionDiffView revisionId={revisionId}/></section>
      <section className="space-y-3" aria-labelledby="workflow-title"><h2 id="workflow-title" className="text-base font-semibold">Tiến trình workflow</h2><WorkflowTimeline events={workflow?.data ?? null} loading={!historyError && !workflow && process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true"} loadingMore={loadingWorkflow} onRetry={load} onLoadMore={loadMoreWorkflow}/></section>
      <section className="space-y-3" aria-labelledby="audit-title"><h2 id="audit-title" className="text-base font-semibold">Nhật ký revision</h2><AuditEventList events={audit?.data ?? null} loading={!historyError && !audit && process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true"} loadingMore={loadingAudit} onRetry={load} onLoadMore={loadMoreAudit}/></section>
    </div>

    {(reviewerActions || publisherAction) && <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-surface p-3 md:bottom-0 md:left-60"><div className="mx-auto flex max-w-5xl gap-2">
      {reviewerActions && <><Button disabled={!comment.trim() || busy !== null} onClick={() => mutate("changes")} variant="outline" className="flex-1 text-destructive"><IconX stroke={1.75}/>{busy === "changes" ? <><Spinner/>Đang gửi...</> : "Yêu cầu chỉnh sửa"}</Button><Button disabled={busy !== null} onClick={() => mutate("approve")} className="flex-1"><IconCheck stroke={1.75}/>{busy === "approve" ? <><Spinner/>Đang duyệt...</> : "Duyệt thay đổi"}</Button></>}
      {publisherAction && <Button disabled={!canPublishHere || !releaseNote.trim() || busy !== null} onClick={() => mutate("publish")} className="flex-1"><IconCloudUpload stroke={1.75}/>{busy === "publish" ? <><Spinner/>Đang công bố...</> : "Công bố revision"}</Button>}
    </div></div>}
  </main>;
}
