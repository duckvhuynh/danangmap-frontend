import type { Geometry } from "geojson";
import { apiClient, createDanangMapClient } from "@/lib/api/generated/client";
import type { components, operations } from "@/lib/api/generated/schema";

type ApiClient = ReturnType<typeof createDanangMapClient>;

type PrincipalContract =
  operations["getCurrentUser"]["responses"][200]["content"]["application/json"]["data"];
type LayerContract =
  operations["listAdminLayers"]["responses"][200]["content"]["application/json"]["data"][number];
type RevisionContract =
  operations["getRevision"]["responses"][200]["content"]["application/json"]["data"]["revision"];
type FieldContract =
  operations["getRevision"]["responses"][200]["content"]["application/json"]["data"]["fields"][number];
type WorkspaceContract =
  operations["getRevisionWorkspace"]["responses"][200]["content"]["application/json"]["data"];
type FeatureContract =
  operations["listAdminFeatures"]["responses"][200]["content"]["application/json"]["data"][number];
type AttachmentUploadInputContract =
  operations["createAttachmentUpload"]["requestBody"]["content"]["application/json"];
type AttachmentUploadIntentContract =
  operations["createAttachmentUpload"]["responses"][201]["content"]["application/json"]["data"];
type AttachmentMetadataContract =
  operations["getAdminAttachment"]["responses"][200]["content"]["application/json"]["data"];
type FeatureBatchSyncInputContract =
  operations["syncFeatureChangesBatch"]["requestBody"]["content"]["application/json"];
type FeatureBatchSyncEnvelopeContract =
  operations["syncFeatureChangesBatch"]["responses"][200]["content"]["application/json"];
type RevisionChangesEnvelopeContract =
  operations["listRevisionChanges"]["responses"][200]["content"]["application/json"];

export type AdminRole = PrincipalContract["role"];
export type RevisionStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "changes_requested"
  | "publishing"
  | "published"
  | string;
export type AdminPrincipal = PrincipalContract;
export type AdminLayer = Pick<LayerContract, "id" | "slug"> & {
  revisionId: string | null;
  title: string;
  status: RevisionStatus;
  geometryMode: string;
  updatedAt: string;
};
export type AdminRevision = Pick<
  RevisionContract,
  | "id"
  | "layerId"
  | "revisionNo"
  | "status"
  | "title"
  | "geometryMode"
  | "allowedGeometryKinds"
  | "style"
  | "lockVersion"
  | "createdBy"
> & { description: string; updatedAt: string };
export type AdminField = Pick<
  FieldContract,
  "key" | "label" | "type" | "required" | "sensitive" | "offlineCache"
> &
  Partial<
    Pick<
      FieldContract,
      | "description"
      | "icon"
      | "public"
      | "searchable"
      | "filterable"
      | "sortable"
      | "defaultValue"
      | "validation"
      | "options"
      | "displayOrder"
    >
  >;
export type AdminWorkspace = WorkspaceContract;
export type AdminFeature = Pick<
  FeatureContract,
  "type" | "id" | "properties" | "attachments" | "meta"
> & { geometry: Geometry };
export type AdminFeatureAttachment = AdminFeature["attachments"][number];
export type AttachmentUploadInput = AttachmentUploadInputContract;
export type AttachmentUploadIntent = AttachmentUploadIntentContract;
export type AttachmentMetadata = AttachmentMetadataContract;
export type CreateFeatureInput = components["schemas"]["FeatureMutationDto"];
export type UpdateFeatureInput = components["schemas"]["UpdateFeatureDto"];
export type FeatureBatchSyncInput = FeatureBatchSyncInputContract;
export type FeatureSyncMutation = FeatureBatchSyncInput["mutations"][number];
export type FeatureSyncResult =
  FeatureBatchSyncEnvelopeContract["data"]["results"][number];
export type RevisionChange = RevisionChangesEnvelopeContract["data"][number];

export interface RevisionBundle {
  revision: AdminRevision;
  fields: AdminField[];
  workspace: AdminWorkspace;
  features: AdminFeature[];
  etag: string;
  truncated: boolean;
}

export interface MutationAuth {
  csrfToken: string;
}

// Models above derive from the pinned OpenAPI artifact; runtime decoders remain a trust-boundary defense.

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const DANANG_ADMIN_BBOX = "107.8,15.8,108.6,16.4";
const requiredString = (value: unknown, field: string) => {
  if (typeof value !== "string")
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      `Phản hồi API thiếu trường ${field}.`,
    );
  return value;
};
const requiredNumber = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      `Phản hồi API thiếu trường ${field}.`,
    );
  return value;
};
const envelopeData = (value: unknown) => {
  if (!isRecord(value) || !("data" in value))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Phản hồi API không đúng định dạng envelope.",
    );
  return value.data;
};

