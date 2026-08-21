"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconArrowLeft, IconCheck, IconCloudUpload, IconMessage, IconPolygon, IconX } from "@tabler/icons-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { ReviewMapPreview } from "@/components/admin/review-map-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveRevision, loadRevisionBundle, publishRevision, requestRevisionChanges, type RevisionBundle } from "@/lib/api/admin";

const publishingQuery = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
function subscribePublishing(callback: () => void) { const media = window.matchMedia(publishingQuery); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }
function getPublishing() { return window.matchMedia(publishingQuery).matches; }
function getServerPublishing() { return false; }

export function RevisionReview({ revisionId }: { revisionId: string }) {
  const { principal, csrfToken } = useAdminSession();
  const canPublishHere = useSyncExternalStore(subscribePublishing, getPublishing, getServerPublishing);
  const [bundle, setBundle] = useState<RevisionBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [comment, setComment] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "changes" | "publish" | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const operationKeys = useRef<Record<string, string>>({});
  const operationKey = (action: string) => operationKeys.current[action] ??= crypto.randomUUID();
  const load = useCallback(() => { setLoading(true); setError(null); loadRevisionBundle(revisionId).then(setBundle).catch(setError).finally(() => setLoading(false)); }, [revisionId]);
  useEffect(() => {
    let active = true;
    loadRevisionBundle(revisionId).then((next) => { if (active) setBundle(next); }).catch((reason: unknown) => { if (active) setError(reason); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revisionId]);

  async function mutate(action: "approve" | "changes" | "publish") {
    setBusy(action); setError(null); setSuccess(null);
    try {
      if (action === "approve") await approveRevision(revisionId, comment.trim(), operationKey(action), { csrfToken });
      if (action === "changes") await requestRevisionChanges(revisionId, comment.trim(), operationKey(action), { csrfToken });
      if (action === "publish") await publishRevision(revisionId, releaseNote.trim(), operationKey(action), { csrfToken });
      setSuccess(action === "approve" ? "Đã duyệt revision." : action === "changes" ? "Đã trả revision cho Editor." : "Đã bắt đầu công bố revision.");
      delete operationKeys.current[action];
      if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true") load();
    } catch (reason) { setError(reason); } finally { setBusy(null); }
  }

  if (loading || !bundle) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6">{error ? <div className="max-w-lg"><AdminErrorNotice error={error} onRetry={load}/></div> : <p className="text-sm text-muted-foreground" role="status">Đang tải revision...</p>}</main>;
  const reviewerActions = principal.role === "reviewer" && bundle.revision.status === "in_review";
  const publisherAction = principal.role === "publisher" && bundle.revision.status === "approved";
  return <main className="min-h-[100dvh] bg-surface-subtle pb-40"><header className="sticky top-0 z-10 flex min-h-16 items-center gap-3 border-b bg-surface px-4"><Button asChild variant="ghost" size="icon-sm"><Link href="/admin/layers" aria-label="Quay lại"><IconArrowLeft stroke={1.75}/></Link></Button><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-semibold">{bundle.revision.title}</h1><p className="text-xs text-muted-foreground">Revision #{bundle.revision.revisionNo} · {bundle.revision.id}</p></div><Badge>{bundle.revision.status}</Badge></header>
  <div className="mx-auto grid max-w-5xl gap-4 p-4 md:grid-cols-[1.25fr_0.75fr] md:p-6"><section className="overflow-hidden rounded-panel border bg-surface"><ReviewMapPreview revision={bundle.revision} features={bundle.features}/><div className="border-t p-4"><h2 className="font-semibold">Nội dung revision</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{bundle.revision.description || "Không có mô tả."}</p><div className="mt-4 grid grid-cols-2 gap-2 text-center"><div className="rounded-control bg-accent-subtle p-3"><strong className="block text-lg text-primary">{bundle.workspace.featureCount}</strong><span className="text-xs text-muted-foreground">Đối tượng</span></div><div className="rounded-control bg-surface-subtle p-3"><strong className="block text-lg">{bundle.fields.length}</strong><span className="text-xs text-muted-foreground">Trường metadata</span></div></div></div></section>
  <aside className="space-y-4"><section className="rounded-panel border bg-surface p-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-control bg-accent-subtle text-primary"><IconPolygon stroke={1.75}/></span><div><h2 className="text-sm font-semibold">Workspace server</h2><p className="text-xs text-muted-foreground">WGS84 · đơn vị bán kính mét</p></div></div><dl className="mt-4 divide-y text-sm"><div className="flex justify-between py-3"><dt className="text-muted-foreground">Người tạo</dt><dd className="max-w-[12rem] truncate font-medium">{bundle.revision.createdBy}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Cập nhật</dt><dd className="font-medium">{new Date(bundle.revision.updatedAt).toLocaleString("vi-VN")}</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">ETag</dt><dd className="max-w-[12rem] truncate font-mono text-xs">{bundle.etag}</dd></div></dl></section>
  {error !== null && <AdminErrorNotice error={error}/>} {success && <p className="rounded-control bg-emerald-50 p-3 text-sm text-success" role="status">{success}</p>}
  {reviewerActions && <section className="rounded-panel border bg-surface p-4"><label htmlFor="review-comment" className="text-sm font-semibold">Bình luận review</label><textarea id="review-comment" className="mt-3 min-h-24 w-full resize-y rounded-control border bg-surface p-3 text-sm" value={comment} onChange={(event) => { setComment(event.target.value); delete operationKeys.current.approve; delete operationKeys.current.changes; }} placeholder="Bắt buộc khi yêu cầu chỉnh sửa"/><p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><IconMessage size={16}/>Bình luận duyệt có thể để trống.</p></section>}
  {publisherAction && <section className="rounded-panel border bg-surface p-4"><label htmlFor="release-note" className="text-sm font-semibold">Ghi chú công bố</label><textarea id="release-note" className="mt-3 min-h-24 w-full resize-y rounded-control border bg-surface p-3 text-sm" value={releaseNote} onChange={(event) => { setReleaseNote(event.target.value); delete operationKeys.current.publish; }} placeholder="Mô tả dữ liệu được công bố"/>{!canPublishHere && <p className="mt-3 text-xs leading-5 text-warning">Publisher chỉ có thể công bố trên desktop có thiết bị trỏ chính xác.</p>}</section>}
  {!reviewerActions && !publisherAction && <section className="rounded-panel border bg-surface p-4 text-sm text-muted-foreground">Revision đang ở chế độ chỉ đọc đối với vai trò {principal.role.replace("_", " ")}.</section>}</aside></div>
  {(reviewerActions || publisherAction) && <div className="fixed inset-x-0 bottom-16 z-20 border-t bg-surface p-3 md:bottom-0 md:left-60"><div className="mx-auto flex max-w-5xl gap-2">{reviewerActions && <><Button disabled={!comment.trim() || busy !== null} onClick={() => mutate("changes")} variant="outline" className="flex-1 text-destructive"><IconX stroke={1.75}/>{busy === "changes" ? "Đang gửi..." : "Yêu cầu chỉnh sửa"}</Button><Button disabled={busy !== null} onClick={() => mutate("approve")} className="flex-1"><IconCheck stroke={1.75}/>{busy === "approve" ? "Đang duyệt..." : "Duyệt thay đổi"}</Button></>}{publisherAction && <Button disabled={!canPublishHere || !releaseNote.trim() || busy !== null} onClick={() => mutate("publish")} className="flex-1"><IconCloudUpload stroke={1.75}/>{busy === "publish" ? "Đang công bố..." : "Công bố revision"}</Button>}</div></div>}
  </main>;
}
