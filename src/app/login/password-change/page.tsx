import { KeyRound as IconKey } from "lucide-react";
import { PasswordChangeGate } from "@/components/auth/password-change-gate";
import { SecurityPageShell } from "@/components/auth/security-page-shell";

export const metadata = { title: "Đổi mật khẩu bắt buộc" };

export default function PasswordChangePage() {
  return (
    <SecurityPageShell
      description="Đổi mật khẩu tạm thời trước khi truy cập trang quản trị. Phiên bảo mật sẽ được xoay sau khi hoàn tất."
      eyebrow="Bảo vệ tài khoản nội bộ"
      icon={IconKey}
      sideDescription="Mật khẩu tạm thời chỉ dùng để kích hoạt tài khoản. Sau khi đổi, mọi phiên cũ sẽ bị thu hồi và thiết bị này nhận phiên mới."
      sideTitle="Hoàn tất bước bảo mật cuối trước khi làm việc."
      title="Đổi mật khẩu"
    >
      <PasswordChangeGate />
    </SecurityPageShell>
  );
}
