import type { AdminUser, CreateAdminInviteInput, CreateAdminUserInput } from "@/lib/api/users";

export const adminUserRoles = ["editor", "reviewer", "publisher", "system_admin"] as const satisfies readonly AdminUser["role"][];

export const adminUserRoleLabels: Record<AdminUser["role"], string> = {
  editor: "Biên tập viên",
  reviewer: "Kiểm duyệt viên",
  publisher: "Xuất bản viên",
  system_admin: "Quản trị hệ thống",
};

export const adminUserStatusLabels: Record<AdminUser["status"], string> = {
  active: "Đang hoạt động",
  inactive: "Chưa hoạt động",
  disabled: "Đã vô hiệu hóa",
  invited: "Đã mời",
};

export type AccountCreationMode = "manual" | "invite";

export interface AdminUserFormValues {
  email: string;
  username: string;
  displayName: string;
  role: AdminUser["role"];
  temporaryPassword: string;
  expiresInHours: string;
}

export type AdminUserFormErrors = Partial<Record<keyof AdminUserFormValues, string>>;

export const initialAdminUserForm: AdminUserFormValues = {
  email: "",
  username: "",
  displayName: "",
  role: "editor",
  temporaryPassword: "",
  expiresInHours: "72",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const usernamePattern = /^[a-z][a-z0-9._-]{2,63}$/;

export function validateAdminUserForm(mode: AccountCreationMode, values: AdminUserFormValues): AdminUserFormErrors {
  const errors: AdminUserFormErrors = {};
  const email = values.email.trim();
  const username = values.username.trim();
  const displayName = values.displayName.trim();

  if (!emailPattern.test(email)) errors.email = "Nhập địa chỉ email hợp lệ.";
  if (!usernamePattern.test(username)) errors.username = "Tên đăng nhập gồm 3–64 ký tự, bắt đầu bằng chữ thường và chỉ dùng a–z, 0–9, dấu chấm, gạch dưới hoặc gạch ngang.";
  if (displayName.length < 2 || displayName.length > 200) errors.displayName = "Tên hiển thị cần từ 2 đến 200 ký tự.";

  if (mode === "manual" && values.temporaryPassword.length < 12) {
    errors.temporaryPassword = "Mật khẩu tạm thời cần ít nhất 12 ký tự.";
  }

  if (mode === "invite") {
    const expiresInHours = Number(values.expiresInHours);
    if (!Number.isInteger(expiresInHours) || expiresInHours < 1 || expiresInHours > 168) {
      errors.expiresInHours = "Thời hạn lời mời cần từ 1 đến 168 giờ.";
    }
  }

  return errors;
}

export function toCreateUserInput(values: AdminUserFormValues): CreateAdminUserInput {
  return {
    email: values.email.trim(),
    username: values.username.trim(),
    displayName: values.displayName.trim(),
    role: values.role,
    delivery: "manual",
    temporaryPassword: values.temporaryPassword,
  };
}

export function toCreateInviteInput(values: AdminUserFormValues): CreateAdminInviteInput {
  return {
    email: values.email.trim(),
    username: values.username.trim(),
    displayName: values.displayName.trim(),
    role: values.role,
    expiresInHours: Number(values.expiresInHours),
  };
}

export function filterAdminUsers(users: AdminUser[], query: string) {
  const normalized = query.trim().toLocaleLowerCase("vi");
  if (!normalized) return users;
  return users.filter((user) => [user.displayName, user.email, user.username, adminUserRoleLabels[user.role]].some((value) => value.toLocaleLowerCase("vi").includes(normalized)));
}
