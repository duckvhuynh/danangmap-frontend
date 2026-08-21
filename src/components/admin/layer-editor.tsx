"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  IconArrowLeft,
  IconCircle,
  IconCloudUpload,
  IconDeviceFloppy,
  IconHistory,
  IconInfoCircle,
  IconLine,
  IconMapPin,
  IconPointer,
  IconPolygon,
  IconRestore,
  IconTable,
  IconTrash,
} from "@tabler/icons-react";
import type { DrawTool } from "@/components/admin/editor-map-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { draftDb, draftKey, shouldAutosaveDraft, type LayerDraft } from "@/lib/editor/draft-db";
import { cn } from "@/lib/utils";

const EditorMapCanvas = dynamic(() => import("@/components/admin/editor-map-canvas"), { ssr: false, loading: () => <div className="h-full animate-pulse bg-surface-subtle" /> });

const tools: Array<{ id: DrawTool; label: string; icon: typeof IconPointer }> = [
  { id: "select", label: "Chọn và sửa", icon: IconPointer },
  { id: "point", label: "Vẽ điểm", icon: IconMapPin },
  { id: "linestring", label: "Vẽ đường", icon: IconLine },
  { id: "polygon", label: "Vẽ vùng", icon: IconPolygon },
  { id: "circle", label: "Vẽ đường tròn", icon: IconCircle },
];

function MobileCapabilityGate({ layerId }: { layerId: string }) {
  return <main className="min-h-[100dvh] bg-surface-subtle p-4 pb-24"><div className="mx-auto max-w-lg"><Button asChild variant="ghost" className="-ml-3"><Link href="/admin/layers"><IconArrowLeft stroke={1.75}/>Lớp dữ liệu</Link></Button><section className="mt-6 rounded-panel border bg-surface p-6"><span className="grid size-12 place-items-center rounded-map-control bg-accent-subtle text-primary"><IconInfoCircle stroke={1.75}/></span><h1 className="mt-5 text-xl font-semibold">Biên tập cần desktop có con trỏ chính xác</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Để bảo đảm độ chính xác geometry và tránh thao tác ngoài ý muốn, vẽ, import, sửa schema và xuất bản yêu cầu viewport desktop, thiết bị trỏ chính xác và khả năng hover.</p><Button asChild className="mt-6 w-full"><Link href={`/admin/layers/${layerId}/review`}>Mở chế độ xem / duyệt</Link></Button><p className="mt-4 text-center text-xs text-muted-foreground">Bạn vẫn có thể xem thay đổi, bình luận, duyệt hoặc yêu cầu chỉnh sửa.</p></section></div></main>;
}

const authoringQuery = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
function subscribeAuthoringCapability(callback: () => void) { const media = window.matchMedia(authoringQuery); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }
function getAuthoringCapability() { return window.matchMedia(authoringQuery).matches; }
function getServerAuthoringCapability() { return false; }

