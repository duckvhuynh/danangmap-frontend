import { LayerEditor } from "@/components/admin/layer-editor";

export default async function EditLayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const principalId = process.env.DANANGMAP_DEV_PRINCIPAL_ID ?? "local-demo-system-admin";
  return <LayerEditor layerId={id} principalId={principalId}/>;
}
