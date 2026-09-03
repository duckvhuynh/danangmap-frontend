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
  if (file.size === 0) return "Tệp trống, không có dữ liệu để nhập.";
  if (file.size > MAX_IMPORT_BYTES) return "Tệp vượt giới hạn 25 MB. Hãy chia nhỏ dữ liệu rồi thử lại.";
  if (!inferImportFormat(file.name)) return "Chỉ hỗ trợ CSV, XLSX, GeoJSON/JSON và KML.";
  return null;
}

export function validateImportMapping(mapping: ImportMappingDraft, mode: ImportMode, format: ImportFormat): string[] {
  const errors: string[] = [];
  if (format === "xlsx" && !mapping.sheet.trim()) errors.push("Chọn một trang tính trong tệp Excel.");
  const expectedKinds: Record<ImportFormat, ImportGeometryKind[]> = {
    csv: ["coordinates", "wkt"],
    xlsx: ["coordinates", "wkt"],
    geojson: ["geojson"],
    kml: ["kml_geometry"],
  };
  if (!expectedKinds[format].includes(mapping.geometryKind)) errors.push("Cách đọc vị trí không phù hợp với định dạng tệp.");
  if (mapping.geometryKind === "coordinates" && (!mapping.longitudeColumn.trim() || !mapping.latitudeColumn.trim())) errors.push("Nhập tên cả cột kinh độ và cột vĩ độ.");
  if (mapping.geometryKind === "wkt" && !mapping.geometryColumn.trim()) errors.push("Nhập tên cột chứa hình dạng theo định dạng WKT.");
  const completed = mapping.fields.filter((field) => field.source.trim() && field.target.trim());
  const duplicates = completed.map((field) => field.target).filter((target, index, all) => all.indexOf(target) !== index);
  if (duplicates.length) errors.push("Mỗi trường chỉ được ghép với một cột trong tệp.");
  if (mode === "upsert" && mapping.matchBy === "feature_id" && !completed.some((field) => field.target === "feature_id")) errors.push("Để cập nhật theo mã đối tượng, hãy ghép một cột với trường Mã đối tượng.");
  if (mode === "upsert" && mapping.matchBy === "external_identity" && (!completed.some((field) => field.target === "external_source") || !completed.some((field) => field.target === "external_id"))) errors.push("Để cập nhật theo nguồn dữ liệu, hãy ghép đủ Tên nguồn dữ liệu và Mã tại nguồn dữ liệu.");
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
  return ({ uploaded: "Đã tải lên", inspecting: "Đang kiểm tra tệp", mapping_required: "Đang chờ ghép cột", validating: "Đang kiểm tra dữ liệu", ready: "Sẵn sàng áp dụng", applying: "Đang áp dụng", completed: "Hoàn tất", failed: "Thất bại", cancelled: "Đã hủy" } as Record<string, string>)[status] ?? "Đang xử lý";
}