export function LayerEditor({ layerId, principalId }: { layerId: string; principalId: string }) {
  const canAuthor = useSyncExternalStore(subscribeAuthoringCapability, getAuthoringCapability, getServerAuthoringCapability);
  const draftRevision = 20;
  const draftId = useMemo(() => draftKey(principalId, layerId, draftRevision), [layerId, principalId]);
  const [tool, setTool] = useState<DrawTool>("select");
  const [title, setTitle] = useState(layerId === "wards" ? "Ranh giới phường, xã" : "Lớp dữ liệu");
  const [description, setDescription] = useState("Địa giới hành chính thành phố Đà Nẵng sau sắp xếp.");
  const [features, setFeatures] = useState<unknown[]>([]);
  const [restore, setRestore] = useState({ version: 0, features: [] as unknown[] });
  const [recoveredDraft, setRecoveredDraft] = useState<LayerDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tableOpen, setTableOpen] = useState(true);

  useEffect(() => {
    draftDb.drafts.get(draftId).then((draft) => { if (draft) { const immutable = structuredClone(draft); Object.freeze(immutable.features); Object.freeze(immutable); setRecoveredDraft(immutable); } setDraftReady(true); }).catch(() => setDraftReady(true));
  }, [draftId]);

  useEffect(() => {
    if (!shouldAutosaveDraft({ ready: draftReady, recoveryPending: recoveredDraft !== null, dirty })) return;
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      draftDb.drafts.put({ id: draftId, principalId, layerId, draftRevision, baseRevision: 19, updatedAt: now, title, description, features }).then(() => { setSavedAt(now); setDirty(false); }).catch(() => undefined);
    }, 650);
    return () => window.clearTimeout(timer);
  }, [description, dirty, draftId, draftReady, draftRevision, features, layerId, principalId, recoveredDraft, title]);

  const handleSnapshot = useCallback((next: unknown[]) => { setFeatures(next); setDirty(true); }, []);
  const handleMapError = useCallback((message: string) => setMapError(message), []);

  function resumeDraft() {
    if (!recoveredDraft) return;
    setTitle(recoveredDraft.title); setDescription(recoveredDraft.description); setFeatures(recoveredDraft.features);
    setRestore((current) => ({ version: current.version + 1, features: recoveredDraft.features })); setRecoveredDraft(null); setDirty(true);
  }
  function discardDraft() { draftDb.drafts.delete(draftId).catch(() => undefined); setDirty(false); setRecoveredDraft(null); }

  if (!canAuthor) return <MobileCapabilityGate layerId={layerId}/>;
  return <main className="grid h-[100dvh] min-h-[720px] overflow-hidden bg-surface grid-rows-[64px_minmax(0,1fr)]">
    <header className="flex items-center gap-3 border-b bg-surface px-4"><Button asChild variant="ghost" size="icon-sm"><Link href="/admin/layers" aria-label="Quay lại lớp dữ liệu"><IconArrowLeft stroke={1.75}/></Link></Button><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-sm font-semibold">{title}</h1><Badge>Bản nháp · Rev 19</Badge></div><p className="mt-0.5 text-xs text-muted-foreground">{savedAt ? `Đã tự lưu vào thiết bị lúc ${new Date(savedAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}` : "IndexedDB sẽ tự lưu thay đổi trên thiết bị này"}</p></div><Button variant="outline" disabled title="Revision history API chưa được kết nối"><IconHistory stroke={1.75}/>Lịch sử</Button><Button variant="outline" disabled title="Chưa kết nối endpoint lưu bản nháp máy chủ"><IconDeviceFloppy stroke={1.75}/>Lưu máy chủ</Button><Button disabled title="Chưa kết nối endpoint workflow gửi duyệt"><IconCloudUpload stroke={1.75}/>Gửi duyệt</Button></header>
    <div className="relative grid min-h-0 grid-cols-[260px_52px_minmax(360px,1fr)_300px] grid-rows-[minmax(0,1fr)_220px]">
      <aside className="row-span-2 overflow-y-auto border-r bg-surface"><div className="border-b p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Explorer</h2><Badge>56 đối tượng</Badge></div><div className="relative mt-3"><Input className="h-9" placeholder="Tìm đối tượng..." aria-label="Tìm đối tượng trong lớp"/></div></div><div className="p-2"><button className="flex w-full items-center gap-2 rounded-control bg-accent-subtle p-2 text-left text-sm font-medium text-primary"><IconPolygon size={18} stroke={1.75}/>Phường Hải Châu</button>{["Phường An Hải","Phường Sơn Trà","Xã Hòa Vang","Phường Ngũ Hành Sơn"].map((name) => <button key={name} className="flex w-full items-center gap-2 rounded-control p-2 text-left text-sm hover:bg-surface-subtle"><IconPolygon className="text-muted-foreground" size={18} stroke={1.75}/>{name}</button>)}</div></aside>
      <nav className="row-span-2 flex flex-col items-center gap-1 border-r bg-surface p-1.5" aria-label="Công cụ vẽ">{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" title={label} aria-label={label} aria-pressed={tool === id} onClick={() => setTool(id)} className={cn("grid size-10 place-items-center rounded-map-control text-muted-foreground hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", tool === id && "bg-accent-subtle text-primary")}><Icon size={21} stroke={1.75}/></button>)}<span className="my-1 h-px w-8 bg-border"/><button disabled title="Chọn một geometry trước khi xóa" className="grid size-10 cursor-not-allowed place-items-center rounded-map-control text-destructive opacity-40" aria-label="Xóa geometry đã chọn"><IconTrash size={20} stroke={1.75}/></button></nav>
      <section className="relative min-h-0 bg-surface-subtle"><EditorMapCanvas activeTool={tool} restore={restore} onSnapshot={handleSnapshot} onError={handleMapError}/>{mapError && <div className="absolute left-4 top-4 flex max-w-sm gap-2 rounded-control border bg-surface p-3 text-sm map-control-shadow" role="alert"><IconInfoCircle className="shrink-0 text-warning" size={19}/>{mapError}</div>}<div className="absolute bottom-3 left-3 rounded-control bg-surface px-2.5 py-1.5 text-xs text-muted-foreground map-control-shadow">Đơn vị: mét · Light</div></section>
      <aside className="row-span-2 overflow-y-auto border-l bg-surface"><div className="border-b p-4"><h2 className="text-sm font-semibold">Thuộc tính lớp</h2><p className="mt-1 text-xs text-muted-foreground">Schema và hiển thị</p></div><div className="space-y-5 p-4"><div><label htmlFor="layer-title" className="mb-2 block text-xs font-medium">Tên lớp</label><Input id="layer-title" value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }}/></div><div><label htmlFor="layer-description" className="mb-2 block text-xs font-medium">Mô tả</label><textarea id="layer-description" className="min-h-24 w-full resize-y rounded-control border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25" value={description} onChange={(event) => { setDescription(event.target.value); setDirty(true); }}/></div><div><label className="mb-2 block text-xs font-medium">Loại layer</label><select className="h-10 w-full rounded-control border bg-surface px-3 text-sm" disabled title="Schema type sẽ được kết nối sau khi API layer schema sẵn sàng"><option>Mixed</option><option>Point</option><option>Polyline</option><option>Polygon</option></select></div><div><label className="mb-2 block text-xs font-medium">Màu hiển thị</label><div className="flex items-center gap-3 rounded-control border p-2"><span className="size-7 rounded-control bg-primary"/><span className="font-mono text-xs">#1A73E8</span></div></div><div className="rounded-control bg-surface-subtle p-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Revision nền:</strong> #19<br/>Mọi thay đổi chỉ được công bố sau khi reviewer duyệt và publisher xác nhận.</div></div></aside>
      <section className={cn("col-start-3 row-start-2 overflow-hidden border-t bg-surface", !tableOpen && "h-10 self-end")}><div className="flex h-10 items-center justify-between border-b px-3"><button className="flex items-center gap-2 text-xs font-medium" onClick={() => setTableOpen((value) => !value)}><IconTable size={18} stroke={1.75}/>Bảng dữ liệu <Badge>{Math.max(5, features.length)}</Badge></button><span className="text-xs text-muted-foreground">Geometry được tính bằng hệ tọa độ WGS84</span></div>{tableOpen && <div className="overflow-auto"><table className="w-full min-w-[640px] text-left text-xs"><thead className="bg-surface-subtle text-muted-foreground"><tr><th className="px-3 py-2 font-medium">ID</th><th className="px-3 py-2 font-medium">Tên</th><th className="px-3 py-2 font-medium">Loại</th><th className="px-3 py-2 font-medium">Trạng thái</th></tr></thead><tbody className="divide-y">{["Hải Châu","An Hải","Sơn Trà","Hòa Vang","Ngũ Hành Sơn"].map((name, index) => <tr key={name}><td className="px-3 py-2 text-muted-foreground">DN-{String(index + 1).padStart(3,"0")}</td><td className="px-3 py-2 font-medium">{name}</td><td className="px-3 py-2">Polygon</td><td className="px-3 py-2 text-success">Hợp lệ</td></tr>)}</tbody></table></div>}</section>
      {recoveredDraft && <div className="absolute left-[328px] right-[316px] top-3 z-20 flex items-center gap-3 rounded-panel border border-primary/20 bg-surface p-3 map-panel-shadow" role="status"><span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary"><IconRestore size={20} stroke={1.75}/></span><div className="min-w-0 flex-1"><p className="text-sm font-medium">Tìm thấy bản nháp chưa đồng bộ</p><p className="truncate text-xs text-muted-foreground">Lưu trên thiết bị lúc {new Date(recoveredDraft.updatedAt).toLocaleString("vi-VN")}</p></div><Button size="sm" variant="ghost" onClick={discardDraft}>Bỏ bản nháp</Button><Button size="sm" onClick={resumeDraft}>Khôi phục</Button></div>}
    </div>
  </main>;
}
