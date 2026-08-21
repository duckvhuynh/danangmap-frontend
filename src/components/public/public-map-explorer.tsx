"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconBuildingCommunity,
  IconChevronRight,
  IconInfoCircle,
  IconLayersIntersect,
  IconList,
  IconCurrentLocation,
  IconMap,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconShield,
  IconX,
} from "@tabler/icons-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPublicMapData } from "@/lib/api/public-map";
import { sampleMapData } from "@/lib/data/sample-map";
import type { PublicFeature, PublicLayer } from "@/lib/domain/map";
import type { MapCommand } from "@/components/map/public-map-canvas";
import { cn } from "@/lib/utils";

const PublicMapCanvas = dynamic(() => import("@/components/map/public-map-canvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-subtle" role="status" aria-label="Đang tải bản đồ" />,
});

type MobileSheet = "layers" | "list" | "detail" | null;

function layerIcon(layer: PublicLayer) {
  if (layer.id === "police") return IconShield;
  if (layer.type === "point") return IconBuildingCommunity;
  return IconLayersIntersect;
}

function LayerList({ layers, hidden, onToggle }: { layers: PublicLayer[]; hidden: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="space-y-1" aria-label="Danh sách lớp dữ liệu">
      {layers.map((layer) => {
        const Icon = layerIcon(layer);
        const active = !hidden.has(layer.id);
        return (
          <button key={layer.id} type="button" onClick={() => onToggle(layer.id)} aria-pressed={active} className={cn("flex w-full items-center gap-3 rounded-control p-2.5 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "bg-accent-subtle") }>
            <span className="grid size-9 shrink-0 place-items-center rounded-control border bg-surface" style={{ color: layer.color }}><Icon stroke={1.75} size={20} /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{layer.name}</span><span className="block text-xs text-muted-foreground">{layer.featureCount} đối tượng</span></span>
            <span className={cn("size-4 rounded-full border-2", active ? "border-primary bg-primary" : "border-border bg-surface")} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function FeatureRows({ features, onSelect }: { features: PublicFeature[]; onSelect: (id: string) => void }) {
  if (features.length === 0) return <div className="px-2 py-8 text-center text-sm text-muted-foreground">Không tìm thấy đối tượng phù hợp.</div>;
  return (
    <ul className="divide-y" aria-label="Kết quả tra cứu">
      {features.map((feature) => <li key={feature.properties.id}><button className="flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => onSelect(feature.properties.id)}><span className="mt-1 size-2 rounded-full bg-primary" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{feature.properties.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{String(feature.properties.metadata.address ?? feature.properties.kind)}</span></span><IconChevronRight className="mt-1 text-muted-foreground" size={18} stroke={1.75} /></button></li>)}
    </ul>
  );
}

function FeatureDetail({ feature, layer, onClose, showClose = true }: { feature: PublicFeature; layer?: PublicLayer; onClose: () => void; showClose?: boolean }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div><Badge>{feature.properties.kind}</Badge><h2 className="mt-3 text-lg font-semibold leading-6">{feature.properties.name}</h2></div>
        {showClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng thông tin"><IconX stroke={1.75} /></Button>}
      </div>
      <dl className="mt-5 space-y-4 text-sm">
        {layer?.fields.map((field) => { const value = feature.properties.metadata[field.key]; if (value === null || value === undefined || value === "") return null; return <div key={field.key}><dt className="text-muted-foreground">{field.name}</dt><dd className={cn("mt-1 font-medium", field.type === "status" && "text-success")}>{field.type === "phone" ? <a className="text-primary underline-offset-4 hover:underline" href={`tel:${value}`}>{value}</a> : String(value)}</dd></div>; })}
        <div><dt className="text-muted-foreground">Loại dữ liệu</dt><dd className="mt-1 font-medium">{feature.geometry.type}</dd></div>
      </dl>
    </div>
  );
}

export function PublicMapExplorer() {
  const demoMode = process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true";
  const [data, setData] = useState(() => demoMode ? sampleMapData : { ...sampleMapData, source: "api" as const, layers: [], features: [] });
  const [dataState, setDataState] = useState<"loading" | "ready" | "error">("loading");
  const [retryId, setRetryId] = useState(0);
  const [query, setQuery] = useState("");
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<MobileSheet>(null);
  const [listOpen, setListOpen] = useState(false);
  const [basemap, setBasemap] = useState<"street" | "light">("street");
  const [command, setCommand] = useState<MapCommand>({ id: 0, type: "reset" });
  const [mapMessage, setMapMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublicMapData(controller.signal).then((next) => { setData(next); setDataState("ready"); }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setData({ ...sampleMapData, source: "api", layers: [], features: [] });
      setDataState("error");
    });
    return () => controller.abort();
  }, [retryId]);

  const visibleFeatures = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("vi");
    return data.features.filter((feature) => {
      if (hiddenLayers.has(feature.properties.layerId)) return false;
      if (!normalized) return true;
      return [feature.properties.name, feature.properties.kind, ...Object.values(feature.properties.metadata)].filter((value): value is string | number => value !== null && value !== undefined).some((value) => String(value).toLocaleLowerCase("vi").includes(normalized));
    });
  }, [data.features, hiddenLayers, query]);
  const selected = data.features.find((feature) => feature.properties.id === selectedId) ?? null;
  const selectedLayer = selected ? data.layers.find((layer) => layer.id === selected.properties.layerId) : undefined;
  const layerColors = useMemo(() => Object.fromEntries(data.layers.map((layer) => [layer.id, layer.color])), [data.layers]);

  function toggleLayer(id: string) {
    setHiddenLayers((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function selectFeature(id: string) { setSelectedId(id); setSheet("detail"); }
  function run(type: MapCommand["type"]) { setCommand((current) => ({ id: current.id + 1, type })); }

  return (
    <main className="relative h-[100dvh] min-h-[560px] overflow-hidden bg-surface-subtle">
      <h1 className="sr-only">Bản đồ số Đà Nẵng</h1>
      <div className="absolute inset-0"><PublicMapCanvas features={visibleFeatures} layerColors={layerColors} basemap={basemap} command={command} onFeatureSelect={selectFeature} onError={setMapMessage} /></div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-start gap-3 border-b bg-surface p-3 md:flex-row md:border-0 md:bg-transparent md:p-4">
        <Link href="/" className="pointer-events-auto md:hidden"><BrandMark /></Link>
        <Link href="/" className="pointer-events-auto hidden rounded-panel bg-surface px-3 py-2 map-control-shadow md:block"><BrandMark /></Link>
        <form className="pointer-events-auto relative mx-auto w-full max-w-[620px] md:mx-0" onSubmit={(event) => event.preventDefault()} role="search">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={21} stroke={1.75} />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Tìm địa điểm hoặc dữ liệu" placeholder="Tìm phường, trụ sở, địa chỉ..." className="h-12 rounded-panel border-0 pl-12 pr-12 map-control-shadow" />
          {query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-control text-muted-foreground hover:bg-surface-subtle" aria-label="Xóa tìm kiếm"><IconX size={19} stroke={1.75} /></button>}
        </form>
        <Link href="/login" className="pointer-events-auto hidden min-h-12 items-center rounded-panel bg-surface px-4 text-sm font-medium map-control-shadow hover:bg-surface-subtle lg:flex">Đăng nhập quản trị</Link>
      </header>

      {demoMode && dataState === "ready" && <div className="absolute left-1/2 top-[124px] z-30 -translate-x-1/2 rounded-control border border-warning/30 bg-surface px-3 py-2 text-xs font-medium text-warning map-control-shadow md:top-[72px]" role="status">Chế độ demo · Không phải dữ liệu công bố</div>}
      {dataState === "error" && <div className="absolute left-1/2 top-[124px] z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-control border border-warning/30 bg-surface px-3 py-2 text-sm map-control-shadow md:top-[72px]" role="alert"><IconInfoCircle className="shrink-0 text-warning" size={20} stroke={1.75} /><span>Không tải được dữ liệu công bố. Bản đồ nền vẫn có thể sử dụng.</span><Button size="sm" variant="outline" onClick={() => { setDataState("loading"); setRetryId((value) => value + 1); }}>Thử lại</Button></div>}

      <aside className="absolute bottom-5 left-4 top-24 z-10 hidden w-[300px] flex-col overflow-hidden rounded-panel border bg-surface map-panel-shadow md:flex" aria-label="Lớp dữ liệu">
        <div className="border-b p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Lớp dữ liệu</h2><Badge>{data.layers.length} lớp</Badge></div><p className="mt-1 text-xs text-muted-foreground">Bật hoặc tắt lớp trên bản đồ</p></div>
        <div className="flex-1 overflow-y-auto p-2">{dataState === "loading" ? <p className="p-4 text-sm text-muted-foreground" role="status">Đang tải lớp dữ liệu...</p> : dataState === "error" ? <p className="p-4 text-sm leading-6 text-muted-foreground">Danh sách chưa khả dụng. Hãy thử lại sau.</p> : <LayerList layers={data.layers} hidden={hiddenLayers} onToggle={toggleLayer} />}</div>
        <div className="border-t p-3"><Button variant="outline" className="w-full" onClick={() => setListOpen((value) => !value)}><IconList stroke={1.75} />{listOpen ? "Ẩn danh sách" : "Xem danh sách"}</Button></div>
      </aside>

      {listOpen && <section className="absolute bottom-5 left-[332px] top-24 z-10 hidden w-[340px] overflow-hidden rounded-panel border bg-surface map-panel-shadow md:block"><div className="border-b p-4"><h2 className="font-semibold">Đối tượng trong vùng xem</h2><p className="mt-1 text-xs text-muted-foreground">{visibleFeatures.length} kết quả</p></div><div className="max-h-[calc(100%-70px)] overflow-y-auto p-2"><FeatureRows features={visibleFeatures} onSelect={selectFeature} /></div></section>}

      {selected && <aside className="absolute right-20 top-24 z-10 hidden max-h-[calc(100dvh-8rem)] w-[340px] overflow-y-auto rounded-panel border bg-surface p-5 map-panel-shadow md:block"><FeatureDetail feature={selected} layer={selectedLayer} onClose={() => setSelectedId(null)} /></aside>}

      <div className="absolute right-3 top-[140px] z-10 flex flex-col gap-2 md:right-4 md:top-24">
        <div className="flex flex-col overflow-hidden rounded-map-control bg-surface map-control-shadow"><Button variant="ghost" size="icon" className="rounded-none border-b" onClick={() => run("zoom-in")} aria-label="Phóng to"><IconPlus stroke={1.75} /></Button><Button variant="ghost" size="icon" className="rounded-none" onClick={() => run("zoom-out")} aria-label="Thu nhỏ"><IconMinus stroke={1.75} /></Button></div>
        <Button variant="outline" size="icon" className="rounded-map-control border-0 bg-surface map-control-shadow" onClick={() => run("locate")} aria-label="Vị trí của tôi"><IconCurrentLocation stroke={1.75} /></Button>
        <Button variant="outline" size="icon" className="rounded-map-control border-0 bg-surface map-control-shadow" onClick={() => setBasemap((value) => value === "street" ? "light" : "street")} aria-label={`Đổi sang bản đồ ${basemap === "street" ? "nền sáng" : "đường phố"}`}><IconMap stroke={1.75} /></Button>
      </div>

      {mapMessage && <div className="absolute left-1/2 top-20 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-control border border-warning/30 bg-surface px-3 py-2 text-sm map-control-shadow" role="alert"><IconInfoCircle className="text-warning" size={19} stroke={1.75} /><span>{mapMessage}</span><button onClick={() => setMapMessage(null)} aria-label="Đóng thông báo"><IconX size={18} /></button></div>}

      <nav className="safe-bottom absolute inset-x-3 bottom-0 z-20 grid grid-cols-3 gap-2 md:hidden" aria-label="Công cụ bản đồ">
        <Button variant={sheet === "layers" ? "subtle" : "outline"} className="h-12 border-0 bg-surface map-control-shadow" onClick={() => setSheet(sheet === "layers" ? null : "layers")}><IconLayersIntersect stroke={1.75} />Lớp</Button>
        <Button variant={sheet === "list" ? "subtle" : "outline"} className="h-12 border-0 bg-surface map-control-shadow" onClick={() => setSheet(sheet === "list" ? null : "list")}><IconList stroke={1.75} />Danh sách</Button>
        <Button variant="outline" className="h-12 border-0 bg-surface map-control-shadow" onClick={() => run("reset")}><IconRefresh stroke={1.75} />Đặt lại</Button>
      </nav>

      {sheet && <section className="safe-bottom absolute inset-x-0 bottom-[68px] z-20 max-h-[58dvh] overflow-y-auto rounded-t-[18px] border-t bg-surface p-4 map-panel-shadow md:hidden" aria-label={sheet === "layers" ? "Lớp dữ liệu" : sheet === "list" ? "Danh sách kết quả" : "Thông tin đối tượng"}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{sheet === "layers" ? "Lớp dữ liệu" : sheet === "list" ? `${visibleFeatures.length} kết quả` : "Thông tin đối tượng"}</h2><Button variant="ghost" size="icon-sm" onClick={() => setSheet(null)} aria-label="Đóng bảng"><IconX stroke={1.75} /></Button></div>
        {sheet === "layers" && <LayerList layers={data.layers} hidden={hiddenLayers} onToggle={toggleLayer} />}
        {sheet === "list" && <FeatureRows features={visibleFeatures} onSelect={selectFeature} />}
        {sheet === "detail" && selected && <FeatureDetail feature={selected} layer={selectedLayer} showClose={false} onClose={() => { setSelectedId(null); setSheet(null); }} />}
      </section>}

      <div className="absolute bottom-[76px] left-3 z-10 flex items-center gap-1.5 rounded-control bg-surface px-2.5 py-1.5 text-[11px] text-muted-foreground map-control-shadow md:bottom-5 md:left-auto md:right-4">
        <IconAdjustmentsHorizontal size={15} stroke={1.75} /><span>{basemap === "street" ? "Đường phố" : "Nền sáng"}</span>{data.source === "sample" && <span aria-label="Đang dùng dữ liệu mẫu">· Demo</span>}
      </div>
    </main>
  );
}