function role(value: unknown): AdminRole {
  if (
    value === "editor" ||
    value === "reviewer" ||
    value === "publisher" ||
    value === "system_admin"
  )
    return value;
  throw new AdminApiError(
    502,
    "CONTRACT_INVALID",
    "Vai trò tài khoản không hợp lệ.",
  );
}
function principalStatus(value: unknown): AdminPrincipal["status"] {
  if (
    value === "active" ||
    value === "inactive" ||
    value === "disabled" ||
    value === "invited"
  )
    return value;
  throw new AdminApiError(
    502,
    "CONTRACT_INVALID",
    "Trạng thái tài khoản không hợp lệ.",
  );
}
function revisionGeometryMode(value: unknown): AdminRevision["geometryMode"] {
  if (
    value === "point" ||
    value === "circle" ||
    value === "polyline" ||
    value === "polygon" ||
    value === "mixed"
  )
    return value;
  throw new AdminApiError(
    502,
    "CONTRACT_INVALID",
    "Geometry mode của revision không hợp lệ.",
  );
}

function position(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    value.some(
      (coordinate) =>
        typeof coordinate !== "number" || !Number.isFinite(coordinate),
    )
  )
    throw new AdminApiError(502, "CONTRACT_INVALID", "Tọa độ không hợp lệ.");
  return value;
}
function positions(value: unknown): number[][] {
  if (!Array.isArray(value))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Mảng tọa độ không hợp lệ.",
    );
  return value.map(position);
}
function lines(value: unknown): number[][][] {
  if (!Array.isArray(value))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Mảng đường không hợp lệ.",
    );
  return value.map(positions);
}
function polygons(value: unknown): number[][][][] {
  if (!Array.isArray(value))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Mảng polygon không hợp lệ.",
    );
  return value.map(lines);
}

function geometry(value: unknown): Geometry {
  if (!isRecord(value) || typeof value.type !== "string")
    throw new AdminApiError(502, "CONTRACT_INVALID", "Geometry không hợp lệ.");
  const coordinates = value.coordinates;
  if (value.type === "Point")
    return { type: "Point", coordinates: position(coordinates) };
  if (value.type === "MultiPoint")
    return { type: "MultiPoint", coordinates: positions(coordinates) };
  if (value.type === "LineString")
    return { type: "LineString", coordinates: positions(coordinates) };
  if (value.type === "MultiLineString")
    return { type: "MultiLineString", coordinates: lines(coordinates) };
  if (value.type === "Polygon")
    return { type: "Polygon", coordinates: lines(coordinates) };
  if (value.type === "MultiPolygon")
    return { type: "MultiPolygon", coordinates: polygons(coordinates) };
  if (value.type === "GeometryCollection" && Array.isArray(value.geometries))
    return {
      type: "GeometryCollection",
      geometries: value.geometries.map(geometry),
    };
  throw new AdminApiError(
    502,
    "CONTRACT_INVALID",
    "Geometry không được hỗ trợ.",
  );
}

function problem(error: unknown, response: Response) {
  const body = isRecord(error) ? error : {};
  const status =
    typeof body.status === "number" ? body.status : response.status;
  const code = typeof body.code === "string" ? body.code : `HTTP_${status}`;
  const message =
    typeof body.message === "string"
      ? body.message
      : status >= 500
        ? "Dịch vụ quản trị tạm thời không khả dụng."
        : "Yêu cầu không thể xử lý.";
  const requestId =
    typeof body.requestId === "string"
      ? body.requestId
      : (response.headers.get("x-request-id") ?? undefined);
  const details = isRecord(body.details) ? body.details : {};
  return new AdminApiError(status, code, message, requestId, details);
}

function resultData(result: {
  data?: unknown;
  error?: unknown;
  response: Response;
}) {
  if (!result.response.ok || result.error !== undefined)
    throw problem(result.error, result.response);
  return result.data;
}

export function assertAdminResult<T>(result: {
  data?: T;
  error?: unknown;
  response: Response;
}): T {
  if (!result.response.ok || result.error !== undefined)
    throw problem(result.error, result.response);
  if (result.data === undefined)
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Phản hồi API không có dữ liệu.",
    );
  return result.data;
}

