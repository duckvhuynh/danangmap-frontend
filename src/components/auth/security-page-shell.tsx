import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft as IconArrowLeft,
  ShieldCheck as IconShieldCheck,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export function SecurityPageShell({
  eyebrow,
  title,
  description,
  sideTitle,
  sideDescription,
  icon: Icon,
  children,
  backHref = "/login",
  backLabel = "Quay lại đăng nhập",
}: {
  eyebrow: string;
  title: string;
  description: string;
  sideTitle: string;
  sideDescription: string;
  icon: LucideIcon;
  children: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <main className="grid min-h-[100dvh] bg-surface-subtle lg:grid-cols-[1fr_560px]">
      <section className="relative hidden overflow-hidden border-r bg-accent-subtle p-12 lg:flex lg:flex-col lg:justify-between">
        <BrandMark />
        <div className="max-w-xl">
          <p className="text-sm font-medium text-primary">{eyebrow}</p>
          <h1 className="mt-4 text-4xl font-semibold leading-[1.16] tracking-[-0.03em]">{sideTitle}</h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-muted-foreground">{sideDescription}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <IconShieldCheck className="text-success" strokeWidth={1.75} />
          Không chia sẻ mật khẩu hoặc mã xác thực cho người khác
        </div>
      </section>
      <section className="flex items-center justify-center bg-surface p-5 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-9 lg:hidden"><BrandMark /></div>
          <span className="grid size-11 place-items-center rounded-map-control bg-accent-subtle text-primary">
            <Icon strokeWidth={1.75} />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          {children}
          <Button asChild className="mt-7 -ml-3" variant="ghost">
            <Link href={backHref}>
              <IconArrowLeft data-icon="inline-start" strokeWidth={1.75} />
              {backLabel}
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
