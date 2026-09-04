"use client";

import dynamic from "next/dynamic";
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
  ArrowLeft,
  Circle,
  CloudUpload,
  Copy,
  FileUp,
  History,
  Info,
  MapPin,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pentagon,
  Redo2,
  Save,
  Spline,
  TableProperties,
  Trash2,
  Undo2,
} from "lucide-react";
import type { DrawTool } from "@/components/admin/editor-map-canvas";
import {
  AdminErrorNotice,
  useAdminSession,
} from "@/components/admin/admin-session";
import { FeatureAttachmentPanel } from "@/components/admin/feature-attachment-panel";
import { FeaturePropertiesEditor } from "@/components/admin/feature-properties-editor";
import {
  EditorSyncStatus,
  type EditorSyncPhase,
} from "@/components/admin/editor-sync-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AdminApiError,
  loadRevisionBundle,
  submitRevision,
  type AdminFeature,
  type RevisionBundle,
} from "@/lib/api/admin";
import { canAuthorContent } from "@/lib/admin/role-capabilities";
import { geometryLabel, revisionStatusLabel } from "@/lib/admin/labels";
import {
  getDesktopAuthoringCapability,
  getServerDesktopAuthoringCapability,
  subscribeDesktopAuthoringCapability,
} from "@/lib/admin/authoring-capability";
import {
  draftDb,
  draftKey,
  draftMatchesWorkspace,
  shouldAutosaveDraft,
  cleanupStaleEditorWorkspaces,
  syncWorkspaceKey,
  type FeatureMutationLedgerEntry,
  type LayerDraft,
} from "@/lib/editor/draft-db";
import {
  acknowledgedFeatureMappings,
  activeWorkspaceIssues,
  discardMutationIssue,
  enqueueEditorSnapshot,
  ensureEditorSyncWorkspace,
  listWorkspaceMutations,
  refreshWorkspaceChangeFeed,
  remapSnapshotFeatureIds,
  syncPendingFeatureMutations,
} from "@/lib/editor/durable-sync";
import {
  adminFeatureToTerra,
  adminFeatureToTerraParts,
  decodeTerraFeature,
  diffEditorFeatures,
  editorGeometryKindProperty,
  editorGeometryKindForNewFeature,
  editorLogicalFeatureId,
  editorParentIdProperty,
  editorPartIndexProperty,
  rebaseEditorSnapshot,
  snapshotLogicalFeatures,
} from "@/lib/editor/editor-sync";
import type {
  EditorCommand,
  EditorHistoryState,
} from "@/lib/editor/editor-commands";
import {
  applyFieldDefaults,
  validateFeatureProperties,
} from "@/lib/editor/field-values";
import {
  editorSyncOwnerId,
  subscribeSyncActivity,
  withEditorSyncOwnership,
} from "@/lib/editor/sync-coordinator";

const EditorMapCanvas = dynamic(
  () => import("@/components/admin/editor-map-canvas"),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full rounded-none" />,
  },
);
const tools: Array<{
  id: DrawTool;
  label: string;
  icon: typeof MousePointer2;
  geometryKinds?: string[];
}> = [
  { id: "select", label: "Chọn và chỉnh sửa", icon: MousePointer2 },
  {
    id: "point",
    label: "Vẽ điểm",
    icon: MapPin,
    geometryKinds: ["point", "multipoint"],
  },
  {
    id: "linestring",
    label: "Vẽ đường",
    icon: Spline,
    geometryKinds: ["line", "multiline"],
  },
  {
    id: "polygon",
    label: "Vẽ vùng",
    icon: Pentagon,
    geometryKinds: ["polygon", "multipolygon"],
  },
  {
    id: "circle",
    label: "Vẽ đường tròn",
    icon: Circle,
    geometryKinds: ["circle"],
  },
];

function MobileCapabilityGate({ revisionId }: { revisionId: string }) {
  return (
    <main className="min-h-[100dvh] bg-surface-subtle p-4 pb-24">
      <div className="mx-auto max-w-lg">
        <Button asChild variant="ghost" className="-ml-3">
          <Link href="/admin/layers">
            <ArrowLeft data-icon="inline-start" strokeWidth={1.75} />
            Lớp dữ liệu
          </Link>
        </Button>
        <section className="mt-6 rounded-panel border bg-surface p-6">
          <span className="grid size-12 place-items-center rounded-map-control bg-accent-subtle text-primary">
            <Info strokeWidth={1.75} />
          </span>
          <h1 className="mt-5 text-xl font-semibold">
            Mở trình biên tập trên máy tính
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Tính năng này cần máy tính có chuột hoặc trackpad và bàn phím. Trên
            thiết bị này, bạn vẫn có thể xem dữ liệu và theo dõi trạng thái.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href={`/admin/layers/${revisionId}/review`}>
              Xem dữ liệu
            </Link>
          </Button>
        </section>
      </div>
    </main>
  );
}

