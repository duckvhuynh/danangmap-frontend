import { assertAdminResult, type MutationAuth } from "@/lib/api/admin";
import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type ListUsersEnvelope = operations["listUsers"]["responses"][200]["content"]["application/json"];
type CreateUserEnvelope = operations["createUser"]["responses"][201]["content"]["application/json"];
type CreateInviteEnvelope = operations["createInvite"]["responses"][202]["content"]["application/json"];

export type AdminUser = ListUsersEnvelope["data"][number];
export type AdminUserPage = ListUsersEnvelope;
export type CreateAdminUserInput = components["schemas"]["CreateUserDto"];
export type CreateAdminInviteInput = components["schemas"]["CreateInviteDto"];
export type CreateAdminUserResult = CreateUserEnvelope["data"];
export type CreateAdminInviteResult = CreateInviteEnvelope["data"];

export async function listUsers(signal?: AbortSignal, client: ApiClient = apiClient): Promise<AdminUserPage> {
  const result = await client.GET("/api/v1/admin/users", { signal });
  return assertAdminResult(result);
}

export async function createUser(
  input: CreateAdminUserInput,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
): Promise<CreateAdminUserResult> {
  const result = await client.POST("/api/v1/admin/users", {
    params: { header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } },
    body: input,
  });
  return assertAdminResult(result).data;
}

export async function createInvite(
  input: CreateAdminInviteInput,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
): Promise<CreateAdminInviteResult> {
  const result = await client.POST("/api/v1/admin/invites", {
    params: { header: { "X-CSRF-Token": auth.csrfToken, "Idempotency-Key": operationKey } },
    body: input,
  });
  return assertAdminResult(result).data;
}
