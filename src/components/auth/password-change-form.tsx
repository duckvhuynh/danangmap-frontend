"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle, IconKey } from "@tabler/icons-react";
import { SecurityError, SecuritySuccess } from "@/components/auth/security-feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  accountSecurityErrorMessage,
  isTerminalPasswordChange,
  type AccountSecurityActions,
} from "@/lib/auth/account-security-model";
import { changePassword as changePasswordRequest } from "@/lib/api/account-security";

type Stage = "form" | "success" | "uncertain";

export function PasswordChangeForm({
  changePassword = changePasswordRequest,
}: {
  changePassword?: AccountSecurityActions["changePassword"];
}) {
  const router = useRouter();
  const submitLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const focusError = () => globalThis.setTimeout(() => errorRef.current?.focus(), 0);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");
    if (
      currentPassword.length < 12 ||
      newPassword.length < 12 ||
      newPassword.length > 200 ||
      newPassword !== passwordConfirmation
    ) {
      setError(
        newPassword !== passwordConfirmation
          ? "Hai ô mật khẩu mới chưa trùng khớp."
          : "Mỗi mật khẩu phải có từ 12 đến 200 ký tự.",
      );
      focusError();
      return;
    }
    submitLock.current = true;
    setPending(true);
    setError(null);
    const idempotencyKey = crypto.randomUUID();
    try {
      await changePassword(
        { currentPassword, newPassword, passwordConfirmation },
        idempotencyKey,
      );
      setStage("success");
      globalThis.setTimeout(() => router.replace("/admin"), 0);
    } catch (caught) {
      const message = accountSecurityErrorMessage(caught, "change");
      if (isTerminalPasswordChange(caught)) {
        setStage("uncertain");
      } else {
        submitLock.current = false;
        setError(message);
        focusError();
      }
    } finally {
      setPending(false);
    }
  }

  if (stage === "success") {
    return (
      <div className="mt-7">
        <SecuritySuccess
          description="Phiên bảo mật đã được xoay. Đang chuyển tới trang quản trị."
          title="Mật khẩu đã được đổi"
        />
      </div>
    );
  }

  if (stage === "uncertain") {
    return (
      <div className="mt-7 flex flex-col gap-4">
        <Alert className="border-warning/30 bg-surface-subtle text-warning">
          <IconAlertCircle size={18} stroke={1.75} />
          <AlertTitle>Trạng thái đổi mật khẩu chưa xác định</AlertTitle>
          <AlertDescription>
            Máy chủ có thể đã đổi mật khẩu và thu hồi phiên cũ. DanangMap không tự gửi lại yêu cầu;
            hãy đăng nhập bằng mật khẩu mới trước.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.replace("/login")} type="button">
          Đăng nhập bằng mật khẩu mới
        </Button>
      </div>
    );
  }

  return (
    <form className="mt-7 flex flex-col gap-5" onSubmit={submit}>
      <FieldGroup className="gap-5">
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="current-password">Mật khẩu hiện tại</FieldLabel>
          <Input
            aria-invalid={Boolean(error)}
            autoComplete="current-password"
            disabled={pending}
            id="current-password"
            maxLength={200}
            minLength={12}
            name="currentPassword"
            required
            type="password"
          />
        </Field>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="new-password">Mật khẩu mới</FieldLabel>
          <Input
            aria-invalid={Boolean(error)}
            autoComplete="new-password"
            disabled={pending}
            id="new-password"
            maxLength={200}
            minLength={12}
            name="newPassword"
            required
            type="password"
          />
          <FieldDescription>Từ 12 đến 200 ký tự và khác mật khẩu hiện tại.</FieldDescription>
        </Field>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="new-password-confirmation">Nhập lại mật khẩu mới</FieldLabel>
          <Input
            aria-invalid={Boolean(error)}
            autoComplete="new-password"
            disabled={pending}
            id="new-password-confirmation"
            maxLength={200}
            minLength={12}
            name="passwordConfirmation"
            required
            type="password"
          />
        </Field>
      </FieldGroup>
      {error && <SecurityError errorRef={errorRef} message={error} />}
      <Button disabled={pending} type="submit">
        <IconKey data-icon="inline-start" stroke={1.75} />
        {pending ? "Đang đổi mật khẩu..." : "Đổi mật khẩu và tiếp tục"}
      </Button>
    </form>
  );
}
