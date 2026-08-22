"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlertCircle } from "@tabler/icons-react";
import { PasswordChangeForm } from "@/components/auth/password-change-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getPasswordChangePrincipal } from "@/lib/api/account-security";
import { AccountSecurityError, accountSecurityErrorMessage } from "@/lib/auth/account-security-model";

export function PasswordChangeGate() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "redirect" | { error: unknown }>("loading");

  useEffect(() => {
    let active = true;
    getPasswordChangePrincipal()
      .then((principal) => {
        if (!active) return;
        if (!principal.mustChangePassword) {
          setState("redirect");
          router.replace("/admin");
          return;
        }
        setState("ready");
      })
      .catch((error: unknown) => {
        if (active) setState({ error });
      });
    return () => {
      active = false;
    };
  }, [router]);

  useEffect(() => {
    if (typeof state === "object") errorRef.current?.focus();
  }, [state]);

  if (state === "loading" || state === "redirect") {
    return <p className="mt-7 rounded-control border bg-surface-subtle p-4 text-sm text-muted-foreground" role="status">Đang xác minh yêu cầu đổi mật khẩu...</p>;
  }
  if (typeof state === "object") {
    return (
      <div className="mt-7 flex flex-col gap-3">
        <Alert className="border-destructive/25 bg-red-50 text-destructive" ref={errorRef} tabIndex={-1} variant="destructive">
          <IconAlertCircle size={18} stroke={1.75} />
          <AlertTitle>Không thể xác minh phiên đăng nhập</AlertTitle>
          <AlertDescription>
            {accountSecurityErrorMessage(state.error, "change")}
            {state.error instanceof AccountSecurityError && state.error.requestId
              ? ` Mã yêu cầu: ${state.error.requestId}.`
              : ""}
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline"><Link href="/login">Đăng nhập lại</Link></Button>
      </div>
    );
  }
  return <PasswordChangeForm />;
}
