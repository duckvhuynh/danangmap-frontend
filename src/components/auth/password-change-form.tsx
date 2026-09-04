"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert as IconAlertCircle,
  KeyRound as IconKey,
} from "lucide-react";
import { SecurityError, SecuritySuccess } from "@/components/auth/security-feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  AccountSecurityError,
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
  const attemptKey = useRef<string | null>(null);
  const attemptFingerprint = useRef<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const newPasswordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"current" | "new" | "confirmation" | null>(null);

  useEffect(() => {
    if (!error) return;
    if (errorField === "current") currentPasswordRef.current?.focus();
    else if (errorField === "new") newPasswordRef.current?.focus();
    else if (errorField === "confirmation") confirmationRef.current?.focus();
    else errorRef.current?.focus();
  }, [error, errorField]);

  const focusError = (field: typeof errorField = null) => {
    setErrorField(field);
    globalThis.setTimeout(() => {
      if (field === "current") currentPasswordRef.current?.focus();
      else if (field === "new") newPasswordRef.current?.focus();
      else if (field === "confirmation") confirmationRef.current?.focus();
      else errorRef.current?.focus();
    }, 0);
  };

  const resetAttempt = () => {
    attemptKey.current = null;
    attemptFingerprint.current = null;
    setError(null);
    setErrorField(null);
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
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
      focusError(newPassword !== passwordConfirmation ? "confirmation" : currentPassword.length < 12 ? "current" : "new");
      return;
    }
    const fingerprint = JSON.stringify([currentPassword, newPassword, passwordConfirmation]);
    if (!attemptKey.current || attemptFingerprint.current !== fingerprint) {
      attemptKey.current = crypto.randomUUID();
      attemptFingerprint.current = fingerprint;
    }
    submitLock.current = true;
    setPending(true);
    setError(null);
    setErrorField(null);
    try {
      await changePassword(
        { currentPassword, newPassword, passwordConfirmation },
        attemptKey.current,
      );
      formElement.reset();
      resetAttempt();
      setStage("success");
      globalThis.setTimeout(() => router.replace("/admin"), 0);
    } catch (caught) {
      const message = accountSecurityErrorMessage(caught, "change");
      if (isTerminalPasswordChange(caught)) {
        formElement.reset();
        resetAttempt();
        setStage("uncertain");
      } else {
        submitLock.current = false;
        setError(message);
        if (caught instanceof AccountSecurityError && caught.status === 401 && caught.code === "AUTH_INVALID_CREDENTIALS") {
          focusError("current");
        } else if (caught instanceof AccountSecurityError && caught.status === 422) {
          focusError("new");
        } else {
          focusError();
        }
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
        <Alert aria-live="assertive" className="border-warning/30 bg-surface-subtle text-warning">
          <IconAlertCircle size={18} strokeWidth={1.75} />
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
        <Field data-invalid={errorField === "current"}>
          <FieldLabel htmlFor="current-password">Mật khẩu hiện tại</FieldLabel>
          <Input
            aria-describedby={error ? "password-change-error" : undefined}
            aria-invalid={errorField === "current"}
            autoComplete="current-password"
            disabled={pending}
            id="current-password"
            maxLength={200}
            minLength={12}
            name="currentPassword"
            required
            ref={currentPasswordRef}
            type="password"
            onChange={resetAttempt}
          />
        </Field>
        <Field data-invalid={errorField === "new"}>
          <FieldLabel htmlFor="new-password">Mật khẩu mới</FieldLabel>
          <Input
            aria-describedby={`new-password-help${error ? " password-change-error" : ""}`}
            aria-invalid={errorField === "new"}
            autoComplete="new-password"
            disabled={pending}
            id="new-password"
            maxLength={200}
            minLength={12}
            name="newPassword"
            required
            ref={newPasswordRef}
            type="password"
            onChange={resetAttempt}
          />
          <FieldDescription id="new-password-help">Từ 12 đến 200 ký tự và khác mật khẩu hiện tại.</FieldDescription>
        </Field>
        <Field data-invalid={errorField === "confirmation"}>
          <FieldLabel htmlFor="new-password-confirmation">Nhập lại mật khẩu mới</FieldLabel>
          <Input
            aria-describedby={error ? "password-change-error" : undefined}
            aria-invalid={errorField === "confirmation"}
            autoComplete="new-password"
            disabled={pending}
            id="new-password-confirmation"
            maxLength={200}
            minLength={12}
            name="passwordConfirmation"
            required
            ref={confirmationRef}
            type="password"
            onChange={resetAttempt}
          />
        </Field>
      </FieldGroup>
      {error && <SecurityError errorRef={errorRef} id="password-change-error" message={error} />}
      <Button disabled={pending} type="submit">
        <IconKey data-icon="inline-start" strokeWidth={1.75} />
        {pending ? "Đang đổi mật khẩu..." : "Đổi mật khẩu và tiếp tục"}
      </Button>
    </form>
  );
}
