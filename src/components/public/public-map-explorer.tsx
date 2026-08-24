"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  IconAdjustmentsHorizontal,
  IconBuildingCommunity,
  IconChevronRight,
  IconDownload,
  IconInfoCircle,
  IconLayersIntersect,
  IconList,
  IconCurrentLocation,
  IconMap,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { decodePublicFeatureDetail, getPublicMapData } from "@/lib/api/public-map";
import { createDemoPublicSearch, getExternalPlace, getPublicFeature, searchPublicMap, type ExternalPlace, type PublicSearchResult } from "@/lib/api/public-search";
import { sampleMapData } from "@/lib/data/sample-map";
import type { PublicFeature, PublicLayer, PublicMapData } from "@/lib/domain/map";
import type { MapCommand } from "@/components/map/public-map-canvas";
import { PublicSearchCombobox } from "@/components/public/public-search-combobox";
import { positionFocus, searchResultFocus, searchResultLayerSlug, type MapFocusTarget } from "@/lib/search/public-search-state";
import { cn } from "@/lib/utils";

const PublicMapCanvas = dynamic(() => import("@/components/map/public-map-canvas"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-surface-subtle" role="status" aria-label="Đang tải bản đồ" />,
});

type MobileSheet = "layers" | "list" | "detail" | null;

