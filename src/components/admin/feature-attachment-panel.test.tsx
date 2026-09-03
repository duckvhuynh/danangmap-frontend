import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FeatureAttachmentPanel,
  type AttachmentTransport,
} from "./feature-attachment-panel";
import {
  AdminApiError,
  type AdminFeature,
  type AdminField,
} from "@/lib/api/admin";
import { uploadAttachmentObject } from "@/lib/attachments/upload";
import { draftDb, type AttachmentRecoveryIntent } from "@/lib/editor/draft-db";

const revisionId = "11111111-1111-4111-8111-111111111111";
const featureId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const secondAttachmentId = "44444444-4444-4444-8444-444444444444";
const principalId = "55555555-5555-4555-8555-555555555555";

const fields: AdminField[] = [
  {
    key: "images",
    label: "Hình ảnh",
    type: "image",
    required: false,
    sensitive: false,
    offlineCache: false,
  },
];

const feature: AdminFeature = {
  type: "Feature",
  id: featureId,
  geometry: { type: "Point", coordinates: [108.22, 16.06] },
  properties: { name: "Trụ sở" },
  attachments: [],
  meta: {
    geometryKind: "point",
    radiusM: null,
    externalSource: null,
    externalId: null,
    versionId: "66666666-6666-4666-8666-666666666666",
    updatedAt: "2026-08-24T00:00:00.000Z",
  },
};

const metadata = {
  id: attachmentId,
  fileName: "ward.png",
  contentType: "image/png",
  sizeBytes: 128,
  sha256: "a".repeat(64),
  status: "clean" as const,
  ownerId: principalId,
  rejectionCode: null,
  finalizedAt: "2026-08-24T00:00:01.000Z",
  scannedAt: "2026-08-24T00:00:02.000Z",
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:02.000Z",
};

function linkedFeature(ids = [attachmentId]): AdminFeature {
  return {
    ...feature,
    properties: { ...feature.properties, images: ids },
    attachments: ids.map((id, index) => ({
      id,
      fieldKey: "images",
      displayOrder: index * 10,
      fileName: index === 0 ? "ward.png" : "office.png",
      contentType: "image/png",
      sizeBytes: 128 + index,
      status: "clean",
    })),
  };
}

function createTransport(): AttachmentTransport {
  const result = {
    feature: linkedFeature(),
    etag: `"rev-${revisionId}-v4"`,
    serverCursor: "4",
  };
  return {
    createUpload: vi.fn(async () => ({
      uploadId: attachmentId,
      attachmentId,
      status: "uploading" as const,
      file: {
        name: "ward.png",
        contentType: "image/png",
        sizeBytes: 128,
        sha256: "a".repeat(64),
      },
      upload: {
        method: "PUT" as const,
        url: "http://minio.local/presigned?X-Amz-Signature=secret",
        headers: { "Content-Type": "image/png" },
        expiresAt: "2026-08-24T00:10:00.000Z",
      },
    })),
    putObject: vi.fn(
      async (options: Parameters<typeof uploadAttachmentObject>[0]) => {
        options.onProgress?.(50);
        options.onProgress?.(100);
      },
    ),
    completeUpload: vi.fn(async () => ({
      ...metadata,
      status: "pending" as const,
    })),
    getAttachment: vi.fn(async () => metadata),
    deleteUnbound: vi.fn(async () => ({
      id: attachmentId,
      status: "deleted" as const,
    })),
    bind: vi.fn(async () => result),
    reorder: vi.fn(async () => result),
    unbind: vi.fn(async () => result),
  };
}

function renderPanel(
  transport: AttachmentTransport,
  currentFeature: AdminFeature = feature,
  onFeatureChanged = vi.fn(),
) {
  return {
    onFeatureChanged,
    ...render(
      <FeatureAttachmentPanel
        principalId={principalId}
        revisionId={revisionId}
        feature={currentFeature}
        fields={fields}
        etag={`"rev-${revisionId}-v3"`}
        auth={{ csrfToken: "csrf-fixed" }}
        onFeatureChanged={onFeatureChanged}
        transport={transport}
      />,
    ),
  };
}

