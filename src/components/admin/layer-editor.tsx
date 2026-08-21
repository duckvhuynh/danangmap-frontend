"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { IconArrowLeft, IconCircle, IconCloudUpload, IconDeviceFloppy, IconFileImport, IconInfoCircle, IconLine, IconMapPin, IconPointer, IconPolygon, IconRestore, IconTable, IconTrash } from "@tabler/icons-react";
import type { DrawTool } from "@/components/admin/editor-map-canvas";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createAdminFeature, deleteAdminFeature, loadRevisionBundle, submitRevision, updateAdminFeature, type RevisionBundle } from "@/lib/api/admin";
import { draftDb, draftKey, draftMatchesWorkspace, shouldAutosaveDraft, type LayerDraft } from "@/lib/editor/draft-db";
import { adminFeatureToTerra, decodeTerraFeature, diffEditorFeatures } from "@/lib/editor/editor-sync";
import { cn } from "@/lib/utils";

const EditorMapCanvas = dynamic(() => import("@/components/admin/editor-map-canvas"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-surface-subtle"/> });
const tools: Array<{ id: DrawTool; label: string; icon: typeof IconPointer }> = [{ id: "select", label: "Chọn và sửa", icon: IconPointer }, { id: "point", label: "Vẽ điểm", icon: IconMapPin }, { id: "linestring", label: "Vẽ đường", icon: IconLine }, { id: "polygon", label: "Vẽ vùng", icon: IconPolygon }, { id: "circle", label: "Vẽ đường tròn", icon: IconCircle }];
const authoringQuery = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
function subscribeAuthoringCapability(callback: () => void) { const media = window.matchMedia(authoringQuery); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }
function getAuthoringCapability() { return window.matchMedia(authoringQuery).matches; }
function getServerAuthoringCapability() { return false; }

function MobileCapabilityGate({ revisionId }: { revisionId: string }) {
  return <main className="min-h-[100dvh] bg-surface-subtle p-4 pb-24"><div className="mx-auto max-w-lg"><Button asChild variant="ghost" className="-ml-3"><Link href="/admin/layers"><IconArrowLeft stroke={1.75}/>Lớp dữ liệu</Link></Button><section className="mt-6 rounded-panel border bg-surface p-6"><span className="grid size-12 place-items-center rounded-map-control bg-accent-subtle text-primary"><IconInfoCircle stroke={1.75}/></span><h1 className="mt-5 text-xl font-semibold">Biên tập cần desktop có con trỏ chính xác</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Vẽ và sửa geometry yêu cầu viewport desktop, thiết bị trỏ chính xác và khả năng hover.</p><Button asChild className="mt-6 w-full"><Link href={`/admin/layers/${revisionId}/review`}>Mở chế độ xem / duyệt</Link></Button></section></div></main>;
}

export function LayerEditor({ revisionId }: { revisionId: string }) {
  const canAuthor = useSyncExternalStore(subscribeAuthoringCapability, getAuthoringCapability, getServerAuthoringCapability);
  const { principal, csrfToken } = useAdminSession();
  const [bundle, setBundle] = useState<RevisionBundle | null>(null);
  const [features, setFeatures] = useState<unknown[]>([]);
  const [restore, setRestore] = useState({ version: 0, features: [] as unknown[] });
  const [tool, setTool] = useState<DrawTool>("select");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [deleteRequest, setDeleteRequest] = useState(0);
  const [recoveredDraft, setRecoveredDraft] = useState<LayerDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [operationKeys, setOperationKeys] = useState<Record<string, string>>({});
  const operationKeysRef = useRef(operationKeys);
  const workflowKeyRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(true);
  const [summary, setSummary] = useState("");
  const [reviewerNote, setReviewerNote] = useState("");

  useEffect(() => { operationKeysRef.current = operationKeys; }, [operationKeys]);
  const load = useCallback(() => {
    setLoading(true); setError(null);
    loadRevisionBundle(revisionId).then((next) => {
      setBundle(next);
      const drawable = next.features.flatMap((feature) => { const converted = adminFeatureToTerra(feature); return converted ? [converted] : []; });
      setFeatures(drawable); setRestore((current) => ({ version: current.version + 1, features: drawable })); setDirty(false); setOperationKeys({}); setSuccess(null);
    }).catch(setError).finally(() => setLoading(false));
  }, [revisionId]);
  useEffect(() => {
    let active = true;
    loadRevisionBundle(revisionId).then((next) => {
      if (!active) return;
      setBundle(next);
      const drawable = next.features.flatMap((feature) => { const converted = adminFeatureToTerra(feature); return converted ? [converted] : []; });
      setFeatures(drawable); setRestore((current) => ({ version: current.version + 1, features: drawable })); setDirty(false); setOperationKeys({}); setSuccess(null);
    }).catch((reason: unknown) => { if (active) setError(reason); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revisionId]);

  const draftId = useMemo(() => bundle ? draftKey(principal.id, bundle.workspace.layerId, bundle.revision.revisionNo) : null, [bundle, principal.id]);
  useEffect(() => {
    if (!draftId) return;
    draftDb.drafts.get(draftId).then((draft) => { if (draft) { const immutable = structuredClone(draft); Object.freeze(immutable.features); Object.freeze(immutable); setRecoveredDraft(immutable); } setDraftReady(true); }).catch(() => setDraftReady(true));
  }, [draftId]);

  useEffect(() => {
    if (!bundle || !draftId || !shouldAutosaveDraft({ ready: draftReady, recoveryPending: recoveredDraft !== null, dirty })) return;
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      draftDb.drafts.put({ id: draftId, principalId: principal.id, layerId: bundle.workspace.layerId, draftRevision: bundle.revision.revisionNo, baseRevision: bundle.revision.revisionNo, baseEtag: bundle.etag, serverCursor: bundle.workspace.serverCursor, updatedAt: now, title: bundle.revision.title, description: bundle.revision.description, features, operationKeys }).then(() => { setSavedAt(now); }).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [bundle, draftId, draftReady, features, dirty, operationKeys, principal.id, recoveredDraft]);

  const ensureOperationKeys = useCallback((nextFeatures: unknown[]) => {
    if (!bundle) return;
    const diff = diffEditorFeatures(bundle.features, nextFeatures, bundle.fields.map((field) => field.key));
    const required = diff.creates.map((item) => `create:${item.clientId}`);
    const next = { ...operationKeysRef.current }; let changed = false;
    for (const key of required) if (!next[key]) { next[key] = crypto.randomUUID(); changed = true; }
    if (changed) { operationKeysRef.current = next; setOperationKeys(next); }
  }, [bundle]);

  function featureOperationKey(key: string) {
    const existing = operationKeysRef.current[key];
    if (existing) return existing;
    const generated = crypto.randomUUID();
    const next = { ...operationKeysRef.current, [key]: generated };
    operationKeysRef.current = next; setOperationKeys(next);
    if (draftId) draftDb.drafts.update(draftId, { operationKeys: next }).catch(() => undefined);
    return generated;
  }

  const handleSnapshot = useCallback((next: unknown[]) => {
    setFeatures(next);
    if (!bundle || recoveredDraft) return;
    const diff = diffEditorFeatures(bundle.features, next, bundle.fields.map((field) => field.key));
    const changed = diff.creates.length + diff.updates.length + diff.deletes.length > 0;
    setDirty(changed); if (changed) ensureOperationKeys(next);
  }, [bundle, ensureOperationKeys, recoveredDraft]);

  function resumeDraft() { if (!recoveredDraft) return; const snapshot = structuredClone(recoveredDraft.features); setFeatures(snapshot); setOperationKeys(recoveredDraft.operationKeys ?? {}); operationKeysRef.current = recoveredDraft.operationKeys ?? {}; setRestore((current) => ({ version: current.version + 1, features: snapshot })); setRecoveredDraft(null); setDirty(true); }
  function discardDraft() { if (draftId) draftDb.drafts.delete(draftId).catch(() => undefined); setRecoveredDraft(null); setDirty(false); }
  function exportRecoveredDraft() { if (!recoveredDraft) return; const url = URL.createObjectURL(new Blob([JSON.stringify(recoveredDraft, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `danangmap-draft-${bundle?.revision.id ?? "revision"}.json`; anchor.click(); URL.revokeObjectURL(url); }

  async function saveServer() {
    if (!bundle || !dirty || bundle.truncated || bundle.features.some((feature) => !adminFeatureToTerra(feature))) return;
    setBusy("save"); setError(null); setSuccess(null);
    try {
      const diff = diffEditorFeatures(bundle.features, features, bundle.fields.map((field) => field.key));
      let etag = bundle.etag;
      for (const item of diff.creates) etag = (await createAdminFeature(revisionId, item.dto, etag, featureOperationKey(`create:${item.clientId}`), { csrfToken })).etag;
      for (const item of diff.updates) etag = (await updateAdminFeature(revisionId, item.featureId, item.dto, etag, { csrfToken })).etag;
      for (const item of diff.deletes) etag = (await deleteAdminFeature(revisionId, item.featureId, etag, { csrfToken })).etag;
      if (draftId) await draftDb.drafts.delete(draftId);
      setSuccess("Đã đồng bộ thay đổi lên máy chủ."); load();
    } catch (reason) { setError(reason); } finally { setBusy(null); }
  }

  async function submitForReview() {
    if (!bundle || dirty || !summary.trim()) return;
    setBusy("submit"); setError(null); setSuccess(null);
    workflowKeyRef.current ??= crypto.randomUUID();
    try { await submitRevision(revisionId, summary.trim(), reviewerNote.trim(), workflowKeyRef.current, { csrfToken }); setSuccess("Đã gửi revision cho reviewer."); load(); } catch (reason) { setError(reason); } finally { setBusy(null); }
  }

  if (!canAuthor) return <MobileCapabilityGate revisionId={revisionId}/>;
  if (principal.role !== "editor") return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6"><section className="max-w-lg rounded-panel border bg-surface p-6"><h1 className="text-xl font-semibold">Vai trò hiện tại không thể biên tập</h1><p className="mt-2 text-sm text-muted-foreground">Chỉ tài khoản Editor được thay đổi geometry. Reviewer và Publisher dùng chế độ xem / duyệt.</p><Button asChild className="mt-5"><Link href={`/admin/layers/${revisionId}/review`}>Mở revision</Link></Button></section></main>;
  if (loading || !bundle) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6">{error ? <div className="max-w-lg"><AdminErrorNotice error={error} onRetry={load}/></div> : <p className="text-sm text-muted-foreground" role="status">Đang tải workspace...</p>}</main>;
  if (bundle.revision.status !== "draft") return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6"><section className="max-w-lg rounded-panel border bg-surface p-6"><h1 className="text-xl font-semibold">Revision này được giữ bất biến</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Chỉ successor revision ở trạng thái bản nháp mới có thể biên tập hoặc nhập dữ liệu.</p><Button asChild className="mt-5"><Link href={`/admin/layers/${revisionId}/review`}>Mở chế độ xem / duyệt</Link></Button></section></main>;
  const unsupported = bundle.features.length - bundle.features.flatMap((feature) => adminFeatureToTerra(feature) ? [feature] : []).length;
  const featureRows = features.flatMap((feature) => { const decoded = decodeTerraFeature(feature); return decoded ? [decoded] : []; });
  const canSubmit = bundle.revision.status === "draft" && !dirty && summary.trim().length > 0;
  const recoveryMatches = recoveredDraft ? draftMatchesWorkspace(recoveredDraft, { etag: bundle.etag, serverCursor: bundle.workspace.serverCursor }) : false;

  return <main className="grid h-[100dvh] min-h-[720px] overflow-hidden bg-surface grid-rows-[64px_minmax(0,1fr)]">
    <header className="flex items-center gap-3 border-b bg-surface px-4"><Button asChild variant="ghost" size="icon-sm"><Link href="/admin/layers" aria-label="Quay lại lớp dữ liệu"><IconArrowLeft stroke={1.75}/></Link></Button><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-semibold">{bundle.revision.title}</h1><Badge>{bundle.revision.status} · Rev {bundle.revision.revisionNo}</Badge></div><p className="mt-0.5 text-xs text-muted-foreground">{savedAt ? `Tự lưu thiết bị lúc ${new Date(savedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : `ETag ${bundle.etag}`}</p></div><Button asChild variant="outline"><Link href={`/admin/layers/${revisionId}/import`}><IconFileImport stroke={1.75}/>Nhập file</Link></Button><Button variant="outline" disabled={!dirty || busy !== null || bundle.truncated || unsupported > 0} onClick={saveServer}><IconDeviceFloppy stroke={1.75}/>{busy === "save" ? "Đang lưu..." : "Lưu máy chủ"}</Button><Button disabled={!canSubmit || busy !== null} title={dirty ? "Lưu thay đổi trước khi gửi duyệt" : !summary.trim() ? "Nhập tóm tắt thay đổi" : undefined} onClick={submitForReview}><IconCloudUpload stroke={1.75}/>{busy === "submit" ? "Đang gửi..." : "Gửi duyệt"}</Button></header>
    <div className="relative grid min-h-0 grid-cols-[260px_52px_minmax(360px,1fr)_300px] grid-rows-[minmax(0,1fr)_220px]">
      <aside className="row-span-2 overflow-y-auto border-r bg-surface"><div className="border-b p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Explorer</h2><Badge>{featureRows.length}</Badge></div></div><div className="p-2">{featureRows.map((feature) => <div key={String(feature.id)} className="flex items-center gap-2 rounded-control p-2 text-sm"><IconPolygon className="text-muted-foreground" size={18}/><span className="truncate">{typeof feature.properties.name === "string" ? feature.properties.name : String(feature.id)}</span></div>)}</div></aside>
      <nav className="row-span-2 flex flex-col items-center gap-1 border-r bg-surface p-1.5" aria-label="Công cụ vẽ">{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" title={label} aria-label={label} aria-pressed={tool === id} onClick={() => setTool(id)} className={cn("grid size-10 place-items-center rounded-map-control text-muted-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tool === id && "bg-accent-subtle text-primary")}><Icon size={21} stroke={1.75}/></button>)}<span className="my-1 h-px w-8 bg-border"/><button disabled={selectedId === null} onClick={() => setDeleteRequest((value) => value + 1)} title={selectedId === null ? "Chọn một geometry trước khi xóa" : "Xóa geometry đã chọn"} className="grid size-10 place-items-center rounded-map-control text-destructive disabled:cursor-not-allowed disabled:opacity-40" aria-label="Xóa geometry đã chọn"><IconTrash size={20} stroke={1.75}/></button></nav>
      <section className="relative min-h-0 bg-surface-subtle"><EditorMapCanvas activeTool={tool} restore={restore} deleteRequest={deleteRequest} onSelectionChange={setSelectedId} onSnapshot={handleSnapshot} onError={setMapError}/>{mapError && <div className="absolute left-4 top-4 flex max-w-sm gap-2 rounded-control border bg-surface p-3 text-sm map-control-shadow" role="alert"><IconInfoCircle className="shrink-0 text-warning" size={19}/>{mapError}</div>}<div className="absolute bottom-3 left-3 rounded-control bg-surface px-2.5 py-1.5 text-xs text-muted-foreground map-control-shadow">Đơn vị: mét · Light</div></section>
      <aside className="row-span-2 overflow-y-auto border-l bg-surface"><div className="border-b p-4"><h2 className="text-sm font-semibold">Revision</h2><p className="mt-1 text-xs text-muted-foreground">Schema chỉ đọc trong contract hiện tại</p></div><div className="space-y-4 p-4">{error !== null && <AdminErrorNotice error={error} onRetry={load}/>} {success && <p className="rounded-control bg-emerald-50 p-3 text-sm text-success" role="status">{success}</p>}{(bundle.truncated || unsupported > 0) && <p className="rounded-control bg-amber-50 p-3 text-xs leading-5 text-warning">{bundle.truncated ? "Workspace lớn hơn trang feature API hiện tại; không lưu cho đến khi pagination contract sẵn sàng. " : ""}{unsupported > 0 ? `${unsupported} geometry Multi* chỉ xem, chưa thể sửa bằng Terra Draw.` : ""}</p>}<div><p className="text-xs font-medium">Tên lớp</p><p className="mt-1 text-sm">{bundle.revision.title}</p></div><div><p className="text-xs font-medium">Mô tả</p><p className="mt-1 text-sm leading-5 text-muted-foreground">{bundle.revision.description || "Không có mô tả"}</p></div><div><label htmlFor="summary" className="mb-2 block text-xs font-medium">Tóm tắt thay đổi</label><Input id="summary" value={summary} onChange={(event) => { setSummary(event.target.value); workflowKeyRef.current = null; }} placeholder="Bắt buộc trước khi gửi duyệt"/></div><div><label htmlFor="reviewer-note" className="mb-2 block text-xs font-medium">Ghi chú reviewer</label><textarea id="reviewer-note" className="min-h-20 w-full resize-y rounded-control border bg-surface p-3 text-sm" value={reviewerNote} onChange={(event) => { setReviewerNote(event.target.value); workflowKeyRef.current = null; }}/></div><div className="rounded-control bg-surface-subtle p-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Revision #{bundle.revision.revisionNo}</strong><br/>{bundle.fields.length} trường metadata · {bundle.workspace.featureCount} đối tượng</div></div></aside>
      <section className={cn("col-start-3 row-start-2 overflow-hidden border-t bg-surface", !tableOpen && "h-10 self-end")}><div className="flex h-10 items-center justify-between border-b px-3"><button className="flex items-center gap-2 text-xs font-medium" onClick={() => setTableOpen((value) => !value)}><IconTable size={18}/>Bảng dữ liệu <Badge>{featureRows.length}</Badge></button><span className="text-xs text-muted-foreground">WGS84 · server canonical</span></div>{tableOpen && <div className="overflow-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-surface-subtle text-muted-foreground"><tr><th className="px-3 py-2 font-medium">ID</th><th className="px-3 py-2 font-medium">Tên</th><th className="px-3 py-2 font-medium">Geometry</th></tr></thead><tbody className="divide-y">{featureRows.map((feature) => <tr key={String(feature.id)}><td className="px-3 py-2 font-mono text-muted-foreground">{String(feature.id).slice(0, 12)}</td><td className="px-3 py-2 font-medium">{typeof feature.properties.name === "string" ? feature.properties.name : "—"}</td><td className="px-3 py-2">{feature.properties.mode === "circle" ? "Circle" : feature.geometry.type}</td></tr>)}</tbody></table></div>}</section>
      {recoveredDraft && <div className="absolute left-[328px] right-[316px] top-3 z-20 flex items-center gap-3 rounded-panel border border-primary/20 bg-surface p-3 map-panel-shadow" role="status"><span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary"><IconRestore size={20}/></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{recoveryMatches ? "Tìm thấy bản nháp chưa đồng bộ" : "Bản nháp dựa trên dữ liệu máy chủ cũ"}</p><p className="truncate text-xs text-muted-foreground">{recoveryMatches ? `Lưu trên thiết bị lúc ${new Date(recoveredDraft.updatedAt).toLocaleString("vi-VN")}` : "ETag hoặc server cursor đã thay đổi. Xuất bản nháp để đối chiếu hoặc bỏ bản nháp; không thể khôi phục trực tiếp."}</p></div>{!recoveryMatches && <Button size="sm" variant="outline" onClick={exportRecoveredDraft}>Xuất JSON</Button>}<Button size="sm" variant="ghost" onClick={discardDraft}>Bỏ bản nháp</Button><Button size="sm" disabled={!recoveryMatches} onClick={resumeDraft}>Khôi phục</Button></div>}
    </div>
  </main>;
}
