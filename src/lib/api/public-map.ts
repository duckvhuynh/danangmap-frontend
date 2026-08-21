import { apiClient } from "@/lib/api/generated/client";
import { sampleMapData } from "@/lib/data/sample-map";
import type { PublicMapData } from "@/lib/domain/map";

export async function getPublicMapData(signal?: AbortSignal): Promise<PublicMapData> {
  if (process.env.NEXT_PUBLIC_DANANGMAP_DEMO_MODE === "true") return sampleMapData;
  try {
    const { data, error, response } = await apiClient.GET("/public/map", { signal });
    if (!response.ok || error || !data) throw new Error("Dịch vụ dữ liệu tạm thời không khả dụng.");
    return { ...data, source: "api" };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Dịch vụ dữ liệu tạm thời không khả dụng.", { cause: error });
  }
}
