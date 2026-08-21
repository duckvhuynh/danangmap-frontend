# DanangMap visual directions

## Approved source targets

- `direction-1-refined.png` — public desktop
- `direction-1-public-mobile.png` — public mobile
- `direction-1-admin-editor-desktop.png` — admin editor desktop
- `direction-1-admin-review-mobile.png` — admin review mobile

## Implementation QA captures

The `implementation-*.png` files were captured from the running Next.js application with the exact viewport listed in `../../design-qa.md`. They are degraded-state evidence because no restricted Mapbox public token was available. They must not be used to mark the final live-map visual gate as passed.

Status: `AWAITING_SELECTION`

Ba hình này được tạo ngày 2026-08-21 từ màn hình DanangMap v1 và bố cục tham khảo geojson.io. Chúng chỉ là visual target cho public desktop map; chưa phải code hoặc giao diện đã được chấp nhận.

| Lựa chọn | Artifact | Trọng tâm |
|---|---|---|
| 1 | [`direction-1.png`](direction-1.png) | Civic Focus, floating layer panel và feature detail ổn định |
| 2 | [`direction-2.png`](direction-2.png) | Layer Dock, navigation rail, search command panel và active-layer dock |
| 3 | [`direction-3.png`](direction-3.png) | Civic Atlas, text-first layer catalogue và map/list switch |

Sau khi chủ sản phẩm chọn một hướng, cập nhật trạng thái trong `../DESIGN.md`, dẫn xuất admin desktop và mobile review theo cùng visual system, rồi mới scaffold UI. Không tự trộn nhiều hướng nếu chưa có một vòng review mới.
