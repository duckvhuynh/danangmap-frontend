"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CircleAlert as IconAlertCircle,
  Check as IconCheck,
  ChevronRight as IconChevronRight,
  Monitor as IconDeviceDesktop,
  FileInput as IconFileImport,
  Forward as IconMailForward,
  MailPlus as IconMailPlus,
  Plus as IconPlus,
  RefreshCw as IconRefresh,
  Search as IconSearch,
  Shield as IconShieldLock,
  Users as IconUsers,
} from "lucide-react";
import { AdminInvitesPanel } from "@/components/admin/admin-invites-panel";
import { useAdminSession } from "@/components/admin/admin-session";
import { UserSecurityDetail } from "@/components/admin/user-security-detail";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdminApiError, adminErrorMessage } from "@/lib/api/admin";
import { createInvite, createUser, listUsers, type AdminUser, type AdminUserPage } from "@/lib/api/users";
import { getDesktopAuthoringCapability, getServerDesktopAuthoringCapability, subscribeDesktopAuthoringCapability } from "@/lib/admin/authoring-capability";
import { cn } from "@/lib/utils";
import {
  adminUserRoleLabels,
  adminUserRoles,
  adminUserStatusLabels,
  initialAdminUserForm,
  toCreateInviteInput,
  toCreateUserInput,
  validateAdminUserForm,
  type AccountCreationMode,
  type AdminUserFormErrors,
  type AdminUserFormValues,
} from "@/lib/users/user-admin-state";

type DirectorySection = "users" | "invites";

function userErrorMessage(error: unknown) {
  if (error instanceof AdminApiError) {
    if (error.status === 409) return "Email hoặc tên đăng nhập có thể đã được sử dụng. Hãy kiểm tra danh sách tài khoản.";
    if (error.status === 412) return "Thông tin tài khoản vừa thay đổi. Hãy tải lại trước khi tiếp tục.";
    if (error.status === 422) return "Thông tin tài khoản chưa hợp lệ. Hãy kiểm tra các mục đã nhập.";
  }
  return adminErrorMessage(error);
}

function statusTone(status: AdminUser["status"]) {
  if (status === "active") return "bg-success/10 text-success";
  if (status === "disabled") return "bg-destructive/10 text-destructive";
  if (status === "invited") return "bg-warning/10 text-warning";
  return "bg-surface-subtle text-muted-foreground";
}

function UserIdentity({ user }: { user: AdminUser }) {
  const initials = user.displayName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toLocaleUpperCase("vi");
  return <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-primary" aria-hidden="true">{initials}</span><span className="min-w-0"><span className="block truncate font-medium text-foreground">{user.displayName}</span><span className="block truncate text-xs text-muted-foreground">{user.email}</span></span></div>;
}

function UsersLoading() {
  return <div className="grid gap-3 p-4" role="status" aria-label="Đang tải danh sách người dùng">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
}

