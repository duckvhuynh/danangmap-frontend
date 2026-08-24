export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  png: ["image/png"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  pdf: ["application/pdf"],
  txt: ["text/plain"],
  csv: ["text/csv", "text/plain"],
  json: ["application/json"],
  geojson: ["application/geo+json", "application/json"],
  kml: ["application/vnd.google-earth.kml+xml", "application/xml", "text/xml"],
  zip: ["application/zip"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  pptx: [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
};

export class AttachmentClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AttachmentClientError";
  }
}

export function attachmentContentType(
  file: Pick<File, "name" | "type" | "size">,
) {
  if (file.size < 1) {
    throw new AttachmentClientError(
      "ATTACHMENT_EMPTY",
      "Tệp rỗng không thể tải lên.",
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentClientError(
      "RESOURCE_LIMIT_EXCEEDED",
      "Tệp đính kèm vượt quá giới hạn 25 MiB.",
    );
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const allowed = MIME_BY_EXTENSION[extension];
  if (!allowed) {
    throw new AttachmentClientError(
      "ATTACHMENT_TYPE_UNSUPPORTED",
      "Định dạng tệp này chưa được hỗ trợ.",
    );
  }
  const declared = file.type.split(";", 1)[0]?.trim().toLowerCase();
  if (declared && !allowed.includes(declared)) {
    throw new AttachmentClientError(
      "ATTACHMENT_TYPE_UNSUPPORTED",
      "Định dạng và MIME của tệp không khớp.",
    );
  }
  return declared || allowed[0]!;
}

export async function attachmentSha256(file: Blob) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

interface UploadAttachmentObjectOptions {
  file: Blob;
  url: string;
  headers: Record<string, string>;
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
}

export function uploadAttachmentObject({
  file,
  url,
  headers,
  signal,
  onProgress,
}: UploadAttachmentObjectOptions) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    const fail = (error: AttachmentClientError) => {
      cleanup();
      reject(error);
    };

    request.open("PUT", url, true);
    request.withCredentials = false;
    request.timeout = 5 * 60 * 1000;
    for (const [name, value] of Object.entries(headers))
      request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress?.(
        Math.min(100, Math.round((event.loaded / event.total) * 100)),
      );
    };
    request.onload = () => {
      cleanup();
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      reject(
        new AttachmentClientError(
          `UPLOAD_HTTP_${request.status}`,
          "Kho lưu trữ không chấp nhận tệp. Hãy tạo lượt tải lên mới.",
        ),
      );
    };
    request.onerror = () =>
      fail(
        new AttachmentClientError(
          "UPLOAD_NETWORK_ERROR",
          "Không thể kết nối kho lưu trữ. Kiểm tra kết nối và thử lại.",
        ),
      );
    request.ontimeout = () =>
      fail(
        new AttachmentClientError(
          "UPLOAD_TIMEOUT",
          "Tải tệp quá thời gian cho phép.",
        ),
      );
    request.onabort = () =>
      fail(new AttachmentClientError("UPLOAD_ABORTED", "Đã hủy tải tệp."));
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }
    request.send(file);
  });
}

export function attachmentAccept(fieldType: string) {
  return fieldType === "image"
    ? "image/jpeg,image/png,image/gif,image/webp"
    : Object.values(MIME_BY_EXTENSION)
        .flat()
        .filter((mime, index, all) => all.indexOf(mime) === index)
        .join(",");
}
