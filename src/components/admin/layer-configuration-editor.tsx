"use client";

import { useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconArchive,
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconCircleCheck,
  IconDatabase,
  IconDeviceFloppy,
  IconEye,
  IconForms,
  IconGeometry,
  IconInfoCircle,
  IconPlus,
  IconRestore,
  IconSettings,
  IconTrash,
} from "@tabler/icons-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  changeGeometryMode,
  changeSchemaField,
  createEmptySchemaField,
  geometryKindLabels,
  hasConfigurationImpact,
  layerFieldTypes,
  moveSchemaField,
  normalizeFieldOrder,
  removeSchemaField,
  replaceSchemaField,
  validateLayerConfiguration,
  type LayerConfigurationDraft,
  type LayerConfigurationErrors,
  type LayerConfigurationActions,
  type LayerConfigurationSaveResult,
  type LayerFieldType,
  type LayerGeometryMode,
  type LayerGroupOption,
  type LayerSchemaFieldDraft,
} from "@/lib/layers/layer-configuration-state";
import { AdminApiError, adminErrorMessage, type AdminRole } from "@/lib/api/admin";
import { cn } from "@/lib/utils";

type EditorTab = "overview" | "geometry" | "schema" | "presentation";

const tabs: Array<{ id: EditorTab; label: string; icon: typeof IconSettings }> = [
  { id: "overview", label: "Thông tin", icon: IconSettings },
  { id: "geometry", label: "Geometry", icon: IconGeometry },
  { id: "schema", label: "Schema", icon: IconForms },
  { id: "presentation", label: "Hiển thị", icon: IconEye },
];

const geometryModes: Array<{ value: LayerGeometryMode; label: string; description: string }> = [
  { value: "point", label: "Point", description: "Điểm đơn hoặc MultiPoint." },
  { value: "circle", label: "Circle", description: "Lưu tâm Point và bán kính theo mét." },
  { value: "polyline", label: "Polyline", description: "LineString hoặc MultiLineString." },
  { value: "polygon", label: "Polygon", description: "Polygon hoặc MultiPolygon." },
  { value: "mixed", label: "Mixed", description: "Cho phép nhiều họ geometry trong một logical layer." },
];

const fieldTypeLabels: Record<LayerFieldType, string> = {
  text: "Văn bản",
  long_text: "Văn bản dài",
  number: "Số thập phân",
  integer: "Số nguyên",
  boolean: "Đúng / sai",
  date: "Ngày",
  datetime: "Ngày giờ",
  url: "Đường dẫn",
  email: "Email",
  phone: "Số điện thoại",
  enum: "Một lựa chọn",
  multi_enum: "Nhiều lựa chọn",
  address: "Địa chỉ",
  image: "Hình ảnh",
  attachment: "Tệp đính kèm",
};

function sectionClassName() {
  return "rounded-panel border bg-surface p-5 map-panel-shadow sm:p-6";
}

function toggleListValue<T extends string>(values: T[], value: T, checked: boolean) {
  return checked ? Array.from(new Set([...values, value])) : values.filter((candidate) => candidate !== value);
}

function ReadOnlyNotice({ role, canAuthor, status }: { role: AdminRole; canAuthor: boolean; status: string }) {
  const title = status !== "draft" ? "Revision này được giữ bất biến" : role !== "editor" ? "Cấu hình chỉ đọc theo vai trò" : "Sửa cấu hình cần máy tính";
  const description = status !== "draft"
    ? "Chỉ draft hoặc successor draft mới nhận thay đổi schema, geometry và hiển thị."
    : role !== "editor"
      ? "Reviewer, Publisher và System Admin có thể xem cấu hình nhưng không thay đổi nội dung layer."
      : "Tính năng này cần máy tính có chuột hoặc trackpad và bàn phím.";
  return <Alert role="note"><IconInfoCircle stroke={1.75}/><AlertTitle>{title}</AlertTitle><AlertDescription>{description}{!canAuthor && role === "editor" && <span className="mt-1 block">Mở lại trên thiết bị phù hợp để chỉnh sửa.</span>}</AlertDescription></Alert>;
}

