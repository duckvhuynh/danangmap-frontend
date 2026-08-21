import { LayerEditor } from "@/components/admin/layer-editor";

export default async function EditLayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LayerEditor revisionId={id}/>;
}
