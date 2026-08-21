"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconEdit, IconEye, IconFileImport, IconPlus, IconSearch } from "@tabler/icons-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listAdminLayers, type AdminLayer } from "@/lib/api/admin";

const statusLabels: Record<string, string> = { draft: "Bản nháp", in_review: "Chờ duyệt", approved: "Đã duyệt", changes_requested: "Cần chỉnh sửa", publishing: "Đang công bố", published: "Đã công bố" };

function Status({ value }: { value: string }) {
  const className = value === "published" ? "bg-emerald-50 text-success" : value === "in_review" || value === "approved" ? "bg-amber-50 text-warning" : "bg-surface-subtle text-muted-foreground";
  return <Badge className={className}>{statusLabels[value] ?? value}</Badge>;
}

export default function LayersPage() {
  const { principal } = useAdminSession();
  const [layers, setLayers] = useState<AdminLayer[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    setLoading(true); setError(null);
    listAdminLayers().then(setLayers).catch(setError).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    let active = true;
    listAdminLayers().then((next) => { if (active) setLayers(next); }).catch((reason: unknown) => { if (active) setError(reason); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const visible = useMemo(() => layers.filter((layer) => `${layer.title} ${layer.slug}`.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"))), [layers, query]);

  return <main className="mx-auto max-w-[1440px] p-4 pb-24 sm:p-6 md:p-8"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Dữ liệu bản đồ</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Lớp dữ liệu</h1><p className="mt-2 text-sm text-muted-foreground">Catalog thật từ hệ thống, theo revision mới nhất của từng lớp.</p></div><div className="hidden gap-2 md:flex"><Button disabled title="Import API đang được hoàn thiện" variant="outline"><IconFileImport stroke={1.75}/>Nhập dữ liệu</Button><Button disabled title="API tạo lớp chưa được mở trong contract hiện tại"><IconPlus stroke={1.75}/>Tạo lớp</Button></div></header>
  {error !== null && <div className="mt-6"><AdminErrorNotice error={error} onRetry={load}/></div>}
  <section className="mt-7 rounded-panel border bg-surface"><div className="border-b p-4"><div className="relative"><IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={19} stroke={1.75}/><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-10" placeholder="Tìm tên hoặc mã lớp..." aria-label="Tìm lớp dữ liệu"/></div></div>
  {loading ? <p className="p-8 text-center text-sm text-muted-foreground" role="status">Đang tải catalog...</p> : !error && visible.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Không có lớp dữ liệu phù hợp.</p> : <><div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left text-sm"><thead className="bg-surface-subtle text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Tên lớp</th><th className="px-5 py-3 font-medium">Geometry</th><th className="px-5 py-3 font-medium">Revision</th><th className="px-5 py-3 font-medium">Trạng thái</th><th className="px-5 py-3 font-medium">Cập nhật</th><th className="w-28 px-5 py-3"><span className="sr-only">Thao tác</span></th></tr></thead><tbody className="divide-y">{visible.map((layer) => { const editable = principal.role === "editor" && (layer.status === "draft" || layer.status === "changes_requested"); const href = layer.revisionId ? `/admin/layers/${layer.revisionId}/${editable ? "edit" : "review"}` : null; return <tr key={layer.id} className="hover:bg-surface-subtle"><td className="px-5 py-4"><p className="font-medium">{layer.title}</p><p className="mt-1 text-xs text-muted-foreground">danang:{layer.slug}</p></td><td className="px-5 py-4 capitalize">{layer.geometryMode}</td><td className="px-5 py-4 font-mono text-xs">{layer.revisionId ? layer.revisionId.slice(0, 8) : "—"}</td><td className="px-5 py-4"><Status value={layer.status}/></td><td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{new Date(layer.updatedAt).toLocaleString("vi-VN")}</td><td className="px-5 py-4 text-right">{href ? <Button asChild variant="outline" size="sm"><Link href={href}>{editable ? <IconEdit stroke={1.75}/> : <IconEye stroke={1.75}/>} {editable ? "Biên tập" : "Xem"}</Link></Button> : <span className="text-xs text-muted-foreground">Chưa có revision</span>}</td></tr>; })}</tbody></table></div>
  <div className="divide-y md:hidden">{visible.map((layer) => <article className="p-4" key={layer.id}><div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">{layer.title}</h2><p className="mt-1 text-xs capitalize text-muted-foreground">{layer.geometryMode} · {layer.slug}</p></div><Status value={layer.status}/></div><div className="mt-4 flex items-center justify-between text-xs text-muted-foreground"><span>{new Date(layer.updatedAt).toLocaleDateString("vi-VN")}</span>{layer.revisionId && <Button asChild variant="outline" size="sm"><Link href={`/admin/layers/${layer.revisionId}/review`}><IconEye stroke={1.75}/>Xem / duyệt</Link></Button>}</div></article>)}</div></>}
  <footer className="flex items-center justify-between border-t px-5 py-4 text-sm text-muted-foreground"><span>{visible.length} lớp dữ liệu</span><span>Catalog hiện tại</span></footer></section></main>;
}