function OverviewSection({ draft, groups, disabled, error, onChange }: { draft: LayerConfigurationDraft; groups: LayerGroupOption[]; disabled: boolean; error: LayerConfigurationErrors; onChange(next: LayerConfigurationDraft): void }) {
  return <section className={sectionClassName()} aria-labelledby="layer-overview-title"><h2 id="layer-overview-title" className="text-lg font-semibold">Thông tin catalog</h2><p className="mt-1 text-sm text-muted-foreground">Tên, nhóm và vị trí mà người dân nhìn thấy trong catalog công bố.</p>
    <FieldGroup className="mt-6"><div className="grid gap-5 md:grid-cols-2"><Field data-invalid={Boolean(error.slug)}><FieldLabel htmlFor="layer-slug">Mã lớp</FieldLabel><Input id="layer-slug" value={draft.slug} disabled={disabled || Boolean(draft.layerId)} onChange={(event) => onChange({ ...draft, slug: event.target.value.toLocaleLowerCase("vi") })} aria-invalid={Boolean(error.slug)} aria-describedby={error.slug ? "layer-slug-error" : "layer-slug-help"}/><FieldDescription id="layer-slug-help">Ổn định sau khi tạo; chữ thường, số và dấu gạch ngang.</FieldDescription><FieldError id="layer-slug-error">{error.slug}</FieldError></Field>
    <Field data-invalid={Boolean(error.title)}><FieldLabel htmlFor="layer-title">Tên lớp</FieldLabel><Input id="layer-title" value={draft.title} disabled={disabled} onChange={(event) => onChange({ ...draft, title: event.target.value })} aria-invalid={Boolean(error.title)} aria-describedby={error.title ? "layer-title-error" : undefined}/><FieldError id="layer-title-error">{error.title}</FieldError></Field></div>
    <Field><FieldLabel htmlFor="layer-description">Mô tả</FieldLabel><textarea id="layer-description" className="min-h-24 w-full resize-y rounded-control border bg-surface p-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:bg-surface-subtle" value={draft.description} disabled={disabled} onChange={(event) => onChange({ ...draft, description: event.target.value })}/></Field>
    <div className="grid gap-5 md:grid-cols-2"><Field><FieldLabel htmlFor="layer-group">Nhóm lớp</FieldLabel><Select disabled={disabled} value={draft.groupId || "__none"} onValueChange={(value) => onChange({ ...draft, groupId: value === "__none" ? "" : value })}><SelectTrigger id="layer-group"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none">Không thuộc nhóm</SelectItem>{groups.filter((group) => !group.archivedAt || group.id === draft.groupId).sort((a, b) => a.displayOrder - b.displayOrder).map((group) => <SelectItem key={group.id} value={group.id}>{group.title}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor="layer-order">Thứ tự catalog</FieldLabel><Input id="layer-order" type="number" step={1} value={draft.displayOrder} disabled={disabled} onChange={(event) => onChange({ ...draft, displayOrder: Number(event.target.value) || 0 })}/></Field></div>
    <Field orientation="horizontal"><Checkbox id="layer-default-visible" checked={draft.defaultVisible} disabled={disabled} onCheckedChange={(checked) => onChange({ ...draft, defaultVisible: checked === true })}/><FieldLabel htmlFor="layer-default-visible">Bật lớp mặc định khi mở bản đồ</FieldLabel></Field></FieldGroup>
  </section>;
}

