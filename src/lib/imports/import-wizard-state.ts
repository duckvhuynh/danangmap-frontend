export const MAX_IMPORT_BYTES = 26_214_400;

export type ImportFormat = "csv" | "xlsx" | "geojson" | "kml";
export type ImportMode = "append" | "replace" | "upsert";
export type ImportMatchBy = "feature_id" | "external_identity";
export type ImportGeometryKind = "coordinates" | "wkt" | "geojson" | "kml_geometry";
export type ImportCsvEncoding = "utf8" | "utf16le" | "windows1258" | "latin1";
export type ImportCsvDelimiter = "comma" | "semicolon" | "tab" | "pipe";

export interface ImportFileMetadata {
  name: string;
  size: number;
  type: string;
  format: ImportFormat;
}

export interface ImportFieldMapping {
  id: string;
  source: string;
  target: string;
}

export interface ImportMappingDraft {
  sheet: string;
  csvEncoding: ImportCsvEncoding;
  csvDelimiter: ImportCsvDelimiter;
  sourceCrs: "EPSG:4326";
  geometryKind: ImportGeometryKind;
  longitudeColumn: string;
  latitudeColumn: string;
  geometryColumn: string;
  fields: ImportFieldMapping[];
  matchBy: ImportMatchBy;
}

export function inferImportFormat(fileName: string): ImportFormat | null {
  const extension = fileName.trim().toLocaleLowerCase().split(".").pop();
  if (extension === "csv" || extension === "xlsx" || extension === "kml") return extension;
  if (extension === "geojson" || extension === "json") return "geojson";
  return null;
}

export function validateImportFile(file: Pick<File, "name" | "size">): string | null {
  if (file.size === 0) return "File trống, không có dữ liệu để nhập.";
  if (file.size > MAX_IMPORT_BYTES) return "File vượt giới hạn 25 MiB (26.214.400 byte).";
  if (!inferImportFormat(file.name)) return "Chỉ hỗ trợ CSV, XLSX, GeoJSON/JSON và KML.";
  return null;
}

export function validateImportMapping(mapping: ImportMappingDraft, mode: ImportMode, format: ImportFormat): string[] {
  const errors: string[] = [];
  if (format === "xlsx" && !mapping.sheet.trim()) errors.push("Chọn đúng một sheet XLSX.");
  const expectedKinds: Record<ImportFormat, ImportGeometryKind[]> = {
    csv: ["coordinates", "wkt"],
    xlsx: ["coordinates", "wkt"],
    geojson: ["geojson"],
    kml: ["kml_geometry"],
  };
  if (!expectedKinds[format].includes(mapping.geometryKind)) errors.push("Kiểu geometry không phù hợp với định dạng file.");
  if (mapping.geometryKind === "coordinates" && (!mapping.longitudeColumn.trim() || !mapping.latitudeColumn.trim())) errors.push("Map đủ cột kinh độ và vĩ độ.");
  if (mapping.geometryKind === "wkt" && !mapping.geometryColumn.trim()) errors.push("Chọn cột chứa geometry WKT.");
  const completed = mapping.fields.filter((field) => field.source.trim() && field.target.trim());
  const duplicates = completed.map((field) => field.target).filter((target, index, all) => all.indexOf(target) !== index);
  if (duplicates.length) errors.push("Một trường đích không thể được map từ nhiều cột nguồn.");
  if (mode === "upsert" && mapping.matchBy === "feature_id" && !completed.some((field) => field.target === "feature_id")) errors.push("Upsert theo feature_id cần map cột nguồn vào feature_id.");
  if (mode === "upsert" && mapping.matchBy === "external_identity" && (!completed.some((field) => field.target === "external_source") || !completed.some((field) => field.target === "external_id"))) errors.push("External identity cần map cả external_source và external_id.");
  return errors;
}

export function canApplyImport(counts: { invalid?: number }, canApplyWithSkipInvalid: boolean, skipInvalid: boolean) {
  const invalid = counts.invalid ?? 0;
  return invalid === 0 || (skipInvalid && canApplyWithSkipInvalid);
}

export function replaceConfirmationValid(mode: ImportMode, confirmation: string) {
  return mode !== "replace" || confirmation.trim().toLocaleUpperCase("vi") === "THAY THẾ";
}

export function shouldPollImport(status: string) {
  return ["uploaded", "inspecting", "validating", "applying"].includes(status);
}

export function importStatusLabel(status: string) {
  return ({ uploaded: "Đã tải lên", inspecting: "Đang kiểm tra file", mapping_required: "Đang chờ ánh xạ", validating: "Đang kiểm tra dữ liệu", ready: "Sẵn sàng áp dụng", applying: "Đang áp dụng", completed: "Hoàn tất", failed: "Thất bại", cancelled: "Đã hủy" } as Record<string, string>)[status] ?? status;
}
