/** Presentation labels only. API values and authorization checks remain unchanged. */
const roles: Record<string, string> = {
  system_admin: "Quản trị hệ thống", editor: "Biên tập viên",
  reviewer: "Người kiểm duyệt", publisher: "Người công bố",
};
const geometries: Record<string, string> = {
  point: "Điểm", Point: "Điểm", multipoint: "Cụm điểm", MultiPoint: "Cụm điểm",
  circle: "Hình tròn", Circle: "Hình tròn",
  line: "Đường", polyline: "Đường", LineString: "Đường", multiline: "Nhiều đoạn đường", MultiLineString: "Nhiều đoạn đường",
  polygon: "Vùng", Polygon: "Vùng", multipolygon: "Nhiều vùng", MultiPolygon: "Nhiều vùng",
  mixed: "Kết hợp",
};
const statuses: Record<string, string> = {
  draft: "Bản nháp", in_review: "Đang chờ duyệt", changes_requested: "Cần chỉnh sửa",
  approved: "Đã duyệt", publishing: "Đang công bố", published: "Đã công bố",
  building: "Đang xử lý", failed: "Không thành công",
};
export function adminRoleLabel(value: string | null) {
  return value ? roles[value] ?? "Người dùng nội bộ" : "Hệ thống";
}
export function geometryLabel(value: string) {
  return geometries[value] ?? "Chưa xác định";
}
export function revisionStatusLabel(value: string) {
  return statuses[value] ?? "Chưa xác định";
}
