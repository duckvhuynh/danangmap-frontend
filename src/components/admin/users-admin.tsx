"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  IconAlertCircle,
  IconCheck,
  IconFileImport,
  IconKey,
  IconLock,
  IconMailPlus,
  IconPlus,
  IconSearch,
  IconShieldLock,
  IconUsers,
} from "@tabler/icons-react";
import { useAdminSession } from "@/components/admin/admin-session";
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
import {
  adminUserRoleLabels,
  adminUserRoles,
  adminUserStatusLabels,
  filterAdminUsers,
  initialAdminUserForm,
  toCreateInviteInput,
  toCreateUserInput,
  validateAdminUserForm,
  type AccountCreationMode,
  type AdminUserFormErrors,
  type AdminUserFormValues,
} from "@/lib/users/user-admin-state";

const authoringQuery = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
const subscribeAuthoring = (callback: () => void) => {
  const media = window.matchMedia(authoringQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
const getAuthoring = () => window.matchMedia(authoringQuery).matches;
const getServerAuthoring = () => false;

function userErrorMessage(error: unknown) {
  if (error instanceof AdminApiError && error.status === 409) {
    return `Email hoặc tên đăng nhập đã tồn tại, hoặc yêu cầu xung đột với dữ liệu hiện có. ${error.message}${error.requestId ? ` Mã yêu cầu: ${error.requestId}.` : ""}`;
  }
  return adminErrorMessage(error);
}

function statusTone(status: AdminUser["status"]) {
  if (status === "active") return "bg-green-50 text-success";
  if (status === "disabled") return "bg-red-50 text-destructive";
  if (status === "invited") return "bg-amber-50 text-warning";
  return "bg-surface-subtle text-muted-foreground";
}

function UserIdentity({ user }: { user: AdminUser }) {
  const initials = user.displayName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join("").toLocaleUpperCase("vi");
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-primary" aria-hidden="true">{initials}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-foreground">{user.displayName}</span>
        <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
      </span>
    </div>
  );
}

function UsersLoading() {
  return <div className="grid gap-3 p-4" role="status" aria-label="Đang tải danh sách người dùng">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div>;
}

function UsersList({ users }: { users: AdminUser[] }) {
  if (!users.length) {
    return (
      <Empty className="min-h-72 border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon"><IconUsers stroke={1.75} /></EmptyMedia>
          <EmptyTitle>Chưa có tài khoản phù hợp</EmptyTitle>
          <EmptyDescription>Thử thay đổi từ khóa lọc hoặc tạo tài khoản mới trên máy tính.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <caption className="sr-only">Danh sách tài khoản nội bộ</caption>
          <TableHeader><TableRow><TableHead className="px-4">Người dùng</TableHead><TableHead>Tên đăng nhập</TableHead><TableHead>Vai trò</TableHead><TableHead>Trạng thái</TableHead><TableHead className="pr-4">Bảo mật</TableHead></TableRow></TableHeader>
          <TableBody>{users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="px-4 py-3"><UserIdentity user={user} /></TableCell>
              <TableCell className="text-muted-foreground">@{user.username}</TableCell>
              <TableCell><Badge>{adminUserRoleLabels[user.role]}</Badge></TableCell>
              <TableCell><Badge className={statusTone(user.status)}>{adminUserStatusLabels[user.status]}</Badge></TableCell>
              <TableCell className="pr-4 text-xs text-muted-foreground">{user.mfaEnabled ? "Đã bật MFA" : user.mustChangePassword ? "Cần đổi mật khẩu" : "Chưa bật MFA"}</TableCell>
            </TableRow>
          ))}</TableBody>
        </Table>
      </div>
      <div className="divide-y md:hidden">{users.map((user) => (
        <article key={user.id} className="grid gap-3 p-4">
          <UserIdentity user={user} />
          <div className="flex flex-wrap items-center gap-2"><Badge>{adminUserRoleLabels[user.role]}</Badge><Badge className={statusTone(user.status)}>{adminUserStatusLabels[user.status]}</Badge></div>
          <p className="text-xs text-muted-foreground">@{user.username} · {user.mfaEnabled ? "Đã bật MFA" : user.mustChangePassword ? "Cần đổi mật khẩu" : "Chưa bật MFA"}</p>
        </article>
      ))}</div>
    </>
  );
}