export function adminErrorMessage(error: unknown) {
  if (!(error instanceof AdminApiError))
    return "Chưa thể kết nối hoặc hoàn tất thao tác. Kiểm tra kết nối rồi thử lại.";
  if (error.code === "CLIENT_IMPORT_FILE_INVALID" || error.code === "CLIENT_IMPORT_MAPPING_INVALID")
    return error.message;
  const messages: Record<string, string> = {
    SLUG_CONFLICT: "Mã lớp đã được sử dụng. Hãy chọn mã khác.",
    SCHEMA_VIOLATION: "Thông tin chưa hợp lệ. Kiểm tra các trường được đánh dấu rồi thử lại.",
    CONFIG_IMPACT_BLOCKED: "Cấu hình mới không phù hợp với một số đối tượng hiện có. Xem kết quả kiểm tra để điều chỉnh.",
    DRAFT_ALREADY_EXISTS: "Lớp đã có một bản nháp đang xử lý. Mở bản nháp đó để tiếp tục.",
    PUBLISHED_REVISION_REQUIRED: "Lớp chưa có nội dung đã công bố để tạo bản nháp mới.",
    REVISION_NOT_EDITABLE: "Phiên bản này không còn ở trạng thái có thể chỉnh sửa. Mở lại lớp để xem trạng thái mới nhất.",
    PUBLICATION_BASE_STALE: "Nội dung công bố đã thay đổi. Mở lại lớp để tạo bản nháp từ dữ liệu mới nhất.",
    PUBLICATION_POINTER_STALE: "Nội dung đang công bố đã thay đổi. Tải lại lịch sử trước khi tiếp tục.",
    ETAG_MISMATCH: "Dữ liệu đã có thay đổi mới. Tải lại bản mới nhất trước khi tiếp tục.",
    SEPARATION_OF_DUTIES: "Thao tác này cần một người khác trong quy trình thực hiện. Hãy chuyển nội dung cho người có quyền phù hợp.",
    PASSWORD_CHANGE_REQUIRED: "Bạn cần đổi mật khẩu trước khi tiếp tục.",
    ROLLBACK_TARGET_INVALID: "Mốc công bố đã chọn không thể dùng để khôi phục.",
    ROLLBACK_TARGET_NOT_FOUND: "Không tìm thấy mốc công bố đã chọn.",
    ROLLBACK_TARGET_ACTIVE: "Mốc công bố này đang được sử dụng.",
    IDEMPOTENCY_KEY_REUSED: "Nội dung thao tác đã thay đổi. Tải lại trang rồi thực hiện lại.",
    IDEMPOTENCY_IN_PROGRESS: "Thao tác trước vẫn đang được xử lý. Chờ một lúc rồi kiểm tra lại.",
    SYNC_CURSOR_EXPIRED: "Bản nháp trên thiết bị đã quá cũ. Thay đổi của bạn vẫn được giữ để đối chiếu với dữ liệu mới.",
    SYNC_BASE_CURSOR_INVALID: "Chưa đối chiếu được bản nháp với dữ liệu đã lưu. Tải lại bản mới nhất trước khi tiếp tục.",
    SYNC_BASE_REVISION_MISMATCH: "Dữ liệu đã có phiên bản mới. Tải lại trước khi lưu thay đổi.",
    SYNC_PAYLOAD_HASH_MISMATCH: "Chưa xác nhận được nội dung cần lưu. Giữ bản nháp và thử lại.",
    CLIENT_FEATURE_MAPPING_NOT_FOUND: "Đối tượng mới chưa được lưu lên hệ thống. Lưu lại trước khi tiếp tục.",
    CLIENT_FEATURE_ID_REUSED: "Đối tượng mới bị trùng mã. Tải lại dữ liệu rồi thử lại.",
    DIFF_TOO_LARGE: "Có quá nhiều thay đổi để xem cùng lúc. Chọn phạm vi hoặc phiên bản gần hơn.",
    GROUP_ARCHIVED: "Nhóm lớp đã được lưu trữ. Chọn nhóm khác trước khi tiếp tục.",
    LAYER_ARCHIVED: "Lớp đã được lưu trữ. Khôi phục lớp trước khi tiếp tục.",
    LAYER_UNCONFIGURED: "Lớp chưa có cấu hình. Hãy tạo bản nháp để bắt đầu.",
    ATTACHMENT_SCAN_FAILED: "Chưa kiểm tra được độ an toàn của tệp. Thử kiểm tra lại sau.",
    ATTACHMENT_SCAN_REJECTED: "Tệp không vượt qua kiểm tra an toàn. Hãy chọn tệp khác.",
    ATTACHMENT_MALWARE_DETECTED: "Tệp bị từ chối vì phát hiện nội dung nguy hiểm.",
    ATTACHMENT_MIME_MISMATCH: "Nội dung tệp không khớp định dạng. Kiểm tra và chọn lại tệp.",
    ATTACHMENT_TYPE_UNSUPPORTED: "Định dạng tệp chưa được hỗ trợ.",
    ATTACHMENT_UPLOAD_EXPIRED: "Lượt tải lên đã hết hạn. Hãy chọn lại tệp.",
    ATTACHMENT_NOT_CLEAN: "Tệp cần hoàn tất kiểm tra an toàn trước khi thêm vào đối tượng.",
    IMPORT_MAPPING_INVALID: "Các cột chưa được ghép đúng. Kiểm tra cột nguồn và trường tương ứng.",
    IMPORT_FILE_REQUIRED: "Chọn một tệp để nhập dữ liệu.",
    IMPORT_CONCURRENCY_LIMIT: "Đang có nhiều lượt nhập dữ liệu. Chờ lượt trước hoàn tất rồi thử lại.",
    IMPORT_HAS_ERRORS: "Tệp còn dòng lỗi. Sửa tệp hoặc chọn bỏ qua dòng lỗi nếu được phép.",
    IMPORT_NO_VALID_ROWS: "Không có dòng hợp lệ để nhập. Kiểm tra tệp nguồn rồi thử lại.",
    CONTRACT_INVALID: "Chưa đọc được dữ liệu từ hệ thống. Thử tải lại; nếu vẫn lỗi, liên hệ người quản trị.",
    ETAG_MISSING: "Chưa xác nhận được phiên bản dữ liệu. Tải lại trước khi thực hiện thao tác.",
  };
  const statuses: Record<number, string> = {
    401: "Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.",
    403: "Bạn không có quyền thực hiện thao tác này.",
    404: "Không tìm thấy dữ liệu. Có thể nội dung đã được chuyển hoặc xóa.",
    409: "Trạng thái dữ liệu đã thay đổi. Tải lại để xem thông tin mới nhất.",
    412: "Dữ liệu đã có thay đổi mới. Tải lại trước khi tiếp tục.",
    413: "Tệp vượt giới hạn dung lượng. Hãy chia nhỏ dữ liệu rồi thử lại.",
    415: "Định dạng tệp chưa được hỗ trợ.",
    422: "Dữ liệu chưa hợp lệ. Kiểm tra thông tin đã nhập rồi thử lại.",
    429: "Bạn thao tác quá nhanh. Chờ một lúc rồi thử lại.",
    503: "Dịch vụ tạm thời chưa sẵn sàng. Thử lại sau ít phút.",
  };
  return messages[error.code] ?? statuses[error.status] ?? "Hệ thống chưa thể hoàn tất thao tác. Thử lại sau hoặc liên hệ người quản trị.";
}

