import createClient from "openapi-fetch";
import type { paths } from "./schema";

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001/api/v1";

export const apiClient = createClient<paths>({ baseUrl, credentials: "include" });
