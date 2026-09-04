import { adminRoleLabel, revisionStatusLabel } from "@/lib/admin/labels";

export function historyStatusLabel(value: string) {
  return revisionStatusLabel(value);
}

export function historyRoleLabel(value: string | null) {
  return adminRoleLabel(value);
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