function demoRole(): AdminRole {
  if (typeof window === "undefined") return "editor";
  const value = window.sessionStorage.getItem("danangmap-demo-role");
  if (value === "reviewer" || value === "publisher" || value === "system_admin")
    return value;
  return window.location.pathname.endsWith("/review") ? "reviewer" : "editor";
}

function demoStatus(): RevisionStatus {
  if (typeof window !== "undefined") {
    const override = window.sessionStorage.getItem(
      "danangmap-demo-revision-status",
    );
    if (override) return override;
  }
  return demoRole() === "reviewer"
    ? "in_review"
    : demoRole() === "publisher"
      ? "approved"
      : "draft";
}

function throwDemoMutationError() {
  if (typeof window === "undefined") return;
  const raw = window.sessionStorage.getItem("danangmap-demo-mutation-error");
  const status = Number(raw);
  if ([401, 403, 409, 412, 422].includes(status))
    throw new AdminApiError(
      status,
      `DEMO_${status}`,
      "Lỗi mô phỏng để kiểm tra trạng thái giao diện.",
      `demo-${status}`,
    );
}

const demoRevisionId = "11111111-1111-4111-8111-111111111111";
const demoLayerId = "22222222-2222-4222-8222-222222222222";
const demoFeatures: AdminFeature[] = [
  {
    type: "Feature",
    id: "33333333-3333-4333-8333-333333333333",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [108.205, 16.074],
          [108.229, 16.074],
          [108.231, 16.052],
          [108.208, 16.046],
          [108.205, 16.074],
        ],
      ],
    },
    properties: { name: "Phường Hải Châu", status: "Đang hiệu lực" },
    attachments: [],
    meta: {
      geometryKind: "polygon",
      radiusM: null,
      externalSource: null,
      externalId: null,
      versionId: "44444444-4444-4444-8444-444444444444",
      updatedAt: "2026-08-21T02:42:00.000Z",
    },
  },
  {
    type: "Feature",
    id: "55555555-5555-4555-8555-555555555555",
    geometry: { type: "Point", coordinates: [108.2208, 16.0668] },
    properties: { name: "Tâm phục vụ hành chính" },
    attachments: [],
    meta: {
      geometryKind: "point",
      radiusM: null,
      externalSource: null,
      externalId: null,
      versionId: "66666666-6666-4666-8666-666666666666",
      updatedAt: "2026-08-21T02:43:00.000Z",
    },
  },
];

export async function getAdminSession(
  client: ApiClient = apiClient,
): Promise<AdminPrincipal> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    const currentRole = demoRole();
    return {
      id: `demo-${currentRole}`,
      email: `${currentRole}@demo.danangmap.local`,
      username: currentRole,
      displayName: `Demo ${currentRole}`,
      role: currentRole,
      status: "active",
      mfaEnabled: true,
      mustChangePassword: false,
    };
  }
  const result = await client.GET("/api/v1/auth/me");
  const data = envelopeData(resultData(result));
  if (!isRecord(data))
    throw new AdminApiError(502, "CONTRACT_INVALID", "Principal không hợp lệ.");
  return {
    id: requiredString(data.id, "id"),
    email: requiredString(data.email, "email"),
    username: requiredString(data.username, "username"),
    displayName: requiredString(data.displayName, "displayName"),
    role: role(data.role),
    status: principalStatus(data.status),
    mfaEnabled: data.mfaEnabled === true,
    mustChangePassword: data.mustChangePassword === true,
  };
}

export async function acquireCsrfToken(client: ApiClient = apiClient) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true")
    return "demo-csrf-token";
  const result = await client.GET("/api/v1/auth/csrf");
  const data = envelopeData(resultData(result));
  if (!isRecord(data))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "CSRF response không hợp lệ.",
    );
  return requiredString(data.csrfToken, "csrfToken");
}

export async function logout(
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return;
  const result = await client.POST("/api/v1/auth/logout", {
    params: { header: { "X-CSRF-Token": auth.csrfToken } },
  });
  resultData(result);
}

