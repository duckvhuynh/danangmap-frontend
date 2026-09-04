"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  TriangleAlert as IconAlertTriangle,
  ArrowDown as IconArrowDown,
  ArrowUp as IconArrowUp,
  File as IconFile,
  Image as IconPhoto,
  RefreshCw as IconRefresh,
  ShieldCheck as IconShieldCheck,
  Trash2 as IconTrash,
  Upload as IconUpload,
} from "lucide-react";
import { AdminErrorNotice } from "@/components/admin/admin-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AdminApiError,
  adminErrorMessage,
  bindFeatureAttachment,
  completeAttachmentUpload,
  createAttachmentUpload,
  deleteUnboundAttachment,
  getAdminAttachment,
  reorderFeatureAttachments,
  unbindFeatureAttachment,
  type AdminFeature,
  type AdminField,
  type AttachmentMetadata,
  type MutationAuth,
} from "@/lib/api/admin";
import {
  attachmentAccept,
  AttachmentClientError,
  attachmentContentType,
  attachmentSha256,
  uploadAttachmentObject,
} from "@/lib/attachments/upload";
import {
  draftDb,
  type AttachmentRecoveryIntent,
  type AttachmentRecoveryPhase,
} from "@/lib/editor/draft-db";

type AttachmentMutationResult = Awaited<
  ReturnType<typeof bindFeatureAttachment>
>;

export interface AttachmentTransport {
  createUpload: typeof createAttachmentUpload;
  putObject: typeof uploadAttachmentObject;
  completeUpload: typeof completeAttachmentUpload;
  getAttachment: typeof getAdminAttachment;
  deleteUnbound: typeof deleteUnboundAttachment;
  bind: typeof bindFeatureAttachment;
  reorder: typeof reorderFeatureAttachments;
  unbind: typeof unbindFeatureAttachment;
}

const defaultTransport: AttachmentTransport = {
  createUpload: createAttachmentUpload,
  putObject: uploadAttachmentObject,
  completeUpload: completeAttachmentUpload,
  getAttachment: getAdminAttachment,
  deleteUnbound: deleteUnboundAttachment,
  bind: bindFeatureAttachment,
  reorder: reorderFeatureAttachments,
  unbind: unbindFeatureAttachment,
};

interface TaskView extends AttachmentRecoveryIntent {
  progress?: number;
  error?: unknown;
  status?: AttachmentMetadata["status"];
  rejectionCode?: string | null;
}

interface FeatureAttachmentPanelProps {
  principalId: string;
  revisionId: string;
  feature: AdminFeature | null;
  fields: AdminField[];
  etag: string;
  auth: MutationAuth;
  disabled?: boolean;
  onFeatureChanged(result: AttachmentMutationResult): void;
  transport?: AttachmentTransport;
}

