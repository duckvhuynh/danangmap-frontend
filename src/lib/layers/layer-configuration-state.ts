export const layerFieldTypes = [
  "text",
  "long_text",
  "number",
  "integer",
  "boolean",
  "date",
  "datetime",
  "url",
  "email",
  "phone",
  "enum",
  "multi_enum",
  "address",
  "image",
  "attachment",
] as const;

export type LayerFieldType = (typeof layerFieldTypes)[number];
export type LayerGeometryMode = "point" | "circle" | "polyline" | "polygon" | "mixed";
export type LayerGeometryKind = "point" | "multipoint" | "line" | "multiline" | "polygon" | "multipolygon" | "circle";

export const geometryKindLabels: Array<{ value: LayerGeometryKind; label: string }> = [
  { value: "point", label: "Point" },
  { value: "multipoint", label: "MultiPoint" },
  { value: "line", label: "LineString" },
  { value: "multiline", label: "MultiLineString" },
  { value: "polygon", label: "Polygon" },
  { value: "multipolygon", label: "MultiPolygon" },
  { value: "circle", label: "Circle, tâm Point và bán kính mét" },
];

export interface LayerGroupOption {
  id: string;
  slug: string;
  title: string;
  description: string;
  displayOrder: number;
  defaultVisible: boolean;
  archivedAt: string | null;
}

export interface LayerSchemaFieldDraft {
  clientId: string;
  serverId: string | null;
  key: string;
  label: string;
  description: string;
  type: LayerFieldType;
  icon: string;
  required: boolean;
  public: boolean;
  searchable: boolean;
  filterable: boolean;
  sortable: boolean;
  sensitive: boolean;
  offlineCache: boolean;
  defaultValue: string;
  validation: {
    min: string;
    max: string;
    minLength: string;
    maxLength: string;
  };
  options: string[];
  displayOrder: number;
}

export interface LayerConfigurationDraft {
  layerId: string | null;
  revisionId: string | null;
  revisionStatus: string;
  etag: string | null;
  archivedAt: string | null;
  slug: string;
  groupId: string;
  displayOrder: number;
  defaultVisible: boolean;
  title: string;
  description: string;
  geometryMode: LayerGeometryMode;
  allowedGeometryKinds: LayerGeometryKind[];
  fields: LayerSchemaFieldDraft[];
  style: {
    pointColor: string;
    pointRadius: number;
    lineColor: string;
    lineWidth: number;
    polygonFillColor: string;
    polygonFillOpacity: number;
    polygonStrokeColor: string;
    polygonStrokeWidth: number;
  };
  renderConfig: {
    minZoom: number;
    maxZoom: number;
    cluster: boolean;
  };
  popupConfig: {
    titleField: string;
    subtitleField: string;
    fieldKeys: string[];
    showCoordinates: boolean;
  };
}

export type LayerConfigurationErrors = Record<string, string>;

export interface LayerConfigurationSaveContext {
  etag: string | null;
  operationKey: string;
}

export interface LayerConfigurationSaveResult {
  configuration: LayerConfigurationDraft;
  etag: string;
}

export interface LayerConfigurationActions {
  save(configuration: LayerConfigurationDraft, context: LayerConfigurationSaveContext): Promise<LayerConfigurationSaveResult>;
  archive?(layerId: string, context: LayerConfigurationSaveContext): Promise<LayerConfigurationSaveResult>;
  unarchive?(layerId: string, context: LayerConfigurationSaveContext): Promise<LayerConfigurationSaveResult>;
}

const geometryKindsByMode: Record<Exclude<LayerGeometryMode, "mixed">, LayerGeometryKind[]> = {
  point: ["point", "multipoint"],
  circle: ["circle"],
  polyline: ["line", "multiline"],
  polygon: ["polygon", "multipolygon"],
};

export function defaultAllowedGeometryKinds(mode: LayerGeometryMode): LayerGeometryKind[] {
  return mode === "mixed" ? ["point", "line", "polygon"] : [...geometryKindsByMode[mode]];
}

export function createEmptySchemaField(clientId = crypto.randomUUID()): LayerSchemaFieldDraft {
  return {
    clientId,
    serverId: null,
    key: "",
    label: "",
    description: "",
    type: "text",
    icon: "",
    required: false,
    public: true,
    searchable: false,
    filterable: false,
    sortable: false,
    sensitive: false,
    offlineCache: true,
    defaultValue: "",
    validation: { min: "", max: "", minLength: "", maxLength: "" },
    options: [],
    displayOrder: 0,
  };
}

