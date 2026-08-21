import { ImportWizardRoute } from "@/components/admin/import-wizard";

export default async function ImportLayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ImportWizardRoute revisionId={id}/>;
}
