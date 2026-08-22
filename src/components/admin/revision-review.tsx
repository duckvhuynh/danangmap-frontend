"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconCloudUpload,
  IconMessage,
  IconPolygon,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { AuditEventList } from "@/components/admin/audit-event-list";
import { PublicationJobStatus } from "@/components/admin/publication-job-status";
import { RevisionDiffView } from "@/components/admin/revision-diff-view";
import { ReviewMapPreview } from "@/components/admin/review-map-preview";
import { ValidationReport } from "@/components/admin/validation-report";
import { WorkflowTimeline } from "@/components/admin/workflow-timeline";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
import {
  getPublicationJob,
  listLayerPublicationJobs,
  publishRevision,
  type PublicationJob,
  type PublicationJobResource,
} from "@/lib/api/publication-jobs";
import {
  isTerminalPublicationJob,
  usePublicationJobTracking,
} from "@/lib/publications/publication-job-tracking";

export interface RevisionReviewTransport {
  bundle: typeof loadRevisionBundle;
  history: typeof getRevisionHistory;
  workflow: typeof listRevisionWorkflowEvents;
  audit: typeof listLayerAuditEvents;
  jobs: typeof listLayerPublicationJobs;
  job: typeof getPublicationJob;
  publish: typeof publishRevision;
  approve: typeof approveRevision;
  requestChanges: typeof requestRevisionChanges;
}

interface RevisionPublicationSeed {
  identity: string;
  resource: PublicationJobResource;
}

const defaultTransport: RevisionReviewTransport = {
  bundle: loadRevisionBundle,
  history: getRevisionHistory,
  workflow: listRevisionWorkflowEvents,
  audit: listLayerAuditEvents,
  jobs: listLayerPublicationJobs,
  job: getPublicationJob,
  publish: publishRevision,
  approve: approveRevision,
  requestChanges: requestRevisionChanges,
};

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

function recoveredJob(items: PublicationJob[]) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return sorted.find((item) => !isTerminalPublicationJob(item)) ?? sorted[0];
}

function demoAcceptedJob(revisionId: string, layerId: string): PublicationJobResource {
  const now = new Date().toISOString();
  return {
    data: {
      id: "99999999-9999-4999-8999-999999999999",
      layerId,
      revisionId,
      status: "queued",
      phase: "queued",
      progress: { completedUnits: 0, totalUnits: null, unit: "features", percent: null },
      attempt: 0,
      result: null,
      failure: null,
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      updatedAt: now,
    },
    etag: '"publication-job-demo-v1"',
    retryAfterMs: 2_000,
    requestId: "demo-publication-request",
  };
}

