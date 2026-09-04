"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert as IconAlertCircle,
  Clock as IconClock,
  Monitor as IconDeviceDesktop,
  Forward as IconMailForward,
  RefreshCw as IconRefresh,
  Search as IconSearch,
  X as IconX,
} from "lucide-react";
import { useAdminSession } from "@/components/admin/admin-session";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { AdminApiError, adminErrorMessage } from "@/lib/api/admin";
import { listAdminInvites, resendAdminInvite, revokeInvite, type AdminInvite, type AdminInvitePage } from "@/lib/api/users";
import { mailStatusLabel, adminUserRoleLabels, adminUserRoles } from "@/lib/users/user-admin-state";

type InviteAction = { kind: "resend" | "revoke"; invite: AdminInvite };
const inviteStatusLabels: Record<AdminInvite["status"], string> = { pending: "Đang chờ", expired: "Hết hạn", revoked: "Đã thu hồi", accepted: "Đã chấp nhận" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function inviteErrorMessage(error: unknown) {
  if (error instanceof AdminApiError && error.status === 412) return "Lời mời vừa thay đổi. Hãy tải lại danh sách.";
  if (error instanceof AdminApiError && error.status === 409) return "Lời mời này không còn sử dụng được. Hãy tải lại danh sách.";
  return adminErrorMessage(error);
}

function InviteActionDialog({ action, onClose, onSuccess }: { action: InviteAction | null; onClose(): void; onSuccess(message: string): void }) {
  const { csrfToken } = useAdminSession();
  const [reason, setReason] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const operationKey = useRef<string | null>(null);

  function close() {
    setReason("");
    setExpiresInHours("72");
    setError(null);
    setPending(false);
    operationKey.current = null;
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action) return;
    const hours = Number(expiresInHours);
    if (action.kind === "resend" && (reason.trim().length < 8 || !Number.isInteger(hours) || hours < 1 || hours > 168)) return;
    setPending(true);
    setError(null);
    operationKey.current ??= crypto.randomUUID();
    try {
      if (action.kind === "resend") {
        await resendAdminInvite(action.invite.id, { reason: reason.trim(), expiresInHours: hours }, action.invite.etag, operationKey.current, { csrfToken });
        onSuccess(`Đã tạo lời mời mới, đang chờ gửi email tới ${action.invite.email}.`);
      } else {
        await revokeInvite(action.invite.id, operationKey.current, { csrfToken });
        onSuccess(`Đã thu hồi lời mời của ${action.invite.email}.`);
      }
      close();
    } catch (caught) {
      setError(caught);
    } finally {
      setPending(false);
    }
  }

  const hours = Number(expiresInHours);
  const invalidHours = !Number.isInteger(hours) || hours < 1 || hours > 168;
  return (
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{action?.kind === "resend" ? "Gửi lại lời mời" : "Thu hồi lời mời"}</DialogTitle>
          <DialogDescription>{action?.kind === "resend" ? "Lời mời cũ sẽ hết hiệu lực. Người nhận sẽ nhận một email mời mới." : "Người nhận sẽ không thể dùng lời mời này để tạo tài khoản."}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-5" onSubmit={submit}>
          {error ? <Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Không thể hoàn tất yêu cầu</AlertTitle><AlertDescription>{inviteErrorMessage(error)}</AlertDescription></Alert> : null}
          {action?.kind === "resend" ? <>
            <Field data-invalid={reason.length > 0 && reason.trim().length < 8}><FieldLabel htmlFor="invite-resend-reason">Lý do gửi lại</FieldLabel><Input id="invite-resend-reason" value={reason} placeholder="Ví dụ: Gia hạn theo đề nghị của người nhận" onChange={(event) => { setReason(event.target.value); setError(null); operationKey.current = null; }} disabled={pending} maxLength={500} autoFocus /><FieldDescription>Ít nhất 8 ký tự để ghi lại lý do trong lịch sử hoạt động.</FieldDescription><FieldError>{reason.length > 0 && reason.trim().length < 8 ? "Lý do cần ít nhất 8 ký tự." : undefined}</FieldError></Field>
            <Field data-invalid={invalidHours}><FieldLabel htmlFor="invite-resend-expiry">Thời hạn mới (giờ)</FieldLabel><Input id="invite-resend-expiry" type="number" min={1} max={168} value={expiresInHours} placeholder="Ví dụ: 72" onChange={(event) => { setExpiresInHours(event.target.value); setError(null); operationKey.current = null; }} disabled={pending} /><FieldError>{invalidHours ? "Thời hạn cần từ 1 đến 168 giờ." : undefined}</FieldError></Field>
          </> : <Alert className="border-destructive/20 bg-red-50 text-destructive"><IconX strokeWidth={1.75} /><AlertTitle>Xác nhận thu hồi</AlertTitle><AlertDescription>{action?.invite.email}. Thao tác này không thể hoàn tác.</AlertDescription></Alert>}
          <DialogFooter><Button type="button" variant="outline" onClick={close} disabled={pending}>Hủy</Button><Button type="submit" variant={action?.kind === "revoke" ? "destructive" : "default"} disabled={pending || (action?.kind === "resend" && (reason.trim().length < 8 || invalidHours))}>{pending ? <><Spinner />Đang xử lý...</> : action?.kind === "resend" ? "Gửi lời mời mới" : "Thu hồi lời mời"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdminInvitesPanel({ canMutate, refreshToken, onChanged }: { canMutate: boolean; refreshToken: number; onChanged(message: string): void }) {
  const [page, setPage] = useState<AdminInvitePage | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<AdminInvite["role"] | "all">("all");
  const [status, setStatus] = useState<AdminInvite["status"] | "all">("pending");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [action, setAction] = useState<InviteAction | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const next = await listAdminInvites({ q: query.trim() || undefined, role: role === "all" ? undefined : role, status: status === "all" ? undefined : status, limit: 25 }, signal);
      if (!signal?.aborted) setPage(next);
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [query, role, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => void load(controller.signal), 250);
    return () => { globalThis.clearTimeout(timer); controller.abort(); };
  }, [load, refreshToken, reloadVersion]);

  async function loadMore() {
    if (!page?.meta.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await listAdminInvites({ q: query.trim() || undefined, role: role === "all" ? undefined : role, status: status === "all" ? undefined : status, cursor: page.meta.nextCursor, limit: page.meta.limit });
      setPage({ ...next, data: [...page.data, ...next.data] });
    } catch (caught) {
      setError(caught);
    } finally {
      setLoadingMore(false);
    }
  }

  function succeeded(message: string) {
    onChanged(message);
    setReloadVersion((value) => value + 1);
  }

  return <>
    <section className="overflow-hidden rounded-panel border bg-surface" aria-labelledby="invite-list-title">
      <div className="grid gap-4 border-b p-4 lg:grid-cols-[1fr_12rem_12rem]">
        <div className="relative"><IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={19} strokeWidth={1.75} /><label className="sr-only" htmlFor="invite-search">Tìm lời mời</label><Input id="invite-search" className="pl-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm email, tên hoặc tài khoản..." /></div>
        <Select value={role} onValueChange={(value: AdminInvite["role"] | "all") => setRole(value)}><SelectTrigger aria-label="Lọc vai trò lời mời"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Tất cả vai trò</SelectItem>{adminUserRoles.map((item) => <SelectItem key={item} value={item}>{adminUserRoleLabels[item]}</SelectItem>)}</SelectGroup></SelectContent></Select>
        <Select value={status} onValueChange={(value: AdminInvite["status"] | "all") => setStatus(value)}><SelectTrigger aria-label="Lọc trạng thái lời mời"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Tất cả trạng thái</SelectItem><SelectItem value="pending">Đang chờ</SelectItem><SelectItem value="expired">Hết hạn</SelectItem><SelectItem value="revoked">Đã thu hồi</SelectItem><SelectItem value="accepted">Đã chấp nhận</SelectItem></SelectGroup></SelectContent></Select>
      </div>
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3"><div><h2 id="invite-list-title" className="font-medium">Danh sách lời mời</h2><p className="mt-1 text-xs text-muted-foreground">{page ? `${page.data.length} lời mời đã tải` : "Đang tải danh sách lời mời"}</p></div>{!canMutate ? <Badge><IconDeviceDesktop strokeWidth={1.75} />Chỉ xem</Badge> : null}</div>
      {error && !page ? <div className="p-4"><Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Không tải được lời mời</AlertTitle><AlertDescription><p>{inviteErrorMessage(error)}</p><Button className="mt-3" type="button" variant="outline" size="sm" onClick={() => setReloadVersion((value) => value + 1)}><IconRefresh strokeWidth={1.75} />Thử lại</Button></AlertDescription></Alert></div> : null}
      {loading && !page ? <div className="grid gap-3 p-4" role="status"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-20" /></div> : null}
      {page && !page.data.length ? <Empty className="min-h-64 border-0"><EmptyHeader><EmptyMedia variant="icon"><IconMailForward strokeWidth={1.75} /></EmptyMedia><EmptyTitle>Không có lời mời phù hợp</EmptyTitle><EmptyDescription>Thay đổi bộ lọc hoặc tạo lời mời mới từ thanh thao tác phía trên.</EmptyDescription></EmptyHeader></Empty> : null}
      {page?.data.map((invite) => <article key={invite.id} className="flex flex-wrap items-center gap-4 border-b p-4 last:border-b-0"><span className="grid size-10 place-items-center rounded-full bg-accent-subtle text-primary"><IconMailForward strokeWidth={1.75} /></span><div className="min-w-0 flex-1"><p className="truncate font-medium">{invite.displayName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{invite.email} · @{invite.username}</p><div className="mt-2 flex flex-wrap gap-2"><Badge>{adminUserRoleLabels[invite.role]}</Badge><Badge>{inviteStatusLabels[invite.status]}</Badge><span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><IconClock size={14} strokeWidth={1.75} />Hết hạn {formatDate(invite.expiresAt)}</span></div><p className="mt-2 text-xs text-muted-foreground">Email: {mailStatusLabel(invite.mailStatus)}</p></div>{canMutate && invite.status === "pending" ? <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setAction({ kind: "resend", invite })}>Gửi lại</Button><Button type="button" variant="ghost" size="sm" onClick={() => setAction({ kind: "revoke", invite })}>Thu hồi</Button></div> : null}</article>)}
      {page?.meta.hasMore ? <div className="flex justify-center border-t p-4"><Button type="button" variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? <><Spinner />Đang tải...</> : "Tải thêm lời mời"}</Button></div> : null}
      {error && page ? <div className="border-t p-4"><Alert variant="destructive"><IconAlertCircle strokeWidth={1.75} /><AlertTitle>Danh sách hiện tại chưa được làm mới</AlertTitle><AlertDescription>{inviteErrorMessage(error)}</AlertDescription></Alert></div> : null}
    </section>
    <InviteActionDialog action={action} onClose={() => setAction(null)} onSuccess={succeeded} />
  </>;
}
