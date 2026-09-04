"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconAlertTriangle, IconArrowsDiff, IconArrowsSort, IconEyeOff, IconFile, IconMinus, IconPaperclip, IconPlus } from "@tabler/icons-react";
import { AdminErrorNotice } from "@/components/admin/admin-session";
import { geometryLabel } from "@/lib/admin/labels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminApiError } from "@/lib/api/admin";
import { getRevisionDiff, type HistoryResource, type RevisionDiff } from "@/lib/api/history";

export interface RevisionDiffTransport {
  load: typeof getRevisionDiff;
}

const defaultTransport: RevisionDiffTransport = { load: getRevisionDiff };

function previewLabel(mode: "exact" | "bbox" | null) {
  if (mode === "exact") return "Hình học chính xác";
  if (mode === "bbox") return "Khung giới hạn";
  return "Không có hình học";
}

function changeLabel(value: "added" | "removed" | "modified") {
  if (value === "added") return "Đã thêm";
  if (value === "removed") return "Đã xóa";
  return "Đã sửa";
}

function DiffSkeleton() {
  return <div className="flex flex-col gap-3" role="status" aria-label="Đang tải thay đổi">
    <Skeleton className="h-24 w-full"/>
    <Skeleton className="h-40 w-full"/>
    <Skeleton className="h-40 w-full"/>
  </div>;
}

function PropertiesPreview({ label, properties, fieldLabels }: { label: string; properties: Record<string, unknown>; fieldLabels: Record<string, string> }) {
  const entries = Object.entries(properties);
  return <details className="text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">{label}</summary>
    {entries.length === 0 ? <p className="mt-2">Không có thông tin.</p> : <dl className="mt-2 flex flex-col divide-y rounded-control bg-surface-subtle px-3">{entries.map(([key, value]) => <div key={key} className="grid grid-cols-2 gap-3 py-2"><dt className="break-words">{fieldLabels[key] ?? key}</dt><dd className="break-words text-foreground">{value === null ? "Chưa có" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>}
  </details>;
}

const exactGeometryTypes = new Set(["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"]);

function safeCoordinateTree(value: unknown, depth = 0): unknown | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!Array.isArray(value) || depth > 7) return null;
  const next = value.map((item) => safeCoordinateTree(item, depth + 1));
  return next.some((item) => item === null) ? null : next;
}

function safeExactGeometry(value: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!value || typeof value.type !== "string" || !exactGeometryTypes.has(value.type)) return null;
  if (value.type === "GeometryCollection") {
    if (!Array.isArray(value.geometries)) return null;
    const geometries = value.geometries.map((item) => typeof item === "object" && item !== null && !Array.isArray(item) ? safeExactGeometry(item as Record<string, unknown>) : null);
    return geometries.some((item) => item === null) ? null : { type: value.type, geometries };
  }
  const coordinates = safeCoordinateTree(value.coordinates);
  return coordinates === null ? null : { type: value.type, coordinates };
}

function GeometryPreview({
  label,
  mode,
  preview,
  bounds,
}: {
  label: string;
  mode: "exact" | "bbox" | null;
  preview: Record<string, unknown> | null;
  bounds: number[] | null;
}) {
  const safePreview = mode === "exact"
    ? safeExactGeometry(preview)
    : mode === "bbox" && bounds ? { type: "BBox", bounds } : null;
  if (!safePreview) return <p className="mt-2 text-xs text-muted-foreground">Không có dữ liệu vị trí để hiển thị.</p>;
  return <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Xem tọa độ</summary><pre aria-label={label} className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-control border bg-surface p-3 text-xs">{JSON.stringify(safePreview, null, 2)}</pre></details>;
}

function PublicFieldKeys({ label, keys, fieldLabels }: { label: string; keys: string[]; fieldLabels: Record<string, string> }) {
  return <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-2 flex flex-wrap gap-1.5">
      {keys.length === 0 ? <span className="text-sm text-muted-foreground">Không có</span> : keys.map((key) => <Badge key={key}>{fieldLabels[key] ?? key}</Badge>)}
    </dd>
  </div>;
}

