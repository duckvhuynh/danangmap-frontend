import { RevisionReview } from "@/components/admin/revision-review";

export default async function ReviewLayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RevisionReview revisionId={id}/>;
}
