import { IconDatabase, IconMap, IconShieldLock } from "@tabler/icons-react";
import { SessionSecurityPanel } from "@/components/admin/session-security-panel";
import { RecoveryCodesPanel } from "@/components/admin/recovery-codes-panel";
import { Badge } from "@/components/ui/badge";
import { apiBaseUrl } from "@/lib/api/generated/client";

const integrations = [
  {
    icon: IconMap,
    title: "Mapbox",
    description: "Street và Light basemap · public token giới hạn URL",
    status: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? "Đã cấu hình" : "Chưa cấu hình",
  },
  {
    icon: IconDatabase,
    title: "DanangMap API",
    description: apiBaseUrl,
    status: "Generated client",
  },
  {
    icon: IconShieldLock,
    title: "Xác thực nội bộ",
    description: "Cookie bảo mật, MFA và vai trò Editor / Reviewer / Publisher",
    status: "Bắt buộc",
  },
];

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-4xl p-4 pb-24 sm:p-6 md:p-8">
      <p className="text-sm text-muted-foreground">Hệ thống</p>
      <h1 className="mt-1 text-2xl font-semibold">Cài đặt</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tổng quan cấu hình tích hợp và bảo mật phiên. Giá trị bí mật không bao giờ hiển thị tại frontend.
      </p>
      <div className="mt-7 flex flex-col gap-4">
        {integrations.map(({ icon: Icon, title, description, status }) => (
          <section className="flex items-center gap-4 rounded-panel border bg-surface p-5" key={title}>
            <span className="grid size-11 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary">
              <Icon stroke={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-medium">{title}</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
            </div>
            <Badge>{status}</Badge>
          </section>
        ))}
        <RecoveryCodesPanel />
        <SessionSecurityPanel />
      </div>
    </main>
  );
}
