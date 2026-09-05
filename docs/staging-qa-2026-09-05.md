# Staging QA — 05/09/2026

## Phạm vi

Kiểm tra public smoke trực tiếp bằng tab Brave của người dùng tại `https://danangmap-staging.duckvhuynh.space/`. Chỉ điều khiển trình duyệt, không thao tác ứng dụng desktop hoặc đọc credential. Không import trùng, sửa, duyệt hay công bố dữ liệu staging.

Remote main/staging baseline là frontend `9f24c21` và backend `aad5065`; chưa xác nhận image SHA đang chạy trên Coolify. Báo cáo này là quan sát UI môi trường đang mở, không phải xác nhận mọi thay đổi ở branch tip đã được deploy.

## Kết quả quan sát

| Luồng                       | Kết quả           | Bằng chứng                                                                                                                                                          |
| --------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mở thẳng bản đồ             | Đạt               | Basemap và marker hiển thị; catalog có một lớp sở ban ngành, tổng 17 đối tượng.                                                                                     |
| Danh sách theo viewport     | Đạt               | Vùng xem ban đầu có 15 đối tượng; tổng lớp 17 và số trong viewport là hai phạm vi khác nhau.                                                                        |
| Tắt/bật lớp                 | Đạt               | Tắt: 0 kết quả và thông báo rỗng; bật lại: dữ liệu trở lại.                                                                                                         |
| Chi tiết từ danh sách       | Đạt phần hiển thị | Tên/địa chỉ tiếng Việt, website bắt đầu bằng https, điện thoại có máy lẻ hiển thị được.                                                                             |
| Tìm kiếm tiếng Việt         | Đạt               | Tìm Giáo dục trả nhóm dữ liệu công bố và nhóm Geo Service; chọn kết quả nội bộ mở đúng thông tin. Không đánh giá độ chính xác toàn bộ external search từ một query. |
| Đổi basemap                 | Đạt control state | Nhãn chuyển Đường phố/Nền sáng; map/marker vẫn render. Chưa xác nhận identity/visual fidelity của từng style bằng deployed configuration.                           |
| Không lưu map state vào URL | Đạt trong smoke   | Toggle/search/detail/style không thêm query camera/layer/feature.                                                                                                   |
| Admin edit/review/publish   | Blocked           | Đến trang đăng nhập, không có phiên admin. Không thử đoán mật khẩu hoặc tạo tài khoản.                                                                              |
| Mobile/device matrix        | Chưa chạy         | Lượt này dùng viewport desktop hiện hữu, không phải responsive/device sign-off.                                                                                     |

## Follow-up

Tracking: [frontend #46](https://github.com/duckvhuynh/danangmap-frontend/issues/46).

- Xác nhận deployed SHA và có phiên hợp lệ của các role trước khi chạy lại config-only edit → submit → approve → publish → successor draft → republish.
- Chỉ dùng lớp test được xác định rõ cho mutation/import; không thay hoặc nhân đôi lớp sở ban ngành đang công khai.
- Kiểm tra lại field phone có máy lẻ/danh sách không bị chặn trong editor; không suy từ public read rằng validation authoring đã đạt.
- Public website hiện hiển thị text, chưa có action link trong AX tree. Telephone href mang cả nhãn máy lẻ; cần kiểm tra chuẩn hóa action mà không thực hiện cuộc gọi thật.
- Kiểm tra desktop/mobile, scroll, map resize, role action visibility và state consistency với evidence mới.

Role report ngày 04/09 (11/11) là evidence lịch sử độc lập. Không gộp nó với smoke này để tuyên bố đã E2E đầy đủ trên staging ngày 05/09.

## Delivery và governance

Hai repository đã public; main được bảo vệ bằng required CI và PR review. Chi tiết tại backend `docs/DELIVERY-STATUS-2026-09-05.md`. Bản cập nhật tài liệu này dùng PR, không bypass để merge. M7/M8 vẫn deferred theo product owner.
