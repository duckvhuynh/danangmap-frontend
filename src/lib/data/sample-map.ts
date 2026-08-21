import type { PublicMapData } from "@/lib/domain/map";

export const sampleMapData: PublicMapData = {
  source: "sample",
  layers: [
    { id: "wards", slug: "ranh-gioi-phuong-xa", name: "Ranh giới phường, xã", description: "Địa giới hành chính sau sắp xếp", type: "polygon", color: "#1A73E8", featureCount: 2, updatedAt: "2026-08-15T08:00:00.000Z", fields: [{ key: "status", name: "Trạng thái", type: "status", icon: "circle-check" }] },
    { id: "offices", slug: "tru-so-hanh-chinh", name: "Trụ sở hành chính", description: "Trung tâm phục vụ hành chính công", type: "point", color: "#D93025", featureCount: 2, updatedAt: "2026-08-18T08:00:00.000Z", fields: [{ key: "address", name: "Địa chỉ", type: "text", icon: "map-pin" }, { key: "phone", name: "Điện thoại", type: "phone", icon: "phone" }] },
    { id: "police", slug: "tru-so-cong-an", name: "Trụ sở công an", description: "Địa điểm công an phường, xã", type: "point", color: "#137333", featureCount: 1, updatedAt: "2026-08-12T08:00:00.000Z", fields: [{ key: "address", name: "Địa chỉ", type: "text", icon: "map-pin" }, { key: "phone", name: "Điện thoại", type: "phone", icon: "phone" }] },
  ],
  features: [
    { type: "Feature", properties: { id: "ward-hai-chau", layerId: "wards", name: "Phường Hải Châu", kind: "Ranh giới hành chính", metadata: { status: "Đang hiệu lực" } }, geometry: { type: "Polygon", coordinates: [[[108.205,16.074],[108.229,16.074],[108.231,16.052],[108.208,16.046],[108.205,16.074]]] } },
    { type: "Feature", properties: { id: "ward-an-hai", layerId: "wards", name: "Phường An Hải", kind: "Ranh giới hành chính", metadata: { status: "Đang hiệu lực" } }, geometry: { type: "Polygon", coordinates: [[[108.229,16.075],[108.252,16.079],[108.255,16.052],[108.231,16.052],[108.229,16.075]]] } },
    { type: "Feature", properties: { id: "office-one", layerId: "offices", name: "Trung tâm Hành chính Đà Nẵng", kind: "Trụ sở hành chính", metadata: { address: "24 Trần Phú, phường Hải Châu", phone: "0236 3821 293" } }, geometry: { type: "Point", coordinates: [108.2209,16.0723] } },
    { type: "Feature", properties: { id: "office-two", layerId: "offices", name: "Trung tâm phục vụ hành chính công", kind: "Trụ sở hành chính", metadata: { address: "Đường Như Nguyệt, phường Hải Châu" } }, geometry: { type: "Point", coordinates: [108.2162,16.077] } },
    { type: "Feature", properties: { id: "police-one", layerId: "police", name: "Công an phường Hải Châu", kind: "Trụ sở công an", metadata: { address: "Khu vực trung tâm, phường Hải Châu", phone: "0236 3822 344" } }, geometry: { type: "Point", coordinates: [108.2181,16.0598] } },
  ],
};
