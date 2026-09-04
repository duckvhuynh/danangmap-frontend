"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  SlidersHorizontal as IconAdjustmentsHorizontal,
  Landmark as IconBuildingCommunity,
  ChevronRight as IconChevronRight,
  Download as IconDownload,
  Filter as IconFilter,
  Info as IconInfoCircle,
  Layers as IconLayersIntersect,
  List as IconList,
  LocateFixed as IconCurrentLocation,
  Map as IconMap,
  Minus as IconMinus,
  Plus as IconPlus,
  RefreshCw as IconRefresh,
  X as IconX,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DANANG_PUBLIC_BBOX,
  decodePublicFeatureDetail,
  getPublicCatalogData,
  getPublicViewportData,
  type PublicFeatureFilter,
} from "@/lib/api/public-map";
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

export function groupPublicLayers(layers: PublicLayer[]) {
  const groups = new Map<string, { key: string; title: string; displayOrder: number; layers: PublicLayer[] }>();
  for (const layer of layers) {
    const key = layer.group?.id ?? "ungrouped";
    const group = groups.get(key) ?? {
      key,
      title: layer.group?.title ?? "Lớp khác",
      displayOrder: layer.group?.displayOrder ?? Number.MAX_SAFE_INTEGER,
      layers: [],
    };
    group.layers.push(layer);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((left, right) => left.displayOrder - right.displayOrder || left.title.localeCompare(right.title, "vi"))
    .map((group) => ({
      ...group,
      layers: group.layers.sort((left, right) => (left.displayOrder ?? 0) - (right.displayOrder ?? 0) || left.name.localeCompare(right.name, "vi")),
    }));
}

export function defaultHiddenLayerIds(layers: PublicLayer[]) {
  return new Set(layers.filter((layer) => layer.defaultVisible === false).map((layer) => layer.id));
}

function LayerList({ layers, hidden, onToggle }: { layers: PublicLayer[]; hidden: Set<string>; onToggle: (id: string) => void }) {
  return (
    <div className="space-y-4" aria-label="Danh sách lớp dữ liệu">
      {groupPublicLayers(layers).map((group) => <section key={group.key} aria-labelledby={`layer-group-${group.key}`}>
        <h3 id={`layer-group-${group.key}`} className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.title}</h3>
        <div className="space-y-1">{group.layers.map((layer) => {
          const Icon = layerIcon(layer);
          const active = !hidden.has(layer.id);
          return (
            <button key={layer.id} type="button" onClick={() => onToggle(layer.id)} aria-pressed={active} className={cn("flex w-full items-center gap-3 rounded-control p-2.5 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "bg-accent-subtle") }>
              <span className="grid size-9 shrink-0 place-items-center rounded-control border bg-surface" style={{ color: layer.color }}><Icon strokeWidth={1.75} size={20} /></span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{layer.name}</span><span className="block text-xs text-muted-foreground">{layer.featureCount.toLocaleString("vi-VN")} đối tượng</span></span>
              <span className={cn("size-4 rounded-full border-2", active ? "border-primary bg-primary" : "border-border bg-surface")} aria-hidden="true" />
            </button>
          );
        })}</div>
      </section>)}
    </div>
  );
}

interface FilterChoice {
  id: string;
  layerId: string;
  fieldKey: string;
  label: string;
  options: string[];
}

function PublicFilters({ id, layers, features, hidden, activeFilter, onApply }: { id: string; layers: PublicLayer[]; features: PublicFeature[]; hidden: Set<string>; activeFilter: PublicFeatureFilter | null; onApply: (filter: PublicFeatureFilter | null) => void }) {
  const choices = useMemo<FilterChoice[]>(() => layers.flatMap((layer) => {
    if (hidden.has(layer.id)) return [];
    const allowed = new Set(layer.filterCapabilities?.fieldKeys ?? []);
    return layer.fields.flatMap((field) => {
      if (!field.filterable && !allowed.has(field.key)) return [];
      const observed = features
        .filter((feature) => feature.properties.layerId === layer.id)
        .map((feature) => feature.properties.metadata[field.key])
        .filter((value): value is string | number | boolean => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        .map(String);
      return [{
        id: `${layer.id}:${field.key}`,
        layerId: layer.id,
        fieldKey: field.key,
        label: `${layer.name} · ${field.name}`,
        options: [...new Set([...(field.options ?? []), ...observed])].sort((left, right) => left.localeCompare(right, "vi")).slice(0, 100),
      }];
    });
  }), [features, hidden, layers]);
  const activeChoice = choices.find((choice) => choice.layerId === activeFilter?.layerId && choice.fieldKey === activeFilter.fieldKey);
  const [choiceId, setChoiceId] = useState(activeChoice?.id ?? choices[0]?.id ?? "");
  const [value, setValue] = useState(activeFilter?.value ?? "");
  const choice = choices.find((item) => item.id === choiceId) ?? choices[0];
  const effectiveValue = choice?.id === choiceId ? value : "";

  if (!choices.length) return null;
  return (
    <section className="border-t p-3" aria-label="Bộ lọc dữ liệu công khai">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold"><IconFilter size={16} strokeWidth={1.75} />Lọc lớp đang bật</div>
      <label className="sr-only" htmlFor={`${id}-field`}>Trường lọc</label>
      <select id={`${id}-field`} value={choice?.id ?? ""} onChange={(event) => { setChoiceId(event.target.value); setValue(""); }} className="h-9 w-full rounded-control border bg-surface px-2 text-xs outline-none focus:ring-2 focus:ring-ring">
        {choices.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select>
      <label className="sr-only" htmlFor={`${id}-value`}>Giá trị lọc</label>
      {choice?.options.length ? (
        <select id={`${id}-value`} value={effectiveValue} onChange={(event) => setValue(event.target.value)} className="mt-2 h-9 w-full rounded-control border bg-surface px-2 text-xs outline-none focus:ring-2 focus:ring-ring">
          <option value="">Chọn giá trị</option>
          {choice.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input id={`${id}-value`} value={effectiveValue} onChange={(event) => setValue(event.target.value)} placeholder="Nhập giá trị chính xác" className="mt-2 h-9 w-full rounded-control border bg-surface px-2 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" />
      )}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={() => { setValue(""); onApply(null); }} disabled={!activeFilter}>Xóa lọc</Button>
        <Button size="sm" onClick={() => choice && effectiveValue.trim() && onApply({ layerId: choice.layerId, fieldKey: choice.fieldKey, value: effectiveValue.trim() })} disabled={!choice || !effectiveValue.trim()}>Áp dụng</Button>
      </div>
    </section>
  );
}

function FeatureRows({ features, onSelect }: { features: PublicFeature[]; onSelect: (id: string) => void }) {
  if (features.length === 0) return <div className="px-2 py-8 text-center text-sm text-muted-foreground">Không tìm thấy đối tượng phù hợp.</div>;
  return (
    <ul className="divide-y" aria-label="Kết quả tra cứu">
      {features.map((feature) => <li key={feature.properties.id}><button className="flex w-full items-start gap-3 px-2 py-3 text-left hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => onSelect(feature.properties.id)}><span className="mt-1 size-2 rounded-full bg-primary" /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{feature.properties.name}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{String(feature.properties.metadata.address ?? feature.properties.kind)}</span></span><IconChevronRight className="mt-1 text-muted-foreground" size={18} strokeWidth={1.75} /></button></li>)}
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
        {showClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng thông tin"><IconX strokeWidth={1.75} /></Button>}
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
                    <IconDownload className="shrink-0 text-muted-foreground" size={19} strokeWidth={1.75} aria-hidden="true" />
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
        {showClose && <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Đóng thông tin"><IconX strokeWidth={1.75} /></Button>}
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
  const [viewportLoading, setViewportLoading] = useState(false);
  const [viewportBbox, setViewportBbox] = useState(DANANG_PUBLIC_BBOX);
  const [activeFilter, setActiveFilter] = useState<PublicFeatureFilter | null>(null);
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
  const viewportRequestRef = useRef(0);
  const catalogIssuesRef = useRef(data.issues);
  const visibilityInitializedRef = useRef(false);
  const catalogUnavailable = dataState === "error";

  useEffect(() => {
    const controller = new AbortController();
    getPublicCatalogData(controller.signal).then((next) => {
      catalogIssuesRef.current = next.issues;
      setData({ source: next.source, layers: next.layers, features: [], issues: next.issues });
      if (!visibilityInitializedRef.current) {
        setHiddenLayers(defaultHiddenLayerIds(next.layers));
        visibilityInitializedRef.current = true;
      }
      setDataState(next.issues.length ? "partial" : "ready");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setData({ source: "api", layers: [], features: [], issues: [] });
      setDataState("error");
    });
    return () => controller.abort();
  }, [retryId]);

  useEffect(() => {
    if (!data.layers.length || catalogUnavailable) return;
    const visibleLayers = data.layers.filter((layer) => !hiddenLayers.has(layer.id));
    const controller = new AbortController();
    const requestId = ++viewportRequestRef.current;
    queueMicrotask(() => {
      if (!controller.signal.aborted && requestId === viewportRequestRef.current) setViewportLoading(true);
    });
    getPublicViewportData(visibleLayers, viewportBbox, controller.signal, activeFilter).then((next) => {
      if (controller.signal.aborted || requestId !== viewportRequestRef.current) return;
      const issues = [...catalogIssuesRef.current, ...next.issues];
      setData((current) => ({ ...current, features: next.features, issues, viewport: next.viewport }));
      setDataState(issues.length ? "partial" : "ready");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (requestId !== viewportRequestRef.current) return;
      setData((current) => ({ ...current, features: [], issues: [...catalogIssuesRef.current, { layerId: "viewport", layerName: "Vùng bản đồ", code: "FEATURES_UNAVAILABLE", message: "Không tải được dữ liệu trong vùng xem." }] }));
      setDataState("partial");
    }).finally(() => {
      if (!controller.signal.aborted && requestId === viewportRequestRef.current) setViewportLoading(false);
    });
    return () => controller.abort();
  }, [activeFilter, catalogUnavailable, data.layers, hiddenLayers, viewportBbox]);

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
  const truncatedLayers = useMemo(() => {
    const visibleIds = new Set(data.layers.filter((layer) => !hiddenLayers.has(layer.id)).map((layer) => layer.id));
    return data.viewport?.layers.filter((state) => state.truncated && visibleIds.has(state.layerId)) ?? [];
  }, [data.layers, data.viewport, hiddenLayers]);

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

  function skipToFeatureList(event: { preventDefault(): void }) {
    event.preventDefault();
    if (window.matchMedia("(min-width: 768px)").matches) setListOpen(true);
    else setSheet("list");
    requestAnimationFrame(() => document.getElementById("public-feature-list")?.focus());
  }

  return (
    <main className="relative h-[100dvh] min-h-[560px] overflow-hidden bg-surface-subtle">
      <a href="#public-feature-list" onClick={skipToFeatureList} className="absolute left-3 top-3 z-50 -translate-y-24 rounded-control bg-surface px-4 py-3 text-sm font-semibold text-primary map-control-shadow transition-transform focus:translate-y-0">Bỏ qua bản đồ, đến danh sách dữ liệu</a>
      <h1 className="sr-only">Bản đồ số Đà Nẵng</h1>
      <div className="absolute inset-0"><PublicMapCanvas features={mapFeatures} layers={data.layers} hiddenLayerIds={hiddenLayers} layerColors={layerColors} basemap={basemap} command={command} focusTarget={focusTarget} filter={activeFilter} onViewportChange={setViewportBbox} onFeatureSelect={selectFeature} onError={setMapMessage} /></div>

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-col items-start gap-3 border-b bg-surface p-3 md:flex-row md:border-0 md:bg-transparent md:p-4">
        <Link href="/" className="pointer-events-auto md:hidden"><BrandMark /></Link>
        <Link href="/" className="pointer-events-auto hidden rounded-panel bg-surface px-3 py-2 map-control-shadow md:block"><BrandMark /></Link>
        <div className="pointer-events-auto mx-auto w-full max-w-[620px] md:mx-0"><PublicSearchCombobox onSelect={selectSearchResult} search={publicSearch} /></div>
        <Link href="/login" className="pointer-events-auto hidden min-h-12 items-center rounded-panel bg-surface px-4 text-sm font-medium map-control-shadow hover:bg-surface-subtle lg:flex">Đăng nhập quản trị</Link>
      </header>

      {demoMode && dataState === "ready" && <div className="absolute left-1/2 top-[124px] z-30 -translate-x-1/2 rounded-control border border-warning/30 bg-surface px-3 py-2 text-xs font-medium text-warning map-control-shadow md:top-[72px]" role="status">Chế độ demo · Không phải dữ liệu công bố</div>}
      {dataState === "error" && <div className="absolute left-1/2 top-[124px] z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-control border border-warning/30 bg-surface px-3 py-2 text-sm map-control-shadow md:top-[72px]" role="alert"><IconInfoCircle className="shrink-0 text-warning" size={20} strokeWidth={1.75} /><span>Không tải được dữ liệu công bố. Bản đồ nền vẫn có thể sử dụng.</span><Button size="sm" variant="outline" onClick={() => { setDataState("loading"); setRetryId((value) => value + 1); }}>Thử lại</Button></div>}
      {dataState === "partial" && <div className="absolute left-1/2 top-[124px] z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-control border border-warning/30 bg-surface px-3 py-2 text-sm map-control-shadow md:top-[72px]" role="status"><IconInfoCircle className="shrink-0 text-warning" size={20} strokeWidth={1.75} /><span>Một phần dữ liệu chưa tải được ({data.issues.length} cảnh báo). Các lớp còn lại vẫn sử dụng được.</span><Button size="sm" variant="outline" onClick={() => { setDataState("loading"); setRetryId((value) => value + 1); }}>Tải lại</Button></div>}
      <div className="sr-only" aria-live="polite">{viewportLoading ? "Đang cập nhật các đối tượng trong vùng bản đồ" : `Đã hiển thị ${visibleFeatures.length} đối tượng trong vùng bản đồ`}</div>

      <aside className="absolute bottom-5 left-4 top-24 z-10 hidden w-[300px] flex-col overflow-hidden rounded-panel border bg-surface map-panel-shadow md:flex" aria-label="Lớp dữ liệu">
        <div className="border-b p-4"><div className="flex items-center justify-between"><h2 className="font-semibold">Lớp dữ liệu</h2><Badge>{data.layers.length} lớp</Badge></div><p className="mt-1 text-xs text-muted-foreground">Bật/tắt lớp và xem chú giải màu</p></div>
        <div className="flex-1 overflow-y-auto p-2">{dataState === "loading" && data.layers.length === 0 ? <p className="p-4 text-sm text-muted-foreground" role="status">Đang tải lớp dữ liệu...</p> : dataState === "error" ? <p className="p-4 text-sm leading-6 text-muted-foreground">Danh sách chưa khả dụng. Hãy thử lại sau.</p> : data.layers.length === 0 ? <p className="p-4 text-sm leading-6 text-muted-foreground">Chưa có lớp dữ liệu được công bố.</p> : <LayerList layers={data.layers} hidden={hiddenLayers} onToggle={toggleLayer} />}</div>
        <PublicFilters id="public-filter-desktop" layers={data.layers} features={visibleFeatures} hidden={hiddenLayers} activeFilter={activeFilter} onApply={setActiveFilter} />
        <div className="border-t p-3"><Button variant="outline" className="w-full" onClick={() => setListOpen((value) => !value)}><IconList strokeWidth={1.75} />{listOpen ? "Ẩn danh sách" : "Xem danh sách"}</Button></div>
      </aside>

      {listOpen && <section id="public-feature-list" tabIndex={-1} className="absolute bottom-5 left-[332px] top-24 z-10 hidden w-[340px] overflow-hidden rounded-panel border bg-surface map-panel-shadow focus:outline-none md:block"><div className="border-b p-4"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">Đối tượng trong vùng xem</h2>{viewportLoading && <span className="text-xs text-primary" role="status">Đang cập nhật…</span>}</div><p className="mt-1 text-xs text-muted-foreground">{visibleFeatures.length.toLocaleString("vi-VN")} kết quả · thay đổi theo vùng bản đồ</p>{truncatedLayers.length > 0 && <p className="mt-2 rounded-control bg-accent-subtle px-2.5 py-2 text-xs leading-5 text-primary">Danh sách đã đạt giới hạn 1.000 đối tượng/lớp. Hãy phóng to hoặc dùng bộ lọc để xem chính xác hơn.</p>}</div><div className="max-h-[calc(100%-96px)] overflow-y-auto p-2"><FeatureRows features={visibleFeatures} onSelect={selectFeature} /></div></section>}

      {(selected || externalPlace || detailLoading) && <aside aria-label="Thông tin kết quả" className="absolute right-20 top-24 z-10 hidden max-h-[calc(100dvh-8rem)] w-[340px] overflow-y-auto rounded-panel border bg-surface p-5 map-panel-shadow md:block">{selected ? <FeatureDetail feature={selected} layer={selectedLayer} loading={detailLoading} onClose={closeDetail} /> : externalPlace ? <ExternalPlaceDetail place={externalPlace} onClose={closeDetail} /> : <p className="text-sm text-muted-foreground" role="status">Đang tải chi tiết kết quả...</p>}</aside>}

      <div className="absolute right-3 top-[140px] z-10 flex flex-col gap-2 md:right-4 md:top-24">
        <div className="flex flex-col overflow-hidden rounded-map-control bg-surface map-control-shadow"><Button variant="ghost" size="icon" className="rounded-none border-b" onClick={() => run("zoom-in")} aria-label="Phóng to"><IconPlus strokeWidth={1.75} /></Button><Button variant="ghost" size="icon" className="rounded-none" onClick={() => run("zoom-out")} aria-label="Thu nhỏ"><IconMinus strokeWidth={1.75} /></Button></div>
        <Button variant="outline" size="icon" className="rounded-map-control border-0 bg-surface map-control-shadow" onClick={() => run("locate")} aria-label="Vị trí của tôi"><IconCurrentLocation strokeWidth={1.75} /></Button>
        <Button variant="outline" size="icon" className="rounded-map-control border-0 bg-surface map-control-shadow" onClick={() => setBasemap((value) => value === "street" ? "light" : "street")} aria-label={`Đổi sang bản đồ ${basemap === "street" ? "nền sáng" : "đường phố"}`}><IconMap strokeWidth={1.75} /></Button>
      </div>

      {mapMessage && <div className="absolute left-1/2 top-20 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-control border border-warning/30 bg-surface px-3 py-2 text-sm map-control-shadow" role="alert"><IconInfoCircle className="text-warning" size={19} strokeWidth={1.75} /><span>{mapMessage}</span><button onClick={() => setMapMessage(null)} aria-label="Đóng thông báo"><IconX size={18} /></button></div>}

      <nav className="safe-bottom absolute inset-x-3 bottom-0 z-20 grid grid-cols-3 gap-2 md:hidden" aria-label="Công cụ bản đồ">
        <Button variant={sheet === "layers" ? "subtle" : "outline"} className="h-12 border-0 bg-surface map-control-shadow" onClick={() => setSheet(sheet === "layers" ? null : "layers")}><IconLayersIntersect strokeWidth={1.75} />Lớp</Button>
        <Button variant={sheet === "list" ? "subtle" : "outline"} className="h-12 border-0 bg-surface map-control-shadow" onClick={() => setSheet(sheet === "list" ? null : "list")}><IconList strokeWidth={1.75} />Danh sách</Button>
        <Button variant="outline" className="h-12 border-0 bg-surface map-control-shadow" onClick={() => run("reset")}><IconRefresh strokeWidth={1.75} />Đặt lại</Button>
      </nav>

      {sheet && <section id={sheet === "list" ? "public-feature-list" : undefined} tabIndex={sheet === "list" ? -1 : undefined} className="safe-bottom absolute inset-x-0 bottom-[68px] z-20 max-h-[58dvh] overflow-y-auto rounded-t-[18px] border-t bg-surface p-4 map-panel-shadow focus:outline-none md:hidden" aria-label={sheet === "layers" ? "Lớp dữ liệu" : sheet === "list" ? "Danh sách kết quả" : "Thông tin đối tượng"}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
        <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{sheet === "layers" ? "Lớp dữ liệu" : sheet === "list" ? `${visibleFeatures.length} kết quả` : "Thông tin đối tượng"}</h2><Button variant="ghost" size="icon-sm" onClick={() => setSheet(null)} aria-label="Đóng bảng"><IconX strokeWidth={1.75} /></Button></div>
        {sheet === "layers" && <><LayerList layers={data.layers} hidden={hiddenLayers} onToggle={toggleLayer} /><div className="-mx-4 mt-4"><PublicFilters id="public-filter-mobile" layers={data.layers} features={visibleFeatures} hidden={hiddenLayers} activeFilter={activeFilter} onApply={setActiveFilter} /></div></>}
        {sheet === "list" && <>{viewportLoading && <p className="mb-2 text-xs text-primary" role="status">Đang cập nhật theo vùng bản đồ…</p>}{truncatedLayers.length > 0 && <p className="mb-3 rounded-control bg-accent-subtle p-2.5 text-xs leading-5 text-primary">Đã đạt giới hạn 1.000 đối tượng/lớp. Hãy phóng to hoặc lọc thêm.</p>}<FeatureRows features={visibleFeatures} onSelect={selectFeature} /></>}
        {sheet === "detail" && (selected ? <FeatureDetail feature={selected} layer={selectedLayer} loading={detailLoading} showClose={false} onClose={closeDetail} /> : externalPlace ? <ExternalPlaceDetail place={externalPlace} showClose={false} onClose={closeDetail} /> : detailLoading ? <p className="py-5 text-sm text-muted-foreground" role="status">Đang tải chi tiết kết quả...</p> : null)}
      </section>}

      <div className="absolute bottom-[76px] left-3 z-10 flex items-center gap-1.5 rounded-control bg-surface px-2.5 py-1.5 text-[11px] text-muted-foreground map-control-shadow md:bottom-5 md:left-auto md:right-4">
        <IconAdjustmentsHorizontal size={15} strokeWidth={1.75} /><span>{basemap === "street" ? "Đường phố" : "Nền sáng"}</span>{data.source === "sample" && <span aria-label="Đang dùng dữ liệu mẫu">· Demo</span>}
      </div>
    </main>
  );
}
