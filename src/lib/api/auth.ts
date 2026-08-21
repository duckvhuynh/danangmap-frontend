import { apiClient } from "@/lib/api/generated/client";

export async function login(username: string, password: string) {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return { next: "authenticated" as const };
  const { data, error, response } = await apiClient.POST("/auth/login", { body: { username, password } });
  if (!response.ok || error || !data) throw new Error("Tên đăng nhập hoặc mật khẩu không đúng.");
  return data;
}
