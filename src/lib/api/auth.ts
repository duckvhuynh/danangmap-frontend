import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { operations } from "@/lib/api/generated/schema";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type LoginContract = operations["login"]["responses"][200]["content"]["application/json"]["data"];
type PrincipalContract = operations["verifyMfa"]["responses"][200]["content"]["application/json"]["data"];
type EnrollmentContract = operations["startMfaEnrollment"]["responses"][200]["content"]["application/json"]["data"];
type ConfirmationContract = operations["confirmMfaEnrollment"]["responses"][200]["content"]["application/json"]["data"];

export type LoginResult = LoginContract;
export type AuthPrincipal = PrincipalContract;
export type MfaEnrollment = EnrollmentContract;
export type MfaEnrollmentConfirmation = ConfirmationContract;
export type MfaMethod = operations["verifyMfa"]["requestBody"]["content"]["application/json"]["method"];

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
    readonly ambiguous = false,
  ) {
    super(message);
    this.name = "AuthApiError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const demoMode = () => process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true" && process.env.NEXT_PUBLIC_DANANGMAP_AUTH_E2E_MODE !== "true";

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) throw new AuthApiError(502, "CONTRACT_INVALID", `Phản hồi xác thực thiếu trường ${field}.`);
  return value;
}

function unwrapEnvelope(value: unknown) {
  if (!isRecord(value) || !("data" in value)) throw new AuthApiError(502, "CONTRACT_INVALID", "Phản hồi xác thực không đúng định dạng envelope.");
  return value.data;
}

function retryAfterSeconds(response: Response) {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - Date.now()) / 1_000)) : undefined;
}

function problem(error: unknown, response: Response) {
  const body = isRecord(error) ? error : {};
  const status = typeof body.status === "number" ? body.status : response.status;
  const code = typeof body.code === "string" ? body.code : `HTTP_${status}`;
  const message = typeof body.message === "string" ? body.message : status >= 500 ? "Dịch vụ xác thực tạm thời không khả dụng." : "Yêu cầu xác thực không thể xử lý.";
  const requestId = typeof body.requestId === "string" ? body.requestId : response.headers.get("x-request-id") ?? undefined;
  return new AuthApiError(status, code, message, requestId, retryAfterSeconds(response));
}

function resultData(result: { data?: unknown; error?: unknown; response: Response }) {
  if (!result.response.ok || result.error !== undefined) throw problem(result.error, result.response);
  return result.data;
}

function networkError(error: unknown, ambiguous = false) {
  if (error instanceof AuthApiError) return error;
  return new AuthApiError(
    0,
    ambiguous ? "NETWORK_AMBIGUOUS" : "NETWORK_ERROR",
    ambiguous ? "Không xác định được máy chủ đã nhận yêu cầu hay chưa." : "Không thể kết nối dịch vụ xác thực.",
    undefined,
    undefined,
    ambiguous,
  );
}

function decodeLogin(value: unknown): LoginResult {
  const data = unwrapEnvelope(value);
  if (!isRecord(data)) {
    throw new AuthApiError(502, "CONTRACT_INVALID", "Phản hồi đăng nhập không đúng hợp đồng.");
  }
  if (data.status === "authenticated" && data.mfaEnrollmentRequired === false) {
    return { status: data.status, mfaEnrollmentRequired: false, principal: decodeAuthPrincipal(data.principal) };
  }
  if (data.status !== "mfa_required" || typeof data.mfaEnrollmentRequired !== "boolean") {
    throw new AuthApiError(502, "CONTRACT_INVALID", "Phản hồi đăng nhập không đúng hợp đồng.");
  }
  return { status: data.status, mfaEnrollmentRequired: data.mfaEnrollmentRequired, challengeExpiresAt: requiredString(data.challengeExpiresAt, "challengeExpiresAt") };
}

