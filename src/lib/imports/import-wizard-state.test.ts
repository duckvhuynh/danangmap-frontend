import { describe, expect, it } from "vitest";
import { MAX_IMPORT_BYTES, canApplyImport, inferImportFormat, replaceConfirmationValid, shouldPollImport, validateImportFile, validateImportMapping, type ImportMappingDraft } from "./import-wizard-state";

const mapping = (overrides: Partial<ImportMappingDraft> = {}): ImportMappingDraft => ({
  sheet: "",
  csvEncoding: "utf8",
  csvDelimiter: "comma",
  sourceCrs: "EPSG:4326",
  geometryKind: "coordinates",
  longitudeColumn: "lng",
  latitudeColumn: "lat",
  geometryColumn: "geometry",
  fields: [{ id: "1", source: "name", target: "name" }],
  matchBy: "external_identity",
  ...overrides,
});

describe("import wizard policy", () => {
  it.each([["data.csv", "csv"], ["data.xlsx", "xlsx"], ["data.geojson", "geojson"], ["data.JSON", "geojson"], ["data.kml", "kml"]])("infers %s", (name, format) => expect(inferImportFormat(name)).toBe(format));

  it("enforces the exact 25 MB upload boundary", () => {
    expect(validateImportFile({ name: "data.csv", size: MAX_IMPORT_BYTES })).toBeNull();
    expect(validateImportFile({ name: "data.csv", size: MAX_IMPORT_BYTES + 1 })).toContain("25 MB");
    expect(validateImportFile({ name: "data.zip", size: 12 })).toContain("Chỉ hỗ trợ");
  });

  it("matches geometry mapping to the file format without fake geometry columns", () => {
    expect(validateImportMapping(mapping({ geometryKind: "geojson", geometryColumn: "" }), "append", "geojson")).toEqual([]);
    expect(validateImportMapping(mapping({ geometryKind: "kml_geometry", geometryColumn: "" }), "append", "kml")).toEqual([]);
    expect(validateImportMapping(mapping({ geometryKind: "wkt", geometryColumn: "" }), "append", "csv")).toContain("Nhập tên cột chứa hình dạng theo định dạng WKT.");
    expect(validateImportMapping(mapping({ geometryKind: "geojson" }), "append", "csv")).toContain("Cách đọc vị trí không phù hợp với định dạng tệp.");
    expect(validateImportMapping(mapping({ sheet: "", geometryKind: "wkt" }), "append", "xlsx")).toContain("Chọn một trang tính trong tệp Excel.");
  });

  it("validates both supported upsert identities and duplicate targets", () => {
    expect(validateImportMapping(mapping({ matchBy: "feature_id" }), "upsert", "csv")).toContain("Để cập nhật theo mã đối tượng, hãy ghép một cột với trường Mã đối tượng.");
    expect(validateImportMapping(mapping({ matchBy: "feature_id", fields: [{ id: "1", source: "id", target: "feature_id" }] }), "upsert", "csv")).toEqual([]);
    expect(validateImportMapping(mapping({ fields: [{ id: "1", source: "source", target: "external_source" }, { id: "2", source: "id", target: "external_id" }] }), "upsert", "csv")).toEqual([]);
    expect(validateImportMapping(mapping({ fields: [{ id: "1", source: "a", target: "name" }, { id: "2", source: "b", target: "name" }] }), "append", "csv")).toContain("Mỗi trường chỉ được ghép với một cột trong tệp.");
  });

  it("guards skip-invalid, destructive replace and polling states", () => {
    expect(canApplyImport({ invalid: 2 }, true, false)).toBe(false);
    expect(canApplyImport({ invalid: 2 }, true, true)).toBe(true);
    expect(replaceConfirmationValid("replace", "thay thế")).toBe(true);
    expect(replaceConfirmationValid("replace", "replace")).toBe(false);
    expect(shouldPollImport("uploaded")).toBe(true);
    expect(shouldPollImport("mapping_required")).toBe(false);
  });
});
