import { PublicationHistoryScreen } from "@/components/admin/publication-history-screen";

export default async function LayerHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PublicationHistoryScreen layerId={id}/>;
}
