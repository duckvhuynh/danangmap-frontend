import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { operations } from "@/lib/api/generated/schema";

type ApiClient = ReturnType<typeof createDanangMapClient>;

interface ApiResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}

export interface BootstrapStatus {
  available: boolean;
}

export type BootstrapSystemAdminInput =
  operations["bootstrapSystemAdmin"]["requestBody"]["content"]["application/json"];

export interface BootstrapSystemAdminResult {
  status: "mfa_required";
  mfaEnrollmentRequired: true;
  challengeExpiresAt: string;
}

export class BootstrapApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
    readonly ambiguous = false,
  ) {
    super(message);
    this.name = "BootstrapApiError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function requiredString(value: unknown, field: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new BootstrapApiError(
      502,
      "CONTRACT_INVALID",
      `Phản hồi khởi tạo thiếu trường ${field}.`,
    );
  }
  return value;
}

function unwrapEnvelope(value: unknown) {
  if (!isRecord(value) || !("data" in value)) {
    throw new BootstrapApiError(
      502,
      "CONTRACT_INVALID",
      "Phản hồi khởi tạo không đúng định dạng envelope.",
    );
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
        ? "Dịch vụ khởi tạo quản trị tạm thời không khả dụng."
        : "Yêu cầu khởi tạo quản trị không thể xử lý.";
  const requestId =
    typeof body.requestId === "string"
      ? body.requestId
      : response.headers.get("x-request-id") ?? undefined;
  return new BootstrapApiError(
    status,
    code,
    message,
    requestId,
    retryAfterSeconds(response),
  );
}

function resultData(result: ApiResult) {
  if (!result.response.ok || result.error !== undefined) {
    throw problem(result.error, result.response);
  }
  return result.data;
}

function networkError(error: unknown, ambiguous = false) {
  if (error instanceof BootstrapApiError) return error;
  return new BootstrapApiError(
    0,
    ambiguous ? "NETWORK_AMBIGUOUS" : "NETWORK_ERROR",
    ambiguous
      ? "Không xác định được máy chủ đã tạo tài khoản hay chưa."
      : "Không thể kết nối dịch vụ khởi tạo quản trị.",
    undefined,
    undefined,
    ambiguous,
  );
}

function decodeStatus(value: unknown): BootstrapStatus {
  const data = unwrapEnvelope(value);
  if (!isRecord(data) || typeof data.available !== "boolean") {
    throw new BootstrapApiError(
      502,
      "CONTRACT_INVALID",
      "Trạng thái khởi tạo không đúng hợp đồng.",
    );
  }
  return { available: data.available };
}

function decodeResult(value: unknown): BootstrapSystemAdminResult {
  const data = unwrapEnvelope(value);
  if (
    !isRecord(data) ||
    data.status !== "mfa_required" ||
    data.mfaEnrollmentRequired !== true
  ) {
    throw new BootstrapApiError(
      502,
      "CONTRACT_INVALID",
      "Phản hồi khởi tạo không đúng hợp đồng.",
    );
  }
  const challengeExpiresAt = requiredString(
    data.challengeExpiresAt,
    "challengeExpiresAt",
  );
  if (!Number.isFinite(Date.parse(challengeExpiresAt))) {
    throw new BootstrapApiError(
      502,
      "CONTRACT_INVALID",
      "Thời hạn thử thách MFA không hợp lệ.",
    );
  }
  return {
    status: "mfa_required",
    mfaEnrollmentRequired: true,
    challengeExpiresAt,
  };
}

async function acquireCsrfToken(client: ApiClient) {
  try {
    const result = await client.GET("/api/v1/auth/csrf");
    const data = unwrapEnvelope(resultData(result));
    if (!isRecord(data)) {
      throw new BootstrapApiError(
        502,
        "CONTRACT_INVALID",
        "CSRF response không hợp lệ.",
      );
    }
    return requiredString(data.csrfToken, "csrfToken");
  } catch (error) {
    throw networkError(error);
  }
}

export async function getBootstrapStatus(
  options: { signal?: AbortSignal } = {},
  client: ApiClient = apiClient,
): Promise<BootstrapStatus> {
  try {
    const result = await client.GET("/api/v1/auth/bootstrap/status", {
      ...options,
      cache: "no-store",
    });
    return decodeStatus(resultData(result));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError(error);
  }
}

export async function bootstrapSystemAdmin(
  input: BootstrapSystemAdminInput,
  bootstrapToken: string,
  client: ApiClient = apiClient,
): Promise<BootstrapSystemAdminResult> {
  const csrfToken = await acquireCsrfToken(client);
  try {
    const result = await client.POST(
      "/api/v1/auth/bootstrap/system-admin",
      {
        params: {
          header: {
            "X-CSRF-Token": csrfToken,
            "X-Initial-Admin-Bootstrap-Token": bootstrapToken,
          },
        },
        body: input,
      },
    );
    return decodeResult(resultData(result));
  } catch (error) {
    throw networkError(error, !(error instanceof BootstrapApiError));
  }
}

export function bootstrapErrorMessage(error: unknown, context: "status" | "create") {
  if (!(error instanceof BootstrapApiError)) {
    return error instanceof Error
      ? error.message
      : "Không thể khởi tạo quản trị hệ thống lúc này.";
  }
  if (error.status === 401 || error.code === "BOOTSTRAP_TOKEN_INVALID") {
    return "Mã khởi tạo không đúng. Hãy kiểm tra mã do người vận hành máy chủ cung cấp.";
  }
  if (error.status === 403) {
    return "Phiên bảo mật không hợp lệ. Hãy tải lại trang và thử lại từ đầu.";
  }
  if (error.status === 409 || error.code === "BOOTSTRAP_ALREADY_COMPLETED") {
    return "Hệ thống đã có tài khoản quản trị. Hãy chuyển sang trang đăng nhập.";
  }
  if (error.status === 422) {
    return error.code === "BOOTSTRAP_PASSWORD_WEAK"
      ? "Mật khẩu không được chứa tên đăng nhập hoặc phần đứng trước @ trong email."
      : "Thông tin tài khoản hoặc mật khẩu chưa đáp ứng yêu cầu.";
  }
  if (error.status === 429) {
    return `Có quá nhiều lần thử.${
      error.retryAfterSeconds !== undefined
        ? ` Thử lại sau ${error.retryAfterSeconds} giây.`
        : " Vui lòng chờ rồi thử lại."
    }`;
  }
  if (error.status === 503) {
    return "Khởi tạo quản trị chưa được bật hoặc dịch vụ bảo vệ đang tạm gián đoạn.";
  }
  if (error.ambiguous && context === "create") {
    return "Không xác định được máy chủ đã tạo tài khoản hay chưa. Không gửi lại biểu mẫu để tránh tạo lặp.";
  }
  if (error.status === 0) {
    return context === "status"
      ? "Không thể kiểm tra trạng thái khởi tạo. Kiểm tra kết nối và thử lại."
      : "Không thể kết nối dịch vụ khởi tạo quản trị.";
  }
  return error.message;
}