export function decodeAuthPrincipal(value: unknown): AuthPrincipal {
  if (!isRecord(value)) throw new AuthApiError(502, "CONTRACT_INVALID", "Principal không đúng định dạng.");
  const role = value.role;
  const status = value.status;
  if (role !== "editor" && role !== "reviewer" && role !== "publisher" && role !== "system_admin") throw new AuthApiError(502, "CONTRACT_INVALID", "Vai trò principal không hợp lệ.");
  if (status !== "active" && status !== "inactive" && status !== "disabled" && status !== "invited") throw new AuthApiError(502, "CONTRACT_INVALID", "Trạng thái principal không hợp lệ.");
  if (typeof value.mfaEnabled !== "boolean" || typeof value.mustChangePassword !== "boolean") throw new AuthApiError(502, "CONTRACT_INVALID", "Cờ bảo mật principal không hợp lệ.");
  return {
    id: requiredString(value.id, "principal.id"),
    email: requiredString(value.email, "principal.email"),
    username: requiredString(value.username, "principal.username"),
    displayName: requiredString(value.displayName, "principal.displayName"),
    role,
    status,
    mfaEnabled: value.mfaEnabled,
    mustChangePassword: value.mustChangePassword,
  };
}

async function csrfToken(client: ApiClient) {
  try {
    const result = await client.GET("/api/v1/auth/csrf");
    const data = unwrapEnvelope(resultData(result));
    if (!isRecord(data)) throw new AuthApiError(502, "CONTRACT_INVALID", "CSRF response không hợp lệ.");
    return requiredString(data.csrfToken, "csrfToken");
  } catch (error) {
    throw networkError(error);
  }
}

export async function login(loginValue: string, password: string, client: ApiClient = apiClient): Promise<LoginResult> {
  if (demoMode()) {
    return { status: "authenticated", mfaEnrollmentRequired: false, principal: { id: "demo-admin", email: "admin@demo.danangmap.local", username: "demo-admin", displayName: "Demo Admin", role: "system_admin", status: "active", mfaEnabled: false, mustChangePassword: false } };
  }
  const token = await csrfToken(client);
  try {
    const result = await client.POST("/api/v1/auth/login", {
      params: { header: { "X-CSRF-Token": token } },
      body: { login: loginValue, password },
    });
    return decodeLogin(resultData(result));
  } catch (error) {
    throw networkError(error, !(error instanceof AuthApiError));
  }
}

export async function verifyMfa(method: MfaMethod, code: string, client: ApiClient = apiClient): Promise<AuthPrincipal> {
  if (demoMode()) {
    return { id: "demo-admin", email: "admin@demo.danangmap.local", username: "demo-admin", displayName: "Demo Admin", role: "system_admin", status: "active", mfaEnabled: true, mustChangePassword: false };
  }
  const token = await csrfToken(client);
  try {
    const result = await client.POST("/api/v1/auth/mfa/verify", {
      params: { header: { "X-CSRF-Token": token } },
      body: { method, code },
    });
    return decodeAuthPrincipal(unwrapEnvelope(resultData(result)));
  } catch (error) {
    throw networkError(error, !(error instanceof AuthApiError));
  }
}

export async function startMfaEnrollment(client: ApiClient = apiClient): Promise<MfaEnrollment> {
  if (demoMode()) {
    return { status: "pending", enrollmentUri: "otpauth://totp/DanangMap%3Ademo%40danangmap.local?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=DanangMap" };
  }
  const token = await csrfToken(client);
  try {
    const result = await client.POST("/api/v1/auth/mfa/enroll", { params: { header: { "X-CSRF-Token": token } } });
    const data = unwrapEnvelope(resultData(result));
    if (!isRecord(data) || data.status !== "pending") throw new AuthApiError(502, "CONTRACT_INVALID", "Phản hồi đăng ký MFA không đúng hợp đồng.");
    return { status: data.status, enrollmentUri: requiredString(data.enrollmentUri, "enrollmentUri") };
  } catch (error) {
    throw networkError(error, !(error instanceof AuthApiError));
  }
}

