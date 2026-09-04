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
  lockVersion: number;
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
  revisionEtag: string | null;
  layerEtag: string | null;
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
    pointStrokeColor: string;
    pointStrokeWidth: number;
    pointCluster: boolean;
    lineColor: string;
    lineWidth: number;
    lineOpacity: number;
    polygonFillColor: string;
    polygonFillOpacity: number;
    polygonStrokeColor: string;
    polygonStrokeWidth: number;
  };
  renderConfig: {
    minZoom: number;
    maxZoom: number;
    cluster: boolean;
    sourcePolicy: "auto" | "geojson" | "mvt" | "hybrid";
  };
  popupConfig: {
    titleField: string;
    subtitleField: string;
    fieldKeys: string[];
    showCoordinates: boolean;
  };
}

export type LayerConfigurationErrors = Record<string, string>;

export interface LayerConfigurationCreateContext {
  operationKey: string;
}

export interface LayerConfigurationVersionedContext {
  etag: string;
  operationKey: string;
}

export interface LayerConfigurationImpactContext {
  etag: string;
}

export interface LayerConfigurationImpactReason {
  code: "GEOMETRY_KIND_IN_USE" | "FIELD_REMOVAL_WITH_DATA" | "FIELD_CONSTRAINT_CHANGE_WITH_DATA" | "REQUIRED_FIELD_MISSING";
  fieldKey: string | null;
  geometryKind: string | null;
  affectedFeatures: number;
}

export interface LayerConfigurationImpact {
  featureCount: number;
  blocking: boolean;
  schemaVersionWillIncrement: boolean;
  reasons: LayerConfigurationImpactReason[];
}

export interface LayerConfigurationSaveResult {
  configuration: LayerConfigurationDraft;
  revisionEtag: string | null;
  layerEtag: string | null;
  impact?: LayerConfigurationImpact;
}

export interface LayerConfigurationActions {
  create?(configuration: LayerConfigurationDraft, context: LayerConfigurationCreateContext): Promise<LayerConfigurationSaveResult>;
  previewImpact?(configuration: LayerConfigurationDraft, context: LayerConfigurationImpactContext): Promise<LayerConfigurationImpact>;
  replaceRevision?(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext): Promise<LayerConfigurationSaveResult>;
  updateCatalog?(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext): Promise<LayerConfigurationSaveResult>;
  archive?(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext): Promise<LayerConfigurationSaveResult>;
  unarchive?(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext): Promise<LayerConfigurationSaveResult>;
  createSuccessor?(configuration: LayerConfigurationDraft, context: LayerConfigurationVersionedContext): Promise<LayerConfigurationSaveResult>;
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
    revisionEtag: null,
    layerEtag: null,
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
      pointStrokeColor: "#FFFFFF",
      pointStrokeWidth: 1,
      pointCluster: false,
      lineColor: "#1A73E8",
      lineWidth: 3,
      lineOpacity: 1,
      polygonFillColor: "#EAF3FF",
      polygonFillOpacity: 0.35,
      polygonStrokeColor: "#1A73E8",
      polygonStrokeWidth: 2,
    },
    renderConfig: { minZoom: 8, maxZoom: 18, cluster: false, sourcePolicy: "auto" },
    popupConfig: { titleField: "name", subtitleField: "", fieldKeys: ["name"], showCoordinates: false },
  };
}

export function changeGeometryMode(draft: LayerConfigurationDraft, mode: LayerGeometryMode): LayerConfigurationDraft {
  return changeAllowedGeometryKinds({ ...draft, geometryMode: mode }, defaultAllowedGeometryKinds(mode));
}

