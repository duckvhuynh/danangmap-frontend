const statusLabels: Record<string, string> = {
  draft: "Bản nháp",
  in_review: "Đang chờ duyệt",
  changes_requested: "Cần chỉnh sửa",
  approved: "Đã duyệt",
  publishing: "Đang công bố",
  published: "Đã công bố",
  building: "Đang xử lý",
  failed: "Thất bại",
};

const roleLabels: Record<string, string> = {
  editor: "Editor",
  reviewer: "Reviewer",
  publisher: "Publisher",
  system_admin: "System Admin",
};

export function historyStatusLabel(value: string) {
  return statusLabels[value] ?? value;
}

export function historyRoleLabel(value: string | null) {
  return value ? roleLabels[value] ?? value : "Hệ thống";
}

export function historyDate(value: string | null) {
  if (!value) return "Chưa có";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function compactIdentifier(value: string) {
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}
