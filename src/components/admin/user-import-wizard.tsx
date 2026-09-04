"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconCheck,
  IconCircleCheck,
  IconDownload,
  IconFileSpreadsheet,
  IconInfoCircle,
  IconRefresh,
  IconShieldLock,
  IconUpload,
  IconUsersPlus,
} from "@tabler/icons-react";
import { useAdminSession } from "@/components/admin/admin-session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { AdminApiError } from "@/lib/api/admin";
import { userImportActions, type UserImportActions, type UserImportIssue, type UserImportIssuePage, type UserImportJob, type UserImportReportPage } from "@/lib/api/user-imports";
import { adminUserRoleLabels } from "@/lib/users/user-admin-state";
import { pollUserImport } from "@/lib/user-imports/user-import-polling";
import {
  USER_IMPORT_COLUMNS,
  USER_IMPORT_ROLES,
  USER_IMPORT_ISSUE_LABELS,
  userImportIssueLabel,
  userImportFieldLabel,
  userImportReportCsv,
  normalizeIssueCode,
  userImportStage,
  userImportStatusLabel,
  validSheetSelection,
  validateUserImportFile,
  type UserImportStage,
} from "@/lib/user-imports/user-import-state";

const authoringQuery = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
const subscribeAuthoring = (callback: () => void) => {
  const media = window.matchMedia(authoringQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const getAuthoring = () => window.matchMedia(authoringQuery).matches;
const getServerAuthoring = () => false;

const steps: Array<{ id: UserImportStage; label: string }> = [
  { id: "upload", label: "Chọn tệp" },
  { id: "inspect", label: "Kiểm tra" },
  { id: "issues", label: "Xem kết quả" },
  { id: "complete", label: "Tạo lời mời" },
];

const selectClass = "h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:bg-surface-subtle disabled:opacity-70";

function visualStage(stage: UserImportStage): UserImportStage {
  if (stage === "inspecting") return "upload";
  if (stage === "validating") return "inspect";
  if (stage === "applying") return "issues";
  if (stage === "failed") return "issues";
  return stage;
}

function Stepper({ stage }: { stage: UserImportStage }) {
  const current = visualStage(stage);
  const currentIndex = steps.findIndex((step) => step.id === current);
  return (
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Tiến trình nhập danh sách người dùng">
      {steps.map((step, index) => (
        <li
          key={step.id}
          aria-current={index === currentIndex ? "step" : undefined}
          className={index === currentIndex
            ? "flex items-center gap-2 rounded-control border border-primary bg-accent-subtle px-3 py-2 text-xs font-medium text-primary"
            : "flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-xs text-muted-foreground"}
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full border bg-surface font-medium">
            {index < currentIndex ? <IconCheck stroke={2} /> : index + 1}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

function ImportPolicyNote() {
  return (
    <Alert role="note" className="bg-surface-subtle">
      <IconShieldLock stroke={1.75} />
      <AlertTitle>Bạn sẽ kiểm tra trước khi gửi lời mời</AlertTitle>
      <AlertDescription>
        Bước kiểm tra chưa tạo tài khoản. Sau khi bạn xác nhận, người dùng hợp lệ sẽ nhận email mời tự đặt mật khẩu. Tài khoản hiện có không bị thay đổi.
      </AlertDescription>
    </Alert>
  );
}

function UserImportErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  let message = "Không thể nhập danh sách lúc này. Hãy kiểm tra kết nối và thử lại.";

  if (error instanceof AdminApiError) {
    const prefix = ({
      401: "Phiên đăng nhập đã hết hạn.",
      403: "Bạn không có quyền nhập danh sách người dùng.",
      409: "Yêu cầu đang được xử lý hoặc đã hoàn tất. Hãy cập nhật trạng thái.",
      412: "Kết quả nhập danh sách vừa thay đổi. Hãy cập nhật trạng thái.",
      413: "Tệp vượt quá giới hạn dung lượng cho phép.",
      415: "Định dạng hoặc nội dung tệp không được hỗ trợ.",
      422: "Nội dung tệp hoặc trang tính chưa hợp lệ.",
      429: "Đang có nhiều danh sách được xử lý. Hãy chờ trước khi thử lại.",
      503: "Chức năng nhập danh sách tạm gián đoạn. Hãy thử lại sau.",
    } as Record<number, string>)[error.status];
    message = USER_IMPORT_ISSUE_LABELS[error.code] ?? prefix ?? message;

  }
  return (
    <Alert variant="destructive">
      <IconAlertTriangle stroke={1.75} />
      <AlertTitle>Không thể hoàn tất yêu cầu</AlertTitle>
      <AlertDescription><p>{message}</p>{onRetry && <Button className="mt-3" type="button" variant="outline" size="sm" onClick={onRetry}><IconRefresh data-icon="inline-start" />Cập nhật trạng thái</Button>}</AlertDescription>
    </Alert>
  );
}

function UploadStep({
  file,
  fileError,
  busy,
  onFile,
  onSubmit,
}: {
  file: File | null;
  fileError: string | null;
  busy: boolean;
  onFile(file: File | null): void;
  onSubmit(): void;
}) {
  return (
    <section className="rounded-panel border bg-surface p-5 map-panel-shadow sm:p-6" aria-labelledby="user-import-upload-heading">
      <div className="flex items-start gap-3">
        <IconFileSpreadsheet className="mt-0.5 text-primary" stroke={1.75} />
        <div>
          <h2 id="user-import-upload-heading" className="font-semibold">1. Chọn danh sách người dùng</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Chọn tệp danh sách tài khoản. Bạn sẽ xem kết quả kiểm tra trước khi gửi lời mời.</p>
        </div>
      </div>

      <FieldGroup className="mt-6">
        <Field data-invalid={Boolean(fileError)}>
          <div className="rounded-panel border-2 border-dashed bg-surface-subtle p-6 text-center focus-within:ring-2 focus-within:ring-ring">
            <IconUpload className="mx-auto text-primary" size={30} stroke={1.6} />
            <FieldLabel htmlFor="user-import-file" className="mx-auto mt-3 cursor-pointer text-primary underline-offset-4 hover:underline">
              Chọn tệp CSV hoặc XLSX
            </FieldLabel>
            <input
              id="user-import-file"
              className="sr-only"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-invalid={Boolean(fileError)}
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
            <FieldDescription>Tối đa 5 MB · 5.000 dòng · Tệp Excel không chứa công thức</FieldDescription>
            {fileError && <FieldError className="mt-3">{fileError}</FieldError>}
            {file && (
              <div className="mx-auto mt-4 max-w-lg rounded-control border bg-surface px-4 py-3 text-left">
                <p className="truncate text-sm font-medium">{file.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{(file.size / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} KiB</p>
              </div>
            )}
          </div>
        </Field>
      </FieldGroup>

      <details className="mt-5 rounded-control border p-4"><summary className="cursor-pointer text-sm font-medium">Xem hướng dẫn định dạng tệp</summary><div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-control border p-4">
          <p className="text-sm font-medium">Bốn cột bắt buộc, đúng thứ tự</p>
          <div className="mt-3 flex flex-wrap gap-2">{USER_IMPORT_COLUMNS.map((column) => <Badge key={column}>{column}</Badge>)}</div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Chỉ dùng bốn cột trên. Không thêm mật khẩu, mã xác thực hoặc mã khôi phục. Với CSV, lưu tệp bằng mã hóa UTF-8.</p>
        </div>
        <div className="rounded-control border p-4">
          <p className="text-sm font-medium">Giá trị cho cột vai trò</p>
          <div className="mt-3 flex flex-wrap gap-2">{USER_IMPORT_ROLES.map((role) => <span key={role} className="text-xs">{adminUserRoleLabels[role]}: <code>{role}</code></span>)}</div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Nhập đúng giá trị bên cạnh tên vai trò trong cột role.</p>
        </div>
      </div></details>

      <div className="mt-5"><ImportPolicyNote /></div>
      <div className="mt-6 flex justify-end">
        <Button type="button" disabled={!file || Boolean(fileError) || busy} onClick={onSubmit}>
          <IconUpload data-icon="inline-start" stroke={1.75} />
          {busy ? "Đang tải lên..." : "Tải lên và kiểm tra"}
        </Button>
      </div>
    </section>
  );
}

function ProcessingStep({ job, title }: { job: UserImportJob; title: string }) {
  const progress = Math.max(0, Math.min(100, job.progress));
  return (
    <section className="rounded-panel border bg-surface p-8 text-center map-panel-shadow" aria-live="polite">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-subtle text-primary"><IconRefresh className="animate-spin" stroke={1.75} /></span>
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{userImportStatusLabel(job.status)} · {progress}%</p>
      <div className="mx-auto mt-4 h-2 max-w-md overflow-hidden rounded-full bg-surface-subtle" role="progressbar" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
        <div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Tác vụ chạy trên máy chủ. Không đóng tab nếu bạn muốn theo dõi liên tục.</p>
    </section>
  );
}

function InspectStep({ job, sheet, busy, onSheet, onValidate }: { job: UserImportJob; sheet: string; busy: boolean; onSheet(value: string): void; onValidate(): void }) {
  const canValidate = validSheetSelection(job, sheet);
  return (
    <section className="rounded-panel border bg-surface p-5 map-panel-shadow sm:p-6" aria-labelledby="user-import-inspect-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="user-import-inspect-heading" className="font-semibold">2. Kiểm tra danh sách đã tải lên</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Tệp {job.format.toUpperCase()} đã được tải lên. Kiểm tra thông tin và chọn trang tính nếu cần.</p>
        </div>
        <Badge>{job.format.toUpperCase()}</Badge>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-control border bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Tệp</dt><dd className="mt-1 truncate text-sm font-medium">{job.file.name}</dd></div>
        <div className="rounded-control border bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Dung lượng</dt><dd className="mt-1 text-sm font-medium">{(job.file.sizeBytes / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} KiB</dd></div>
        <div className="rounded-control border bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Chính sách</dt><dd className="mt-1 text-sm font-medium">Gửi lời mời</dd></div>
      </dl>

      {job.format === "xlsx" && (
        <Field className="mt-6" data-invalid={!canValidate}>
          <FieldLabel htmlFor="user-import-sheet">Trang tính cần nhập</FieldLabel>
          <select id="user-import-sheet" className={selectClass} value={sheet} onChange={(event) => onSheet(event.target.value)} aria-invalid={!canValidate}>
            <option value="">Chọn một trang tính</option>
            {job.inspection.sheets.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <FieldDescription>Tệp có thể chứa tối đa {job.inspection.limits.maxSheets} trang tính. Mỗi lần chỉ nhập một trang.</FieldDescription>
          {!canValidate && <FieldError>Hãy chọn một trang tính trước khi kiểm tra.</FieldError>}
        </Field>
      )}

      <div className="mt-5"><ImportPolicyNote /></div>
      <div className="mt-6 flex justify-end">
        <Button type="button" disabled={!canValidate || busy} onClick={onValidate}>
          <IconCheck data-icon="inline-start" stroke={1.75} />
          {busy ? "Đang bắt đầu kiểm tra..." : "Kiểm tra dữ liệu"}
        </Button>
      </div>
    </section>
  );
}

function IssueTable({ issues }: { issues: UserImportIssue[] }) {
  if (issues.length === 0) return <p className="rounded-control border bg-surface-subtle p-4 text-sm text-muted-foreground">Không có lỗi trong bộ lọc hiện tại.</p>;
  return (
    <div className="overflow-x-auto rounded-control border">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Các dòng cần sửa trong danh sách người dùng</caption>
        <thead className="bg-surface-subtle text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium" scope="col">Dòng</th><th className="px-3 py-2 font-medium" scope="col">Nội dung cần sửa</th><th className="px-3 py-2 font-medium" scope="col">Cột</th></tr></thead>
        <tbody className="divide-y">{issues.map((issue) => <tr key={issue.id}><td className="px-3 py-2">{issue.rowNumber}</td><td className="px-3 py-2 text-destructive">{userImportIssueLabel(issue.code)}</td><td className="px-3 py-2">{userImportFieldLabel(issue.field)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

function Counts({ job }: { job: UserImportJob }) {
  const rows = [
    ["Tổng", job.counts.total],
    ["Hợp lệ", job.counts.valid],
    ["Không hợp lệ", job.counts.invalid],
    [job.status === "completed" ? "Đã mời" : "Sẽ bỏ qua", job.status === "completed" ? job.counts.applied : job.counts.invalid],
  ] as const;
  return <dl className="grid gap-3 sm:grid-cols-4">{rows.map(([label, value]) => <div className="rounded-control border bg-surface-subtle p-3" key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold">{value.toLocaleString("vi-VN")}</dd></div>)}</dl>;
}

function IssuesStep({
  job,
  page,
  filter,
  acknowledged,
  busy,
  onFilter,
  onSearch,
  onMore,
  onAcknowledged,
  onApply,
}: {
  job: UserImportJob;
  page: UserImportIssuePage | null;
  filter: string;
  acknowledged: boolean;
  busy: boolean;
  onFilter(value: string): void;
  onSearch(): void;
  onMore(): void;
  onAcknowledged(value: boolean): void;
  onApply(): void;
}) {
  return (
    <section className="rounded-panel border bg-surface p-5 map-panel-shadow sm:p-6" aria-labelledby="user-import-issues-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 id="user-import-issues-heading" className="font-semibold">3. Xem kết quả kiểm tra</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Dòng lỗi không tạo tài khoản. Dòng hợp lệ chỉ được áp dụng sau xác nhận của bạn.</p></div>
        <Badge className={job.counts.invalid ? "bg-red-50 text-destructive" : undefined}>{job.counts.invalid ? `${job.counts.invalid} lỗi` : "Không có lỗi"}</Badge>
      </div>
      <div className="mt-5"><Counts job={job} /></div>

      <FieldGroup className="mt-5">
        <Field orientation="responsive">
          <FieldContent>
            <FieldLabel htmlFor="user-import-issue-code">Lọc nội dung cần sửa</FieldLabel>
            <FieldDescription>Chọn nhóm lỗi cần xem.</FieldDescription>
          </FieldContent>
          <div className="flex w-full gap-2 sm:max-w-lg">
            <select id="user-import-issue-code" className={selectClass} value={filter} onChange={(event) => onFilter(event.target.value)}><option value="">Tất cả lỗi</option>{Object.entries(USER_IMPORT_ISSUE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
            <Button type="button" variant="outline" onClick={onSearch} disabled={busy}>Lọc</Button>
          </div>
        </Field>
      </FieldGroup>

      <div className="mt-4"><IssueTable issues={page?.issues ?? []} /></div>
      {page?.meta.hasMore && <Button className="mt-3" type="button" variant="outline" onClick={onMore} disabled={busy}>Xem thêm lỗi</Button>}

      <Field orientation="horizontal" className="mt-5 rounded-control border p-4" data-invalid={!acknowledged}>
        <Checkbox id="user-import-confirm" checked={acknowledged} onCheckedChange={(checked) => onAcknowledged(checked === true)} aria-invalid={!acknowledged} />
        <FieldContent>
          <FieldLabel htmlFor="user-import-confirm">Tôi hiểu đây là thao tác tạo lời mời</FieldLabel>
          <FieldDescription>{job.counts.valid.toLocaleString("vi-VN")} dòng hợp lệ sẽ nhận lời mời; {job.counts.invalid.toLocaleString("vi-VN")} dòng lỗi bị bỏ qua và tài khoản hiện có không được cập nhật.</FieldDescription>
        </FieldContent>
      </Field>

      {job.counts.valid < 1 && <Alert variant="destructive" className="mt-5"><IconAlertTriangle stroke={1.75} /><AlertTitle>Không có dòng hợp lệ</AlertTitle><AlertDescription>Hãy sửa tệp rồi nhập lại danh sách.</AlertDescription></Alert>}
      <div className="mt-6 flex justify-end">
        <Button type="button" disabled={!acknowledged || job.counts.valid < 1 || busy} onClick={onApply}>
          <IconUsersPlus data-icon="inline-start" stroke={1.75} />
          {busy ? "Đang gửi lệnh..." : `Gửi ${job.counts.valid.toLocaleString("vi-VN")} lời mời`}
        </Button>
      </div>
    </section>
  );
}

function CompleteStep({ job, report, filter, busy, onFilter, onSearch, onMore, onDownload, onRestart }: { job: UserImportJob; report: UserImportReportPage | null; filter: string; busy: boolean; onFilter(value: string): void; onSearch(): void; onMore(): void; onDownload(): void; onRestart(): void }) {
  return (
    <section className="rounded-panel border bg-surface p-6 map-panel-shadow sm:p-8">
      <div className="text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-emerald-50 text-success"><IconCircleCheck stroke={1.75} /></span>
        <h2 className="mt-4 text-lg font-semibold">Đã nhập danh sách người dùng</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Đã tạo {job.counts.applied.toLocaleString("vi-VN")} lời mời. Người nhận cần mở email và đặt mật khẩu để bắt đầu sử dụng tài khoản.</p>
      </div>
      <div className="mt-6"><Counts job={job} /></div>
      <FieldGroup className="mt-5">
        <Field orientation="responsive">
          <FieldContent><FieldLabel htmlFor="user-import-report-code">Lọc nội dung cần sửa trong báo cáo</FieldLabel><FieldDescription>Chọn nhóm lỗi cần xem trong báo cáo.</FieldDescription></FieldContent>
          <div className="flex w-full gap-2 sm:max-w-lg"><select id="user-import-report-code" className={selectClass} value={filter} onChange={(event) => onFilter(event.target.value)}><option value="">Tất cả lỗi</option>{Object.entries(USER_IMPORT_ISSUE_LABELS).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select><Button type="button" variant="outline" onClick={onSearch} disabled={busy}>Lọc</Button></div>
        </Field>
      </FieldGroup>
      <div className="mt-5"><IssueTable issues={report?.issues ?? []} /></div>
      {report?.meta.hasMore && <Button className="mt-3" type="button" variant="outline" onClick={onMore} disabled={busy}>Xem thêm báo cáo</Button>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button type="button" variant="outline" onClick={onDownload} disabled={!report}><IconDownload data-icon="inline-start" stroke={1.75} />Tải báo cáo đang xem</Button>
        <Button type="button" onClick={onRestart}><IconRefresh data-icon="inline-start" stroke={1.75} />Nhập danh sách khác</Button>
      </div>
    </section>
  );
}

function MobileReadOnly() {
  return (
    <main className="mx-auto max-w-3xl p-4 pb-24 sm:p-6">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/users"><IconArrowLeft data-icon="inline-start" />Người dùng</Link></Button>
      <section className="mt-4 rounded-panel border bg-surface p-6 map-panel-shadow">
        <span className="grid size-11 place-items-center rounded-map-control bg-accent-subtle text-primary"><IconInfoCircle stroke={1.75} /></span>
        <h1 className="mt-4 text-xl font-semibold">Nhập danh sách cần dùng máy tính</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Bạn có thể xem tài khoản trên điện thoại. Để nhập danh sách, hãy dùng máy tính có bàn phím và chuột.</p>
      </section>
    </main>
  );
}

export function UserImportWizard({ actions, pollIntervalMs = 800 }: { actions: UserImportActions; pollIntervalMs?: number }) {
  const { principal, csrfToken } = useAdminSession();
  const canAuthor = useSyncExternalStore(subscribeAuthoring, getAuthoring, getServerAuthoring);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [job, setJob] = useState<UserImportJob | null>(null);
  const [stage, setStage] = useState<UserImportStage>("upload");
  const [sheet, setSheet] = useState("");
  const [issues, setIssues] = useState<UserImportIssuePage | null>(null);
  const [report, setReport] = useState<UserImportReportPage | null>(null);
  const [filter, setFilter] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const uploadKey = useRef<string | null>(null);
  const applyKey = useRef<string | null>(null);
  const mutationLock = useRef(false);
  const pollController = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => pollController.current?.abort(), []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const loadIssues = useCallback(async (current: UserImportJob, cursor?: string, append = false) => {
    const page = await actions.issues(current.id, { limit: 100, ...(cursor ? { cursor } : {}), ...(normalizeIssueCode(filter) ? { code: normalizeIssueCode(filter) } : {}) });
    setIssues((previous) => append && previous ? { issues: [...previous.issues, ...page.issues], meta: page.meta } : page);
  }, [actions, filter]);

  const loadReport = useCallback(async (current: UserImportJob, cursor?: string, append = false) => {
    const page = await actions.report(current.id, { limit: 100, ...(cursor ? { cursor } : {}), ...(normalizeIssueCode(filter) ? { code: normalizeIssueCode(filter) } : {}) });
    setReport((previous) => append && previous ? { job: page.job, issues: [...previous.issues, ...page.issues], meta: page.meta } : page);
  }, [actions, filter]);

  const settleJob = useCallback(async (initial: UserImportJob) => {
    pollController.current?.abort();
    const controller = new AbortController();
    pollController.current = controller;
    const current = await pollUserImport(actions, initial, { intervalMs: pollIntervalMs, signal: controller.signal, onUpdate: setJob });
    setJob(current);
    const nextStage = userImportStage(current);
    setStage(nextStage);
    if (nextStage === "inspect") {
      setSheet(current.format === "xlsx" && current.inspection.sheets.length === 1 ? current.inspection.sheets[0] ?? "" : "");
    }
    if (nextStage === "issues") await loadIssues(current);
    if (nextStage === "complete") {
      applyKey.current = null;
      await loadReport(current);
    }
    if (nextStage === "failed" && current.failureCode !== "USER_IMPORT_APPLY_FAILED") applyKey.current = null;
    return current;
  }, [actions, loadIssues, loadReport, pollIntervalMs]);

  function chooseFile(next: File | null) {
    setFile(next);
    setFileError(next ? validateUserImportFile(next) : null);
    setError(null);
    uploadKey.current = null;
  }

  async function upload() {
    if (!file || mutationLock.current) return;
    const validation = validateUserImportFile(file);
    if (validation) { setFileError(validation); return; }
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    uploadKey.current ??= crypto.randomUUID();
    try {
      const accepted = await actions.create(file, uploadKey.current, csrfToken);
      setFile(null);
      setFileError(null);
      uploadKey.current = null;
      setJob(accepted);
      setStage(userImportStage(accepted));
      await settleJob(accepted);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function validate() {
    if (!job || mutationLock.current || !validSheetSelection(job, sheet)) return;
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const validating = await actions.validate(job.id, job.format === "xlsx" ? sheet : undefined, csrfToken);
      setJob(validating);
      setStage(userImportStage(validating));
      await settleJob(validating);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function apply() {
    if (!job || !acknowledged || job.counts.valid < 1 || mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    setError(null);
    applyKey.current ??= crypto.randomUUID();
    try {
      const applying = await actions.apply(job.id, applyKey.current, csrfToken);
      setJob(applying);
      setStage(userImportStage(applying));
      await settleJob(applying);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }

  async function retryStatus() {
    if (!job || busy) return;
    setBusy(true);
    setError(null);
    try { await settleJob(await actions.get(job.id)); } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  async function searchIssues() {
    if (!job || busy) return;
    setBusy(true);
    setError(null);
    try { await loadIssues(job); } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  async function searchReport() {
    if (!job || busy) return;
    setBusy(true);
    setError(null);
    try { await loadReport(job); } catch (caught) { setError(caught); } finally { setBusy(false); }
  }

  function restart() {
    pollController.current?.abort();
    setFile(null);
    setFileError(null);
    setJob(null);
    setStage("upload");
    setSheet("");
    setIssues(null);
    setReport(null);
    setFilter("");
    setAcknowledged(false);
    setError(null);
    uploadKey.current = null;
    applyKey.current = null;
  }

  function downloadReport() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([userImportReportCsv(report.issues)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bao-cao-nhap-nguoi-dung.csv";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  if (principal.role !== "system_admin") {
    return <main className="mx-auto max-w-3xl p-4 pb-24 sm:p-6"><section className="rounded-panel border bg-surface p-6 map-panel-shadow"><IconShieldLock className="text-destructive" stroke={1.75} /><h1 className="mt-4 text-xl font-semibold">Không có quyền nhập danh sách người dùng</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Chỉ quản trị hệ thống được nhập danh sách tài khoản. Hãy liên hệ người phụ trách nếu bạn cần được cấp quyền.</p></section></main>;
  }
  if (!canAuthor) return <MobileReadOnly />;

  return (
    <main className="mx-auto max-w-[1120px] p-4 pb-24 sm:p-6 md:p-8">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/users"><IconArrowLeft data-icon="inline-start" />Người dùng</Link></Button>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Quản trị truy cập</p><h1 className="mt-1 text-2xl font-semibold">Nhập danh sách người dùng</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Thêm nhiều tài khoản bằng tệp CSV hoặc Excel, sau đó gửi lời mời qua email.</p></div>
      </header>
      <div className="mt-6"><Stepper stage={stage} /></div>

      {Boolean(error) && <div ref={errorRef} tabIndex={-1} className="mt-5 outline-none"><UserImportErrorNotice error={error} onRetry={job ? retryStatus : undefined} /></div>}

      <div className="mt-5">
        {stage === "upload" && <UploadStep file={file} fileError={fileError} busy={busy} onFile={chooseFile} onSubmit={upload} />}
        {stage === "inspecting" && job && <ProcessingStep job={job} title="Đang kiểm tra tệp" />}
        {stage === "inspect" && job && <InspectStep job={job} sheet={sheet} busy={busy} onSheet={setSheet} onValidate={validate} />}
        {stage === "validating" && job && <ProcessingStep job={job} title="Đang kiểm tra danh sách" />}
        {stage === "issues" && job && <IssuesStep job={job} page={issues} filter={filter} acknowledged={acknowledged} busy={busy} onFilter={setFilter} onSearch={searchIssues} onMore={() => { if (issues?.meta.nextCursor) void loadIssues(job, issues.meta.nextCursor, true).catch(setError); }} onAcknowledged={setAcknowledged} onApply={apply} />}
        {stage === "applying" && job && <ProcessingStep job={job} title="Đang tạo lời mời" />}
        {stage === "complete" && job && <CompleteStep job={job} report={report} filter={filter} busy={busy} onFilter={setFilter} onSearch={searchReport} onMore={() => { if (report?.meta.nextCursor) void loadReport(job, report.meta.nextCursor, true).catch(setError); }} onDownload={downloadReport} onRestart={restart} />}
        {stage === "failed" && job && <section className="rounded-panel border bg-surface p-8 text-center map-panel-shadow"><span className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-destructive"><IconAlertTriangle stroke={1.75} /></span><h2 className="mt-4 text-lg font-semibold">Chưa thể nhập danh sách</h2><p className="mt-2 text-sm text-muted-foreground">{userImportIssueLabel(job.failureCode)}.</p><div className="mt-6 flex flex-wrap justify-center gap-3">{job.failureCode === "USER_IMPORT_VALIDATE_FAILED" && <Button type="button" onClick={validate} disabled={busy}><IconRefresh data-icon="inline-start" />Thử kiểm tra lại</Button>}{job.failureCode === "USER_IMPORT_APPLY_FAILED" && <Button type="button" onClick={apply} disabled={busy}><IconRefresh data-icon="inline-start" />Thử gửi lời mời lại</Button>}<Button type="button" variant="outline" onClick={retryStatus} disabled={busy}>Cập nhật trạng thái</Button><Button type="button" variant={job.failureCode === "USER_IMPORT_VALIDATE_FAILED" || job.failureCode === "USER_IMPORT_APPLY_FAILED" ? "outline" : "default"} onClick={restart}>Nhập danh sách khác</Button></div></section>}
      </div>

    </main>
  );
}

export function UserImportRoute() {
  return <UserImportWizard actions={userImportActions} />;
}
