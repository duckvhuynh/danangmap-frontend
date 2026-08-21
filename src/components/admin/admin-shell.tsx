"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { IconChartBar, IconDatabase, IconLogout, IconSettings, IconUsers } from "@tabler/icons-react";
import { BrandMark } from "@/components/brand-mark";
import { AdminSessionProvider, useAdminSession } from "@/components/admin/admin-session";
import { Button } from "@/components/ui/button";
import { logout } from "@/lib/api/admin";
import { clearPrincipalRecovery } from "@/lib/editor/draft-db";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Tổng quan", icon: IconChartBar },
  { href: "/admin/layers", label: "Lớp dữ liệu", icon: IconDatabase },
  { href: "/admin/users", label: "Người dùng", icon: IconUsers, systemAdminOnly: true },
  { href: "/admin/settings", label: "Cài đặt", icon: IconSettings },
];

function AdminShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { principal, csrfToken, clearClientPrincipal } = useAdminSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const visibleItems = items.filter((item) => !item.systemAdminOnly || principal.role === "system_admin");
  const initials = principal.displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("vi");

  async function handleLogout() {
    setLoggingOut(true);
    try { await logout({ csrfToken }); } finally {
      await clearPrincipalRecovery(principal.id).catch(() => undefined);
      clearClientPrincipal();
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-[100dvh] bg-surface-subtle md:grid md:grid-cols-[240px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r bg-surface md:flex md:flex-col">
        <div className="border-b p-4"><BrandMark />{process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true" && <p className="mt-3 rounded-control bg-amber-50 px-2 py-1.5 text-xs font-medium text-warning">Demo · không phải dữ liệu thật</p>}</div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Quản trị">
          {visibleItems.map(({ href, label, icon: Icon }) => { const active = href === "/admin" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={cn("flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "bg-accent-subtle text-primary")}><Icon size={20} stroke={1.75} />{label}</Link>; })}
        </nav>
        <div className="border-t p-3"><div className="mb-2 flex items-center gap-3 rounded-control px-3 py-2"><span className="grid size-8 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-primary">{initials}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{principal.displayName}</span><span className="block text-xs capitalize text-muted-foreground">{principal.role.replace("_", " ")}</span></span></div><Button type="button" variant="ghost" disabled={loggingOut} onClick={handleLogout} className="w-full justify-start px-3 text-muted-foreground"><IconLogout size={19} stroke={1.75} />{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</Button></div>
      </aside>
      <div className="min-w-0 md:col-start-2">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-surface md:hidden" aria-label="Quản trị trên di động">
        {visibleItems.slice(0, 3).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground", (href === "/admin" ? pathname === href : pathname.startsWith(href)) && "text-primary")}><Icon size={21} stroke={1.75} />{label}</Link>)}
      </nav>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <AdminSessionProvider><AdminShellContent>{children}</AdminShellContent></AdminSessionProvider>;
}