const terminalStatuses = new Set<AttachmentMetadata["status"]>([
  "clean",
  "infected",
  "rejected",
  "deleted",
]);

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} MB`;
}

function taskLabel(task: TaskView) {
  if (task.error) return "Cần xử lý";
  if (task.phase === "uploading") return "Đang tải lên";
  if (task.phase === "scanning") return "Đang quét an toàn";
  return "Đang gắn vào đối tượng";
}

export function FeatureAttachmentPanel({
  principalId,
  revisionId,
  feature,
  fields,
  etag,
  auth,
  disabled = false,
  onFeatureChanged,
  transport = defaultTransport,
}: FeatureAttachmentPanelProps) {
  const attachmentFields = useMemo(
    () =>
      fields.filter(
        (field) => field.type === "image" || field.type === "attachment",
      ),
    [fields],
  );
  const [preferredFieldKey, setPreferredFieldKey] = useState(
    attachmentFields[0]?.key ?? "",
  );
  const fieldKey = attachmentFields.some(
    (field) => field.key === preferredFieldKey,
  )
    ? preferredFieldKey
    : (attachmentFields[0]?.key ?? "");
  const [tasks, setTasks] = useState<TaskView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const etagRef = useRef(etag);
  const featureId = feature ? String(feature.id) : null;

  useEffect(() => {
    etagRef.current = etag;
  }, [etag]);

  useEffect(() => {
    let active = true;
    async function loadRecovery() {
      if (!featureId) {
        if (active) setTasks([]);
        return;
      }
      try {
        const items = await draftDb.attachmentIntents
          .where("revisionId")
          .equals(revisionId)
          .filter(
            (intent) =>
              intent.principalId === principalId &&
              intent.featureId === featureId,
          )
          .toArray();
        if (active) setTasks(items);
      } catch (reason) {
        if (active) setError(reason);
      }
    }
    void loadRecovery();
    return () => {
      active = false;
    };
  }, [featureId, principalId, revisionId]);

  useEffect(() => () => uploadAbortRef.current?.abort(), []);

  const selectedField =
    attachmentFields.find((field) => field.key === fieldKey) ?? null;
  const attachments = (feature?.attachments ?? [])
    .filter((attachment) => attachment.fieldKey === fieldKey)
    .sort(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.id.localeCompare(right.id),
    );

  function updateTask(id: string, update: Partial<TaskView>) {
    setTasks((current) =>
      current.map((task) => (task.id === id ? { ...task, ...update } : task)),
    );
  }

  async function persistPhase(
    intent: AttachmentRecoveryIntent,
    phase: AttachmentRecoveryPhase,
  ) {
    const updatedAt = new Date().toISOString();
    const next = { ...intent, phase, updatedAt };
    await draftDb.attachmentIntents.put(next);
    updateTask(intent.id, { phase, updatedAt, error: undefined });
    return next;
  }

  async function waitForScan(attachmentId: string) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const metadata = await transport.getAttachment(attachmentId);
      updateTask(attachmentId, {
        status: metadata.status,
        rejectionCode: metadata.rejectionCode,
      });
      if (terminalStatuses.has(metadata.status)) return metadata;
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    throw new AttachmentClientError(
      "ATTACHMENT_SCAN_TIMEOUT",
      "Quá trình quét đang mất nhiều thời gian. Có thể kiểm tra lại mà không cần tải tệp lần nữa.",
    );
  }

  async function bindCleanIntent(intent: AttachmentRecoveryIntent) {
    const binding = await persistPhase(intent, "binding");
    const result = await transport.bind(
      revisionId,
      binding.featureId,
      binding.fieldKey,
      binding.attachmentId,
      etagRef.current,
      binding.operationKey,
      auth,
    );
    etagRef.current = result.etag;
    await draftDb.attachmentIntents.delete(binding.id);
    setTasks((current) => current.filter((task) => task.id !== binding.id));
    onFeatureChanged(result);
  }

  async function continueIntent(intent: AttachmentRecoveryIntent) {
    setBusy(intent.id);
    setError(null);
    updateTask(intent.id, { error: undefined });
    try {
      let activeIntent = intent;
      if (activeIntent.phase === "uploading") {
        const completed = await transport.completeUpload(
          activeIntent.uploadId,
          auth,
        );
        updateTask(activeIntent.id, {
          status: completed.status,
          rejectionCode: completed.rejectionCode,
        });
        activeIntent = await persistPhase(activeIntent, "scanning");
      }
      const metadata = await waitForScan(activeIntent.attachmentId);
      if (metadata.status === "clean") {
        await bindCleanIntent(activeIntent);
        return;
      }
      if (metadata.status === "deleted") {
        await draftDb.attachmentIntents.delete(activeIntent.id);
        setTasks((current) =>
          current.filter((task) => task.id !== activeIntent.id),
        );
        return;
      }
      throw new AdminApiError(
        422,
        metadata.rejectionCode ?? `ATTACHMENT_${metadata.status.toUpperCase()}`,
        metadata.status === "infected"
          ? "Tệp bị từ chối vì phát hiện nội dung nguy hiểm."
          : "Tệp không vượt qua kiểm tra an toàn.",
      );
    } catch (reason) {
      updateTask(intent.id, { error: reason });
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    if (!feature || !selectedField) return;
    let recovery: AttachmentRecoveryIntent | null = null;
    setBusy("new");
    setError(null);
    try {
      const contentType = attachmentContentType(file);
      if (selectedField.type === "image" && !contentType.startsWith("image/")) {
        throw new AttachmentClientError(
          "SCHEMA_VIOLATION",
          "Trường hình ảnh chỉ nhận JPG, PNG, GIF hoặc WebP.",
        );
      }
      const sha256 = await attachmentSha256(file);
      const intent = await transport.createUpload(
        {
          purpose: "feature_attachment",
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          sha256,
        },
        auth,
      );
      const now = new Date().toISOString();
      const recoveryIntent: AttachmentRecoveryIntent = {
        id: intent.attachmentId,
        principalId,
        revisionId,
        featureId: String(feature.id),
        fieldKey: selectedField.key,
        uploadId: intent.uploadId,
        attachmentId: intent.attachmentId,
        fileName: intent.file.name,
        contentType: intent.file.contentType,
        sizeBytes: intent.file.sizeBytes,
        sha256: intent.file.sha256,
        phase: "uploading",
        operationKey: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      recovery = recoveryIntent;
      await draftDb.attachmentIntents.put(recoveryIntent);
      setTasks((current) => [
        ...current.filter((task) => task.id !== recoveryIntent.id),
        recoveryIntent,
      ]);
      const controller = new AbortController();
      uploadAbortRef.current = controller;
      await transport.putObject({
        file,
        url: intent.upload.url,
        headers: intent.upload.headers,
        signal: controller.signal,
        onProgress: (progress) => updateTask(recoveryIntent.id, { progress }),
      });
      await continueIntent(recoveryIntent);
    } catch (reason) {
      if (recovery) updateTask(recovery.id, { error: reason });
      else setError(reason);
    } finally {
      uploadAbortRef.current = null;
      setBusy(null);
    }
  }

  async function removeRecovery(task: TaskView) {
    setBusy(task.id);
    setError(null);
    try {
      await transport.deleteUnbound(task.attachmentId, auth);
      await draftDb.attachmentIntents.delete(task.id);
      setTasks((current) =>
        current.filter((candidate) => candidate.id !== task.id),
      );
    } catch (reason) {
      updateTask(task.id, { error: reason });
    } finally {
      setBusy(null);
    }
  }

  async function reorder(index: number, direction: -1 | 1) {
    if (!feature || !selectedField) return;
    const target = index + direction;
    if (target < 0 || target >= attachments.length) return;
    const next = [...attachments];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setBusy(`order:${attachments[index]!.id}`);
    setError(null);
    try {
      const result = await transport.reorder(
        revisionId,
        String(feature.id),
        selectedField.key,
        next.map((attachment) => attachment.id),
        etagRef.current,
        crypto.randomUUID(),
        auth,
      );
      etagRef.current = result.etag;
      onFeatureChanged(result);
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(null);
    }
  }

  async function unbind(attachmentId: string) {
    if (!feature) return;
    setBusy(`remove:${attachmentId}`);
    setError(null);
    try {
      const result = await transport.unbind(
        revisionId,
        String(feature.id),
        attachmentId,
        etagRef.current,
        crypto.randomUUID(),
        auth,
      );
      etagRef.current = result.etag;
      onFeatureChanged(result);
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(null);
    }
  }

  if (!feature) {
    return (
      <section className="rounded-control border border-dashed p-3 text-xs leading-5 text-muted-foreground">
        Chọn một đối tượng đã lưu trên bản đồ để quản lý hình ảnh và tệp đính
        kèm.
      </section>
    );
  }

  if (attachmentFields.length === 0) {
    return (
      <section className="rounded-control border border-dashed p-3 text-xs leading-5 text-muted-foreground">
        Lớp này chưa có trường hình ảnh hoặc tệp đính kèm. Thêm trường trong cấu hình lớp để sử dụng.
      </section>
    );
  }

  return (
    <section aria-labelledby="feature-attachments-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="feature-attachments-title" className="text-sm font-semibold">
            Tệp đính kèm
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Tệp được kiểm tra an toàn trước khi thêm vào đối tượng.
          </p>
        </div>
        <Badge className="bg-accent-subtle text-primary">
          {attachments.length}
        </Badge>
      </div>

      <label
        className="mt-4 block text-xs font-medium"
        htmlFor="attachment-field"
      >
        Trường dữ liệu
      </label>
      <select
        id="attachment-field"
        className="mt-2 h-10 w-full rounded-control border bg-surface px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/25"
        value={fieldKey}
        disabled={disabled || busy !== null}
        onChange={(event) => setPreferredFieldKey(event.target.value)}
      >
        {attachmentFields.map((field) => (
          <option key={field.key} value={field.key}>
            {field.label}
          </option>
        ))}
      </select>

      <label
        className="mt-3 block text-xs font-medium"
        htmlFor="attachment-file"
      >
        Chọn tệp, tối đa 25 MB
      </label>
      <Input
        id="attachment-file"
        className="mt-2 h-auto min-h-10 py-1.5 file:mr-3 file:rounded-control file:border-0 file:bg-accent-subtle file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary"
        type="file"
        accept={attachmentAccept(selectedField?.type ?? "attachment")}
        disabled={disabled || busy !== null}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void upload(file);
        }}
      />

      {tasks.length > 0 && (
        <div className="mt-4 space-y-2" aria-live="polite">
          {tasks.map((task) => (
            <article
              key={task.id}
              className="rounded-control border bg-surface-subtle p-3"
            >
              <div className="flex items-start gap-2">
                {task.error ? (
                  <IconAlertTriangle
                    className="mt-0.5 shrink-0 text-warning"
                    size={18}
                  />
                ) : task.phase === "binding" ? (
                  <IconShieldCheck
                    className="mt-0.5 shrink-0 text-success"
                    size={18}
                  />
                ) : (
                  <IconUpload
                    className="mt-0.5 shrink-0 text-primary"
                    size={18}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {task.fileName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {taskLabel(task)} · {formatBytes(task.sizeBytes)}
                  </p>
                </div>
              </div>
              {!task.error && task.phase === "uploading" && (
                <progress
                  className="mt-2 h-1.5 w-full accent-primary"
                  max={100}
                  value={task.progress ?? 0}
                  aria-label={`Tiến độ tải ${task.fileName}`}
                />
              )}
              {task.error !== undefined && (
                <p
                  className="mt-2 text-xs leading-5 text-destructive"
                  role="alert"
                >
                  {task.error instanceof AttachmentClientError
                    ? task.error.message
                    : adminErrorMessage(task.error)}
                </p>
              )}
              <div className="mt-2 flex justify-end gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => void continueIntent(task)}
                >
                  <IconRefresh />
                  Tiếp tục
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={busy !== null}
                  onClick={() => void removeRecovery(task)}
                >
                  <IconTrash />
                  Xóa
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      {error !== null && (
        <div className="mt-3">
          <AdminErrorNotice error={error} />
        </div>
      )}

      <div className="mt-4 space-y-2">
        {attachments.length === 0 ? (
          <div className="rounded-control border border-dashed p-3 text-center text-xs text-muted-foreground">
            Chưa có tệp đính kèm. Chọn một tệp để thêm.
          </div>
        ) : (
          attachments.map((attachment, index) => {
            const FileIcon = attachment.contentType.startsWith("image/")
              ? IconPhoto
              : IconFile;
            return (
              <article
                key={attachment.id}
                className="flex items-center gap-2 rounded-control border p-2.5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary">
                  <FileIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {attachment.fileName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatBytes(attachment.sizeBytes)} · Đã kiểm tra an toàn
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-10"
                  aria-label={`Đưa ${attachment.fileName} lên`}
                  disabled={disabled || busy !== null || index === 0}
                  onClick={() => void reorder(index, -1)}
                >
                  <IconArrowUp />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-10"
                  aria-label={`Đưa ${attachment.fileName} xuống`}
                  disabled={
                    disabled ||
                    busy !== null ||
                    index === attachments.length - 1
                  }
                  onClick={() => void reorder(index, 1)}
                >
                  <IconArrowDown />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  className="size-10 text-destructive"
                  aria-label={`Gỡ ${attachment.fileName}`}
                  disabled={disabled || busy !== null}
                  onClick={() => void unbind(attachment.id)}
                >
                  <IconTrash />
                </Button>
              </article>
            );
          })
        )}
      </div>
      <p className="mt-3 text-[11px] leading-4 text-muted-foreground">
        Tệp chỉ hiển thị cho người dân sau khi nội dung được công bố và trường chứa tệp được đặt là công khai.
      </p>
    </section>
  );
}
