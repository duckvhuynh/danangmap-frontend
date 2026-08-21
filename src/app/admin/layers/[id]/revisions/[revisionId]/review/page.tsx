import { RevisionReview } from "@/components/admin/revision-review";

export default async function CanonicalRevisionReviewPage({ params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const { id, revisionId } = await params;
  return <RevisionReview layerId={id} revisionId={revisionId}/>;
}
