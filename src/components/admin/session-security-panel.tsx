"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle, IconLogout, IconShieldLock } from "@tabler/icons-react";
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
  const errorRef = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const focusError = () => globalThis.setTimeout(() => errorRef.current?.focus(), 0);

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
      await revokeAllSessions(crypto.randomUUID());
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
          <IconShieldLock stroke={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium" id="session-security-title">Bảo mật phiên đăng nhập</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Thu hồi mọi phiên đang hoạt động, gồm cả thiết bị này. Bản phục hồi cục bộ của tài khoản
            trên trình duyệt hiện tại cũng sẽ bị xóa.
          </p>
        </div>
      </div>

      {error && <div className="mt-4"><SecurityError errorRef={errorRef} message={error} /></div>}

      {confirming ? (
        <div className="mt-4 flex flex-col gap-3">
          <Alert className="border-warning/30 bg-surface-subtle text-warning" role="note">
            <IconAlertCircle size={18} stroke={1.75} />
            <AlertTitle>Xác nhận thu hồi toàn bộ phiên</AlertTitle>
            <AlertDescription>
              Bạn sẽ phải đăng nhập và xác thực MFA lại trên mọi thiết bị. Thao tác này không thể hoàn tác.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button disabled={pending} onClick={() => setConfirming(false)} type="button" variant="outline">
              Hủy
            </Button>
            <Button disabled={pending} onClick={() => void revoke()} type="button" variant="destructive">
              <IconLogout data-icon="inline-start" stroke={1.75} />
              {pending ? "Đang thu hồi..." : "Xác nhận thu hồi"}
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-4" onClick={() => setConfirming(true)} type="button" variant="outline">
          <IconLogout data-icon="inline-start" stroke={1.75} />
          Thu hồi toàn bộ phiên
        </Button>
      )}
    </section>
  );
}
