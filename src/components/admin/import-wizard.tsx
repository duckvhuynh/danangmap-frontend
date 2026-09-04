"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  TriangleAlert as IconAlertTriangle,
  ArrowLeft as IconArrowLeft,
  ArrowRight as IconArrowRight,
  Check as IconCheck,
  CircleCheck as IconCircleCheck,
  FileSpreadsheet as IconFileSpreadsheet,
  Info as IconInfoCircle,
  Plus as IconPlus,
  RefreshCw as IconRefresh,
  Trash2 as IconTrash,
  Upload as IconUpload,
} from "lucide-react";
import {
  AdminErrorNotice,
  useAdminSession,
} from "@/components/admin/admin-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminApiError,
  loadRevisionBundle,
  type AdminField,
  type AdminRole,
  type RevisionBundle,
} from "@/lib/api/admin";
import { canAuthorContent } from "@/lib/admin/role-capabilities";
import {
  applySpatialImport,
  createSpatialImport,
  getSpatialImport,
  listSpatialImportIssues,
  saveSpatialImportMappingDraft,
  validateSpatialImport,
  type SpatialImportIssue,
  type SpatialImportJob,
} from "@/lib/api/imports";
import { pollSpatialImport } from "@/lib/imports/import-polling";
import {
  canApplyImport,
  importStatusLabel,
  importIssueLabel,
  inferImportFormat,
  replaceConfirmationValid,
  shouldPollImport,
  validateImportFile,
  validateImportMapping,
  type ImportFieldMapping,
  type ImportFormat,
  type ImportMappingDraft,
  type ImportMode,
} from "@/lib/imports/import-wizard-state";

const authoringQuery =
  "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
