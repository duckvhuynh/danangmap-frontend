"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { acquireCsrfToken, adminErrorMessage, getAdminSession, type AdminPrincipal } from "@/lib/api/admin";
import { Button } from "@/components/ui/button";

interface AdminSessionValue {
  principal: AdminPrincipal;
  csrfToken: string;
  refreshCsrf(): Promise<string>;
  clearClientPrincipal(): void;
}

const AdminSessionContext = createContext<AdminSessionValue | null>(null);

export function AdminErrorNotice({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return <div className="flex items-start gap-3 rounded-control border border-destructive/25 bg-red-50 p-4 text-sm text-destructive" role="alert"><IconAlertCircle className="mt-0.5 shrink-0" size={20} stroke={1.75}/><div className="min-w-0 flex-1"><p className="font-medium">Không thể hoàn tất yêu cầu</p><p className="mt-1 leading-6">{adminErrorMessage(error)}</p></div>{onRetry && <Button type="button" variant="outline" size="sm" onClick={onRetry}><IconRefresh stroke={1.75}/>Thử lại</Button>}</div>;
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
    async refreshCsrf() { return acquireCsrfToken(); },
    clearClientPrincipal() { setState({ ended: true }); },
  } : null, [state]);

  if (!state) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6" role="status"><div className="rounded-panel border bg-surface p-6 text-sm text-muted-foreground map-panel-shadow">Đang xác minh phiên đăng nhập...</div></main>;
  if ("ended" in state) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6" role="status"><div className="rounded-panel border bg-surface p-6 text-sm text-muted-foreground map-panel-shadow">Đang kết thúc phiên trên thiết bị này...</div></main>;
  if ("error" in state) return <main className="grid min-h-[100dvh] place-items-center bg-surface-subtle p-6"><div className="w-full max-w-lg"><AdminErrorNotice error={state.error} onRetry={() => { setState(null); setReload((value) => value + 1); }}/><Button asChild variant="outline" className="mt-4 w-full"><a href="/login">Quay lại đăng nhập</a></Button></div></main>;
  return <AdminSessionContext.Provider value={value}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession() {
  const value = useContext(AdminSessionContext);
  if (!value) throw new Error("useAdminSession must be used inside AdminSessionProvider.");
  return value;
}
