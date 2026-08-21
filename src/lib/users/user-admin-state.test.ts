import { describe, expect, it } from "vitest";
import { filterAdminUsers, initialAdminUserForm, toCreateInviteInput, toCreateUserInput, validateAdminUserForm } from "@/lib/users/user-admin-state";

const valid = { ...initialAdminUserForm, email: "editor@danang.gov.vn", username: "editor01", displayName: "Biên tập viên 01", temporaryPassword: "Temporary-123" };

describe("System Admin user form state", () => {
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
    const users = [{ id: "1", email: valid.email, username: valid.username, displayName: valid.displayName, role: "editor" as const, status: "active" as const, mfaEnabled: true, mustChangePassword: false }];
    expect(filterAdminUsers(users, "biên tập")).toEqual(users);
    expect(filterAdminUsers(users, "không có")).toEqual([]);
  });
});