function AccountDialog({
  mode,
  open,
  onOpenChange,
  onCreated,
}: {
  mode: AccountCreationMode;
  open: boolean;
  onOpenChange(open: boolean): void;
  onCreated(message: string): void;
}) {
  const { csrfToken } = useAdminSession();
  const [values, setValues] = useState<AdminUserFormValues>(initialAdminUserForm);
  const [errors, setErrors] = useState<AdminUserFormErrors>({});
  const [requestError, setRequestError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const operationKey = useRef<string | null>(null);

  const reset = useCallback(() => {
    setValues(initialAdminUserForm);
    setErrors({});
    setRequestError(null);
    setSubmitting(false);
    operationKey.current = null;
  }, []);

  function change<K extends keyof AdminUserFormValues>(field: K, value: AdminUserFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setRequestError(null);
    operationKey.current = null;
  }

  function setOpen(nextOpen: boolean) {
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateAdminUserForm(mode, values);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0] as keyof AdminUserFormValues | undefined;
    if (firstError) {
      document.getElementById(`account-${firstError}`)?.focus();
      return;
    }

    setSubmitting(true);
    setRequestError(null);
    operationKey.current ??= crypto.randomUUID();
    try {
      if (mode === "manual") {
        await createUser(toCreateUserInput(values), operationKey.current, { csrfToken });
        onCreated(`Đã tạo tài khoản cho ${values.displayName.trim()}.`);
      } else {
        await createInvite(toCreateInviteInput(values), operationKey.current, { csrfToken });
        onCreated(`Đã gửi lời mời tới ${values.email.trim()}.`);
      }
      setOpen(false);
    } catch (error: unknown) {
      setRequestError(error);
    } finally {
      setSubmitting(false);
    }
  }

  const isManual = mode === "manual";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent aria-describedby="account-dialog-description">
        <DialogHeader>
          <DialogTitle>{isManual ? "Tạo tài khoản thủ công" : "Gửi lời mời tài khoản"}</DialogTitle>
          <DialogDescription id="account-dialog-description">{isManual ? "Cấp mật khẩu tạm thời. Người dùng phải đổi mật khẩu theo chính sách khi đăng nhập." : "Người nhận hoàn tất thiết lập tài khoản qua lời mời có thời hạn."}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={submit} noValidate>
          {requestError ? <Alert variant="destructive"><IconAlertCircle size={20} stroke={1.75} /><AlertTitle>Không thể hoàn tất yêu cầu</AlertTitle><AlertDescription>{userErrorMessage(requestError)}</AlertDescription></Alert> : null}
          <FieldGroup className="gap-4">
            <Field data-invalid={Boolean(errors.displayName)}>
              <FieldLabel htmlFor="account-displayName">Tên hiển thị</FieldLabel>
              <Input id="account-displayName" value={values.displayName} onChange={(event) => change("displayName", event.target.value)} autoComplete="name" aria-invalid={Boolean(errors.displayName)} aria-describedby={errors.displayName ? "account-displayName-error" : undefined} disabled={submitting} />
              <FieldError id="account-displayName-error">{errors.displayName}</FieldError>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.username)}>
                <FieldLabel htmlFor="account-username">Tên đăng nhập</FieldLabel>
                <Input id="account-username" value={values.username} onChange={(event) => change("username", event.target.value.toLocaleLowerCase("vi"))} autoComplete="username" spellCheck={false} aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? "account-username-error" : "account-username-help"} disabled={submitting} />
                <FieldDescription id="account-username-help">Ví dụ: nguyenvana</FieldDescription>
                <FieldError id="account-username-error">{errors.username}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.email)}>
                <FieldLabel htmlFor="account-email">Email công vụ</FieldLabel>
                <Input id="account-email" type="email" value={values.email} onChange={(event) => change("email", event.target.value)} autoComplete="email" spellCheck={false} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "account-email-error" : undefined} disabled={submitting} />
                <FieldError id="account-email-error">{errors.email}</FieldError>
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="account-role">Vai trò</FieldLabel>
              <Select value={values.role} onValueChange={(value: AdminUser["role"]) => change("role", value)} disabled={submitting}>
                <SelectTrigger id="account-role"><SelectValue /></SelectTrigger>
                <SelectContent><SelectGroup>{adminUserRoles.map((role) => <SelectItem key={role} value={role}>{adminUserRoleLabels[role]}</SelectItem>)}</SelectGroup></SelectContent>
              </Select>
              <FieldDescription>Vai trò áp dụng chung cho toàn hệ thống; chưa hỗ trợ phân quyền theo lớp.</FieldDescription>
            </Field>
            {isManual ? (
              <Field data-invalid={Boolean(errors.temporaryPassword)}>
                <FieldLabel htmlFor="account-temporaryPassword">Mật khẩu tạm thời</FieldLabel>
                <Input id="account-temporaryPassword" type="password" value={values.temporaryPassword} onChange={(event) => change("temporaryPassword", event.target.value)} autoComplete="new-password" aria-invalid={Boolean(errors.temporaryPassword)} aria-describedby={errors.temporaryPassword ? "account-temporaryPassword-error" : "account-password-help"} disabled={submitting} />
                <FieldDescription id="account-password-help">Ít nhất 12 ký tự. Không gửi mật khẩu qua kênh không an toàn.</FieldDescription>
                <FieldError id="account-temporaryPassword-error">{errors.temporaryPassword}</FieldError>
              </Field>
            ) : (
              <Field data-invalid={Boolean(errors.expiresInHours)}>
                <FieldLabel htmlFor="account-expiresInHours">Thời hạn lời mời (giờ)</FieldLabel>
                <Input id="account-expiresInHours" type="number" min={1} max={168} step={1} value={values.expiresInHours} onChange={(event) => change("expiresInHours", event.target.value)} aria-invalid={Boolean(errors.expiresInHours)} aria-describedby={errors.expiresInHours ? "account-expiresInHours-error" : "account-expiry-help"} disabled={submitting} />
                <FieldDescription id="account-expiry-help">Từ 1 đến 168 giờ, mặc định 72 giờ.</FieldDescription>
                <FieldError id="account-expiresInHours-error">{errors.expiresInHours}</FieldError>
              </Field>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>Hủy</Button>
            <Button type="submit" disabled={submitting}>{submitting ? <><Spinner />Đang xử lý...</> : isManual ? <><IconPlus data-icon="inline-start" stroke={1.75} />Tạo tài khoản</> : <><IconMailPlus data-icon="inline-start" stroke={1.75} />Gửi lời mời</>}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersAdmin() {
  const { principal } = useAdminSession();
  const canAuthor = useSyncExternalStore(subscribeAuthoring, getAuthoring, getServerAuthoring);
  const [page, setPage] = useState<AdminUserPage | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [dialogMode, setDialogMode] = useState<AccountCreationMode | null>(null);
  const [success, setSuccess] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const nextPage = await listUsers(signal);
      setPage(nextPage);
    } catch (error: unknown) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setLoadError(error);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (principal.role !== "system_admin") return;
    const controller = new AbortController();
    listUsers(controller.signal).then((nextPage) => {
      if (!controller.signal.aborted) setPage(nextPage);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) setLoadError(error);
    });
    return () => controller.abort();
  }, [principal.role]);

  const visibleUsers = useMemo(() => filterAdminUsers(page?.data ?? [], query), [page, query]);

  if (principal.role !== "system_admin") {
    return (
      <main className="mx-auto grid min-h-[70dvh] max-w-2xl place-items-center p-4 pb-24 sm:p-6 md:p-8">
        <Alert variant="destructive"><IconShieldLock size={20} stroke={1.75} /><AlertTitle>Không có quyền truy cập</AlertTitle><AlertDescription>Trang người dùng chỉ dành cho Quản trị hệ thống. Danh sách tài khoản chưa được tải.</AlertDescription></Alert>
      </main>
    );
  }

  function afterCreated(message: string) {
    setSuccess(message);
    void load();
  }

  return (
    <main className="mx-auto max-w-[1200px] p-4 pb-24 sm:p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm text-muted-foreground">Quản trị truy cập</p><h1 className="mt-1 text-2xl font-semibold">Người dùng nội bộ</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Tạo thủ công hoặc gửi lời mời với vai trò dùng chung trên toàn hệ thống.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/admin/users/import"><IconFileImport data-icon="inline-start" stroke={1.75} />Import</Link></Button>
          <Button type="button" disabled={!canAuthor} title={!canAuthor ? "Mở trên máy tính có chuột để gửi lời mời" : undefined} variant="outline" onClick={() => { setSuccess(""); setDialogMode("invite"); }}><IconMailPlus data-icon="inline-start" stroke={1.75} />Mời</Button>
          <Button type="button" disabled={!canAuthor} title={!canAuthor ? "Mở trên máy tính có chuột để tạo tài khoản" : undefined} onClick={() => { setSuccess(""); setDialogMode("manual"); }}><IconPlus data-icon="inline-start" stroke={1.75} />Tạo tài khoản</Button>
        </div>
      </header>

      {!canAuthor && <Alert className="mt-5 border-primary/20 bg-accent-subtle"><IconLock size={20} stroke={1.75} /><AlertTitle>Chế độ chỉ xem</AlertTitle><AlertDescription>Tạo tài khoản và gửi lời mời cần máy tính có chuột hoặc bàn di chuột. Bạn vẫn có thể xem và lọc danh sách trên thiết bị này.</AlertDescription></Alert>}
      {success && <div className="mt-5 flex items-start gap-3 rounded-control border border-success/20 bg-green-50 p-4 text-sm text-success" role="status" aria-live="polite"><IconCheck className="mt-0.5 shrink-0" size={20} stroke={1.75} /><span>{success}</span></div>}

      <section className="mt-7 overflow-hidden rounded-panel border bg-surface" aria-labelledby="users-list-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div><h2 id="users-list-title" className="font-medium">Danh sách tài khoản</h2><p className="mt-1 text-xs text-muted-foreground">{page ? `${page.data.length} tài khoản đã tải${page.meta.hasMore ? " · API còn dữ liệu chưa phân trang được" : ""}` : "Dữ liệu từ hệ thống tài khoản"}</p></div>
          <div className="relative w-full sm:w-80"><IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={19} stroke={1.75} aria-hidden="true" /><label className="sr-only" htmlFor="users-local-filter">Lọc danh sách đã tải</label><Input id="users-local-filter" className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Lọc tên, email hoặc vai trò..." disabled={!page} /></div>
        </div>
        {loadError && page ? <div className="border-b p-4"><Alert variant="destructive"><IconAlertCircle size={20} stroke={1.75} /><AlertTitle>Tài khoản đã xử lý nhưng danh sách chưa làm mới</AlertTitle><AlertDescription><p>{userErrorMessage(loadError)}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Tải lại danh sách</Button></AlertDescription></Alert></div> : null}
        {!page && !loadError ? <UsersLoading /> : loadError && !page ? <div className="p-4"><Alert variant="destructive"><IconAlertCircle size={20} stroke={1.75} /><AlertTitle>Không tải được danh sách</AlertTitle><AlertDescription><p>{userErrorMessage(loadError)}</p><Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void load()}>Thử lại</Button></AlertDescription></Alert></div> : <UsersList users={visibleUsers} />}
        {loading && page && <div className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground" role="status"><Spinner />Đang làm mới danh sách...</div>}
      </section>

      <p className="mt-4 text-xs leading-5 text-muted-foreground"><IconKey className="mr-1 inline" size={16} stroke={1.75} aria-hidden="true" />Chỉnh sửa, vô hiệu hóa, reset mật khẩu, xem chi tiết và import tài khoản chưa được bật vì API tương ứng chưa có trong contract hiện tại.</p>

      <AccountDialog mode="manual" open={dialogMode === "manual"} onOpenChange={(open) => setDialogMode(open ? "manual" : null)} onCreated={afterCreated} />
      <AccountDialog mode="invite" open={dialogMode === "invite"} onOpenChange={(open) => setDialogMode(open ? "invite" : null)} onCreated={afterCreated} />
    </main>
  );
}