function UsersList({ users, onSelect, mfaPolicyEnabled }: { users: AdminUser[]; onSelect(userId: string): void; mfaPolicyEnabled: boolean }) {
  if (!users.length) return <Empty className="min-h-72 border-0"><EmptyHeader><EmptyMedia variant="icon"><IconUsers strokeWidth={1.75} /></EmptyMedia><EmptyTitle>Chưa có tài khoản phù hợp</EmptyTitle><EmptyDescription>Thử từ khóa khác hoặc chọn lại bộ lọc.</EmptyDescription></EmptyHeader></Empty>;
  return <>
    <div className="hidden md:block"><Table><caption className="sr-only">Danh sách tài khoản nội bộ</caption><TableHeader><TableRow><TableHead className="px-4">Người dùng</TableHead><TableHead>Tên đăng nhập</TableHead><TableHead>Vai trò</TableHead><TableHead>Trạng thái</TableHead><TableHead>Bảo mật</TableHead><TableHead><span className="sr-only">Mở chi tiết</span></TableHead></TableRow></TableHeader><TableBody>{users.map((user) => <TableRow key={user.id}><TableCell className="px-4 py-3"><UserIdentity user={user} /></TableCell><TableCell className="text-muted-foreground">@{user.username}</TableCell><TableCell><Badge>{adminUserRoleLabels[user.role]}</Badge></TableCell><TableCell><Badge className={statusTone(user.status)}>{adminUserStatusLabels[user.status]}</Badge></TableCell><TableCell className="text-xs text-muted-foreground"><p>{user.mustChangePassword ? "Cần đổi mật khẩu" : mfaPolicyEnabled ? (user.mfaEnabled ? "Đã xác thực hai bước" : "Chưa xác thực hai bước") : "Đăng nhập bằng mật khẩu"}</p><p className="mt-1">{user.security.activeSessionCount} phiên đăng nhập</p></TableCell><TableCell className="pr-4 text-right"><Button type="button" variant="ghost" size="icon-sm" onClick={() => onSelect(user.id)} aria-label={`Xem chi tiết ${user.displayName}`}><IconChevronRight strokeWidth={1.75} /></Button></TableCell></TableRow>)}</TableBody></Table></div>
    <div className="divide-y md:hidden">{users.map((user) => <button type="button" key={user.id} onClick={() => onSelect(user.id)} className="flex w-full items-center gap-3 p-4 text-left outline-none hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><UserIdentity user={user} /><span className="ml-auto flex shrink-0 items-center gap-2"><Badge className={statusTone(user.status)}>{adminUserStatusLabels[user.status]}</Badge><IconChevronRight className="text-muted-foreground" strokeWidth={1.75} /></span></button>)}</div>
  </>;
}

function AccountDialog({ mode, open, onOpenChange, onCreated }: { mode: AccountCreationMode; open: boolean; onOpenChange(open: boolean): void; onCreated(message: string): void }) {
  const { csrfToken } = useAdminSession();
  const [values, setValues] = useState<AdminUserFormValues>(initialAdminUserForm);
  const [errors, setErrors] = useState<AdminUserFormErrors>({});
  const [requestError, setRequestError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const operationKey = useRef<string | null>(null);

  const reset = useCallback(() => { setValues(initialAdminUserForm); setErrors({}); setRequestError(null); setSubmitting(false); operationKey.current = null; }, []);
  function change<K extends keyof AdminUserFormValues>(field: K, value: AdminUserFormValues[K]) { setValues((current) => ({ ...current, [field]: value })); setErrors((current) => ({ ...current, [field]: undefined })); setRequestError(null); operationKey.current = null; }
  function setOpen(next: boolean) { if (!next) reset(); onOpenChange(next); }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateAdminUserForm(mode, values);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0] as keyof AdminUserFormValues | undefined;
    if (firstError) { document.getElementById(`account-${firstError}`)?.focus(); return; }
    setSubmitting(true);
    setRequestError(null);
    operationKey.current ??= crypto.randomUUID();
    try {
      if (mode === "manual") { await createUser(toCreateUserInput(values), operationKey.current, { csrfToken }); onCreated(`Đã tạo tài khoản cho ${values.displayName.trim()}.`); }
      else { await createInvite(toCreateInviteInput(values), operationKey.current, { csrfToken }); onCreated(`Đã gửi lời mời tới ${values.email.trim()}.`); }
      setOpen(false);
    } catch (error) { setRequestError(error); } finally { setSubmitting(false); }
  }

  const isManual = mode === "manual";
  return <Dialog open={open} onOpenChange={setOpen}><DialogContent aria-describedby="account-dialog-description"><DialogHeader><DialogTitle>{isManual ? "Tạo tài khoản" : "Gửi lời mời tài khoản"}</DialogTitle><DialogDescription id="account-dialog-description">{isManual ? "Người dùng sẽ đăng nhập bằng mật khẩu tạm thời và đổi mật khẩu trong lần đầu." : "Người nhận hoàn tất thiết lập tài khoản qua lời mời có thời hạn."}</DialogDescription></DialogHeader><form className="grid gap-5" onSubmit={submit} noValidate>{requestError ? <Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Không thể hoàn tất yêu cầu</AlertTitle><AlertDescription>{userErrorMessage(requestError)}</AlertDescription></Alert> : null}<FieldGroup className="gap-4">
    <Field data-invalid={Boolean(errors.displayName)}><FieldLabel htmlFor="account-displayName">Tên hiển thị</FieldLabel><Input id="account-displayName" value={values.displayName} placeholder="Ví dụ: Nguyễn Văn An" onChange={(event) => change("displayName", event.target.value)} autoComplete="name" aria-invalid={Boolean(errors.displayName)} disabled={submitting} /><FieldError>{errors.displayName}</FieldError></Field>
    <div className="grid gap-4 sm:grid-cols-2"><Field data-invalid={Boolean(errors.username)}><FieldLabel htmlFor="account-username">Tên đăng nhập</FieldLabel><Input id="account-username" value={values.username} placeholder="Ví dụ: nguyenvanan" onChange={(event) => change("username", event.target.value.toLocaleLowerCase("vi"))} autoComplete="username" spellCheck={false} aria-invalid={Boolean(errors.username)} disabled={submitting} /><FieldDescription>Chỉ dùng chữ thường không dấu và số.</FieldDescription><FieldError>{errors.username}</FieldError></Field><Field data-invalid={Boolean(errors.email)}><FieldLabel htmlFor="account-email">Email công vụ</FieldLabel><Input id="account-email" type="email" value={values.email} placeholder="Ví dụ: an.nguyen@danang.gov.vn" onChange={(event) => change("email", event.target.value)} autoComplete="email" spellCheck={false} aria-invalid={Boolean(errors.email)} disabled={submitting} /><FieldError>{errors.email}</FieldError></Field></div>
    <Field><FieldLabel htmlFor="account-role">Vai trò</FieldLabel><Select value={values.role} onValueChange={(value: AdminUser["role"]) => change("role", value)} disabled={submitting}><SelectTrigger id="account-role"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{adminUserRoles.map((role) => <SelectItem key={role} value={role}>{adminUserRoleLabels[role]}</SelectItem>)}</SelectGroup></SelectContent></Select><FieldDescription>Vai trò áp dụng chung cho toàn hệ thống.</FieldDescription></Field>
    {isManual ? <Field data-invalid={Boolean(errors.temporaryPassword)}><FieldLabel htmlFor="account-temporaryPassword">Mật khẩu tạm thời</FieldLabel><Input id="account-temporaryPassword" type="password" value={values.temporaryPassword} placeholder="Ví dụ: DaNang@2026!QuanTri" onChange={(event) => change("temporaryPassword", event.target.value)} autoComplete="new-password" aria-invalid={Boolean(errors.temporaryPassword)} disabled={submitting} /><FieldDescription>Ít nhất 12 ký tự. Không gửi qua kênh không an toàn.</FieldDescription><FieldError>{errors.temporaryPassword}</FieldError></Field> : <Field data-invalid={Boolean(errors.expiresInHours)}><FieldLabel htmlFor="account-expiresInHours">Thời hạn lời mời (giờ)</FieldLabel><Input id="account-expiresInHours" type="number" min={1} max={168} value={values.expiresInHours} placeholder="Ví dụ: 72" onChange={(event) => change("expiresInHours", event.target.value)} aria-invalid={Boolean(errors.expiresInHours)} disabled={submitting} /><FieldDescription>Từ 1 đến 168 giờ, mặc định 72 giờ.</FieldDescription><FieldError>{errors.expiresInHours}</FieldError></Field>}
  </FieldGroup><DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Hủy</Button><Button type="submit" disabled={submitting}>{submitting ? <><Spinner />Đang xử lý...</> : isManual ? <><IconPlus strokeWidth={1.75} />Tạo tài khoản</> : <><IconMailPlus strokeWidth={1.75} />Gửi lời mời</>}</Button></DialogFooter></form></DialogContent></Dialog>;
}

export function UsersAdmin() {
  const { principal } = useAdminSession();
  const canMutate = useSyncExternalStore(subscribeDesktopAuthoringCapability, getDesktopAuthoringCapability, getServerDesktopAuthoringCapability);
  const [section, setSection] = useState<DirectorySection>("users");
  const [page, setPage] = useState<AdminUserPage | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<AdminUser["role"] | "all">("all");
  const [status, setStatus] = useState<AdminUser["status"] | "all">("all");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [inviteRefreshToken, setInviteRefreshToken] = useState(0);
  const [dialogMode, setDialogMode] = useState<AccountCreationMode | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [success, setSuccess] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setLoadError(null);
    try {
      const next = await listUsers({ q: query.trim() || undefined, role: role === "all" ? undefined : role, status: status === "all" ? undefined : status, limit: 25 }, signal);
      if (!signal?.aborted) setPage(next);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setLoadError(error);
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [query, role, status]);

  useEffect(() => {
    if (principal.role !== "system_admin" || section !== "users") return;
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => void load(controller.signal), 250);
    return () => { globalThis.clearTimeout(timer); controller.abort(); };
  }, [load, principal.role, reloadVersion, section]);

  async function loadMore() {
    if (!page?.meta.nextCursor || loadingMore) return;
    setLoadingMore(true); setLoadError(null);
    try {
      const next = await listUsers({ q: query.trim() || undefined, role: role === "all" ? undefined : role, status: status === "all" ? undefined : status, cursor: page.meta.nextCursor, limit: page.meta.limit });
      setPage({ ...next, data: [...page.data, ...next.data] });
    } catch (error) { setLoadError(error); } finally { setLoadingMore(false); }
  }

  if (principal.role !== "system_admin") return <main className="mx-auto grid min-h-[70dvh] max-w-2xl place-items-center p-4 pb-24 sm:p-6 md:p-8"><Alert variant="destructive"><IconShieldLock strokeWidth={1.75} /><AlertTitle>Không có quyền truy cập</AlertTitle><AlertDescription>Chỉ quản trị hệ thống được quản lý tài khoản. Hãy liên hệ người phụ trách nếu bạn cần được cấp quyền.</AlertDescription></Alert></main>;

  function afterChanged(message: string) { setSuccess(message); setReloadVersion((value) => value + 1); setInviteRefreshToken((value) => value + 1); }

  return <main className="mx-auto max-w-[1200px] p-4 pb-24 sm:p-6 md:p-8">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-muted-foreground">Quản trị truy cập</p><h1 className="mt-1 text-2xl font-semibold">Người dùng nội bộ</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Tạo tài khoản, phân quyền và hỗ trợ người dùng đăng nhập.</p></div>{canMutate ? <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link href="/admin/users/import"><IconFileImport strokeWidth={1.75} />Nhập từ tệp</Link></Button><Button type="button" variant="outline" onClick={() => { setSuccess(""); setDialogMode("invite"); }}><IconMailPlus strokeWidth={1.75} />Gửi lời mời</Button><Button type="button" onClick={() => { setSuccess(""); setDialogMode("manual"); }}><IconPlus strokeWidth={1.75} />Tạo tài khoản</Button></div> : null}</header>
    {!canMutate ? <Alert className="mt-5 border-primary/20 bg-accent-subtle"><IconDeviceDesktop strokeWidth={1.75} /><AlertTitle>Chế độ chỉ xem</AlertTitle><AlertDescription>Bạn có thể xem tài khoản và thông tin bảo mật. Để chỉnh sửa, hãy dùng máy tính có bàn phím và chuột.</AlertDescription></Alert> : null}
    {success ? <div className="mt-5 flex items-start gap-3 rounded-control border border-success/20 bg-green-50 p-4 text-sm text-success" role="status" aria-live="polite"><IconCheck className="mt-0.5 shrink-0" strokeWidth={1.75} /><span>{success}</span></div> : null}

    <div className="mt-7 flex w-full rounded-control border bg-surface p-1 sm:w-fit" role="tablist" aria-label="Danh sách tài khoản và lời mời"><button type="button" role="tab" aria-selected={section === "users"} className={cn("flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium sm:flex-none", section === "users" ? "bg-accent-subtle text-primary" : "text-muted-foreground hover:bg-surface-subtle")} onClick={() => setSection("users")}><IconUsers size={18} strokeWidth={1.75} />Tài khoản</button><button type="button" role="tab" aria-selected={section === "invites"} className={cn("flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium sm:flex-none", section === "invites" ? "bg-accent-subtle text-primary" : "text-muted-foreground hover:bg-surface-subtle")} onClick={() => setSection("invites")}><IconMailForward size={18} strokeWidth={1.75} />Lời mời</button></div>

    {section === "users" ? <section className="mt-4 overflow-hidden rounded-panel border bg-surface" aria-labelledby="users-list-title">
      <div className="grid gap-4 border-b p-4 lg:grid-cols-[1fr_12rem_12rem]"><div className="relative"><IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={19} strokeWidth={1.75} /><label className="sr-only" htmlFor="users-search">Tìm tài khoản</label><Input id="users-search" className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm tên, email hoặc tài khoản..." /></div><Select value={role} onValueChange={(value: AdminUser["role"] | "all") => setRole(value)}><SelectTrigger aria-label="Lọc vai trò tài khoản"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Tất cả vai trò</SelectItem>{adminUserRoles.map((item) => <SelectItem key={item} value={item}>{adminUserRoleLabels[item]}</SelectItem>)}</SelectGroup></SelectContent></Select><Select value={status} onValueChange={(value: AdminUser["status"] | "all") => setStatus(value)}><SelectTrigger aria-label="Lọc trạng thái tài khoản"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Tất cả trạng thái</SelectItem><SelectItem value="active">Đang hoạt động</SelectItem><SelectItem value="inactive">Chưa hoạt động</SelectItem><SelectItem value="disabled">Đã vô hiệu hóa</SelectItem><SelectItem value="invited">Đã mời</SelectItem></SelectGroup></SelectContent></Select></div>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3"><div><h2 id="users-list-title" className="font-medium">Danh sách tài khoản</h2><p className="mt-1 text-xs text-muted-foreground">{page ? `${page.data.length} tài khoản đã tải${page.meta.hasMore ? " · còn tài khoản khác" : ""}` : "Đang tải danh sách tài khoản..."}</p></div>{loading && page ? <span className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner />Đang làm mới</span> : null}</div>
      {loadError && !page ? <div className="p-4"><Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Không tải được danh sách</AlertTitle><AlertDescription><p>{userErrorMessage(loadError)}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setReloadVersion((value) => value + 1)}><IconRefresh strokeWidth={1.75} />Thử lại</Button></AlertDescription></Alert></div> : null}
      {loading && !page ? <UsersLoading /> : page ? <UsersList users={page.data} onSelect={setSelectedUserId} mfaPolicyEnabled={principal.mfaEnabled} /> : null}
      {page?.meta.hasMore ? <div className="flex justify-center border-t p-4"><Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <><Spinner />Đang tải...</> : "Tải thêm tài khoản"}</Button></div> : null}
      {loadError && page ? <div className="border-t p-4"><Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Danh sách hiện tại chưa được làm mới</AlertTitle><AlertDescription>{userErrorMessage(loadError)}</AlertDescription></Alert></div> : null}
    </section> : <div className="mt-4"><AdminInvitesPanel canMutate={canMutate} refreshToken={inviteRefreshToken} onChanged={afterChanged} /></div>}

    <AccountDialog mode="manual" open={dialogMode === "manual"} onOpenChange={(open) => setDialogMode(open ? "manual" : null)} onCreated={afterChanged} />
    <AccountDialog mode="invite" open={dialogMode === "invite"} onOpenChange={(open) => setDialogMode(open ? "invite" : null)} onCreated={afterChanged} />
    <UserSecurityDetail userId={selectedUserId} open={selectedUserId !== null} canMutate={canMutate} onOpenChange={(open) => { if (!open) setSelectedUserId(null); }} onChanged={afterChanged} />
  </main>;
}
