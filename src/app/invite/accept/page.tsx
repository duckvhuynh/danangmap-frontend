import Link from "next/link";
import {
  ArrowLeft as IconArrowLeft,
  MailCheck as IconMailCheck,
  Shield as IconShieldLock,
} from "lucide-react";
import { InviteAcceptForm } from "@/components/auth/invite-accept-form";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Chấp nhận lời mời quản trị" };

export default function InviteAcceptPage() {
  return (
    <main className="grid min-h-[100dvh] bg-surface-subtle lg:grid-cols-[1fr_560px]">
      <section className="relative hidden overflow-hidden border-r bg-accent-subtle p-12 lg:flex lg:flex-col lg:justify-between">
        <BrandMark />
        <div className="max-w-xl">
          <p className="text-sm font-medium text-primary">Kích hoạt tài khoản nội bộ</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.16] tracking-[-0.03em]">
            Bắt đầu an toàn với lời mời dùng một lần.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">
            Xác minh thông tin, tạo mật khẩu và thiết lập MFA trước khi truy cập hệ thống quản trị dữ liệu thành phố.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconShieldLock className="text-success" strokeWidth={1.75} />
          Mã lời mời không được lưu trên trình duyệt
        </div>
      </section>
      <section className="flex items-center justify-center bg-surface p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden"><BrandMark /></div>
          <span className="grid size-11 place-items-center rounded-map-control bg-accent-subtle text-primary">
            <IconMailCheck strokeWidth={1.75} />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">Chấp nhận lời mời</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Sao chép mã từ nội dung email và dán vào biểu mẫu. DanangMap không nhận mã lời mời qua đường dẫn.
          </p>
          <InviteAcceptForm />
          <Button asChild className="mt-7 -ml-3" variant="ghost">
            <Link href="/login">
              <IconArrowLeft data-icon="inline-start" strokeWidth={1.75} />
              Quay lại đăng nhập
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
