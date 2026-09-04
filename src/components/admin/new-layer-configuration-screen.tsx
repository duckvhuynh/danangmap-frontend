"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  AdminErrorNotice,
  useAdminSession,
} from "@/components/admin/admin-session";
import { LayerConfigurationEditor } from "@/components/admin/layer-configuration-editor";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getDesktopAuthoringCapability,
  getServerDesktopAuthoringCapability,
  subscribeDesktopAuthoringCapability,
} from "@/lib/admin/authoring-capability";
import { canAuthorContent } from "@/lib/admin/role-capabilities";
import { layerConfigurationCreateTransport } from "@/lib/api/layer-configuration";
import {
  createEmptyLayerConfiguration,
  type LayerConfigurationCreateContext,
  type LayerConfigurationDraft,
  type LayerConfigurationSaveResult,
  type LayerGroupOption,
} from "@/lib/layers/layer-configuration-state";

export interface LayerConfigurationCreateTransport {
  listGroups(signal?: AbortSignal): Promise<LayerGroupOption[]>;
  create(
    configuration: LayerConfigurationDraft,
    context: LayerConfigurationCreateContext,
    auth: { csrfToken: string },
  ): Promise<LayerConfigurationSaveResult>;
}

export function NewLayerConfigurationScreen({
  transport = layerConfigurationCreateTransport,
}: {
  transport?: LayerConfigurationCreateTransport;
}) {
  const { principal, csrfToken } = useAdminSession();
  const router = useRouter();
  const canAuthor = useSyncExternalStore(
    subscribeDesktopAuthoringCapability,
    getDesktopAuthoringCapability,
    getServerDesktopAuthoringCapability,
  );
  const initial = useMemo(() => createEmptyLayerConfiguration(), []);
  const [groups, setGroups] = useState<LayerGroupOption[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [reload, setReload] = useState(0);
  const shouldLoad = canAuthorContent(principal.role) && canAuthor;

  useEffect(() => {
    if (!shouldLoad) return;
    const controller = new AbortController();
    let active = true;
    transport
      .listGroups(controller.signal)
      .then((next) => {
        if (active) setGroups(next);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [reload, shouldLoad, transport]);

  if (!shouldLoad) {
    return (
      <LayerConfigurationEditor
        initial={initial}
        groups={[]}
        principalRole={principal.role}
        canAuthor={canAuthor}
        actions={{
          create: (configuration, context) =>
            transport.create(configuration, context, { csrfToken }),
        }}
        mode="create"
      />
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-2xl p-4 sm:p-6">
        <AdminErrorNotice
          error={error}
          onRetry={() => {
            setGroups(null);
            setError(null);
            setReload((value) => value + 1);
          }}
        />
      </main>
    );
  }

  if (!groups) {
    return (
      <main
        className="mx-auto max-w-[1440px] p-4 sm:p-6 md:p-8"
        role="status"
        aria-label="Đang tải cấu hình lớp"
      >
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="mt-8 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Skeleton className="h-52 rounded-panel" />
          <Skeleton className="h-[520px] rounded-panel" />
        </div>
      </main>
    );
  }

  return (
    <LayerConfigurationEditor
      initial={initial}
      groups={groups}
      principalRole={principal.role}
      canAuthor={canAuthor}
      actions={{
        create: (configuration, context) =>
          transport.create(configuration, context, { csrfToken }),
      }}
      onSaved={(result) => {
        if (result.configuration.layerId)
          router.replace(`/admin/layers/${result.configuration.layerId}`);
      }}
      mode="create"
    />
  );
}
