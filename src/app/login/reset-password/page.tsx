import { Lock as IconLock } from "lucide-react";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { SecurityPageShell } from "@/components/auth/security-page-shell";

export const metadata = { title: "Đặt lại mật khẩu" };

export default function ResetPasswordPage() {
  return (
    <SecurityPageShell
      description="Sao chép mã từ nội dung email và dán vào biểu mẫu. DanangMap không nhận mã qua địa chỉ trang."
      eyebrow="Mã bảo mật dùng một lần"
      icon={IconLock}
      sideDescription="Mã đặt lại chỉ được gửi trong nội dung email, hết hạn theo chính sách và bị hủy ngay khi sử dụng thành công."
      sideTitle="Đặt lại mật khẩu bằng một luồng không lưu dấu bí mật."
      title="Đặt lại mật khẩu"
    >
      <ResetPasswordForm />
    </SecurityPageShell>
  );
}
