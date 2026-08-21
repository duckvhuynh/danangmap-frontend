import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";

type ApiClient = ReturnType<typeof createDanangMapClient>;

export interface LoginResult {
  status: "mfa_required";
  mfaEnrollmentRequired: boolean;
  challengeExpiresAt: string;
}

export type MfaMethod = "totp" | "recovery_code";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function unwrapEnvelope(value: unknown) {
  if (!isRecord(value) || !isRecord(value.data)) throw new Error("Phản hồi xác thực không đúng định dạng.");
  return value.data;
}

function decodeLogin(value: unknown): LoginResult {
  const data = unwrapEnvelope(value);
  if (data.status !== "mfa_required" || typeof data.mfaEnrollmentRequired !== "boolean" || typeof data.challengeExpiresAt !== "string") {
    throw new Error("Phản hồi đăng nhập không đúng hợp đồng.");
  }
  return { status: data.status, mfaEnrollmentRequired: data.mfaEnrollmentRequired, challengeExpiresAt: data.challengeExpiresAt };
}

export async function login(login: string, password: string, client: ApiClient = apiClient): Promise<LoginResult> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    return { status: "mfa_required", mfaEnrollmentRequired: false, challengeExpiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  }
  const result = await client.POST("/api/v1/auth/login", { body: { login, password } });
  if (!result.response.ok || result.error) throw new Error("Tên đăng nhập hoặc mật khẩu không đúng.");
  return decodeLogin(result.data);
}

export async function verifyMfa(method: MfaMethod, code: string, client: ApiClient = apiClient): Promise<Record<string, unknown>> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return { id: "demo-admin", role: "system_admin" };
  const result = await client.POST("/api/v1/auth/mfa/verify", { body: { method, code } });
  if (!result.response.ok || result.error) throw new Error("Mã xác thực không hợp lệ hoặc đã hết hạn.");
  return unwrapEnvelope(result.data);
}
