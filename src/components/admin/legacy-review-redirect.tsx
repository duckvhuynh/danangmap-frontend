"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight as IconArrowRight } from "lucide-react";
import { AdminErrorNotice } from "@/components/admin/admin-session";
import { RevisionReview } from "@/components/admin/revision-review";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { getRevisionHistory } from "@/lib/api/history";

export function LegacyReviewRedirect({ revisionId }: { revisionId: string }) {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return;
    let active = true;
    getRevisionHistory(revisionId).then(({ data }) => {
      if (active) router.replace(`/admin/layers/${encodeURIComponent(data.revision.layerId)}/revisions/${encodeURIComponent(revisionId)}/review`);
    }).catch((reason: unknown) => {
      if (active) setError(reason);
    });
    return () => { active = false; };
  }, [reloadVersion, revisionId, router]);

  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return <RevisionReview revisionId={revisionId}/>;
  if (error) return <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 md:pb-6"><AdminErrorNotice error={error} onRetry={() => { setError(null); setReloadVersion((value) => value + 1); }}/></main>;

  return <main className="mx-auto max-w-2xl p-4 pb-24 sm:p-6 md:pb-6">
    <Alert>
      <IconArrowRight strokeWidth={1.75}/>
      <AlertTitle>Đang mở route review chuẩn</AlertTitle>
      <AlertDescription>Hệ thống đang xác minh revision và layer trước khi chuyển hướng.</AlertDescription>
    </Alert>
    <div className="mt-4 flex flex-col gap-3" role="status" aria-label="Đang xác minh revision"><Skeleton className="h-8 w-64"/><Skeleton className="h-24 w-full"/></div>
  </main>;
}