const subscribeAuthoring = (callback: () => void) => {
  const media = window.matchMedia(authoringQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const getAuthoring = () => window.matchMedia(authoringQuery).matches;
const getServerAuthoring = () => false;

type WizardStep =
  | "upload"
  | "inspecting"
  | "mapping"
  | "validating"
  | "issues"
  | "applying"
  | "complete"
  | "terminal";

const stepNames: Array<{ id: WizardStep; label: string }> = [
  { id: "upload", label: "Chọn tệp" },
  { id: "mapping", label: "Ghép cột" },
  { id: "validating", label: "Kiểm tra" },
  { id: "issues", label: "Xử lý lỗi" },
  { id: "applying", label: "Áp dụng" },
  { id: "complete", label: "Hoàn tất" },
];

const selectClass =
  "h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:bg-surface-subtle disabled:opacity-70";

function stableSessionValue(key: string) {
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  window.sessionStorage.setItem(key, value);
  return value;
}

function defaultMapping(format: ImportFormat): ImportMappingDraft {
  return {
    sheet: "",
    csvEncoding: "utf8",
    csvDelimiter: "comma",
    sourceCrs: "EPSG:4326",
    geometryKind:
      format === "geojson"
        ? "geojson"
        : format === "kml"
          ? "kml_geometry"
          : "coordinates",
    longitudeColumn: "longitude",
    latitudeColumn: "latitude",
    geometryColumn: "geometry",
    fields: [{ id: crypto.randomUUID(), source: "name", target: "name" }],
    matchBy: "external_identity",
  };
}

function Stepper({ current }: { current: WizardStep }) {
  const visualStep =
    current === "inspecting"
      ? "upload"
      : current === "terminal"
        ? "issues"
        : current;
  const index = stepNames.findIndex((step) => step.id === visualStep);
  return (
    <ol
      className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6"
      aria-label="Tiến trình nhập dữ liệu"
    >
      {stepNames.map((step, stepIndex) => (
        <li
          key={step.id}
          className={`flex items-center gap-2 rounded-control border px-3 py-2 text-xs ${stepIndex === index ? "border-primary bg-accent-subtle text-primary" : stepIndex < index ? "border-success/20 bg-success/10 text-success" : "bg-surface text-muted-foreground"}`}
          aria-current={stepIndex === index ? "step" : undefined}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-surface font-medium">
            {stepIndex < index ? (
              <IconCheck size={15} strokeWidth={2} />
            ) : (
              stepIndex + 1
            )}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function FileStep({
  file,
  mode,
  onFile,
  onMode,
  onContinue,
  busy,
}: {
  file: File | null;
  mode: ImportMode;
  onFile(file: File | null): void;
  onMode(mode: ImportMode): void;
  onContinue(): void;
  busy: boolean;
}) {
  return (
    <section className="rounded-panel border bg-surface p-5 map-panel-shadow sm:p-6">
      <div className="flex items-start gap-3">
        <IconFileSpreadsheet className="mt-0.5 text-primary" strokeWidth={1.75} />
        <div>
          <h2 className="font-semibold">1. Chọn tệp và cách nhập</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Chọn tệp, kiểm tra dữ liệu rồi xác nhận nhập. Dữ liệu hiện có chưa thay đổi ở bước này.
          </p>
        </div>
      </div>
      <div className="mt-6 rounded-panel border-2 border-dashed bg-surface-subtle p-6 text-center">
        <IconUpload className="mx-auto text-primary" size={30} strokeWidth={1.6} />
        <label
          htmlFor="import-file"
          className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Chọn tệp CSV, XLSX, GeoJSON hoặc KML
        </label>
        <input
          id="import-file"
          className="sr-only"
          type="file"
          accept=".csv,.xlsx,.geojson,.json,.kml"
          onChange={(event) => onFile(event.target.files?.[0] ?? null)}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Tối đa 25 MB mỗi lần · không quá 100.000 dòng
        </p>
        {file && (
          <div className="mx-auto mt-4 flex max-w-lg items-center justify-between rounded-control border bg-surface px-4 py-3 text-left">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{file.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {(file.size / 1024).toLocaleString("vi-VN", {
                  maximumFractionDigits: 1,
                })}{" "}
                KB
              </p>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Bỏ tệp đã chọn"
              onClick={() => onFile(null)}
            >
              <IconTrash strokeWidth={1.75} />
            </Button>
          </div>
        )}
      </div>
      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Chế độ nhập</legend>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {(
            [
              ["append", "Thêm mới", "Giữ dữ liệu hiện tại và thêm bản ghi."],
              ["upsert", "Cập nhật hoặc thêm", "Cập nhật đối tượng có cùng mã, thêm mới nếu chưa có."],
              [
                "replace",
                "Thay thế toàn bộ",
                "Thay toàn bộ dữ liệu của bản nháp bằng dữ liệu trong tệp.",
              ],
            ] as Array<[ImportMode, string, string]>
          ).map(([value, label, description]) => (
            <label
              key={value}
              className={`rounded-control border p-4 ${mode === value ? "border-primary bg-accent-subtle" : "hover:bg-surface-subtle"}`}
            >
              <input
                className="mr-2 accent-primary"
                type="radio"
                name="import-mode"
                value={value}
                checked={mode === value}
                onChange={() => onMode(value)}
              />
              <span className="text-sm font-medium">{label}</span>
              <span className="mt-1 block pl-6 text-xs leading-5 text-muted-foreground">
                {description}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={onContinue} disabled={!file || busy}>
          {busy ? "Đang tải lên..." : "Tải lên và tiếp tục"}
          <IconArrowRight strokeWidth={1.75} />
        </Button>
      </div>
    </section>
  );
}

function FieldMappingRows({
  fields,
  revisionFields,
  onChange,
}: {
  fields: ImportFieldMapping[];
  revisionFields: AdminField[];
  onChange(fields: ImportFieldMapping[]): void;
}) {
  const targets = [
    { key: "", label: "Bỏ qua cột" },
    ...revisionFields.map((field) => ({ key: field.key, label: field.label })),
    { key: "feature_id", label: "Mã đối tượng" },
    { key: "external_source", label: "Tên nguồn dữ liệu" },
    { key: "external_id", label: "Mã tại nguồn dữ liệu" },
  ];
  return (
    <div>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div
            className="grid gap-2 sm:grid-cols-[1fr_40px_1fr_40px] sm:items-center"
            key={field.id}
          >
            <Input
              aria-label={`Cột nguồn ${index + 1}`}
              placeholder="Tên cột nguồn"
              value={field.source}
              onChange={(event) =>
                onChange(
                  fields.map((item) =>
                    item.id === field.id
                      ? { ...item, source: event.target.value }
                      : item,
                  ),
                )
              }
            />
            <IconArrowRight
              className="hidden justify-self-center text-muted-foreground sm:block"
              size={18}
            />
            <select
              aria-label={`Trường đích ${index + 1}`}
              className={selectClass}
              value={field.target}
              onChange={(event) =>
                onChange(
                  fields.map((item) =>
                    item.id === field.id
                      ? { ...item, target: event.target.value }
                      : item,
                  ),
                )
              }
            >
              {targets.map((target) => (
                <option key={target.key} value={target.key}>
                  {target.label}
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Bỏ ghép cột ${index + 1}`}
              onClick={() =>
                onChange(fields.filter((item) => item.id !== field.id))
              }
            >
              <IconTrash strokeWidth={1.75} />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        className="mt-3"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([
            ...fields,
            { id: crypto.randomUUID(), source: "", target: "" },
          ])
        }
      >
        <IconPlus strokeWidth={1.75} />
        Thêm cột
      </Button>
    </div>
  );
}

function MappingStep({
  format,
  mode,
  mapping,
  fields,
  sheets,
  onMapping,
  onContinue,
  busy,
}: {
  format: ImportFormat;
  mode: ImportMode;
  mapping: ImportMappingDraft;
  fields: AdminField[];
  sheets: string[];
  onMapping(mapping: ImportMappingDraft): void;
  onContinue(): void;
  busy: boolean;
}) {
  const tabular = format === "csv" || format === "xlsx";
  return (
    <section className="rounded-panel border bg-surface p-5 map-panel-shadow sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">2. Ghép cột dữ liệu</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Chọn cột trong tệp tương ứng với vị trí và từng thông tin của lớp.
          </p>
        </div>
        <Badge>{format.toUpperCase()}</Badge>
      </div>
      {format === "xlsx" && (
        <label className="mt-6 block text-sm font-medium">
          Trang tính
          <select
            className={`${selectClass} mt-2`}
            value={mapping.sheet}
            onChange={(event) =>
              onMapping({ ...mapping, sheet: event.target.value })
            }
            disabled={sheets.length === 0}
          >
            <option value="">Chọn trang tính</option>
            {sheets.map((sheet) => (
              <option key={sheet} value={sheet}>
                {sheet}
              </option>
            ))}
          </select>
          {sheets.length === 0 && (
            <span className="mt-2 block text-xs text-destructive">
              Chưa đọc được danh sách trang tính. Kiểm tra tệp Excel và tải lại.
            </span>
          )}
        </label>
      )}
      {format === "csv" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Bảng mã ký tự
            <select
              className={`${selectClass} mt-2`}
              value={mapping.csvEncoding}
              onChange={(event) =>
                onMapping({
                  ...mapping,
                  csvEncoding: event.target
                    .value as ImportMappingDraft["csvEncoding"],
                })
              }
            >
              <option value="utf8">UTF-8</option>
              <option value="utf16le">UTF-16 LE</option>
              <option value="windows1258">Windows-1258</option>
              <option value="latin1">Latin-1</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Dấu phân cách
            <select
              className={`${selectClass} mt-2`}
              value={mapping.csvDelimiter}
              onChange={(event) =>
                onMapping({
                  ...mapping,
                  csvDelimiter: event.target
                    .value as ImportMappingDraft["csvDelimiter"],
                })
              }
            >
              <option value="comma">Dấu phẩy (,)</option>
              <option value="semicolon">Chấm phẩy (;)</option>
              <option value="tab">Tab</option>
              <option value="pipe">Gạch đứng (|)</option>
            </select>
          </label>
        </div>
      )}
      <fieldset className="mt-6">
        <legend className="text-sm font-medium">Vị trí trên bản đồ</legend>
        {tabular ? (
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Cách đọc
              <select
                className={`${selectClass} mt-2`}
                value={mapping.geometryKind}
                onChange={(event) =>
                  onMapping({
                    ...mapping,
                    geometryKind: event.target
                      .value as ImportMappingDraft["geometryKind"],
                  })
                }
              >
                <option value="coordinates">Hai cột kinh/vĩ độ</option>
                <option value="wkt">Một cột WKT</option>
              </select>
            </label>
            {mapping.geometryKind === "coordinates" ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  Cột kinh độ
                  <Input
                    className="mt-2"
                    value={mapping.longitudeColumn}
                    placeholder="Ví dụ: kinh_do hoặc longitude"
                    onChange={(event) =>
                      onMapping({
                        ...mapping,
                        longitudeColumn: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="text-sm">
                  Cột vĩ độ
                  <Input
                    className="mt-2"
                    value={mapping.latitudeColumn}
                    placeholder="Ví dụ: vi_do hoặc latitude"
                    onChange={(event) =>
                      onMapping({
                        ...mapping,
                        latitudeColumn: event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <label className="text-sm">
                Cột WKT
                <Input
                  className="mt-2"
                  value={mapping.geometryColumn}
                  placeholder="Ví dụ: hinh_hoc hoặc geometry"
                  onChange={(event) =>
                    onMapping({
                      ...mapping,
                      geometryColumn: event.target.value,
                    })
                  }
                />
              </label>
            )}
          </div>
        ) : (
          <p className="mt-2 rounded-control bg-surface-subtle p-3 text-sm text-muted-foreground">
            Vị trí được đọc trực tiếp từ tệp{" "}
            {format === "geojson" ? "GeoJSON" : "KML"}; không cần chọn cột.
          </p>
        )}
      </fieldset>
      <div className="mt-6">
        <h3 className="text-sm font-medium">Ghép các trường thông tin</h3>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          Nhập đúng tên cột trong tệp rồi chọn trường tương ứng. Cột không được ghép sẽ không nhập.
        </p>
        <FieldMappingRows
          fields={mapping.fields}
          revisionFields={fields}
          onChange={(next) => onMapping({ ...mapping, fields: next })}
        />
      </div>
      {mode === "upsert" && (
        <label className="mt-6 block text-sm font-medium">
          Khớp bản ghi theo
          <select
            className={`${selectClass} mt-2 max-w-md`}
            value={mapping.matchBy}
            onChange={(event) =>
              onMapping({
                ...mapping,
                matchBy: event.target.value as ImportMappingDraft["matchBy"],
              })
            }
          >
            <option value="feature_id">Mã đối tượng</option>
            <option value="external_identity">Tên nguồn và mã tại nguồn dữ liệu</option>
          </select>
        </label>
      )}
      <div className="mt-7 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Tệp đã tải lên, nhưng dữ liệu của lớp chưa thay đổi.
        </p>
        <Button type="button" onClick={onContinue} disabled={busy}>
          {busy ? "Đang bắt đầu kiểm tra..." : "Lưu và kiểm tra"}
          <IconArrowRight strokeWidth={1.75} />
        </Button>
      </div>
    </section>
  );
}

function ProcessingStep({
  job,
  label,
}: {
  job: SpatialImportJob;
  label: string;
}) {
  return (
    <section
      className="rounded-panel border bg-surface p-8 text-center map-panel-shadow"
      aria-live="polite"
    >
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-subtle text-primary">
        <IconRefresh className="animate-spin" strokeWidth={1.75} />
      </span>
      <h2 className="mt-4 font-semibold">{label}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {importStatusLabel(job.status)} ·{" "}
        {Math.max(0, Math.min(100, job.progress))}%
      </p>
      <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-surface-subtle">
        <div
          className="h-full bg-primary transition-[width]"
          style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }}
        />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Hệ thống đang xử lý. Giữ trang này mở để xem kết quả.
      </p>
    </section>
  );
}

function TerminalStep({
  job,
  revisionId,
  onRetry,
}: {
  job: SpatialImportJob;
  revisionId: string;
  onRetry?: () => void;
}) {
  return (
    <section className="rounded-panel border bg-surface p-8 text-center map-panel-shadow">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <IconAlertTriangle strokeWidth={1.75} />
      </span>
      <h2 className="mt-4 text-lg font-semibold">
        {job.status === "cancelled"
          ? "Phiên nhập đã bị hủy"
          : "Phiên nhập chưa thể hoàn tất"}
      </h2>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
        {job.status === "failed"
          ? importIssueLabel(job.failureCode ?? "IMPORT_FAILED")
          : job.status === "cancelled"
            ? "Không có dữ liệu nào được áp dụng từ phiên này."
            : "Chưa nhận được tiến độ mới. Chọn Kiểm tra lại để tiếp tục theo dõi lượt nhập này."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {onRetry && (
          <Button type="button" onClick={onRetry}>
            <IconRefresh strokeWidth={1.75} />
            Kiểm tra lại
          </Button>
        )}
        <Button asChild variant="outline">
          <Link href={`/admin/layers/${revisionId}/edit`}>
            <IconArrowLeft />
            Về trình biên tập
          </Link>
        </Button>
      </div>
    </section>
  );
}

function IssuesStep({
  job,
  fields,
  issues,
  skipInvalid,
  onSkipInvalid,
  acknowledged,
  onAcknowledged,
  confirmation,
  onConfirmation,
  onApply,
  busy,
}: {
  job: SpatialImportJob;
  issues: SpatialImportIssue[];
  fields: AdminField[];
  skipInvalid: boolean;
  onSkipInvalid(value: boolean): void;
  acknowledged: boolean;
  onAcknowledged(value: boolean): void;
  confirmation: string;
  onConfirmation(value: string): void;
  onApply(): void;
  busy: boolean;
}) {
  const warnings = job.counts.warning ?? 0;
  const invalid = job.counts.invalid ?? 0;
  const allowed =
    canApplyImport(job.counts, job.canApplyWithSkipInvalid, skipInvalid) &&
    (warnings === 0 || acknowledged) &&
    replaceConfirmationValid(job.mode, confirmation);
  return (
    <section className="rounded-panel border bg-surface p-5 map-panel-shadow sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">4. Kiểm tra lỗi trước khi áp dụng</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Xem các dòng cần sửa trước khi nhập. Dữ liệu chỉ được lưu sau khi bạn xác nhận.
          </p>
        </div>
        <Badge
          className={
            invalid
              ? "bg-destructive/10 text-destructive"
              : "bg-success/10 text-success"
          }
        >
          {invalid ? `${invalid} lỗi` : "Không có lỗi"}
        </Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          ["Tổng", job.counts.total ?? 0],
          ["Hợp lệ", job.counts.valid ?? 0],
          ["Cảnh báo", warnings],
          ["Không hợp lệ", invalid],
        ].map(([label, value]) => (
          <div
            className="rounded-control border bg-surface-subtle p-3"
            key={label}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {issues.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-control border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Dòng</th>
                <th className="px-3 py-2 font-medium">Mức</th>
                <th className="px-3 py-2 font-medium">Nội dung cần kiểm tra</th>
                <th className="px-3 py-2 font-medium">Trường</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {issues.map((issue) => (
                <tr key={issue.id}>
                  <td className="px-3 py-2">{issue.rowNumber}</td>
                  <td className="px-3 py-2">
                    <span
                      className={
                        issue.severity === "error"
                          ? "text-destructive"
                          : "text-warning"
                      }
                    >
                      {issue.severity === "error" ? "Lỗi" : "Cảnh báo"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{importIssueLabel(issue.code)}</td>
                  <td className="px-3 py-2">{issue.field === "geometry" ? "Vị trí / hình dạng" : fields.find((field) => field.key === issue.field)?.label ?? (issue.field ? "Trường dữ liệu" : "Chưa xác định")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Hiển thị tối đa 100 vấn đề đầu tiên. Sửa các dòng được chỉ ra trong tệp nếu bạn không muốn bỏ qua chúng.
      </p>
      {invalid > 0 && (
        <label className="mt-5 flex items-start gap-3 rounded-control border p-4">
          <input
            className="mt-1 accent-primary"
            type="checkbox"
            checked={skipInvalid}
            onChange={(event) => onSkipInvalid(event.target.checked)}
            disabled={!job.canApplyWithSkipInvalid}
          />
          <span>
            <span className="block text-sm font-medium">
              Bỏ qua dòng lỗi và chỉ áp dụng dòng hợp lệ
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              Nếu tệp bị lỗi cấu trúc, bạn cần sửa tệp và tải lại trước khi nhập.
            </span>
          </span>
        </label>
      )}
      {warnings > 0 && (
        <label className="mt-3 flex items-start gap-3 rounded-control border p-4">
          <input
            className="mt-1 accent-primary"
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => onAcknowledged(event.target.checked)}
          />
          <span className="text-sm">
            Tôi đã xem và chấp nhận các cảnh báo đang hiển thị.
          </span>
        </label>
      )}
      {job.mode === "replace" && (
        <label className="mt-5 block text-sm font-medium text-destructive">
          Gõ “THAY THẾ” để xác nhận
          <Input
            className="mt-2 max-w-sm"
            value={confirmation}
            placeholder="Nhập THAY THẾ"
            onChange={(event) => onConfirmation(event.target.value)}
            autoComplete="off"
          />
        </label>
      )}
      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={onApply} disabled={!allowed || busy}>
          {busy ? "Đang áp dụng..." : "Nhập vào bản nháp"}
          <IconArrowRight strokeWidth={1.75} />
        </Button>
      </div>
    </section>
  );
}

export function ImportWizard({
  revisionId,
  principalRole,
  csrfToken,
  canAuthor,
}: {
  revisionId: string;
  principalRole: AdminRole;
  csrfToken: string;
  canAuthor: boolean;
}) {
  const fileRef = useRef<File | null>(null);
  const uploadAttemptRef = useRef<{
    file: File;
    format: ImportFormat;
    mode: ImportMode;
    clientRequestId: string;
    operationKey: string;
  } | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [bundle, setBundle] = useState<RevisionBundle | null>(null);
  const [step, setStep] = useState<WizardStep>("upload");
  const [mode, setMode] = useState<ImportMode>("append");
  const [format, setFormat] = useState<ImportFormat>("csv");
  const [mapping, setMapping] = useState<ImportMappingDraft>(() =>
    defaultMapping("csv"),
  );
  const [job, setJob] = useState<SpatialImportJob | null>(null);
  const [issues, setIssues] = useState<SpatialImportIssue[]>([]);
  const [skipInvalid, setSkipInvalid] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<unknown>(null);

  const loadBundle = useCallback(() => {
    setLoading(true);
    setError(null);
    setReload((value) => value + 1);
  }, []);
  useEffect(() => {
    let active = true;
    loadRevisionBundle(revisionId)
      .then((next) => {
        if (active) setBundle(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload, revisionId]);

  const importId = job?.id;
  useEffect(() => {
    if (
      !importId ||
      (step !== "inspecting" && step !== "validating" && step !== "applying")
    )
      return;
    const controller = new AbortController();
    pollSpatialImport(
      importId,
      getSpatialImport,
      setJob,
      controller.signal,
      process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true" ? 20 : 1_000,
    )
      .then(async (terminal) => {
        if (terminal.status === "mapping_required") {
          setMapping((current) =>
            current.sheet || terminal.inspection.sheets.length === 0
              ? current
              : { ...current, sheet: terminal.inspection.sheets[0] },
          );
          setStep("mapping");
        } else if (terminal.status === "ready") {
          const page = await listSpatialImportIssues(terminal.id, 100);
          if (!controller.signal.aborted) {
            setIssues(page.issues);
            setStep("issues");
          }
        } else if (terminal.status === "completed") {
          window.sessionStorage.removeItem(
            `danangmap:import:apply:${terminal.id}`,
          );
          setStep("complete");
        } else if (
          terminal.status === "failed" ||
          terminal.status === "cancelled"
        ) {
          window.sessionStorage.removeItem(
            `danangmap:import:apply:${terminal.id}`,
          );
          setError(
            new AdminApiError(
              terminal.status === "failed" ? 422 : 409,
              terminal.failureCode ??
                (terminal.status === "failed"
                  ? "IMPORT_FAILED"
                  : "IMPORT_CANCELLED"),
              terminal.status === "failed"
                ? "Máy chủ không thể hoàn tất phiên nhập dữ liệu."
                : "Phiên nhập dữ liệu đã bị hủy.",
            ),
          );
          setStep("terminal");
        }
      })
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason);
          setStep("terminal");
        }
      });
    return () => controller.abort();
  }, [importId, step]);

  const onFile = (next: File | null) => {
    fileRef.current = next;
    uploadAttemptRef.current = null;
    setFile(next);
    setError(null);
    if (next) {
      const inferred = inferImportFormat(next.name);
      if (inferred) {
        setFormat(inferred);
        setMapping(defaultMapping(inferred));
      }
    }
  };

  const upload = async () => {
    const selected = fileRef.current;
    if (!selected || !bundle) return;
    const message = validateImportFile(selected);
    if (message)
      return setError(new AdminApiError(422, "CLIENT_IMPORT_FILE_INVALID", message));
    setBusy(true);
    setError(null);
    try {
      const currentAttempt = uploadAttemptRef.current;
      const attempt =
        currentAttempt?.file === selected &&
        currentAttempt.format === format &&
        currentAttempt.mode === mode
          ? currentAttempt
          : {
              file: selected,
              format,
              mode,
              clientRequestId: crypto.randomUUID(),
              operationKey: crypto.randomUUID(),
            };
      uploadAttemptRef.current = attempt;
      const next = await createSpatialImport(
        revisionId,
        selected,
        format,
        mode,
        attempt.clientRequestId,
        bundle.etag,
        attempt.operationKey,
        { csrfToken },
      );
      uploadAttemptRef.current = null;
      setJob(next);
      setStep("inspecting");
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  };

  const saveAndValidate = async () => {
    if (!job) return;
    const errors = validateImportMapping(mapping, mode, format);
    if (errors.length)
      return setError(
        new AdminApiError(422, "CLIENT_IMPORT_MAPPING_INVALID", errors.join(" ")),
      );
    setBusy(true);
    setError(null);
    try {
      await saveSpatialImportMappingDraft(job.id, mapping, mode, format, {
        csrfToken,
      });
      const validating = await validateSpatialImport(job.id, { csrfToken });
      setJob(validating);
      setStep("validating");
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!job || !bundle) return;
    setBusy(true);
    setError(null);
    try {
      const warningCodes = acknowledged
        ? Array.from(
            new Set(
              issues
                .filter((issue) => issue.severity === "warning")
                .map((issue) => issue.code),
            ),
          )
        : [];
      const applying = await applySpatialImport(
        job.id,
        { skipInvalid, acknowledgedWarningCodes: warningCodes },
        bundle.etag,
        stableSessionValue(`danangmap:import:apply:${job.id}`),
        { csrfToken },
      );
      setJob(applying);
      setStep("applying");
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  };

  const retryPolling = () => {
    if (!job) return;
    setError(null);
    setStep(
      job.status === "applying"
        ? "applying"
        : job.status === "uploaded" || job.status === "inspecting"
          ? "inspecting"
          : "validating",
    );
  };

  if (!canAuthor)
    return (
      <main className="mx-auto max-w-2xl p-6 pb-24 md:pb-6">
        <div className="rounded-panel border bg-surface p-6 map-panel-shadow">
          <IconInfoCircle className="text-primary" />
          <h1 className="mt-4 text-xl font-semibold">
            Nhập dữ liệu cần máy tính
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Nhập dữ liệu cần máy tính có bàn phím, chuột hoặc bàn di chuột. Trên di động, bạn vẫn có thể xem dữ liệu và theo dõi trạng thái.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/admin/layers">
              <IconArrowLeft />
              Về danh sách lớp
            </Link>
          </Button>
        </div>
      </main>
    );
  if (!canAuthorContent(principalRole))
    return (
      <main className="mx-auto max-w-2xl p-6 pb-24 md:pb-6">
        <div className="rounded-panel border bg-surface p-6 map-panel-shadow">
          <IconAlertTriangle className="text-warning" />
          <h1 className="mt-4 text-xl font-semibold">
            Không có quyền nhập dữ liệu
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Bạn cần quyền biên tập hoặc quản trị hệ thống để nhập dữ liệu vào bản nháp.
          </p>
        </div>
      </main>
    );
  if (loading)
    return (
      <main
        className="grid min-h-[60vh] place-items-center text-sm text-muted-foreground"
        role="status"
      >
        Đang tải bản nháp...
      </main>
    );
  if (!bundle)
    return (
      <main className="mx-auto max-w-3xl p-6 pb-24 md:pb-6">
        <AdminErrorNotice error={error} onRetry={loadBundle} />
      </main>
    );
  if (bundle.revision.status !== "draft")
    return (
      <main className="mx-auto max-w-2xl p-6 pb-24 md:pb-6">
        <div className="rounded-panel border bg-surface p-6">
          <h1 className="text-xl font-semibold">
            Phiên bản này không thể nhập dữ liệu
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Chỉ bản nháp mới có thể nhận dữ liệu. Tạo bản nháp mới từ cấu hình lớp để tiếp tục.
          </p>
        </div>
      </main>
    );

  return (
    <main className="mx-auto max-w-6xl p-4 pb-24 sm:p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-2">
            <Link href={`/admin/layers/${revisionId}/edit`}>
              <IconArrowLeft />
              Về trình biên tập
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground">
            {bundle.revision.title} · Phiên bản {bundle.revision.revisionNo}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">
            Nhập dữ liệu
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Chọn tệp, ghép cột và kiểm tra trước khi lưu dữ liệu vào bản nháp.
          </p>
        </div>
        {process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true" && (
          <Badge className="bg-warning/10 text-warning">
            Dữ liệu minh họa · không được lưu vào hệ thống
          </Badge>
        )}
      </header>
      <div className="mt-6">
        <Stepper current={step} />
      </div>
      {error !== null && (
        <div className="mt-5">
          <AdminErrorNotice error={error} />
        </div>
      )}
      <div className="mt-6">
        {step === "upload" && (
          <FileStep
            file={file}
            mode={mode}
            onFile={onFile}
            onMode={(nextMode) => {
              uploadAttemptRef.current = null;
              setMode(nextMode);
            }}
            onContinue={upload}
            busy={busy}
          />
        )}{" "}
        {step === "inspecting" && job && (
          <ProcessingStep job={job} label="Đang đọc tệp" />
        )}{" "}
        {step === "mapping" && (
          <MappingStep
            format={format}
            mode={mode}
            mapping={mapping}
            fields={bundle.fields}
            sheets={job?.inspection.sheets ?? []}
            onMapping={setMapping}
            onContinue={saveAndValidate}
            busy={busy}
          />
        )}{" "}
        {step === "validating" && job && (
          <ProcessingStep job={job} label="Đang kiểm tra dữ liệu" />
        )}{" "}
        {step === "issues" && job && (
          <IssuesStep
            job={job}
            issues={issues}
            fields={bundle.fields}
            skipInvalid={skipInvalid}
            onSkipInvalid={setSkipInvalid}
            acknowledged={acknowledged}
            onAcknowledged={setAcknowledged}
            confirmation={confirmation}
            onConfirmation={setConfirmation}
            onApply={apply}
            busy={busy}
          />
        )}{" "}
        {step === "applying" && job && (
          <ProcessingStep job={job} label="Đang lưu vào bản nháp" />
        )}{" "}
        {step === "terminal" && job && (
          <TerminalStep
            job={job}
            revisionId={revisionId}
            onRetry={shouldPollImport(job.status) ? retryPolling : undefined}
          />
        )}{" "}
        {step === "complete" && job && (
          <section className="rounded-panel border bg-surface p-8 text-center map-panel-shadow">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success">
              <IconCircleCheck size={30} strokeWidth={1.75} />
            </span>
            <h2 className="mt-4 text-xl font-semibold">
              Nhập dữ liệu hoàn tất
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Đã áp dụng {job.counts.applied ?? 0} bản ghi, bỏ qua{" "}
              {job.counts.skipped ?? 0} bản ghi.
            </p>
            <Button asChild className="mt-6">
              <Link href={`/admin/layers/${revisionId}/edit`}>
                Mở trình biên tập
                <IconArrowRight />
              </Link>
            </Button>
          </section>
        )}
      </div>
    </main>
  );
}

export function ImportWizardRoute({ revisionId }: { revisionId: string }) {
  const { principal, csrfToken } = useAdminSession();
  const canAuthor = useSyncExternalStore(
    subscribeAuthoring,
    getAuthoring,
    getServerAuthoring,
  );
  return (
    <ImportWizard
      revisionId={revisionId}
      principalRole={principal.role}
      csrfToken={csrfToken}
      canAuthor={canAuthor}
    />
  );
}
