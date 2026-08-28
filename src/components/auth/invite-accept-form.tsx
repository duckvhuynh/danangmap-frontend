"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertCircle,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconKey,
  IconMail,
  IconShieldCheck,
  IconUserShield,
} from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  InviteApiError,
  acceptInvite,
  inspectInvite,
  inviteErrorMessage,
  type InviteInspection,
} from "@/lib/api/invites";

const roleLabels: Record<InviteInspection["role"], string> = {
  editor: "Biên tập viên",
  reviewer: "Kiểm duyệt viên",
  publisher: "Xuất bản viên",
  system_admin: "Quản trị hệ thống",
};

type InviteStage =
  | { name: "entry" }
  | { name: "details"; token: string; inspection: InviteInspection }
  | { name: "accepted"; mfaRequired: boolean }
  | { name: "uncertain"; message: string };

function formatExpiry(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function InviteAlert({
  message,
  errorRef,
  id,
  title = "Không thể xử lý lời mời",
}: {
  message: string;
  errorRef: React.RefObject<HTMLDivElement | null>;
  id?: string;
  title?: string;
}) {
  return (
    <Alert
      className="border-destructive/25 bg-red-50 text-destructive"
      id={id}
      ref={errorRef}
      tabIndex={-1}
      variant="destructive"
    >
      <IconAlertCircle size={18} stroke={1.75} />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

export function InviteAcceptForm() {
  const router = useRouter();
  const inspectLock = useRef(false);
  const acceptLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const detailsRef = useRef<HTMLHeadingElement>(null);
  const tokenRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<InviteStage>({ name: "entry" });
  const [pending, setPending] = useState<"inspect" | "accept" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<"token" | "password" | "confirmation" | null>(null);

  useEffect(() => {
    if (stage.name === "details") detailsRef.current?.focus();
  }, [stage.name]);

  useEffect(() => {
    if (!error) return;
    if (errorField === "token") tokenRef.current?.focus();
    else if (errorField === "password") passwordRef.current?.focus();
    else if (errorField === "confirmation") confirmationRef.current?.focus();
    else errorRef.current?.focus();
  }, [error, errorField]);

  const focusError = (field: typeof errorField = null) => {
    setErrorField(field);
    globalThis.setTimeout(() => {
      if (field === "token") tokenRef.current?.focus();
      else if (field === "password") passwordRef.current?.focus();
      else if (field === "confirmation") confirmationRef.current?.focus();
      else errorRef.current?.focus();
    }, 0);
  };

  const submitInspection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inspectLock.current) return;
    const token = String(new FormData(event.currentTarget).get("inviteToken") ?? "").trim();
    if (token.length < 32) {
      setError("Mã lời mời phải có ít nhất 32 ký tự.");
      focusError("token");
      return;
    }
    inspectLock.current = true;
    setPending("inspect");
    setError(null);
    setErrorField(null);
    try {
      const inspection = await inspectInvite(token);
      setStage({ name: "details", token, inspection });
    } catch (caught) {
      inspectLock.current = false;
      setError(inviteErrorMessage(caught, "inspect"));
      if (
        caught instanceof InviteApiError &&
        (caught.code === "INVITE_INVALID_OR_EXPIRED" || [400, 404, 410].includes(caught.status))
      ) {
        focusError("token");
      } else {
        focusError();
      }
    } finally {
      setPending(null);
    }
  };

  const submitAcceptance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stage.name !== "details" || acceptLock.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");
    if (password.length < 12 || password.length > 200 || password !== passwordConfirmation) {
      setError(
        password !== passwordConfirmation
          ? "Hai ô mật khẩu chưa trùng khớp."
          : "Mật khẩu phải có từ 12 đến 200 ký tự.",
      );
      focusError(password !== passwordConfirmation ? "confirmation" : "password");
      return;
    }
    acceptLock.current = true;
    setPending("accept");
    setError(null);
    setErrorField(null);
    try {
      const result = await acceptInvite({ token: stage.token, password, passwordConfirmation });
      formElement.reset();
      setStage({ name: "accepted", mfaRequired: result.status === "mfa_required" });
      globalThis.setTimeout(() => {
        router.replace(result.status === "authenticated" ? "/admin" : "/login/mfa?enrollment=required");
      }, 0);
    } catch (caught) {
      const message = inviteErrorMessage(caught, "accept");
      if (caught instanceof InviteApiError && caught.ambiguous) {
        formElement.reset();
        setStage({ name: "uncertain", message });
      } else {
        acceptLock.current = false;
        setError(message);
        if (caught instanceof InviteApiError && caught.status === 422) focusError("password");
        else focusError();
      }
    } finally {
      setPending(null);
    }
  };

  if (stage.name === "accepted") {
    return (
      <Alert className="mt-6 border-success/30 bg-surface-subtle text-success" role="status">
        <IconCheck size={18} stroke={1.75} />
        <AlertTitle>Tài khoản đã được tạo</AlertTitle>
        <AlertDescription>
          {stage.mfaRequired
            ? "Đang chuyển tới bước thiết lập xác thực hai lớp."
            : "Đang chuyển tới trang quản trị."}
        </AlertDescription>
      </Alert>
    );
  }

  if (stage.name === "uncertain") {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <Alert aria-live="assertive" className="border-warning/30 bg-surface-subtle text-warning">
          <IconAlertCircle size={18} stroke={1.75} />
          <AlertTitle>Trạng thái kích hoạt chưa xác định</AlertTitle>
          <AlertDescription>
            {stage.message} Hãy đăng nhập lại để hệ thống áp dụng đúng chính sách xác thực hiện tại.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.replace("/login")} type="button">
          Đi đến đăng nhập
          <IconArrowRight data-icon="inline-end" stroke={1.75} />
        </Button>
      </div>
    );
  }

  if (stage.name === "entry") {
    return (
      <form className="mt-7 flex flex-col gap-5" onSubmit={submitInspection}>
        <Field data-invalid={errorField === "token"}>
          <FieldLabel htmlFor="invite-token">Mã lời mời</FieldLabel>
          <Input
            aria-describedby={`invite-token-help${error ? " invite-error" : ""}`}
            aria-invalid={errorField === "token"}
            autoCapitalize="none"
            autoComplete="off"
            disabled={pending === "inspect"}
            id="invite-token"
            maxLength={512}
            minLength={32}
            name="inviteToken"
            placeholder="Dán mã trong nội dung email"
            required
            ref={tokenRef}
            spellCheck={false}
          />
          <FieldDescription id="invite-token-help">
            Chỉ dán mã tại đây. Không đưa mã vào địa chỉ trang hoặc chia sẻ ảnh chụp màn hình.
          </FieldDescription>
        </Field>
        {error && <InviteAlert errorRef={errorRef} id="invite-error" message={error} />}
        <Button disabled={pending === "inspect"} type="submit">
          <IconMail data-icon="inline-start" stroke={1.75} />
          {pending === "inspect" ? "Đang kiểm tra..." : "Kiểm tra lời mời"}
        </Button>
      </form>
    );
  }

  return (
    <div className="mt-7 flex flex-col gap-5">
      <section
        aria-labelledby="invite-summary-title"
        className="rounded-control border bg-surface-subtle p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-primary">
              Lời mời đã xác minh
            </p>
            <h2
              className="mt-1 text-base font-semibold outline-none"
              id="invite-summary-title"
              ref={detailsRef}
              tabIndex={-1}
            >
              Kiểm tra thông tin tài khoản
            </h2>
          </div>
          <Badge className="border border-primary/20 bg-accent-subtle text-primary">
            Còn hiệu lực
          </Badge>
        </div>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="flex items-start gap-3">
            <IconMail className="mt-0.5 shrink-0 text-muted-foreground" size={18} stroke={1.75} />
            <div><dt className="text-muted-foreground">Email</dt><dd className="mt-0.5 font-medium">{stage.inspection.maskedEmail}</dd></div>
          </div>
          <div className="flex items-start gap-3">
            <IconUserShield className="mt-0.5 shrink-0 text-muted-foreground" size={18} stroke={1.75} />
            <div><dt className="text-muted-foreground">Vai trò</dt><dd className="mt-0.5 font-medium">{roleLabels[stage.inspection.role]}</dd></div>
          </div>
          <div className="flex items-start gap-3">
            <IconClock className="mt-0.5 shrink-0 text-muted-foreground" size={18} stroke={1.75} />
            <div><dt className="text-muted-foreground">Hết hạn</dt><dd className="mt-0.5 font-medium">{formatExpiry(stage.inspection.expiresAt)}</dd></div>
          </div>
        </dl>
      </section>

      <Alert className="border-primary/20 bg-accent-subtle text-foreground" role="note">
        <IconShieldCheck className="text-primary" size={18} stroke={1.75} />
        <AlertTitle>{stage.inspection.requiresMfaEnrollment ? "Thiết lập MFA" : "Xác thực bằng mật khẩu"}</AlertTitle>
        <AlertDescription>
          {stage.inspection.requiresMfaEnrollment
            ? "Sau khi tạo mật khẩu, bạn sẽ được chuyển tới bước đăng ký ứng dụng xác thực."
            : "Sau khi tạo mật khẩu, bạn sẽ được đăng nhập theo chính sách xác thực hiện tại."}
        </AlertDescription>
      </Alert>

      <form className="flex flex-col gap-5" onSubmit={submitAcceptance}>
        <FieldGroup className="gap-5">
          <Field data-invalid={errorField === "password"}>
            <FieldLabel htmlFor="invite-password">Mật khẩu mới</FieldLabel>
            <Input
              aria-describedby={`invite-password-help${error ? " invite-error" : ""}`}
              aria-invalid={errorField === "password"}
              autoComplete="new-password"
              disabled={pending === "accept"}
              id="invite-password"
              maxLength={200}
              minLength={12}
              name="password"
              required
              ref={passwordRef}
              type="password"
            />
            <FieldDescription id="invite-password-help">Tối thiểu 12 ký tự. Không dùng lại mật khẩu ở hệ thống khác.</FieldDescription>
          </Field>
          <Field data-invalid={errorField === "confirmation"}>
            <FieldLabel htmlFor="invite-password-confirmation">Nhập lại mật khẩu</FieldLabel>
            <Input
              aria-describedby={error ? "invite-error" : undefined}
              aria-invalid={errorField === "confirmation"}
              autoComplete="new-password"
              disabled={pending === "accept"}
              id="invite-password-confirmation"
              maxLength={200}
              minLength={12}
              name="passwordConfirmation"
              required
              ref={confirmationRef}
              type="password"
            />
          </Field>
        </FieldGroup>
        {error && <InviteAlert errorRef={errorRef} id="invite-error" message={error} />}
        <Button disabled={pending === "accept"} type="submit">
          <IconKey data-icon="inline-start" stroke={1.75} />
          {pending === "accept" ? "Đang tạo tài khoản..." : "Tạo mật khẩu và tiếp tục"}
        </Button>
      </form>
    </div>
  );
}
