"use client";

import { IconShieldLock, IconShieldOff } from "@tabler/icons-react";
import { useAdminSession } from "@/components/admin/admin-session";
import { RecoveryCodesPanel } from "@/components/admin/recovery-codes-panel";
import { SessionSecurityPanel } from "@/components/admin/session-security-panel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

export function SecuritySettings() {
  const { principal } = useAdminSession();
  const mfaEnabled = principal.mfaEnabled;

  return (
    <>
      <section className="flex items-center gap-4 rounded-panel border bg-surface p-5">
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary">
          <IconShieldLock stroke={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">Xác thực nội bộ</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cookie bảo mật, vai trò quản trị và MFA theo chính sách máy chủ
          </p>
        </div>
        <Badge>{mfaEnabled ? "MFA đang bật" : "MFA đang tắt"}</Badge>
      </section>

      {mfaEnabled ? (
        <RecoveryCodesPanel />
      ) : (
        <Alert className="border-primary/20 bg-accent-subtle text-foreground">
          <IconShieldOff className="text-primary" stroke={1.75} />
          <AlertTitle>MFA đang được tắt</AlertTitle>
          <AlertDescription>
            Đăng nhập hiện dùng mật khẩu và session bảo mật. Dữ liệu MFA đã đăng
            ký được giữ lại để có thể dùng lại khi người vận hành bật chính
            sách.
          </AlertDescription>
        </Alert>
      )}

      <SessionSecurityPanel />
    </>
  );
}
