"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleAlert as IconAlertCircle,
  Check as IconCheck,
  Clipboard as IconClipboard,
  Download as IconDownload,
  KeyRound as IconKey,
  QrCode as IconQrcode,
} from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { QRCodeCanvas } from "qrcode.react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import {
  AuthApiError,
  authErrorMessage,
  confirmMfaEnrollment,
  parseEnrollmentUri,
  startMfaEnrollment,
  verifyMfa,
  type AuthPrincipal,
  type MfaMethod,
  type ParsedEnrollmentUri,
} from "@/lib/api/auth";
import { cn } from "@/lib/utils";

function TotpInput({ value, onChange, disabled, invalid, label }: { value: string; onChange: (value: string) => void; disabled: boolean; invalid: boolean; label: string }) {
  return (
    <InputOTP
      aria-label={label}
      aria-invalid={invalid}
      autoComplete="one-time-code"
      containerClassName="justify-center"
      disabled={disabled}
      inputMode="numeric"
      maxLength={6}
      name="code"
      onChange={onChange}
      pattern={REGEXP_ONLY_DIGITS}
      value={value}
    >
      <InputOTPGroup>
        {[0, 1, 2].map((index) => <InputOTPSlot aria-invalid={invalid} index={index} key={index} />)}
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        {[3, 4, 5].map((index) => <InputOTPSlot aria-invalid={invalid} index={index} key={index} />)}
      </InputOTPGroup>
    </InputOTP>
  );
}

