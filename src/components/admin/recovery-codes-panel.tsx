"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import {
  IconAlertTriangle,
  IconCheck,
  IconClipboard,
  IconDeviceDesktop,
  IconDownload,
  IconKey,
} from "@tabler/icons-react";
import { SecurityError } from "@/components/auth/security-feedback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  getDesktopAuthoringCapability,
  getServerDesktopAuthoringCapability,
  subscribeDesktopAuthoringCapability,
} from "@/lib/admin/authoring-capability";
import { regenerateRecoveryCodes as regenerateRecoveryCodesRequest } from "@/lib/api/account-security";
import {
  accountSecurityErrorMessage,
  mustRestartRecoveryCodeRegeneration,
  type AccountSecurityActions,
} from "@/lib/auth/account-security-model";

type Stage =
  | { name: "form" }
  | { name: "codes"; codes: string[] }
  | { name: "restart"; message: string };

function downloadCodes(codes: string[]) {
  const blob = new Blob([`Mã khôi phục DanangMap\n\n${codes.join("\n")}\n`], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "danangmap-recovery-codes.txt";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function RecoveryCodesPanel({
  regenerateRecoveryCodes = regenerateRecoveryCodesRequest,
}: {
  regenerateRecoveryCodes?: AccountSecurityActions["regenerateRecoveryCodes"];
} = {}) {
  const canMutate = useSyncExternalStore(
    subscribeDesktopAuthoringCapability,
    getDesktopAuthoringCapability,
    getServerDesktopAuthoringCapability,
  );
  const attemptKey = useRef<string | null>(null);
  const submitLock = useRef(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>({ name: "form" });
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetForm() {
    attemptKey.current = null;
    submitLock.current = false;
    setPassword("");
    setMfaCode("");
    setConfirmed(false);
    setAcknowledged(false);
    setCopied(false);
    setError(null);
    setStage({ name: "form" });
  }

  function changed(kind: "password" | "mfa", value: string) {
    if (kind === "password") setPassword(value);
    else setMfaCode(value);
    setError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLock.current || !confirmed || password.length < 12 || mfaCode.length < 6) return;
    submitLock.current = true;
    setPending(true);
    setError(null);
    attemptKey.current ??= crypto.randomUUID();
    try {
      const result = await regenerateRecoveryCodes({ password, mfaCode }, attemptKey.current);
      setPassword("");
      setMfaCode("");
      attemptKey.current = null;
      setStage({ name: "codes", codes: [...result.recoveryCodes] });
    } catch (caught) {
      const message = accountSecurityErrorMessage(caught, "recovery-codes");
      if (mustRestartRecoveryCodeRegeneration(caught)) {
        setPassword("");
        setMfaCode("");
        attemptKey.current = null;
        setStage({ name: "restart", message });
      } else {
        setError(message);
        globalThis.setTimeout(() => errorRef.current?.focus(), 0);
      }
      submitLock.current = false;
    } finally {
      setPending(false);
    }
  }

  async function copyCodes(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
    } catch {
      setError("Trình duyệt không cho phép sao chép. Hãy chọn và sao chép thủ công.");
      globalThis.setTimeout(() => errorRef.current?.focus(), 0);
    }
  }

  return (
    <section aria-labelledby="recovery-codes-title" className="rounded-panel border bg-surface p-5">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-control bg-accent-subtle text-primary">
          <IconKey stroke={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium" id="recovery-codes-title">Mã khôi phục MFA</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Tạo một bộ 10 mã mới cho chính tài khoản này. Toàn bộ mã cũ sẽ mất hiệu lực ngay.
          </p>
        </div>
      </div>

      {!canMutate ? (
        <Alert className="mt-4 border-primary/20 bg-accent-subtle">
          <IconDeviceDesktop stroke={1.75} />
          <AlertTitle>Chỉ thực hiện trên desktop</AlertTitle>
          <AlertDescription>Thiết bị di động có thể xem cài đặt, nhưng thao tác thay credential cần desktop có bàn phím.</AlertDescription>
        </Alert>
      ) : stage.name === "restart" ? (
        <div className="mt-4 grid gap-4">
          <Alert className="border-warning/30 bg-surface-subtle text-warning">
            <IconAlertTriangle stroke={1.75} />
            <AlertTitle>Cần bắt đầu một lượt tạo mới</AlertTitle>
            <AlertDescription>{stage.message}</AlertDescription>
          </Alert>
          <Button className="justify-self-start" onClick={resetForm} type="button" variant="outline">
            Bắt đầu lượt tạo mới
          </Button>
        </div>
      ) : stage.name === "codes" ? (
        <div className="mt-4 grid gap-4">
          <Alert className="border-success/30 bg-surface-subtle text-success">
            <IconCheck stroke={1.75} />
            <AlertTitle>Đã tạo 10 mã khôi phục mới</AlertTitle>
            <AlertDescription>Các mã này chỉ hiển thị trong bước hiện tại. DanangMap không lưu chúng trong trình duyệt.</AlertDescription>
          </Alert>
          <ol aria-label="10 mã khôi phục mới" className="grid gap-2 rounded-control border bg-surface-subtle p-3 sm:grid-cols-2">
            {stage.codes.map((code, index) => (
              <li className="select-all rounded-control bg-surface px-3 py-2 font-mono text-sm" key={code}>
                <span className="sr-only">Mã {index + 1}: </span>{code}
              </li>
            ))}
          </ol>
          {error ? <SecurityError errorRef={errorRef} message={error} /> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={() => void copyCodes(stage.codes)} type="button" variant="outline">
              <IconClipboard stroke={1.75} />{copied ? "Đã sao chép" : "Sao chép 10 mã"}
            </Button>
            <Button onClick={() => downloadCodes(stage.codes)} type="button" variant="outline">
              <IconDownload stroke={1.75} />Tải tệp .txt
            </Button>
          </div>
          <Field orientation="horizontal">
            <Checkbox checked={acknowledged} id="new-recovery-codes-saved" onCheckedChange={(value) => setAcknowledged(value === true)} />
            <FieldContent>
              <FieldLabel htmlFor="new-recovery-codes-saved">Tôi đã lưu 10 mã mới ở nơi an toàn</FieldLabel>
              <FieldDescription>Rời bước này đồng nghĩa các mã không thể hiển thị lại.</FieldDescription>
            </FieldContent>
          </Field>
          <Button disabled={!acknowledged} onClick={resetForm} type="button">Đã lưu, ẩn các mã</Button>
        </div>
      ) : (
        <form className="mt-4 grid gap-4" onSubmit={submit}>
          <Alert className="border-warning/30 bg-surface-subtle text-warning">
            <IconAlertTriangle stroke={1.75} />
            <AlertTitle>Thao tác thay credential</AlertTitle>
            <AlertDescription>Sau khi xác nhận thành công, mọi mã khôi phục hiện tại sẽ không còn dùng được.</AlertDescription>
          </Alert>
          <Field>
            <FieldLabel htmlFor="recovery-current-password">Mật khẩu hiện tại</FieldLabel>
            <Input
              autoComplete="current-password"
              disabled={pending}
              id="recovery-current-password"
              maxLength={200}
              minLength={12}
              onChange={(event) => changed("password", event.target.value)}
              required
              type="password"
              value={password}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="recovery-mfa-code">Mã MFA hoặc mã khôi phục</FieldLabel>
            <Input
              autoCapitalize="characters"
              autoComplete="one-time-code"
              disabled={pending}
              id="recovery-mfa-code"
              maxLength={64}
              minLength={6}
              onChange={(event) => changed("mfa", event.target.value)}
              required
              value={mfaCode}
            />
            <FieldDescription>Dùng mã 6 số từ ứng dụng MFA hoặc một mã khôi phục chưa sử dụng.</FieldDescription>
          </Field>
          {error ? <SecurityError errorRef={errorRef} message={error} /> : null}
          <Field orientation="horizontal">
            <Checkbox checked={confirmed} id="replace-recovery-codes-confirm" onCheckedChange={(value) => setConfirmed(value === true)} />
            <FieldContent>
              <FieldLabel htmlFor="replace-recovery-codes-confirm">Tôi hiểu toàn bộ mã cũ sẽ mất hiệu lực</FieldLabel>
            </FieldContent>
          </Field>
          <Button disabled={pending || !confirmed || password.length < 12 || mfaCode.length < 6} type="submit">
            {pending ? <><Spinner />Đang tạo mã mới...</> : "Tạo lại 10 mã khôi phục"}
          </Button>
        </form>
      )}
    </section>
  );
}
