import Link from "next/link";
import { IconArrowLeft, IconLock, IconShieldCheck } from "@tabler/icons-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { BootstrapSetupLink } from "@/components/auth/bootstrap-setup-link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Đăng nhập quản trị" };

export default function LoginPage() {
  return (
    <main className="grid min-h-[100dvh] bg-surface-subtle lg:grid-cols-[1fr_520px]">
      <section className="relative hidden overflow-hidden border-r bg-accent-subtle p-12 lg:flex lg:flex-col lg:justify-between">
        <BrandMark />
        <div className="max-w-xl"><p className="text-sm font-medium text-primary">Hệ thống quản trị dữ liệu địa lý</p><h1 className="mt-4 text-4xl font-semibold leading-[1.16] tracking-[-0.03em]">Dữ liệu hành chính rõ ràng, có kiểm duyệt và sẵn sàng phục vụ người dân.</h1><p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">Biên tập lớp dữ liệu, kiểm tra thay đổi và xuất bản theo quy trình thống nhất của thành phố.</p></div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><IconShieldCheck className="text-success" stroke={1.75} />Kết nối được bảo vệ · Tài khoản nội bộ</div>
      </section>
      <section className="flex items-center justify-center bg-surface p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden"><BrandMark /></div>
          <div className="grid size-11 place-items-center rounded-map-control bg-accent-subtle text-primary"><IconLock stroke={1.75} /></div>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">Đăng nhập quản trị</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Sử dụng tài khoản nội bộ do quản trị hệ thống cấp.</p>
          <LoginForm />
          <BootstrapSetupLink />
          <Button asChild variant="ghost" className="mt-8 -ml-3"><Link href="/"><IconArrowLeft stroke={1.75} />Quay lại bản đồ</Link></Button>
        </div>
      </section>
    </main>
  );
}
