"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  IconArrowLeft,
  IconCalendar,
  IconCheck,
  IconChevronRight,
  IconCircleCheck,
  IconClock,
  IconCloudUpload,
  IconFileDescription,
  IconInfoCircle,
  IconMessage,
  IconPolygon,
  IconRefresh,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import {
  AdminErrorNotice,
  useAdminSession,
} from "@/components/admin/admin-session";
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
  getServerWideReviewLayout,
  getWideReviewLayout,
  subscribeDesktopAuthoringCapability,
  subscribeWideReviewLayout,
} from "@/lib/admin/authoring-capability";
import {
  canPublishContent,
  canReviewContent,
} from "@/lib/admin/role-capabilities";
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
  type AsynchronousPublicationAcceptance,
  type PublicationJob,
  type PublicationJobResource,
  type SynchronousPublicationResult,
} from "@/lib/api/publication-jobs";
import {
  isTerminalPublicationJob,
  usePublicationJobTracking,
} from "@/lib/publications/publication-job-tracking";
import { cn } from "@/lib/utils";

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

interface RevisionSynchronousPublication {
  identity: string;
  result: SynchronousPublicationResult;
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
  return (
    <main
      className="min-h-[100dvh] bg-surface-subtle p-4 md:p-6"
      role="status"
      aria-label="Đang tải phiên bản"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 md:grid-cols-[1.25fr_0.75fr]">
          <Skeleton className="h-[32rem] w-full" />
          <div className="flex flex-col gap-4">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    </main>
  );
}

function recoveredJob(items: PublicationJob[]) {
  return (
    items.find((item) => !isTerminalPublicationJob(item)) ?? items[0] ?? null
  );
}

