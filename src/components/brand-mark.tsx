import { IconMap2 } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-foreground", className)} aria-label="Bản đồ số Đà Nẵng">
      <span className="grid size-9 place-items-center rounded-control bg-primary text-primary-foreground" aria-hidden="true">
        <IconMap2 stroke={1.75} />
      </span>
      {!compact && <span className="whitespace-nowrap text-sm font-semibold tracking-[-0.01em]">Bản đồ số Đà Nẵng</span>}
    </span>
  );
}