function recovery(phase: AttachmentRecoveryIntent["phase"] = "scanning") {
  return {
    id: attachmentId,
    principalId,
    revisionId,
    featureId,
    fieldKey: "images",
    uploadId: attachmentId,
    attachmentId,
    fileName: "ward.png",
    contentType: "image/png",
    sizeBytes: 128,
    sha256: "a".repeat(64),
    phase,
    operationKey: "77777777-7777-4777-8777-777777777777",
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  } satisfies AttachmentRecoveryIntent;
}

afterEach(async () => {
  cleanup();
  await draftDb.attachmentIntents.clear();
});

describe("feature attachment panel", () => {
  it("uploads, scans and binds without rendering or persisting a signed URL", async () => {
    const transport = createTransport();
    const { container, onFeatureChanged } = renderPanel(transport);
    const file = {
      name: "ward.png",
      type: "image/png",
      size: 128,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    } as File;

    fireEvent.change(screen.getByLabelText("Chọn tệp, tối đa 25 MB"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(transport.bind).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onFeatureChanged).toHaveBeenCalledWith(
      expect.objectContaining({ etag: `"rev-${revisionId}-v4"` }),
    ));
    expect(container.querySelector("img")).toBeNull();
    expect(container).not.toHaveTextContent("X-Amz-Signature");
    expect(await draftDb.attachmentIntents.get(attachmentId)).toBeUndefined();
  });

  it("restores pending metadata after reload and reports a scanner failure without preview", async () => {
    await draftDb.attachmentIntents.put(recovery());
    const transport = createTransport();
    vi.mocked(transport.getAttachment).mockResolvedValue({
      ...metadata,
      status: "rejected",
      rejectionCode: "ATTACHMENT_SCAN_FAILED",
    });
    const { container } = renderPanel(transport);

    fireEvent.click(await screen.findByRole("button", { name: "Tiếp tục" }));

    expect(
      (await screen.findAllByText(/Chưa kiểm tra được độ an toàn/u)).length,
    ).toBeGreaterThan(0);
    expect(container.querySelector("img")).toBeNull();
    expect(await draftDb.attachmentIntents.get(attachmentId)).toBeDefined();
  });

  it("provides keyboard-operable ordering controls with conflict-safe headers", async () => {
    const transport = createTransport();
    vi.mocked(transport.reorder).mockResolvedValue({
      feature: linkedFeature([secondAttachmentId, attachmentId]),
      etag: `"rev-${revisionId}-v4"`,
      serverCursor: "4",
    });
    renderPanel(transport, linkedFeature([attachmentId, secondAttachmentId]));

    fireEvent.click(screen.getByRole("button", { name: "Đưa office.png lên" }));

    await waitFor(() =>
      expect(transport.reorder).toHaveBeenCalledWith(
        revisionId,
        featureId,
        "images",
        [secondAttachmentId, attachmentId],
        `"rev-${revisionId}-v3"`,
        expect.any(String),
        { csrfToken: "csrf-fixed" },
      ),
    );
  });

  it.each([401, 403, 409, 412, 422])(
    "shows a readable error without a request ID for attachment mutation HTTP %s",
    async (status) => {
      await draftDb.attachmentIntents.put(recovery("binding"));
      const transport = createTransport();
      vi.mocked(transport.bind).mockRejectedValue(
        new AdminApiError(
          status,
          `TEST_${status}`,
          "Không thể gắn tệp.",
          `request-${status}`,
        ),
      );
      renderPanel(transport);

      fireEvent.click(await screen.findByRole("button", { name: "Tiếp tục" }));

      await waitFor(() =>
        expect(screen.getAllByRole("alert")[0]).not.toHaveTextContent(`request-${status}`),
      );
      expect(await draftDb.attachmentIntents.get(attachmentId)).toBeDefined();
    },
  );
});