export async function confirmMfaEnrollment(code: string, client: ApiClient = apiClient): Promise<MfaEnrollmentConfirmation> {
  if (demoMode()) {
    return {
      principal: { id: "demo-admin", email: "admin@demo.danangmap.local", username: "demo-admin", displayName: "Demo Admin", role: "system_admin", status: "active", mfaEnabled: true, mustChangePassword: false },
      recoveryCodes: Array.from({ length: 10 }, (_, index) => `ABCD-EF01-2345-6789-${String(index + 1).padStart(4, "0")}`),
    };
  }
  const token = await csrfToken(client);
  try {
    const result = await client.POST("/api/v1/auth/mfa/enroll/confirm", {
      params: { header: { "X-CSRF-Token": token } },
      body: { code },
    });
    const data = unwrapEnvelope(resultData(result));
    if (!isRecord(data) || !Array.isArray(data.recoveryCodes) || data.recoveryCodes.length !== 10 || data.recoveryCodes.some((item) => typeof item !== "string" || item.length === 0)) {
      throw new AuthApiError(502, "CONTRACT_INVALID", "Phản hồi xác nhận MFA không có đúng 10 mã khôi phục.");
    }
    return { principal: decodeAuthPrincipal(data.principal), recoveryCodes: data.recoveryCodes };
  } catch (error) {
    throw networkError(error, !(error instanceof AuthApiError));
  }
}

export interface ParsedEnrollmentUri {
  uri: string;
  secret: string;
  accountLabel: string;
  issuer: string | null;
}

export function parseEnrollmentUri(value: string): ParsedEnrollmentUri {
  let uri: URL;
  try {
    uri = new URL(value);
  } catch {
    throw new AuthApiError(502, "CONTRACT_INVALID", "URI đăng ký MFA không hợp lệ.");
  }
  const secret = uri.searchParams.get("secret");
  if (uri.protocol !== "otpauth:" || uri.hostname !== "totp" || !secret || !/^[A-Z2-7]{32}$/i.test(secret)) {
    throw new AuthApiError(502, "CONTRACT_INVALID", "URI đăng ký MFA không hợp lệ.");
  }
  let accountLabel: string;
  try {
    accountLabel = decodeURIComponent(uri.pathname.replace(/^\//, ""));
  } catch {
    throw new AuthApiError(502, "CONTRACT_INVALID", "Nhãn tài khoản trong URI đăng ký MFA không hợp lệ.");
  }
  return { uri: value, secret, accountLabel, issuer: uri.searchParams.get("issuer") };
}

export function authErrorMessage(error: unknown, context: "login" | "verify" | "enroll" | "confirm") {
  if (!(error instanceof AuthApiError)) return error instanceof Error ? error.message : "Không thể hoàn tất xác thực lúc này.";
  if (error.status === 429) return `Có quá nhiều lần thử.${error.retryAfterSeconds !== undefined ? ` Thử lại sau ${error.retryAfterSeconds} giây.` : " Vui lòng chờ rồi thử lại."}`;
  if (error.status === 403) return "Yêu cầu xác thực không được phép. Hãy đăng nhập lại bằng tài khoản nội bộ.";
  if (error.status === 409) return "Phiên thiết lập MFA không còn dùng được. Hãy đăng nhập lại bằng mật khẩu để nhận mã thiết lập mới.";
  if (error.status === 401) {
    if (error.code === "AUTH_INVALID_CREDENTIALS" || context === "login") return "Tên đăng nhập hoặc mật khẩu không đúng.";
    if (error.code === "AUTH_MFA_INVALID") return "Mã xác thực không đúng. Hãy kiểm tra và thử lại.";
    return "Phiên xác thực đã hết hạn. Hãy đăng nhập lại bằng mật khẩu.";
  }
  if (error.ambiguous && context === "enroll") return "Không xác định được yêu cầu thiết lập đã được xử lý hay chưa. Vì an toàn, hãy đăng nhập lại bằng mật khẩu để nhận mã thiết lập mới.";
  return error.message;
}
