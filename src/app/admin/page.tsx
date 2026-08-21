"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowRight, IconDatabase, IconProgressCheck, IconRosetteDiscountCheck, IconUserCheck } from "@tabler/icons-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { Button } from "@/components/ui/button";
import { listAdminLayers, type AdminLayer } from "@/lib/api/admin";

export default function AdminDashboardPage() {
  const { principal } = useAdminSession();
  const [layers, setLayers] = useState<AdminLayer[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { let active = true; listAdminLayers().then((data) => { if (active) setLayers(data); }).catch((reason: unknown) => { if (active) setError(reason); }); return () => { active = false; }; }, []);
  const metrics = layers ? [
    { label: "Lớp trong catalog", value: layers.length, icon: IconDatabase },
    { label: "Đã công bố", value: layers.filter((layer) => layer.status === "published").length, icon: IconRosetteDiscountCheck },
    { label: "Chờ duyệt", value: layers.filter((layer) => layer.status === "in_review").length, icon: IconProgressCheck },
  ] : [];
  return <main className="mx-auto max-w-[1200px] p-4 pb-24 sm:p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">Phiên quản trị đã xác thực</p><h1 className="mt-1 text-2xl font-semibold tracking-[-0.02em]">Tổng quan hệ thống</h1><p className="mt-2 text-sm text-muted-foreground">Dữ liệu hiển thị trực tiếp từ catalog quản trị.</p></div><Button asChild><Link href="/admin/layers">Quản lý lớp dữ liệu<IconArrowRight stroke={1.75}/></Link></Button></div>
  {error !== null && <div className="mt-6"><AdminErrorNotice error={error}/></div>}
  <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số catalog">{layers === null && error === null ? <p className="text-sm text-muted-foreground" role="status">Đang tải catalog...</p> : metrics.map(({ label, value, icon: Icon }) => <article key={label} className="rounded-panel border bg-surface p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><Icon className="text-primary" stroke={1.75}/></div><p className="mt-4 text-3xl font-semibold tracking-[-0.03em]">{value}</p></article>)}<article className="rounded-panel border bg-surface p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Vai trò hiện tại</span><IconUserCheck className="text-primary" stroke={1.75}/></div><p className="mt-4 text-lg font-semibold capitalize">{principal.role.replace("_", " ")}</p><p className="mt-1 truncate text-xs text-muted-foreground">{principal.displayName}</p></article></section>
  <section className="mt-6 rounded-panel border bg-surface p-5"><h2 className="font-semibold">Khả năng theo vai trò</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Editor biên tập và gửi duyệt; Reviewer duyệt hoặc yêu cầu chỉnh sửa trên cả mobile; Publisher công bố revision đã duyệt trên desktop; System Admin quản lý tài khoản nội bộ.</p><Button asChild variant="outline" className="mt-5"><Link href="/admin/layers">Mở catalog thật</Link></Button></section></main>;
}
