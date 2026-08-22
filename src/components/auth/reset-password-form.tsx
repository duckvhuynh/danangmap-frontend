"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IconAlertCircle, IconKey } from "@tabler/icons-react";
import { SecurityError, SecuritySuccess } from "@/components/auth/security-feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  accountSecurityErrorMessage,
  isTerminalResetConfirmation,
  type AccountSecurityActions,
} from "@/lib/auth/account-security-model";
import { confirmPasswordReset as confirmPasswordResetRequest } from "@/lib/api/account-security";

type Stage = "form" | "success" | "uncertain";

export function ResetPasswordForm({
  confirmPasswordReset = confirmPasswordResetRequest,
}: {
  confirmPasswordReset?: AccountSecurityActions["confirmPasswordReset"];
} = {}) {
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
    const token = String(form.get("resetToken") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");
    if (token.length < 32 || token.length > 512) {
      setError("Mã đặt lại mật khẩu phải có từ 32 đến 512 ký tự.");
      focusError();
      return;
    }
    if (password.length < 12 || password.length > 200 || password !== passwordConfirmation) {
      setError(
        password !== passwordConfirmation
          ? "Hai ô mật khẩu chưa trùng khớp."
          : "Mật khẩu phải có từ 12 đến 200 ký tự.",
      );
      focusError();
      return;
    }
    submitLock.current = true;
    setPending(true);
    setError(null);
    try {
      await confirmPasswordReset({ token, password, passwordConfirmation });
      setStage("success");
      globalThis.setTimeout(() => router.replace("/login"), 0);
    } catch (caught) {
      const message = accountSecurityErrorMessage(caught, "confirm-reset");
      if (isTerminalResetConfirmation(caught)) {
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
          description="Các phiên cũ đã bị thu hồi. Đang chuyển tới trang đăng nhập mới."
          title="Mật khẩu đã được đặt lại"
        />
      </div>
    );
  }

  if (stage === "uncertain") {
    return (
      <div className="mt-7 flex flex-col gap-4">
        <Alert className="border-warning/30 bg-surface-subtle text-warning">
          <IconAlertCircle size={18} stroke={1.75} />
          <AlertTitle>Trạng thái đặt lại chưa xác định</AlertTitle>
          <AlertDescription>
            Mã một lần có thể đã được sử dụng. DanangMap không tự gửi lại mật khẩu; hãy thử đăng nhập
            bằng mật khẩu mới, hoặc yêu cầu một mã khác nếu cần.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.replace("/login")} type="button">
          Thử đăng nhập bằng mật khẩu mới
        </Button>
        <Button asChild type="button" variant="outline">
          <Link href="/login/forgot-password">Yêu cầu mã đặt lại khác</Link>
        </Button>
      </div>
    );
  }

  return (
    <form className="mt-7 flex flex-col gap-5" onSubmit={submit}>
      <FieldGroup className="gap-5">
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="reset-token">Mã đặt lại mật khẩu</FieldLabel>
          <Input
            aria-invalid={Boolean(error)}
            autoCapitalize="none"
            autoComplete="off"
            disabled={pending}
            id="reset-token"
            maxLength={512}
            minLength={32}
            name="resetToken"
            placeholder="Dán mã trong nội dung email"
            required
            spellCheck={false}
          />
          <FieldDescription>Chỉ dán mã tại đây. Mã không được đặt trong địa chỉ trang.</FieldDescription>
        </Field>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="reset-password">Mật khẩu mới</FieldLabel>
          <Input
            aria-invalid={Boolean(error)}
            autoComplete="new-password"
            disabled={pending}
            id="reset-password"
            maxLength={200}
            minLength={12}
            name="password"
            required
            type="password"
          />
        </Field>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="reset-password-confirmation">Nhập lại mật khẩu mới</FieldLabel>
          <Input
            aria-invalid={Boolean(error)}
            autoComplete="new-password"
            disabled={pending}
            id="reset-password-confirmation"
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
        {pending ? "Đang đặt lại mật khẩu..." : "Đặt lại mật khẩu"}
      </Button>
    </form>
  );
}