export async function listAdminLayers(
  client: ApiClient = apiClient,
): Promise<AdminLayer[]> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true")
    return [
      {
        id: demoLayerId,
        slug: "ranh-gioi-phuong-xa",
        revisionId: demoRevisionId,
        title: "Ranh giới phường, xã",
        status: demoStatus(),
        geometryMode: "mixed",
        updatedAt: "2026-08-21T02:42:00.000Z",
      },
    ];
  const result = await client.GET("/api/v1/admin/layers");
  const data = envelopeData(resultData(result));
  if (!Array.isArray(data))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Catalog quản trị không hợp lệ.",
    );
  return data.map((item) => {
    if (!isRecord(item))
      throw new AdminApiError(
        502,
        "CONTRACT_INVALID",
        "Layer quản trị không hợp lệ.",
      );
    return {
      id: requiredString(item.id, "id"),
      slug: requiredString(item.slug, "slug"),
      revisionId: typeof item.revisionId === "string" ? item.revisionId : null,
      title: requiredString(item.title, "title"),
      status: requiredString(item.status, "status"),
      geometryMode: requiredString(item.geometryMode, "geometryMode"),
      updatedAt: requiredString(item.updatedAt, "updatedAt"),
    };
  });
}

function decodeRevision(value: unknown): {
  revision: AdminRevision;
  fields: AdminField[];
} {
  const data = envelopeData(value);
  if (
    !isRecord(data) ||
    !isRecord(data.revision) ||
    !Array.isArray(data.fields)
  )
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Revision response không hợp lệ.",
    );
  const revision = data.revision;
  return {
    revision: {
      id: requiredString(revision.id, "revision.id"),
      layerId: requiredString(revision.layerId, "revision.layerId"),
      revisionNo: requiredNumber(revision.revisionNo, "revision.revisionNo"),
      status: requiredString(revision.status, "revision.status"),
      title: requiredString(revision.title, "revision.title"),
      description:
        typeof revision.description === "string" ? revision.description : "",
      geometryMode: revisionGeometryMode(revision.geometryMode),
      allowedGeometryKinds: Array.isArray(revision.allowedGeometryKinds)
        ? revision.allowedGeometryKinds.filter(
            (kind): kind is string => typeof kind === "string",
          )
        : [],
      style: isRecord(revision.style) ? revision.style : {},
      lockVersion: requiredNumber(revision.lockVersion, "revision.lockVersion"),
      createdBy: requiredString(revision.createdBy, "revision.createdBy"),
      updatedAt: requiredString(revision.updatedAt, "revision.updatedAt"),
    },
    fields: data.fields.flatMap((field) =>
      isRecord(field) &&
      typeof field.key === "string" &&
      typeof field.label === "string" &&
      typeof field.type === "string"
        ? [
            {
              key: field.key,
              label: field.label,
              type: field.type,
              description:
                typeof field.description === "string"
                  ? field.description
                  : undefined,
              icon: typeof field.icon === "string" ? field.icon : undefined,
              required: field.required === true,
              public: field.public !== false,
              searchable: field.searchable === true,
              filterable: field.filterable === true,
              sortable: field.sortable === true,
              sensitive: field.sensitive === true,
              offlineCache: field.offlineCache !== false,
              defaultValue:
                field.defaultValue === null ||
                typeof field.defaultValue === "string" ||
                typeof field.defaultValue === "number" ||
                typeof field.defaultValue === "boolean" ||
                Array.isArray(field.defaultValue) ||
                isRecord(field.defaultValue)
                  ? field.defaultValue
                  : undefined,
              validation: isRecord(field.validation)
                ? {
                    ...(typeof field.validation.minLength === "number"
                      ? { minLength: field.validation.minLength }
                      : {}),
                    ...(typeof field.validation.maxLength === "number"
                      ? { maxLength: field.validation.maxLength }
                      : {}),
                    ...(typeof field.validation.minimum === "number"
                      ? { minimum: field.validation.minimum }
                      : {}),
                    ...(typeof field.validation.maximum === "number"
                      ? { maximum: field.validation.maximum }
                      : {}),
                  }
                : {},
              options: Array.isArray(field.options)
                ? field.options.filter(
                    (option): option is string => typeof option === "string",
                  )
                : [],
              displayOrder:
                typeof field.displayOrder === "number"
                  ? field.displayOrder
                  : 0,
            },
          ]
        : [],
    ),
  };
}

function decodeWorkspace(value: unknown): AdminWorkspace {
  const data = envelopeData(value);
  if (!isRecord(data))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Workspace response không hợp lệ.",
    );
  return {
    revisionId: requiredString(data.revisionId, "revisionId"),
    layerId: requiredString(data.layerId, "layerId"),
    status: requiredString(data.status, "status"),
    serverCursor: requiredString(data.serverCursor, "serverCursor"),
    featureCount: requiredNumber(data.featureCount, "featureCount"),
    bounds: Array.isArray(data.bounds)
      ? data.bounds.filter(
          (number): number is number =>
            typeof number === "number" && Number.isFinite(number),
        )
      : null,
    schemaVersion: requiredNumber(data.schemaVersion, "schemaVersion"),
    updatedAt: requiredString(data.updatedAt, "updatedAt"),
  };
}

function workspaceBbox(bounds: number[] | null) {
  if (bounds?.length !== 4 || !bounds.every(Number.isFinite))
    return DANANG_ADMIN_BBOX;
  const [west, south, east, north] = bounds;
  return west! < east! && south! < north!
    ? bounds.join(",")
    : DANANG_ADMIN_BBOX;
}

