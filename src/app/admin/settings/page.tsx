import { SecuritySettings } from "@/components/admin/security-settings";

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-4xl p-4 pb-24 sm:p-6 md:p-8">
      <h1 className="text-2xl font-semibold">Bảo mật tài khoản</h1>
      <p className="mt-2 text-sm text-muted-foreground">Xem cách xác thực và quản lý thiết bị đăng nhập của bạn.</p>
      <div className="mt-7 flex flex-col gap-4"><SecuritySettings /></div>
    </main>
  );
}
