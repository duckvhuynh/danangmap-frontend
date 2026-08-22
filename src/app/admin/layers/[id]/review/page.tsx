import { LegacyReviewRedirect } from "@/components/admin/legacy-review-redirect";

export default async function ReviewLayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LegacyReviewRedirect revisionId={id}/>;
}