function decodeFeature(value: unknown): AdminFeature {
  if (
    !isRecord(value) ||
    value.type !== "Feature" ||
    !isRecord(value.meta) ||
    !isRecord(value.properties)
  )
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Feature response không hợp lệ.",
    );
  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map(decodeFeatureAttachment)
    : [];
  return {
    type: "Feature",
    id: requiredString(value.id, "feature.id"),
    geometry: geometry(value.geometry),
    properties: value.properties,
    attachments,
    meta: {
      geometryKind: requiredString(value.meta.geometryKind, "geometryKind"),
      radiusM:
        typeof value.meta.radiusM === "number" ? value.meta.radiusM : null,
      externalSource:
        typeof value.meta.externalSource === "string"
          ? value.meta.externalSource
          : null,
      externalId:
        typeof value.meta.externalId === "string"
          ? value.meta.externalId
          : null,
      versionId: requiredString(value.meta.versionId, "versionId"),
      updatedAt: requiredString(value.meta.updatedAt, "updatedAt"),
    },
  };
}

function attachmentStatus(value: unknown): AttachmentMetadata["status"] {
  if (
    value === "uploading" ||
    value === "pending" ||
    value === "clean" ||
    value === "infected" ||
    value === "rejected" ||
    value === "deleted"
  )
    return value;
  throw new AdminApiError(
    502,
    "CONTRACT_INVALID",
    "Trạng thái attachment không hợp lệ.",
  );
}

function decodeFeatureAttachment(value: unknown): AdminFeatureAttachment {
  if (!isRecord(value))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Attachment của feature không hợp lệ.",
    );
  return {
    id: requiredString(value.id, "attachment.id"),
    fieldKey: requiredString(value.fieldKey, "attachment.fieldKey"),
    displayOrder: requiredNumber(value.displayOrder, "attachment.displayOrder"),
    fileName: requiredString(value.fileName, "attachment.fileName"),
    contentType: requiredString(value.contentType, "attachment.contentType"),
    sizeBytes: requiredNumber(value.sizeBytes, "attachment.sizeBytes"),
    status: attachmentStatus(value.status),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
  };
}

function decodeAttachmentMetadata(value: unknown): AttachmentMetadata {
  if (!isRecord(value))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Attachment response không hợp lệ.",
    );
  return {
    id: requiredString(value.id, "attachment.id"),
    fileName: requiredString(value.fileName, "attachment.fileName"),
    contentType:
      typeof value.contentType === "string" ? value.contentType : null,
    sizeBytes: typeof value.sizeBytes === "number" ? value.sizeBytes : null,
    sha256: typeof value.sha256 === "string" ? value.sha256 : null,
    status: attachmentStatus(value.status),
    ownerId: requiredString(value.ownerId, "attachment.ownerId"),
    rejectionCode:
      typeof value.rejectionCode === "string" ? value.rejectionCode : null,
    finalizedAt:
      typeof value.finalizedAt === "string" ? value.finalizedAt : null,
    scannedAt: typeof value.scannedAt === "string" ? value.scannedAt : null,
    createdAt: requiredString(value.createdAt, "attachment.createdAt"),
    updatedAt: requiredString(value.updatedAt, "attachment.updatedAt"),
  };
}

export async function loadRevisionBundle(
  revisionId: string,
  client: ApiClient = apiClient,
): Promise<RevisionBundle> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    const status = demoStatus();
    return {
      revision: {
        id: revisionId === "wards" ? demoRevisionId : revisionId,
        layerId: demoLayerId,
        revisionNo: 19,
        status,
        title: "Ranh giới phường, xã",
        description: "Địa giới hành chính thành phố Đà Nẵng sau sắp xếp.",
        geometryMode: "mixed",
        allowedGeometryKinds: ["point", "polygon", "circle"],
        style: {},
        lockVersion: 3,
        createdBy: "demo-editor",
        updatedAt: "2026-08-21T02:42:00.000Z",
      },
      fields: [
        {
          key: "name",
          label: "Tên",
          type: "text",
          required: true,
          sensitive: false,
          offlineCache: true,
        },
        {
          key: "status",
          label: "Trạng thái",
          type: "text",
          required: false,
          sensitive: false,
          offlineCache: true,
        },
      ],
      workspace: {
        revisionId: demoRevisionId,
        layerId: demoLayerId,
        status,
        serverCursor: "Mw",
        featureCount: demoFeatures.length,
        bounds: [108.205, 16.046, 108.231, 16.074],
        schemaVersion: 1,
        updatedAt: "2026-08-21T02:42:00.000Z",
      },
      features: structuredClone(demoFeatures),
      etag: `"rev-${demoRevisionId}-v3"`,
      truncated: false,
    };
  }
  const [revisionResult, workspaceResult] = await Promise.all([
    client.GET("/api/v1/admin/revisions/{revisionId}", {
      params: { path: { revisionId } },
    }),
    client.GET("/api/v1/admin/revisions/{revisionId}/workspace", {
      params: { path: { revisionId } },
    }),
  ]);
  const revisionData = decodeRevision(resultData(revisionResult));
  const workspace = decodeWorkspace(resultData(workspaceResult));
  const bbox = workspaceBbox(workspace.bounds);
  const featureResult = await client.GET(
    "/api/v1/admin/revisions/{revisionId}/features",
    { params: { path: { revisionId }, query: { bbox } } },
  );
  const featureData = envelopeData(resultData(featureResult));
  if (!Array.isArray(featureData))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Danh sách feature không hợp lệ.",
    );
  const etag =
    workspaceResult.response.headers.get("etag") ??
    revisionResult.response.headers.get("etag");
  if (!etag)
    throw new AdminApiError(
      502,
      "ETAG_MISSING",
      "API không trả ETag của revision.",
    );
  const features = featureData.map(decodeFeature);
  return {
    ...revisionData,
    workspace,
    features,
    etag,
    truncated: workspace.featureCount > features.length,
  };
}

