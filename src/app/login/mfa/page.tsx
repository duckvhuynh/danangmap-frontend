import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  Shield as IconShieldLock,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { MfaForm } from "@/components/auth/mfa-form";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ enrollment?: string }> }) {
  const { enrollment } = await searchParams;
  const enrollmentRequired = enrollment === "required";
  return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-5"><section className="w-full max-w-md rounded-panel border bg-surface p-6 map-panel-shadow"><BrandMark/><span className="mt-8 grid size-11 place-items-center rounded-map-control bg-accent-subtle text-primary"><IconShieldLock strokeWidth={1.75}/></span><h1 className="mt-5 text-xl font-semibold">{enrollmentRequired ? "Thiết lập xác thực hai bước" : "Xác thực hai bước"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{enrollmentRequired ? "Bảo vệ tài khoản nội bộ bằng ứng dụng tạo mã TOTP trước khi vào trang quản trị." : "Nhập mã từ ứng dụng xác thực hoặc dùng một mã khôi phục."}</p><MfaForm enrollmentRequired={enrollmentRequired}/><Button asChild variant="ghost" className="mt-6 -ml-3"><Link href="/login"><IconArrowLeft strokeWidth={1.75}/>Quay lại đăng nhập</Link></Button></section></main>;
}