type AttachmentDiff = RevisionDiff["entries"][number]["attachments"];
type AttachmentDescriptor = AttachmentDiff["added"][number];

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024) return `${sizeBytes.toLocaleString("vi-VN")} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} KB`;
  return `${(sizeBytes / (1024 * 1024)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
}

function AttachmentList({ label, items, icon: Icon, fieldLabels }: { label: string; items: AttachmentDescriptor[]; icon: typeof IconFile; fieldLabels: Record<string, string> }) {
  if (items.length === 0) return null;
  return <div>
    <h5 className="flex items-center gap-1.5 text-xs font-semibold text-foreground"><Icon size={16} stroke={1.75}/>{label}</h5>
    <ul className="mt-2 space-y-2">
      {items.map((item) => <li key={`${item.id}:${item.fieldKey}`} className="flex min-w-0 items-start gap-2 rounded-control border bg-surface px-3 py-2.5">
        <IconFile className="mt-0.5 shrink-0 text-muted-foreground" size={17} stroke={1.75}/>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={item.fileName}>{item.fileName}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{fieldLabels[item.fieldKey] ?? item.fieldKey} · {formatFileSize(item.sizeBytes)} · {item.status === "clean" ? "Đã kiểm tra an toàn" : "Chưa sẵn sàng"}</p>
        </div>
      </li>)}
    </ul>
  </div>;
}

function AttachmentDiffDetails({ featureName, diff, fieldLabels }: { featureName: string; diff: AttachmentDiff; fieldLabels: Record<string, string> }) {
  if (!diff.changed) return <p className="mt-3 text-xs text-muted-foreground">Tệp đính kèm không thay đổi.</p>;
  return <section className="mt-3 rounded-control border bg-surface-subtle p-3" aria-label={`Thay đổi tệp đính kèm của đối tượng ${featureName}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold"><IconPaperclip size={17} stroke={1.75}/>Tệp đính kèm</h4>
      <div className="flex flex-wrap gap-1.5" aria-label="Tóm tắt thay đổi tệp của đối tượng">
        {diff.added.length > 0 && <Badge><IconPlus data-icon="inline-start" stroke={1.75}/>{diff.added.length} thêm</Badge>}
        {diff.removed.length > 0 && <Badge><IconMinus data-icon="inline-start" stroke={1.75}/>{diff.removed.length} xóa</Badge>}
        {diff.reordered.length > 0 && <Badge><IconArrowsSort data-icon="inline-start" stroke={1.75}/>{diff.reordered.length} đổi thứ tự</Badge>}
      </div>
    </div>
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <AttachmentList fieldLabels={fieldLabels} label="Tệp đã thêm" items={diff.added} icon={IconPlus}/>
      <AttachmentList fieldLabels={fieldLabels} label="Tệp đã xóa" items={diff.removed} icon={IconMinus}/>
    </div>
    {diff.reordered.length > 0 && <div className="mt-3">
      <h5 className="flex items-center gap-1.5 text-xs font-semibold"><IconArrowsSort size={16} stroke={1.75}/>Đã đổi thứ tự</h5>
      <ul className="mt-2 space-y-2">
        {diff.reordered.map((item) => <li key={`${item.id}:${item.fieldKey}`} className="rounded-control border bg-surface px-3 py-2.5 text-sm">
          <span className="font-medium">{item.fileName}</span>
          <span className="ml-2 text-xs text-muted-foreground">{item.fieldKey} · vị trí {item.beforeDisplayOrder + 1} → {item.afterDisplayOrder + 1}</span>
        </li>)}
      </ul>
    </div>}
    {diff.redactedChange && <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><IconEyeOff size={16} stroke={1.75}/>Một số thay đổi tệp riêng tư đã được ẩn.</p>}
  </section>;
}