export async function createAdminFeature(
  revisionId: string,
  dto: CreateFeatureInput,
  etag: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    throwDemoMutationError();
    return { feature: demoFeatures[0], etag: `"rev-${revisionId}-v4"` };
  }
  const result = await client.POST(
    "/api/v1/admin/revisions/{revisionId}/features",
    {
      params: {
        path: { revisionId },
        header: {
          "X-CSRF-Token": auth.csrfToken,
          "Idempotency-Key": operationKey,
          "If-Match": etag,
        },
      },
      body: dto,
    },
  );
  const data = envelopeData(resultData(result));
  if (!isRecord(data))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Create feature response không hợp lệ.",
    );
  return {
    feature: decodeFeature(data.feature),
    etag: result.response.headers.get("etag") ?? etag,
  };
}

export async function updateAdminFeature(
  revisionId: string,
  featureId: string,
  dto: UpdateFeatureInput,
  etag: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    throwDemoMutationError();
    return { feature: demoFeatures[0], etag: `"rev-${revisionId}-v4"` };
  }
  const result = await client.PATCH(
    "/api/v1/admin/revisions/{revisionId}/features/{featureId}",
    {
      params: {
        path: { revisionId, featureId },
        header: { "X-CSRF-Token": auth.csrfToken, "If-Match": etag },
      },
      body: dto,
    },
  );
  const data = envelopeData(resultData(result));
  if (!isRecord(data))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Update feature response không hợp lệ.",
    );
  return {
    feature: decodeFeature(data.feature),
    etag: result.response.headers.get("etag") ?? etag,
  };
}

export async function deleteAdminFeature(
  revisionId: string,
  featureId: string,
  etag: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    throwDemoMutationError();
    return { etag: `"rev-${revisionId}-v4"` };
  }
  const result = await client.DELETE(
    "/api/v1/admin/revisions/{revisionId}/features/{featureId}",
    {
      params: {
        path: { revisionId, featureId },
        header: { "X-CSRF-Token": auth.csrfToken, "If-Match": etag },
      },
    },
  );
  resultData(result);
  return { etag: result.response.headers.get("etag") ?? etag };
}

export async function syncAdminFeatureChanges(
  revisionId: string,
  body: FeatureBatchSyncInput,
  etag: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true")
    throw new AdminApiError(
      503,
      "DEMO_SYNC_UNAVAILABLE",
      "Demo mode không kết nối dịch vụ đồng bộ.",
    );
  const result = await client.POST(
    "/api/v1/admin/revisions/{revisionId}/changes:batch",
    {
      params: {
        path: { revisionId },
        header: { "X-CSRF-Token": auth.csrfToken, "If-Match": etag },
      },
      body,
    },
  );
  const envelope = assertAdminResult(result);
  return {
    data: envelope.data,
    requestId: envelope.meta.requestId,
    etag: result.response.headers.get("etag") ?? etag,
  };
}

export async function listAdminRevisionChanges(
  revisionId: string,
  after: string,
  limit = 500,
  client: ApiClient = apiClient,
) {
  const result = await client.GET(
    "/api/v1/admin/revisions/{revisionId}/changes",
    {
      params: { path: { revisionId }, query: { after, limit } },
    },
  );
  const envelope = assertAdminResult(result);
  return {
    changes: envelope.data,
    meta: envelope.meta,
    etag: result.response.headers.get("etag"),
  };
}

export async function createAttachmentUpload(
  input: AttachmentUploadInput,
  auth: MutationAuth,
  client: ApiClient = apiClient,
): Promise<AttachmentUploadIntent> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true")
    throw new AdminApiError(
      503,
      "DEMO_ATTACHMENT_UNAVAILABLE",
      "Demo mode không kết nối kho tệp.",
    );
  const result = await client.POST("/api/v1/admin/uploads", {
    params: { header: { "X-CSRF-Token": auth.csrfToken } },
    body: input,
  });
  const data = envelopeData(resultData(result));
  if (
    !isRecord(data) ||
    !isRecord(data.file) ||
    !isRecord(data.upload) ||
    !isRecord(data.upload.headers)
  )
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Upload intent không hợp lệ.",
    );
  const headers = Object.fromEntries(
    Object.entries(data.upload.headers).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  );
  return {
    uploadId: requiredString(data.uploadId, "uploadId"),
    attachmentId: requiredString(data.attachmentId, "attachmentId"),
    status: "uploading",
    file: {
      name: requiredString(data.file.name, "file.name"),
      contentType: requiredString(data.file.contentType, "file.contentType"),
      sizeBytes: requiredNumber(data.file.sizeBytes, "file.sizeBytes"),
      sha256: requiredString(data.file.sha256, "file.sha256"),
    },
    upload: {
      method: "PUT",
      url: requiredString(data.upload.url, "upload.url"),
      headers,
      expiresAt: requiredString(data.upload.expiresAt, "upload.expiresAt"),
    },
  };
}

