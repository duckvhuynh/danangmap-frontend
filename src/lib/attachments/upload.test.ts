import { describe, expect, it } from "vitest";
import {
  attachmentAccept,
  attachmentContentType,
  attachmentSha256,
  MAX_ATTACHMENT_BYTES,
} from "./upload";

describe("attachment upload safety", () => {
  it("derives a safe MIME when the browser omits it", () => {
    expect(
      attachmentContentType({ name: "boundary.geojson", type: "", size: 20 }),
    ).toBe("application/geo+json");
  });

  it("rejects an extension/MIME mismatch and files over 25 MiB", () => {
    expect(() =>
      attachmentContentType({
        name: "ward.png",
        type: "application/pdf",
        size: 20,
      }),
    ).toThrow("MIME");
    expect(() =>
      attachmentContentType({
        name: "ward.png",
        type: "image/png",
        size: MAX_ATTACHMENT_BYTES + 1,
      }),
    ).toThrow("25 MiB");
  });

  it("hashes the exact file bytes with SHA-256", async () => {
    const file = {
      arrayBuffer: async () => new TextEncoder().encode("danangmap").buffer,
    } as Blob;
    const hash = await attachmentSha256(file);
    expect(hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("limits image fields to the raster allowlist", () => {
    expect(attachmentAccept("image")).toBe(
      "image/jpeg,image/png,image/gif,image/webp",
    );
    expect(attachmentAccept("attachment")).toContain("application/pdf");
  });
});
