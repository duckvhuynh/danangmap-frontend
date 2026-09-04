"use client";

import { useMemo, useRef, useState } from "react";
import {
  TriangleAlert as IconAlertTriangle,
  Archive as IconArchive,
  ArrowDown as IconArrowDown,
  ArrowLeft as IconArrowLeft,
  ArrowUp as IconArrowUp,
  CircleCheck as IconCircleCheck,
  Database as IconDatabase,
  Save as IconDeviceFloppy,
  Eye as IconEye,
  FormInput as IconForms,
  Shapes as IconGeometry,
  Info as IconInfoCircle,
  History as IconHistory,
  GitBranch as IconGitBranch,
  Plus as IconPlus,
  ArchiveRestore as IconRestore,
  Settings as IconSettings,
  Trash2 as IconTrash,
} from "lucide-react";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  changeGeometryMode,
  changeAllowedGeometryKinds,
  changeSchemaField,
  createEmptySchemaField,
  geometryKindLabels,
  hasConfigurationImpact,
  hasCatalogConfigurationChanges,
  hasRevisionConfigurationChanges,
  layerFieldTypes,
  moveSchemaField,
  normalizeFieldOrder,
  removeSchemaField,
  replaceSchemaField,
  slugifyLayerTitle,
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
import {
  AdminApiError,
  adminErrorMessage,
  type AdminRole,
} from "@/lib/api/admin";
import { canAuthorContent } from "@/lib/admin/role-capabilities";
import { geometryLabel, revisionStatusLabel } from "@/lib/admin/labels";
import { cn } from "@/lib/utils";

type EditorTab = "overview" | "geometry" | "schema" | "presentation";

const tabs: Array<{ id: EditorTab; label: string; icon: typeof IconSettings }> =
  [
    { id: "overview", label: "Thông tin", icon: IconSettings },
    { id: "geometry", label: "Loại đối tượng", icon: IconGeometry },
    { id: "schema", label: "Trường dữ liệu", icon: IconForms },
    { id: "presentation", label: "Hiển thị", icon: IconEye },
  ];

