"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CircleAlert as IconAlertCircle,
  Clock as IconClock,
  Monitor as IconDeviceDesktop,
  KeyRound as IconKey,
  LockKeyhole as IconLockAccess,
  Forward as IconMailForward,
  RefreshCw as IconRefresh,
  Shield as IconShieldLock,
  UserPen as IconUserEdit,
} from "lucide-react";
import { useAdminSession } from "@/components/admin/admin-session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AdminApiError, adminErrorMessage } from "@/lib/api/admin";
import {
  getAdminUser,
  requestAdminUserPasswordReset,
  resetAdminUserMfa,
  revokeAdminUserSession,
  revokeAllAdminUserSessions,
  updateAdminUser,
  type AdminUserDetail,
  type VersionedAdminUser,
} from "@/lib/api/users";
import { adminUserRoleLabels, adminUserRoles, adminUserStatusLabels, mailStatusLabel, securityStatusLabel, sessionDeviceLabel } from "@/lib/users/user-admin-state";

type SecurityAction =
  | { kind: "revoke-session"; sessionId: string }
  | { kind: "revoke-all" }
  | { kind: "reset-mfa" }
  | { kind: "password-reset" };

const actionCopy: Record<SecurityAction["kind"], { title: string; description: string; button: string; destructive?: boolean }> = {
  "revoke-session": { title: "Đăng xuất thiết bị đã chọn", description: "Người dùng cần đăng nhập lại trên thiết bị này để tiếp tục làm việc.", button: "Đăng xuất thiết bị", destructive: true },
  "revoke-all": { title: "Đăng xuất trên mọi thiết bị", description: "Người dùng sẽ bị đăng xuất khỏi tất cả thiết bị và cần đăng nhập lại.", button: "Đăng xuất tất cả", destructive: true },
  "reset-mfa": { title: "Đặt lại xác thực hai bước", description: "Người dùng sẽ bị đăng xuất khỏi mọi thiết bị. Các mã cũ hết hiệu lực và cần thiết lập lại ứng dụng xác thực khi đăng nhập.", button: "Đặt lại xác thực", destructive: true },
  "password-reset": { title: "Gửi yêu cầu đặt lại mật khẩu", description: "Email hướng dẫn đặt lại mật khẩu sẽ được gửi tới người dùng.", button: "Gửi email hướng dẫn" },
};

function formatDate(value: string | null) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function detailErrorMessage(error: unknown) {
  if (error instanceof AdminApiError) {
    const messages: Record<number, string> = {
      401: "Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.",
      403: "Tài khoản hiện tại không có quyền thực hiện thao tác này.",
      409: "Thao tác xung đột với trạng thái tài khoản hiện tại.",
      412: "Dữ liệu tài khoản đã thay đổi trên máy chủ. Hãy tải bản mới trước khi thử lại.",
      422: "Nội dung chưa hợp lệ. Kiểm tra lý do và các trường đã chỉnh sửa.",
      428: "Hãy tải lại thông tin tài khoản rồi thử lại.",
      429: "Có quá nhiều thao tác bảo mật. Hãy chờ rồi thử lại.",
    };
    const prefix = messages[error.status];
    if (prefix) return prefix;
  }
  return adminErrorMessage(error);
}

