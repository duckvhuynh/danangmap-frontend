"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconAlertCircle,
  IconArrowRight,
  IconCheck,
  IconRefresh,
  IconShieldCheck,
  IconUserPlus,
} from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import {
  BootstrapApiError,
  bootstrapErrorMessage,
  bootstrapSystemAdmin,
  getBootstrapStatus,
} from "@/lib/api/bootstrap";

type SetupStage =
  | { name: "loading" }
  | { name: "available" }
  | { name: "unavailable"; message: string }
  | { name: "status-error"; message: string }
  | { name: "created"; mfaRequired: boolean }
  | { name: "uncertain"; message: string };

type SetupField =
  | "displayName"
  | "email"
  | "username"
  | "password"
  | "passwordConfirmation"
  | "bootstrapToken";

const usernamePattern = /^[a-z][a-z0-9._-]{2,63}$/;
const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;

export function BootstrapSetupForm() {
  const router = useRouter();
  const createLock = useRef(false);
  const statusControllerRef = useRef<AbortController | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const fieldRefs = useRef<Partial<Record<SetupField, HTMLInputElement | null>>>({});
  const [stage, setStage] = useState<SetupStage>({ name: "loading" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<SetupField | null>(null);

  const requestStatus = useCallback(() => {
    statusControllerRef.current?.abort();
    const controller = new AbortController();
    statusControllerRef.current = controller;
    getBootstrapStatus({ signal: controller.signal })
      .then((status) => {
        setStage(
          status.available
            ? { name: "available" }
            : {
                name: "unavailable",
                message:
                  "Hệ thống đã có tài khoản quản trị hoặc tính năng khởi tạo chưa được người vận hành máy chủ bật.",
              },
        );
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setStage({
          name: "status-error",
          message: bootstrapErrorMessage(caught, "status"),
        });
      });
  }, []);

  useEffect(() => {
    requestStatus();
    return () => statusControllerRef.current?.abort();
  }, [requestStatus]);

  const retryStatus = () => {
    setStage({ name: "loading" });
    setError(null);
    requestStatus();
  };

  useEffect(() => {
    if (!error) return;
    const target = errorField ? fieldRefs.current[errorField] : errorRef.current;
    target?.focus();
  }, [error, errorField]);

  const focusError = (field: SetupField | null = null) => {
    setErrorField(field);
    globalThis.setTimeout(() => {
      const target = field ? fieldRefs.current[field] : errorRef.current;
      target?.focus();
    }, 0);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stage.name !== "available" || createLock.current) return;

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const displayName = String(form.get("displayName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("passwordConfirmation") ?? "");
    const bootstrapToken = String(form.get("bootstrapToken") ?? "").trim();

    if (displayName.length < 2 || displayName.length > 200) {
      setError("Tên hiển thị phải có từ 2 đến 200 ký tự.");
      focusError("displayName");
      return;
    }
    if (
      email.length < 3 ||
      email.length > 254 ||
      !fieldRefs.current.email?.validity.valid
    ) {
      setError("Email quản trị chưa đúng định dạng.");
      focusError("email");
      return;
    }
    if (!usernamePattern.test(username)) {
      setError(
        "Tên đăng nhập gồm 3 đến 64 ký tự thường, bắt đầu bằng chữ và chỉ dùng chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.",
      );
      focusError("username");
      return;
    }
    if (
      password.length < 14 ||
      password.length > 200 ||
      !strongPasswordPattern.test(password)
    ) {
      setError(
        "Mật khẩu phải có từ 14 đến 200 ký tự, gồm chữ thường, chữ hoa, số và ký tự đặc biệt.",
      );
      focusError("password");
      return;
    }
    const emailLocalPart = email.split("@")[0] ?? "";
    const normalizedPassword = password.toLowerCase();
    if (
      normalizedPassword.includes(username) ||
      (emailLocalPart.length >= 3 && normalizedPassword.includes(emailLocalPart))
    ) {
      setError("Mật khẩu không được chứa tên đăng nhập hoặc phần đứng trước @ trong email.");
      focusError("password");
      return;
    }
    if (password !== passwordConfirmation) {
      setError("Hai ô mật khẩu chưa trùng khớp.");
      focusError("passwordConfirmation");
      return;
    }
    if (bootstrapToken.length < 43 || bootstrapToken.length > 512) {
      setError("Mã khởi tạo phải có từ 43 đến 512 ký tự.");
      focusError("bootstrapToken");
      return;
    }

    createLock.current = true;
    setPending(true);
    setError(null);
    setErrorField(null);
    try {
      const result = await bootstrapSystemAdmin(
        { displayName, email, username, password, passwordConfirmation },
        bootstrapToken,
      );
      formElement.reset();
      setStage({ name: "created", mfaRequired: result.status === "mfa_required" });
      globalThis.setTimeout(() => {
        router.replace(result.status === "authenticated" ? "/admin" : "/login/mfa?enrollment=required");
      }, 0);
    } catch (caught) {
      const message = bootstrapErrorMessage(caught, "create");
      if (caught instanceof BootstrapApiError && caught.ambiguous) {
        formElement.reset();
        setStage({ name: "uncertain", message });
      } else if (
        caught instanceof BootstrapApiError &&
        (caught.status === 409 || caught.status === 503)
      ) {
        formElement.reset();
        setStage({ name: "unavailable", message });
      } else {
        createLock.current = false;
        setError(message);
        if (caught instanceof BootstrapApiError && caught.status === 401) {
          const tokenInput = fieldRefs.current.bootstrapToken;
          if (tokenInput) tokenInput.value = "";
          focusError("bootstrapToken");
        } else if (caught instanceof BootstrapApiError && caught.status === 422) {
          focusError("password");
        } else {
          focusError();
        }
      }
    } finally {
      setPending(false);
    }
  };

  if (stage.name === "loading") {
    return (
      <div aria-busy="true" aria-label="Đang kiểm tra trạng thái khởi tạo" className="mt-7 flex flex-col gap-5">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    );
  }

  if (stage.name === "status-error") {
    return (
      <div className="mt-7 flex flex-col gap-4">
        <Alert className="border-warning/30 bg-surface-subtle text-warning" role="alert">
          <IconAlertCircle stroke={1.75} />
          <AlertTitle>Chưa kiểm tra được trạng thái</AlertTitle>
          <AlertDescription>{stage.message}</AlertDescription>
        </Alert>
        <Button onClick={retryStatus} type="button" variant="outline">
          <IconRefresh data-icon="inline-start" stroke={1.75} />
          Thử kiểm tra lại
        </Button>
      </div>
    );
  }

  if (stage.name === "unavailable") {
    return (
      <Alert className="mt-7 border-primary/20 bg-accent-subtle text-foreground" role="status">
        <IconShieldCheck className="text-primary" stroke={1.75} />
        <AlertTitle>Không thể khởi tạo tài khoản đầu tiên</AlertTitle>
        <AlertDescription>{stage.message}</AlertDescription>
      </Alert>
    );
  }

  if (stage.name === "created") {
    return (
      <Alert className="mt-7 border-success/30 bg-surface-subtle text-success" role="status">
        <IconCheck stroke={1.75} />
        <AlertTitle>System Admin đã được tạo</AlertTitle>
        <AlertDescription>
          {stage.mfaRequired
            ? "Đang chuyển tới bước thiết lập ứng dụng xác thực và mã khôi phục."
            : "Đang chuyển tới trang quản trị."}
        </AlertDescription>
      </Alert>
    );
  }

  if (stage.name === "uncertain") {
    return (
      <div className="mt-7 flex flex-col gap-4">
        <Alert aria-live="assertive" className="border-warning/30 bg-surface-subtle text-warning">
          <IconAlertCircle stroke={1.75} />
          <AlertTitle>Trạng thái khởi tạo chưa xác định</AlertTitle>
          <AlertDescription>
            {stage.message} Hãy quay lại đăng nhập để hệ thống áp dụng đúng chính sách xác thực hiện tại.
          </AlertDescription>
        </Alert>
        <Button onClick={() => router.replace("/login")} type="button">
          Đi đến đăng nhập
          <IconArrowRight data-icon="inline-end" stroke={1.75} />
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-7 flex flex-col gap-5">
      <Alert className="border-primary/20 bg-accent-subtle text-foreground" role="note">
        <IconShieldCheck className="text-primary" stroke={1.75} />
        <AlertTitle>Một lần duy nhất</AlertTitle>
        <AlertDescription>
          Tài khoản này có toàn quyền System Admin. Sau khi tạo, hệ thống sẽ áp dụng chính sách xác thực được cấu hình trên máy chủ.
        </AlertDescription>
      </Alert>

      <form className="flex flex-col gap-5" noValidate onSubmit={submit}>
        <FieldGroup className="gap-5">
          <Field data-invalid={errorField === "displayName"}>
            <FieldLabel htmlFor="setup-display-name">Tên hiển thị</FieldLabel>
            <Input
              aria-describedby={error ? "setup-error" : undefined}
              aria-invalid={errorField === "displayName"}
              autoComplete="name"
              disabled={pending}
              id="setup-display-name"
              maxLength={200}
              minLength={2}
              name="displayName"
              required
              ref={(element) => { fieldRefs.current.displayName = element; }}
            />
          </Field>
          <Field data-invalid={errorField === "email"}>
            <FieldLabel htmlFor="setup-email">Email nội bộ</FieldLabel>
            <Input
              aria-describedby={error ? "setup-error" : undefined}
              aria-invalid={errorField === "email"}
              autoCapitalize="none"
              autoComplete="email"
              disabled={pending}
              id="setup-email"
              maxLength={254}
              minLength={3}
              name="email"
              required
              ref={(element) => { fieldRefs.current.email = element; }}
              spellCheck={false}
              type="email"
            />
          </Field>
          <Field data-invalid={errorField === "username"}>
            <FieldLabel htmlFor="setup-username">Tên đăng nhập</FieldLabel>
            <Input
              aria-describedby={`setup-username-help${error ? " setup-error" : ""}`}
              aria-invalid={errorField === "username"}
              autoCapitalize="none"
              autoComplete="username"
              disabled={pending}
              id="setup-username"
              maxLength={64}
              minLength={3}
              name="username"
              pattern="[a-z][a-z0-9._-]{2,63}"
              placeholder="system.admin"
              required
              ref={(element) => { fieldRefs.current.username = element; }}
              spellCheck={false}
            />
            <FieldDescription id="setup-username-help">
              Chỉ dùng chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang.
            </FieldDescription>
          </Field>
          <Field data-invalid={errorField === "password"}>
            <FieldLabel htmlFor="setup-password">Mật khẩu</FieldLabel>
            <Input
              aria-describedby={`setup-password-help${error ? " setup-error" : ""}`}
              aria-invalid={errorField === "password"}
              autoComplete="new-password"
              disabled={pending}
              id="setup-password"
              maxLength={200}
              minLength={14}
              name="password"
              required
              ref={(element) => { fieldRefs.current.password = element; }}
              type="password"
            />
            <FieldDescription id="setup-password-help">
              Từ 14 ký tự, có chữ thường, chữ hoa, số và ký tự đặc biệt. Không chứa email hoặc tên đăng nhập.
            </FieldDescription>
          </Field>
          <Field data-invalid={errorField === "passwordConfirmation"}>
            <FieldLabel htmlFor="setup-password-confirmation">Nhập lại mật khẩu</FieldLabel>
            <Input
              aria-describedby={error ? "setup-error" : undefined}
              aria-invalid={errorField === "passwordConfirmation"}
              autoComplete="new-password"
              disabled={pending}
              id="setup-password-confirmation"
              maxLength={200}
              minLength={14}
              name="passwordConfirmation"
              required
              ref={(element) => { fieldRefs.current.passwordConfirmation = element; }}
              type="password"
            />
          </Field>
          <Field data-invalid={errorField === "bootstrapToken"}>
            <FieldLabel htmlFor="setup-token">Mã khởi tạo một lần</FieldLabel>
            <Input
              aria-describedby={`setup-token-help${error ? " setup-error" : ""}`}
              aria-invalid={errorField === "bootstrapToken"}
              autoCapitalize="none"
              autoComplete="off"
              disabled={pending}
              id="setup-token"
              maxLength={512}
              minLength={43}
              name="bootstrapToken"
              required
              ref={(element) => { fieldRefs.current.bootstrapToken = element; }}
              spellCheck={false}
              type="password"
            />
            <FieldDescription id="setup-token-help">
              Lấy từ người vận hành máy chủ. Mã không được lưu trên trình duyệt và không được đưa vào đường dẫn.
            </FieldDescription>
          </Field>
        </FieldGroup>

        {error && (
          <Alert
            className="border-destructive/25 bg-red-50 text-destructive"
            id="setup-error"
            ref={errorRef}
            tabIndex={-1}
            variant="destructive"
          >
            <IconAlertCircle stroke={1.75} />
            <AlertTitle>Không thể tạo System Admin</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button disabled={pending} type="submit">
          {pending ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <IconUserPlus data-icon="inline-start" stroke={1.75} />
          )}
          {pending ? "Đang tạo tài khoản..." : "Tạo System Admin và tiếp tục"}
        </Button>
      </form>
    </div>
  );
}
