"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  IconArchive,
  IconArrowDown,
  IconArrowUp,
  IconEdit,
  IconEye,
  IconFileImport,
  IconPlus,
  IconSearch,
  IconSettings,
} from "@tabler/icons-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  getDesktopAuthoringCapability,
  getServerDesktopAuthoringCapability,
  subscribeDesktopAuthoringCapability,
} from "@/lib/admin/authoring-capability";
import { AdminApiError } from "@/lib/api/admin";
import {
  archiveLayerGroup,
  getLayerGroupVersion,
  listLayerCatalog,
  listLayerGroupCatalog,
  reorderCatalogLayers,
  reorderLayerGroups,
  type LayerCatalogPage,
  type LayerGroupCatalogPage,
} from "@/lib/api/layer-configuration";

const statusLabels: Record<string, string> = { draft: "Bản nháp", in_review: "Chờ duyệt", approved: "Đã duyệt", changes_requested: "Cần chỉnh sửa", publishing: "Đang công bố", published: "Đã công bố", unconfigured: "Chưa cấu hình" };

function Status({ value }: { value: string }) {
  const className = value === "published" ? "bg-emerald-50 text-success" : value === "in_review" || value === "approved" ? "bg-amber-50 text-warning" : "bg-surface-subtle text-muted-foreground";
  return <Badge className={className}>{statusLabels[value] ?? value}</Badge>;
}

function move<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

export interface LayerCatalogTransport {
  listLayers: typeof listLayerCatalog;
  listGroups: typeof listLayerGroupCatalog;
  reorderLayers: typeof reorderCatalogLayers;
  reorderGroups: typeof reorderLayerGroups;
  getGroupVersion: typeof getLayerGroupVersion;
  archiveGroup: typeof archiveLayerGroup;
}

const defaultTransport: LayerCatalogTransport = {
  listLayers: listLayerCatalog,
  listGroups: listLayerGroupCatalog,
  reorderLayers: reorderCatalogLayers,
  reorderGroups: reorderLayerGroups,
  getGroupVersion: getLayerGroupVersion,
  archiveGroup: archiveLayerGroup,
};

