"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconChartBar, IconDatabase, IconLogout, IconSettings, IconUsers } from "@tabler/icons-react";
import { BrandMark } from "@/components/brand-mark";
import { cn } from "@/lib/utils";

const items = [
  { href: "/admin", label: "Tổng quan", icon: IconChartBar },
  { href: "/admin/layers", label: "Lớp dữ liệu", icon: IconDatabase },
  { href: "/admin/users", label: "Người dùng", icon: IconUsers },
  { href: "/admin/settings", label: "Cài đặt", icon: IconSettings },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-[100dvh] bg-surface-subtle md:grid md:grid-cols-[240px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 border-r bg-surface md:flex md:flex-col">
        <div className="border-b p-4"><BrandMark /></div>
        <nav className="flex-1 space-y-1 p-3" aria-label="Quản trị">
          {items.map(({ href, label, icon: Icon }) => { const active = href === "/admin" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={cn("flex min-h-11 items-center gap-3 rounded-control px-3 text-sm font-medium hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "bg-accent-subtle text-primary")}><Icon size={20} stroke={1.75} />{label}</Link>; })}
        </nav>
        <div className="border-t p-3"><div className="mb-2 flex items-center gap-3 rounded-control px-3 py-2"><span className="grid size-8 place-items-center rounded-full bg-accent-subtle text-xs font-semibold text-primary">AD</span><span className="min-w-0"><span className="block truncate text-sm font-medium">Quản trị hệ thống</span><span className="block text-xs text-muted-foreground">System admin</span></span></div><Link href="/login" className="flex min-h-10 items-center gap-3 rounded-control px-3 text-sm text-muted-foreground hover:bg-surface-subtle"><IconLogout size={19} stroke={1.75} />Đăng xuất</Link></div>
      </aside>
      <div className="min-w-0 md:col-start-2">{children}</div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-surface md:hidden" aria-label="Quản trị trên di động">
        {items.slice(0, 3).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-xs text-muted-foreground", (href === "/admin" ? pathname === href : pathname.startsWith(href)) && "text-primary")}><Icon size={21} stroke={1.75} />{label}</Link>)}
      </nav>
    </div>
  );
}