export function createEmptyLayerConfiguration(): LayerConfigurationDraft {
  const name = createEmptySchemaField();
  name.key = "name";
  name.label = "Tên";
  name.required = true;
  name.searchable = true;
  return {
    layerId: null,
    revisionId: null,
    revisionStatus: "draft",
    etag: null,
    archivedAt: null,
    slug: "",
    groupId: "",
    displayOrder: 0,
    defaultVisible: true,
    title: "",
    description: "",
    geometryMode: "point",
    allowedGeometryKinds: defaultAllowedGeometryKinds("point"),
    fields: [name],
    style: {
      pointColor: "#1A73E8",
      pointRadius: 7,
      lineColor: "#1A73E8",
      lineWidth: 3,
      polygonFillColor: "#EAF3FF",
      polygonFillOpacity: 0.35,
      polygonStrokeColor: "#1A73E8",
      polygonStrokeWidth: 2,
    },
    renderConfig: { minZoom: 8, maxZoom: 18, cluster: false },
    popupConfig: { titleField: "name", subtitleField: "", fieldKeys: ["name"], showCoordinates: false },
  };
}

export function changeGeometryMode(draft: LayerConfigurationDraft, mode: LayerGeometryMode): LayerConfigurationDraft {
  return { ...draft, geometryMode: mode, allowedGeometryKinds: defaultAllowedGeometryKinds(mode) };
}

export function changeSchemaField<K extends keyof LayerSchemaFieldDraft>(
  field: LayerSchemaFieldDraft,
  key: K,
  value: LayerSchemaFieldDraft[K],
): LayerSchemaFieldDraft {
  const next: LayerSchemaFieldDraft = { ...field, [key]: value };
  if (key === "sensitive" && value === true) {
    return {
      ...next,
      public: false,
      searchable: false,
      filterable: false,
      sortable: false,
      offlineCache: false,
    };
  }
  if (key === "offlineCache" && value === true) return { ...next, sensitive: false };
  if (key === "public" && value === false) return { ...next, searchable: false, filterable: false, sortable: false };
  return next;
}

export function normalizeFieldOrder(fields: LayerSchemaFieldDraft[]) {
  return fields.map((field, index) => ({ ...field, displayOrder: (index + 1) * 10 }));
}

export function moveSchemaField(fields: LayerSchemaFieldDraft[], clientId: string, direction: -1 | 1) {
  const index = fields.findIndex((field) => field.clientId === clientId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= fields.length) return fields;
  const next = [...fields];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return normalizeFieldOrder(next);
}

export function removeSchemaField(draft: LayerConfigurationDraft, clientId: string): LayerConfigurationDraft {
  const fields = normalizeFieldOrder(draft.fields.filter((field) => field.clientId !== clientId));
  return reconcilePublicProjection({ ...draft, fields });
}

export function replaceSchemaField(draft: LayerConfigurationDraft, nextField: LayerSchemaFieldDraft): LayerConfigurationDraft {
  const previous = draft.fields.find((field) => field.clientId === nextField.clientId);
  const fields = draft.fields.map((field) => field.clientId === nextField.clientId ? nextField : field);
  const previousKey = previous?.key;
  const nextKey = nextField.public && !nextField.sensitive ? nextField.key : "";
  const replaceKey = (key: string) => previousKey && key === previousKey ? nextKey : key;
  return reconcilePublicProjection({
    ...draft,
    fields,
    popupConfig: {
      ...draft.popupConfig,
      titleField: replaceKey(draft.popupConfig.titleField),
      subtitleField: replaceKey(draft.popupConfig.subtitleField),
      fieldKeys: draft.popupConfig.fieldKeys.map(replaceKey).filter(Boolean),
    },
  });
}

export function reconcilePublicProjection(draft: LayerConfigurationDraft): LayerConfigurationDraft {
  const publicKeys = new Set(draft.fields.filter((field) => field.public && !field.sensitive).map((field) => field.key));
  return {
    ...draft,
    popupConfig: {
      ...draft.popupConfig,
      titleField: publicKeys.has(draft.popupConfig.titleField) ? draft.popupConfig.titleField : "",
      subtitleField: publicKeys.has(draft.popupConfig.subtitleField) ? draft.popupConfig.subtitleField : "",
      fieldKeys: draft.popupConfig.fieldKeys.filter((key) => publicKeys.has(key)),
    },
  };
}

