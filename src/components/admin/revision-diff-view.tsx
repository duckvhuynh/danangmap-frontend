"use client";

import { useCallback, useEffect, useState } from "react";
import { IconAlertTriangle, IconArrowsDiff, IconEyeOff, IconPaperclip } from "@tabler/icons-react";
import { AdminErrorNotice } from "@/components/admin/admin-session";
import { compactIdentifier } from "@/components/admin/history-format";
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
  return <div className="flex flex-col gap-3" role="status" aria-label="Đang tải diff revision">
    <Skeleton className="h-24 w-full"/>
    <Skeleton className="h-40 w-full"/>
    <Skeleton className="h-40 w-full"/>
  </div>;
}

function PropertiesPreview({ label, properties }: { label: string; properties: Record<string, unknown> }) {
  return <details className="text-xs text-muted-foreground">
    <summary className="cursor-pointer font-medium text-foreground">{label}</summary>
    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-control bg-surface-subtle p-3">{JSON.stringify(properties, null, 2)}</pre>
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
  if (!safePreview) return <p className="mt-2 text-xs text-muted-foreground">Không có preview an toàn để hiển thị.</p>;
  return <pre aria-label={label} className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-control border bg-surface p-3 text-xs">{JSON.stringify(safePreview, null, 2)}</pre>;
}

function PublicFieldKeys({ label, keys }: { label: string; keys: string[] }) {
  return <div>
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-2 flex flex-wrap gap-1.5">
      {keys.length === 0 ? <span className="text-sm text-muted-foreground">Không có</span> : keys.map((key) => <Badge key={key}>{key}</Badge>)}
    </dd>
  </div>;
}

