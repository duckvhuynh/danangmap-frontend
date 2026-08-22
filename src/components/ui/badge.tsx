import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full bg-accent-subtle px-2.5 py-1 text-xs font-medium text-primary [&_svg]:size-3.5 [&_svg]:shrink-0", className)} {...props} />;
}
