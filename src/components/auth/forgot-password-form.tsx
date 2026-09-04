"use client";

import { useEffect, useRef, useState } from "react";
import { Forward as IconMailForward } from "lucide-react";
import { SecurityError, SecuritySuccess } from "@/components/auth/security-feedback";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  AccountSecurityError,
  accountSecurityErrorMessage,
  type AccountSecurityActions,
} from "@/lib/auth/account-security-model";
import { requestPasswordReset as requestPasswordResetRequest } from "@/lib/api/account-security";

export function ForgotPasswordForm({
  requestPasswordReset = requestPasswordResetRequest,
}: {
  requestPasswordReset?: AccountSecurityActions["requestPasswordReset"];
} = {}) {
  const submitLock = useRef(false);
  const attemptKey = useRef<string | null>(null);
  const attemptEmail = useRef<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailInvalid, setEmailInvalid] = useState(false);

  useEffect(() => {
    if (!error) return;
    if (emailInvalid) emailRef.current?.focus();
    else errorRef.current?.focus();
  }, [emailInvalid, error]);

  const focusError = (fieldInvalid = false) => {
    setEmailInvalid(fieldInvalid);
    globalThis.setTimeout(() => {
      if (fieldInvalid) emailRef.current?.focus();
      else errorRef.current?.focus();
    }, 0);
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current) return;
    const email = String(new FormData(event.currentTarget).get("email") ?? "")
      .trim()
      .toLocaleLowerCase("vi");
    if (!email || !email.includes("@")) {
      setError("Nhập địa chỉ email hợp lệ.");
      focusError(true);
      return;
    }
    if (!attemptKey.current || attemptEmail.current !== email) {
      attemptKey.current = crypto.randomUUID();
      attemptEmail.current = email;
    }
    submitLock.current = true;
    setPending(true);
    setError(null);
    setEmailInvalid(false);
    try {
      await requestPasswordReset(email, attemptKey.current);
      attemptKey.current = null;
      attemptEmail.current = null;
      setComplete(true);
    } catch (caught) {
      if (!(caught instanceof AccountSecurityError) || !caught.ambiguous) {
        attemptKey.current = null;
        attemptEmail.current = null;
      }
      submitLock.current = false;
      setError(accountSecurityErrorMessage(caught, "request-reset"));
      focusError();
    } finally {
      setPending(false);
    }
  }

  if (complete) {
    return (
      <div className="mt-7">
        <SecuritySuccess
          description="Nếu email thuộc một tài khoản phù hợp, hệ thống sẽ gửi hướng dẫn đặt lại mật khẩu. Phản hồi này không xác nhận tài khoản có tồn tại hay không."
          title="Đã tiếp nhận yêu cầu"
        />
      </div>
    );
  }

  return (
    <form className="mt-7 flex flex-col gap-5" onSubmit={submit}>
      <Field data-invalid={emailInvalid}>
        <FieldLabel htmlFor="reset-email">Email tài khoản nội bộ</FieldLabel>
        <Input
          aria-describedby={`reset-email-help${error ? " reset-request-error" : ""}`}
          aria-invalid={emailInvalid}
          autoCapitalize="none"
          autoComplete="email"
          disabled={pending}
          id="reset-email"
          maxLength={254}
          name="email"
          onChange={() => {
            attemptKey.current = null;
            attemptEmail.current = null;
            setError(null);
            setEmailInvalid(false);
          }}
          ref={emailRef}
          required
          spellCheck={false}
          type="email"
        />
        <FieldDescription id="reset-email-help">Vì bảo mật, DanangMap luôn trả cùng một thông báo cho mọi email.</FieldDescription>
      </Field>
      {error && <SecurityError errorRef={errorRef} id="reset-request-error" message={error} />}
      <Button disabled={pending} type="submit">
        <IconMailForward data-icon="inline-start" strokeWidth={1.75} />
        {pending ? "Đang gửi yêu cầu..." : "Gửi hướng dẫn đặt lại"}
      </Button>
    </form>
  );
}