const importIssueLabels: Record<string, string> = {
  GEOMETRY_INVALID: "Vị trí hoặc hình dạng không hợp lệ. Kiểm tra tọa độ và ranh giới.",
  GEOMETRY_TYPE_NOT_ALLOWED: "Loại đối tượng này chưa được cho phép trong cấu hình lớp.",
  GEOMETRY_KIND_NOT_ALLOWED: "Loại đối tượng này chưa được cho phép trong cấu hình lớp.",
  PHONE_NORMALIZED: "Số điện thoại đã được chuẩn hóa cách viết.",
  SCHEMA_VIOLATION: "Thông tin chưa đúng với các trường dữ liệu của lớp.",
  REQUIRED_FIELD_MISSING: "Thiếu thông tin bắt buộc.",
  FIELD_REQUIRED: "Thiếu thông tin bắt buộc.",
  IMPORT_COORDINATES_INVALID: "Kinh độ hoặc vĩ độ không hợp lệ.",
  IMPORT_DUPLICATE_EXTERNAL_IDENTITY: "Tên nguồn và mã đối tượng bị trùng trong tệp.",
  IMPORT_DUPLICATE_FEATURE_ID: "Mã đối tượng bị trùng trong tệp.",
  IMPORT_EXTERNAL_IDENTITY_EXISTS: "Đối tượng từ nguồn này đã tồn tại. Chọn cập nhật hoặc sửa mã.",
  IMPORT_EXTERNAL_IDENTITY_INCOMPLETE: "Thiếu tên nguồn hoặc mã tại nguồn dữ liệu.",
  IMPORT_EXTERNAL_IDENTITY_REQUIRED: "Cần có tên nguồn và mã tại nguồn để đối chiếu dữ liệu.",
  IMPORT_FEATURE_ID_REQUIRED: "Thiếu mã đối tượng dùng để cập nhật.",
  IMPORT_FEATURE_ID_INVALID: "Mã đối tượng không hợp lệ.",
  IMPORT_FEATURE_ID_DELETED: "Đối tượng cần cập nhật đã bị xóa.",
  IMPORT_FEATURE_ID_WRONG_LAYER: "Mã đối tượng thuộc một lớp dữ liệu khác.",
  IMPORT_FEATURE_VERTEX_LIMIT: "Một đối tượng có quá nhiều điểm vẽ. Hãy giảm độ chi tiết.",
  IMPORT_VERTEX_LIMIT: "Tệp có quá nhiều điểm vẽ. Hãy chia thành các tệp nhỏ hơn.",
  IMPORT_RECORD_LIMIT: "Tệp vượt quá 100.000 dòng. Hãy chia nhỏ dữ liệu.",
  IMPORT_COLUMN_LIMIT: "Tệp có quá nhiều cột. Hãy bỏ các cột không cần thiết.",
  IMPORT_PROPERTIES_TOO_LARGE: "Thông tin của đối tượng quá dài. Hãy rút gọn nội dung.",
  IMPORT_EXPANDED_SIZE_LIMIT: "Tệp quá lớn sau khi giải nén. Hãy chia nhỏ dữ liệu.",
  IMPORT_NO_VALID_ROWS: "Không có dòng hợp lệ để nhập. Kiểm tra và sửa tệp rồi thử lại.",
  IMPORT_HAS_ERRORS: "Tệp còn dòng lỗi. Sửa tệp hoặc chọn bỏ qua dòng lỗi nếu được phép.",
  IMPORT_ROW_INVALID: "Dòng dữ liệu chưa hợp lệ. Kiểm tra các giá trị trong dòng này.",
  IMPORT_MAPPING_INVALID: "Các cột chưa được ghép đúng. Kiểm tra lại trước khi tiếp tục.",
  IMPORT_FILE_TOO_LARGE: "Tệp vượt giới hạn 25 MB. Hãy chia nhỏ dữ liệu.",
  IMPORT_FORMAT_MISMATCH: "Nội dung tệp không khớp với định dạng đã chọn.",
  IMPORT_FORMAT_UNSUPPORTED: "Định dạng tệp chưa được hỗ trợ.",
  IMPORT_INSPECT_FAILED: "Không đọc được tệp. Kiểm tra định dạng và tải lại.",
  IMPORT_VALIDATE_FAILED: "Chưa kiểm tra được dữ liệu. Thử lại hoặc kiểm tra tệp nguồn.",
  IMPORT_APPLY_FAILED: "Chưa lưu được dữ liệu vào bản nháp. Kiểm tra thông báo và thử lại.",
  ETAG_MISMATCH: "Bản nháp đã có thay đổi mới. Mở lại bản nháp trước khi nhập.",
  REVISION_NOT_EDITABLE: "Phiên bản này không còn là bản nháp có thể chỉnh sửa.",
  CSV_INVALID: "Tệp CSV không hợp lệ. Kiểm tra bảng mã và dấu phân cách.",
  XLSX_INVALID: "Không đọc được tệp Excel. Kiểm tra và lưu lại tệp.",
  XLSX_SHEET_NOT_FOUND: "Không tìm thấy trang tính đã chọn.",
  XLSX_SHEET_LIMIT: "Tệp Excel có quá nhiều trang tính. Chỉ giữ các trang cần dùng.",
  GEOJSON_INVALID: "Tệp GeoJSON không hợp lệ. Kiểm tra vị trí và cấu trúc tệp.",
  GEOJSON_FEATURE_INVALID: "Đối tượng trong tệp GeoJSON không hợp lệ.",
  KML_INVALID: "Không đọc được dữ liệu trong tệp KML.",
  WKT_INVALID: "Hình dạng trong cột WKT không hợp lệ.",
};

export function importIssueLabel(code: string): string {
  return importIssueLabels[code] ?? "Dữ liệu chưa thể xử lý. Kiểm tra tệp nguồn hoặc liên hệ người quản trị.";
}
