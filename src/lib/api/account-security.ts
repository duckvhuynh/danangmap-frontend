import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { operations } from "@/lib/api/generated/schema";
import {
  AccountSecurityError,
  type ChangePasswordInput,
  type PasswordChangeResult,
  type PasswordResetInput,
  type PasswordResetRequestResult,
  type PasswordResetResult,
  type SessionRevocationResult,
} from "@/lib/auth/account-security-model";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type SecurityPrincipal = operations["getCurrentUser"]["responses"][200]["content"]["application/json"]["data"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const demoMode = () =>
  process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true" &&
  process.env.NEXT_PUBLIC_DANANGMAP_AUTH_E2E_MODE !== "true";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", `Phản hồi bảo mật thiếu trường ${field}.`);
  }
  return value;
}

function requiredCount(value: unknown, field: string) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", `Phản hồi bảo mật thiếu trường ${field}.`);
  }
  return value;
}

function unwrapEnvelope(value: unknown) {
  if (!isRecord(value) || !("data" in value)) {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", "Phản hồi bảo mật không đúng định dạng envelope.");
  }
  return value.data;
}

function retryAfterSeconds(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt)
    ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000))
    : undefined;
}

function problem(error: unknown, response: Response) {
  const body = isRecord(error) ? error : {};
  const status = typeof body.status === "number" ? body.status : response.status;
  const code = typeof body.code === "string" ? body.code : `HTTP_${status}`;
  const message =
    typeof body.message === "string"
      ? body.message
      : status >= 500
        ? "Dịch vụ bảo mật tạm thời không khả dụng."
        : "Yêu cầu bảo mật không thể xử lý.";
  const requestId =
    typeof body.requestId === "string"
      ? body.requestId
      : response.headers.get("x-request-id") ?? undefined;
  return new AccountSecurityError(
    status,
    code,
    message,
    requestId,
    retryAfterSeconds(response),
  );
}

function resultData(result: { data?: unknown; error?: unknown; response: Response }) {
  if (!result.response.ok || result.error !== undefined) throw problem(result.error, result.response);
  return result.data;
}

function networkError(error: unknown, ambiguous = false) {
  if (error instanceof AccountSecurityError) return error;
  return new AccountSecurityError(
    0,
    ambiguous ? "NETWORK_AMBIGUOUS" : "NETWORK_ERROR",
    ambiguous
      ? "Không xác định được máy chủ đã xử lý yêu cầu hay chưa."
      : "Không thể kết nối dịch vụ bảo mật.",
    undefined,
    undefined,
    ambiguous,
  );
}

async function acquireCsrfToken(client: ApiClient) {
  try {
    const result = await client.GET("/api/v1/auth/csrf");
    const data = unwrapEnvelope(resultData(result));
    if (!isRecord(data)) {
      throw new AccountSecurityError(502, "CONTRACT_INVALID", "CSRF response không hợp lệ.");
    }
    return requiredString(data.csrfToken, "csrfToken");
  } catch (error) {
    throw networkError(error);
  }
}

function decodePrincipal(value: unknown): SecurityPrincipal {
  if (!isRecord(value)) {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", "Principal bảo mật không đúng hợp đồng.");
  }
  const principal = value;
  const role = principal.role;
  const status = principal.status;
  if (
    (role !== "editor" && role !== "reviewer" && role !== "publisher" && role !== "system_admin") ||
    (status !== "active" && status !== "inactive" && status !== "disabled" && status !== "invited") ||
    typeof principal.mfaEnabled !== "boolean" ||
    typeof principal.mustChangePassword !== "boolean"
  ) {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", "Principal sau đổi mật khẩu không hợp lệ.");
  }
  return {
    id: requiredString(principal.id, "principal.id"),
    email: requiredString(principal.email, "principal.email"),
    username: requiredString(principal.username, "principal.username"),
    displayName: requiredString(principal.displayName, "principal.displayName"),
    role,
    status,
    mfaEnabled: principal.mfaEnabled,
    mustChangePassword: principal.mustChangePassword,
  };
}

function decodePasswordChange(value: unknown): PasswordChangeResult {
  const data = unwrapEnvelope(value);
  if (
    !isRecord(data) ||
    data.status !== "password_changed" ||
    data.sessionRotated !== true
  ) {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", "Phản hồi đổi mật khẩu không đúng hợp đồng.");
  }
  return {
    status: "password_changed",
    sessionsRevoked: requiredCount(data.sessionsRevoked, "sessionsRevoked"),
    sessionRotated: true,
    principal: decodePrincipal(data.principal),
  };
}

