"use client";

import { Shield as IconShieldLock } from "lucide-react";
import { useAdminSession } from "@/components/admin/admin-session";
import { RecoveryCodesPanel } from "@/components/admin/recovery-codes-panel";
import { SessionSecurityPanel } from "@/components/admin/session-security-panel";
import { Badge } from "@/components/ui/badge";

export function SecuritySettings() {
  const { principal } = useAdminSession();
  const mfaEnabled = principal.mfaEnabled;

  return (
    <>
      <section className="flex flex-wrap items-center gap-4 rounded-panel border bg-surface p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary">
          <IconShieldLock strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">Xác thực hai bước</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {mfaEnabled ? "Ngoài mật khẩu, bạn cần mã xác thực khi đăng nhập." : "Hiện tại bạn chỉ cần mật khẩu để đăng nhập."}
          </p>
        </div>
        <Badge>{mfaEnabled ? "Đang bật" : "Đang tắt"}</Badge>
      </section>

      {mfaEnabled ? <RecoveryCodesPanel /> : null}

      <SessionSecurityPanel />
    </>
  );
}
