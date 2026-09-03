"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { IconChartBar, IconDatabase, IconLogout, IconMenu2, IconSettings, IconShieldCheck, IconUsers } from "@tabler/icons-react";
import { BrandMark } from "@/components/brand-mark";
import { AdminSessionProvider, useAdminSession } from "@/components/admin/admin-session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminRoleLabel } from "@/lib/admin/labels";
import { logout } from "@/lib/api/admin";
import { clearPrincipalRecovery } from "@/lib/editor/draft-db";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Tổng quan", icon: IconChartBar },
  { href: "/admin/layers", label: "Lớp dữ liệu", icon: IconDatabase },
  { href: "/admin/users", label: "Người dùng", icon: IconUsers, systemAdminOnly: true },
  { href: "/admin/audit", label: "Nhật ký", icon: IconShieldCheck, systemAdminOnly: true },
  { href: "/admin/settings", label: "Bảo mật", icon: IconSettings },
];

function AdminShellContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { principal, csrfToken, clearClientPrincipal } = useAdminSession();
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
        <div className="border-b p-4"><BrandMark />{process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true" && <p className="mt-3 rounded-control bg-accent-subtle px-2 py-1.5 text-xs font-medium text-warning">Bản dùng thử · dữ liệu minh họa</p>}</div>
        <nav className="flex-1 flex flex-col gap-1 p-3" aria-label="Quản trị">
          {visibleItems.map(({ href, label, icon: Icon }) => { const active = href === "/admin" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "bg-accent-subtle text-primary")}><Icon size={20} stroke={1.75} />{label}</Link>; })}
        </nav>
        <div className="border-t p-3"><div className="mb-2 flex items-center gap-3 rounded-control px-3 py-2"><span className="grid size-8 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-primary">{initials}</span><span className="min-w-0"><span className="block truncate text-sm font-medium">{principal.displayName}</span><span className="block text-xs text-muted-foreground">{adminRoleLabel(principal.role)}</span></span></div><Button type="button" variant="ghost" disabled={loggingOut} onClick={handleLogout} className="w-full justify-start px-3 text-muted-foreground"><IconLogout size={19} stroke={1.75} />{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</Button></div>
      </aside>
      <div className="min-w-0 md:col-start-2">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-surface md:hidden" aria-label="Quản trị trên di động">
        {visibleItems.filter((item) => !item.systemAdminOnly).map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "text-primary")}><Icon size={21} stroke={1.75} aria-hidden="true"/>{label}</Link>;
        })}
        <Button variant="ghost" onClick={() => setMobileOpen(true)} className="h-16 flex-col gap-1 rounded-none text-xs"><IconMenu2 data-icon="inline-start" stroke={1.75}/>Menu</Button>
      </nav>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Menu quản trị</DialogTitle></DialogHeader>
          <p className="text-sm">{principal.displayName}<span className="block text-muted-foreground">{adminRoleLabel(principal.role)}</span></p>
          <nav aria-label="Tất cả chức năng quản trị" className="flex flex-col gap-1">
            {visibleItems.map(({ href, label, icon: Icon }) => <Button asChild variant="ghost" className="justify-start" key={href}><Link href={href} onClick={() => setMobileOpen(false)}><Icon data-icon="inline-start" stroke={1.75}/>{label}</Link></Button>)}
          </nav>
          <Button variant="outline" disabled={loggingOut} onClick={handleLogout}><IconLogout data-icon="inline-start" stroke={1.75}/>{loggingOut ? "Đang đăng xuất..." : "Đăng xuất"}</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <AdminSessionProvider><AdminShellContent>{children}</AdminShellContent></AdminSessionProvider>;
}
