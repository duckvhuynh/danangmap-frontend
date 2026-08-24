import type { AdminRole } from "@/lib/api/admin";

export function canAuthorContent(role: AdminRole) {
  return role === "editor" || role === "system_admin";
}

export function canReviewContent(role: AdminRole) {
  return role === "reviewer" || role === "system_admin";
}

export function canPublishContent(role: AdminRole) {
  return role === "publisher" || role === "system_admin";
}
