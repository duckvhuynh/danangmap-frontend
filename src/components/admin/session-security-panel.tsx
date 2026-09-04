"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert as IconAlertCircle,
  LogOut as IconLogout,
  Shield as IconShieldLock,
} from "lucide-react";
import { useAdminSession } from "@/components/admin/admin-session";
import { SecurityError } from "@/components/auth/security-feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  accountSecurityErrorMessage,
  shouldEndClientSessionAfterRevoke,
  type AccountSecurityActions,
} from "@/lib/auth/account-security-model";
import { clearPrincipalRecovery } from "@/lib/editor/draft-db";
import { revokeAllSessions as revokeAllSessionsRequest } from "@/lib/api/account-security";

export function SessionSecurityPanel({
  revokeAllSessions = revokeAllSessionsRequest,
}: {
  revokeAllSessions?: AccountSecurityActions["revokeAllSessions"];
} = {}) {
  const router = useRouter();
  const { principal, clearClientPrincipal } = useAdminSession();
  const submitLock = useRef(false);
  const attemptKey = useRef<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const focusError = () => globalThis.setTimeout(() => errorRef.current?.focus(), 0);

  useEffect(() => {
    if (confirming) confirmButtonRef.current?.focus();
  }, [confirming]);

  async function endLocalSession() {
    await clearPrincipalRecovery(principal.id).catch(() => undefined);
    clearClientPrincipal();
    router.replace("/login");
    router.refresh();
  }

  async function revoke() {
    if (submitLock.current) return;
    submitLock.current = true;
    setPending(true);
    setError(null);
    try {
      attemptKey.current ??= crypto.randomUUID();
      await revokeAllSessions(attemptKey.current);
      attemptKey.current = null;
      await endLocalSession();
    } catch (caught) {
      if (shouldEndClientSessionAfterRevoke(caught)) {
        await endLocalSession();
        return;
      }
      submitLock.current = false;
      setError(accountSecurityErrorMessage(caught, "revoke"));
      focusError();
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="session-security-title" className="rounded-panel border bg-surface p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary">
          <IconShieldLock strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium" id="session-security-title">Đăng xuất trên mọi thiết bị</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Dùng khi bạn quên đăng xuất hoặc nghi ngờ người khác đang sử dụng tài khoản.
            Thao tác này cũng đăng xuất thiết bị hiện tại.
          </p>
        </div>
      </div>

      {error && <div className="mt-4"><SecurityError errorRef={errorRef} message={error} /></div>}

      {confirming ? (
        <div aria-labelledby="session-revoke-confirmation-title" className="mt-4 flex flex-col gap-3" role="group">
          <Alert className="border-warning/30 bg-surface-subtle text-warning" role="note">
            <IconAlertCircle size={18} strokeWidth={1.75} />
            <AlertTitle id="session-revoke-confirmation-title">Đăng xuất khỏi tất cả thiết bị?</AlertTitle>
            <AlertDescription>
              Bạn cần đăng nhập lại để tiếp tục làm việc. Bản nháp chỉ lưu trong trình duyệt này sẽ bị xóa.
              Hãy lưu các thay đổi lên hệ thống trước khi tiếp tục.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button disabled={pending} onClick={() => {
              attemptKey.current = null;
              setConfirming(false);
              globalThis.setTimeout(() => triggerRef.current?.focus(), 0);
            }} type="button" variant="outline">
              Hủy
            </Button>
            <Button disabled={pending} onClick={() => void revoke()} ref={confirmButtonRef} type="button" variant="destructive">
              <IconLogout data-icon="inline-start" strokeWidth={1.75} />
              {pending ? "Đang đăng xuất..." : "Xác nhận đăng xuất"}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4" onClick={() => setConfirming(true)} ref={triggerRef} type="button" variant="outline">
          <IconLogout data-icon="inline-start" strokeWidth={1.75} />
          Đăng xuất trên mọi thiết bị
        </Button>
      )}
    </section>
  );
}
