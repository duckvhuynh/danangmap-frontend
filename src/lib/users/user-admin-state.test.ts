import { describe, expect, it } from "vitest";
import type { AdminUser } from "@/lib/api/users";
import { filterAdminUsers, initialAdminUserForm, toCreateInviteInput, toCreateUserInput, validateAdminUserForm, mailStatusLabel, securityStatusLabel, sessionDeviceLabel } from "@/lib/users/user-admin-state";

const valid = { ...initialAdminUserForm, email: "editor@danang.gov.vn", username: "editor01", displayName: "Biên tập viên 01", temporaryPassword: "Temporary-123" };

describe("System Admin user form state", () => {
  it("shows meaningful security and email states without exposing unknown raw values", () => {
    expect(mailStatusLabel("pending")).toBe("Chờ gửi");
    expect(mailStatusLabel("failed")).toBe("Gửi không thành công");
    expect(mailStatusLabel("INTERNAL_DETAIL")).toBe("Chưa có thông tin");
    expect(securityStatusLabel("revoked")).toBe("Đã thu hồi");
    expect(securityStatusLabel("INTERNAL_DETAIL")).toBe("Chưa có thông tin");
    expect(sessionDeviceLabel("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36 Edg/140.0")).toBe("Microsoft Edge trên Windows");
    expect(sessionDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Version/18.0 Mobile/15 Safari/604.1")).toBe("Safari trên iPhone/iPad");
    expect(sessionDeviceLabel(null)).toBe("Thiết bị chưa xác định");
  });

  it("matches the manual account constraints in OpenAPI", () => {
    expect(validateAdminUserForm("manual", valid)).toEqual({});
    expect(validateAdminUserForm("manual", { ...valid, username: "A", displayName: "A", temporaryPassword: "short" })).toMatchObject({ username: expect.any(String), displayName: expect.any(String), temporaryPassword: expect.any(String) });
    expect(toCreateUserInput({ ...valid, email: ` ${valid.email} ` })).toEqual({ email: valid.email, username: valid.username, displayName: valid.displayName, role: "editor", delivery: "manual", temporaryPassword: valid.temporaryPassword });
  });

  it("validates and serializes the invitation expiry range", () => {
    expect(validateAdminUserForm("invite", { ...valid, expiresInHours: "0" })).toHaveProperty("expiresInHours");
    expect(validateAdminUserForm("invite", { ...valid, expiresInHours: "168" })).toEqual({});
    expect(validateAdminUserForm("invite", { ...valid, expiresInHours: "169" })).toHaveProperty("expiresInHours");
    expect(toCreateInviteInput({ ...valid, role: "reviewer", expiresInHours: "72" })).toMatchObject({ role: "reviewer", expiresInHours: 72 });
  });

  it("filters only the already-loaded list by identity or localized role", () => {
    const users: AdminUser[] = [{
      id: "11111111-1111-4111-8111-111111111111",
      email: valid.email,
      username: valid.username,
      displayName: valid.displayName,
      role: "editor",
      status: "active",
      mfaEnabled: true,
      mustChangePassword: false,
      disabledAt: null,
      lockedUntil: null,
      lockVersion: 1,
      etag: '"user-v1"',
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-24T00:00:00.000Z",
      security: { activeSessionCount: 1, latestSessionCreatedAt: "2026-08-24T00:00:00.000Z", recoveryCodesRemaining: 8, pendingInviteCount: 0, pendingPasswordReset: false },
    }];
    expect(filterAdminUsers(users, "biên tập")).toEqual(users);
    expect(filterAdminUsers(users, "không có")).toEqual([]);
  });
});
