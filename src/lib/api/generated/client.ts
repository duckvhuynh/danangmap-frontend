import createClient from "openapi-fetch";
import type { paths } from "./schema";

export const apiBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

export function createDanangMapClient(fetcher?: typeof globalThis.fetch) {
  return createClient<paths>({ baseUrl: apiBaseUrl, credentials: "include", fetch: fetcher });
}

export function resolveApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export const apiClient = createDanangMapClient();