export function changeAllowedGeometryKinds(draft: LayerConfigurationDraft, allowedGeometryKinds: LayerGeometryKind[]): LayerConfigurationDraft {
  const hasClusterablePoints = allowedGeometryKinds.some((kind) => kind === "point" || kind === "multipoint" || kind === "circle");
  return {
    ...draft,
    allowedGeometryKinds,
    style: hasClusterablePoints ? draft.style : { ...draft.style, pointCluster: false },
    renderConfig: hasClusterablePoints ? draft.renderConfig : { ...draft.renderConfig, cluster: false },
  };
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

export function slugifyLayerTitle(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/gu, "d")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function validateLayerConfiguration(draft: LayerConfigurationDraft): LayerConfigurationErrors {
  const errors: LayerConfigurationErrors = {};
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(draft.slug)) errors.slug = "Mã lớp dùng chữ thường, số và dấu gạch ngang.";
  if (!draft.title.trim()) errors.title = "Nhập tên lớp bằng tiếng Việt.";
  if (draft.allowedGeometryKinds.length === 0) errors.allowedGeometryKinds = "Chọn ít nhất một loại đối tượng.";
  const compatibleGeometryKinds = defaultAllowedGeometryKinds(draft.geometryMode);
  if (draft.geometryMode !== "mixed" && draft.allowedGeometryKinds.some((kind) => !compatibleGeometryKinds.includes(kind))) {
    errors.allowedGeometryKinds = "Loại đối tượng không phù hợp với loại lớp đã chọn.";
  }
  if (draft.fields.length === 0) errors.fields = "Lớp cần ít nhất một trường dữ liệu.";

  const seen = new Set<string>();
  draft.fields.forEach((field, index) => {
    const path = `fields.${field.clientId}`;
    if (!/^[a-z][a-z0-9_]{1,63}$/u.test(field.key)) errors[`${path}.key`] = `Trường ${index + 1}: mã trường cần bắt đầu bằng chữ thường không dấu, dài 2–64 ký tự, chỉ gồm chữ, số hoặc dấu gạch dưới.`;
    else if (seen.has(field.key)) errors[`${path}.key`] = `Mã trường “${field.key}” bị trùng. Hãy chọn mã khác.`;
    seen.add(field.key);
    if (!field.label.trim()) errors[`${path}.label`] = `Trường ${index + 1}: nhập tên hiển thị.`;
    if (field.sensitive && field.offlineCache) errors[`${path}.offlineCache`] = "Thông tin nhạy cảm không được lưu nháp trên thiết bị.";
    if (field.sensitive && field.public) errors[`${path}.public`] = "Thông tin nhạy cảm không được công khai.";
    if ((field.type === "enum" || field.type === "multi_enum") && field.options.filter((option) => option.trim()).length === 0) {
      errors[`${path}.options`] = "Thêm ít nhất một lựa chọn.";
    }
  });

  const publicKeys = new Set(draft.fields.filter((field) => field.public && !field.sensitive).map((field) => field.key));
  if (!publicKeys.has(draft.popupConfig.titleField)) errors["popupConfig.titleField"] = "Chọn một trường công khai làm tiêu đề bảng chi tiết.";
  if (draft.popupConfig.subtitleField && !publicKeys.has(draft.popupConfig.subtitleField)) errors["popupConfig.subtitleField"] = "Chọn một trường công khai làm phụ đề bảng chi tiết.";
  const invalidPopupKey = draft.popupConfig.fieldKeys.find((key) => !publicKeys.has(key));
  if (invalidPopupKey) errors["popupConfig.fieldKeys"] = "Bảng chi tiết chỉ được chứa các trường công khai.";
  if (draft.renderConfig.minZoom < 0 || draft.renderConfig.maxZoom > 24 || draft.renderConfig.minZoom >= draft.renderConfig.maxZoom) {
    errors.renderZoom = "Mức thu phóng tối thiểu phải nhỏ hơn mức tối đa, trong khoảng 0–24.";
  }
  const colors = [draft.style.pointColor, draft.style.pointStrokeColor, draft.style.lineColor, draft.style.polygonFillColor, draft.style.polygonStrokeColor];
  if (colors.some((color) => !/^#[0-9A-F]{6}$/iu.test(color))) errors.styleColor = "Chọn màu hợp lệ bằng ô chọn màu, hoặc nhập mã màu như #1A73E8.";
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

export function hasCatalogConfigurationChanges(original: LayerConfigurationDraft, next: LayerConfigurationDraft) {
  return original.groupId !== next.groupId
    || original.displayOrder !== next.displayOrder
    || original.defaultVisible !== next.defaultVisible;
}

export function hasRevisionConfigurationChanges(original: LayerConfigurationDraft, next: LayerConfigurationDraft) {
  const revisionShape = (value: LayerConfigurationDraft) => ({
    title: value.title,
    description: value.description,
    geometryMode: value.geometryMode,
    allowedGeometryKinds: value.allowedGeometryKinds,
    fields: value.fields,
    style: value.style,
    renderConfig: value.renderConfig,
    popupConfig: value.popupConfig,
  });
  return JSON.stringify(revisionShape(original)) !== JSON.stringify(revisionShape(next));
}
