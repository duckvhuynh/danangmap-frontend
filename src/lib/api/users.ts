import { assertAdminResult, type MutationAuth } from "@/lib/api/admin";
import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type ListUsersEnvelope = operations["listUsers"]["responses"][200]["content"]["application/json"];
type UserDetailEnvelope = operations["getAdminUser"]["responses"][200]["content"]["application/json"];
type ListInvitesEnvelope = operations["listAdminInvites"]["responses"][200]["content"]["application/json"];
type CreateUserEnvelope = operations["createUser"]["responses"][201]["content"]["application/json"];
type CreateInviteEnvelope = operations["createInvite"]["responses"][202]["content"]["application/json"];
type UpdateUserEnvelope = operations["updateAdminUser"]["responses"][200]["content"]["application/json"];
type ResendInviteEnvelope = operations["resendAdminInvite"]["responses"][202]["content"]["application/json"];
type RevokeInviteEnvelope = operations["revokeInvite"]["responses"][200]["content"]["application/json"];
type RevokeSessionEnvelope = operations["revokeAdminUserSession"]["responses"][200]["content"]["application/json"];
type ResetMfaEnvelope = operations["resetAdminUserMfa"]["responses"][200]["content"]["application/json"];
type PasswordResetEnvelope = operations["requestAdminUserPasswordReset"]["responses"][202]["content"]["application/json"];

export type AdminUser = ListUsersEnvelope["data"][number];
export type AdminUserPage = ListUsersEnvelope;
export type AdminUserDetail = UserDetailEnvelope["data"];
export type AdminUserFilters = NonNullable<operations["listUsers"]["parameters"]["query"]>;
export type AdminInvite = ListInvitesEnvelope["data"][number];
export type AdminInvitePage = ListInvitesEnvelope;
export type AdminInviteFilters = NonNullable<operations["listAdminInvites"]["parameters"]["query"]>;
export type CreateAdminUserInput = components["schemas"]["CreateUserDto"];
export type CreateAdminInviteInput = components["schemas"]["CreateInviteDto"];
export type UpdateAdminUserInput = components["schemas"]["UpdateUserDto"];
export type ResendAdminInviteInput = components["schemas"]["ResendInviteDto"];
export type CreateAdminUserResult = CreateUserEnvelope["data"];
export type CreateAdminInviteResult = CreateInviteEnvelope["data"];
export type AdminSessionMutationResult = RevokeSessionEnvelope["data"];
export type AdminMfaResetResult = ResetMfaEnvelope["data"];
export type AdminPasswordResetResult = PasswordResetEnvelope["data"];

export interface VersionedAdminUser {
  data: AdminUserDetail;
  etag: string;
}

function versionedUser(envelope: UserDetailEnvelope | UpdateUserEnvelope, response: Response): VersionedAdminUser {
  return { data: envelope.data, etag: response.headers.get("etag") ?? envelope.data.etag };
}

export async function listUsers(filters: AdminUserFilters = {}, signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminUserPage> {
  const result = await client.GET("/api/v1/admin/users", { params: { query: filters }, signal });
  return assertAdminResult(result);
}

export async function getAdminUser(userId: string, signal?: AbortSignal, client: ApiClient = apiClient): Promise<VersionedAdminUser> {
  const result = await client.GET("/api/v1/admin/users/{userId}", { params: { path: { userId } }, signal });
  return versionedUser(assertAdminResult(result), result.response);
}

export async function listAdminInvites(filters: AdminInviteFilters = {}, signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminInvitePage> {
  const result = await client.GET("/api/v1/admin/invites", { params: { query: filters }, signal });
  return assertAdminResult(result);
}

export async function createUser(input: CreateAdminUserInput, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<CreateAdminUserResult> {
  const result = await client.POST("/api/v1/admin/users", {
    params: { header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } }, body: input,
  });
  return assertAdminResult(result).data;
}

export async function createInvite(input: CreateAdminInviteInput, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<CreateAdminInviteResult> {
  const result = await client.POST("/api/v1/admin/invites", {
    params: { header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } }, body: input,
  });
  return assertAdminResult(result).data;
}

export async function updateAdminUser(userId: string, input: UpdateAdminUserInput, etag: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<VersionedAdminUser> {
  const result = await client.PATCH("/api/v1/admin/users/{userId}", {
    params: { path: { userId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } }, body: input,
  });
  return versionedUser(assertAdminResult(result), result.response);
}

export async function revokeInvite(inviteId: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<RevokeInviteEnvelope["data"]> {
  const result = await client.POST("/api/v1/admin/invites/{inviteId}:revoke", {
    params: { path: { inviteId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } },
  });
  return assertAdminResult(result).data;
}

export async function resendAdminInvite(inviteId: string, input: ResendAdminInviteInput, etag: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<ResendInviteEnvelope["data"]> {
  const result = await client.POST("/api/v1/admin/invites/{inviteId}:resend", {
    params: { path: { inviteId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } }, body: input,
  });
  return assertAdminResult(result).data;
}

async function userSecurityMutation<T>(request: () => Promise<{ data?: { data: T }; error?: unknown; response: Response }>): Promise<T> {
  return assertAdminResult(await request()).data;
}

export async function revokeAdminUserSession(userId: string, sessionId: string, reason: string, etag: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<AdminSessionMutationResult> {
  return userSecurityMutation(() => client.POST("/api/v1/admin/users/{userId}/sessions/{sessionId}:revoke", {
    params: { path: { userId, sessionId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } }, body: { reason },
  }));
}

export async function revokeAllAdminUserSessions(userId: string, reason: string, etag: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<AdminSessionMutationResult> {
  return userSecurityMutation(() => client.POST("/api/v1/admin/users/{userId}/sessions:revoke-all", {
    params: { path: { userId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } }, body: { reason },
  }));
}

export async function resetAdminUserMfa(userId: string, reason: string, etag: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<AdminMfaResetResult> {
  return userSecurityMutation(() => client.POST("/api/v1/admin/users/{userId}/mfa:reset", {
    params: { path: { userId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } }, body: { reason },
  }));
}

export async function requestAdminUserPasswordReset(userId: string, reason: string, etag: string, operationKey: string, auth: MutationAuth, client: ApiClient = apiClient): Promise<AdminPasswordResetResult> {
  return userSecurityMutation(() => client.POST("/api/v1/admin/users/{userId}/password-reset:request", {
    params: { path: { userId }, header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey, "If-Match": etag } }, body: { reason },
  }));
}