function SecurityActionDialog({
  action,
  open,
  onOpenChange,
  onSubmit,
}: {
  action: SecurityAction | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSubmit(action: SecurityAction, reason: string, operationKey: string): Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const operationKey = useRef<string | null>(null);
  const copy = action ? actionCopy[action.kind] : null;

  function close(next: boolean) {
    if (!next) {
      setReason("");
      setError(null);
      setPending(false);
      operationKey.current = null;
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action || reason.trim().length < 8) return;
    setPending(true);
    setError(null);
    operationKey.current ??= crypto.randomUUID();
    try {
      await onSubmit(action, reason.trim(), operationKey.current);
      close(false);
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy?.title}</DialogTitle>
          <DialogDescription>{copy?.description}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={submit}>
          {error ? <Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Không thể hoàn tất thao tác</AlertTitle><AlertDescription>{detailErrorMessage(error)}</AlertDescription></Alert> : null}
          <Field data-invalid={reason.length > 0 && reason.trim().length < 8}>
            <FieldLabel htmlFor="security-action-reason">Lý do thao tác</FieldLabel>
            <Input id="security-action-reason" value={reason} onChange={(event) => { setReason(event.target.value); setError(null); operationKey.current = null; }} maxLength={500} autoFocus disabled={pending} />
            <FieldDescription>Ít nhất 8 ký tự để ghi vào lịch sử hoạt động. Không nhập mật khẩu hoặc mã xác thực.</FieldDescription>
            <FieldError>{reason.length > 0 && reason.trim().length < 8 ? "Lý do cần ít nhất 8 ký tự." : undefined}</FieldError>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={pending}>Hủy</Button>
            <Button type="submit" variant={copy?.destructive ? "destructive" : "default"} disabled={pending || reason.trim().length < 8}>
              {pending ? <><Spinner />Đang xử lý...</> : copy?.button}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SecuritySummary({ user, mfaPolicyEnabled }: { user: AdminUserDetail; mfaPolicyEnabled: boolean }) {
  const activeSessions = user.sessions.filter((session) => session.status === "active").length;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-control border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">Xác thực hai bước</p><p className="mt-1 font-medium">{mfaPolicyEnabled ? (user.mfa.enabled ? "Đã xác minh" : "Chưa đăng ký") : "Đang tắt"}</p><p className="mt-1 text-xs text-muted-foreground">{mfaPolicyEnabled ? `${user.mfa.recoveryCodesRemaining} mã khôi phục còn lại` : "Đăng nhập bằng mật khẩu"}</p></div>
      <div className="rounded-control border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">Phiên đăng nhập</p><p className="mt-1 font-medium">{activeSessions}</p><p className="mt-1 text-xs text-muted-foreground">Tổng {user.sessions.length} phiên trong lịch sử gần đây</p></div>
      <div className="rounded-control border bg-surface-subtle p-3"><p className="text-xs text-muted-foreground">Đặt lại mật khẩu</p><p className="mt-1 font-medium">{user.passwordResets.some((item) => item.status === "pending") ? "Có yêu cầu chưa sử dụng" : "Không có yêu cầu mới"}</p><p className="mt-1 text-xs text-muted-foreground">Email hướng dẫn được gửi cho người dùng</p></div>
    </div>
  );
}

export function UserSecurityDetail({
  userId,
  open,
  canMutate,
  onOpenChange,
  onChanged,
}: {
  userId: string | null;
  open: boolean;
  canMutate: boolean;
  onOpenChange(open: boolean): void;
  onChanged(message: string): void;
}) {
  const { principal, csrfToken } = useAdminSession();
  const [resource, setResource] = useState<VersionedAdminUser | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AdminUserDetail["role"]>("editor");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [unlock, setUnlock] = useState(false);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [securityAction, setSecurityAction] = useState<SecurityAction | null>(null);
  const updateKey = useRef<string | null>(null);

  const hydrateForm = useCallback((user: AdminUserDetail) => {
    setDisplayName(user.displayName);
    setRole(user.role);
    setStatus(user.status === "disabled" ? "disabled" : "active");
    setUnlock(false);
    setReason("");
    setSaveError(null);
    updateKey.current = null;
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getAdminUser(userId, signal);
      if (!signal?.aborted) {
        setResource(next);
        hydrateForm(next.data);
      }
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [hydrateForm, userId]);

  useEffect(() => {
    if (!open || !userId) return;
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => void load(controller.signal), 0);
    return () => {
      globalThis.clearTimeout(timer);
      controller.abort();
    };
  }, [load, open, userId]);

  const user = resource?.data ?? null;
  const isSelf = user?.id === principal.id;
  const hasRoleOrStatusChange = Boolean(user && (role !== user.role || status !== user.status));
  const hasChanges = Boolean(user && (displayName.trim() !== user.displayName || hasRoleOrStatusChange || unlock));
  const invalidEdit = displayName.trim().length < 2 || (hasRoleOrStatusChange && reason.trim().length < 8);
  const activeSessions = useMemo(() => user?.sessions.filter((session) => session.status === "active") ?? [], [user]);

  function editChanged() {
    setSaveError(null);
    updateKey.current = null;
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!resource || !user || !hasChanges || invalidEdit) return;
    const input = {
      ...(displayName.trim() !== user.displayName ? { displayName: displayName.trim() } : {}),
      ...(role !== user.role ? { role } : {}),
      ...(status !== user.status ? { status } : {}),
      ...(hasRoleOrStatusChange ? { reason: reason.trim() } : {}),
      unlock,
    };
    setSaving(true);
    setSaveError(null);
    updateKey.current ??= crypto.randomUUID();
    try {
      const next = await updateAdminUser(user.id, input, resource.etag, updateKey.current, { csrfToken });
      setResource(next);
      hydrateForm(next.data);
      onChanged("Đã cập nhật tài khoản.");
    } catch (caught) {
      setSaveError(caught);
    } finally {
      setSaving(false);
    }
  }

  async function submitSecurityAction(action: SecurityAction, actionReason: string, operationKey: string) {
    if (!resource || !user) return;
    if (action.kind === "revoke-session") await revokeAdminUserSession(user.id, action.sessionId, actionReason, resource.etag, operationKey, { csrfToken });
    if (action.kind === "revoke-all") await revokeAllAdminUserSessions(user.id, actionReason, resource.etag, operationKey, { csrfToken });
    if (action.kind === "reset-mfa") await resetAdminUserMfa(user.id, actionReason, resource.etag, operationKey, { csrfToken });
    if (action.kind === "password-reset") await requestAdminUserPasswordReset(user.id, actionReason, resource.etag, operationKey, { csrfToken });
    await load();
    onChanged(action.kind === "password-reset" ? "Đã tạo yêu cầu đặt lại mật khẩu, đang chờ gửi email." : "Đã cập nhật bảo mật tài khoản.");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="min-w-0 max-w-4xl overflow-x-hidden p-0">
          <DialogHeader className="border-b px-5 py-5 sm:px-6">
            <DialogTitle>Chi tiết tài khoản</DialogTitle>
            <DialogDescription>Xem thông tin, quản lý quyền truy cập và hỗ trợ người dùng đăng nhập.</DialogDescription>
          </DialogHeader>
          <div className="grid min-w-0 max-h-[calc(100dvh-11rem)] gap-6 overflow-y-auto px-5 pb-6 sm:px-6 [&>section]:min-w-0">
            {loading && !user ? <div className="grid gap-3" role="status" aria-label="Đang tải chi tiết tài khoản"><Skeleton className="h-20" /><Skeleton className="h-32" /><Skeleton className="h-48" /></div> : null}
            {error && !user ? <Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Không tải được chi tiết tài khoản</AlertTitle><AlertDescription><p>{detailErrorMessage(error)}</p><Button className="mt-3" type="button" variant="outline" size="sm" onClick={() => void load()}><IconRefresh strokeWidth={1.75} />Thử lại</Button></AlertDescription></Alert> : null}
            {user ? <>
              <section className="flex flex-wrap items-start justify-between gap-4 rounded-panel border bg-surface p-4" aria-labelledby="identity-summary-title">
                <div className="min-w-0"><p id="identity-summary-title" className="text-lg font-semibold">{user.displayName}</p><p className="mt-1 text-sm text-muted-foreground">{user.email} · @{user.username}</p><div className="mt-3 flex flex-wrap gap-2"><Badge>{adminUserRoleLabels[user.role]}</Badge><Badge>{adminUserStatusLabels[user.status]}</Badge>{isSelf ? <Badge className="bg-green-50 text-success">Tài khoản của bạn</Badge> : null}</div></div>
                <div className="text-right text-xs leading-5 text-muted-foreground"><p>Cập nhật {formatDate(user.updatedAt)}</p></div>
              </section>

              <SecuritySummary user={user} mfaPolicyEnabled={principal.mfaEnabled} />

              {!canMutate ? <Alert className="border-primary/20 bg-accent-subtle"><IconDeviceDesktop strokeWidth={1.75} /><AlertTitle>Chi tiết chỉ xem</AlertTitle><AlertDescription>Để chỉnh sửa tài khoản hoặc thay đổi bảo mật, hãy dùng máy tính có bàn phím và chuột.</AlertDescription></Alert> : null}

              <section className="rounded-panel border bg-surface p-4" aria-labelledby="account-fields-title">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-control bg-accent-subtle text-primary"><IconUserEdit strokeWidth={1.75} /></span><div><h3 id="account-fields-title" className="font-medium">Hồ sơ và quyền truy cập</h3><p className="mt-1 text-xs text-muted-foreground">Khi đổi vai trò hoặc trạng thái, người dùng sẽ phải đăng nhập lại.</p></div></div>
                {canMutate ? <form className="mt-5 grid gap-4" onSubmit={save}>
                  {saveError ? <Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Không lưu được thay đổi</AlertTitle><AlertDescription>{detailErrorMessage(saveError)}</AlertDescription></Alert> : null}
                  <Field data-invalid={displayName.trim().length < 2}><FieldLabel htmlFor="admin-user-display-name">Tên hiển thị</FieldLabel><Input id="admin-user-display-name" value={displayName} onChange={(event) => { setDisplayName(event.target.value); editChanged(); }} disabled={saving} maxLength={200} /><FieldError>{displayName.trim().length < 2 ? "Tên hiển thị cần ít nhất 2 ký tự." : undefined}</FieldError></Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field><FieldLabel htmlFor="admin-user-role">Vai trò</FieldLabel><Select value={role} onValueChange={(value: AdminUserDetail["role"]) => { setRole(value); editChanged(); }} disabled={saving}><SelectTrigger id="admin-user-role"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{adminUserRoles.map((item) => <SelectItem key={item} value={item}>{adminUserRoleLabels[item]}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
                    <Field><FieldLabel htmlFor="admin-user-status">Trạng thái</FieldLabel><Select value={status} onValueChange={(value: "active" | "disabled") => { setStatus(value); editChanged(); }} disabled={saving}><SelectTrigger id="admin-user-status"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="active">Đang hoạt động</SelectItem><SelectItem value="disabled">Vô hiệu hóa</SelectItem></SelectGroup></SelectContent></Select></Field>
                  </div>
                  {hasRoleOrStatusChange ? <Field data-invalid={reason.length > 0 && reason.trim().length < 8}><FieldLabel htmlFor="admin-user-change-reason">Lý do thay đổi quyền</FieldLabel><Input id="admin-user-change-reason" value={reason} onChange={(event) => { setReason(event.target.value); editChanged(); }} disabled={saving} maxLength={500} /><FieldDescription>Ít nhất 8 ký tự để ghi lại trong lịch sử hoạt động.</FieldDescription><FieldError>{reason.length > 0 && reason.trim().length < 8 ? "Lý do cần ít nhất 8 ký tự." : undefined}</FieldError></Field> : null}
                  {user.lockedUntil ? <label className="flex items-start gap-3 rounded-control border bg-surface-subtle p-3 text-sm"><Checkbox checked={unlock} onCheckedChange={(checked) => { setUnlock(checked === true); editChanged(); }} disabled={saving} /><span><span className="font-medium">Mở khóa đăng nhập</span><span className="mt-1 block text-xs text-muted-foreground">Đang khóa đến {formatDate(user.lockedUntil)}</span></span></label> : null}
                  <div className="flex justify-end"><Button type="submit" disabled={!hasChanges || invalidEdit || saving}>{saving ? <><Spinner />Đang lưu...</> : "Lưu thay đổi"}</Button></div>
                </form> : <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-muted-foreground">Tên hiển thị</dt><dd className="mt-1 font-medium">{user.displayName}</dd></div><div><dt className="text-xs text-muted-foreground">Vai trò</dt><dd className="mt-1 font-medium">{adminUserRoleLabels[user.role]}</dd></div><div><dt className="text-xs text-muted-foreground">Trạng thái</dt><dd className="mt-1 font-medium">{adminUserStatusLabels[user.status]}</dd></div><div><dt className="text-xs text-muted-foreground">Khóa đăng nhập</dt><dd className="mt-1 font-medium">{user.lockedUntil ? formatDate(user.lockedUntil) : "Không"}</dd></div></dl>}
              </section>

              <section className="rounded-panel border bg-surface p-4" aria-labelledby="security-actions-title">
                <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-control bg-accent-subtle text-primary"><IconShieldLock strokeWidth={1.75} /></span><div><h3 id="security-actions-title" className="font-medium">Bảo mật tài khoản</h3><p className="mt-1 text-xs text-muted-foreground">Hỗ trợ khi người dùng quên mật khẩu hoặc mất quyền truy cập.</p></div></div>
                {isSelf ? <Alert className="mt-4"><IconLockAccess strokeWidth={1.75} /><AlertTitle>Đây là tài khoản của bạn</AlertTitle><AlertDescription>Để xem cách xác thực hoặc đăng xuất các thiết bị của mình, mở <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/admin/settings">Bảo mật tài khoản</Link>.</AlertDescription></Alert> : null}
                {!isSelf && canMutate ? <div className="mt-4 grid gap-2 sm:grid-cols-3"><Button type="button" variant="outline" onClick={() => setSecurityAction({ kind: "password-reset" })}><IconMailForward strokeWidth={1.75} />Gửi email đặt lại mật khẩu</Button>{principal.mfaEnabled ? <Button type="button" variant="outline" disabled={!user.mfa.enabled} onClick={() => setSecurityAction({ kind: "reset-mfa" })}><IconKey strokeWidth={1.75} />Đặt lại xác thực</Button> : null}<Button type="button" variant="outline" disabled={!activeSessions.length} onClick={() => setSecurityAction({ kind: "revoke-all" })}><IconLockAccess strokeWidth={1.75} />Đăng xuất tất cả</Button></div> : null}
                <div className="mt-5 divide-y rounded-control border">
                  {user.sessions.length ? user.sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center gap-3 p-3"><IconDeviceDesktop className="text-muted-foreground" strokeWidth={1.75} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{session.kind === "authenticated" ? "Đã đăng nhập" : "Chờ xác thực"} · {securityStatusLabel(session.status)}</p><p className="mt-1 truncate text-xs text-muted-foreground">{sessionDeviceLabel(session.userAgent)} · bắt đầu {formatDate(session.createdAt)}</p></div>{!isSelf && canMutate && session.status === "active" ? <Button type="button" variant="ghost" size="sm" onClick={() => setSecurityAction({ kind: "revoke-session", sessionId: session.id })}>Đăng xuất</Button> : null}</div>) : <p className="p-4 text-sm text-muted-foreground">Chưa có phiên đăng nhập gần đây.</p>}
                </div>
              </section>

              <section className="rounded-panel border bg-surface p-4" aria-labelledby="mail-history-title"><div className="flex items-center gap-3"><IconClock className="text-primary" strokeWidth={1.75} /><div><h3 id="mail-history-title" className="font-medium">Lời mời và yêu cầu đặt lại mật khẩu</h3><p className="mt-1 text-xs text-muted-foreground">Theo dõi trạng thái gửi email và sử dụng lời mời.</p></div></div><div className="mt-4 grid gap-2 text-sm">{[...user.invites.map((item) => ({ id: item.id, label: `Lời mời · ${securityStatusLabel(item.status)}`, at: item.createdAt, mail: item.mailStatus })), ...user.passwordResets.map((item) => ({ id: item.id, label: `Đặt lại mật khẩu · ${securityStatusLabel(item.status)}`, at: item.createdAt, mail: item.mailStatus }))].map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded-control bg-surface-subtle px-3 py-2"><span>{item.label}</span><span className="text-xs text-muted-foreground">Email: {mailStatusLabel(item.mail)} · {formatDate(item.at)}</span></div>)}{!user.invites.length && !user.passwordResets.length ? <p className="text-muted-foreground">Chưa có email bảo mật gần đây.</p> : null}</div><Button asChild className="mt-4" variant="outline" size="sm"><Link href="/admin/audit"><IconShieldLock strokeWidth={1.75} />Xem lịch sử hoạt động</Link></Button></section>
            </> : null}
          </div>
        </DialogContent>
      </Dialog>
      <SecurityActionDialog action={securityAction} open={securityAction !== null} onOpenChange={(next) => { if (!next) setSecurityAction(null); }} onSubmit={submitSecurityAction} />
    </>
  );
}
