import { Forward as IconMailForward } from "lucide-react";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { SecurityPageShell } from "@/components/auth/security-page-shell";

export const metadata = { title: "Quên mật khẩu" };

export default function ForgotPasswordPage() {
  return (
    <SecurityPageShell
      description="Nhập email tài khoản nội bộ. Vì bảo mật, phản hồi không cho biết tài khoản có tồn tại hay không."
      eyebrow="Khôi phục quyền truy cập"
      icon={IconMailForward}
      sideDescription="Yêu cầu đặt lại có thời hạn, dùng một lần và được gửi qua kênh email nội bộ đã đăng ký."
      sideTitle="Khôi phục tài khoản mà không làm lộ thông tin người dùng."
      title="Quên mật khẩu"
    >
      <ForgotPasswordForm />
    </SecurityPageShell>
  );
}
