"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconAlertCircle } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authErrorMessage, login } from "@/lib/api/auth";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return <form className="mt-8 flex flex-col gap-5" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setPending(true); setError(null); try { const result = await login(String(form.get("login") ?? ""), String(form.get("password") ?? "")); router.push(result.mfaEnrollmentRequired ? "/login/mfa?enrollment=required" : "/login/mfa"); } catch (caught) { setError(authErrorMessage(caught, "login")); } finally { setPending(false); } }}>
    <div><label className="mb-2 block text-sm font-medium" htmlFor="login">Tên đăng nhập hoặc email</label><Input id="login" name="login" autoComplete="username" minLength={3} required /></div>
    <div><div className="mb-2 flex items-center justify-between"><label className="text-sm font-medium" htmlFor="password">Mật khẩu</label><Link className="rounded-control text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring" href="/login/forgot-password">Quên mật khẩu?</Link></div><Input id="password" name="password" type="password" autoComplete="current-password" minLength={12} required /></div>
    {error && <p className="flex items-start gap-2 rounded-control bg-red-50 p-3 text-sm text-destructive" role="alert"><IconAlertCircle className="mt-0.5 shrink-0" size={18} stroke={1.75}/>{error}</p>}
    <Button className="h-11 w-full" type="submit" disabled={pending}>{pending ? "Đang đăng nhập..." : "Đăng nhập"}</Button>
  </form>;
}
