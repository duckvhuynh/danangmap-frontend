import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { operations } from "@/lib/api/generated/schema";
import { decodeAuthPrincipal } from "@/lib/api/auth";

type ApiClient = ReturnType<typeof createDanangMapClient>;
type InspectContract = operations["inspectInvite"]["responses"][200]["content"]["application/json"]["data"];
type AcceptContract = operations["acceptInvite"]["responses"][200]["content"]["application/json"]["data"];

export type InviteInspection = InspectContract;
export type InviteAcceptance = AcceptContract;

export class InviteApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
    readonly ambiguous = false,
  ) {
    super(message);
    this.name = "InviteApiError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new InviteApiError(502, "CONTRACT_INVALID", `Phản hồi lời mời thiếu trường ${field}.`);
  }
  return value;
}

function unwrapEnvelope(value: unknown) {
  if (!isRecord(value) || !("data" in value)) {
    throw new InviteApiError(502, "CONTRACT_INVALID", "Phản hồi lời mời không đúng định dạng envelope.");
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
        ? "Dịch vụ lời mời tạm thời không khả dụng."
        : "Yêu cầu lời mời không thể xử lý.";
  const requestId =
    typeof body.requestId === "string"
      ? body.requestId
      : response.headers.get("x-request-id") ?? undefined;
  return new InviteApiError(
    status,
    code,
    message,
    requestId,
    retryAfterSeconds(response),
  );
}

function resultData(result: { data?: unknown; error?: unknown; response: Response }) {
  if (!result.response.ok || result.error !== undefined) {
    throw problem(result.error, result.response);
  }
  return result.data;
}

function networkError(error: unknown, ambiguous = false) {
  if (error instanceof InviteApiError) return error;
  return new InviteApiError(
    0,
    ambiguous ? "NETWORK_AMBIGUOUS" : "NETWORK_ERROR",
    ambiguous
      ? "Không xác định được máy chủ đã chấp nhận lời mời hay chưa."
      : "Không thể kết nối dịch vụ lời mời.",
    undefined,
    undefined,
    ambiguous,
  );
}

function decodeInspection(value: unknown): InviteInspection {
  const data = unwrapEnvelope(value);
  if (!isRecord(data)) {
    throw new InviteApiError(502, "CONTRACT_INVALID", "Thông tin lời mời không đúng hợp đồng.");
  }
  const role = data.role;
  if (
    role !== "editor" &&
    role !== "reviewer" &&
    role !== "publisher" &&
    role !== "system_admin"
  ) {
    throw new InviteApiError(502, "CONTRACT_INVALID", "Vai trò trong lời mời không hợp lệ.");
  }
  const expiresAt = requiredString(data.expiresAt, "expiresAt");
  if (!Number.isFinite(Date.parse(expiresAt)) || typeof data.requiresMfaEnrollment !== "boolean") {
    throw new InviteApiError(502, "CONTRACT_INVALID", "Thông tin lời mời không đúng hợp đồng.");
  }
  return {
    maskedEmail: requiredString(data.maskedEmail, "maskedEmail"),
    role,
    expiresAt,
    requiresMfaEnrollment: data.requiresMfaEnrollment,
  };
}

function decodeAcceptance(value: unknown): InviteAcceptance {
  const data = unwrapEnvelope(value);
  if (!isRecord(data)) {
    throw new InviteApiError(502, "CONTRACT_INVALID", "Phản hồi chấp nhận lời mời không đúng hợp đồng.");
  }
  if (data.status === "authenticated" && data.mfaEnrollmentRequired === false) {
    return { status: data.status, mfaEnrollmentRequired: false, principal: decodeAuthPrincipal(data.principal) };
  }
  if (data.status !== "mfa_required" || typeof data.mfaEnrollmentRequired !== "boolean") {
    throw new InviteApiError(502, "CONTRACT_INVALID", "Phản hồi chấp nhận lời mời không đúng hợp đồng.");
  }
  const challengeExpiresAt = requiredString(data.challengeExpiresAt, "challengeExpiresAt");
  if (!Number.isFinite(Date.parse(challengeExpiresAt))) {
    throw new InviteApiError(502, "CONTRACT_INVALID", "Thời hạn thử thách MFA không hợp lệ.");
  }
  return { status: data.status, mfaEnrollmentRequired: data.mfaEnrollmentRequired, challengeExpiresAt };
}

async function acquireCsrfToken(client: ApiClient) {
  try {
    const result = await client.GET("/api/v1/auth/csrf");
    const data = unwrapEnvelope(resultData(result));
    if (!isRecord(data)) {
      throw new InviteApiError(502, "CONTRACT_INVALID", "CSRF response không hợp lệ.");
    }
    return requiredString(data.csrfToken, "csrfToken");
  } catch (error) {
    throw networkError(error);
  }
}

export async function inspectInvite(
  token: string,
  client: ApiClient = apiClient,
): Promise<InviteInspection> {
  try {
    const result = await client.POST("/api/v1/auth/invites:inspect", {
      body: { token },
    });
    return decodeInspection(resultData(result));
  } catch (error) {
    throw networkError(error);
  }
}

export async function acceptInvite(
  input: { token: string; password: string; passwordConfirmation: string },
  client: ApiClient = apiClient,
): Promise<InviteAcceptance> {
  const csrfToken = await acquireCsrfToken(client);
  try {
    const result = await client.POST("/api/v1/auth/invites:accept", {
      params: { header: { "X-CSRF-Token": csrfToken } },
      body: input,
    });
    return decodeAcceptance(resultData(result));
  } catch (error) {
    throw networkError(error, !(error instanceof InviteApiError));
  }
}

const GENERIC_INVALID_INVITE =
  "Lời mời không hợp lệ hoặc đã hết hiệu lực. Vui lòng yêu cầu quản trị hệ thống gửi lời mời mới.";

export function inviteErrorMessage(error: unknown, context: "inspect" | "accept") {
  if (!(error instanceof InviteApiError)) {
    return "Không thể xử lý lời mời. Hãy kiểm tra kết nối và thử lại.";
  }
  if (error.code === "INVITE_INVALID_OR_EXPIRED" || error.status === 400) {
    return GENERIC_INVALID_INVITE;
  }
  if (error.status === 403) {
    return "Phiên bảo mật không hợp lệ. Hãy tải lại trang và thử lại từ đầu.";
  }
  if (error.status === 409) {
    return "Không thể tạo tài khoản vì thông tin lời mời xung đột với tài khoản hiện có. Vui lòng liên hệ quản trị hệ thống.";
  }
  if (error.status === 422) {
    return "Mật khẩu chưa đáp ứng yêu cầu hoặc hai ô mật khẩu chưa trùng khớp.";
  }
  if (error.status === 429) {
    return `Có quá nhiều lần thử.${
      error.retryAfterSeconds !== undefined
        ? ` Thử lại sau ${error.retryAfterSeconds} giây.`
        : " Vui lòng chờ rồi thử lại."
    }`;
  }
  if (error.status >= 500) {
    return "Dịch vụ lời mời đang tạm gián đoạn. Vui lòng thử lại sau.";
  }
  if (error.ambiguous && context === "accept") {
    return "Không xác định được máy chủ đã tạo tài khoản hay chưa. Không gửi lại mật khẩu để tránh dùng lại lời mời một lần.";
  }
  if (error.status === 0) {
    return "Không thể kết nối dịch vụ lời mời. Kiểm tra mạng và thử lại.";
  }
  return "Không thể xử lý lời mời lúc này. Vui lòng thử lại sau.";
}
