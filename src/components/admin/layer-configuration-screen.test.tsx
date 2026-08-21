import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayerConfigurationScreen, type LayerConfigurationTransport } from "./layer-configuration-screen";
import { useAdminSession } from "@/components/admin/admin-session";
import { createEmptyLayerConfiguration } from "@/lib/layers/layer-configuration-state";
import type { AdminPrincipal } from "@/lib/api/admin";
import type { LayerConfigurationLoadResult } from "@/lib/api/layer-configuration";

vi.mock("@/components/admin/admin-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/admin/admin-session")>()),
  useAdminSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "route-layer" }) }));

const principal: AdminPrincipal = { id: "11111111-1111-4111-8111-111111111111", email: "editor@example.gov.vn", username: "editor", displayName: "Editor", role: "editor", status: "active", mfaEnabled: true, mustChangePassword: false };

function bundle(layerId: string, title: string): LayerConfigurationLoadResult {
  const configuration = createEmptyLayerConfiguration();
  configuration.layerId = layerId;
  configuration.revisionId = `${layerId}-revision`;
  configuration.layerEtag = `"${layerId}-layer"`;
  configuration.revisionEtag = `"${layerId}-revision"`;
  configuration.slug = `layer-${layerId}`;
  configuration.title = title;
  return { configuration, groups: [] };
}

beforeEach(() => {
  vi.mocked(useAdminSession).mockReturnValue({ principal, csrfToken: "csrf-fixed", refreshCsrf: vi.fn(), clearClientPrincipal: vi.fn() });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn().mockReturnValue({ matches: true, media: "", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }) });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("layer configuration screen loading", () => {
  it("ignores a superseded request even when the transport resolves after abort", async () => {
    let resolveOld!: (value: LayerConfigurationLoadResult) => void;
    let resolveNew!: (value: LayerConfigurationLoadResult) => void;
    const load = vi.fn((layerId: string) => new Promise<LayerConfigurationLoadResult>((resolve) => {
      if (layerId === "old") resolveOld = resolve;
      else resolveNew = resolve;
    }));
    const transport = {
      load,
      previewImpact: vi.fn(),
      replaceRevision: vi.fn(),
      updateCatalog: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      createSuccessor: vi.fn(),
    } as unknown as LayerConfigurationTransport;
    const view = render(<LayerConfigurationScreen layerId="old" transport={transport}/>);
    view.rerender(<LayerConfigurationScreen layerId="new" transport={transport}/>);
    await act(async () => resolveNew(bundle("new", "Layer mới")));
    expect(await screen.findByRole("heading", { name: "Layer mới" })).toBeInTheDocument();
    await act(async () => resolveOld(bundle("old", "Layer cũ")));
    expect(screen.queryByRole("heading", { name: "Layer cũ" })).not.toBeInTheDocument();
  });
});
