"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconUserShield } from "@tabler/icons-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getBootstrapStatus } from "@/lib/api/bootstrap";

export function BootstrapSetupLink() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getBootstrapStatus({ signal: controller.signal })
      .then((status) => setAvailable(status.available))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!available) return null;

  return (
    <Alert className="mt-5 border-primary/20 bg-accent-subtle" role="note">
      <IconUserShield className="text-primary" stroke={1.75} />
      <AlertDescription className="text-muted-foreground">
        Đây là lần khởi động đầu tiên?{" "}
        <Link
          className="rounded-control font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          href="/setup"
        >
          Tạo tài khoản quản trị đầu tiên
        </Link>
      </AlertDescription>
    </Alert>
  );
}
