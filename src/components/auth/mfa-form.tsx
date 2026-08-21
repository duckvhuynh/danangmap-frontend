"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyMfa, type MfaMethod } from "@/lib/api/auth";
import { cn } from "@/lib/utils";

export function MfaForm({ enrollmentRequired }: { enrollmentRequired: boolean }) {
  const router = useRouter();
  const [method, setMethod] = useState<MfaMethod>("totp");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (enrollmentRequired) {
    return <p className="mt-6 flex items-start gap-2 rounded-control border border-warning/30 bg-surface-subtle p-3 text-sm leading-6 text-warning" role="alert"><IconAlertCircle className="mt-0.5 shrink-0" size={18} stroke={1.75}/>Tài khoản chưa đăng ký MFA. API hiện chưa công bố luồng đăng ký; vui lòng liên hệ System Admin.</p>;
  }

  return <form className="mt-6" onSubmit={async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await verifyMfa(method, String(form.get("code") ?? ""));
      router.replace("/admin");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể xác thực lúc này.");
    } finally {
      setPending(false);
    }
  }}>
    <div className="mb-4 grid grid-cols-2 rounded-control border bg-surface-subtle p-1" aria-label="Phương thức xác thực">
      <button type="button" aria-pressed={method === "totp"} onClick={() => setMethod("totp")} className={cn("rounded-control px-2 py-2 text-sm font-medium", method === "totp" && "bg-surface text-primary map-control-shadow")}>Ứng dụng MFA</button>
      <button type="button" aria-pressed={method === "recovery_code"} onClick={() => setMethod("recovery_code")} className={cn("rounded-control px-2 py-2 text-sm font-medium", method === "recovery_code" && "bg-surface text-primary map-control-shadow")}>Mã khôi phục</button>
    </div>
    <label htmlFor="mfa-code" className="mb-2 block text-sm font-medium">{method === "totp" ? "Mã xác thực" : "Mã khôi phục"}</label>
    <Input id="mfa-code" name="code" disabled={pending} inputMode={method === "totp" ? "numeric" : "text"} autoComplete="one-time-code" minLength={6} maxLength={100} required placeholder={method === "totp" ? "000 000" : "Nhập mã khôi phục"} className={cn(method === "totp" && "text-center text-lg tracking-[0.25em]")} />
    {error && <p className="mt-3 flex items-start gap-2 rounded-control bg-red-50 p-3 text-sm text-destructive" role="alert"><IconAlertCircle className="mt-0.5 shrink-0" size={18} stroke={1.75}/>{error}</p>}
    <Button disabled={pending} className="mt-4 w-full" type="submit">{pending ? "Đang xác thực..." : "Xác nhận"}</Button>
  </form>;
}