export function LayerCatalogManager({ transport = defaultTransport }: { transport?: LayerCatalogTransport }) {
  const { principal, csrfToken } = useAdminSession();
  const canAuthor = useSyncExternalStore(subscribeDesktopAuthoringCapability, getDesktopAuthoringCapability, getServerDesktopAuthoringCapability);
  const canManage = principal.role === "editor" && canAuthor;
  const [includeArchived, setIncludeArchived] = useState(false);
  const [layers, setLayers] = useState<LayerCatalogPage | null>(null);
  const [groups, setGroups] = useState<LayerGroupCatalogPage | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [confirmGroupId, setConfirmGroupId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const operationKeys = useRef(new Map<string, { fingerprint: string; operationKey: string }>());
  const groupArchiveVersions = useRef(new Map<string, { etag: string; operationKey: string }>());
  const requiresReload = error instanceof AdminApiError && (error.status === 409 || error.status === 412);

  const key = useCallback((action: string, fingerprint: string) => {
    const existing = operationKeys.current.get(action);
    if (existing?.fingerprint === fingerprint) return existing.operationKey;
    const created = crypto.randomUUID();
    operationKeys.current.set(action, { fingerprint, operationKey: created });
    return created;
  }, []);

  const reload = useCallback(() => {
    operationKeys.current.clear();
    groupArchiveVersions.current.clear();
    setConfirmGroupId(null);
    setLoading(true);
    setError(null);
    setReloadVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const activeLayers = transport.listLayers(false, controller.signal);
    const activeGroups = transport.listGroups(false, controller.signal);
    const layerRequest = includeArchived ? transport.listLayers(true, controller.signal) : activeLayers;
    const groupRequest = includeArchived ? transport.listGroups(true, controller.signal) : activeGroups;
    Promise.all([activeLayers, activeGroups, layerRequest, groupRequest]).then(([activeLayerPage, activeGroupPage, shownLayers, shownGroups]) => {
      if (!active) return;
      setLayers({ items: shownLayers.items, collectionEtag: activeLayerPage.collectionEtag });
      setGroups({ items: shownGroups.items, collectionEtag: activeGroupPage.collectionEtag });
    }).catch((reason: unknown) => { if (active) setError(reason); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [includeArchived, reloadVersion, transport]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("vi");
    return (layers?.items ?? []).filter((layer) => `${layer.title} ${layer.slug}`.toLocaleLowerCase("vi").includes(needle));
  }, [layers, query]);

  async function reorder(kind: "layers" | "groups", index: number, direction: -1 | 1) {
    if (!canManage || pending || requiresReload) return;
    if (!layers || !groups) return;
    const action = `reorder-${kind}`;
    setPending(action);
    setError(null);
    try {
      if (kind === "layers") {
        const source = layers.items.filter((item) => !item.archivedAt);
        const next = move(source, index, direction);
        const items = next.map((item, orderIndex) => ({ id: item.id, displayOrder: (orderIndex + 1) * 10 }));
        await transport.reorderLayers(items, { etag: layers.collectionEtag, operationKey: key(action, JSON.stringify({ etag: layers.collectionEtag, items })) }, { csrfToken });
      } else {
        const source = groups.items.filter((item) => !item.archivedAt);
        const next = move(source, index, direction);
        const items = next.map((item, orderIndex) => ({ id: item.id, displayOrder: (orderIndex + 1) * 10 }));
        await transport.reorderGroups(items, { etag: groups.collectionEtag, operationKey: key(action, JSON.stringify({ etag: groups.collectionEtag, items })) }, { csrfToken });
      }
      operationKeys.current.delete(action);
      reload();
    } catch (reason) {
      if (reason instanceof AdminApiError) operationKeys.current.delete(action);
      setError(reason);
    } finally {
      setPending(null);
    }
  }

  async function archiveGroup(groupId: string) {
    if (!canManage || pending || requiresReload) return;
    if (confirmGroupId !== groupId) {
      setConfirmGroupId(groupId);
      return;
    }
    const action = `archive-group-${groupId}`;
    setPending(action);
    setError(null);
    try {
      let version = groupArchiveVersions.current.get(groupId);
      if (!version) {
        const current = await transport.getGroupVersion(groupId);
        version = { etag: current.etag, operationKey: crypto.randomUUID() };
        groupArchiveVersions.current.set(groupId, version);
      }
      await transport.archiveGroup(groupId, version, { csrfToken });
      groupArchiveVersions.current.delete(groupId);
      setConfirmGroupId(null);
      reload();
    } catch (reason) {
      if (reason instanceof AdminApiError) {
        groupArchiveVersions.current.delete(groupId);
        setConfirmGroupId(null);
      }
      setError(reason);
    } finally {
      setPending(null);
    }
  }

  const activeGroups = (groups?.items ?? []).filter((group) => !group.archivedAt);
  const activeLayers = (layers?.items ?? []).filter((layer) => !layer.archivedAt);

  return <main className="mx-auto max-w-[1440px] p-4 pb-24 sm:p-6 md:p-8"><header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Dữ liệu bản đồ</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Lớp dữ liệu</h1><p className="mt-2 text-sm text-muted-foreground">Quản lý catalog, revision và nhóm lớp với phiên bản đồng thời độc lập.</p></div>{principal.role === "editor" && canAuthor ? <Button asChild><Link href="/admin/layers/new"><IconPlus data-icon="inline-start"/>Tạo lớp</Link></Button> : <Button disabled title={principal.role === "editor" ? "Tạo lớp cần desktop" : "Chỉ Editor có quyền tạo lớp"}><IconPlus data-icon="inline-start"/>Tạo lớp</Button>}</header>
    {error !== null && <div className="mt-6"><AdminErrorNotice error={error} onRetry={reload}/></div>}
    <section className="mt-7 rounded-panel border bg-surface p-4 map-panel-shadow sm:p-5" aria-labelledby="group-catalog-title"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="group-catalog-title" className="font-semibold">Nhóm layer</h2><p className="mt-1 text-sm text-muted-foreground">Lưu trữ nhóm sẽ đưa layer con về trạng thái không thuộc nhóm.</p></div><Badge className="bg-surface-subtle text-muted-foreground">{(groups?.items ?? []).length} nhóm</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{(groups?.items ?? []).map((group) => { const activeIndex = activeGroups.findIndex((candidate) => candidate.id === group.id); return <article key={group.id} className="rounded-control border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-medium">{group.title}</h3><p className="mt-1 truncate text-xs text-muted-foreground">{group.slug}</p></div>{group.archivedAt && <Badge className="bg-surface-subtle text-muted-foreground">Đã lưu trữ</Badge>}</div>{canManage && !group.archivedAt && <div className="mt-4 flex flex-wrap gap-1"><Button type="button" size="icon-sm" variant="ghost" aria-label={`Đưa nhóm ${group.title} lên`} disabled={requiresReload || pending !== null || activeIndex <= 0} onClick={() => reorder("groups", activeIndex, -1)}><IconArrowUp/></Button><Button type="button" size="icon-sm" variant="ghost" aria-label={`Đưa nhóm ${group.title} xuống`} disabled={requiresReload || pending !== null || activeIndex < 0 || activeIndex === activeGroups.length - 1} onClick={() => reorder("groups", activeIndex, 1)}><IconArrowDown/></Button><Button type="button" size="sm" variant={confirmGroupId === group.id ? "destructive" : "ghost"} disabled={requiresReload || pending !== null} onClick={() => archiveGroup(group.id)}><IconArchive/>{confirmGroupId === group.id ? "Xác nhận lưu trữ" : "Lưu trữ"}</Button></div>}</article>; })}</div></section>
    <section className="mt-5 rounded-panel border bg-surface"><div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center"><div className="relative flex-1"><IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={19}/><Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-10" placeholder="Tìm tên hoặc mã lớp..." aria-label="Tìm lớp dữ liệu"/></div><label className="flex min-h-10 items-center gap-2 rounded-control border px-3 text-sm"><Checkbox checked={includeArchived} onCheckedChange={(checked) => { setIncludeArchived(checked === true); setLoading(true); }}/><span>Hiện mục đã lưu trữ</span></label></div>
      {loading ? <p className="p-8 text-center text-sm text-muted-foreground" role="status">Đang tải catalog...</p> : visible.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">Không có lớp dữ liệu phù hợp.</p> : <><div className="hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left text-sm"><thead className="bg-surface-subtle text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Tên lớp</th><th className="px-5 py-3 font-medium">Geometry</th><th className="px-5 py-3 font-medium">Trạng thái</th><th className="px-5 py-3 font-medium">Cập nhật</th><th className="w-80 px-5 py-3"><span className="sr-only">Thao tác</span></th></tr></thead><tbody className="divide-y">{visible.map((layer) => { const editable = principal.role === "editor" && canAuthor && layer.status === "draft"; const activeIndex = activeLayers.findIndex((candidate) => candidate.id === layer.id); return <tr key={layer.id} className="hover:bg-surface-subtle"><td className="px-5 py-4"><div className="flex items-center gap-2"><p className="font-medium">{layer.title}</p>{layer.archivedAt && <Badge className="bg-surface-subtle text-muted-foreground">Đã lưu trữ</Badge>}</div><p className="mt-1 text-xs text-muted-foreground">danang:{layer.slug}</p></td><td className="px-5 py-4 capitalize">{layer.geometryMode}</td><td className="px-5 py-4"><Status value={layer.status}/></td><td className="whitespace-nowrap px-5 py-4 text-muted-foreground">{layer.updatedAt ? new Date(layer.updatedAt).toLocaleString("vi-VN") : "—"}</td><td className="px-5 py-4"><div className="flex justify-end gap-1">{canManage && !layer.archivedAt && <><Button type="button" variant="ghost" size="icon-sm" aria-label={`Đưa layer ${layer.title} lên`} disabled={requiresReload || pending !== null || activeIndex <= 0} onClick={() => reorder("layers", activeIndex, -1)}><IconArrowUp/></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`Đưa layer ${layer.title} xuống`} disabled={requiresReload || pending !== null || activeIndex < 0 || activeIndex === activeLayers.length - 1} onClick={() => reorder("layers", activeIndex, 1)}><IconArrowDown/></Button></>}<Button asChild variant="outline" size="sm"><Link href={`/admin/layers/${layer.id}`}><IconSettings/>Cấu hình</Link></Button>{editable && layer.revisionId && <Button asChild variant="outline" size="sm"><Link href={`/admin/layers/${layer.revisionId}/import`}><IconFileImport/>Nhập</Link></Button>}{layer.revisionId && <Button asChild variant="outline" size="sm"><Link href={`/admin/layers/${layer.revisionId}/${editable ? "edit" : "review"}`}>{editable ? <IconEdit/> : <IconEye/>}{editable ? "Biên tập" : "Xem"}</Link></Button>}</div></td></tr>; })}</tbody></table></div>
      <div className="divide-y md:hidden">{visible.map((layer) => <article className="p-4" key={layer.id}><div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">{layer.title}</h2><p className="mt-1 text-xs capitalize text-muted-foreground">{layer.geometryMode} · {layer.slug}</p></div><Status value={layer.status}/></div><div className="mt-4 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href={`/admin/layers/${layer.id}`}><IconSettings/>Cấu hình</Link></Button>{layer.revisionId && <Button asChild variant="outline" size="sm"><Link href={`/admin/layers/${layer.revisionId}/review`}><IconEye/>Xem / duyệt</Link></Button>}</div></article>)}</div></>}
      <footer className="flex items-center justify-between border-t px-5 py-4 text-sm text-muted-foreground"><span>{visible.length} lớp dữ liệu</span><span>{includeArchived ? "Gồm mục đã lưu trữ" : "Catalog hiện hành"}</span></footer></section>
  </main>;
}
