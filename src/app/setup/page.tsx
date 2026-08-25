import { IconUserShield } from "@tabler/icons-react";
import { BootstrapSetupForm } from "@/components/auth/bootstrap-setup-form";
import { SecurityPageShell } from "@/components/auth/security-page-shell";

export const metadata = { title: "Khởi tạo System Admin" };

export default function SetupPage() {
  return (
    <SecurityPageShell
      description="Chỉ dùng khi hệ thống chưa có tài khoản. Bạn cần mã khởi tạo một lần do người vận hành máy chủ cung cấp."
      eyebrow="Khởi tạo DanangMap lần đầu"
      icon={IconUserShield}
      sideDescription="Tạo duy nhất tài khoản System Admin đầu tiên, sau đó bảo vệ tài khoản bằng MFA và mã khôi phục dùng một lần."
      sideTitle="Thiết lập quyền quản trị từ một điểm bắt đầu an toàn."
      title="Tạo System Admin đầu tiên"
    >
      <BootstrapSetupForm />
    </SecurityPageShell>
  );
}
