"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight as IconArrowRight,
  Database as IconDatabase,
  ListChecks as IconProgressCheck,
  Pencil as IconPencil,
} from "lucide-react";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { canAuthorContent, canPublishContent, canReviewContent } from "@/lib/admin/role-capabilities";
import { revisionStatusLabel } from "@/lib/admin/labels";
import { listAdminLayers, type AdminLayer } from "@/lib/api/admin";

function isEditableStatus(status: string) { return status === "draft" || status === "changes_requested"; }
const taskPriority: Record<string, number> = { changes_requested: 0, in_review: 1, approved: 2, draft: 3 };

export default function AdminDashboardPage() {
  const { principal } = useAdminSession();
  const [layers, setLayers] = useState<AdminLayer[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    listAdminLayers().then((data) => { if (active) setLayers(data); }).catch((reason: unknown) => { if (active) setError(reason); });
    return () => { active = false; };
  }, [reload]);
  const tasks = layers?.filter((layer) =>
    (canAuthorContent(principal.role) && isEditableStatus(layer.status)) ||
    (canReviewContent(principal.role) && layer.status === "in_review") ||
    (canPublishContent(principal.role) && layer.status === "approved"))
    .sort((left, right) => (taskPriority[left.status] ?? 4) - (taskPriority[right.status] ?? 4) || right.updatedAt.localeCompare(left.updatedAt)) ?? [];
  const metrics = layers ? [
    { label: "Tổng số lớp", value: layers.length, icon: IconDatabase },
    { label: "Đang biên tập", value: layers.filter((layer) => isEditableStatus(layer.status)).length, icon: IconPencil },
    { label: "Chờ duyệt", value: layers.filter((layer) => layer.status === "in_review").length, icon: IconProgressCheck },
  ] : [];

  return <main className="mx-auto max-w-[1200px] p-4 pb-24 sm:p-6 md:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold">Tổng quan</h1><p className="mt-2 text-sm text-muted-foreground">Theo dõi lớp dữ liệu và tiếp tục công việc của bạn.</p></div>
      <Button asChild><Link href="/admin/layers">Quản lý lớp dữ liệu<IconArrowRight data-icon="inline-end" strokeWidth={1.75}/></Link></Button>
    </header>
    {error !== null && <div className="mt-6"><AdminErrorNotice error={error} onRetry={() => { setError(null); setReload((value) => value + 1); }}/></div>}
    <section className="mt-7 grid gap-4 sm:grid-cols-3" aria-label="Tình hình lớp dữ liệu">
      {layers === null && error === null ? <div className="contents" role="status" aria-label="Đang tải tổng quan"><span className="sr-only">Đang tải tổng quan...</span>{[0, 1, 2].map((item) => <Skeleton key={item} className="h-28 rounded-panel"/>)}</div> :
        metrics.map(({ label, value, icon: Icon }) => <article key={label} className="rounded-panel border bg-surface p-5"><div className="flex items-center justify-between"><h2 className="text-sm text-muted-foreground">{label}</h2><Icon aria-hidden="true" className="text-primary" strokeWidth={1.75}/></div><p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p></article>)}
    </section>
    {layers !== null && <section className="mt-7" aria-labelledby="admin-tasks-title">
      <h2 id="admin-tasks-title" className="text-lg font-semibold">Công việc cần xử lý</h2>
      <p className="mt-1 text-sm text-muted-foreground">Các lớp đang biên tập, chờ duyệt hoặc chờ công bố, tùy theo vai trò của bạn.</p>
      {tasks.length === 0 ? <Empty className="mt-4 border bg-surface"><EmptyHeader><EmptyTitle>Chưa có công việc cần xử lý</EmptyTitle><EmptyDescription>Bạn có thể mở danh sách lớp để xem dữ liệu hiện có.</EmptyDescription></EmptyHeader><Button asChild variant="outline"><Link href="/admin/layers">Xem lớp dữ liệu</Link></Button></Empty> :
        <ul className="mt-4 divide-y rounded-panel border bg-surface">{tasks.slice(0, 6).map((layer) => <li key={layer.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0"><h3 className="break-words text-sm font-medium">{layer.title}</h3><Badge className="mt-2">{revisionStatusLabel(layer.status)}</Badge></div>
          <Button asChild variant="outline" size="sm"><Link href={isEditableStatus(layer.status) || !layer.revisionId ? `/admin/layers/${layer.id}` : `/admin/layers/${layer.id}/revisions/${layer.revisionId}/review`}>{isEditableStatus(layer.status) ? "Mở lớp" : "Xem để xử lý"}<IconArrowRight data-icon="inline-end" strokeWidth={1.75}/></Link></Button>
        </li>)}</ul>}
      {tasks.length > 6 && <Button asChild variant="ghost" className="mt-3"><Link href="/admin/layers">Xem tất cả lớp dữ liệu<IconArrowRight data-icon="inline-end" strokeWidth={1.75}/></Link></Button>}
    </section>}
  </main>;
}
