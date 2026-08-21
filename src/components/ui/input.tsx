import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn("h-11 w-full rounded-control border border-border bg-surface px-3 text-base text-foreground shadow-none outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-70 md:text-sm", className)}
      {...props}
    />
  );
}

export { Input };