export function RevisionDiffView({ revisionId, fieldLabels = {}, transport = defaultTransport }: { revisionId: string; fieldLabels?: Record<string, string>; transport?: RevisionDiffTransport }) {
  const entryRefs = useRef<Array<HTMLElement | null>>([]);
  const [comparison, setComparison] = useState<"parent" | "active">("parent");
  const [resource, setResource] = useState<HistoryResource<RevisionDiff> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true");
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const diffIdentity = `${revisionId}:${comparison}:${reloadVersion}`;
  const [activeEntry, setActiveEntry] = useState({ identity: "", index: 0 });

  const retry = useCallback(() => {
    setResource(null);
    setError(null);
    setLoading(true);
    setReloadVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return;
    let active = true;
    transport.load(revisionId, { compareTo: comparison, limit: 25 }).then((next) => {
      if (active) setResource(next);
    }).catch((reason: unknown) => {
      if (active) setError(reason);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [comparison, reloadVersion, revisionId, transport]);

  async function loadMore() {
    if (!resource?.data.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await transport.load(revisionId, { compareTo: comparison, limit: resource.data.limit, cursor: resource.data.nextCursor });
      setResource({
        ...next,
        data: { ...next.data, entries: [...resource.data.entries, ...next.data.entries] },
      });
    } catch (reason) {
      setError(reason);
    } finally {
      setLoadingMore(false);
    }
  }

  function navigateEntries(event: React.KeyboardEvent<HTMLElement>, index: number, count: number) {
    if (event.target !== event.currentTarget) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") nextIndex = Math.min(index + 1, count - 1);
    if (event.key === "ArrowUp") nextIndex = Math.max(index - 1, 0);
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = count - 1;
    if (nextIndex === null || nextIndex === index) return;
    event.preventDefault();
    setActiveEntry({ identity: diffIdentity, index: nextIndex });
    entryRefs.current[nextIndex]?.focus();
  }

  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return <Alert><IconArrowsDiff stroke={1.75}/><AlertTitle>Chưa có dữ liệu so sánh</AlertTitle><AlertDescription>Bản dùng thử chưa hỗ trợ so sánh các phiên bản.</AlertDescription></Alert>;
  if (loading) return <DiffSkeleton/>;
  if (error instanceof AdminApiError && error.code === "DIFF_TOO_LARGE") {
    return <Alert variant="destructive">
      <IconAlertTriangle stroke={1.75}/>
      <AlertTitle>Có quá nhiều thay đổi để so sánh cùng lúc</AlertTitle>
      <AlertDescription>
        <p>Chưa thể hiển thị so sánh cho phiên bản này. Hãy liên hệ người quản trị hệ thống nếu lỗi tiếp tục.</p>
        <Button type="button" variant="outline" size="sm" onClick={retry} className="mt-3">Thử lại</Button>
      </AlertDescription>
    </Alert>;
  }
  if (error && !resource) return <AdminErrorNotice error={error} onRetry={retry}/>;

  const diff = resource?.data;
  if (!diff) return null;
  const entryInstructionsId = `revision-diff-entry-instructions-${revisionId}`;
  const activeEntryIndex = activeEntry.identity === diffIdentity ? activeEntry.index : 0;

  return <div className="flex flex-col gap-5">
    <p aria-atomic="true" aria-live="polite" className="sr-only">
      Đã tải {diff.entries.length.toLocaleString("vi-VN")} đối tượng thay đổi so với {comparison === "active" ? "bản đang công bố" : "phiên bản trước"}.
    </p>
    <Field>
      <FieldLabel htmlFor="diff-comparison">Mốc so sánh</FieldLabel>
      <Select value={comparison} onValueChange={(value: "parent" | "active") => { setComparison(value); setResource(null); setError(null); setLoading(true); }}>
        <SelectTrigger id="diff-comparison" className="max-w-sm"><SelectValue/></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="active">Bản đang công bố</SelectItem>
            <SelectItem value="parent">Phiên bản trước</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>Chọn phiên bản muốn đối chiếu để xem những gì đã thêm, xóa hoặc sửa.</FieldDescription>
    </Field>

    <dl className="grid gap-3 sm:grid-cols-3" aria-label="Tóm tắt thay đổi đối tượng">
      <div className="rounded-control border bg-surface p-4"><dt className="text-sm text-muted-foreground">Đã thêm</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{diff.geometry.added.toLocaleString("vi-VN")}</dd></div>
      <div className="rounded-control border bg-surface p-4"><dt className="text-sm text-muted-foreground">Đã xóa</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{diff.geometry.removed.toLocaleString("vi-VN")}</dd></div>
      <div className="rounded-control border bg-surface p-4"><dt className="text-sm text-muted-foreground">Đã sửa</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{diff.geometry.modified.toLocaleString("vi-VN")}</dd></div>
    </dl>

    <section className="rounded-panel border bg-surface p-4" aria-labelledby="public-schema-diff-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="public-schema-diff-title" className="text-sm font-semibold">Thay đổi trường thông tin công khai</h3><p className="mt-1 text-xs text-muted-foreground">Các trường được phép hiển thị trên bản đồ công khai.</p></div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><IconEyeOff size={17} stroke={1.75}/><span><strong className="font-semibold text-foreground">{diff.schema.redactedChangeCount.toLocaleString("vi-VN")}</strong> thay đổi đã ẩn</span></div>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <PublicFieldKeys label="Trường công khai đã thêm" fieldLabels={fieldLabels} keys={diff.schema.publicFieldsAdded}/>
        <PublicFieldKeys label="Trường công khai đã xóa" fieldLabels={fieldLabels} keys={diff.schema.publicFieldsRemoved}/>
        <PublicFieldKeys label="Trường công khai đã sửa" fieldLabels={fieldLabels} keys={diff.schema.publicFieldsChanged}/>
      </dl>
    </section>

    <section className="rounded-panel border bg-surface p-4" aria-labelledby="attachment-diff-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="attachment-diff-title" className="flex items-center gap-2 text-sm font-semibold"><IconPaperclip size={18} stroke={1.75}/>Thay đổi tệp đính kèm</h3><p className="mt-1 text-xs text-muted-foreground">Chỉ hiển thị thông tin tệp công khai. Tệp riêng tư và thông tin nhạy cảm được ẩn.</p></div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><IconEyeOff size={17} stroke={1.75}/><span><strong className="font-semibold text-foreground">{diff.attachments.redactedChangeCount.toLocaleString("vi-VN")}</strong> thay đổi đã ẩn</span></div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-control bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Đối tượng có thay đổi</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{diff.attachments.featuresModified.toLocaleString("vi-VN")}</dd></div>
        <div className="rounded-control bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Tệp đã thêm</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{diff.attachments.added.toLocaleString("vi-VN")}</dd></div>
        <div className="rounded-control bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Tệp đã xóa</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{diff.attachments.removed.toLocaleString("vi-VN")}</dd></div>
        <div className="rounded-control bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Đổi thứ tự</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{diff.attachments.reordered.toLocaleString("vi-VN")}</dd></div>
      </dl>
    </section>

    {diff.entries.length === 0 ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><IconArrowsDiff stroke={1.75}/></EmptyMedia><EmptyTitle>Không có thay đổi đối tượng</EmptyTitle><EmptyDescription>Không có thay đổi đối tượng so với phiên bản đã chọn.</EmptyDescription></EmptyHeader></Empty> : <div>
      <p className="sr-only" id={entryInstructionsId}>Dùng phím mũi tên lên và xuống, Home hoặc End để di chuyển giữa các đối tượng thay đổi.</p>
      <ol aria-describedby={entryInstructionsId} aria-label="Các đối tượng thay đổi" className="divide-y rounded-panel border bg-surface">
      {diff.entries.map((entry, index) => { const name = entry.properties.after.name ?? entry.properties.before.name; const featureName = typeof name === "string" && name.trim() ? name : `Đối tượng ${index + 1}`; return <li key={`${entry.featureId}:${entry.changeType}`} className="p-4">
        <article
          aria-label={`${changeLabel(entry.changeType)} ${featureName}, mục ${index + 1} trên ${diff.entries.length}`}
          className="rounded-control outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
          onFocus={() => setActiveEntry({ identity: diffIdentity, index })}
          onKeyDown={(event) => navigateEntries(event, index, diff.entries.length)}
          ref={(node) => { entryRefs.current[index] = node; }}
          tabIndex={index === Math.min(activeEntryIndex, diff.entries.length - 1) ? 0 : -1}
        >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Badge>{changeLabel(entry.changeType)}</Badge>{entry.redactedChange && <Badge><IconEyeOff data-icon="inline-start" stroke={1.75}/>Có thay đổi đã ẩn</Badge>}</div>
            <p className="mt-2 break-words text-sm font-medium">{featureName}</p>
          </div>
          <p className="text-sm text-muted-foreground">{entry.properties.changedKeys.length > 0 ? `${entry.properties.changedKeys.length} trường thay đổi` : "Không đổi thông tin công khai"}</p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="rounded-control bg-surface-subtle p-3" aria-label="Hình học trước thay đổi">
            <h4 className="text-sm font-medium">Trước thay đổi</h4>
            <p className="mt-1 text-xs text-muted-foreground">{entry.geometry.beforeKind ? geometryLabel(entry.geometry.beforeKind) : "Không có"}, {previewLabel(entry.geometry.beforePreviewMode)}</p>
            {entry.geometry.beforeRadiusM !== null && <p className="mt-2 text-sm">Bán kính {entry.geometry.beforeRadiusM.toLocaleString("vi-VN")} m</p>}
            <GeometryPreview label="Tọa độ trước thay đổi" mode={entry.geometry.beforePreviewMode} preview={entry.geometry.beforePreview} bounds={entry.geometry.beforeBounds}/>
          </section>
          <section className="rounded-control bg-surface-subtle p-3" aria-label="Hình học sau thay đổi">
            <h4 className="text-sm font-medium">Sau thay đổi</h4>
            <p className="mt-1 text-xs text-muted-foreground">{entry.geometry.afterKind ? geometryLabel(entry.geometry.afterKind) : "Không có"}, {previewLabel(entry.geometry.afterPreviewMode)}</p>
            {entry.geometry.afterRadiusM !== null && <p className="mt-2 text-sm">Bán kính {entry.geometry.afterRadiusM.toLocaleString("vi-VN")} m</p>}
            <GeometryPreview label="Tọa độ sau thay đổi" mode={entry.geometry.afterPreviewMode} preview={entry.geometry.afterPreview} bounds={entry.geometry.afterBounds}/>
          </section>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <PropertiesPreview label="Thông tin công khai trước" fieldLabels={fieldLabels} properties={entry.properties.before}/>
          <PropertiesPreview label="Thông tin công khai sau" fieldLabels={fieldLabels} properties={entry.properties.after}/>
        </div>
        <AttachmentDiffDetails fieldLabels={fieldLabels} featureName={featureName} diff={entry.attachments}/>
        </article>
      </li>; })}
    </ol></div>}
    {error !== null && resource && (
      <AdminErrorNotice error={error} onRetry={loadMore}/>
    )}
    {diff.hasMore && <Button type="button" variant="outline" disabled={loadingMore} onClick={loadMore} className="self-start">{loadingMore ? "Đang tải thêm..." : "Xem thêm đối tượng thay đổi"}</Button>}
  </div>;
}