export async function completeAttachmentUpload(
  uploadId: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  const result = await client.POST(
    "/api/v1/admin/uploads/{uploadId}:complete",
    {
      params: {
        path: { uploadId },
        header: { "X-CSRF-Token": auth.csrfToken },
      },
    },
  );
  return decodeAttachmentMetadata(envelopeData(resultData(result)));
}

export async function getAdminAttachment(
  attachmentId: string,
  client: ApiClient = apiClient,
) {
  const result = await client.GET("/api/v1/admin/attachments/{attachmentId}", {
    params: { path: { attachmentId } },
  });
  return decodeAttachmentMetadata(envelopeData(resultData(result)));
}

export async function deleteUnboundAttachment(
  attachmentId: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  const result = await client.DELETE(
    "/api/v1/admin/attachments/{attachmentId}",
    {
      params: {
        path: { attachmentId },
        header: { "X-CSRF-Token": auth.csrfToken },
      },
    },
  );
  const data = envelopeData(resultData(result));
  if (!isRecord(data))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Delete attachment response không hợp lệ.",
    );
  return {
    id: requiredString(data.id, "attachment.id"),
    status: requiredString(data.status, "attachment.status"),
  };
}

function decodeAttachmentMutation(
  value: unknown,
  response: Response,
  fallbackEtag: string,
) {
  const data = envelopeData(value);
  if (!isRecord(data))
    throw new AdminApiError(
      502,
      "CONTRACT_INVALID",
      "Attachment mutation response không hợp lệ.",
    );
  return {
    feature: decodeFeature(data.feature),
    serverCursor: requiredString(data.serverCursor, "serverCursor"),
    etag: response.headers.get("etag") ?? fallbackEtag,
  };
}

export async function bindFeatureAttachment(
  revisionId: string,
  featureId: string,
  fieldKey: string,
  attachmentId: string,
  etag: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  const result = await client.POST(
    "/api/v1/admin/revisions/{revisionId}/features/{featureId}/attachments:bind",
    {
      params: {
        path: { revisionId, featureId },
        header: {
          "If-Match": etag,
          "Idempotency-Key": operationKey,
          "X-CSRF-Token": auth.csrfToken,
        },
      },
      body: { fieldKey, attachmentId },
    },
  );
  return decodeAttachmentMutation(resultData(result), result.response, etag);
}

export async function reorderFeatureAttachments(
  revisionId: string,
  featureId: string,
  fieldKey: string,
  attachmentIds: string[],
  etag: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  const result = await client.PATCH(
    "/api/v1/admin/revisions/{revisionId}/features/{featureId}/attachments:reorder",
    {
      params: {
        path: { revisionId, featureId },
        header: {
          "If-Match": etag,
          "Idempotency-Key": operationKey,
          "X-CSRF-Token": auth.csrfToken,
        },
      },
      body: { fieldKey, attachmentIds },
    },
  );
  return decodeAttachmentMutation(resultData(result), result.response, etag);
}

export async function unbindFeatureAttachment(
  revisionId: string,
  featureId: string,
  attachmentId: string,
  etag: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  const result = await client.DELETE(
    "/api/v1/admin/revisions/{revisionId}/features/{featureId}/attachments/{attachmentId}",
    {
      params: {
        path: { revisionId, featureId, attachmentId },
        header: {
          "If-Match": etag,
          "Idempotency-Key": operationKey,
          "X-CSRF-Token": auth.csrfToken,
        },
      },
    },
  );
  return decodeAttachmentMutation(resultData(result), result.response, etag);
}

export async function submitRevision(
  revisionId: string,
  summary: string,
  reviewerNote: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    throwDemoMutationError();
    return { status: "in_review" };
  }
  const result = await client.POST(
    "/api/v1/admin/revisions/{revisionId}:submit",
    {
      params: {
        path: { revisionId },
        header: {
          "X-CSRF-Token": auth.csrfToken,
          "Idempotency-Key": operationKey,
        },
      },
      body: { summary, ...(reviewerNote ? { reviewerNote } : {}) },
    },
  );
  return envelopeData(resultData(result));
}

export async function approveRevision(
  revisionId: string,
  comment: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    throwDemoMutationError();
    return { status: "approved" };
  }
  const result = await client.POST(
    "/api/v1/admin/revisions/{revisionId}:approve",
    {
      params: {
        path: { revisionId },
        header: {
          "X-CSRF-Token": auth.csrfToken,
          "Idempotency-Key": operationKey,
        },
      },
      body: { ...(comment ? { comment } : {}) },
    },
  );
  return envelopeData(resultData(result));
}

export async function requestRevisionChanges(
  revisionId: string,
  comment: string,
  operationKey: string,
  auth: MutationAuth,
  client: ApiClient = apiClient,
) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") {
    throwDemoMutationError();
    return { status: "changes_requested" };
  }
  const result = await client.POST(
    "/api/v1/admin/revisions/{revisionId}:request-changes",
    {
      params: {
        path: { revisionId },
        header: {
          "X-CSRF-Token": auth.csrfToken,
          "Idempotency-Key": operationKey,
        },
      },
      body: { comment },
    },
  );
  return envelopeData(resultData(result));
}