const geometryModes: Array<{
  value: LayerGeometryMode;
  label: string;
  description: string;
}> = [
  { value: "point", label: "Điểm", description: "Vị trí đơn lẻ hoặc một nhóm vị trí." },
  {
    value: "circle",
    label: "Hình tròn",
    description: "Vùng quanh một vị trí, có bán kính tính bằng mét.",
  },
  {
    value: "polyline",
    label: "Đường",
    description: "Một đường hoặc nhiều đoạn đường.",
  },
  {
    value: "polygon",
    label: "Vùng",
    description: "Một vùng hoặc nhiều vùng tách rời.",
  },
  {
    value: "mixed",
    label: "Kết hợp",
    description: "Cho phép điểm, đường và vùng trong cùng lớp.",
  },
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

function fieldDefaultPlaceholder(type: LayerFieldType) {
  const examples: Record<LayerFieldType, string> = {
    text: "Ví dụ: Đang hoạt động",
    long_text: "Ví dụ: Nội dung mặc định",
    number: "Ví dụ: 10.5",
    integer: "Ví dụ: 10",
    boolean: "Ví dụ: true",
    date: "Ví dụ: 2026-09-04",
    datetime: "Ví dụ: 2026-09-04T08:30",
    url: "Ví dụ: https://danang.gov.vn",
    email: "Ví dụ: lienhe@danang.gov.vn",
    phone: "Ví dụ: 0236 123 4567",
    enum: "Ví dụ: Đang hoạt động",
    multi_enum: "Ví dụ: Mức 1, Mức 2",
    address: "Ví dụ: 24 Trần Phú, Hải Châu",
    image: "Để trống nếu không có hình mặc định",
    attachment: "Để trống nếu không có tệp mặc định",
  };
  return examples[type];
}

const fieldIconOptions = [
  { value: "map-pin", label: "Vị trí" },
  { value: "phone", label: "Điện thoại" },
  { value: "mail", label: "Thư điện tử" },
  { value: "link", label: "Liên kết" },
  { value: "calendar", label: "Lịch" },
  { value: "number", label: "Chữ số" },
];

function sectionClassName() {
  return "rounded-panel border bg-surface p-5 map-panel-shadow sm:p-6";
}

function toggleListValue<T extends string>(
  values: T[],
  value: T,
  checked: boolean,
) {
  return checked
    ? Array.from(new Set([...values, value]))
    : values.filter((candidate) => candidate !== value);
}

function ReadOnlyNotice({
  role,
  canAuthor,
  status,
}: {
  role: AdminRole;
  canAuthor: boolean;
  status: string;
}) {
  const contentAuthor = canAuthorContent(role);
  const title =
    status !== "draft"
      ? "Phiên bản này chỉ được xem"
      : !contentAuthor
        ? "Bạn có quyền xem cấu hình"
        : "Sửa cấu hình cần máy tính";
  const description =
    status !== "draft"
      ? "Chỉ bản nháp mới có thể chỉnh sửa. Với dữ liệu đã công bố, hãy tạo bản nháp mới trước khi thay đổi."
      : !contentAuthor
        ? "Bạn cần quyền biên tập hoặc quản trị hệ thống để thay đổi cấu hình lớp."
        : "Tính năng này cần máy tính có bàn phím, chuột hoặc bàn di chuột.";
  return (
    <Alert role="note">
      <IconInfoCircle strokeWidth={1.75} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {description}
        {!canAuthor && contentAuthor && (
          <span className="mt-1 block">
            Mở lại trên thiết bị phù hợp để chỉnh sửa.
          </span>
        )}
      </AlertDescription>
    </Alert>
  );
}

function OverviewSection({
  draft,
  groups,
  catalogDisabled,
  revisionDisabled,
  error,
  onChange,
}: {
  draft: LayerConfigurationDraft;
  groups: LayerGroupOption[];
  catalogDisabled: boolean;
  revisionDisabled: boolean;
  error: LayerConfigurationErrors;
  onChange(next: LayerConfigurationDraft): void;
}) {
  return (
    <section
      className={sectionClassName()}
      aria-labelledby="layer-overview-title"
    >
      <h2 id="layer-overview-title" className="text-lg font-semibold">
        Thông tin lớp
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Đặt tên dễ nhận biết, chọn nhóm và cách lớp xuất hiện trên bản đồ.
      </p>
      <FieldGroup className="mt-6">
        <div className="grid gap-5 md:grid-cols-2">
          <Field data-invalid={Boolean(error.title)}>
            <FieldLabel htmlFor="layer-title">Tên lớp</FieldLabel>
            <Input
              id="layer-title"
              value={draft.title}
              placeholder="Ví dụ: Nhà vệ sinh công cộng"
              disabled={revisionDisabled}
              onChange={(event) => {
                const title = event.target.value;
                const currentGeneratedSlug = slugifyLayerTitle(draft.title);
                const shouldGenerateSlug =
                  !draft.layerId &&
                  (!draft.slug || draft.slug === currentGeneratedSlug);
                onChange({
                  ...draft,
                  title,
                  slug: shouldGenerateSlug
                    ? slugifyLayerTitle(title)
                    : draft.slug,
                });
              }}
              aria-invalid={Boolean(error.title)}
              aria-describedby={error.title ? "layer-title-error" : undefined}
            />
            <FieldError id="layer-title-error">{error.title}</FieldError>
          </Field>
          <Field data-invalid={Boolean(error.slug)}>
            <FieldLabel htmlFor="layer-slug">Mã lớp</FieldLabel>
            <Input
              id="layer-slug"
              value={draft.slug}
              placeholder="Ví dụ: nha-ve-sinh-cong-cong"
              disabled={catalogDisabled || Boolean(draft.layerId)}
              onChange={(event) =>
                onChange({
                  ...draft,
                  slug: event.target.value.toLocaleLowerCase("vi"),
                })
              }
              aria-invalid={Boolean(error.slug)}
              aria-describedby={
                error.slug ? "layer-slug-error" : "layer-slug-help"
              }
            />
            <FieldDescription id="layer-slug-help">
              Dùng chữ thường không dấu, số và dấu gạch ngang, ví dụ: tru-so-phuong. Mã này không đổi sau khi tạo.
            </FieldDescription>
            <FieldError id="layer-slug-error">{error.slug}</FieldError>
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="layer-description">Mô tả</FieldLabel>
          <Textarea
            id="layer-description"
            className="min-h-24 resize-y"
            value={draft.description}
            placeholder="Ví dụ: Vị trí các nhà vệ sinh công cộng phục vụ người dân và du khách trên địa bàn thành phố."
            disabled={revisionDisabled}
            onChange={(event) =>
              onChange({ ...draft, description: event.target.value })
            }
          />
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="layer-group">Nhóm lớp</FieldLabel>
            <Select
              disabled={catalogDisabled}
              value={draft.groupId || "__none"}
              onValueChange={(value) =>
                onChange({ ...draft, groupId: value === "__none" ? "" : value })
              }
            >
              <SelectTrigger id="layer-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__none">Không thuộc nhóm</SelectItem>
                  {groups
                    .filter(
                      (group) =>
                        !group.archivedAt || group.id === draft.groupId,
                    )
                    .sort((a, b) => a.displayOrder - b.displayOrder)
                    .map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.title}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="layer-order">Thứ tự hiển thị</FieldLabel>
            <Input
              id="layer-order"
              type="number"
              step={1}
              value={draft.displayOrder}
              placeholder="Ví dụ: 10"
              disabled={catalogDisabled}
              onChange={(event) =>
                onChange({
                  ...draft,
                  displayOrder: Number(event.target.value) || 0,
                })
              }
            />
          </Field>
        </div>
        <Field orientation="horizontal">
          <Checkbox
            id="layer-default-visible"
            checked={draft.defaultVisible}
            disabled={catalogDisabled}
            onCheckedChange={(checked) =>
              onChange({ ...draft, defaultVisible: checked === true })
            }
          />
          <FieldLabel htmlFor="layer-default-visible">
            Bật lớp mặc định khi mở bản đồ
          </FieldLabel>
        </Field>
      </FieldGroup>
    </section>
  );
}

function GeometrySection({
  draft,
  disabled,
  error,
  onChange,
}: {
  draft: LayerConfigurationDraft;
  disabled: boolean;
  error: LayerConfigurationErrors;
  onChange(next: LayerConfigurationDraft): void;
}) {
  return (
    <section
      className={sectionClassName()}
      aria-labelledby="layer-geometry-title"
    >
      <h2 id="layer-geometry-title" className="text-lg font-semibold">
        Đối tượng được phép
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Chọn loại đối tượng của lớp. Khi lưu, hệ thống sẽ kiểm tra để tránh làm sai dữ liệu hiện có.
      </p>
      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Loại lớp</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {geometryModes.map((mode) => (
            <label
              key={mode.value}
              className={cn(
                "rounded-control border p-4",
                draft.geometryMode === mode.value &&
                  "border-primary bg-accent-subtle",
              )}
            >
              <input
                type="radio"
                name="geometry-mode"
                className="accent-primary"
                checked={draft.geometryMode === mode.value}
                disabled={disabled}
                onChange={() => onChange(changeGeometryMode(draft, mode.value))}
              />
              <span className="ml-2 text-sm font-medium">{mode.label}</span>
              <span className="mt-2 block text-xs leading-5 text-muted-foreground">
                {mode.description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset
        className="mt-7"
        aria-describedby={
          error.allowedGeometryKinds ? "geometry-kinds-error" : undefined
        }
      >
        <legend className="text-sm font-medium">Các loại đối tượng cho phép</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {geometryKindLabels.map((kind) => {
            const compatible =
              draft.geometryMode === "mixed" ||
              changeGeometryMode(
                draft,
                draft.geometryMode,
              ).allowedGeometryKinds.includes(kind.value);
            const checked = draft.allowedGeometryKinds.includes(kind.value);
            return (
              <label
                className={cn(
                  "flex items-start gap-3 rounded-control border p-4",
                  checked && "border-primary bg-accent-subtle",
                  !compatible && "opacity-50",
                )}
                key={kind.value}
              >
                <Checkbox
                  checked={checked}
                  disabled={disabled || !compatible}
                  onCheckedChange={(value) =>
                    onChange(
                      changeAllowedGeometryKinds(
                        draft,
                        toggleListValue(
                          draft.allowedGeometryKinds,
                          kind.value,
                          value === true,
                        ),
                      ),
                    )
                  }
                />
                <span className="text-sm">{geometryLabel(kind.value)}</span>
              </label>
            );
          })}
        </div>
        <FieldError id="geometry-kinds-error" className="mt-3">
          {error.allowedGeometryKinds}
        </FieldError>
      </fieldset>
      {draft.allowedGeometryKinds.includes("circle") && (
        <Alert className="mt-6" role="note">
          <IconInfoCircle />
          <AlertTitle>Bán kính tính bằng mét</AlertTitle>
          <AlertDescription>
            Hình tròn được xác định bằng vị trí tâm và bán kính. Bạn có thể điều chỉnh bán kính khi biên tập trên bản đồ.
          </AlertDescription>
        </Alert>
      )}
    </section>
  );
}

function FieldFlags({
  field,
  disabled,
  onChange,
}: {
  field: LayerSchemaFieldDraft;
  disabled: boolean;
  onChange(next: LayerSchemaFieldDraft): void;
}) {
  const flags: Array<{
    key:
      | "required"
      | "public"
      | "searchable"
      | "filterable"
      | "sortable"
      | "sensitive"
      | "offlineCache";
    label: string;
    disabled?: boolean;
  }> = [
    { key: "required", label: "Bắt buộc" },
    { key: "public", label: "Công khai", disabled: field.sensitive },
    { key: "searchable", label: "Tìm kiếm", disabled: !field.public },
    { key: "filterable", label: "Bộ lọc", disabled: !field.public },
    { key: "sortable", label: "Sắp xếp", disabled: !field.public },
    { key: "sensitive", label: "Nhạy cảm" },
    {
      key: "offlineCache",
      label: "Cho phép lưu nháp trên thiết bị",
      disabled: field.sensitive,
    },
  ];
  return (
    <fieldset>
      <legend className="text-xs font-medium text-muted-foreground">
        Cách sử dụng trường
      </legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {flags.map((flag) => (
          <label
            key={flag.key}
            className="flex min-h-10 items-center gap-2 rounded-control border px-3 text-xs"
          >
            <Checkbox
              checked={field[flag.key]}
              disabled={disabled || flag.disabled}
              onCheckedChange={(checked) =>
                onChange(changeSchemaField(field, flag.key, checked === true))
              }
            />
            {flag.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function SchemaFieldCard({
  field,
  index,
  total,
  disabled,
  errors,
  onChange,
  onMove,
  onRemove,
}: {
  field: LayerSchemaFieldDraft;
  index: number;
  total: number;
  disabled: boolean;
  errors: LayerConfigurationErrors;
  onChange(next: LayerSchemaFieldDraft): void;
  onMove(direction: -1 | 1): void;
  onRemove(): void;
}) {
  const path = `fields.${field.clientId}`;
  const optionsValue = field.options.join("\n");
  return (
    <article
      className="rounded-panel border bg-surface p-4"
      aria-labelledby={`schema-field-${field.clientId}`}
    >
      <header className="flex items-center gap-3">
        <span className="grid size-8 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-primary">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={`schema-field-${field.clientId}`}
            className="truncate text-sm font-semibold"
          >
            {field.label || field.key || "Trường mới"}
          </h3>
          <p className="text-xs text-muted-foreground">
            {field.serverId
              ? "Đã lưu · mã trường không đổi"
              : "Trường mới · chưa lưu"}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Đưa ${field.label || `trường ${index + 1}`} lên`}
          disabled={disabled || index === 0}
          onClick={() => onMove(-1)}
        >
          <IconArrowUp />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Đưa ${field.label || `trường ${index + 1}`} xuống`}
          disabled={disabled || index === total - 1}
          onClick={() => onMove(1)}
        >
          <IconArrowDown />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-destructive"
          aria-label={`Xóa ${field.label || `trường ${index + 1}`}`}
          disabled={disabled || total === 1}
          onClick={onRemove}
        >
          <IconTrash />
        </Button>
      </header>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Field data-invalid={Boolean(errors[`${path}.key`])}>
          <FieldLabel htmlFor={`field-key-${field.clientId}`}>Mã trường</FieldLabel>
          <Input
            id={`field-key-${field.clientId}`}
            value={field.key}
            placeholder="Ví dụ: dia_chi"
            disabled={disabled || Boolean(field.serverId)}
            onChange={(event) =>
              onChange(
                changeSchemaField(
                  field,
                  "key",
                  event.target.value.toLocaleLowerCase("vi"),
                ),
              )
            }
            aria-invalid={Boolean(errors[`${path}.key`])}
          />
          <FieldDescription>Dùng để liên kết dữ liệu và không thể đổi sau khi lưu.</FieldDescription>
          <FieldError>{errors[`${path}.key`]}</FieldError>
        </Field>
        <Field data-invalid={Boolean(errors[`${path}.label`])}>
          <FieldLabel htmlFor={`field-label-${field.clientId}`}>
            Tên hiển thị
          </FieldLabel>
          <Input
            id={`field-label-${field.clientId}`}
            value={field.label}
            placeholder="Ví dụ: Địa chỉ"
            disabled={disabled}
            onChange={(event) =>
              onChange(changeSchemaField(field, "label", event.target.value))
            }
          />
          <FieldError>{errors[`${path}.label`]}</FieldError>
        </Field>
        <Field>
          <FieldLabel>Kiểu dữ liệu</FieldLabel>
          <Select
            value={field.type}
            disabled={disabled}
            onValueChange={(value: LayerFieldType) =>
              onChange(changeSchemaField(field, "type", value))
            }
          >
            <SelectTrigger
              aria-label={`Kiểu dữ liệu ${field.label || index + 1}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {layerFieldTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {fieldTypeLabels[type]}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`field-icon-${field.clientId}`}>
            Biểu tượng
          </FieldLabel>
          <Select value={field.icon || "__auto"} disabled={disabled} onValueChange={(value) => onChange(changeSchemaField(field, "icon", value === "__auto" ? "" : value))}>
            <SelectTrigger id={`field-icon-${field.clientId}`}><SelectValue /></SelectTrigger>
            <SelectContent><SelectGroup>
              <SelectItem value="__auto">Theo kiểu dữ liệu</SelectItem>
              {fieldIconOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              {field.icon && !fieldIconOptions.some((option) => option.value === field.icon) && <SelectItem value={field.icon}>Biểu tượng đang dùng</SelectItem>}
            </SelectGroup></SelectContent>
          </Select>
        </Field>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`field-description-${field.clientId}`}>
            Mô tả
          </FieldLabel>
          <Input
            id={`field-description-${field.clientId}`}
            value={field.description}
            placeholder="Ví dụ: Địa chỉ đầy đủ để người dân dễ tìm kiếm"
            disabled={disabled}
            onChange={(event) =>
              onChange(
                changeSchemaField(field, "description", event.target.value),
              )
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`field-default-${field.clientId}`}>
            Giá trị mặc định
          </FieldLabel>
          <Input
            id={`field-default-${field.clientId}`}
            value={field.defaultValue}
            placeholder={fieldDefaultPlaceholder(field.type)}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                changeSchemaField(field, "defaultValue", event.target.value),
              )
            }
          />
        </Field>
      </div>
      {(field.type === "enum" || field.type === "multi_enum") && (
        <Field
          className="mt-4"
          data-invalid={Boolean(errors[`${path}.options`])}
        >
          <FieldLabel htmlFor={`field-options-${field.clientId}`}>
            Các lựa chọn (mỗi dòng một giá trị)
          </FieldLabel>
          <Textarea
            id={`field-options-${field.clientId}`}
            className="min-h-24 resize-y"
            value={optionsValue}
            placeholder={"Ví dụ:\nĐang hoạt động\nTạm ngưng\nĐã đóng"}
            disabled={disabled}
            onChange={(event) =>
              onChange(
                changeSchemaField(
                  field,
                  "options",
                  event.target.value.split(/\r?\n/u),
                ),
              )
            }
          />
          <FieldError>{errors[`${path}.options`]}</FieldError>
        </Field>
      )}
      <div className="mt-5">
        <FieldFlags field={field} disabled={disabled} onChange={onChange} />
        {errors[`${path}.offlineCache`] && (
          <FieldError className="mt-2">
            {errors[`${path}.offlineCache`]}
          </FieldError>
        )}
      </div>
    </article>
  );
}

function SchemaSection({
  draft,
  disabled,
  errors,
  onChange,
}: {
  draft: LayerConfigurationDraft;
  disabled: boolean;
  errors: LayerConfigurationErrors;
  onChange(next: LayerConfigurationDraft): void;
}) {
  return (
    <section aria-labelledby="layer-schema-title">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="layer-schema-title" className="text-lg font-semibold">
            Trường dữ liệu
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tạo các thông tin cần nhập cho mỗi đối tượng, như tên, địa chỉ và số điện thoại. Chỉ trường được đánh dấu công khai mới hiển thị cho người dân.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || draft.fields.length >= 100}
          onClick={() =>
            onChange({
              ...draft,
              fields: normalizeFieldOrder([
                ...draft.fields,
                createEmptySchemaField(),
              ]),
            })
          }
        >
          <IconPlus data-icon="inline-start" strokeWidth={1.75} />
          Thêm trường
        </Button>
      </div>
      {errors.fields && (
        <FieldError className="mt-4">{errors.fields}</FieldError>
      )}
      <div className="mt-5 flex flex-col gap-4">
        {draft.fields.map((field, index) => (
          <SchemaFieldCard
            key={field.clientId}
            field={field}
            index={index}
            total={draft.fields.length}
            disabled={disabled}
            errors={errors}
            onChange={(next) => onChange(replaceSchemaField(draft, next))}
            onMove={(direction) =>
              onChange({
                ...draft,
                fields: moveSchemaField(
                  draft.fields,
                  field.clientId,
                  direction,
                ),
              })
            }
            onRemove={() => onChange(removeSchemaField(draft, field.clientId))}
          />
        ))}
      </div>
    </section>
  );
}

function ProjectionFieldChecks({
  legend,
  selected,
  fields,
  disabled,
  onChange,
}: {
  legend: string;
  selected: string[];
  fields: LayerSchemaFieldDraft[];
  disabled: boolean;
  onChange(next: string[]): void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="mt-3 flex flex-wrap gap-2">
        {fields
          .filter((field) => field.public && field.key)
          .map((field) => (
            <label
              key={field.clientId}
              className="flex min-h-10 items-center gap-2 rounded-control border px-3 text-sm"
            >
              <Checkbox
                checked={selected.includes(field.key)}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange(
                    toggleListValue(selected, field.key, checked === true),
                  )
                }
              />
              {field.label || field.key}
            </label>
          ))}
      </div>
    </fieldset>
  );
}

function PresentationSection({
  draft,
  disabled,
  errors,
  onChange,
}: {
  draft: LayerConfigurationDraft;
  disabled: boolean;
  errors: LayerConfigurationErrors;
  onChange(next: LayerConfigurationDraft): void;
}) {
  const publicFields = draft.fields.filter(
    (field) => field.public && !field.sensitive && field.key,
  );
  const activeStyleFamilies = {
    point: draft.allowedGeometryKinds.some(
      (kind) => kind === "point" || kind === "multipoint" || kind === "circle",
    ),
    line: draft.allowedGeometryKinds.some(
      (kind) => kind === "line" || kind === "multiline",
    ),
    polygon: draft.allowedGeometryKinds.some(
      (kind) => kind === "polygon" || kind === "multipolygon",
    ),
  };
  const hasClusterablePoints = draft.allowedGeometryKinds.some(
    (kind) => kind === "point" || kind === "multipoint" || kind === "circle",
  );
  const colorStyles = [
    { key: "pointColor", label: "Màu điểm", family: "point" },
    { key: "pointStrokeColor", label: "Màu viền điểm", family: "point" },
    { key: "lineColor", label: "Màu đường", family: "line" },
    { key: "polygonFillColor", label: "Màu nền vùng", family: "polygon" },
    { key: "polygonStrokeColor", label: "Màu viền vùng", family: "polygon" },
  ] as const;
  const numberStyles = [
    {
      key: "pointRadius",
      label: "Bán kính điểm",
      min: 1,
      max: 30,
      step: 1,
      family: "point",
    },
    {
      key: "pointStrokeWidth",
      label: "Độ rộng viền điểm",
      min: 0,
      max: 16,
      step: 0.5,
      family: "point",
    },
    {
      key: "lineWidth",
      label: "Độ rộng đường",
      min: 1,
      max: 20,
      step: 1,
      family: "line",
    },
    {
      key: "lineOpacity",
      label: "Độ mờ đường",
      min: 0,
      max: 1,
      step: 0.05,
      family: "line",
    },
    {
      key: "polygonFillOpacity",
      label: "Độ mờ nền vùng",
      min: 0,
      max: 1,
      step: 0.05,
      family: "polygon",
    },
    {
      key: "polygonStrokeWidth",
      label: "Độ rộng viền vùng",
      min: 1,
      max: 20,
      step: 1,
      family: "polygon",
    },
  ] as const;
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className={sectionClassName()}>
        <h2 className="text-lg font-semibold">Màu sắc và kích thước</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Điều chỉnh cách các đối tượng hiển thị trên bản đồ. Chỉ các lựa chọn phù hợp với loại đối tượng của lớp được hiển thị.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {colorStyles
            .filter(({ family }) => activeStyleFamilies[family])
            .map(({ key, label }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`style-${key}`}>{label}</FieldLabel>
                <div className="flex gap-2">
                  <input
                    className="size-11 rounded-control border bg-surface p-1"
                    type="color"
                    aria-label={`Chọn ${label.toLocaleLowerCase("vi")}`}
                    disabled={disabled}
                    value={draft.style[key]}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        style: {
                          ...draft.style,
                          [key]: event.target.value.toUpperCase(),
                        },
                      })
                    }
                  />
                  <Input
                    id={`style-${key}`}
                    value={draft.style[key]}
                    placeholder="Ví dụ: #1A73E8"
                    disabled={disabled}
                    onChange={(event) =>
                      onChange({
                        ...draft,
                        style: {
                          ...draft.style,
                          [key]: event.target.value.toUpperCase(),
                        },
                      })
                    }
                  />
                </div>
              </Field>
            ))}
        </div>
        <FieldError className="mt-3">{errors.styleColor}</FieldError>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {numberStyles
            .filter(({ family }) => activeStyleFamilies[family])
            .map(({ key, label, min, max, step }) => (
              <Field key={key}>
                <FieldLabel htmlFor={`style-${key}`}>{label}</FieldLabel>
                <Input
                  id={`style-${key}`}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={draft.style[key]}
                  placeholder={`Ví dụ: ${min}`}
                  disabled={disabled}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      style: {
                        ...draft.style,
                        [key]: Number(event.target.value),
                      },
                    })
                  }
                />
              </Field>
            ))}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="min-zoom">Mức thu phóng tối thiểu</FieldLabel>
            <Input
              id="min-zoom"
              type="number"
              min={0}
              max={24}
              disabled={disabled}
              value={draft.renderConfig.minZoom}
              placeholder="Ví dụ: 8"
              onChange={(event) =>
                onChange({
                  ...draft,
                  renderConfig: {
                    ...draft.renderConfig,
                    minZoom: Number(event.target.value),
                  },
                })
              }
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="max-zoom">Mức thu phóng tối đa</FieldLabel>
            <Input
              id="max-zoom"
              type="number"
              min={0}
              max={24}
              disabled={disabled}
              value={draft.renderConfig.maxZoom}
              placeholder="Ví dụ: 20"
              onChange={(event) =>
                onChange({
                  ...draft,
                  renderConfig: {
                    ...draft.renderConfig,
                    maxZoom: Number(event.target.value),
                  },
                })
              }
            />
          </Field>
        </div>
        <FieldError className="mt-3">{errors.renderZoom}</FieldError>
        <details className="mt-5 rounded-control border p-4">
          <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Tùy chọn tải dữ liệu nâng cao</summary>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">Nên giữ Tự động. Chỉ đổi khi cần điều chỉnh cách tải cho lớp có nhiều dữ liệu.</p>
        <Field className="mt-3">
          <FieldLabel htmlFor="source-policy">
            Cách tải dữ liệu bản đồ
          </FieldLabel>
          <Select
            disabled={disabled}
            value={draft.renderConfig.sourcePolicy}
            onValueChange={(
              sourcePolicy: LayerConfigurationDraft["renderConfig"]["sourcePolicy"],
            ) =>
              onChange({
                ...draft,
                renderConfig: { ...draft.renderConfig, sourcePolicy },
              })
            }
          >
            <SelectTrigger id="source-policy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="auto">Tự động (khuyên dùng)</SelectItem>
                <SelectItem value="geojson">Ưu tiên tải toàn bộ lớp</SelectItem>
                <SelectItem value="mvt">Ưu tiên tải theo vùng đang xem</SelectItem>
                <SelectItem value="hybrid">Tự động kết hợp</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        </details>
        {hasClusterablePoints && (
          <div className="mt-5 flex flex-col gap-3">
            <Field orientation="horizontal">
              <Checkbox
                id="cluster-points"
                checked={draft.renderConfig.cluster}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange({
                    ...draft,
                    renderConfig: {
                      ...draft.renderConfig,
                      cluster: checked === true,
                    },
                  })
                }
              />
              <FieldLabel htmlFor="cluster-points">
                Gom các điểm gần nhau khi thu nhỏ bản đồ
              </FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="style-cluster-points"
                checked={draft.style.pointCluster}
                disabled={disabled}
                onCheckedChange={(checked) =>
                  onChange({
                    ...draft,
                    style: { ...draft.style, pointCluster: checked === true },
                  })
                }
              />
              <FieldLabel htmlFor="style-cluster-points">
                Hiển thị ký hiệu cho nhóm điểm
              </FieldLabel>
            </Field>
          </div>
        )}
      </section>
      <section className={sectionClassName()}>
        <h2 className="text-lg font-semibold">Thông tin người dân nhìn thấy</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn thông tin hiển thị khi người dân bấm vào một đối tượng. Chỉ các trường công khai có thể được chọn.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors["popupConfig.titleField"])}>
            <FieldLabel htmlFor="popup-title-field">Trường làm tiêu đề</FieldLabel>
            <Select
              disabled={disabled}
              value={draft.popupConfig.titleField || "__none"}
              onValueChange={(value) =>
                onChange({
                  ...draft,
                  popupConfig: {
                    ...draft.popupConfig,
                    titleField: value === "__none" ? "" : value,
                  },
                })
              }
            >
              <SelectTrigger
                id="popup-title-field"
                aria-invalid={Boolean(errors["popupConfig.titleField"])}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__none">Chọn trường</SelectItem>
                  {publicFields.map((field) => (
                    <SelectItem key={field.clientId} value={field.key}>
                      {field.label || field.key}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldError>{errors["popupConfig.titleField"]}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="popup-subtitle-field">Trường làm phụ đề</FieldLabel>
            <Select
              disabled={disabled}
              value={draft.popupConfig.subtitleField || "__none"}
              onValueChange={(value) =>
                onChange({
                  ...draft,
                  popupConfig: {
                    ...draft.popupConfig,
                    subtitleField: value === "__none" ? "" : value,
                  },
                })
              }
            >
              <SelectTrigger id="popup-subtitle-field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__none">Không dùng</SelectItem>
                  {publicFields.map((field) => (
                    <SelectItem key={field.clientId} value={field.key}>
                      {field.label || field.key}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div className="mt-6">
          <ProjectionFieldChecks
            legend="Thông tin trong bảng chi tiết"
            selected={draft.popupConfig.fieldKeys}
            fields={draft.fields}
            disabled={disabled}
            onChange={(fieldKeys) =>
              onChange({
                ...draft,
                popupConfig: { ...draft.popupConfig, fieldKeys },
              })
            }
          />
        </div>
        <Field orientation="horizontal" className="mt-5">
          <Checkbox
            id="show-coordinates"
            checked={draft.popupConfig.showCoordinates}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({
                ...draft,
                popupConfig: {
                  ...draft.popupConfig,
                  showCoordinates: checked === true,
                },
              })
            }
          />
          <FieldLabel htmlFor="show-coordinates">Hiển thị tọa độ</FieldLabel>
        </Field>
      </section>
    </div>
  );
}

type PendingAction =
  "create" | "catalog" | "revision" | "archive" | "unarchive" | "successor";

function revisionBaseline(
  previous: LayerConfigurationDraft,
  saved: LayerConfigurationDraft,
) {
  return {
    ...previous,
    revisionId: saved.revisionId,
    revisionStatus: saved.revisionStatus,
    revisionEtag: saved.revisionEtag,
    title: saved.title,
    description: saved.description,
    geometryMode: saved.geometryMode,
    allowedGeometryKinds: saved.allowedGeometryKinds,
    fields: saved.fields,
    style: saved.style,
    renderConfig: saved.renderConfig,
    popupConfig: saved.popupConfig,
  };
}

function catalogBaseline(
  previous: LayerConfigurationDraft,
  saved: LayerConfigurationDraft,
) {
  return {
    ...previous,
    groupId: saved.groupId,
    displayOrder: saved.displayOrder,
    defaultVisible: saved.defaultVisible,
    archivedAt: saved.archivedAt,
    layerEtag: saved.layerEtag,
  };
}

function lifecycleBaseline(
  previous: LayerConfigurationDraft,
  saved: LayerConfigurationDraft,
) {
  return {
    ...previous,
    archivedAt: saved.archivedAt,
    layerEtag: saved.layerEtag,
  };
}

const impactReasonLabels: Record<string, string> = {
  GEOMETRY_KIND_IN_USE: "Loại đối tượng này đang có dữ liệu",
  FIELD_REMOVAL_WITH_DATA: "Trường cần xóa đang có dữ liệu",
  FIELD_CONSTRAINT_CHANGE_WITH_DATA: "Quy tắc mới của trường không phù hợp với dữ liệu hiện có",
  REQUIRED_FIELD_MISSING: "Đối tượng hiện có còn thiếu trường bắt buộc",
};

export function LayerConfigurationEditor({
  initial,
  groups,
  principalRole,
  canAuthor,
  actions,
  onSaved,
  onReload,
  mode = initial.layerId ? "edit" : "create",
}: {
  initial: LayerConfigurationDraft;
  groups: LayerGroupOption[];
  principalRole: AdminRole;
  canAuthor: boolean;
  actions: LayerConfigurationActions;
  onSaved?(result: LayerConfigurationSaveResult): void;
  onReload?(): void;
  mode?: "create" | "edit";
}) {
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [baseline, setBaseline] = useState(() => structuredClone(initial));
  const [activeTab, setActiveTab] = useState<EditorTab>("overview");
  const [errors, setErrors] = useState<LayerConfigurationErrors>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [serverImpact, setServerImpact] =
    useState<LayerConfigurationSaveResult["impact"]>(undefined);
  const [archiveConfirmation, setArchiveConfirmation] = useState("");
  const operationKeys = useRef<Partial<Record<PendingAction, string>>>({});
  const submitLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const canCatalogMutate = canAuthorContent(principalRole) && canAuthor;
  const canRevisionMutate =
    canCatalogMutate && draft.revisionStatus === "draft";
  const catalogDirty = useMemo(
    () => mode === "edit" && hasCatalogConfigurationChanges(baseline, draft),
    [baseline, draft, mode],
  );
  const revisionDirty = useMemo(
    () => mode === "edit" && hasRevisionConfigurationChanges(baseline, draft),
    [baseline, draft, mode],
  );
  const heuristicImpact = useMemo(
    () => mode === "edit" && hasConfigurationImpact(baseline, draft),
    [baseline, draft, mode],
  );
  const staleError =
    error instanceof AdminApiError &&
    (error.status === 412 ||
      [
        "ETAG_MISMATCH",
        "REVISION_NOT_EDITABLE",
        "DRAFT_ALREADY_EXISTS",
        "PUBLICATION_BASE_STALE",
      ].includes(error.code));
  const errorTitle =
    error instanceof AdminApiError && error.code.includes("SLUG")
      ? "Mã lớp đã tồn tại"
      : error instanceof AdminApiError && error.status === 422
        ? "Cấu hình chưa hợp lệ"
        : staleError
          ? "Dữ liệu đã thay đổi trên máy chủ"
          : "Chưa thể hoàn tất thao tác";

  function operationKey(action: PendingAction) {
    return (operationKeys.current[action] ??= crypto.randomUUID());
  }

  function change(next: LayerConfigurationDraft) {
    if (hasCatalogConfigurationChanges(draft, next))
      delete operationKeys.current.catalog;
    if (hasRevisionConfigurationChanges(draft, next))
      delete operationKeys.current.revision;
    if (mode === "create") delete operationKeys.current.create;
    setDraft(next);
    setErrors({});
    setError(null);
    setSuccess(null);
    setServerImpact(undefined);
  }

  function validateRevision() {
    const nextErrors = validateLayerConfiguration(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) return true;
    setActiveTab(
      Object.keys(nextErrors).some((key) => key.startsWith("fields.")) ||
        nextErrors.fields
        ? "schema"
        : nextErrors.allowedGeometryKinds
          ? "geometry"
          : Object.keys(nextErrors).some(
                (key) =>
                  key.startsWith("popup") ||
                  key.startsWith("style") ||
                  key === "renderZoom",
              )
            ? "presentation"
            : "overview",
    );
    queueMicrotask(() => errorRef.current?.focus());
    return false;
  }

  async function run(
    action: PendingAction,
    task: () => Promise<LayerConfigurationSaveResult>,
    successMessage: string,
    update: "all" | "catalog" | "revision" | "lifecycle",
  ) {
    if (submitLock.current) return;
    submitLock.current = true;
    setPending(action);
    setError(null);
    setSuccess(null);
    try {
      const result = await task();
      setDraft(structuredClone(result.configuration));
      setBaseline((previous) =>
        structuredClone(
          update === "all"
            ? result.configuration
            : update === "catalog"
              ? catalogBaseline(previous, result.configuration)
              : update === "revision"
                ? revisionBaseline(previous, result.configuration)
                : lifecycleBaseline(previous, result.configuration),
        ),
      );
      setServerImpact(result.impact);
      setSuccess(successMessage);
      delete operationKeys.current[action];
      onSaved?.(result);
    } catch (reason) {
      if (reason instanceof AdminApiError) delete operationKeys.current[action];
      setError(reason);
      queueMicrotask(() => errorRef.current?.focus());
    } finally {
      setPending(null);
      submitLock.current = false;
    }
  }

  async function create() {
    if (!canCatalogMutate || !actions.create || !validateRevision()) return;
    await run(
      "create",
      () => actions.create!(draft, { operationKey: operationKey("create") }),
      "Đã tạo lớp dữ liệu. Bạn có thể bắt đầu biên tập hoặc nhập dữ liệu.",
      "all",
    );
  }

  async function saveCatalog() {
    if (!canCatalogMutate || !actions.updateCatalog || !draft.layerEtag) return;
    await run(
      "catalog",
      () =>
        actions.updateCatalog!(draft, {
          etag: draft.layerEtag!,
          operationKey: operationKey("catalog"),
        }),
      "Đã lưu nhóm, thứ tự và chế độ hiển thị của lớp.",
      "catalog",
    );
  }

  async function saveRevision() {
    if (
      !canRevisionMutate ||
      !actions.previewImpact ||
      !actions.replaceRevision ||
      !draft.revisionEtag ||
      !validateRevision() ||
      submitLock.current
    )
      return;
    submitLock.current = true;
    setPending("revision");
    setError(null);
    setSuccess(null);
    try {
      const retryKey = operationKeys.current.revision;
      const impact = retryKey
        ? serverImpact
        : await actions.previewImpact(draft, { etag: draft.revisionEtag });
      if (impact) setServerImpact(impact);
      if (impact?.blocking) return;
      const result = await actions.replaceRevision(draft, {
        etag: draft.revisionEtag,
        operationKey: retryKey ?? operationKey("revision"),
      });
      setDraft(structuredClone(result.configuration));
      setBaseline((previous) =>
        structuredClone(revisionBaseline(previous, result.configuration)),
      );
      setServerImpact(result.impact ?? impact);
      setSuccess("Đã lưu cấu hình bản nháp. Dữ liệu hiện có đã được kiểm tra.");
      delete operationKeys.current.revision;
      onSaved?.(result);
    } catch (reason) {
      if (reason instanceof AdminApiError)
        delete operationKeys.current.revision;
      setError(reason);
      queueMicrotask(() => errorRef.current?.focus());
    } finally {
      setPending(null);
      submitLock.current = false;
    }
  }

  async function setArchived(action: "archive" | "unarchive") {
    const handler = action === "archive" ? actions.archive : actions.unarchive;
    if (!canCatalogMutate || !handler || !draft.layerEtag) return;
    await run(
      action,
      () =>
        handler(draft, {
          etag: draft.layerEtag!,
          operationKey: operationKey(action),
        }),
      action === "archive"
        ? "Đã lưu trữ lớp. Nội dung đã công bố vẫn được giữ nguyên."
        : "Đã khôi phục lớp vào danh sách đang sử dụng.",
      "lifecycle",
    );
    setArchiveConfirmation("");
  }

  async function createSuccessor() {
    if (
      !canCatalogMutate ||
      draft.revisionStatus !== "published" ||
      !actions.createSuccessor ||
      !draft.revisionEtag
    )
      return;
    await run(
      "successor",
      () =>
        actions.createSuccessor!(draft, {
          etag: draft.revisionEtag!,
          operationKey: operationKey("successor"),
        }),
      "Đã tạo bản nháp mới từ nội dung đang công bố.",
      "revision",
    );
  }

  if (mode === "create" && !canAuthorContent(principalRole))
    return (
      <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 md:pb-6">
        <Button asChild variant="ghost" className="-ml-3">
          <Link href="/admin/layers">
            <IconArrowLeft data-icon="inline-start" strokeWidth={1.75} />
            Lớp dữ liệu
          </Link>
        </Button>
        <Alert className="mt-6" variant="destructive">
          <IconAlertTriangle strokeWidth={1.75} />
          <AlertTitle>Không có quyền tạo lớp</AlertTitle>
          <AlertDescription>
            Bạn cần quyền biên tập hoặc quản trị hệ thống để tạo lớp và các trường dữ liệu.
          </AlertDescription>
        </Alert>
      </main>
    );
  if (mode === "create" && !canAuthor)
    return (
      <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 md:pb-6">
        <Button asChild variant="ghost" className="-ml-3">
          <Link href="/admin/layers">
            <IconArrowLeft data-icon="inline-start" strokeWidth={1.75} />
            Lớp dữ liệu
          </Link>
        </Button>
        <Alert className="mt-6" role="note">
          <IconInfoCircle strokeWidth={1.75} />
          <AlertTitle>Tạo lớp cần máy tính</AlertTitle>
          <AlertDescription>
            Tạo và sửa lớp cần máy tính có bàn phím, chuột hoặc bàn di chuột. Trên thiết bị này, bạn vẫn có thể xem dữ liệu và duyệt nội dung.
          </AlertDescription>
        </Alert>
      </main>
    );

  return (
    <main className="mx-auto max-w-[1440px] p-4 pb-24 sm:p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href="/admin/layers">
              <IconArrowLeft data-icon="inline-start" strokeWidth={1.75} />
              Lớp dữ liệu
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              {mode === "create"
                ? "Tạo lớp dữ liệu"
                : draft.title || "Cấu hình lớp dữ liệu"}
            </h1>
            <Badge>{revisionStatusLabel(draft.revisionStatus)}</Badge>
            {draft.archivedAt && (
              <Badge className="border bg-surface text-warning">
                Đã lưu trữ
              </Badge>
            )}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Thiết lập thông tin, loại đối tượng và cách hiển thị của lớp. Thay đổi nội dung chỉ xuất hiện cho người dân sau khi được duyệt và công bố.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mode === "edit" && draft.layerId && (
            <Button asChild type="button" variant="outline">
              <Link href={`/admin/layers/${draft.layerId}/history`}>
                <IconHistory data-icon="inline-start" strokeWidth={1.75} />
                Lịch sử
              </Link>
            </Button>
          )}
          {mode === "create" && canCatalogMutate && (
            <Button type="button" disabled={pending !== null} onClick={create}>
              {pending === "create" ? (
                <>
                  <Spinner />
                  Đang tạo...
                </>
              ) : (
                <>
                  <IconDeviceFloppy data-icon="inline-start" />
                  Tạo lớp
                </>
              )}
            </Button>
          )}
          {mode === "edit" && canCatalogMutate && (
            <Button
              type="button"
              variant="outline"
              disabled={
                pending !== null || !catalogDirty || !actions.updateCatalog
              }
              onClick={saveCatalog}
            >
              {pending === "catalog" ? (
                <Spinner />
              ) : (
                <IconDatabase data-icon="inline-start" />
              )}
              Lưu thông tin chung
            </Button>
          )}
          {mode === "edit" && canRevisionMutate && (
            <Button
              type="button"
              disabled={
                pending !== null ||
                !revisionDirty ||
                !actions.replaceRevision ||
                !actions.previewImpact
              }
              onClick={saveRevision}
            >
              {pending === "revision" ? (
                <>
                  <Spinner />
                  Đang kiểm tra...
                </>
              ) : (
                <>
                  <IconDeviceFloppy data-icon="inline-start" />
                  Lưu cấu hình
                </>
              )}
            </Button>
          )}
          {mode === "edit" &&
            canCatalogMutate &&
            draft.revisionStatus === "published" && (
              <Button
                type="button"
                disabled={pending !== null || !actions.createSuccessor}
                onClick={createSuccessor}
              >
                {pending === "successor" ? (
                  <Spinner />
                ) : (
                  <IconGitBranch data-icon="inline-start" />
                )}
                Tạo bản nháp mới
              </Button>
            )}
        </div>
      </header>
      {!canRevisionMutate && (
        <div className="mt-6">
          <ReadOnlyNotice
            role={principalRole}
            canAuthor={canAuthor}
            status={revisionStatusLabel(draft.revisionStatus)}
          />
        </div>
      )}
      {heuristicImpact && canRevisionMutate && !serverImpact && (
        <Alert className="mt-4 border-warning/40" role="status">
          <IconAlertTriangle className="text-warning" />
          <AlertTitle>Cần kiểm tra dữ liệu trước khi lưu</AlertTitle>
          <AlertDescription>
            Hệ thống sẽ kiểm tra các đối tượng hiện có. Dữ liệu không phù hợp sẽ được báo để bạn xử lý; không bị tự động xóa.
          </AlertDescription>
        </Alert>
      )}
      {serverImpact && (
        <Alert
          className="mt-4"
          variant={serverImpact.blocking ? "destructive" : "default"}
          role="status"
        >
          <IconAlertTriangle />
          <AlertTitle>
            {serverImpact.blocking
              ? "Không thể áp dụng cấu hình"
              : "Đã kiểm tra dữ liệu"}
          </AlertTitle>
          <AlertDescription>
            <p>
              {serverImpact.featureCount.toLocaleString("vi-VN")} đối tượng đã được kiểm tra.
            </p>
            {serverImpact.reasons.length > 0 && (
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {serverImpact.reasons.map((reason, index) => (
                  <li
                    key={`${reason.code}-${reason.fieldKey ?? reason.geometryKind ?? index}`}
                  >
                    {impactReasonLabels[reason.code] ?? "Dữ liệu cần được xem lại"}
                    {reason.fieldKey ? ` · ${draft.fields.find((field) => field.key === reason.fieldKey)?.label || "Trường dữ liệu"}` : ""}
                    {reason.geometryKind
                      ? ` · ${geometryLabel(reason.geometryKind)}`
                      : ""} · {reason.affectedFeatures.toLocaleString("vi-VN")}{" "}
                    đối tượng
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      {(error || Object.keys(errors).length > 0) && (
        <div ref={errorRef} tabIndex={-1} className="mt-4 outline-none">
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>
              {error ? errorTitle : "Chưa thể lưu cấu hình"}
            </AlertTitle>
            <AlertDescription>
              <p>
                {error
                  ? adminErrorMessage(error)
                  : `Kiểm tra ${Object.keys(errors).length} trường chưa hợp lệ.`}
              </p>
              {error instanceof AdminApiError && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">
                      Thông tin hỗ trợ kỹ thuật
                    </summary>
                    <p className="mt-2 text-xs">Mã lỗi: {error.code}</p>
                    {error.requestId && <p className="mt-1 break-all text-xs">Mã hỗ trợ: {error.requestId}</p>}
                  </details>
                )}
              {staleError && onReload && (
                <Button
                  className="mt-3"
                  type="button"
                  variant="outline"
                  onClick={onReload}
                >
                  Tải lại bản mới nhất
                </Button>
              )}
            </AlertDescription>
          </Alert>
        </div>
      )}
      {success && (
        <Alert className="mt-4 border-success/30 text-success" role="status">
          <IconCircleCheck />
          <AlertTitle>Đã lưu</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}
      <div className="mt-6 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav
          className="h-fit rounded-panel border bg-surface p-2 map-panel-shadow"
          aria-label="Phần cấu hình"
          role="tablist"
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              aria-controls={`layer-panel-${id}`}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex min-h-11 w-full items-center gap-3 rounded-control px-3 text-left text-sm font-medium hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === id && "bg-accent-subtle text-primary",
              )}
            >
              <Icon size={20} strokeWidth={1.75} />
              {label}
            </button>
          ))}
        </nav>
        <div
          id={`layer-panel-${activeTab}`}
          role="tabpanel"
          tabIndex={0}
          className="min-w-0 outline-none"
        >
          {activeTab === "overview" && (
            <OverviewSection
              draft={draft}
              groups={groups}
              catalogDisabled={!canCatalogMutate}
              revisionDisabled={!canRevisionMutate}
              error={errors}
              onChange={change}
            />
          )}{" "}
          {activeTab === "geometry" && (
            <GeometrySection
              draft={draft}
              disabled={!canRevisionMutate}
              error={errors}
              onChange={change}
            />
          )}{" "}
          {activeTab === "schema" && (
            <SchemaSection
              draft={draft}
              disabled={!canRevisionMutate}
              errors={errors}
              onChange={change}
            />
          )}{" "}
          {activeTab === "presentation" && (
            <PresentationSection
              draft={draft}
              disabled={!canRevisionMutate}
              errors={errors}
              onChange={change}
            />
          )}
        </div>
      </div>
      {mode === "edit" && (
        <section className="mt-7 rounded-panel border border-destructive/25 bg-surface p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <IconDatabase className="mt-0.5 text-destructive" />
            <div>
              <h2 className="font-semibold">Lưu trữ lớp</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Lớp đã lưu trữ được ẩn khỏi danh sách đang sử dụng và có thể khôi phục. Nội dung đã công bố trên bản đồ vẫn được giữ nguyên.
              </p>
            </div>
          </div>
          {draft.archivedAt ? (
            <Button
              type="button"
              variant="outline"
              className="mt-5"
              disabled={
                !canCatalogMutate || pending !== null || !actions.unarchive
              }
              onClick={() => setArchived("unarchive")}
            >
              {pending === "unarchive" ? <Spinner /> : <IconRestore />}Khôi phục lớp
            </Button>
          ) : (
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <Field className="max-w-sm">
                <FieldLabel htmlFor="archive-confirmation">
                  Gõ “LƯU TRỮ” để xác nhận
                </FieldLabel>
                <Input
                  id="archive-confirmation"
                  value={archiveConfirmation}
                  placeholder="Nhập LƯU TRỮ"
                  disabled={!canCatalogMutate}
                  onChange={(event) => {
                    setArchiveConfirmation(event.target.value);
                    delete operationKeys.current.archive;
                  }}
                />
              </Field>
              <Button
                type="button"
                variant="destructive"
                disabled={
                  !canCatalogMutate ||
                  pending !== null ||
                  archiveConfirmation.trim().toLocaleUpperCase("vi") !==
                    "LƯU TRỮ" ||
                  !actions.archive
                }
                onClick={() => setArchived("archive")}
              >
                {pending === "archive" ? <Spinner /> : <IconArchive />}Lưu trữ lớp
              </Button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