export function LayerEditor({ revisionId }: { revisionId: string }) {
  const canAuthor = useSyncExternalStore(
    subscribeDesktopAuthoringCapability,
    getDesktopAuthoringCapability,
    getServerDesktopAuthoringCapability,
  );
  const { principal, csrfToken } = useAdminSession();
  const [bundle, setBundle] = useState<RevisionBundle | null>(null);
  const bundleRef = useRef<RevisionBundle | null>(null);
  const [features, setFeatures] = useState<unknown[]>([]);
  const [restore, setRestore] = useState({
    version: 0,
    features: [] as unknown[],
  });
  const [tool, setTool] = useState<DrawTool>("select");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [deleteRequest, setDeleteRequest] = useState(0);
  const [recoveredDraft, setRecoveredDraft] = useState<LayerDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const workflowKeyRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(false);
  const [featureListOpen, setFeatureListOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [focusRequest, setFocusRequest] = useState<{
    version: number;
    featureId: string | number | null;
  }>({ version: 0, featureId: null });
  const [summary, setSummary] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");
  const featuresRef = useRef(features);
  const [syncPhase, setSyncPhase] = useState<EditorSyncPhase>("idle");
  const [syncIssues, setSyncIssues] = useState<FeatureMutationLedgerEntry[]>(
    [],
  );
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [remoteChanges, setRemoteChanges] = useState(0);
  const [editorCommand, setEditorCommand] = useState<EditorCommand>({
    version: 0,
    type: "undo",
  });
  const [history, setHistory] = useState<EditorHistoryState>({
    canUndo: false,
    canRedo: false,
  });

  const selectAndFocusFeature = useCallback((featureId: string | number) => {
    setSelectedId(featureId);
    setFocusRequest((current) => ({
      version: current.version + 1,
      featureId,
    }));
  }, []);

  useEffect(() => {
    featuresRef.current = features;
  }, [features]);
  const applyBundleAndSnapshot = useCallback(
    (next: RevisionBundle, snapshot: unknown[]) => {
      bundleRef.current = next;
      setBundle(next);
      setFeatures(snapshot);
      featuresRef.current = snapshot;
      setRestore((current) => ({
        version: current.version + 1,
        features: snapshot,
      }));
      const diff = diffEditorFeatures(
        next.features,
        snapshot,
        next.fields.map((field) => field.key),
      );
      const changed =
        diff.creates.length + diff.updates.length + diff.deletes.length > 0;
      dirtyRef.current = changed;
      setDirty(changed);
    },
    [],
  );
  const load = useCallback(() => {
    const generation = ++loadGenerationRef.current;
    setLoading(true);
    setError(null);
    loadRevisionBundle(revisionId)
      .then((next) => {
        if (loadGenerationRef.current !== generation) return;
        bundleRef.current = next;
        setBundle(next);
        const drawable = next.features.flatMap(adminFeatureToTerraParts);
        setFeatures(drawable);
        setRestore((current) => ({
          version: current.version + 1,
          features: drawable,
        }));
        dirtyRef.current = false;
        setDirty(false);
        setSuccess(null);
      })
      .catch((reason) => {
        if (loadGenerationRef.current === generation) setError(reason);
      })
      .finally(() => {
        if (loadGenerationRef.current === generation) setLoading(false);
      });
  }, [revisionId]);
  useEffect(() => {
    if (!canAuthor || !canAuthorContent(principal.role)) return;
    const timer = window.setTimeout(load, 0);
    return () => {
      window.clearTimeout(timer);
      loadGenerationRef.current += 1;
    };
  }, [canAuthor, load, principal.role]);

  const draftId = useMemo(
    () =>
      bundle
        ? draftKey(
            principal.id,
            bundle.workspace.layerId,
            bundle.revision.revisionNo,
          )
        : null,
    [bundle, principal.id],
  );
  const syncWorkspaceId = useMemo(
    () => (bundle ? syncWorkspaceKey(principal.id, bundle.revision.id) : null),
    [bundle, principal.id],
  );
  const refreshSyncState = useCallback(
    async (workspaceId: string, preserveActivePhase = true) => {
      const mutations = await listWorkspaceMutations(workspaceId);
      const issues = mutations.filter(
        (entry) => entry.status === "conflict" || entry.status === "rejected",
      );
      const pending = mutations.filter((entry) =>
        ["pending", "syncing", "retry"].includes(entry.status),
      ).length;
      setSyncIssues(issues);
      setPendingSyncCount(pending);
      setSyncPhase((current) =>
        issues.length
          ? "issues"
          : preserveActivePhase &&
              (current === "syncing" || current === "observing")
            ? current
            : pending
              ? "offline"
              : "idle",
      );
    },
    [],
  );
  useEffect(() => {
    if (!bundle || !syncWorkspaceId) return;
    let active = true;
    ensureEditorSyncWorkspace(principal.id, bundle)
      .then(async () => {
        await cleanupStaleEditorWorkspaces(principal.id, syncWorkspaceId);
        if (active) await refreshSyncState(syncWorkspaceId);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [bundle, principal.id, refreshSyncState, syncWorkspaceId]);
  useEffect(() => {
    if (!syncWorkspaceId) return;
    let active = true;
    const unsubscribe = subscribeSyncActivity(syncWorkspaceId, (activity) => {
      if (activity.ownerId === editorSyncOwnerId) return;
      if (activity.state === "started") setSyncPhase("observing");
      if (activity.state === "finished") {
        Promise.all([
          loadRevisionBundle(revisionId),
          listWorkspaceMutations(syncWorkspaceId),
        ])
          .then(([fresh, mutations]) => {
            if (!active) return;
            const mappings = acknowledgedFeatureMappings(mutations);
            const localSnapshot = remapSnapshotFeatureIds(
              featuresRef.current,
              mappings,
            );
            const currentBundle = bundleRef.current;
            if (!dirtyRef.current || !currentBundle) {
              applyBundleAndSnapshot(
                fresh,
                fresh.features.flatMap(adminFeatureToTerraParts),
              );
            } else {
              const rebased = rebaseEditorSnapshot(
                currentBundle.features,
                localSnapshot,
                fresh.features,
                currentBundle.fields.map((field) => field.key),
              );
              const remaining = diffEditorFeatures(
                fresh.features,
                rebased,
                fresh.fields.map((field) => field.key),
              );
              const remainingCount =
                remaining.creates.length +
                remaining.updates.length +
                remaining.deletes.length;
              applyBundleAndSnapshot(fresh, rebased);
              if (remainingCount > 0)
                setRemoteChanges((count) => Math.max(1, count));
            }
            return refreshSyncState(syncWorkspaceId, false);
          })
          .catch(() => {
            if (active) setSyncPhase("offline");
          });
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyBundleAndSnapshot, refreshSyncState, revisionId, syncWorkspaceId]);
  useEffect(() => {
    if (!draftId) return;
    draftDb.drafts
      .get(draftId)
      .then((draft) => {
        if (draft) {
          const immutable = structuredClone(draft);
          Object.freeze(immutable.features);
          Object.freeze(immutable);
          setRecoveredDraft(immutable);
        }
        setDraftReady(true);
      })
      .catch(() => setDraftReady(true));
  }, [draftId]);

  useEffect(() => {
    if (
      !bundle ||
      !draftId ||
      !shouldAutosaveDraft({
        ready: draftReady,
        recoveryPending: recoveredDraft !== null,
        dirty,
      })
    )
      return;
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      draftDb.drafts
        .put({
          id: draftId,
          principalId: principal.id,
          layerId: bundle.workspace.layerId,
          draftRevision: bundle.revision.revisionNo,
          baseRevision: bundle.revision.revisionNo,
          baseEtag: bundle.etag,
          serverCursor: bundle.workspace.serverCursor,
          updatedAt: now,
          title: bundle.revision.title,
          description: bundle.revision.description,
          features,
        })
        .then(() => {
          setSavedAt(now);
        })
        .catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [
    bundle,
    draftId,
    draftReady,
    features,
    dirty,
    principal.id,
    recoveredDraft,
  ]);

  const handleSnapshot = useCallback(
    (next: unknown[]) => {
      const normalized = bundle
        ? next.map((value) => {
            const feature = decodeTerraFeature(value);
            const isNew =
              feature &&
              !bundle.features.some(
                (canonical) => canonical.id === editorLogicalFeatureId(feature),
              );
            if (!feature) return value;
            if (!isNew) return feature;
            const properties = applyFieldDefaults(
              bundle.fields,
              feature.properties,
            );
            const geometryKind = editorGeometryKindForNewFeature(
              feature,
              bundle.revision.allowedGeometryKinds,
            );
            if (!geometryKind) return feature;
            return {
              ...feature,
              properties: {
                ...properties,
                [editorParentIdProperty]: String(feature.id),
                [editorGeometryKindProperty]: geometryKind,
                [editorPartIndexProperty]: 0,
              },
            };
          })
        : next;
      setFeatures(normalized);
      featuresRef.current = normalized;
      if (!bundle || recoveredDraft) return;
      const diff = diffEditorFeatures(
        bundle.features,
        normalized,
        bundle.fields.map((field) => field.key),
      );
      const changed =
        diff.creates.length + diff.updates.length + diff.deletes.length > 0;
      dirtyRef.current = changed;
      setDirty(changed);
    },
    [bundle, recoveredDraft],
  );

  function resumeDraft() {
    if (!recoveredDraft) return;
    const snapshot = structuredClone(recoveredDraft.features);
    setFeatures(snapshot);
    setRestore((current) => ({
      version: current.version + 1,
      features: snapshot,
    }));
    setRecoveredDraft(null);
    dirtyRef.current = true;
    setDirty(true);
  }
  function discardDraft() {
    if (draftId) draftDb.drafts.delete(draftId).catch(() => undefined);
    setRecoveredDraft(null);
    dirtyRef.current = false;
    setDirty(false);
  }
  function exportRecoveredDraft() {
    if (!recoveredDraft) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(recoveredDraft, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `danangmap-draft-${bundle?.revision.id ?? "revision"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function saveServer() {
    if (
      !bundle ||
      (!dirty && pendingSyncCount === 0) ||
      bundle.truncated ||
      bundle.features.some((feature) => !adminFeatureToTerra(feature))
    )
      return;
    const validationErrors = snapshotLogicalFeatures(
      featuresRef.current,
    ).flatMap((feature) =>
      validateFeatureProperties(bundle.fields, feature.properties),
    );
    if (validationErrors.length > 0) {
      setError(
        new AdminApiError(
          422,
          "SCHEMA_VIOLATION",
          validationErrors.slice(0, 3).join(" "),
          undefined,
          { errors: validationErrors },
        ),
      );
      return;
    }
    setBusy("save");
    setError(null);
    setSuccess(null);
    setSyncPhase("syncing");
    try {
      const baseBundle = bundle;
      const preserveLocalSnapshot = dirty;
      const desiredSnapshot = structuredClone(featuresRef.current);
      const workspaceId = syncWorkspaceKey(principal.id, bundle.revision.id);
      const ownership = await withEditorSyncOwnership(workspaceId, async () => {
        let workspace = await ensureEditorSyncWorkspace(principal.id, bundle);
        const ledger = await listWorkspaceMutations(workspace.id);
        const persistedMappings = acknowledgedFeatureMappings(ledger);
        const recoveredSnapshot = remapSnapshotFeatureIds(
          desiredSnapshot,
          persistedMappings,
        );
        const hasAmbiguousRetry = ledger.some(
          (entry) =>
            (entry.status === "retry" || entry.status === "syncing") &&
            entry.attempts > 0,
        );
        const hasIssues = ledger.some(
          (entry) => entry.status === "conflict" || entry.status === "rejected",
        );
        let receivedRemoteChanges = 0;
        if (!hasAmbiguousRetry && !hasIssues) {
          const feed = await refreshWorkspaceChangeFeed(workspace);
          workspace = feed.workspace;
          receivedRemoteChanges = feed.remoteChanges;
        }
        await enqueueEditorSnapshot(workspace, bundle, recoveredSnapshot);
        return {
          summary: await syncPendingFeatureMutations(workspace.id, csrfToken),
          recoveredSnapshot,
          receivedRemoteChanges,
        };
      });
      if (!ownership.acquired) {
        setSyncPhase("observing");
        setSuccess("Một tab khác đang đồng bộ bản chỉnh sửa này.");
        return;
      }
      const { summary, recoveredSnapshot, receivedRemoteChanges } =
        ownership.value;
      featuresRef.current = recoveredSnapshot;
      setRemoteChanges(receivedRemoteChanges);
      const fresh = await loadRevisionBundle(revisionId);
      const remappedSnapshot = preserveLocalSnapshot
        ? rebaseEditorSnapshot(
            baseBundle.features,
            remapSnapshotFeatureIds(recoveredSnapshot, summary.mappings),
            fresh.features,
            baseBundle.fields.map((field) => field.key),
          )
        : fresh.features.flatMap(adminFeatureToTerraParts);
      applyBundleAndSnapshot(fresh, remappedSnapshot);
      const issues = await activeWorkspaceIssues(workspaceId);
      setSyncIssues(issues);
      setPendingSyncCount(summary.pending);
      setSyncPhase(
        issues.length ? "issues" : summary.pending ? "offline" : "idle",
      );
      if (!issues.length && summary.pending === 0) {
        const nextDiff = diffEditorFeatures(
          fresh.features,
          remappedSnapshot,
          fresh.fields.map((field) => field.key),
        );
        const remainsDirty =
          nextDiff.creates.length +
            nextDiff.updates.length +
            nextDiff.deletes.length >
          0;
        if (!remainsDirty && draftId) await draftDb.drafts.delete(draftId);
        setSuccess(
          remainsDirty
            ? "Đã nhận phản hồi máy chủ. Còn thay đổi mới cần đồng bộ."
            : `Đã lưu ${summary.acknowledged} thay đổi lên máy chủ.`,
        );
      } else {
        setSuccess(
          "Đã lưu các thay đổi hợp lệ. Một số đối tượng cần bạn kiểm tra lại.",
        );
      }
    } catch (reason) {
      setError(reason);
      setSyncPhase(
        reason instanceof AdminApiError &&
          [409, 412, 422].includes(reason.status)
          ? "issues"
          : "offline",
      );
      if (syncWorkspaceId)
        await refreshSyncState(syncWorkspaceId).catch(() => undefined);
    } finally {
      setBusy(null);
    }
  }

  async function keepServerVersion(issue: FeatureMutationLedgerEntry) {
    if (!bundle || !syncWorkspaceId) return;
    await discardMutationIssue(issue.id);
    const canonicalId =
      issue.response?.status === "conflict"
        ? issue.response.canonicalFeatureId
        : issue.response?.status === "rejected"
          ? issue.response.canonicalFeatureId
          : issue.mutation.featureId;
    const serverFeature = canonicalId
      ? bundle.features.find((feature) => feature.id === canonicalId)
      : undefined;
    const serverParts = serverFeature
      ? adminFeatureToTerraParts(serverFeature)
      : [];
    const next = featuresRef.current.filter((value) => {
      const feature = decodeTerraFeature(value);
      return (
        feature &&
        editorLogicalFeatureId(feature) !== issue.localFeatureId &&
        editorLogicalFeatureId(feature) !== canonicalId
      );
    });
    next.push(...serverParts);
    applyBundleAndSnapshot(bundle, next);
    await refreshSyncState(syncWorkspaceId);
    setSuccess("Đã giữ phiên bản máy chủ cho đối tượng này.");
  }

  async function retryLocalVersion(issue: FeatureMutationLedgerEntry) {
    if (!syncWorkspaceId) return;
    await discardMutationIssue(issue.id);
    dirtyRef.current = true;
    setDirty(true);
    await refreshSyncState(syncWorkspaceId);
    setSuccess(
      issue.status === "conflict"
        ? "Đã giữ thay đổi của bạn. Chọn Lưu lên máy chủ để thử lưu lại."
        : "Hãy sửa dữ liệu chưa hợp lệ rồi chọn Lưu lên máy chủ.",
    );
  }

  async function submitForReview() {
    if (!bundle || dirty || !summary.trim()) return;
    setBusy("submit");
    setError(null);
    setSuccess(null);
    workflowKeyRef.current ??= crypto.randomUUID();
    try {
      await submitRevision(
        revisionId,
        summary.trim(),
        reviewerNote.trim(),
        workflowKeyRef.current,
        { csrfToken },
      );
      setSuccess("Đã gửi nội dung để duyệt.");
      load();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(null);
    }
  }

  function attachmentChanged(result: {
    feature: AdminFeature;
    etag: string;
    serverCursor: string;
  }) {
    if (!bundle) return;
    const nextFeatures = bundle.features.map((feature) =>
      feature.id === result.feature.id ? result.feature : feature,
    );
    const nextBundle = {
      ...bundle,
      features: nextFeatures,
      etag: result.etag,
      workspace: { ...bundle.workspace, serverCursor: result.serverCursor },
    };
    const drawable = nextFeatures.flatMap(adminFeatureToTerraParts);
    bundleRef.current = nextBundle;
    setBundle(nextBundle);
    setFeatures(drawable);
    setRestore((current) => ({
      version: current.version + 1,
      features: drawable,
    }));
    dirtyRef.current = false;
    setDirty(false);
    setSuccess("Đã cập nhật tệp đính kèm trên máy chủ.");
  }

  if (!canAuthor) return <MobileCapabilityGate revisionId={revisionId} />;
  if (!canAuthorContent(principal.role))
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6">
        <section className="max-w-lg rounded-panel border bg-surface p-6">
          <h1 className="text-xl font-semibold">
            Vai trò hiện tại không thể biên tập
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bạn cần quyền biên tập hoặc quản trị hệ thống để sửa dữ liệu. Bạn
            vẫn có thể xem dữ liệu và theo dõi trạng thái.
          </p>
          <Button asChild className="mt-5">
            <Link href={`/admin/layers/${revisionId}/review`}>Xem dữ liệu</Link>
          </Button>
        </section>
      </main>
    );
  if (loading || !bundle)
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6">
        {error ? (
          <div className="max-w-lg">
            <AdminErrorNotice error={error} onRetry={load} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground" role="status">
            Đang tải dữ liệu biên tập...
          </p>
        )}
      </main>
    );
  if (bundle.revision.status !== "draft") {
    const awaitingReview = bundle.revision.status === "in_review";
    const changesRequested = bundle.revision.status === "changes_requested";
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6">
        <section className="max-w-lg rounded-panel border bg-surface p-6">
          <h1 className="text-xl font-semibold">
            {awaitingReview
              ? "Đã gửi duyệt"
              : changesRequested
                ? "Cần chỉnh sửa"
                : "Phiên bản này chỉ được xem"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {awaitingReview
              ? "Phiên bản đang chờ kiểm duyệt. Bạn có thể theo dõi kết quả và nhận xét trong chế độ xem và duyệt."
              : changesRequested
                ? "Nội dung cần chỉnh sửa. Mở lớp để tiếp tục trên bản nháp mới và xem các ý kiến kiểm duyệt."
                : "Phiên bản này đã khóa chỉnh sửa. Mở chế độ xem và duyệt để xem nội dung và theo dõi trạng thái."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {changesRequested && (
              <Button asChild>
                <Link href={`/admin/layers/${bundle.revision.layerId}`}>
                  Mở lớp để chỉnh sửa
                </Link>
              </Button>
            )}
            <Button asChild variant={changesRequested ? "outline" : "default"}>
              <Link
                href={`/admin/layers/${bundle.revision.layerId}/revisions/${revisionId}/review`}
              >
                Mở chế độ xem và duyệt
              </Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }
  const unsupported = bundle.features.filter(
    (feature) => adminFeatureToTerraParts(feature).length === 0,
  ).length;
  const featureRows = snapshotLogicalFeatures(features);
  const selectedLogicalFeature =
    featureRows.find((feature) => feature.id === String(selectedId)) ?? null;
  const fieldValidationErrors = featureRows.flatMap((feature) =>
    validateFeatureProperties(bundle.fields, feature.properties).map(
      (message) =>
        `${typeof feature.properties.name === "string" && feature.properties.name.trim() ? feature.properties.name : "Đối tượng chưa đặt tên"}: ${message}`,
    ),
  );
  const selectedFeature =
    bundle.features.find(
      (feature) => String(feature.id) === String(selectedId),
    ) ?? null;
  const availableTools = tools.filter(
    (item) =>
      !item.geometryKinds ||
      item.geometryKinds.some((kind) =>
        bundle.revision.allowedGeometryKinds.includes(kind),
      ),
  );
  const canSubmit =
    bundle.revision.status === "draft" &&
    !dirty &&
    pendingSyncCount === 0 &&
    syncIssues.length === 0 &&
    summary.trim().length > 0;
  const recoveryMatches = recoveredDraft
    ? draftMatchesWorkspace(recoveredDraft, {
        etag: bundle.etag,
        serverCursor: bundle.workspace.serverCursor,
      })
    : false;
  const ledgerCanRecover = pendingSyncCount > 0 || syncIssues.length > 0;

  return (
    <main className="grid h-[100dvh] min-h-0 overflow-hidden bg-surface grid-rows-[64px_minmax(0,1fr)]">
      <header className="flex min-w-0 items-center gap-2 border-b bg-surface px-3 lg:px-4">
        <Button asChild variant="ghost" size="icon-sm">
          <Link href="/admin/layers" aria-label="Quay lại danh sách lớp">
            <ArrowLeft strokeWidth={1.75} />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold">
              {bundle.revision.title}
            </h1>
            <Badge className="hidden shrink-0 xl:inline-flex">
              {revisionStatusLabel(bundle.revision.status)}, phiên bản{" "}
              {bundle.revision.revisionNo}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {savedAt
              ? `Đã lưu trên thiết bị lúc ${new Date(savedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}`
              : "Thay đổi được tự động lưu trên thiết bị"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link
            href={`/admin/layers/${revisionId}/import`}
            aria-label="Nhập dữ liệu"
          >
            <FileUp data-icon="inline-start" strokeWidth={1.75} />
            <span className="hidden xl:inline">Nhập dữ liệu</span>
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={
            (!dirty && pendingSyncCount === 0) ||
            busy !== null ||
            bundle.truncated ||
            unsupported > 0 ||
            fieldValidationErrors.length > 0 ||
            syncIssues.length > 0
          }
          onClick={saveServer}
          aria-label={
            busy === "save" ? "Đang lưu lên máy chủ" : "Lưu lên máy chủ"
          }
        >
          <Save data-icon="inline-start" strokeWidth={1.75} />
          <span className="hidden xl:inline">
            {busy === "save" ? "Đang lưu" : "Lưu lên máy chủ"}
          </span>
        </Button>
        <Button
          size="sm"
          disabled={!canSubmit || busy !== null}
          title={
            dirty
              ? "Lưu thay đổi lên máy chủ trước khi gửi duyệt"
              : !summary.trim()
                ? "Nhập tóm tắt thay đổi trước khi gửi duyệt"
                : undefined
          }
          onClick={submitForReview}
          aria-label={busy === "submit" ? "Đang gửi duyệt" : "Gửi duyệt"}
        >
          <CloudUpload data-icon="inline-start" strokeWidth={1.75} />
          <span className="hidden xl:inline">
            {busy === "submit" ? "Đang gửi" : "Gửi duyệt"}
          </span>
        </Button>
      </header>
      <div className="relative min-h-0 min-w-0 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          {featureListOpen && (
            <>
              <ResizablePanel
                id="feature-list"
                defaultSize="19%"
                minSize="180px"
                maxSize="320px"
                groupResizeBehavior="preserve-pixel-size"
                className="min-w-0 bg-surface"
              >
                <aside
                  className="flex h-full min-w-0 flex-col"
                  aria-label="Danh sách đối tượng"
                >
                  <div className="flex min-h-12 items-center gap-2 border-b px-3">
                    <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                      Đối tượng
                    </h2>
                    <Badge>{featureRows.length}</Badge>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Thu gọn danh sách đối tượng"
                      onClick={() => setFeatureListOpen(false)}
                    >
                      <PanelLeftClose strokeWidth={1.75} />
                    </Button>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="flex flex-col gap-1 p-2">
                      {featureRows.length === 0 ? (
                        <Empty className="border-0 px-3 py-8">
                          <EmptyHeader>
                            <EmptyMedia variant="icon">
                              <Pentagon strokeWidth={1.75} />
                            </EmptyMedia>
                            <EmptyTitle>Chưa có đối tượng</EmptyTitle>
                            <EmptyDescription>
                              Chọn một công cụ vẽ trên bản đồ hoặc nhập dữ liệu
                              để bắt đầu.
                            </EmptyDescription>
                          </EmptyHeader>
                        </Empty>
                      ) : (
                        featureRows.map((feature, index) => (
                          <Button
                            key={String(feature.id)}
                            type="button"
                            variant={
                              String(selectedId) === String(feature.id)
                                ? "subtle"
                                : "ghost"
                            }
                            aria-pressed={
                              String(selectedId) === String(feature.id)
                            }
                            onClick={() => selectAndFocusFeature(feature.id)}
                            className="h-auto w-full justify-start px-2 py-2 text-left"
                          >
                            <Pentagon
                              data-icon="inline-start"
                              strokeWidth={1.75}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate">
                                {typeof feature.properties.name === "string" &&
                                feature.properties.name.trim()
                                  ? feature.properties.name
                                  : `Đối tượng ${index + 1}`}
                              </span>
                              <span className="block truncate text-xs font-normal text-muted-foreground">
                                {geometryLabel(feature.kind)}
                              </span>
                            </span>
                          </Button>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </aside>
              </ResizablePanel>
              <ResizableHandle withHandle />
            </>
          )}

          <ResizablePanel id="map-workspace" minSize="420px">
            <ResizablePanelGroup orientation="vertical">
              <ResizablePanel id="map" minSize="360px">
                <section
                  className="relative h-full min-h-0 min-w-0 bg-surface-subtle"
                  aria-label="Không gian bản đồ"
                >
                  <EditorMapCanvas
                    activeTool={tool}
                    restore={restore}
                    focusRequest={focusRequest}
                    deleteRequest={deleteRequest}
                    command={editorCommand}
                    onSelectionChange={setSelectedId}
                    onSnapshot={handleSnapshot}
                    onHistoryChange={setHistory}
                    onError={setMapError}
                  />

                  <TooltipProvider delayDuration={300}>
                    <nav
                      className="absolute left-3 top-3 flex flex-col gap-1 rounded-map-control border bg-surface p-1 map-control-shadow"
                      aria-label="Công cụ vẽ"
                    >
                      {!featureListOpen && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Mở danh sách đối tượng"
                              onClick={() => setFeatureListOpen(true)}
                            >
                              <PanelLeftOpen strokeWidth={1.75} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right">
                            Mở danh sách đối tượng
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {availableTools.map(({ id, label, icon: Icon }) => (
                        <Tooltip key={id}>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant={tool === id ? "subtle" : "ghost"}
                              size="icon-sm"
                              aria-label={label}
                              aria-pressed={tool === id}
                              onClick={() => setTool(id)}
                            >
                              <Icon strokeWidth={1.75} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="right">{label}</TooltipContent>
                        </Tooltip>
                      ))}
                      <Separator className="my-1" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={!history.canUndo}
                            onClick={() =>
                              setEditorCommand((current) => ({
                                version: current.version + 1,
                                type: "undo",
                              }))
                            }
                            aria-label="Hoàn tác"
                          >
                            <Undo2 strokeWidth={1.75} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          Hoàn tác (Ctrl/Cmd+Z)
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={!history.canRedo}
                            onClick={() =>
                              setEditorCommand((current) => ({
                                version: current.version + 1,
                                type: "redo",
                              }))
                            }
                            aria-label="Làm lại"
                          >
                            <Redo2 strokeWidth={1.75} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          Làm lại (Ctrl/Cmd+Shift+Z)
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={selectedId === null}
                            onClick={() => {
                              if (selectedId === null) return;
                              setEditorCommand((current) => ({
                                version: current.version + 1,
                                type: "duplicate",
                                featureId: String(selectedId),
                              }));
                            }}
                            aria-label="Nhân bản đối tượng đã chọn"
                          >
                            <Copy strokeWidth={1.75} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          Nhân bản đối tượng đã chọn
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={selectedId === null}
                            onClick={() =>
                              setDeleteRequest((value) => value + 1)
                            }
                            aria-label="Xóa đối tượng đã chọn"
                          >
                            <Trash2
                              className="text-destructive"
                              strokeWidth={1.75}
                            />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          {selectedId === null
                            ? "Chọn một đối tượng trước khi xóa"
                            : "Xóa đối tượng đã chọn"}
                        </TooltipContent>
                      </Tooltip>
                    </nav>
                  </TooltipProvider>

                  <div className="absolute right-3 top-3 flex max-w-[calc(100%-4.5rem)] flex-wrap justify-end gap-2">
                    <EditorSyncStatus
                      phase={syncIssues.length ? "issues" : syncPhase}
                      hasLocalChanges={dirty}
                      pendingCount={pendingSyncCount}
                      issues={syncIssues}
                      remoteChanges={remoteChanges}
                      onKeepServer={keepServerVersion}
                      onRetryLocal={retryLocalVersion}
                    />
                    {!inspectorOpen && (
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="map-control-shadow"
                        aria-label="Mở bảng thông tin"
                        onClick={() => setInspectorOpen(true)}
                      >
                        <PanelRightOpen strokeWidth={1.75} />
                      </Button>
                    )}
                  </div>

                  {mapError && (
                    <div
                      className="absolute left-16 top-3 max-w-[min(24rem,calc(100%-5rem))] rounded-control border bg-surface p-3 text-sm map-control-shadow"
                      role="alert"
                    >
                      <div className="flex gap-2">
                        <Info
                          className="shrink-0 text-warning"
                          strokeWidth={1.75}
                        />
                        <span>{mapError}</span>
                      </div>
                    </div>
                  )}

                  <div className="absolute bottom-3 left-3 rounded-control bg-surface px-2.5 py-1.5 text-xs text-muted-foreground map-control-shadow">
                    Bán kính được tính bằng mét
                  </div>
                  {!tableOpen && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="absolute bottom-3 right-3 map-control-shadow"
                      aria-label="Mở bảng dữ liệu"
                      aria-expanded="false"
                      onClick={() => setTableOpen(true)}
                    >
                      <TableProperties
                        data-icon="inline-start"
                        strokeWidth={1.75}
                      />
                      Bảng dữ liệu
                      <Badge>{featureRows.length}</Badge>
                    </Button>
                  )}
                </section>
              </ResizablePanel>

              {tableOpen && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="feature-table"
                    defaultSize="28%"
                    minSize="140px"
                    maxSize="48%"
                    groupResizeBehavior="preserve-pixel-size"
                  >
                    <section
                      className="flex h-full min-h-0 flex-col bg-surface"
                      aria-label="Bảng dữ liệu đối tượng"
                    >
                      <div className="flex min-h-11 items-center gap-2 border-b px-3">
                        <TableProperties
                          className="shrink-0"
                          strokeWidth={1.75}
                        />
                        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
                          Bảng dữ liệu
                        </h2>
                        <Badge>{featureRows.length}</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-expanded="true"
                          onClick={() => setTableOpen(false)}
                        >
                          Thu gọn
                        </Button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-auto">
                        <Table className="min-w-[520px] text-xs">
                          <TableHeader className="sticky top-0 bg-surface-subtle">
                            <TableRow>
                              <TableHead className="w-16">STT</TableHead>
                              <TableHead>Tên đối tượng</TableHead>
                              <TableHead>Loại hình học</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {featureRows.map((feature, index) => (
                              <TableRow
                                key={String(feature.id)}
                                tabIndex={0}
                                data-state={
                                  String(selectedId) === String(feature.id)
                                    ? "selected"
                                    : undefined
                                }
                                aria-label={`Chọn ${typeof feature.properties.name === "string" && feature.properties.name.trim() ? feature.properties.name : `đối tượng ${index + 1}`}`}
                                onClick={() =>
                                  selectAndFocusFeature(feature.id)
                                }
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    selectAndFocusFeature(feature.id);
                                  }
                                }}
                              >
                                <TableCell className="font-mono text-muted-foreground">
                                  {index + 1}
                                </TableCell>
                                <TableCell className="max-w-64 truncate font-medium">
                                  {typeof feature.properties.name ===
                                    "string" && feature.properties.name.trim()
                                    ? feature.properties.name
                                    : "Chưa đặt tên"}
                                </TableCell>
                                <TableCell>
                                  {geometryLabel(feature.kind)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </section>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </ResizablePanel>

          {inspectorOpen && (
            <>
              <ResizableHandle withHandle />
              <ResizablePanel
                id="feature-inspector"
                defaultSize="24%"
                minSize="260px"
                maxSize="380px"
                groupResizeBehavior="preserve-pixel-size"
                className="min-w-0 bg-surface"
              >
                <aside
                  className="flex h-full min-w-0 flex-col"
                  aria-label="Thông tin đối tượng và gửi duyệt"
                >
                  <div className="flex min-h-12 items-start gap-2 border-b px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold">
                        Thông tin đối tượng
                      </h2>
                      <p className="truncate text-xs text-muted-foreground">
                        {selectedLogicalFeature
                          ? "Chỉnh sửa thuộc tính của đối tượng đang chọn"
                          : "Chọn một đối tượng trên bản đồ hoặc trong danh sách"}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Thu gọn bảng thông tin"
                      onClick={() => setInspectorOpen(false)}
                    >
                      <PanelRightClose strokeWidth={1.75} />
                    </Button>
                  </div>
                  <ScrollArea className="min-h-0 flex-1">
                    <div className="flex flex-col gap-4 p-4">
                      {error !== null && (
                        <AdminErrorNotice error={error} onRetry={load} />
                      )}
                      {success && (
                        <p
                          className="rounded-control bg-success/10 p-3 text-sm text-success"
                          role="status"
                        >
                          {success}
                        </p>
                      )}
                      {(bundle.truncated || unsupported > 0) && (
                        <p className="rounded-control bg-warning/10 p-3 text-xs leading-5 text-warning">
                          {bundle.truncated
                            ? "Lớp có nhiều dữ liệu hơn khả năng tải an toàn của trình biên tập. Chức năng lưu tạm khóa để tránh mất dữ liệu. "
                            : ""}
                          {unsupported > 0
                            ? `${unsupported} đối tượng chưa thể chỉnh sửa bằng công cụ vẽ hiện tại.`
                            : ""}
                        </p>
                      )}
                      {fieldValidationErrors.length > 0 && (
                        <div className="rounded-control bg-destructive/10 p-3 text-xs leading-5 text-destructive">
                          <p className="font-medium">
                            Cần sửa thông tin trước khi lưu
                          </p>
                          <ul className="mt-1 list-disc pl-4">
                            {fieldValidationErrors
                              .slice(0, 3)
                              .map((message) => (
                                <li key={message}>{message}</li>
                              ))}
                          </ul>
                        </div>
                      )}
                      <FeaturePropertiesEditor
                        key={`${selectedLogicalFeature?.id ?? "none"}:${JSON.stringify(selectedLogicalFeature?.properties ?? {})}`}
                        featureId={selectedLogicalFeature?.id ?? null}
                        properties={selectedLogicalFeature?.properties ?? null}
                        fields={bundle.fields}
                        onPatch={(properties) => {
                          if (!selectedLogicalFeature) return;
                          setEditorCommand((current) => ({
                            version: current.version + 1,
                            type: "properties",
                            featureId: selectedLogicalFeature.id,
                            properties,
                          }));
                        }}
                      />

                      <Separator />

                      <section aria-labelledby="review-heading">
                        <h2
                          id="review-heading"
                          className="text-sm font-semibold"
                        >
                          Chuẩn bị gửi duyệt
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground">
                          Mô tả ngắn nội dung đã thay đổi để người kiểm duyệt dễ
                          đối chiếu.
                        </p>
                        <FieldGroup className="mt-4 gap-4">
                          <Field
                            data-invalid={summary.length > 0 && !summary.trim()}
                          >
                            <FieldLabel htmlFor="summary">
                              Tóm tắt thay đổi
                            </FieldLabel>
                            <Input
                              id="summary"
                              value={summary}
                              aria-invalid={
                                summary.length > 0 && !summary.trim()
                              }
                              onChange={(event) => {
                                setSummary(event.target.value);
                                workflowKeyRef.current = null;
                              }}
                              placeholder="Ví dụ: Cập nhật vị trí ba trụ sở"
                            />
                            <FieldDescription>
                              Bắt buộc trước khi gửi duyệt.
                            </FieldDescription>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="reviewer-note">
                              Ghi chú cho người kiểm duyệt
                            </FieldLabel>
                            <Textarea
                              id="reviewer-note"
                              className="min-h-24 resize-y"
                              value={reviewerNote}
                              onChange={(event) => {
                                setReviewerNote(event.target.value);
                                workflowKeyRef.current = null;
                              }}
                              placeholder="Thông tin cần lưu ý khi kiểm tra (không bắt buộc)"
                            />
                          </Field>
                        </FieldGroup>
                      </section>

                      <p className="rounded-control bg-surface-subtle p-3 text-xs leading-5 text-muted-foreground">
                        Phiên bản {bundle.revision.revisionNo}, gồm{" "}
                        {bundle.fields.length} trường thông tin và{" "}
                        {bundle.workspace.featureCount} đối tượng.
                      </p>
                      {dirty && selectedFeature && (
                        <p className="rounded-control bg-warning/10 p-3 text-xs leading-5 text-warning">
                          Lưu thay đổi lên máy chủ trước khi cập nhật tệp đính
                          kèm.
                        </p>
                      )}
                      <Separator />
                      <FeatureAttachmentPanel
                        principalId={principal.id}
                        revisionId={revisionId}
                        feature={selectedFeature}
                        fields={bundle.fields}
                        etag={bundle.etag}
                        auth={{ csrfToken }}
                        disabled={dirty || busy !== null}
                        onFeatureChanged={attachmentChanged}
                      />
                    </div>
                  </ScrollArea>
                </aside>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
        {recoveredDraft && (
          <div
            className="absolute left-1/2 top-3 z-20 flex w-[min(42rem,calc(100%-1.5rem))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-panel border border-primary/20 bg-surface p-3 map-panel-shadow"
            role="status"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary">
              <History strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {recoveryMatches || ledgerCanRecover
                  ? "Tìm thấy bản nháp chưa đồng bộ"
                  : "Bản nháp dựa trên dữ liệu máy chủ cũ"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {recoveryMatches || ledgerCanRecover
                  ? `Đã lưu trên thiết bị lúc ${new Date(recoveredDraft.updatedAt).toLocaleString("vi-VN")}`
                  : "Dữ liệu đã có thay đổi mới. Tải bản nháp về để đối chiếu trước khi bỏ; không thể khôi phục trực tiếp."}
              </p>
            </div>
            {!recoveryMatches && !ledgerCanRecover && (
              <Button
                size="sm"
                variant="outline"
                onClick={exportRecoveredDraft}
              >
                Tải bản nháp
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={ledgerCanRecover}
              title={
                ledgerCanRecover
                  ? "Lưu hoặc xử lý các thay đổi đang chờ trước khi bỏ bản nháp"
                  : undefined
              }
              onClick={discardDraft}
            >
              Bỏ bản nháp
            </Button>
            <Button
              size="sm"
              disabled={!recoveryMatches && !ledgerCanRecover}
              onClick={resumeDraft}
            >
              Khôi phục
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