function GeometrySection({ draft, disabled, error, onChange }: { draft: LayerConfigurationDraft; disabled: boolean; error: LayerConfigurationErrors; onChange(next: LayerConfigurationDraft): void }) {
  return <section className={sectionClassName()} aria-labelledby="layer-geometry-title"><h2 id="layer-geometry-title" className="text-lg font-semibold">Geometry được phép</h2><p className="mt-1 text-sm text-muted-foreground">Mỗi thay đổi phải qua impact analysis trước khi áp dụng lên draft có dữ liệu.</p>
    <fieldset className="mt-6"><legend className="text-sm font-medium">Chế độ layer</legend><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">{geometryModes.map((mode) => <label key={mode.value} className={cn("rounded-control border p-4", draft.geometryMode === mode.value && "border-primary bg-accent-subtle")}><input type="radio" name="geometry-mode" className="accent-primary" checked={draft.geometryMode === mode.value} disabled={disabled} onChange={() => onChange(changeGeometryMode(draft, mode.value))}/><span className="ml-2 text-sm font-medium">{mode.label}</span><span className="mt-2 block text-xs leading-5 text-muted-foreground">{mode.description}</span></label>)}</div></fieldset>
    <fieldset className="mt-7" aria-describedby={error.allowedGeometryKinds ? "geometry-kinds-error" : undefined}><legend className="text-sm font-medium">Kiểu geometry</legend><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{geometryKindLabels.map((kind) => { const compatible = draft.geometryMode === "mixed" || changeGeometryMode(draft, draft.geometryMode).allowedGeometryKinds.includes(kind.value); const checked = draft.allowedGeometryKinds.includes(kind.value); return <label className={cn("flex items-start gap-3 rounded-control border p-4", checked && "border-primary bg-accent-subtle", !compatible && "opacity-50")} key={kind.value}><Checkbox checked={checked} disabled={disabled || !compatible} onCheckedChange={(value) => onChange({ ...draft, allowedGeometryKinds: toggleListValue(draft.allowedGeometryKinds, kind.value, value === true) })}/><span className="text-sm">{kind.label}</span></label>; })}</div><FieldError id="geometry-kinds-error" className="mt-3">{error.allowedGeometryKinds}</FieldError></fieldset>
    {draft.allowedGeometryKinds.includes("circle") && <Alert className="mt-6" role="note"><IconInfoCircle/><AlertTitle>Circle dùng đơn vị mét</AlertTitle><AlertDescription>HTTP và database giữ Point làm tâm cùng radiusM; polygon trên bản đồ chỉ là biểu diễn.</AlertDescription></Alert>}
  </section>;
}

function FieldFlags({ field, disabled, onChange }: { field: LayerSchemaFieldDraft; disabled: boolean; onChange(next: LayerSchemaFieldDraft): void }) {
  const flags: Array<{ key: "required" | "public" | "searchable" | "filterable" | "sortable" | "sensitive" | "offlineCache"; label: string; disabled?: boolean }> = [
    { key: "required", label: "Bắt buộc" },
    { key: "public", label: "Công khai", disabled: field.sensitive },
    { key: "searchable", label: "Tìm kiếm", disabled: !field.public },
    { key: "filterable", label: "Bộ lọc", disabled: !field.public },
    { key: "sortable", label: "Sắp xếp", disabled: !field.public },
    { key: "sensitive", label: "Nhạy cảm" },
    { key: "offlineCache", label: "Cho recovery cache", disabled: field.sensitive },
  ];
  return <fieldset><legend className="text-xs font-medium text-muted-foreground">Quyền và khả năng</legend><div className="mt-2 flex flex-wrap gap-2">{flags.map((flag) => <label key={flag.key} className="flex min-h-10 items-center gap-2 rounded-control border px-3 text-xs"><Checkbox checked={field[flag.key]} disabled={disabled || flag.disabled} onCheckedChange={(checked) => onChange(changeSchemaField(field, flag.key, checked === true))}/>{flag.label}</label>)}</div></fieldset>;
}