export function RevisionDiffView({ revisionId, transport = defaultTransport }: { revisionId: string; transport?: RevisionDiffTransport }) {
  const [comparison, setComparison] = useState<"parent" | "active">("parent");
  const [resource, setResource] = useState<HistoryResource<RevisionDiff> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE !== "true");
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);

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

  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return <Alert><IconArrowsDiff stroke={1.75}/><AlertTitle>Diff cần API thật</AlertTitle><AlertDescription>Chế độ demo không dựng dữ liệu diff. Bản triển khai kết nối trực tiếp endpoint revision diff.</AlertDescription></Alert>;
  if (loading) return <DiffSkeleton/>;
  if (error instanceof AdminApiError && error.code === "DIFF_TOO_LARGE") {
    return <Alert variant="destructive">
      <IconAlertTriangle stroke={1.75}/>
      <AlertTitle>Diff vượt giới hạn xử lý đồng bộ</AlertTitle>
      <AlertDescription>
        <p>Hệ thống đã dừng truy vấn để bảo vệ tài nguyên. Không có kết quả rút gọn hoặc phần trăm giả được tạo.</p>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-control bg-surface p-3 text-xs">{JSON.stringify(error.details, null, 2)}</pre>
        <Button type="button" variant="outline" size="sm" onClick={retry} className="mt-3">Thử lại</Button>
      </AlertDescription>
    </Alert>;
  }
  if (error && !resource) return <AdminErrorNotice error={error} onRetry={retry}/>;

  const diff = resource?.data;
  if (!diff) return null;

  return <div className="flex flex-col gap-5">
    <Field>
      <FieldLabel htmlFor="diff-comparison">Mốc so sánh</FieldLabel>
      <Select value={comparison} onValueChange={(value: "parent" | "active") => { setComparison(value); setResource(null); setError(null); setLoading(true); }}>
        <SelectTrigger id="diff-comparison" className="max-w-sm"><SelectValue/></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="active">Bản đang công bố</SelectItem>
            <SelectItem value="parent">Revision trước</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>Cursor được giữ nguyên dạng opaque khi tải thêm. Diff mỗi lần trả tối đa {diff.limit} đối tượng.</FieldDescription>
    </Field>

    <dl className="grid gap-3 sm:grid-cols-3" aria-label="Tóm tắt thay đổi feature">
      <div className="rounded-control border bg-surface p-4"><dt className="text-sm text-muted-foreground">Đã thêm</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{diff.geometry.added.toLocaleString("vi-VN")}</dd></div>
      <div className="rounded-control border bg-surface p-4"><dt className="text-sm text-muted-foreground">Đã xóa</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{diff.geometry.removed.toLocaleString("vi-VN")}</dd></div>
      <div className="rounded-control border bg-surface p-4"><dt className="text-sm text-muted-foreground">Đã sửa</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{diff.geometry.modified.toLocaleString("vi-VN")}</dd></div>
    </dl>

    <section className="rounded-panel border bg-surface p-4" aria-labelledby="public-schema-diff-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 id="public-schema-diff-title" className="text-sm font-semibold">Thay đổi schema public</h3><p className="mt-1 text-xs text-muted-foreground">Chỉ hiển thị khóa trường public do backend cung cấp.</p></div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><IconEyeOff size={17} stroke={1.75}/><span><strong className="font-semibold text-foreground">{diff.schema.redactedChangeCount.toLocaleString("vi-VN")}</strong> thay đổi đã ẩn</span></div>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <PublicFieldKeys label="Trường public đã thêm" keys={diff.schema.publicFieldsAdded}/>
        <PublicFieldKeys label="Trường public đã xóa" keys={diff.schema.publicFieldsRemoved}/>
        <PublicFieldKeys label="Trường public đã sửa" keys={diff.schema.publicFieldsChanged}/>
      </dl>
    </section>

    <Alert>
      <IconPaperclip stroke={1.75}/>
      <AlertTitle>So sánh tệp đính kèm chưa khả dụng</AlertTitle>
      <AlertDescription>
        Backend trả trạng thái {diff.attachments.status}. Mã lý do: <code>{diff.attachments.reasonCode}</code>. Giao diện không suy diễn đây là không có thay đổi.
      </AlertDescription>
    </Alert>

    {diff.entries.length === 0 ? <Empty className="border"><EmptyHeader><EmptyMedia variant="icon"><IconArrowsDiff stroke={1.75}/></EmptyMedia><EmptyTitle>Không có thay đổi feature</EmptyTitle><EmptyDescription>Revision không khác mốc so sánh đã chọn trong phạm vi dữ liệu hiện tại.</EmptyDescription></EmptyHeader></Empty> : <ol className="divide-y rounded-panel border bg-surface" aria-label="Các feature thay đổi">
      {diff.entries.map((entry) => <li key={`${entry.featureId}:${entry.changeType}`} className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Badge>{changeLabel(entry.changeType)}</Badge>{entry.redactedChange && <Badge><IconEyeOff data-icon="inline-start" stroke={1.75}/>Có thay đổi đã ẩn</Badge>}</div>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground" title={entry.featureId}>Feature {compactIdentifier(entry.featureId)}</p>
          </div>
          <p className="text-sm text-muted-foreground">{entry.properties.changedKeys.length > 0 ? `${entry.properties.changedKeys.length} trường thay đổi` : "Không đổi thuộc tính public"}</p>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="rounded-control bg-surface-subtle p-3" aria-label="Hình học trước thay đổi">
            <h4 className="text-sm font-medium">Trước thay đổi</h4>
            <p className="mt-1 text-xs text-muted-foreground">{entry.geometry.beforeKind ?? "Không có"}, {previewLabel(entry.geometry.beforePreviewMode)}</p>
            {entry.geometry.beforeRadiusM !== null && <p className="mt-2 text-sm">Bán kính {entry.geometry.beforeRadiusM.toLocaleString("vi-VN")} m</p>}
            <GeometryPreview label="Preview geometry trước thay đổi" mode={entry.geometry.beforePreviewMode} preview={entry.geometry.beforePreview} bounds={entry.geometry.beforeBounds}/>
          </section>
          <section className="rounded-control bg-surface-subtle p-3" aria-label="Hình học sau thay đổi">
            <h4 className="text-sm font-medium">Sau thay đổi</h4>
            <p className="mt-1 text-xs text-muted-foreground">{entry.geometry.afterKind ?? "Không có"}, {previewLabel(entry.geometry.afterPreviewMode)}</p>
            {entry.geometry.afterRadiusM !== null && <p className="mt-2 text-sm">Bán kính {entry.geometry.afterRadiusM.toLocaleString("vi-VN")} m</p>}
            <GeometryPreview label="Preview geometry sau thay đổi" mode={entry.geometry.afterPreviewMode} preview={entry.geometry.afterPreview} bounds={entry.geometry.afterBounds}/>
          </section>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <PropertiesPreview label="Thuộc tính public trước" properties={entry.properties.before}/>
          <PropertiesPreview label="Thuộc tính public sau" properties={entry.properties.after}/>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Attachment: {entry.attachments.reasonCode}</p>
      </li>)}
    </ol>}
    {error !== null && resource && (
      <AdminErrorNotice error={error} onRetry={loadMore}/>
    )}
    {diff.hasMore && <Button type="button" variant="outline" disabled={loadingMore} onClick={loadMore} className="self-start">{loadingMore ? "Đang tải thêm..." : "Tải thêm feature thay đổi"}</Button>}
    <p className="text-xs text-muted-foreground">History ETag: <code>{resource.historyEtag}</code></p>
  </div>;
}