export function validateLayerConfiguration(draft: LayerConfigurationDraft): LayerConfigurationErrors {
  const errors: LayerConfigurationErrors = {};
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(draft.slug)) errors.slug = "Mã lớp dùng chữ thường, số và dấu gạch ngang.";
  if (!draft.title.trim()) errors.title = "Nhập tên lớp bằng tiếng Việt.";
  if (draft.allowedGeometryKinds.length === 0) errors.allowedGeometryKinds = "Chọn ít nhất một kiểu geometry.";
  const compatibleGeometryKinds = defaultAllowedGeometryKinds(draft.geometryMode);
  if (draft.geometryMode !== "mixed" && draft.allowedGeometryKinds.some((kind) => !compatibleGeometryKinds.includes(kind))) {
    errors.allowedGeometryKinds = "Kiểu geometry không phù hợp với chế độ lớp.";
  }
  if (draft.fields.length === 0) errors.fields = "Layer cần ít nhất một trường schema.";

  const seen = new Set<string>();
  draft.fields.forEach((field, index) => {
    const path = `fields.${field.clientId}`;
    if (!/^[a-z][a-z0-9_]{1,63}$/u.test(field.key)) errors[`${path}.key`] = `Trường ${index + 1}: key không hợp lệ.`;
    else if (seen.has(field.key)) errors[`${path}.key`] = `Key “${field.key}” bị trùng.`;
    seen.add(field.key);
    if (!field.label.trim()) errors[`${path}.label`] = `Trường ${index + 1}: nhập nhãn hiển thị.`;
    if (field.sensitive && field.offlineCache) errors[`${path}.offlineCache`] = "Field nhạy cảm không được lưu trong recovery cache.";
    if (field.sensitive && field.public) errors[`${path}.public`] = "Field nhạy cảm không được công khai.";
    if ((field.type === "enum" || field.type === "multi_enum") && field.options.filter((option) => option.trim()).length === 0) {
      errors[`${path}.options`] = "Enum cần ít nhất một lựa chọn.";
    }
  });

  const publicKeys = new Set(draft.fields.filter((field) => field.public && !field.sensitive).map((field) => field.key));
  if (!publicKeys.has(draft.popupConfig.titleField)) errors["popupConfig.titleField"] = "Tiêu đề popup phải là field công khai.";
  if (draft.popupConfig.subtitleField && !publicKeys.has(draft.popupConfig.subtitleField)) errors["popupConfig.subtitleField"] = "Phụ đề popup phải là field công khai.";
  const invalidPopupKey = draft.popupConfig.fieldKeys.find((key) => !publicKeys.has(key));
  if (invalidPopupKey) errors["popupConfig.fieldKeys"] = `Field “${invalidPopupKey}” không thể xuất hiện trong popup công khai.`;
  if (draft.renderConfig.minZoom < 0 || draft.renderConfig.maxZoom > 24 || draft.renderConfig.minZoom >= draft.renderConfig.maxZoom) {
    errors.renderZoom = "Zoom tối thiểu phải nhỏ hơn zoom tối đa trong khoảng 0-24.";
  }
  const colors = [draft.style.pointColor, draft.style.lineColor, draft.style.polygonFillColor, draft.style.polygonStrokeColor];
  if (colors.some((color) => !/^#[0-9A-F]{6}$/iu.test(color))) errors.styleColor = "Màu style phải dùng mã hex 6 ký tự.";
  return errors;
}

export function hasConfigurationImpact(original: LayerConfigurationDraft, next: LayerConfigurationDraft) {
  const originalFields = new Map(original.fields.map((field) => [field.serverId ?? field.clientId, field]));
  return next.geometryMode !== original.geometryMode
    || next.allowedGeometryKinds.join("|") !== original.allowedGeometryKinds.join("|")
    || original.fields.some((field) => !next.fields.some((candidate) => (candidate.serverId ?? candidate.clientId) === (field.serverId ?? field.clientId)))
    || next.fields.some((field) => {
      const before = originalFields.get(field.serverId ?? field.clientId);
      return before ? before.type !== field.type || before.public !== field.public || before.key !== field.key : false;
    });
}