function demoAcceptedJob(
  revisionId: string,
  layerId: string,
): AsynchronousPublicationAcceptance {
  const now = new Date().toISOString();
  return {
    mode: "async",
    data: {
      id: "99999999-9999-4999-8999-999999999999",
      layerId,
      revisionId,
      status: "queued",
      phase: "queued",
      progress: {
        completedUnits: 0,
        totalUnits: null,
        unit: "features",
        percent: null,
      },
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

type RevisionReviewProps = {
  revisionId: string;
  layerId?: string;
  transport?: RevisionReviewTransport;
};

type MobileReviewSection = "map" | "changes" | "comments";

const mobileReviewTabs: Array<{ id: MobileReviewSection; label: string }> = [
  { id: "map", label: "Bản đồ" },
  { id: "changes", label: "Thay đổi" },
  { id: "comments", label: "Nhận xét" },
];

function reviewStatus(status: RevisionBundle["revision"]["status"]) {
  if (status === "in_review")
    return {
      label: "Chờ duyệt",
      className: "border border-warning/40 bg-amber-50 text-warning",
    };
  if (status === "approved")
    return { label: "Đã duyệt", className: "bg-emerald-50 text-success" };
  if (status === "published")
    return { label: "Đã công bố", className: "bg-emerald-50 text-success" };
  if (status === "changes_requested")
    return { label: "Cần chỉnh sửa", className: "bg-red-50 text-destructive" };
  return {
    label: "Bản nháp",
    className: "bg-surface-subtle text-muted-foreground",
  };
}

function geometryModeLabel(mode: RevisionBundle["revision"]["geometryMode"]) {
  if (mode === "point") return "Điểm";
  if (mode === "circle") return "Vùng tròn";
  if (mode === "polygon") return "Vùng ranh giới";
  if (mode === "polyline") return "Đường";
  return "Hỗn hợp";
}

export function RevisionReview(props: RevisionReviewProps) {
  const identity = `${props.layerId ?? ""}:${props.revisionId}`;
  return <RevisionReviewSession key={identity} {...props} />;
}

function RevisionReviewSession({
  revisionId,
  layerId,
  transport = defaultTransport,
}: RevisionReviewProps) {
  const { principal, csrfToken } = useAdminSession();
  const canPublishHere = useSyncExternalStore(
    subscribeDesktopAuthoringCapability,
    getDesktopAuthoringCapability,
    getServerDesktopAuthoringCapability,
  );
  const wideReviewLayout = useSyncExternalStore(
    subscribeWideReviewLayout,
    getWideReviewLayout,
    getServerWideReviewLayout,
  );
  const [bundle, setBundle] = useState<RevisionBundle | null>(null);
  const bundleRef = useRef<RevisionBundle | null>(null);
  const [history, setHistory] =
    useState<HistoryResource<RevisionHistory> | null>(null);
  const [workflow, setWorkflow] =
    useState<HistoryResource<WorkflowEvents> | null>(null);
  const [audit, setAudit] = useState<HistoryResource<AuditEvents> | null>(null);
  const [jobSeed, setJobSeed] = useState<RevisionPublicationSeed | null>(null);
  const [synchronousPublication, setSynchronousPublication] =
    useState<RevisionSynchronousPublication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingWorkflow, setLoadingWorkflow] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [historyError, setHistoryError] = useState<unknown>(null);
  const [jobRecoveryError, setJobRecoveryError] = useState<unknown>(null);
  const [comment, setComment] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [mobileSection, setMobileSection] =
    useState<MobileReviewSection>("map");
  const mobileTabRefs = useRef<
    Partial<Record<MobileReviewSection, HTMLButtonElement>>
  >({});
  const mobilePanelRefs = useRef<
    Partial<Record<MobileReviewSection, HTMLElement>>
  >({});
  const [busy, setBusy] = useState<"approve" | "changes" | "publish" | null>(
    null,
  );
  const [success, setSuccess] = useState<string | null>(null);
  const [feedbackFocusRequest, setFeedbackFocusRequest] = useState(0);
  const [acceptedJobId, setAcceptedJobId] = useState<string | null>(null);
  const operationKeys = useRef<Record<string, string>>({});
  const observedNonterminalJobs = useRef(new Set<string>());
  const handledTerminalJobs = useRef(new Set<string>());
  const focusedAcceptedJobs = useRef(new Set<string>());
  const publicationStatusRef = useRef<HTMLElement>(null);
  const workflowFeedbackRef = useRef<HTMLDivElement>(null);
  const loadGenerationRef = useRef(0);
  const loadOwnerRef = useRef<object | null>(null);
  const loadActiveRef = useRef(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadIdentityRef = useRef<string | null>(null);
  const mutationGenerationRef = useRef(0);
  const workflowGenerationRef = useRef(0);
  const auditGenerationRef = useRef(0);
  const jobTransport = useMemo(() => ({ get: transport.job }), [transport.job]);
  const loadOwner = useMemo(
    () => ({ layerId, revisionId, transport }),
    [layerId, revisionId, transport],
  );
  const publicationIdentity = `${layerId ?? ""}:${revisionId}`;
  const publicationSeed =
    jobSeed?.identity === publicationIdentity ? jobSeed.resource : null;
  const trackingEnabled =
    process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true";
  const {
    job: publicationJob,
    trackingState,
    trackingIssue,
  } = usePublicationJobTracking({
    seed: publicationSeed,
    resetKey: publicationIdentity,
    enabled: trackingEnabled,
    transport: jobTransport,
  });

  const operationKey = (action: string) =>
    (operationKeys.current[action] ??= crypto.randomUUID());

  const activateMobileSection = useCallback(
    (section: MobileReviewSection, focusPanel = false) => {
      setMobileSection(section);
      if (!focusPanel) return;
      window.requestAnimationFrame(() =>
        mobilePanelRefs.current[section]?.focus(),
      );
    },
    [],
  );

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
    const isCurrent = () =>
      loadActiveRef.current &&
      loadOwnerRef.current === loadOwner &&
      loadGenerationRef.current === generation &&
      !abortController.signal.aborted;
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
      setSynchronousPublication(null);
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
        throw new AdminApiError(
          404,
          "REVISION_LAYER_MISMATCH",
          "Phiên bản không thuộc lớp dữ liệu này.",
          undefined,
          {
            requestedLayerId: layerId,
            actualLayerId: nextBundle.revision.layerId,
          },
        );
      }
      bundleLoaded = true;
      bundleRef.current = nextBundle;
      setBundle(nextBundle);
      if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return;

      const [historyResult, jobsResult] = await Promise.allSettled([
        Promise.all([
          transport.history(revisionId),
          transport.workflow(revisionId, { limit: 25 }),
          transport.audit(resolvedLayerId, {
            limit: 25,
            resourceId: revisionId,
          }),
        ]),
        transport.jobs(
          resolvedLayerId,
          { revisionId, limit: 25 },
          { signal: abortController.signal },
        ),
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
          if (!isTerminalPublicationJob(current))
            observedNonterminalJobs.current.add(current.id);
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
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
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
    if (
      !observedNonterminalJobs.current.has(publicationJob.id) ||
      handledTerminalJobs.current.has(publicationJob.id)
    )
      return;
    handledTerminalJobs.current.add(publicationJob.id);
    if (!trackingEnabled) return;
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [load, publicationJob, trackingEnabled]);

  useEffect(() => {
    if (
      !acceptedJobId ||
      publicationJob?.id !== acceptedJobId ||
      focusedAcceptedJobs.current.has(acceptedJobId)
    )
      return;
    focusedAcceptedJobs.current.add(acceptedJobId);
    publicationStatusRef.current?.focus();
    setAcceptedJobId(null);
  }, [acceptedJobId, publicationJob?.id]);

  useEffect(() => {
    if (feedbackFocusRequest > 0) workflowFeedbackRef.current?.focus();
  }, [feedbackFocusRequest]);

  async function loadMoreWorkflow() {
    const owner = loadOwner;
    if (
      !loadActiveRef.current ||
      loadOwnerRef.current !== owner ||
      !workflow?.data.nextCursor ||
      loadingWorkflow
    )
      return;
    const generation = ++workflowGenerationRef.current;
    const isCurrent = () =>
      loadActiveRef.current &&
      loadOwnerRef.current === owner &&
      workflowGenerationRef.current === generation;
    setLoadingWorkflow(true);
    setHistoryError(null);
    try {
      const next = await transport.workflow(revisionId, {
        limit: workflow.data.limit,
        cursor: workflow.data.nextCursor,
      });
      if (!isCurrent()) return;
      setWorkflow({
        ...next,
        data: {
          ...next.data,
          items: [...workflow.data.items, ...next.data.items],
        },
      });
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
    if (
      !loadActiveRef.current ||
      loadOwnerRef.current !== owner ||
      !resolvedLayerId ||
      !audit?.data.nextCursor ||
      loadingAudit
    )
      return;
    const generation = ++auditGenerationRef.current;
    const isCurrent = () =>
      loadActiveRef.current &&
      loadOwnerRef.current === owner &&
      auditGenerationRef.current === generation;
    setLoadingAudit(true);
    setHistoryError(null);
    try {
      const next = await transport.audit(resolvedLayerId, {
        limit: audit.data.limit,
        cursor: audit.data.nextCursor,
        resourceId: revisionId,
      });
      if (!isCurrent()) return;
      setAudit({
        ...next,
        data: {
          ...next.data,
          items: [...audit.data.items, ...next.data.items],
        },
      });
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
    const ownedBundle = bundleRef.current;
    if (
      !loadActiveRef.current ||
      loadOwnerRef.current !== owner ||
      !ownedBundle
    )
      return;
    const generation = ++mutationGenerationRef.current;
    const isCurrent = () =>
      loadActiveRef.current &&
      loadOwnerRef.current === owner &&
      mutationGenerationRef.current === generation;
    const key = operationKey(action);
    setMobileSection("comments");
    setBusy(action);
    setError(null);
    if (action !== "publish") setSuccess(null);
    try {
      if (action === "approve")
        await transport.approve(revisionId, comment.trim(), key, { csrfToken });
      if (action === "changes")
        await transport.requestChanges(revisionId, comment.trim(), key, {
          csrfToken,
        });
      if (action === "publish") {
        const accepted =
          process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true"
            ? demoAcceptedJob(revisionId, layerId ?? bundle!.revision.layerId)
            : await transport.publish(revisionId, releaseNote.trim(), key, {
                csrfToken,
              });
        if (!isCurrent()) return;
        delete operationKeys.current[action];
        setJobRecoveryError(null);
        if (accepted.mode === "sync") {
          setSynchronousPublication({
            identity: publicationIdentity,
            result: accepted.data,
          });
          setSuccess(
            "Dữ liệu mới đã được công bố trên bản đồ.",
          );
          setFeedbackFocusRequest((value) => value + 1);
          setBusy(null);
          if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true")
            await load();
          return;
        }
        setSynchronousPublication(null);
        observedNonterminalJobs.current.add(accepted.data.id);
        setJobSeed({ identity: publicationIdentity, resource: accepted });
        setAcceptedJobId(accepted.data.id);
        setSuccess(
          "Yêu cầu công bố đã được nhận. Bạn có thể theo dõi tiến độ bên dưới.",
        );
        return;
      }
      if (!isCurrent()) return;
      setSuccess(
        action === "approve"
          ? "Đã phê duyệt dữ liệu."
          : "Đã gửi yêu cầu chỉnh sửa cho biên tập viên.",
      );
      setFeedbackFocusRequest((value) => value + 1);
      delete operationKeys.current[action];
      if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true") await load();
    } catch (reason) {
      if (!isCurrent()) return;
      const retryable =
        !(reason instanceof AdminApiError) ||
        reason.status >= 500 ||
        reason.code === "IDEMPOTENCY_IN_PROGRESS" ||
        reason.code === "PUBLICATION_JOB_ACTIVE";
      if (!retryable) delete operationKeys.current[action];
      setError(reason);
      setFeedbackFocusRequest((value) => value + 1);
    } finally {
      if (!isCurrent()) return;
      setBusy(null);
    }
  }

  if (loading && !bundle) return <ReviewSkeleton />;
  if (!bundle)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6">
        <div className="max-w-lg">
          <AdminErrorNotice
            error={error}
            onRetry={() => {
              void load();
            }}
          />
        </div>
      </main>
    );

  const resolvedLayerId = layerId ?? bundle.revision.layerId;
  const publicationStale =
    error instanceof AdminApiError && error.code === "PUBLICATION_BASE_STALE";
  const activeRevisionId =
    publicationStale && typeof error.details.activeRevisionId === "string"
      ? error.details.activeRevisionId
      : null;
  const reviewerActions =
    canReviewContent(principal.role) && bundle.revision.status === "in_review";
  const publicationActive = publicationJob
    ? !isTerminalPublicationJob(publicationJob)
    : false;
  const currentSynchronousPublication =
    synchronousPublication?.identity === publicationIdentity
      ? synchronousPublication.result
      : null;
  const publicationSucceeded =
    publicationJob?.status === "succeeded" ||
    currentSynchronousPublication !== null;
  const visibleSuccess =
    publicationJob?.status === "succeeded"
      ? "Dữ liệu mới đã được công bố trên bản đồ."
      : publicationJob?.status === "failed"
        ? null
        : success;
  const publisherAction =
    canPublishContent(principal.role) &&
    bundle.revision.status === "approved" &&
    !publicationStale &&
    canPublishHere &&
    !publicationActive &&
    !publicationSucceeded;
  const publishLabel =
    publicationJob?.status === "failed"
      ? "Thử công bố lại"
      : "Công bố dữ liệu";
  const status = reviewStatus(bundle.revision.status);
  const validationLabel =
    history?.data.validation.status === "valid"
      ? "Đã vượt qua"
      : history?.data.validation.status === "invalid"
        ? "Cần kiểm tra"
        : "Xem kết quả";

  return (
    <main className="min-h-[100dvh] bg-surface-subtle pb-32 md:pb-40">
      <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b bg-surface px-4">
        <Button asChild variant="ghost" size="icon">
          <Link
            href={`/admin/layers/${resolvedLayerId}/history`}
            aria-label="Quay lại lịch sử lớp"
          >
            <IconArrowLeft stroke={1.75} />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">
            <span className="md:hidden">Duyệt </span>
            {bundle.revision.title}
          </h1>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <IconFileDescription
              className="md:hidden"
              size={14}
              stroke={1.75}
            />
            <span className="md:hidden">Bản #{bundle.revision.revisionNo}</span>
            <span className="hidden md:inline">
              Phiên bản #{bundle.revision.revisionNo}
            </span>
          </p>
        </div>
        <Badge className={cn("md:hidden", status.className)}>
          <IconClock stroke={1.75} />
          {status.label}
        </Badge>
        <Badge className="hidden md:inline-flex">
          {status.label}
        </Badge>
      </header>

      <nav
        className="sticky top-16 z-20 grid h-11 grid-cols-3 border-b bg-surface md:hidden"
        aria-label="Nội dung review"
        role="tablist"
      >
        {mobileReviewTabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              mobileTabRefs.current[tab.id] = element ?? undefined;
            }}
            id={`mobile-review-${tab.id}-tab`}
            type="button"
            role="tab"
            tabIndex={mobileSection === tab.id ? 0 : -1}
            aria-selected={mobileSection === tab.id}
            aria-controls={`mobile-review-${tab.id}-panel`}
            onClick={() => activateMobileSection(tab.id)}
            onKeyDown={(event) => {
              let nextIndex: number | null = null;
              if (event.key === "ArrowRight")
                nextIndex = (index + 1) % mobileReviewTabs.length;
              if (event.key === "ArrowLeft")
                nextIndex =
                  (index - 1 + mobileReviewTabs.length) %
                  mobileReviewTabs.length;
              if (event.key === "Home") nextIndex = 0;
              if (event.key === "End") nextIndex = mobileReviewTabs.length - 1;
              if (nextIndex === null) return;
              event.preventDefault();
              const nextTab = mobileReviewTabs[nextIndex];
              setMobileSection(nextTab.id);
              mobileTabRefs.current[nextTab.id]?.focus();
            }}
            className={cn(
              "relative min-h-11 px-3 text-sm font-medium text-muted-foreground outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              mobileSection === tab.id &&
                "text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-[1.25fr_0.75fr] md:p-6">
        <div
          ref={(element) => {
            mobilePanelRefs.current.map = element ?? undefined;
          }}
          id="mobile-review-map-panel"
          role="tabpanel"
          aria-labelledby="mobile-review-map-tab"
          tabIndex={mobileSection === "map" ? 0 : -1}
          className={cn(
            "min-w-0 scroll-mt-28 outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mobileSection === "map" ? "block" : "hidden md:block",
          )}
        >
          <section
            className="overflow-hidden bg-surface md:rounded-panel md:border"
            aria-labelledby="review-content-title"
          >
            <ReviewMapPreview
              revision={bundle.revision}
              features={bundle.features}
            />
            <div className="hidden border-t p-4 md:block">
              <h2 id="review-content-title" className="font-semibold">
                Nội dung phiên bản
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {bundle.revision.description || "Không có mô tả."}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-control bg-accent-subtle p-3">
                  <dt className="text-xs text-muted-foreground">Đối tượng</dt>
                  <dd className="mt-1 text-lg font-semibold text-primary">
                    {bundle.workspace.featureCount}
                  </dd>
                </div>
                <div className="rounded-control bg-surface-subtle p-3">
                  <dt className="text-xs text-muted-foreground">
                    Trường thông tin
                  </dt>
                  <dd className="mt-1 text-lg font-semibold">
                    {bundle.fields.length}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="relative z-[1] mx-3 -mt-3 rounded-panel border bg-surface p-3 map-panel-shadow md:hidden">
              <button
                type="button"
                onClick={() => activateMobileSection("changes", true)}
                className="flex min-h-11 w-full items-center gap-3 rounded-control text-left outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Xem phiên bản có ${bundle.workspace.featureCount} đối tượng`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary">
                  <IconPolygon size={21} stroke={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {bundle.workspace.featureCount} đối tượng trong phiên bản
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {geometryModeLabel(bundle.revision.geometryMode)}
                  </span>
                </span>
                <IconChevronRight
                  className="text-muted-foreground"
                  size={20}
                  stroke={1.75}
                />
              </button>
              <dl className="mt-2 grid grid-cols-2 border-y py-2 text-xs">
                <div className="flex min-w-0 items-center gap-2 border-r pr-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-control bg-emerald-50 text-success">
                    <IconUser size={19} stroke={1.75} />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Tác giả</dt>
                    <dd className="truncate font-medium">
                      {history?.data.revision?.createdByDisplayName ?? "Người dùng nội bộ"}
                    </dd>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2 pl-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface-subtle text-muted-foreground">
                    <IconCalendar size={19} stroke={1.75} />
                  </span>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">Cập nhật</dt>
                    <dd className="truncate font-medium">
                      {new Date(bundle.revision.updatedAt).toLocaleString(
                        "vi-VN",
                        { dateStyle: "short", timeStyle: "short" },
                      )}
                    </dd>
                  </div>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => activateMobileSection("changes", true)}
                className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-control text-left outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Mở kết quả kiểm tra dữ liệu, ${validationLabel}`}
              >
                <span
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-control",
                    history?.data.validation.status === "valid"
                      ? "bg-emerald-50 text-success"
                      : "bg-accent-subtle text-primary",
                  )}
                >
                  <IconCircleCheck size={21} stroke={1.75} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    Kiểm tra dữ liệu
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-xs",
                      history?.data.validation.status === "valid"
                        ? "text-success"
                        : "text-muted-foreground",
                    )}
                  >
                    {validationLabel}
                  </span>
                </span>
                <IconChevronRight
                  className="text-muted-foreground"
                  size={20}
                  stroke={1.75}
                />
              </button>
            </div>
            {publicationJob && !wideReviewLayout && mobileSection === "map" && (
              <div className="mx-3 mt-3 md:hidden">
                <PublicationJobStatus
                  job={publicationJob}
                  trackingState={trackingState}
                  trackingIssue={trackingIssue}
                  compact
                  announceChanges
                />
              </div>
            )}
            <div className="mx-3 mt-3 flex items-start gap-2 rounded-control border border-primary/20 bg-accent-subtle p-3 text-xs leading-5 text-muted-foreground md:hidden">
              <IconInfoCircle
                className="mt-0.5 shrink-0 text-primary"
                size={18}
                stroke={1.75}
              />
              <p>
                Bản xem trên di động chỉ hỗ trợ xem và duyệt. Chỉnh sửa dữ liệu
                cần máy tính.
              </p>
            </div>
          </section>
        </div>

        <aside
          ref={(element) => {
            mobilePanelRefs.current.comments = element ?? undefined;
          }}
          id="mobile-review-comments-panel"
          role="tabpanel"
          aria-labelledby="mobile-review-comments-tab"
          tabIndex={mobileSection === "comments" ? 0 : -1}
          className={cn(
            "scroll-mt-28 flex-col gap-4 p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex md:p-0",
            mobileSection === "comments" ? "flex" : "hidden",
          )}
        >
          <section
            className="hidden rounded-panel border bg-surface p-4 md:block"
            aria-labelledby="workspace-title"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-control bg-accent-subtle text-primary">
                <IconPolygon stroke={1.75} />
              </span>
              <div>
                <h2 id="workspace-title" className="text-sm font-semibold">
                  Thông tin phiên bản
                </h2>
                <p className="text-xs text-muted-foreground">
                  Thông tin lưu trên hệ thống
                </p>
              </div>
            </div>
            <dl className="mt-4 divide-y text-sm">
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">Người tạo</dt>
                <dd className="max-w-[12rem] truncate font-medium">
                  {history?.data.revision?.createdByDisplayName ?? "Người dùng nội bộ"}
                </dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-muted-foreground">Cập nhật</dt>
                <dd className="font-medium">
                  {new Date(bundle.revision.updatedAt).toLocaleString("vi-VN")}
                </dd>
              </div>
            </dl>
          </section>
          {(error !== null || visibleSuccess) && (
            <div
              ref={workflowFeedbackRef}
              tabIndex={-1}
              className="flex scroll-mt-28 flex-col gap-2 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {error !== null && (
                <div className="flex flex-col gap-2">
                  <AdminErrorNotice
                    error={error}
                    onRetry={() => {
                      void load();
                    }}
                  />
                  {activeRevisionId && (
                    <Button asChild variant="outline" className="w-full">
                      <Link
                        href={`/admin/layers/${resolvedLayerId}/revisions/${activeRevisionId}/review`}
                      >
                        Mở phiên bản đang công bố
                      </Link>
                    </Button>
                  )}
                </div>
              )}
              {visibleSuccess && (
                <Alert role="status" aria-atomic="true">
                  <IconCheck aria-hidden="true" stroke={1.75} />
                  <AlertTitle>Trạng thái công việc</AlertTitle>
                  <AlertDescription>{visibleSuccess}</AlertDescription>
                </Alert>
              )}
            </div>
          )}
          {jobRecoveryError !== null && (
            <Alert>
              <IconRefresh stroke={1.75} />
              <AlertTitle>Chưa thể khôi phục trạng thái công bố</AlertTitle>
              <AlertDescription>
                <p>
                  Chưa thể tải tiến độ. Quá trình công bố trên hệ thống vẫn có thể đang tiếp tục.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    void load();
                  }}
                >
                  <IconRefresh data-icon="inline-start" stroke={1.75} />
                  Thử kết nối lại
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {publicationJob &&
            (wideReviewLayout || mobileSection === "comments") && (
              <PublicationJobStatus
                ref={canPublishHere ? publicationStatusRef : undefined}
                job={publicationJob}
                trackingState={trackingState}
                trackingIssue={trackingIssue}
              />
            )}
          {reviewerActions && (
            <section className="rounded-panel border bg-surface p-4">
              <Field>
                <FieldLabel htmlFor="review-comment">
                  Ý kiến kiểm duyệt
                </FieldLabel>
                <textarea
                  id="review-comment"
                  className="min-h-24 w-full scroll-mb-28 resize-y rounded-control border bg-surface p-3 text-sm"
                  value={comment}
                  aria-describedby="review-comment-description"
                  onChange={(event) => {
                    setComment(event.target.value);
                    delete operationKeys.current.approve;
                    delete operationKeys.current.changes;
                  }}
                  placeholder="Bắt buộc khi yêu cầu chỉnh sửa"
                />
                <FieldDescription id="review-comment-description">
                  <IconMessage
                    aria-hidden="true"
                    className="inline"
                    size={16}
                  />{" "}
                  Có thể để trống khi phê duyệt; bắt buộc khi yêu cầu chỉnh sửa.
                </FieldDescription>
              </Field>
            </section>
          )}
          {publisherAction && (
            <section className="rounded-panel border bg-surface p-4">
              <Field>
                <FieldLabel htmlFor="release-note">Ghi chú công bố</FieldLabel>
                <textarea
                  id="release-note"
                  className="min-h-24 w-full scroll-mb-28 resize-y rounded-control border bg-surface p-3 text-sm"
                  value={releaseNote}
                  aria-describedby="release-note-description"
                  onChange={(event) => {
                    setReleaseNote(event.target.value);
                    delete operationKeys.current.publish;
                  }}
                  placeholder="Mô tả dữ liệu được công bố"
                />
                <FieldDescription id="release-note-description">
                  Tóm tắt nội dung của lần công bố này để dễ tra cứu về sau.
                </FieldDescription>
              </Field>
            </section>
          )}
          {!reviewerActions && !publisherAction && !publicationJob && (
            <section className="rounded-panel border bg-surface p-4 text-sm text-muted-foreground">
              {bundle.revision.status === "draft"
                ? "Bản nháp chưa được gửi duyệt. Mở lớp dữ liệu để tiếp tục biên tập."
                : bundle.revision.status === "changes_requested"
                  ? "Nội dung cần chỉnh sửa. Bản nháp mới đã được tạo để biên tập viên cập nhật."
                  : bundle.revision.status === "approved"
                    ? canPublishContent(principal.role) && !canPublishHere
                      ? "Dữ liệu đã được duyệt. Dùng máy tính để công bố lên bản đồ."
                      : "Dữ liệu đã được duyệt và đang chờ công bố."
                    : bundle.revision.status === "published"
                      ? "Phiên bản này đã được công bố. Muốn thay đổi dữ liệu, hãy tạo bản nháp mới từ lớp dữ liệu."
                      : "Bạn có thể xem nội dung và theo dõi kết quả kiểm duyệt tại đây."}
            </section>
          )}
        </aside>
      </div>

      <div
        className={cn(
          "mx-auto max-w-5xl flex-col gap-8 px-4 pb-8 md:flex md:px-6",
          mobileSection === "map" ? "hidden md:flex" : "flex",
        )}
      >
        <div
          ref={(element) => {
            mobilePanelRefs.current.changes = element ?? undefined;
          }}
          id="mobile-review-changes-panel"
          role="tabpanel"
          aria-labelledby="mobile-review-changes-tab"
          tabIndex={mobileSection === "changes" ? 0 : -1}
          className={cn(
            "scroll-mt-28 outline-none focus-visible:ring-2 focus-visible:ring-ring md:contents",
            mobileSection === "changes" ? "flex flex-col gap-8" : "hidden",
          )}
        >
          {historyError !== null && (
            <AdminErrorNotice
              error={historyError}
              onRetry={() => {
                void load();
              }}
            />
          )}
          {history && (
            <section
              className="flex flex-col gap-3"
              aria-labelledby="validation-title"
            >
              <h2 id="validation-title" className="text-base font-semibold">
                Kết quả kiểm tra
              </h2>
              <ValidationReport validation={history.data.validation} />
            </section>
          )}
          <section className="flex flex-col gap-3" aria-labelledby="diff-title">
            <h2 id="diff-title" className="text-base font-semibold">
              So sánh thay đổi
            </h2>
            <RevisionDiffView revisionId={revisionId} fieldLabels={Object.fromEntries(bundle.fields.map((field) => [field.key, field.label]))} />
          </section>
        </div>
        <div
          className={cn(
            "md:contents",
            mobileSection === "comments" ? "contents" : "hidden",
          )}
        >
          <section
            className="flex flex-col gap-3"
            aria-labelledby="workflow-title"
          >
            <h2 id="workflow-title" className="text-base font-semibold">
              Lịch sử duyệt
            </h2>
            <WorkflowTimeline
              events={workflow?.data ?? null}
              loading={
                !historyError &&
                !workflow &&
                process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true"
              }
              loadingMore={loadingWorkflow}
              onRetry={() => {
                void load();
              }}
              onLoadMore={loadMoreWorkflow}
            />
          </section>
          <section
            className="flex flex-col gap-3"
            aria-labelledby="audit-title"
          >
            <h2 id="audit-title" className="text-base font-semibold">
              Nhật ký phiên bản
            </h2>
            <AuditEventList
              events={audit?.data ?? null}
              loading={
                !historyError &&
                !audit &&
                process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true"
              }
              loadingMore={loadingAudit}
              onRetry={() => {
                void load();
              }}
              onLoadMore={loadMoreAudit}
            />
          </section>
        </div>
      </div>

      {(reviewerActions || publisherAction) && (
        <div
          className="fixed inset-x-0 bottom-16 z-20 border-t bg-surface p-3 md:bottom-0 md:left-60"
          role="region"
          aria-label="Thao tác kiểm duyệt"
          aria-busy={busy !== null}
        >
          <div className="mx-auto flex max-w-5xl gap-2">
            {reviewerActions && (
              <>
                <Button
                  aria-label="Yêu cầu chỉnh sửa"
                  disabled={!comment.trim() || busy !== null}
                  onClick={() => {
                    void mutate("changes");
                  }}
                  variant="outline"
                  className="h-11 min-h-11 flex-1 text-destructive md:h-10 md:min-h-10"
                >
                  <IconX data-icon="inline-start" stroke={1.75} />
                  {busy === "changes" ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Đang gửi...
                    </>
                  ) : (
                    <>
                      <span className="md:hidden">Yêu cầu sửa</span>
                      <span className="hidden md:inline">
                        Yêu cầu chỉnh sửa
                      </span>
                    </>
                  )}
                </Button>
                <Button
                  aria-label="Duyệt thay đổi"
                  disabled={busy !== null}
                  onClick={() => {
                    void mutate("approve");
                  }}
                  className="h-11 min-h-11 flex-1 md:h-10 md:min-h-10"
                >
                  <IconCheck data-icon="inline-start" stroke={1.75} />
                  {busy === "approve" ? (
                    <>
                      <Spinner data-icon="inline-start" />
                      Đang duyệt...
                    </>
                  ) : (
                    <>
                      <span className="md:hidden">Phê duyệt</span>
                      <span className="hidden md:inline">Duyệt thay đổi</span>
                    </>
                  )}
                </Button>
              </>
            )}
            {publisherAction && (
              <Button
                disabled={
                  !canPublishHere || !releaseNote.trim() || busy !== null
                }
                onClick={() => {
                  void mutate("publish");
                }}
                className="flex-1"
              >
                <IconCloudUpload data-icon="inline-start" stroke={1.75} />
                {busy === "publish" ? (
                  <>
                    <Spinner data-icon="inline-start" />
                    Đang gửi...
                  </>
                ) : (
                  publishLabel
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