function decodeResetRequest(value: unknown): PasswordResetRequestResult {
  const data = unwrapEnvelope(value);
  if (!isRecord(data) || data.status !== "accepted") {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", "Phản hồi yêu cầu đặt lại không đúng hợp đồng.");
  }
  return { status: "accepted" };
}

function decodeReset(value: unknown): PasswordResetResult {
  const data = unwrapEnvelope(value);
  if (!isRecord(data) || data.status !== "password_reset" || data.loginRequired !== true) {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", "Phản hồi đặt lại mật khẩu không đúng hợp đồng.");
  }
  return {
    status: "password_reset",
    loginRequired: true,
    sessionsRevoked: requiredCount(data.sessionsRevoked, "sessionsRevoked"),
  };
}

function decodeRevocation(value: unknown): SessionRevocationResult {
  const data = unwrapEnvelope(value);
  if (
    !isRecord(data) ||
    data.status !== "sessions_revoked" ||
    data.currentSessionRevoked !== true ||
    data.loginRequired !== true
  ) {
    throw new AccountSecurityError(502, "CONTRACT_INVALID", "Phản hồi thu hồi phiên không đúng hợp đồng.");
  }
  return {
    status: "sessions_revoked",
    revokedCount: requiredCount(data.revokedCount, "revokedCount"),
    currentSessionRevoked: true,
    loginRequired: true,
  };
}

export async function changePassword(
  input: ChangePasswordInput,
  idempotencyKey: string,
  client: ApiClient = apiClient,
): Promise<PasswordChangeResult> {
  if (demoMode()) {
    return {
      status: "password_changed",
      sessionsRevoked: 1,
      sessionRotated: true,
      principal: {
        id: "demo-editor",
        email: "editor@demo.danangmap.local",
        username: "editor",
        displayName: "Demo Editor",
        role: "editor",
        status: "active",
        mfaEnabled: true,
        mustChangePassword: false,
      },
    };
  }
  const csrfToken = await acquireCsrfToken(client);
  try {
    const result = await client.POST("/api/v1/auth/password/change", {
      params: {
        header: {
          "X-CSRF-Token": csrfToken,
          "Idempotency-Key": idempotencyKey,
        },
      },
      body: input,
    });
    return decodePasswordChange(resultData(result));
  } catch (error) {
    throw networkError(error, !(error instanceof AccountSecurityError));
  }
}

export async function getPasswordChangePrincipal(
  client: ApiClient = apiClient,
): Promise<SecurityPrincipal> {
  if (demoMode()) {
    return {
      id: "demo-editor",
      email: "editor@demo.danangmap.local",
      username: "editor",
      displayName: "Demo Editor",
      role: "editor",
      status: "active",
      mfaEnabled: true,
      mustChangePassword: true,
    };
  }
  try {
    const result = await client.GET("/api/v1/auth/me");
    return decodePrincipal(unwrapEnvelope(resultData(result)));
  } catch (error) {
    throw networkError(error);
  }
}

export async function requestPasswordReset(
  email: string,
  idempotencyKey: string,
  client: ApiClient = apiClient,
): Promise<PasswordResetRequestResult> {
  if (demoMode()) return { status: "accepted" };
  try {
    const result = await client.POST("/api/v1/auth/password/reset:request", {
      params: { header: { "Idempotency-Key": idempotencyKey } },
      body: { email },
    });
    return decodeResetRequest(resultData(result));
  } catch (error) {
    throw networkError(error, !(error instanceof AccountSecurityError));
  }
}

export async function confirmPasswordReset(
  input: PasswordResetInput,
  client: ApiClient = apiClient,
): Promise<PasswordResetResult> {
  if (demoMode()) return { status: "password_reset", loginRequired: true, sessionsRevoked: 1 };
  const csrfToken = await acquireCsrfToken(client);
  try {
    const result = await client.POST("/api/v1/auth/password/reset:confirm", {
      params: { header: { "X-CSRF-Token": csrfToken } },
      body: input,
    });
    return decodeReset(resultData(result));
  } catch (error) {
    throw networkError(error, !(error instanceof AccountSecurityError));
  }
}

export async function revokeAllSessions(
  idempotencyKey: string,
  client: ApiClient = apiClient,
): Promise<SessionRevocationResult> {
  if (demoMode()) {
    return { status: "sessions_revoked", revokedCount: 1, currentSessionRevoked: true, loginRequired: true };
  }
  const csrfToken = await acquireCsrfToken(client);
  try {
    const result = await client.POST("/api/v1/auth/sessions:revoke-all", {
      params: {
        header: {
          "X-CSRF-Token": csrfToken,
          "Idempotency-Key": idempotencyKey,
        },
      },
    });
    return decodeRevocation(resultData(result));
  } catch (error) {
    throw networkError(error, !(error instanceof AccountSecurityError));
  }
}