export function RevisionReview({
  revisionId,
  layerId,
  transport = defaultTransport,
}: {
  revisionId: string;
  layerId?: string;
  transport?: RevisionReviewTransport;
}) {
  const { principal, csrfToken } = useAdminSession();
  const canPublishHere = useSyncExternalStore(
    subscribeDesktopAuthoringCapability,
    getDesktopAuthoringCapability,
    getServerDesktopAuthoringCapability,
  );
  const [bundle, setBundle] = useState<RevisionBundle | null>(null);
  const bundleRef = useRef<RevisionBundle | null>(null);
  const [history, setHistory] = useState<HistoryResource<RevisionHistory> | null>(null);
  const [workflow, setWorkflow] = useState<HistoryResource<WorkflowEvents> | null>(null);
  const [audit, setAudit] = useState<HistoryResource<AuditEvents> | null>(null);
  const [jobSeed, setJobSeed] = useState<RevisionPublicationSeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [jobRecoveryError, setJobRecoveryError] = useState<unknown>(null);
  const [comment, setComment] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "changes" | "publish" | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [acceptedJobId, setAcceptedJobId] = useState<string | null>(null);
  const operationKeys = useRef<Record<string, string>>({});
  const observedNonterminalJobs = useRef(new Set<string>());
  const handledTerminalJobs = useRef(new Set<string>());
  const focusedAcceptedJobs = useRef(new Set<string>());
  const publicationStatusRef = useRef<HTMLElement>(null);
  const loadGenerationRef = useRef(0);
  const loadOwnerRef = useRef<object | null>(null);
  const loadActiveRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadIdentityRef = useRef<string | null>(null);
  const mutationGenerationRef = useRef(0);
  const workflowGenerationRef = useRef(0);
  const auditGenerationRef = useRef(0);
  const jobTransport = useMemo(() => ({ get: transport.job }), [transport.job]);
  const loadOwner = useMemo(() => ({ layerId, revisionId, transport }), [layerId, revisionId, transport]);
  const publicationIdentity = `${layerId ?? ""}:${revisionId}`;
  const publicationSeed = jobSeed?.identity === publicationIdentity ? jobSeed.resource : null;
  const trackingEnabled = process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true";
  const { job: publicationJob, trackingState, trackingIssue } = usePublicationJobTracking({
    seed: publicationSeed,
    resetKey: publicationIdentity,
    enabled: trackingEnabled,
    transport: jobTransport,
  });

  const operationKey = (action: string) => operationKeys.current[action] ??= crypto.randomUUID();

  const load = useCallback(async () => {
    if (!loadActiveRef.current || loadOwnerRef.current !== loadOwner) return;
    loadAbortRef.current?.abort();
    const abortController = new AbortController();
    loadAbortRef.current = abortController;
    const generation = ++loadGenerationRef.current;
    workflowGenerationRef.current += 1;
    auditGenerationRef.current += 1;
    setLoadingWorkflow(false);
    setLoadingAudit(false);
    const isCurrent = () => loadActiveRef.current
      && loadOwnerRef.current === loadOwner
      && loadGenerationRef.current === generation
      && !abortController.signal.aborted;
    const identity = publicationIdentity;
    if (loadIdentityRef.current !== identity) {
      loadIdentityRef.current = identity;
      mutationGenerationRef.current += 1;
      bundleRef.current = null;
      setBundle(null);
      setHistory(null);
      setWorkflow(null);
      setAudit(null);
      setJobSeed(null);
      setComment("");
      setReleaseNote("");
      setSuccess(null);
      setAcceptedJobId(null);
      setBusy(null);
      operationKeys.current = {};
      observedNonterminalJobs.current.clear();
      handledTerminalJobs.current.clear();
      focusedAcceptedJobs.current.clear();
    }
    setLoading(true);
    setError(null);
    setHistoryError(null);
    setJobRecoveryError(null);
    let bundleLoaded = false;
    try {
      const nextBundle = await transport.bundle(revisionId);
      if (!isCurrent()) return;
      const resolvedLayerId = layerId ?? nextBundle.revision.layerId;
      if (layerId && layerId !== nextBundle.revision.layerId) {
        throw new AdminApiError(404, "REVISION_LAYER_MISMATCH", "Revision không thuộc layer trên đường dẫn hiện tại.", undefined, {
          requestedLayerId: layerId,
          actualLayerId: nextBundle.revision.layerId,
        });
      }
      bundleLoaded = true;
      bundleRef.current = nextBundle;
      setBundle(nextBundle);
      if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return;

      const [historyResult, jobsResult] = await Promise.allSettled([
        Promise.all([
          transport.history(revisionId),
          transport.workflow(revisionId, { limit: 25 }),
          transport.audit(resolvedLayerId, { limit: 25, resourceId: revisionId }),
        ]),
        transport.jobs(resolvedLayerId, { revisionId, limit: 25 }, { signal: abortController.signal }),
      ]);
      if (!isCurrent()) return;
      if (historyResult.status === "fulfilled") {
        setHistory(historyResult.value[0]);
        setWorkflow(historyResult.value[1]);
        setAudit(historyResult.value[2]);
      } else {
        setHistoryError(historyResult.reason);
      }
      if (jobsResult.status === "fulfilled" && jobsResult.value.data) {
        const current = recoveredJob(jobsResult.value.data.items);
        if (current) {
          if (!isTerminalPublicationJob(current)) observedNonterminalJobs.current.add(current.id);
          setJobSeed({
            identity,
            resource: {
              data: current,
              etag: "",
              retryAfterMs: jobsResult.value.retryAfterMs,
              requestId: jobsResult.value.requestId,
            },
          });
        }
      } else if (jobsResult.status === "rejected") {
        setJobRecoveryError(jobsResult.reason);
      }
    } catch (reason) {
      if (!isCurrent()) return;
      if (bundleLoaded || bundleRef.current) setHistoryError(reason);
      else setError(reason);
    } finally {
      if (!isCurrent()) return;
      if (loadAbortRef.current === abortController) loadAbortRef.current = null;
      setLoading(false);
    }
  }, [layerId, loadOwner, publicationIdentity, revisionId, transport]);

  useEffect(() => {
    loadActiveRef.current = true;
    loadOwnerRef.current = loadOwner;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      if (loadOwnerRef.current === loadOwner) {
        loadActiveRef.current = false;
        loadOwnerRef.current = null;
      }
      loadGenerationRef.current += 1;
      mutationGenerationRef.current += 1;
      workflowGenerationRef.current += 1;
      auditGenerationRef.current += 1;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, [load, loadOwner]);

  useEffect(() => {
    if (!publicationJob) return;
    if (!isTerminalPublicationJob(publicationJob)) {
      observedNonterminalJobs.current.add(publicationJob.id);
      return;
    }
    if (!observedNonterminalJobs.current.has(publicationJob.id) || handledTerminalJobs.current.has(publicationJob.id)) return;
    handledTerminalJobs.current.add(publicationJob.id);
    if (!trackingEnabled) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); };
  }, [load, publicationJob, trackingEnabled]);

  useEffect(() => {
    if (!acceptedJobId || publicationJob?.id !== acceptedJobId || focusedAcceptedJobs.current.has(acceptedJobId)) return;
    focusedAcceptedJobs.current.add(acceptedJobId);
    publicationStatusRef.current?.focus();
    setAcceptedJobId(null);
  }, [acceptedJobId, publicationJob?.id]);

  async function loadMoreWorkflow() {
    const owner = loadOwner;
    if (!loadActiveRef.current || loadOwnerRef.current !== owner || !workflow?.data.nextCursor || loadingWorkflow) return;
    const generation = ++workflowGenerationRef.current;
    const isCurrent = () => loadActiveRef.current
      && loadOwnerRef.current === owner
      && workflowGenerationRef.current === generation;
    setLoadingWorkflow(true);
    setHistoryError(null);
    try {
      const next = await transport.workflow(revisionId, { limit: workflow.data.limit, cursor: workflow.data.nextCursor });
      if (!isCurrent()) return;
      setWorkflow({ ...next, data: { ...next.data, items: [...workflow.data.items, ...next.data.items] } });
    } catch (reason) {
      if (!isCurrent()) return;
      setHistoryError(reason);
    } finally {
      if (!isCurrent()) return;
      setLoadingWorkflow(false);
    }
  }

  async function loadMoreAudit() {
    const owner = loadOwner;
    const resolvedLayerId = layerId ?? bundle?.revision.layerId;
    if (!loadActiveRef.current || loadOwnerRef.current !== owner || !resolvedLayerId || !audit?.data.nextCursor || loadingAudit) return;
    const generation = ++auditGenerationRef.current;
    const isCurrent = () => loadActiveRef.current
      && loadOwnerRef.current === owner
      && auditGenerationRef.current === generation;
    setLoadingAudit(true);
    setHistoryError(null);
    try {
      const next = await transport.audit(resolvedLayerId, {
        limit: audit.data.limit,
        cursor: audit.data.nextCursor,
        resourceId: revisionId,
      });
      if (!isCurrent()) return;
      setAudit({ ...next, data: { ...next.data, items: [...audit.data.items, ...next.data.items] } });
    } catch (reason) {
      if (!isCurrent()) return;
      setHistoryError(reason);
    } finally {
      if (!isCurrent()) return;
      setLoadingAudit(false);
    }
  }

  async function mutate(action: "approve" | "changes" | "publish") {
    const owner = loadOwner;
    if (!loadActiveRef.current || loadOwnerRef.current !== owner) return;
    const generation = ++mutationGenerationRef.current;
    const isCurrent = () => loadActiveRef.current
      && loadOwnerRef.current === owner
      && mutationGenerationRef.current === generation;
    const key = operationKey(action);
    setBusy(action);
    setError(null);
    if (action !== "publish") setSuccess(null);
    try {
      if (action === "approve") await transport.approve(revisionId, comment.trim(), key, { csrfToken });
      if (action === "changes") await transport.requestChanges(revisionId, comment.trim(), key, { csrfToken });
      if (action === "publish") {
        const accepted = process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true"
          ? demoAcceptedJob(revisionId, layerId ?? bundle!.revision.layerId)
          : await transport.publish(revisionId, releaseNote.trim(), key, { csrfToken });
        if (!isCurrent()) return;
        observedNonterminalJobs.current.add(accepted.data.id);
        setJobRecoveryError(null);
        setJobSeed({ identity: publicationIdentity, resource: accepted });
        setAcceptedJobId(accepted.data.id);
        setSuccess("Yêu cầu công bố đã được nhận. Trạng thái dưới đây lấy trực tiếp từ máy chủ.");
        delete operationKeys.current[action];
        return;
      }
      if (!isCurrent()) return;
      setSuccess(action === "approve" ? "Đã duyệt revision." : "Đã trả revision cho Editor.");
      delete operationKeys.current[action];
      if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true") await load();
    } catch (reason) {
      if (!isCurrent()) return;
      const retryable = !(reason instanceof AdminApiError)
        || reason.status >= 500
        || reason.code === "IDEMPOTENCY_IN_PROGRESS";
      if (!retryable) delete operationKeys.current[action];
      if (reason instanceof AdminApiError && reason.code === "PUBLICATION_JOB_ACTIVE") {
        delete operationKeys.current[action];
        void load();
      }
      setError(reason);
    } finally {
      if (!isCurrent()) return;
      setBusy(null);
    }
  }

  if (loading && !bundle) return <ReviewSkeleton/>;
  if (!bundle) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6"><div className="max-w-lg"><AdminErrorNotice error={error} onRetry={() => { void load(); }}/></div></main>;

  const resolvedLayerId = layerId ?? bundle.revision.layerId;
  const publicationStale = error instanceof AdminApiError && error.code === "PUBLICATION_BASE_STALE";
  const activeRevisionId = publicationStale && typeof error.details.activeRevisionId === "string" ? error.details.activeRevisionId : null;
  const reviewerActions = principal.role === "reviewer" && bundle.revision.status === "in_review";
  const publicationActive = publicationJob ? !isTerminalPublicationJob(publicationJob) : false;
  const publicationSucceeded = publicationJob?.status === "succeeded";
  const visibleSuccess = publicationJob?.status === "succeeded"
    ? "Dữ liệu đã được công bố sau khi publication job hoàn tất."
    : publicationJob?.status === "failed"
      ? null
      : success;
  const publicationPending = publicationSeed && publicationJob?.id !== publicationSeed.data.id;
  const publisherAction = principal.role === "publisher"
    && bundle.revision.status === "approved"
    && !publicationStale
    && canPublishHere
    && !publicationActive
    && !publicationSucceeded
    && !publicationPending;
  const publishLabel = publicationJob?.status === "failed" ? "Thử công bố lại" : "Công bố revision";

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

      <aside className="flex flex-col gap-4">
        <section className="rounded-panel border bg-surface p-4" aria-labelledby="workspace-title">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-control bg-accent-subtle text-primary"><IconPolygon stroke={1.75}/></span><div><h2 id="workspace-title" className="text-sm font-semibold">Workspace server</h2><p className="text-xs text-muted-foreground">WGS84, đơn vị bán kính mét</p></div></div>
          <dl className="mt-4 divide-y text-sm"><div className="flex justify-between py-3"><dt className="text-muted-foreground">Người tạo</dt><dd className="max-w-[12rem] truncate font-medium">{bundle.revision.createdBy}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Cập nhật</dt><dd className="font-medium">{new Date(bundle.revision.updatedAt).toLocaleString("vi-VN")}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Workspace ETag</dt><dd className="max-w-[12rem] truncate font-mono text-xs">{bundle.etag}</dd></div>{history && <div className="flex justify-between py-3"><dt className="text-muted-foreground">History ETag</dt><dd className="max-w-[12rem] truncate font-mono text-xs">{history.historyEtag}</dd></div>}</dl>
        </section>
        {error !== null && <div className="flex flex-col gap-2"><AdminErrorNotice error={error} onRetry={() => { void load(); }}/>{activeRevisionId && <Button asChild variant="outline" className="w-full"><Link href={`/admin/layers/${resolvedLayerId}/revisions/${activeRevisionId}/review`}>Mở revision đang công bố</Link></Button>}</div>}
        {visibleSuccess && <Alert role="status"><IconCheck stroke={1.75}/><AlertTitle>Trạng thái công việc</AlertTitle><AlertDescription>{visibleSuccess}</AlertDescription></Alert>}
        {jobRecoveryError !== null && <Alert><IconRefresh stroke={1.75}/><AlertTitle>Chưa thể khôi phục trạng thái công bố</AlertTitle><AlertDescription><p>Không thể đọc publication job hiện hành. Dữ liệu trên máy chủ không bị đánh dấu thất bại.</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { void load(); }}><IconRefresh data-icon="inline-start" stroke={1.75}/>Thử kết nối lại</Button></AlertDescription></Alert>}
        {publicationJob && <PublicationJobStatus ref={publicationStatusRef} job={publicationJob} trackingState={trackingState} trackingIssue={trackingIssue}/>}
        {reviewerActions && <section className="rounded-panel border bg-surface p-4"><Field><FieldLabel htmlFor="review-comment">Bình luận review</FieldLabel><textarea id="review-comment" className="min-h-24 w-full resize-y rounded-control border bg-surface p-3 text-sm" value={comment} onChange={(event) => { setComment(event.target.value); delete operationKeys.current.approve; delete operationKeys.current.changes; }} placeholder="Bắt buộc khi yêu cầu chỉnh sửa"/><FieldDescription><IconMessage className="inline" size={16}/> Bình luận duyệt có thể để trống.</FieldDescription></Field></section>}
        {publisherAction && <section className="rounded-panel border bg-surface p-4"><Field><FieldLabel htmlFor="release-note">Ghi chú công bố</FieldLabel><textarea id="release-note" className="min-h-24 w-full resize-y rounded-control border bg-surface p-3 text-sm" value={releaseNote} onChange={(event) => { setReleaseNote(event.target.value); delete operationKeys.current.publish; }} placeholder="Mô tả dữ liệu được công bố"/><FieldDescription>Một yêu cầu mới sau khi job thất bại luôn dùng idempotency key mới.</FieldDescription></Field></section>}
        {!reviewerActions && !publisherAction && !publicationJob && <section className="rounded-panel border bg-surface p-4 text-sm text-muted-foreground">Revision đang ở chế độ chỉ đọc đối với vai trò {principal.role.replace("_", " ")}.</section>}
      </aside>
    </div>

    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-8 md:px-6">
      {historyError !== null && <AdminErrorNotice error={historyError} onRetry={() => { void load(); }}/>}
      {history && <section className="flex flex-col gap-3" aria-labelledby="validation-title"><h2 id="validation-title" className="text-base font-semibold">Kết quả kiểm tra</h2><ValidationReport validation={history.data.validation}/></section>}
      <section className="flex flex-col gap-3" aria-labelledby="diff-title"><h2 id="diff-title" className="text-base font-semibold">So sánh thay đổi</h2><RevisionDiffView revisionId={revisionId}/></section>
      <section className="flex flex-col gap-3" aria-labelledby="workflow-title"><h2 id="workflow-title" className="text-base font-semibold">Tiến trình workflow</h2><WorkflowTimeline events={workflow?.data ?? null} loading={!historyError && !workflow && process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true"} loadingMore={loadingWorkflow} onRetry={() => { void load(); }} onLoadMore={loadMoreWorkflow}/></section>
      <section className="flex flex-col gap-3" aria-labelledby="audit-title"><h2 id="audit-title" className="text-base font-semibold">Nhật ký revision</h2><AuditEventList events={audit?.data ?? null} loading={!historyError && !audit && process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true"} loadingMore={loadingAudit} onRetry={() => { void load(); }} onLoadMore={loadMoreAudit}/></section>
    </div>

    {(reviewerActions || publisherAction) && <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-surface p-3 md:bottom-0 md:left-60"><div className="mx-auto flex max-w-5xl gap-2">
      {reviewerActions && <><Button disabled={!comment.trim() || busy !== null} onClick={() => { void mutate("changes"); }} variant="outline" className="flex-1 text-destructive"><IconX data-icon="inline-start" stroke={1.75}/>{busy === "changes" ? <><Spinner data-icon="inline-start"/>Đang gửi...</> : "Yêu cầu chỉnh sửa"}</Button><Button disabled={busy !== null} onClick={() => { void mutate("approve"); }} className="flex-1"><IconCheck data-icon="inline-start" stroke={1.75}/>{busy === "approve" ? <><Spinner data-icon="inline-start"/>Đang duyệt...</> : "Duyệt thay đổi"}</Button></>}
      {publisherAction && <Button disabled={!canPublishHere || !releaseNote.trim() || busy !== null} onClick={() => { void mutate("publish"); }} className="flex-1"><IconCloudUpload data-icon="inline-start" stroke={1.75}/>{busy === "publish" ? <><Spinner data-icon="inline-start"/>Đang gửi...</> : publishLabel}</Button>}
    </div></div>}
  </main>;
}
