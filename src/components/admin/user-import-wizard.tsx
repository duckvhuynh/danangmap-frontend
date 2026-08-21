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
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/lib/api/admin";
import { userImportActions, type UserImportActions, type UserImportIssue, type UserImportIssuePage, type UserImportJob, type UserImportReportPage } from "@/lib/api/user-imports";
import { pollUserImport } from "@/lib/user-imports/user-import-polling";
import {
  MAX_USER_IMPORT_BYTES,
  MAX_USER_IMPORT_ROWS,
  USER_IMPORT_COLUMNS,
  USER_IMPORT_ROLES,
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
  { id: "upload", label: "Tải file" },
  { id: "inspect", label: "Kiểm tra" },
  { id: "issues", label: "Xem lỗi" },
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
    <ol className="grid gap-2 sm:grid-cols-4" aria-label="Tiến trình import người dùng">
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
      <AlertTitle>Chỉ tạo tài khoản ở trạng thái lời mời</AlertTitle>
      <AlertDescription>
        Kiểm tra thử không tạo tài khoản. Khi áp dụng, mỗi dòng hợp lệ tạo một lời mời để người dùng tự đặt mật khẩu và thiết lập MFA; tài khoản hiện có không bị cập nhật.
      </AlertDescription>
    </Alert>
  );
}

function UserImportErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  let message = error instanceof Error ? error.message : "Không thể hoàn tất yêu cầu import.";
  let requestId: string | undefined;
  if (error instanceof AdminApiError) {
    const prefix = ({
      401: "Phiên đăng nhập đã hết hạn.",
      403: "Bạn không có quyền import người dùng.",
      409: "Phiên import đang ở trạng thái khác hoặc lệnh cùng mã chống trùng đang được xử lý.",
      412: "Dữ liệu import trên máy chủ đã thay đổi.",
      413: "File vượt quá giới hạn dung lượng của máy chủ.",
      415: "Định dạng hoặc nội dung file không được hỗ trợ.",
      422: "Nội dung file hoặc worksheet chưa hợp lệ.",
      429: "Đang có quá nhiều phiên import. Hãy chờ trước khi thử lại.",
      503: "Dịch vụ import tạm thời chưa sẵn sàng.",
    } as Record<number, string>)[error.status];
    message = `${prefix ?? error.message}${prefix && prefix !== error.message ? ` ${error.message}` : ""}`;
    requestId = error.requestId;
  }
  return (
    <Alert variant="destructive">
      <IconAlertTriangle stroke={1.75} />
      <AlertTitle>Không thể hoàn tất yêu cầu</AlertTitle>
      <AlertDescription><p>{message}{requestId ? ` Mã yêu cầu: ${requestId}.` : ""}</p>{onRetry && <Button className="mt-3" type="button" variant="outline" size="sm" onClick={onRetry}><IconRefresh data-icon="inline-start" />Cập nhật trạng thái</Button>}</AlertDescription>
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
          <p className="mt-1 text-sm leading-6 text-muted-foreground">File chỉ tồn tại trong bộ nhớ của tab cho tới khi API nhận thành công; DanangMap không lưu file vào IndexedDB hay Web Storage.</p>
        </div>
      </div>

      <FieldGroup className="mt-6">
        <Field data-invalid={Boolean(fileError)}>
          <div className="rounded-panel border-2 border-dashed bg-surface-subtle p-6 text-center">
            <IconUpload className="mx-auto text-primary" size={30} stroke={1.6} />
            <FieldLabel htmlFor="user-import-file" className="mx-auto mt-3 cursor-pointer text-primary underline-offset-4 hover:underline">
              Chọn file CSV hoặc XLSX
            </FieldLabel>
            <Input
              id="user-import-file"
              className="sr-only"
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              aria-invalid={Boolean(fileError)}
              onChange={(event) => onFile(event.target.files?.[0] ?? null)}
            />
            <FieldDescription>Tối đa 5 MiB (5.242.880 byte) · tối đa 5.000 dòng · CSV UTF-8 hoặc XLSX values-only</FieldDescription>
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

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-control border p-4">
          <p className="text-sm font-medium">Bốn cột bắt buộc, đúng thứ tự</p>
          <div className="mt-3 flex flex-wrap gap-2">{USER_IMPORT_COLUMNS.map((column) => <Badge key={column}>{column}</Badge>)}</div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Cột password, MFA, secret, recovery code hoặc cột đặc quyền không xác định sẽ bị từ chối.</p>
        </div>
        <div className="rounded-control border p-4">
          <p className="text-sm font-medium">Role được phép</p>
          <div className="mt-3 flex flex-wrap gap-2">{USER_IMPORT_ROLES.map((role) => <Badge key={role}>{role}</Badge>)}</div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Role không tạo quyền theo layer và không bypass workflow nội dung.</p>
        </div>
      </div>

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
          <h2 id="user-import-inspect-heading" className="font-semibold">2. Xác nhận cấu trúc trước khi kiểm tra thử</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Máy chủ đã nhận diện {job.format.toUpperCase()}. Không có bước ánh xạ cột vì schema tài khoản là cố định.</p>
        </div>
        <Badge>{job.format.toUpperCase()}</Badge>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-control border bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">File</dt><dd className="mt-1 truncate text-sm font-medium">{job.file.name}</dd></div>
        <div className="rounded-control border bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Dung lượng</dt><dd className="mt-1 text-sm font-medium">{(job.file.sizeBytes / 1024).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} KiB</dd></div>
        <div className="rounded-control border bg-surface-subtle p-3"><dt className="text-xs text-muted-foreground">Chính sách</dt><dd className="mt-1 text-sm font-medium">Invite only</dd></div>
      </dl>

      {job.format === "xlsx" && (
        <Field className="mt-6" data-invalid={!canValidate}>
          <FieldLabel htmlFor="user-import-sheet">Worksheet cần nhập</FieldLabel>
          <select id="user-import-sheet" className={selectClass} value={sheet} onChange={(event) => onSheet(event.target.value)} aria-invalid={!canValidate}>
            <option value="">Chọn worksheet đã được kiểm tra</option>
            {job.inspection.sheets.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <FieldDescription>Chỉ worksheet do backend trả về mới được chọn. File tối đa {job.inspection.limits.maxSheets} sheet.</FieldDescription>
          {!canValidate && <FieldError>Hãy chọn đúng một worksheet trước khi kiểm tra thử.</FieldError>}
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
        <caption className="sr-only">Các lỗi kiểm tra thử của file import người dùng</caption>
        <thead className="bg-surface-subtle text-xs text-muted-foreground"><tr><th className="px-3 py-2 font-medium" scope="col">Dòng</th><th className="px-3 py-2 font-medium" scope="col">Mã lỗi</th><th className="px-3 py-2 font-medium" scope="col">Trường</th></tr></thead>
        <tbody className="divide-y">{issues.map((issue) => <tr key={issue.id}><td className="px-3 py-2">{issue.rowNumber}</td><td className="px-3 py-2 font-mono text-xs text-destructive">{issue.code}</td><td className="px-3 py-2">{issue.field ?? "Cấu trúc file"}</td></tr>)}</tbody>
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
        <div><h2 id="user-import-issues-heading" className="font-semibold">3. Xem kết quả kiểm tra thử</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Dòng lỗi không tạo tài khoản. Dòng hợp lệ chỉ được áp dụng sau xác nhận của bạn.</p></div>
        <Badge className={job.counts.invalid ? "bg-red-50 text-destructive" : undefined}>{job.counts.invalid ? `${job.counts.invalid} lỗi` : "Không có lỗi"}</Badge>
      </div>
      <div className="mt-5"><Counts job={job} /></div>

      <FieldGroup className="mt-5">
        <Field orientation="responsive">
          <FieldContent>
            <FieldLabel htmlFor="user-import-issue-code">Lọc theo mã lỗi</FieldLabel>
            <FieldDescription>Ví dụ USER_IMPORT_EMAIL_INVALID</FieldDescription>
          </FieldContent>
          <div className="flex w-full gap-2 sm:max-w-lg">
            <Input id="user-import-issue-code" value={filter} onChange={(event) => onFilter(event.target.value)} pattern="[A-Z][A-Z0-9_]{2,99}" />
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
          <FieldDescription>{job.counts.valid.toLocaleString("vi-VN")} dòng hợp lệ sẽ trở thành invite/inactive; {job.counts.invalid.toLocaleString("vi-VN")} dòng lỗi bị bỏ qua và tài khoản hiện có không được cập nhật.</FieldDescription>
        </FieldContent>
      </Field>

      {job.counts.valid < 1 && <Alert variant="destructive" className="mt-5"><IconAlertTriangle stroke={1.75} /><AlertTitle>Không có dòng hợp lệ</AlertTitle><AlertDescription>Hãy sửa file và bắt đầu một phiên import mới.</AlertDescription></Alert>}
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
        <h2 className="mt-4 text-lg font-semibold">Import người dùng hoàn tất</h2>
        <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Đã tạo {job.counts.applied.toLocaleString("vi-VN")} lời mời đang chờ chấp nhận; chưa có tài khoản hoạt động nào được tạo trực tiếp. Người nhận vẫn phải đặt mật khẩu và thiết lập MFA trước khi có phiên quản trị.</p>
      </div>
      <div className="mt-6"><Counts job={job} /></div>
      <FieldGroup className="mt-5">
        <Field orientation="responsive">
          <FieldContent><FieldLabel htmlFor="user-import-report-code">Lọc báo cáo theo mã lỗi</FieldLabel><FieldDescription>Bộ lọc được gửi tới report endpoint; không lọc file ở trình duyệt.</FieldDescription></FieldContent>
          <div className="flex w-full gap-2 sm:max-w-lg"><Input id="user-import-report-code" value={filter} onChange={(event) => onFilter(event.target.value)} /><Button type="button" variant="outline" onClick={onSearch} disabled={busy}>Lọc</Button></div>
        </Field>
      </FieldGroup>
      <div className="mt-5"><IssueTable issues={report?.issues ?? []} /></div>
      {report?.meta.hasMore && <Button className="mt-3" type="button" variant="outline" onClick={onMore} disabled={busy}>Xem thêm báo cáo</Button>}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button type="button" variant="outline" onClick={onDownload} disabled={!report}><IconDownload data-icon="inline-start" stroke={1.75} />Tải trang báo cáo JSON</Button>
        <Button type="button" onClick={onRestart}><IconRefresh data-icon="inline-start" stroke={1.75} />Import danh sách khác</Button>
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
        <h1 className="mt-4 text-xl font-semibold">Import người dùng cần máy tính</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Trên điện thoại, System Admin chỉ được xem thông tin. Tải file, kiểm tra dữ liệu và áp dụng cần màn hình từ 1024 px cùng chuột hoặc trackpad để giảm thao tác nhầm.</p>
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
    const url = URL.createObjectURL(new Blob([JSON.stringify({ data: { job: report.job, issues: report.issues }, meta: report.meta }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `user-import-${report.job.id}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  if (principal.role !== "system_admin") {
    return <main className="mx-auto max-w-3xl p-4 pb-24 sm:p-6"><section className="rounded-panel border bg-surface p-6 map-panel-shadow"><IconShieldLock className="text-destructive" stroke={1.75} /><h1 className="mt-4 text-xl font-semibold">Không có quyền import người dùng</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Chỉ System Admin được tải, kiểm tra thử và áp dụng danh sách tài khoản. Backend vẫn là lớp kiểm soát quyền bắt buộc.</p></section></main>;
  }
  if (!canAuthor) return <MobileReadOnly />;

  return (
    <main className="mx-auto max-w-[1120px] p-4 pb-24 sm:p-6 md:p-8">
      <Button asChild variant="ghost" size="sm"><Link href="/admin/users"><IconArrowLeft data-icon="inline-start" />Người dùng</Link></Button>
      <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Quản trị truy cập</p><h1 className="mt-1 text-2xl font-semibold">Import người dùng nội bộ</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Kiểm tra danh sách trước khi tạo lời mời. Không import mật khẩu, MFA hay cập nhật tài khoản hiện có.</p></div>
        <Badge>System Admin</Badge>
      </header>
      <div className="mt-6"><Stepper stage={stage} /></div>

      {Boolean(error) && <div ref={errorRef} tabIndex={-1} className="mt-5 outline-none"><UserImportErrorNotice error={error} onRetry={job ? retryStatus : undefined} /></div>}

      <div className="mt-5">
        {stage === "upload" && <UploadStep file={file} fileError={fileError} busy={busy} onFile={chooseFile} onSubmit={upload} />}
        {stage === "inspecting" && job && <ProcessingStep job={job} title="Đang kiểm tra file" />}
        {stage === "inspect" && job && <InspectStep job={job} sheet={sheet} busy={busy} onSheet={setSheet} onValidate={validate} />}
        {stage === "validating" && job && <ProcessingStep job={job} title="Đang kiểm tra thử danh sách" />}
        {stage === "issues" && job && <IssuesStep job={job} page={issues} filter={filter} acknowledged={acknowledged} busy={busy} onFilter={setFilter} onSearch={searchIssues} onMore={() => { if (issues?.meta.nextCursor) void loadIssues(job, issues.meta.nextCursor, true).catch(setError); }} onAcknowledged={setAcknowledged} onApply={apply} />}
        {stage === "applying" && job && <ProcessingStep job={job} title="Đang tạo lời mời" />}
        {stage === "complete" && job && <CompleteStep job={job} report={report} filter={filter} busy={busy} onFilter={setFilter} onSearch={searchReport} onMore={() => { if (report?.meta.nextCursor) void loadReport(job, report.meta.nextCursor, true).catch(setError); }} onDownload={downloadReport} onRestart={restart} />}
        {stage === "failed" && job && <section className="rounded-panel border bg-surface p-8 text-center map-panel-shadow"><span className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-destructive"><IconAlertTriangle stroke={1.75} /></span><h2 className="mt-4 text-lg font-semibold">Phiên import không thể hoàn tất</h2><p className="mt-2 text-sm text-muted-foreground">Mã lỗi: {job.failureCode ?? "USER_IMPORT_FAILED"}. Không có tài khoản hoạt động nào được tạo trực tiếp từ file.</p><div className="mt-6 flex flex-wrap justify-center gap-3">{job.failureCode === "USER_IMPORT_VALIDATE_FAILED" && <Button type="button" onClick={validate} disabled={busy}><IconRefresh data-icon="inline-start" />Thử kiểm tra lại</Button>}{job.failureCode === "USER_IMPORT_APPLY_FAILED" && <Button type="button" onClick={apply} disabled={busy}><IconRefresh data-icon="inline-start" />Thử gửi lời mời lại</Button>}<Button type="button" variant="outline" onClick={retryStatus} disabled={busy}>Cập nhật trạng thái</Button><Button type="button" variant={job.failureCode === "USER_IMPORT_VALIDATE_FAILED" || job.failureCode === "USER_IMPORT_APPLY_FAILED" ? "outline" : "default"} onClick={restart}>Bắt đầu phiên mới</Button></div></section>}
      </div>

      <footer className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"><span>Giới hạn client: {MAX_USER_IMPORT_BYTES.toLocaleString("vi-VN")} byte</span><span>Tối đa {MAX_USER_IMPORT_ROWS.toLocaleString("vi-VN")} dòng</span><span>Server kiểm tra lại MIME, cấu trúc và quyền</span></footer>
    </main>
  );
}

export function UserImportRoute() {
  return <UserImportWizard actions={userImportActions} />;
}
