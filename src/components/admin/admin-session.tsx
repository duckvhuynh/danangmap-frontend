"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  CircleAlert as IconAlertCircle,
  RefreshCw as IconRefresh,
} from "lucide-react";
import { acquireCsrfToken, AdminApiError, adminErrorMessage, getAdminSession, type AdminPrincipal } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AdminSessionValue {
  principal: AdminPrincipal;
  csrfToken: string;
  refreshCsrf(): Promise<string>;
  clearClientPrincipal(): void;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function AdminErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <Alert variant="destructive"><IconAlertCircle strokeWidth={1.75}/><AlertTitle>Không thể hoàn tất yêu cầu</AlertTitle><AlertDescription><p>{adminErrorMessage(error)}</p>{error instanceof AdminApiError && error.requestId ? <details className="mt-2"><summary className="cursor-pointer font-medium">Thông tin hỗ trợ</summary><p className="mt-2 break-all text-xs">Mã yêu cầu: {error.requestId}</p></details> : null}{onRetry ? <Button className="mt-3" type="button" variant="outline" size="sm" onClick={onRetry}><IconRefresh strokeWidth={1.75}/>Thử lại</Button> : null}</AlertDescription></Alert>;
}

export function AdminSessionProvider({ children }: { children: React.ReactNode }) {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ principal: AdminPrincipal; csrfToken: string } | { error: unknown } | { ended: true } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([getAdminSession(), acquireCsrfToken()]).then(([principal, csrfToken]) => {
      if (active) setState({ principal, csrfToken });
    }).catch((error: unknown) => { if (active) setState({ error }); });
    return () => { active = false; };
  }, [reload]);

  const value = useMemo<AdminSessionValue | null>(() => state && "principal" in state ? {
    ...state,
    async refreshCsrf() {
      const csrfToken = await acquireCsrfToken();
      setState((current) => current && "principal" in current ? { ...current, csrfToken } : current);
      return csrfToken;
    },
    clearClientPrincipal() { setState({ ended: true }); },
  } : null, [state]);

  if (!state) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6" role="status"><div className="rounded-panel border bg-surface p-6 text-sm text-muted-foreground map-panel-shadow">Đang xác minh phiên đăng nhập...</div></main>;
  if ("ended" in state) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6" role="status"><div className="rounded-panel border bg-surface p-6 text-sm text-muted-foreground map-panel-shadow">Đang kết thúc phiên trên thiết bị này...</div></main>;
  if ("error" in state && state.error instanceof AdminApiError && state.error.status === 401) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6"><section className="w-full max-w-lg rounded-panel border bg-surface p-6"><h1 className="text-xl font-semibold">Đăng nhập để tiếp tục</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Bạn chưa đăng nhập hoặc phiên làm việc đã kết thúc.</p><Button asChild className="mt-5 w-full"><a href="/login">Đăng nhập</a></Button></section></main>;
  if ("error" in state) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6"><div className="w-full max-w-lg"><AdminErrorNotice error={state.error} onRetry={() => { setState(null); setReload((value) => value + 1); }}/><Button asChild variant="outline" className="mt-4 w-full"><a href="/login">Quay lại đăng nhập</a></Button></div></main>;
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const value = useContext(AdminSessionContext);
  if (!value) throw new Error("useAdminSession must be used inside AdminSessionProvider.");
  return value;
}