function InlineError({ message, errorRef }: { message: string; errorRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <Alert className="border-destructive/25 bg-red-50 text-destructive" ref={errorRef} tabIndex={-1} variant="destructive">
      <IconAlertCircle size={18} strokeWidth={1.75} />
      <AlertTitle>Không thể xác thực</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function ExistingMfaForm() {
  const router = useRouter();
  const errorRef = useRef<HTMLDivElement>(null);
  const [method, setMethod] = useState<MfaMethod>("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const changeMethod = (nextMethod: MfaMethod) => {
    setMethod(nextMethod);
    setCode("");
    setError(null);
  };

  return (
    <form className="mt-6 flex flex-col gap-4" onSubmit={async (event) => {
      event.preventDefault();
      if (pending) return;
      setPending(true);
      setError(null);
      try {
        const principal = await verifyMfa(method, code);
        if (principal.mustChangePassword) {
          router.replace("/login/password-change");
          return;
        }
        router.replace("/admin");
      } catch (caught) {
        setCode("");
        setError(authErrorMessage(caught, "verify"));
        globalThis.setTimeout(() => errorRef.current?.focus(), 0);
      } finally {
        setPending(false);
      }
    }}>
      <div className="grid grid-cols-2 rounded-control border bg-surface-subtle p-1" role="group" aria-label="Phương thức xác thực">
        <button type="button" aria-pressed={method === "totp"} onClick={() => changeMethod("totp")} className={cn("rounded-control px-2 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", method === "totp" && "bg-surface text-primary map-control-shadow")}>Ứng dụng xác thực</button>
        <button type="button" aria-pressed={method === "recovery_code"} onClick={() => changeMethod("recovery_code")} className={cn("rounded-control px-2 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring", method === "recovery_code" && "bg-surface text-primary map-control-shadow")}>Mã khôi phục</button>
      </div>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={method === "totp" ? undefined : "mfa-recovery-code"}>{method === "totp" ? "Mã xác thực 6 số" : "Mã khôi phục"}</FieldLabel>
        {method === "totp" ? (
          <TotpInput disabled={pending} invalid={Boolean(error)} label="Mã xác thực 6 số" onChange={setCode} value={code} />
        ) : (
          <Input aria-invalid={Boolean(error)} autoCapitalize="characters" autoComplete="one-time-code" disabled={pending} id="mfa-recovery-code" maxLength={32} minLength={20} onChange={(event) => setCode(event.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" required value={code} />
        )}
        <FieldDescription>{method === "totp" ? "Mở ứng dụng xác thực đã đăng ký với DanangMap." : "Mỗi mã khôi phục chỉ sử dụng được một lần."}</FieldDescription>
      </Field>
      {error && <InlineError errorRef={errorRef} message={error} />}
      <Button disabled={pending || code.length < (method === "totp" ? 6 : 20)} type="submit">{pending ? "Đang xác thực..." : "Xác nhận"}</Button>
    </form>
  );
}

type EnrollmentStage =
  | { name: "intro" }
  | { name: "setup"; setup: ParsedEnrollmentUri }
  | { name: "recovery"; principal: AuthPrincipal; codes: string[] }
  | { name: "restart"; message: string };

function mustRestartEnrollment(error: unknown) {
  return error instanceof AuthApiError && (error.ambiguous || error.status === 401 || error.status === 403 || error.status === 409 || error.status >= 500);
}

function EnrollmentFlow() {
  const router = useRouter();
  const startLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<EnrollmentStage>({ name: "intro" });
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState<"secret" | "codes" | null>(null);

  const focusError = () => globalThis.setTimeout(() => errorRef.current?.focus(), 0);

  const start = async () => {
    if (startLock.current) return;
    startLock.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await startMfaEnrollment();
      setStage({ name: "setup", setup: parseEnrollmentUri(result.enrollmentUri) });
    } catch (caught) {
      const message = authErrorMessage(caught, "enroll");
      if (mustRestartEnrollment(caught)) {
        setStage({ name: "restart", message });
      } else {
        startLock.current = false;
        setError(message);
        focusError();
      }
    } finally {
      setPending(false);
    }
  };

  const copyText = async (value: string, kind: "secret" | "codes") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setError("Trình duyệt không cho phép sao chép. Hãy chọn và sao chép thủ công.");
      focusError();
    }
  };

  const confirm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || code.length !== 6) return;
    setPending(true);
    setError(null);
    try {
      const result = await confirmMfaEnrollment(code);
      setCode("");
      setStage({ name: "recovery", principal: result.principal, codes: [...result.recoveryCodes] });
    } catch (caught) {
      const message = authErrorMessage(caught, "confirm");
      const terminal = caught instanceof AuthApiError && (caught.ambiguous || caught.status === 403 || caught.status === 409 || (caught.status === 401 && caught.code !== "AUTH_MFA_INVALID"));
      if (terminal) setStage({ name: "restart", message });
      else {
        setCode("");
        setError(message);
        focusError();
      }
    } finally {
      setPending(false);
    }
  };

  const downloadCodes = (codes: string[]) => {
    const blob = new Blob([`Mã khôi phục DanangMap\n\n${codes.join("\n")}\n`], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "danangmap-recovery-codes.txt";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (stage.name === "restart") {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <Alert className="border-warning/30 bg-surface-subtle text-warning">
          <IconAlertCircle size={18} strokeWidth={1.75} />
          <AlertTitle>Cần đăng nhập lại</AlertTitle>
          <AlertDescription>{stage.message} DanangMap không tự gọi lại enrollment để tránh hiển thị sai secret.</AlertDescription>
        </Alert>
        <Button onClick={() => router.replace("/login")} type="button">Đăng nhập lại bằng mật khẩu</Button>
      </div>
    );
  }

  if (stage.name === "recovery") {
    return (
      <div className="mt-6 flex flex-col gap-5">
        <Alert className="border-success/30 bg-surface-subtle text-success">
          <IconCheck size={18} strokeWidth={1.75} />
          <AlertTitle>Đã bật xác thực hai bước</AlertTitle>
          <AlertDescription>10 mã dưới đây chỉ hiển thị trong bước này. Mỗi mã dùng được một lần.</AlertDescription>
        </Alert>
        <ol aria-label="10 mã khôi phục" className="grid grid-cols-1 gap-2 rounded-control border bg-surface-subtle p-3 sm:grid-cols-2">
          {stage.codes.map((recoveryCode, index) => <li className="rounded-control bg-surface px-3 py-2 font-mono text-sm" key={recoveryCode}><span className="sr-only">Mã {index + 1}: </span>{recoveryCode}</li>)}
        </ol>
        {error && <InlineError errorRef={errorRef} message={error} />}
        <div className="grid gap-2 sm:grid-cols-2">
          <Button onClick={() => void copyText(stage.codes.join("\n"), "codes")} type="button" variant="outline"><IconClipboard strokeWidth={1.75} />{copied === "codes" ? "Đã sao chép" : "Sao chép 10 mã"}</Button>
          <Button onClick={() => downloadCodes(stage.codes)} type="button" variant="outline"><IconDownload strokeWidth={1.75} />Tải tệp .txt</Button>
        </div>
        <Field orientation="horizontal">
          <Checkbox checked={acknowledged} id="codes-saved" onCheckedChange={(checked) => setAcknowledged(checked === true)} />
          <FieldContent>
            <FieldLabel htmlFor="codes-saved">Tôi đã lưu mã khôi phục ở nơi an toàn</FieldLabel>
            <FieldDescription>DanangMap không thể hiển thị lại các mã này sau khi rời trang.</FieldDescription>
          </FieldContent>
        </Field>
        <Button disabled={!acknowledged} onClick={() => {
          const mustChangePassword = stage.principal.mustChangePassword;
          setStage({ name: "intro" });
          router.replace(mustChangePassword ? "/login/password-change" : "/admin");
        }} type="button">Tiếp tục vào trang quản trị</Button>
      </div>
    );
  }

  if (stage.name === "intro") {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <div className="rounded-control border bg-surface-subtle p-4">
          <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-map-control bg-accent-subtle text-primary"><IconKey strokeWidth={1.75} /></span><div><h2 className="text-sm font-semibold">Thiết lập ứng dụng xác thực</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">Chuẩn bị ứng dụng TOTP như Microsoft Authenticator, Google Authenticator hoặc ứng dụng tương đương.</p></div></div>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">Mã QR và khóa thủ công chỉ được máy chủ cấp một lần. Nhấn nút khi bạn sẵn sàng quét mã.</p>
        {error && <InlineError errorRef={errorRef} message={error} />}
        <Button disabled={pending} onClick={() => void start()} type="button"><IconQrcode strokeWidth={1.75} />{pending ? "Đang tạo mã thiết lập..." : "Thiết lập xác thực hai bước"}</Button>
      </div>
    );
  }

  return (
    <form className="mt-6 flex flex-col gap-5" onSubmit={confirm}>
      <div className="grid justify-items-center gap-3 rounded-control border bg-surface-subtle p-4">
        <div className="rounded-control border bg-white p-2">
          <QRCodeCanvas aria-label="Mã QR thiết lập xác thực hai bước DanangMap" bgColor="#FFFFFF" fgColor="#202124" level="M" marginSize={4} role="img" size={192} title="Quét mã QR để thiết lập xác thực hai bước" value={stage.setup.uri} />
        </div>
        <p className="text-center text-sm text-muted-foreground">Quét bằng ứng dụng xác thực cho <span className="font-medium text-foreground">{stage.setup.accountLabel}</span>.</p>
      </div>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel>Không quét được mã QR?</FieldLabel>
          <div className="flex items-center gap-2 rounded-control border bg-surface-subtle p-2 pl-3">
            <code className="min-w-0 flex-1 break-all text-sm font-semibold tracking-[0.08em]" data-testid="manual-mfa-secret">{stage.setup.secret}</code>
            <Button aria-label="Sao chép khóa thiết lập thủ công" onClick={() => void copyText(stage.setup.secret, "secret")} size="icon-sm" type="button" variant="ghost"><IconClipboard strokeWidth={1.75} /></Button>
          </div>
          <FieldDescription>{copied === "secret" ? "Đã sao chép khóa." : `Nhập khóa thủ công trong ứng dụng${stage.setup.issuer ? ` với nhà phát hành ${stage.setup.issuer}` : ""}.`}</FieldDescription>
        </Field>
        <Field data-invalid={Boolean(error)}>
          <FieldLabel>Mã xác nhận 6 số</FieldLabel>
          <TotpInput disabled={pending} invalid={Boolean(error)} label="Mã xác nhận 6 số" onChange={setCode} value={code} />
          <FieldDescription>Nhập mã đang hiển thị trong ứng dụng để hoàn tất thiết lập.</FieldDescription>
        </Field>
      </FieldGroup>
      {error && <InlineError errorRef={errorRef} message={error} />}
      <Button disabled={pending || code.length !== 6} type="submit">{pending ? "Đang xác nhận..." : "Xác nhận và tạo mã khôi phục"}</Button>
    </form>
  );
}

export function MfaForm({ enrollmentRequired }: { enrollmentRequired: boolean }) {
  return enrollmentRequired ? <EnrollmentFlow /> : <ExistingMfaForm />;
}
