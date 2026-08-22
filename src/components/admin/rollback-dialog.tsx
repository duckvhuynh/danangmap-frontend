"use client";

import { useRef, useState } from "react";
import { IconHistory, IconRotateClockwise } from "@tabler/icons-react";
import { AdminErrorNotice } from "@/components/admin/admin-session";
import { historyDate } from "@/components/admin/history-format";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { AdminApiError, type MutationAuth } from "@/lib/api/admin";
import { rollbackLayer, type LayerPublicationHistory, type RollbackResult } from "@/lib/api/history";

type Publication = LayerPublicationHistory["items"][number];

export interface RollbackDialogTransport {
  rollback: typeof rollbackLayer;
}

const defaultTransport: RollbackDialogTransport = { rollback: rollbackLayer };

export function RollbackDialog({
  layerId,
  publication,
  activePointerEtag,
  auth,
  disabled = false,
  transport = defaultTransport,
  onSuccess,
  onStale,
}: {
  layerId: string;
  publication: Publication;
  activePointerEtag: string;
  auth: MutationAuth;
  disabled?: boolean;
  transport?: RollbackDialogTransport;
  onSuccess: (result: RollbackResult) => void;
  onStale?: (error: AdminApiError) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const operationKey = useRef<string | null>(null);
  const reasonInputRef = useRef<HTMLInputElement>(null);
  const restoreTriggerFocusRef = useRef(true);
  const valid = reason.trim().length >= 10 && confirmation === "KHÔI PHỤC";
  const reasonInvalid = reason.length > 0 && reason.trim().length < 10;
  const confirmationInvalid = confirmation.length > 0 && confirmation !== "KHÔI PHỤC";
  const reasonDescriptionId = `rollback-reason-description-${publication.snapshotId}`;
  const reasonErrorId = `rollback-reason-error-${publication.snapshotId}`;
  const confirmationDescriptionId = `rollback-confirm-description-${publication.snapshotId}`;
  const confirmationErrorId = `rollback-confirm-error-${publication.snapshotId}`;

  function resetOperation() {
    operationKey.current = null;
    setError(null);
  }

  function close(nextOpen: boolean) {
    if (pending) return;
    if (nextOpen) restoreTriggerFocusRef.current = true;
    setOpen(nextOpen);
    if (!nextOpen) {
      setReason("");
      setConfirmation("");
      resetOperation();
    }
  }

  async function submit() {
    if (!valid || pending) return;
    operationKey.current ??= crypto.randomUUID();
    setPending(true);
    setError(null);
    try {
      const result = await transport.rollback(
        layerId,
        { targetSnapshotId: publication.snapshotId, reason: reason.trim(), clientIntent: "desktop" },
        activePointerEtag,
        operationKey.current,
        auth,
      );
      restoreTriggerFocusRef.current = false;
      onSuccess(result.data);
      operationKey.current = null;
      setOpen(false);
      setReason("");
      setConfirmation("");
    } catch (reasonError) {
      setError(reasonError);
      if (reasonError instanceof AdminApiError) {
        if (reasonError.code === "ETAG_MISMATCH" || reasonError.code === "PUBLICATION_POINTER_STALE") {
          operationKey.current = null;
          onStale?.(reasonError);
        } else if (reasonError.status < 500 && reasonError.code !== "IDEMPOTENCY_IN_PROGRESS") {
          operationKey.current = null;
        }
      }
    } finally {
      setPending(false);
    }
  }

  return <Dialog open={open} onOpenChange={close}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Khôi phục bản này, generation ${publication.generation}`}>
        <IconRotateClockwise aria-hidden="true" data-icon="inline-start" stroke={1.75}/>
        Khôi phục bản này
      </Button>
    </DialogTrigger>
    <DialogContent onOpenAutoFocus={(event) => {
      event.preventDefault();
      reasonInputRef.current?.focus();
    }} onCloseAutoFocus={(event) => {
      if (!restoreTriggerFocusRef.current) event.preventDefault();
      restoreTriggerFocusRef.current = true;
    }}>
      <DialogHeader>
        <DialogTitle>Khôi phục publication generation {publication.generation}</DialogTitle>
        <DialogDescription>Thao tác tạo một publication mới và chuyển active pointer sau khi transaction hoàn tất. Snapshot cũ không bị xóa.</DialogDescription>
      </DialogHeader>

      <Alert role="note">
        <IconHistory aria-hidden="true" stroke={1.75}/>
        <AlertTitle>Snapshot được chọn</AlertTitle>
        <AlertDescription>
          Revision {publication.revisionNo}, {publication.featureCount.toLocaleString("vi-VN")} đối tượng, kích hoạt lúc {historyDate(publication.activatedAt)}.
        </AlertDescription>
      </Alert>

      <form aria-busy={pending} onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}>
        {error !== null && (
          <AdminErrorNotice error={error}/>
        )}

        <FieldGroup className={error !== null ? "mt-5" : undefined}>
        <Field data-invalid={reasonInvalid || undefined}>
          <FieldLabel htmlFor={`rollback-reason-${publication.snapshotId}`}>Lý do khôi phục</FieldLabel>
          <Input
            ref={reasonInputRef}
            id={`rollback-reason-${publication.snapshotId}`}
            value={reason}
            onChange={(event) => { setReason(event.target.value); resetOperation(); }}
            aria-invalid={reasonInvalid || undefined}
            aria-describedby={`${reasonDescriptionId}${reasonInvalid ? ` ${reasonErrorId}` : ""}`}
            placeholder="Ít nhất 10 ký tự"
            autoComplete="off"
          />
          <FieldDescription id={reasonDescriptionId}>Lý do được ghi vào workflow và audit, không dùng để lưu dữ liệu riêng tư.</FieldDescription>
          {reasonInvalid && <FieldError id={reasonErrorId}>Lý do cần ít nhất 10 ký tự.</FieldError>}
        </Field>
        <Field data-invalid={confirmationInvalid || undefined}>
          <FieldLabel htmlFor={`rollback-confirm-${publication.snapshotId}`}>Nhập KHÔI PHỤC để xác nhận</FieldLabel>
          <Input
            id={`rollback-confirm-${publication.snapshotId}`}
            value={confirmation}
            onChange={(event) => { setConfirmation(event.target.value); resetOperation(); }}
            aria-invalid={confirmationInvalid || undefined}
            aria-describedby={`${confirmationDescriptionId}${confirmationInvalid ? ` ${confirmationErrorId}` : ""}`}
            autoComplete="off"
          />
          <FieldDescription id={confirmationDescriptionId}>Cụm từ xác nhận phải khớp chính xác để tránh rollback ngoài ý muốn.</FieldDescription>
          {confirmationInvalid && <FieldError id={confirmationErrorId}>Cụm từ xác nhận chưa chính xác.</FieldError>}
        </Field>
        </FieldGroup>

        <DialogFooter className="mt-5">
        <Button type="button" variant="outline" disabled={pending} onClick={() => close(false)}>Hủy</Button>
        <Button type="submit" variant="destructive" disabled={!valid || pending}>
          {pending ? (
            <Spinner data-icon="inline-start"/>
          ) : (
            <IconRotateClockwise aria-hidden="true" data-icon="inline-start" stroke={1.75}/>
          )}
          {pending ? "Đang khôi phục..." : "Xác nhận khôi phục"}
        </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
