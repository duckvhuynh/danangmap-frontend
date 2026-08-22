import { describe, expect, it } from "vitest";
import {
  changeGeometryMode,
  changeAllowedGeometryKinds,
  changeSchemaField,
  createEmptyLayerConfiguration,
  createEmptySchemaField,
  hasConfigurationImpact,
  moveSchemaField,
  removeSchemaField,
  replaceSchemaField,
  validateLayerConfiguration,
} from "./layer-configuration-state";

describe("dynamic layer configuration state", () => {
  it("normalizes geometry kinds when the mode changes", () => {
    const mixed = changeGeometryMode(createEmptyLayerConfiguration(), "mixed");
    expect(mixed.allowedGeometryKinds).toEqual(["point", "line", "polygon"]);
    expect(changeGeometryMode(mixed, "circle").allowedGeometryKinds).toEqual(["circle"]);
  });

  it("clears both cluster flags when clusterable point kinds are removed", () => {
    const draft = createEmptyLayerConfiguration();
    draft.renderConfig.cluster = true;
    draft.style.pointCluster = true;
    expect(changeAllowedGeometryKinds(draft, ["polygon"])).toMatchObject({
      allowedGeometryKinds: ["polygon"],
      renderConfig: { cluster: false },
      style: { pointCluster: false },
    });
  });

  it("forces sensitive fields private and out of offline recovery", () => {
    const field = changeSchemaField(createEmptySchemaField("field-private"), "sensitive", true);
    expect(field).toMatchObject({ sensitive: true, public: false, offlineCache: false });
    expect(changeSchemaField(field, "offlineCache", true)).toMatchObject({ sensitive: false, offlineCache: true });
  });

  it("removes deleted fields from the public popup projection", () => {
    const draft = createEmptyLayerConfiguration();
    const address = { ...createEmptySchemaField("field-address"), key: "address", label: "Địa chỉ", public: true };
    const withAddress = {
      ...draft,
      fields: [draft.fields[0]!, address],
      popupConfig: { ...draft.popupConfig, subtitleField: "address", fieldKeys: ["name", "address"] },
    };
    const next = removeSchemaField(withAddress, address.clientId);
    expect(next.popupConfig).toMatchObject({ subtitleField: "", fieldKeys: ["name"] });
  });

  it("keeps popup references aligned when a public field key changes", () => {
    const draft = createEmptyLayerConfiguration();
    const renamed = changeSchemaField(draft.fields[0]!, "key", "title");
    const next = replaceSchemaField(draft, renamed);
    expect(next.popupConfig).toMatchObject({ titleField: "title", fieldKeys: ["title"] });
  });

  it("removes private and sensitive field capabilities from public projection", () => {
    const draft = createEmptyLayerConfiguration();
    const sensitive = changeSchemaField(
      { ...draft.fields[0]!, filterable: true, sortable: true },
      "sensitive",
      true,
    );
    const next = replaceSchemaField(draft, sensitive);
    expect(sensitive).toMatchObject({
      public: false,
      searchable: false,
      filterable: false,
      sortable: false,
      offlineCache: false,
    });
    expect(next.popupConfig).toMatchObject({ titleField: "", fieldKeys: [] });
  });

  it("reorders fields deterministically", () => {
    const first = { ...createEmptySchemaField("first"), key: "first", label: "Một" };
    const second = { ...createEmptySchemaField("second"), key: "second", label: "Hai" };
    expect(moveSchemaField([first, second], "second", -1).map((field) => [field.clientId, field.displayOrder])).toEqual([
      ["second", 10],
      ["first", 20],
    ]);
  });

  it("reports schema, popup, geometry and style validation together", () => {
    const draft = createEmptyLayerConfiguration();
    const duplicate = { ...createEmptySchemaField("duplicate"), key: "name", label: "Tên khác", type: "enum" as const };
    const errors = validateLayerConfiguration({
      ...draft,
      slug: "Tên lớp",
      title: "",
      fields: [draft.fields[0]!, duplicate],
      popupConfig: { ...draft.popupConfig, titleField: "private_missing" },
      renderConfig: { ...draft.renderConfig, minZoom: 18, maxZoom: 8 },
      style: { ...draft.style, pointColor: "blue" },
    });
    expect(Object.values(errors).join(" ")).toContain("bị trùng");
    expect(errors).toMatchObject({
      slug: expect.any(String),
      title: expect.any(String),
      "popupConfig.titleField": expect.any(String),
      renderZoom: expect.any(String),
      styleColor: expect.any(String),
    });
  });

  it("detects destructive impact but not presentational changes", () => {
    const original = createEmptyLayerConfiguration();
    original.fields[0] = { ...original.fields[0]!, serverId: "field-name" };
    expect(hasConfigurationImpact(original, { ...original, title: "Tên mới" })).toBe(false);
    expect(hasConfigurationImpact(original, changeGeometryMode(original, "polygon"))).toBe(true);
    expect(hasConfigurationImpact(original, { ...original, fields: [{ ...original.fields[0]!, type: "integer" }] })).toBe(true);
  });
});