function SchemaFieldCard({ field, index, total, disabled, errors, onChange, onMove, onRemove }: { field: LayerSchemaFieldDraft; index: number; total: number; disabled: boolean; errors: LayerConfigurationErrors; onChange(next: LayerSchemaFieldDraft): void; onMove(direction: -1 | 1): void; onRemove(): void }) {
  const path = `fields.${field.clientId}`;
  const optionsValue = field.options.join("\n");
  return <article className="rounded-panel border bg-surface p-4" aria-labelledby={`schema-field-${field.clientId}`}><header className="flex items-center gap-3"><span className="grid size-8 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-primary">{index + 1}</span><div className="min-w-0 flex-1"><h3 id={`schema-field-${field.clientId}`} className="truncate text-sm font-semibold">{field.label || field.key || "Trường mới"}</h3><p className="text-xs text-muted-foreground">{field.serverId ? "Field hiện có · key được giữ ổn định" : "Field chưa lưu"}</p></div><Button type="button" variant="ghost" size="icon-sm" aria-label={`Đưa ${field.label || `trường ${index + 1}`} lên`} disabled={disabled || index === 0} onClick={() => onMove(-1)}><IconArrowUp/></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`Đưa ${field.label || `trường ${index + 1}`} xuống`} disabled={disabled || index === total - 1} onClick={() => onMove(1)}><IconArrowDown/></Button><Button type="button" variant="ghost" size="icon-sm" className="text-destructive" aria-label={`Xóa ${field.label || `trường ${index + 1}`}`} disabled={disabled || total === 1} onClick={onRemove}><IconTrash/></Button></header>
    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><Field data-invalid={Boolean(errors[`${path}.key`])}><FieldLabel htmlFor={`field-key-${field.clientId}`}>Key</FieldLabel><Input id={`field-key-${field.clientId}`} value={field.key} disabled={disabled || Boolean(field.serverId)} onChange={(event) => onChange(changeSchemaField(field, "key", event.target.value.toLocaleLowerCase("vi")))} aria-invalid={Boolean(errors[`${path}.key`])}/><FieldError>{errors[`${path}.key`]}</FieldError></Field>
    <Field data-invalid={Boolean(errors[`${path}.label`])}><FieldLabel htmlFor={`field-label-${field.clientId}`}>Nhãn tiếng Việt</FieldLabel><Input id={`field-label-${field.clientId}`} value={field.label} disabled={disabled} onChange={(event) => onChange(changeSchemaField(field, "label", event.target.value))}/><FieldError>{errors[`${path}.label`]}</FieldError></Field>
    <Field><FieldLabel>Kiểu dữ liệu</FieldLabel><Select value={field.type} disabled={disabled} onValueChange={(value: LayerFieldType) => onChange(changeSchemaField(field, "type", value))}><SelectTrigger aria-label={`Kiểu dữ liệu ${field.label || index + 1}`}><SelectValue/></SelectTrigger><SelectContent><SelectGroup>{layerFieldTypes.map((type) => <SelectItem key={type} value={type}>{fieldTypeLabels[type]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
    <Field><FieldLabel htmlFor={`field-icon-${field.clientId}`}>Tabler icon key</FieldLabel><Input id={`field-icon-${field.clientId}`} value={field.icon} disabled={disabled} placeholder="map-pin" onChange={(event) => onChange(changeSchemaField(field, "icon", event.target.value))}/></Field></div>
    <div className="mt-4 grid gap-4 md:grid-cols-2"><Field><FieldLabel htmlFor={`field-description-${field.clientId}`}>Mô tả</FieldLabel><Input id={`field-description-${field.clientId}`} value={field.description} disabled={disabled} onChange={(event) => onChange(changeSchemaField(field, "description", event.target.value))}/></Field><Field><FieldLabel htmlFor={`field-default-${field.clientId}`}>Giá trị mặc định</FieldLabel><Input id={`field-default-${field.clientId}`} value={field.defaultValue} disabled={disabled} onChange={(event) => onChange(changeSchemaField(field, "defaultValue", event.target.value))}/></Field></div>
    {(field.type === "enum" || field.type === "multi_enum") && <Field className="mt-4" data-invalid={Boolean(errors[`${path}.options`])}><FieldLabel htmlFor={`field-options-${field.clientId}`}>Lựa chọn enum · mỗi dòng một giá trị</FieldLabel><textarea id={`field-options-${field.clientId}`} className="min-h-24 rounded-control border bg-surface p-3 text-sm" value={optionsValue} disabled={disabled} onChange={(event) => onChange(changeSchemaField(field, "options", event.target.value.split(/\r?\n/u)))}/><FieldError>{errors[`${path}.options`]}</FieldError></Field>}
    <div className="mt-5"><FieldFlags field={field} disabled={disabled} onChange={onChange}/>{errors[`${path}.offlineCache`] && <FieldError className="mt-2">{errors[`${path}.offlineCache`]}</FieldError>}</div>
  </article>;
}

function SchemaSection({ draft, disabled, errors, onChange }: { draft: LayerConfigurationDraft; disabled: boolean; errors: LayerConfigurationErrors; onChange(next: LayerConfigurationDraft): void }) {
  return <section aria-labelledby="layer-schema-title"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 id="layer-schema-title" className="text-lg font-semibold">Schema metadata</h2><p className="mt-1 text-sm text-muted-foreground">Key ổn định; private và sensitive không được đi vào public projection.</p></div><Button type="button" variant="outline" disabled={disabled || draft.fields.length >= 100} onClick={() => onChange({ ...draft, fields: normalizeFieldOrder([...draft.fields, createEmptySchemaField()]) })}><IconPlus data-icon="inline-start" stroke={1.75}/>Thêm trường</Button></div>
    {errors.fields && <FieldError className="mt-4">{errors.fields}</FieldError>}<div className="mt-5 flex flex-col gap-4">{draft.fields.map((field, index) => <SchemaFieldCard key={field.clientId} field={field} index={index} total={draft.fields.length} disabled={disabled} errors={errors} onChange={(next) => onChange(replaceSchemaField(draft, next))} onMove={(direction) => onChange({ ...draft, fields: moveSchemaField(draft.fields, field.clientId, direction) })} onRemove={() => onChange(removeSchemaField(draft, field.clientId))}/>)}</div>
  </section>;
}

function ProjectionFieldChecks({ legend, selected, fields, disabled, onChange }: { legend: string; selected: string[]; fields: LayerSchemaFieldDraft[]; disabled: boolean; onChange(next: string[]): void }) {
  return <fieldset><legend className="text-sm font-medium">{legend}</legend><div className="mt-3 flex flex-wrap gap-2">{fields.filter((field) => field.public && field.key).map((field) => <label key={field.clientId} className="flex min-h-10 items-center gap-2 rounded-control border px-3 text-sm"><Checkbox checked={selected.includes(field.key)} disabled={disabled} onCheckedChange={(checked) => onChange(toggleListValue(selected, field.key, checked === true))}/>{field.label || field.key}</label>)}</div></fieldset>;
}

function PresentationSection({ draft, disabled, errors, onChange }: { draft: LayerConfigurationDraft; disabled: boolean; errors: LayerConfigurationErrors; onChange(next: LayerConfigurationDraft): void }) {
  const publicFields = draft.fields.filter((field) => field.public && !field.sensitive && field.key);
  const numberStyles = [
    { key: "pointRadius", label: "Bán kính điểm", min: 1, max: 30, step: 1 },
    { key: "lineWidth", label: "Độ rộng đường", min: 1, max: 20, step: 1 },
    { key: "polygonFillOpacity", label: "Độ mờ nền vùng", min: 0, max: 1, step: 0.05 },
    { key: "polygonStrokeWidth", label: "Độ rộng viền vùng", min: 1, max: 20, step: 1 },
  ] as const;
  return <div className="grid gap-5 xl:grid-cols-2"><section className={sectionClassName()}><h2 className="text-lg font-semibold">Style do catalog quản lý</h2><p className="mt-1 text-sm text-muted-foreground">Chỉ dùng giá trị được hỗ trợ, không nhận Mapbox expression tùy ý.</p><div className="mt-6 grid gap-4 sm:grid-cols-2">{(["pointColor", "lineColor", "polygonFillColor", "polygonStrokeColor"] as const).map((key) => <Field key={key}><FieldLabel htmlFor={`style-${key}`}>{({ pointColor: "Màu điểm", lineColor: "Màu đường", polygonFillColor: "Màu nền vùng", polygonStrokeColor: "Màu viền vùng" })[key]}</FieldLabel><div className="flex gap-2"><input className="size-11 rounded-control border bg-surface p-1" type="color" aria-label={`Chọn ${key}`} disabled={disabled} value={draft.style[key]} onChange={(event) => onChange({ ...draft, style: { ...draft.style, [key]: event.target.value.toUpperCase() } })}/><Input id={`style-${key}`} value={draft.style[key]} disabled={disabled} onChange={(event) => onChange({ ...draft, style: { ...draft.style, [key]: event.target.value.toUpperCase() } })}/></div></Field>)}</div><FieldError className="mt-3">{errors.styleColor}</FieldError>
    <div className="mt-5 grid gap-4 sm:grid-cols-2">{numberStyles.map(({ key, label, min, max, step }) => <Field key={key}><FieldLabel htmlFor={`style-${key}`}>{label}</FieldLabel><Input id={`style-${key}`} type="number" min={min} max={max} step={step} value={draft.style[key]} disabled={disabled} onChange={(event) => onChange({ ...draft, style: { ...draft.style, [key]: Number(event.target.value) } })}/></Field>)}</div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field><FieldLabel htmlFor="min-zoom">Zoom tối thiểu</FieldLabel><Input id="min-zoom" type="number" min={0} max={24} disabled={disabled} value={draft.renderConfig.minZoom} onChange={(event) => onChange({ ...draft, renderConfig: { ...draft.renderConfig, minZoom: Number(event.target.value) } })}/></Field><Field><FieldLabel htmlFor="max-zoom">Zoom tối đa</FieldLabel><Input id="max-zoom" type="number" min={0} max={24} disabled={disabled} value={draft.renderConfig.maxZoom} onChange={(event) => onChange({ ...draft, renderConfig: { ...draft.renderConfig, maxZoom: Number(event.target.value) } })}/></Field></div><FieldError className="mt-3">{errors.renderZoom}</FieldError><Field orientation="horizontal" className="mt-5"><Checkbox id="cluster-points" checked={draft.renderConfig.cluster} disabled={disabled || !draft.allowedGeometryKinds.some((kind) => kind === "point" || kind === "multipoint")} onCheckedChange={(checked) => onChange({ ...draft, renderConfig: { ...draft.renderConfig, cluster: checked === true } })}/><FieldLabel htmlFor="cluster-points">Gom cụm dữ liệu điểm</FieldLabel></Field></section>
    <section className={sectionClassName()}><h2 className="text-lg font-semibold">Popup và public projection</h2><p className="mt-1 text-sm text-muted-foreground">Field công khai mới được hiển thị. Tìm kiếm và bộ lọc lấy trực tiếp từ cờ của từng field.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field data-invalid={Boolean(errors["popupConfig.titleField"])}><FieldLabel htmlFor="popup-title-field">Field tiêu đề</FieldLabel><Select disabled={disabled} value={draft.popupConfig.titleField || "__none"} onValueChange={(value) => onChange({ ...draft, popupConfig: { ...draft.popupConfig, titleField: value === "__none" ? "" : value } })}><SelectTrigger id="popup-title-field" aria-invalid={Boolean(errors["popupConfig.titleField"])}><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none">Chọn field</SelectItem>{publicFields.map((field) => <SelectItem key={field.clientId} value={field.key}>{field.label || field.key}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldError>{errors["popupConfig.titleField"]}</FieldError></Field><Field><FieldLabel htmlFor="popup-subtitle-field">Field phụ đề</FieldLabel><Select disabled={disabled} value={draft.popupConfig.subtitleField || "__none"} onValueChange={(value) => onChange({ ...draft, popupConfig: { ...draft.popupConfig, subtitleField: value === "__none" ? "" : value } })}><SelectTrigger id="popup-subtitle-field"><SelectValue/></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__none">Không dùng</SelectItem>{publicFields.map((field) => <SelectItem key={field.clientId} value={field.key}>{field.label || field.key}</SelectItem>)}</SelectGroup></SelectContent></Select></Field></div>
    <div className="mt-6"><ProjectionFieldChecks legend="Field hiển thị trong popup" selected={draft.popupConfig.fieldKeys} fields={draft.fields} disabled={disabled} onChange={(fieldKeys) => onChange({ ...draft, popupConfig: { ...draft.popupConfig, fieldKeys } })}/></div><Field orientation="horizontal" className="mt-5"><Checkbox id="show-coordinates" checked={draft.popupConfig.showCoordinates} disabled={disabled} onCheckedChange={(checked) => onChange({ ...draft, popupConfig: { ...draft.popupConfig, showCoordinates: checked === true } })}/><FieldLabel htmlFor="show-coordinates">Hiển thị tọa độ</FieldLabel></Field></section></div>;
}

export function LayerConfigurationEditor({ initial, groups, principalRole, canAuthor, actions, onSaved, mode = initial.layerId ? "edit" : "create" }: { initial: LayerConfigurationDraft; groups: LayerGroupOption[]; principalRole: AdminRole; canAuthor: boolean; actions: LayerConfigurationActions; onSaved?(result: LayerConfigurationSaveResult): void; mode?: "create" | "edit" }) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [baseline, setBaseline] = useState(() => structuredClone(initial));
  const [activeTab, setActiveTab] = useState<EditorTab>("overview");
  const [errors, setErrors] = useState<LayerConfigurationErrors>({});
  const [pending, setPending] = useState<"save" | "archive" | "unarchive" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [archiveConfirmation, setArchiveConfirmation] = useState("");
  const operationKey = useRef<string | null>(null);
  const submitLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const immutable = draft.revisionStatus !== "draft";
  const canMutate = principalRole === "editor" && canAuthor && !immutable;
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(baseline), [baseline, draft]);
  const impact = useMemo(() => mode === "edit" && hasConfigurationImpact(baseline, draft), [baseline, draft, mode]);
  const errorTitle = error instanceof AdminApiError && error.status === 409 && error.code.includes("SLUG")
    ? "Mã lớp đã tồn tại"
    : error instanceof AdminApiError && error.status === 422
      ? "Cấu hình chưa hợp lệ"
      : "Chưa thể lưu cấu hình";

  function change(next: LayerConfigurationDraft) {
    setDraft(next); setErrors({}); setError(null); setSuccess(null); operationKey.current = null;
  }

  async function save() {
    if (!canMutate || submitLock.current) return;
    const nextErrors = validateLayerConfiguration(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setActiveTab(Object.keys(nextErrors).some((key) => key.startsWith("fields.")) || nextErrors.fields ? "schema" : nextErrors.allowedGeometryKinds ? "geometry" : Object.keys(nextErrors).some((key) => key.startsWith("popup") || key.startsWith("style") || key === "renderZoom") ? "presentation" : "overview");
      queueMicrotask(() => errorRef.current?.focus());
      return;
    }
    submitLock.current = true; setPending("save"); setError(null); setSuccess(null); operationKey.current ??= crypto.randomUUID();
    try {
      const result = await actions.save(draft, { etag: draft.etag, operationKey: operationKey.current });
      setDraft(structuredClone(result.configuration)); setBaseline(structuredClone(result.configuration)); setSuccess(mode === "create" ? "Đã tạo layer và draft cấu hình." : "Đã lưu cấu hình draft."); operationKey.current = null; onSaved?.(result);
    } catch (reason) { setError(reason); queueMicrotask(() => errorRef.current?.focus()); } finally { setPending(null); submitLock.current = false; }
  }

  async function archive(action: "archive" | "unarchive") {
    if (!canMutate || !draft.layerId || submitLock.current) return;
    const handler = action === "archive" ? actions.archive : actions.unarchive;
    if (!handler) return;
    submitLock.current = true; setPending(action); setError(null); setSuccess(null); operationKey.current ??= crypto.randomUUID();
    try { const result = await handler(draft.layerId, { etag: draft.etag, operationKey: operationKey.current }); setDraft(structuredClone(result.configuration)); setBaseline(structuredClone(result.configuration)); setArchiveConfirmation(""); setSuccess(action === "archive" ? "Đã lưu trữ layer. Publication hiện hành không bị xóa." : "Đã khôi phục layer vào catalog quản trị."); operationKey.current = null; } catch (reason) { setError(reason); queueMicrotask(() => errorRef.current?.focus()); } finally { setPending(null); submitLock.current = false; }
  }

  if (mode === "create" && principalRole !== "editor") return <main className="mx-auto max-w-2xl p-4 sm:p-6"><Button asChild variant="ghost" className="-ml-3"><Link href="/admin/layers"><IconArrowLeft data-icon="inline-start" stroke={1.75}/>Lớp dữ liệu</Link></Button><Alert className="mt-6" variant="destructive"><IconAlertTriangle stroke={1.75}/><AlertTitle>Không có quyền tạo layer</AlertTitle><AlertDescription>Chỉ Editor được tạo layer và schema. System Admin quản lý identity; Reviewer và Publisher dùng workflow chỉ đọc.</AlertDescription></Alert></main>;
  if (mode === "create" && !canAuthor) return <main className="mx-auto max-w-2xl p-4 sm:p-6"><Button asChild variant="ghost" className="-ml-3"><Link href="/admin/layers"><IconArrowLeft data-icon="inline-start" stroke={1.75}/>Lớp dữ liệu</Link></Button><Alert className="mt-6" role="note"><IconInfoCircle stroke={1.75}/><AlertTitle>Tạo layer cần máy tính</AlertTitle><AlertDescription>Schema và cấu hình layer chỉ mở trên thiết bị desktop có bàn phím cùng chuột hoặc bàn di chuột. Trên thiết bị này, bạn vẫn có thể xem và duyệt revision.</AlertDescription></Alert></main>;

  return <main className="mx-auto max-w-[1440px] p-4 pb-24 sm:p-6 md:p-8"><header className="flex flex-wrap items-start justify-between gap-4"><div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-2"><Link href="/admin/layers"><IconArrowLeft data-icon="inline-start" stroke={1.75}/>Lớp dữ liệu</Link></Button><div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-semibold tracking-[-0.02em]">{mode === "create" ? "Tạo lớp dữ liệu" : draft.title || "Cấu hình lớp dữ liệu"}</h1><Badge>{draft.revisionStatus}</Badge>{draft.archivedAt && <Badge className="border bg-surface text-warning">Đã lưu trữ</Badge>}</div><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Cấu hình catalog, geometry, schema và public projection. Feature data và Mapbox canvas nằm ở workspace biên tập riêng.</p></div>{canMutate && <Button type="button" disabled={pending !== null || (!dirty && mode === "edit")} onClick={save}>{pending === "save" ? <><Spinner/>Đang lưu...</> : <><IconDeviceFloppy data-icon="inline-start" stroke={1.75}/>{mode === "create" ? "Tạo layer" : "Lưu cấu hình"}</>}</Button>}</header>
    {!canMutate && <div className="mt-6"><ReadOnlyNotice role={principalRole} canAuthor={canAuthor} status={draft.revisionStatus}/></div>}
    {impact && canMutate && <Alert className="mt-4 border-warning/40" role="status"><IconAlertTriangle className="text-warning" stroke={1.75}/><AlertTitle>Thay đổi cần impact analysis</AlertTitle><AlertDescription>Đổi geometry, type, public flag hoặc xóa field có thể ảnh hưởng dữ liệu hiện có. Máy chủ phải xác nhận trước khi lưu; UI không tự bỏ dữ liệu.</AlertDescription></Alert>}
    {(error || Object.keys(errors).length > 0) && <div ref={errorRef} tabIndex={-1} className="mt-4 outline-none"><Alert variant="destructive"><IconAlertTriangle stroke={1.75}/><AlertTitle>{error ? errorTitle : "Chưa thể lưu cấu hình"}</AlertTitle><AlertDescription>{error ? adminErrorMessage(error) : `Kiểm tra ${Object.keys(errors).length} trường chưa hợp lệ.`}</AlertDescription></Alert></div>}
    {success && <Alert className="mt-4 border-success/30 text-success" role="status"><IconCircleCheck className="text-success" stroke={1.75}/><AlertTitle>Đã lưu</AlertTitle><AlertDescription>{success}</AlertDescription></Alert>}
    <div className="mt-6 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"><nav className="h-fit rounded-panel border bg-surface p-2 map-panel-shadow" aria-label="Phần cấu hình" role="tablist">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} aria-controls={`layer-panel-${id}`} onClick={() => setActiveTab(id)} className={cn("flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm font-medium hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", activeTab === id && "bg-accent-subtle text-primary")}><Icon size={20} stroke={1.75}/>{label}</button>)}</nav><div id={`layer-panel-${activeTab}`} role="tabpanel" tabIndex={0} className="min-w-0 outline-none">{activeTab === "overview" && <OverviewSection draft={draft} groups={groups} disabled={!canMutate} error={errors} onChange={change}/>} {activeTab === "geometry" && <GeometrySection draft={draft} disabled={!canMutate} error={errors} onChange={change}/>} {activeTab === "schema" && <SchemaSection draft={draft} disabled={!canMutate} errors={errors} onChange={change}/>} {activeTab === "presentation" && <PresentationSection draft={draft} disabled={!canMutate} errors={errors} onChange={change}/>}</div></div>
    {mode === "edit" && <section className="mt-7 rounded-panel border border-destructive/25 bg-surface p-5 sm:p-6"><div className="flex items-start gap-3"><IconDatabase className="mt-0.5 text-destructive"/><div><h2 className="font-semibold">Trạng thái catalog</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Lưu trữ là soft delete. Snapshot đã công bố không bị xóa âm thầm.</p></div></div>{draft.archivedAt ? <Button type="button" variant="outline" className="mt-5" disabled={!canMutate || pending !== null || !actions.unarchive} onClick={() => archive("unarchive")}>{pending === "unarchive" ? <Spinner/> : <IconRestore/>}Khôi phục layer</Button> : <div className="mt-5 flex flex-wrap items-end gap-3"><Field className="max-w-sm"><FieldLabel htmlFor="archive-confirmation">Gõ “LƯU TRỮ” để xác nhận</FieldLabel><Input id="archive-confirmation" value={archiveConfirmation} disabled={!canMutate} onChange={(event) => { setArchiveConfirmation(event.target.value); operationKey.current = null; }}/></Field><Button type="button" variant="destructive" disabled={!canMutate || pending !== null || archiveConfirmation.trim().toLocaleUpperCase("vi") !== "LƯU TRỮ" || !actions.archive} onClick={() => archive("archive")}>{pending === "archive" ? <Spinner/> : <IconArchive/>}Lưu trữ layer</Button></div>}</section>}
  </main>;
}