function layerIcon(layer: PublicLayer) {
  if (layer.type === "point" || layer.type === "circle") return IconBuildingCommunity;
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

function formatBytes(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
}

export function FeatureDetail({ feature, layer, loading = false, onClose, showClose = true }: { feature: PublicFeature; layer?: PublicLayer; loading?: boolean; onClose: () => void; showClose?: boolean }) {
  const attachments = feature.attachments ?? [];
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div><Badge>{feature.properties.kind}</Badge><h2 className="mt-3 text-lg font-semibold leading-6">{feature.properties.name}</h2></div>
        {showClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng thông tin"><IconX stroke={1.75} /></Button>}
      </div>
      <dl className="mt-5 space-y-4 text-sm">
        {layer?.fields.map((field) => { const value = feature.properties.metadata[field.key]; if (value === null || value === undefined || value === "") return null; return <div key={field.key}><dt className="text-muted-foreground">{field.name}</dt><dd className={cn("mt-1 font-medium", field.type === "status" && "text-success")}>{field.type === "phone" ? <a className="text-primary underline-offset-4 hover:underline" href={`tel:${value}`}>{value}</a> : String(value)}</dd></div>; })}
        {feature.properties.geometryKind === "circle" && typeof feature.properties.radiusM === "number" && <div><dt className="text-muted-foreground">Bán kính</dt><dd className="mt-1 font-medium">{feature.properties.radiusM.toLocaleString("vi-VN")} mét</dd></div>}
        <div><dt className="text-muted-foreground">Loại dữ liệu</dt><dd className="mt-1 font-medium">{feature.geometry.type}</dd></div>
      </dl>
      {loading && <p className="mt-4 text-xs text-muted-foreground" role="status">Đang tải thông tin công bố mới nhất...</p>}
      {attachments.length > 0 && (
        <section className="mt-6 border-t pt-5" aria-label="Tệp đính kèm">
          <h3 className="text-sm font-semibold">Tệp đính kèm</h3>
          <div className="mt-3 space-y-3">
            {attachments.map((attachment) => {
              const fieldName = layer?.fields.find((field) => field.key === attachment.fieldKey)?.name;
              const isImage = attachment.contentType.startsWith("image/");
              return (
                <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer" className="group block overflow-hidden rounded-control border bg-surface transition-shadow hover:map-control-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {isImage && <Image unoptimized src={attachment.url} alt={attachment.fileName} width={600} height={400} className="h-auto max-h-56 w-full object-cover" />}
                  <span className="flex min-h-11 items-center gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground group-hover:text-primary">{attachment.fileName}</span>
                      <span className="block text-xs text-muted-foreground">{fieldName ? `${fieldName} · ` : ""}{formatBytes(attachment.sizeBytes)}</span>
                    </span>
                    <IconDownload className="shrink-0 text-muted-foreground" size={19} stroke={1.75} aria-hidden="true" />
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function ExternalPlaceDetail({ place, onClose, showClose = true }: { place: ExternalPlace; onClose: () => void; showClose?: boolean }) {
  const safeWebsite = place.website && /^https?:\/\//i.test(place.website) ? place.website : null;
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div><Badge>Geo Service</Badge><h2 className="mt-3 text-lg font-semibold leading-6">{place.name}</h2></div>
        {showClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng thông tin"><IconX stroke={1.75} /></Button>}
      </div>
      <dl className="mt-5 space-y-4 text-sm">
        {place.address && <div><dt className="text-muted-foreground">Địa chỉ</dt><dd className="mt-1 font-medium">{place.address}</dd></div>}
        {place.phone && <div><dt className="text-muted-foreground">Điện thoại</dt><dd className="mt-1 font-medium"><a className="text-primary underline-offset-4 hover:underline" href={`tel:${place.phone}`}>{place.phone}</a></dd></div>}
        {safeWebsite && <div><dt className="text-muted-foreground">Website</dt><dd className="mt-1 truncate font-medium"><a className="text-primary underline-offset-4 hover:underline" href={safeWebsite} target="_blank" rel="noreferrer">{safeWebsite}</a></dd></div>}
        <div><dt className="text-muted-foreground">Nguồn</dt><dd className="mt-1 font-medium">Geo Service Đà Nẵng</dd></div>
      </dl>
    </div>
  );
}

export function PublicMapExplorer() {
  const demoMode = process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true";
  const publicSearchE2eMode = process.env.NEXT_PUBLIC_DANANGMAP_PUBLIC_SEARCH_E2E_MODE === "true";
  const [data, setData] = useState<PublicMapData>(() => demoMode ? sampleMapData : { source: "api", layers: [], features: [], issues: [] });
  const [dataState, setDataState] = useState<"loading" | "ready" | "partial" | "error">("loading");
  const [retryId, setRetryId] = useState(0);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remoteFeature, setRemoteFeature] = useState<PublicFeature | null>(null);
  const [externalPlace, setExternalPlace] = useState<ExternalPlace | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [focusTarget, setFocusTarget] = useState<MapFocusTarget | null>(null);
  const [sheet, setSheet] = useState<MobileSheet>(null);
  const [listOpen, setListOpen] = useState(false);
  const [basemap, setBasemap] = useState<"street" | "light">("street");
  const [command, setCommand] = useState<MapCommand>({ id: 0, type: "reset" });
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const focusSequenceRef = useRef(0);
  const placeRequestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublicMapData(controller.signal).then((next) => { setData(next); setDataState(next.issues.length ? "partial" : "ready"); }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setData({ source: "api", layers: [], features: [], issues: [] });
      setDataState("error");
    });
    return () => controller.abort();
  }, [retryId]);

  useEffect(() => () => placeRequestRef.current?.abort(), []);

  const visibleFeatures = useMemo(() => data.features.filter((feature) => !hiddenLayers.has(feature.properties.layerId)), [data.features, hiddenLayers]);
  const selected = (remoteFeature?.properties.id === selectedId ? remoteFeature : null) ?? data.features.find((feature) => feature.properties.id === selectedId);
  const selectedLayer = selected ? data.layers.find((layer) => layer.id === selected.properties.layerId) : undefined;
  const layerColors = useMemo(() => Object.fromEntries(data.layers.map((layer) => [layer.id, layer.color])), [data.layers]);
  const mapFeatures = useMemo(() => {
    const geoJsonLayerIds = new Set(data.layers.filter((layer) => layer.sourceKind === "geojson").map((layer) => layer.id));
    return visibleFeatures.filter((feature) => geoJsonLayerIds.has(feature.properties.layerId));
  }, [data.layers, visibleFeatures]);
  const publicSearch = useMemo(
    () => demoMode && !publicSearchE2eMode ? createDemoPublicSearch(data) : searchPublicMap,
    [data, demoMode, publicSearchE2eMode],
  );

  function toggleLayer(id: string) {
    setHiddenLayers((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function loadInternalFeature(featureId: string, layer: PublicLayer) {
    if (demoMode && !publicSearchE2eMode) return;
    placeRequestRef.current?.abort();
    const controller = new AbortController();
    placeRequestRef.current = controller;
    setDetailLoading(true);
    try {
      const detail = await getPublicFeature(layer.slug, featureId, controller.signal);
      if (controller.signal.aborted) return;
      setRemoteFeature(decodePublicFeatureDetail(detail, layer));
    } catch {
      if (!controller.signal.aborted) setMapMessage("Không tải được thông tin công bố mới nhất của đối tượng.");
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }

  function selectFeature(id: string) {
    const feature = data.features.find((candidate) => candidate.properties.id === id);
    const layer = feature ? data.layers.find((candidate) => candidate.id === feature.properties.layerId) : undefined;
    setRemoteFeature(null);
    setSelectedId(id);
    setExternalPlace(null);
    setFocusTarget(null);
    setMapMessage(null);
    setSheet("detail");
    if (layer) void loadInternalFeature(id, layer);
  }
  function run(type: MapCommand["type"]) { setCommand((current) => ({ id: current.id + 1, type })); }

  async function selectSearchResult(result: PublicSearchResult) {
    placeRequestRef.current?.abort();
    setDetailLoading(false);
    setMapMessage(null);
    focusSequenceRef.current += 1;
    const initialFocus = searchResultFocus(result, focusSequenceRef.current);
    setFocusTarget(initialFocus);
    if (!initialFocus) setMapMessage("Kết quả chưa có tọa độ hợp lệ để hiển thị trên bản đồ.");
    setExternalPlace(null);
    setRemoteFeature(null);
    setSelectedId(null);
    if (result.source === "internal") {
      const feature = data.features.find((candidate) => candidate.properties.id === result.featureId);
      if (feature) {
        const layer = data.layers.find((candidate) => candidate.id === feature.properties.layerId);
        setHiddenLayers((current) => { const next = new Set(current); next.delete(feature.properties.layerId); return next; });
        setSelectedId(feature.properties.id);
        setSheet("detail");
        if (layer) await loadInternalFeature(feature.properties.id, layer);
      } else {
        const slug = searchResultLayerSlug(result);
        const layer = data.layers.find((candidate) => candidate.slug === slug);
        if (!slug || !layer || !result.featureId) {
          setSheet(null);
          setMapMessage("Đã đưa bản đồ đến kết quả nhưng chưa đủ tham chiếu để tải chi tiết.");
          return;
        }
        setSelectedId(result.featureId);
        setHiddenLayers((current) => { const next = new Set(current); next.delete(layer.id); return next; });
        setSheet("detail");
        await loadInternalFeature(result.featureId, layer);
      }
      return;
    }
    if (!result.providerPlaceId) {
      setMapMessage("Kết quả địa điểm không có mã tham chiếu để tải chi tiết.");
      return;
    }
    const controller = new AbortController();
    placeRequestRef.current = controller;
    setDetailLoading(true);
    setSheet("detail");
    try {
      const place = await getExternalPlace(result.providerPlaceId, controller.signal);
      if (controller.signal.aborted) return;
      setExternalPlace(place);
      focusSequenceRef.current += 1;
      const detailFocus = positionFocus(place.position, focusSequenceRef.current, true);
      if (detailFocus) {
        setFocusTarget(detailFocus);
        setMapMessage(null);
      } else setMapMessage(initialFocus ? "Chi tiết địa điểm chưa có tọa độ xác nhận. Vị trí từ kết quả tìm kiếm vẫn được giữ." : "Địa điểm chưa có tọa độ xác nhận để hiển thị trên bản đồ.");
    } catch {
      if (!controller.signal.aborted) setMapMessage("Không tải được chi tiết địa điểm. Vị trí kết quả vẫn được giữ trên bản đồ.");
    } finally {
      if (!controller.signal.aborted) setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedId(null);
    setRemoteFeature(null);
    setExternalPlace(null);
    setDetailLoading(false);
    setFocusTarget(null);
    setSheet(null);
  }

  return (
    <main className="relative h-[100dvh] min-h-[560px] overflow-hidden bg-surface-subtle">
      <h1 className="sr-only">Bản đồ số Đà Nẵng</h1>
      <div className="absolute inset-0"><PublicMapCanvas features={mapFeatures} layers={data.layers} hiddenLayerIds={hiddenLayers} layerColors={layerColors} basemap={basemap} command={command} focusTarget={focusTarget} onFeatureSelect={selectFeature} onError={setMapMessage} /></div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-start gap-3 border-b bg-surface p-3 md:flex-row md:border-0 md:bg-transparent md:p-4">
        <Link href="/" className="pointer-events-auto md:hidden"><BrandMark /></Link>
        <Link href="/" className="pointer-events-auto hidden rounded-panel bg-surface px-3 py-2 map-control-shadow md:block"><BrandMark /></Link>
        <div className="pointer-events-auto mx-auto w-full max-w-[620px] md:mx-0"><PublicSearchCombobox onSelect={selectSearchResult} search={publicSearch} /></div>
        <Link href="/login" className="pointer-events-auto hidden min-h-12 items-center rounded-panel bg-surface px-4 text-sm font-medium map-control-shadow hover:bg-surface-subtle lg:flex">Đăng nhập quản trị</Link>
      </header>

      {demoMode && dataState === "ready" && <div className="absolute left-1/2 top-[124px] z-30 -translate-x-1/2 rounded-control border border-warning/30 bg-surface px-3 py-2 text-xs font-medium text-warning map-control-shadow md:top-[72px]" role="status">Chế độ demo · Không phải dữ liệu công bố</div>}
      {dataState === "error" && <div className="absolute left-1/2 top-[124px] z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-control border border-warning/30 bg-surface px-3 py-2 text-sm map-control-shadow md:top-[72px]" role="alert"><IconInfoCircle className="shrink-0 text-warning" size={20} stroke={1.75} /><span>Không tải được dữ liệu công bố. Bản đồ nền vẫn có thể sử dụng.</span><Button size="sm" variant="outline" onClick={() => { setDataState("loading"); setRetryId((value) => value + 1); }}>Thử lại</Button></div>}
      {dataState === "partial" && <div className="absolute left-1/2 top-[124px] z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-control border border-warning/30 bg-surface px-3 py-2 text-sm map-control-shadow md:top-[72px]" role="status"><IconInfoCircle className="shrink-0 text-warning" size={20} stroke={1.75} /><span>Một phần dữ liệu chưa tải được ({data.issues.length} cảnh báo). Các lớp còn lại vẫn sử dụng được.</span><Button size="sm" variant="outline" onClick={() => { setDataState("loading"); setRetryId((value) => value + 1); }}>Tải lại</Button></div>}

      <aside className="absolute bottom-5 left-4 top-24 z-10 hidden w-[300px] flex-col overflow-hidden rounded-panel border bg-surface map-panel-shadow md:flex" aria-label="Lớp dữ liệu">
        <div className="border-b p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Lớp dữ liệu</h2><Badge>{data.layers.length} lớp</Badge></div><p className="mt-1 text-xs text-muted-foreground">Bật hoặc tắt lớp trên bản đồ</p></div>
        <div className="flex-1 overflow-y-auto p-2">{dataState === "loading" ? <p className="p-4 text-sm text-muted-foreground" role="status">Đang tải lớp dữ liệu...</p> : dataState === "error" ? <p className="p-4 text-sm leading-6 text-muted-foreground">Danh sách chưa khả dụng. Hãy thử lại sau.</p> : data.layers.length === 0 ? <p className="p-4 text-sm leading-6 text-muted-foreground">Chưa có lớp dữ liệu được công bố.</p> : <LayerList layers={data.layers} hidden={hiddenLayers} onToggle={toggleLayer} />}</div>
        <div className="border-t p-3"><Button variant="outline" className="w-full" onClick={() => setListOpen((value) => !value)}><IconList stroke={1.75} />{listOpen ? "Ẩn danh sách" : "Xem danh sách"}</Button></div>
      </aside>

      {listOpen && <section className="absolute bottom-5 left-[332px] top-24 z-10 hidden w-[340px] overflow-hidden rounded-panel border bg-surface map-panel-shadow md:block"><div className="border-b p-4"><h2 className="font-semibold">Đối tượng trong vùng xem</h2><p className="mt-1 text-xs text-muted-foreground">{visibleFeatures.length} kết quả</p></div><div className="max-h-[calc(100%-70px)] overflow-y-auto p-2"><FeatureRows features={visibleFeatures} onSelect={selectFeature} /></div></section>}

      {(selected || externalPlace || detailLoading) && <aside aria-label="Thông tin kết quả" className="absolute right-20 top-24 z-10 hidden max-h-[calc(100dvh-8rem)] w-[340px] overflow-y-auto rounded-panel border bg-surface p-5 map-panel-shadow md:block">{selected ? <FeatureDetail feature={selected} layer={selectedLayer} loading={detailLoading} onClose={closeDetail} /> : externalPlace ? <ExternalPlaceDetail place={externalPlace} onClose={closeDetail} /> : <p className="text-sm text-muted-foreground" role="status">Đang tải chi tiết kết quả...</p>}</aside>}

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
        {sheet === "detail" && (selected ? <FeatureDetail feature={selected} layer={selectedLayer} loading={detailLoading} showClose={false} onClose={closeDetail} /> : externalPlace ? <ExternalPlaceDetail place={externalPlace} showClose={false} onClose={closeDetail} /> : detailLoading ? <p className="py-5 text-sm text-muted-foreground" role="status">Đang tải chi tiết kết quả...</p> : null)}
      </section>}

      <div className="absolute bottom-[76px] left-3 z-10 flex items-center gap-1.5 rounded-control bg-surface px-2.5 py-1.5 text-[11px] text-muted-foreground map-control-shadow md:bottom-5 md:left-auto md:right-4">
        <IconAdjustmentsHorizontal size={15} stroke={1.75} /><span>{basemap === "street" ? "Đường phố" : "Nền sáng"}</span>{data.source === "sample" && <span aria-label="Đang dùng dữ liệu mẫu">· Demo</span>}
      </div>
    </main>
  );
}
