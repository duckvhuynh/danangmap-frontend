"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { AdminErrorNotice, useAdminSession } from "@/components/admin/admin-session";
import { LayerConfigurationEditor } from "@/components/admin/layer-configuration-editor";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDesktopAuthoringCapability,
  getServerDesktopAuthoringCapability,
  subscribeDesktopAuthoringCapability,
} from "@/lib/admin/authoring-capability";
import {
  archiveLayerConfiguration,
  createLayerSuccessor,
  loadLayerConfiguration,
  previewLayerConfigurationImpact,
  replaceLayerRevisionConfiguration,
  unarchiveLayerConfiguration,
  updateLayerCatalogConfiguration,
  type LayerConfigurationLoadResult,
} from "@/lib/api/layer-configuration";

export interface LayerConfigurationTransport {
  load: typeof loadLayerConfiguration;
  previewImpact: typeof previewLayerConfigurationImpact;
  replaceRevision: typeof replaceLayerRevisionConfiguration;
  updateCatalog: typeof updateLayerCatalogConfiguration;
  archive: typeof archiveLayerConfiguration;
  unarchive: typeof unarchiveLayerConfiguration;
  createSuccessor: typeof createLayerSuccessor;
}

const defaultTransport: LayerConfigurationTransport = {
  load: loadLayerConfiguration,
  previewImpact: previewLayerConfigurationImpact,
  replaceRevision: replaceLayerRevisionConfiguration,
  updateCatalog: updateLayerCatalogConfiguration,
  archive: archiveLayerConfiguration,
  unarchive: unarchiveLayerConfiguration,
  createSuccessor: createLayerSuccessor,
};

export function LayerConfigurationScreen({ layerId: layerIdProp, transport = defaultTransport }: { layerId?: string; transport?: LayerConfigurationTransport }) {
  const params = useParams<{ id: string }>();
  const layerId = layerIdProp ?? params.id;
  const { principal, csrfToken } = useAdminSession();
  const canAuthor = useSyncExternalStore(subscribeDesktopAuthoringCapability, getDesktopAuthoringCapability, getServerDesktopAuthoringCapability);
  const [bundle, setBundle] = useState<LayerConfigurationLoadResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const reload = useCallback(() => {
    setBundle(null);
    setError(null);
    setReloadVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    transport.load(layerId, controller.signal).then((next) => {
      if (active) setBundle(next);
    }).catch((reason: unknown) => {
      if (active) setError(reason);
    });
    return () => { active = false; controller.abort(); };
  }, [layerId, reloadVersion, transport]);

  if (error) return <main className="mx-auto max-w-2xl p-4 sm:p-6"><AdminErrorNotice error={error} onRetry={reload}/></main>;
  if (!bundle) return <main className="mx-auto max-w-[1440px] p-4 sm:p-6 md:p-8" role="status" aria-label="Đang tải cấu hình lớp"><div className="flex flex-col gap-3"><Skeleton className="h-8 w-64"/><Skeleton className="h-4 w-full max-w-xl"/></div><div className="mt-8 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]"><Skeleton className="h-52 rounded-panel"/><Skeleton className="h-[560px] rounded-panel"/></div></main>;

  const auth = { csrfToken };
  return <LayerConfigurationEditor
    key={`${bundle.configuration.layerEtag}:${bundle.configuration.revisionEtag}`}
    initial={bundle.configuration}
    groups={bundle.groups}
    principalRole={principal.role}
    canAuthor={canAuthor}
    actions={{
      previewImpact: (configuration, context) => transport.previewImpact(configuration, context, auth),
      replaceRevision: (configuration, context) => transport.replaceRevision(configuration, context, auth),
      updateCatalog: (configuration, context) => transport.updateCatalog(configuration, context, auth),
      archive: (configuration, context) => transport.archive(configuration, context, auth),
      unarchive: (configuration, context) => transport.unarchive(configuration, context, auth),
      createSuccessor: (configuration, context) => transport.createSuccessor(configuration, context, auth),
    }}
    onReload={reload}
    mode="edit"
  />;
}
