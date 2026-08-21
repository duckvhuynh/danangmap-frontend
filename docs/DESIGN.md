# DanangMap v2 - DESIGN

> Trạng thái: `SELECTED_READY_TO_SCAFFOLD`
> Phạm vi: `danangmap-frontend`, gồm bản đồ công khai tại `/` và quản trị tại `/admin`
> Nguồn tham chiếu: DanangMap v1, nhận diện thành phố Đà Nẵng và mô hình thao tác của geojson.io
> Cập nhật: 2026-08-21
> Quyết định: Product owner đã phê duyệt **Direction 1 - Civic Focus (refined)** ngày 2026-08-21

## 1. Mục đích tài liệu

Tài liệu này là nguồn thống nhất cho quyết định UX, visual system và kiến trúc frontend của DanangMap v2. PRD xác định sản phẩm phải làm gì; SRS và API Contract xác định hành vi hệ thống; tài liệu này xác định người dùng nhìn thấy, hiểu và thao tác với hệ thống như thế nào.

Mọi thay đổi làm lệch các nguyên tắc, token hoặc cấu trúc trải nghiệm dưới đây phải được cập nhật tại tài liệu này trước khi merge.

## 2. Design Read và các dials

**Design Read:** Đọc sản phẩm như một dịch vụ bản đồ hành chính công dành cho người dân và cán bộ, với ngôn ngữ trust-first, map-first, rõ ràng và tiết chế; nền tảng là Next.js, Tailwind CSS, shadcn/ui được tùy biến và Mapbox.

| Dial | Giá trị | Ảnh hưởng |
| --- | ---: | --- |
| `DESIGN_VARIANCE` | 3 | Bố cục có trật tự, ưu tiên khả năng đoán trước và độ tin cậy |
| `MOTION_INTENSITY` | 2 | Chỉ có chuyển trạng thái ngắn và phản hồi thao tác; không có motion trang trí |
| `VISUAL_DENSITY` | 5 | Public map thoáng vừa đủ; admin editor có mật độ trung bình cao nhưng không thành cockpit |

Taste skill chỉ áp dụng cho public map, đăng nhập, loading, empty và error states. Không áp dụng taste skill cho data table, schema builder, import wizard hoặc workflow quản trị. Các bề mặt quản trị dùng product UI patterns, shadcn/ui và data-grid patterns phù hợp.

## 3. Nguyên tắc trải nghiệm

1. **Bản đồ là nội dung chính.** Route `/` mở trực tiếp bản đồ toàn màn hình. Không có landing page hoặc hero chắn trước nhiệm vụ tra cứu.
2. **Tin cậy trước trang trí.** Trạng thái dữ liệu, thời điểm cập nhật, nguồn và lỗi phải rõ ràng. Không dùng gradient, glassmorphism, glow hoặc motion phô diễn.
3. **Progressive disclosure.** Người dân thấy các điều khiển thiết yếu trước; metadata chi tiết, bộ lọc nâng cao và danh sách mở theo nhu cầu.
4. **Một hành động, một vị trí ổn định.** Search, layers, basemap, zoom, vị trí và feature detail không đổi vị trí tùy tiện giữa các trạng thái.
5. **Canvas không phải giao diện duy nhất.** Mọi dữ liệu công khai có chế độ danh sách hoặc bảng đồng bộ theo vùng nhìn để hỗ trợ bàn phím, screen reader và tình huống bản đồ không tải được.
6. **Server là nguồn dữ liệu chuẩn.** IndexedDB chỉ hỗ trợ phục hồi thao tác quản trị. Trạng thái revision được backend xác nhận mới có giá trị hệ thống.
7. **Mobile public đầy đủ, mobile admin có giới hạn chủ ý.** Người dân tra cứu đầy đủ trên mobile. Admin mobile chỉ được xem, comment, approve hoặc request changes. Authoring, import, sửa schema, publish và rollback yêu cầu môi trường desktop đủ capability.

## 4. Cổng thiết kế trước khi triển khai

Ba artifact visual direction public desktop ban đầu đã được sinh ở cùng viewport, cùng dữ liệu và cùng trạng thái chính:

1. **Civic Focus:** kế thừa nhận biết của DanangMap v1, dùng floating layer panel và feature detail ổn định. Artifact: `docs/visual-directions/direction-1.png`.
2. **Layer Dock:** dùng navigation rail, search command panel và dock layer thấp để giảm che bản đồ. Artifact: `docs/visual-directions/direction-2.png`.
3. **Civic Atlas:** nhấn mạnh phân loại layer, metadata và khả năng đọc như một atlas hành chính số. Artifact: `docs/visual-directions/direction-3.png`.

Ba hướng đều giữ trắng, xanh thương hiệu, không gradient, cùng radius scale và cùng yêu cầu accessibility. Product owner đã chọn Direction 1, sau đó phê duyệt vòng refined dùng hình học control, radius và elevation tham chiếu Google Maps web, Tabler Icons và primary blue `#1A73E8`.

### 4.1 Selection record

| Thuộc tính | Giá trị |
| --- | --- |
| Hướng được chọn | Direction 1 - Civic Focus |
| Source of truth public desktop | `docs/visual-directions/direction-1-refined.png` |
| Quyết định bởi | Product owner `duckvhuynh` |
| Ngày phê duyệt | 2026-08-21 |
| Phạm vi phê duyệt | Bố cục map-first, Google Maps-like controls/shadows/radius, Tabler Icons, lighter civic blue |
| Không được trộn | Direction 2, Direction 3 hoặc visual system khác nếu chưa mở design review mới |

### 4.2 Derived source targets

Ba source target bắt buộc đã được dẫn xuất trực tiếp từ Direction 1 refined:

| Target | Artifact | Viewport triển khai | Quy tắc khóa |
| --- | --- | ---: | --- |
| Public mobile | `docs/visual-directions/direction-1-public-mobile.png` | 390 x 844 CSS px | Map full-screen, một bottom sheet tại một thời điểm, touch target tối thiểu 44 px |
| Admin editor desktop | `docs/visual-directions/direction-1-admin-editor-desktop.png` | 1440 x 1024 CSS px | Layout biên tập tham chiếu geojson.io, Terra Draw rail, explorer, inspector và data panel |
| Admin review mobile | `docs/visual-directions/direction-1-admin-review-mobile.png` | 390 x 844 CSS px | Chỉ xem, comment, approve hoặc request changes; không có high-impact mutation |

Các artifact được kiểm tra mở được, cùng ngôn ngữ trắng/xanh, không glassmorphism, không decorative gradient và không đưa satellite vào UI. GATE-DESIGN đã hoàn tất `C-016`; UI scaffold được phép bắt đầu sau commit ghi nhận quyết định này. Sau khi triển khai phải đặt source mock và screenshot implementation cạnh nhau ở cùng viewport/state để chạy design QA. Không trộn các phần của nhiều hướng nếu chưa qua vòng review mới.

## 5. Visual system

### 5.1 Theme

- Ứng dụng dùng một light theme nhất quán.
- Mapbox chỉ cho chọn **Street** và **Light**. Đây là lựa chọn bản đồ nền, không phải đổi theme của ứng dụng.
- Không có satellite trong phạm vi hiện tại.
- Không gradient dưới mọi hình thức trong UI, marker, chart, skeleton hoặc background.
- Không dùng ảnh nền trang trí. Bản đồ và dữ liệu địa lý là visual chính.
- Primary blue được product owner phê duyệt cho v2 là `#1A73E8`. Khi thành phố ban hành brand guideline mới, thay đổi token phải qua design review, kiểm tra contrast và visual regression.

### 5.2 Semantic color tokens

Component không được tham chiếu trực tiếp `blue-500`, mã hex hoặc màu Mapbox. Chúng chỉ dùng semantic tokens. Giá trị cụ thể được đặt một lần tại global theme.

| Token | Giá trị khóa | Vai trò |
| --- | --- | --- |
| `background` | `#FFFFFF` | Nền ứng dụng trắng |
| `foreground` | `#202124` | Văn bản chính, gần đen lạnh |
| `surface` | `#FFFFFF` | Panel và control nổi |
| `surface-subtle` | `#F8FAFD` | Nền phụ của row, hover nhẹ và grouped content |
| `border` | `#DADCE0` | Viền panel, input và separator |
| `primary` | `#1A73E8` | Xanh civic chính |
| `primary-hover` | `#1765CC` | Hover của primary action |
| `primary-pressed` | `#1558B0` | Pressed của primary action |
| `primary-foreground` | `#FFFFFF` | Chữ và icon trên nền primary |
| `accent-subtle` | `#EAF3FF` | Nền xanh rất nhạt cho selected hoặc focus context |
| `muted-foreground` | `#5F6368` | Metadata thứ cấp |
| `destructive` | `#C5221F` | Xóa, geometry lỗi hoặc thao tác không thể phục hồi |
| `warning` | `#B06000` | Dữ liệu cần xem lại, conflict hoặc import có dòng lỗi |
| `success` | `#137333` | Đã đồng bộ, đã duyệt hoặc tác vụ hoàn tất |
| `focus-ring` | `#0B57D0` | Focus indicator có độ tương phản rõ trên mọi surface |

Màu chuyên đề của layer là dữ liệu cấu hình, không phải màu UI. Admin phải xem trước độ tương phản của fill, stroke, symbol và label trên cả Street lẫn Light. Hệ thống cảnh báo khi màu layer trùng nền hoặc không đủ phân biệt.

### 5.3 Typography

- Dùng `next/font` hoặc font local được thành phố phê duyệt; không tải font qua thẻ `<link>` trong production.
- Ưu tiên sans-serif trung tính, có đầy đủ dấu tiếng Việt và numerals dễ đọc.
- Tối thiểu 16 px cho body public; admin table có thể dùng 14 px với line-height không thấp hơn 20 px.
- Label hành động dùng câu ngắn, chức năng rõ: “Lớp dữ liệu”, “Xem danh sách”, “Gửi duyệt”, “Lưu lên máy chủ”.
- Không dùng uppercase tracking rộng làm nhãn trang trí.

### 5.4 Shape, spacing và elevation

Radius là một hệ có quy tắc, không dùng tùy hứng:

| Token | Giá trị | Áp dụng |
| --- | ---: | --- |
| `radius-control` | 8 px | Button, input, select, menu item |
| `radius-map-control` | 10 px | Nhóm zoom, basemap, draw tool |
| `radius-panel` | 12 px | Floating panel, inspector, feature detail |
| `radius-overlay` | 12 px | Dialog, mobile drawer, import wizard |

- Khoảng cách dùng base unit 4 px.
- Shadow control dùng `0 1px 2px rgb(60 64 67 / 0.15), 0 1px 3px 1px rgb(60 64 67 / 0.08)`.
- Shadow panel dùng `0 2px 6px 2px rgb(60 64 67 / 0.12)`; dialog có thể dùng `0 8px 24px rgb(60 64 67 / 0.16)`.
- Shadow chỉ dùng để tách control khỏi bản đồ, dùng neutral elevation, không tint xanh và không dùng pure-black shadow.
- Border 1 px là cách phân tầng mặc định. Card chỉ xuất hiện khi có một nhóm nội dung thật sự độc lập.
- Button không dùng pill shape.

### 5.5 Iconography

- Chỉ dùng `@tabler/icons-react`; không cài hoặc import Lucide và không trộn icon family.
- Stroke mặc định `1.75`, line cap/line join giữ theo Tabler. Trạng thái active được phân biệt bằng surface, label và focus, không tăng stroke tùy ý.
- Icon trong shadcn control dùng `data-icon`; icon-only control luôn có accessible name và tooltip.
- Không tự vẽ SVG path, CSS art, emoji hoặc text glyph thay icon.

### 5.6 Motion và feedback

- Motion chỉ giải thích thay đổi trạng thái: panel mở, sheet chuyển mức, feature được chọn hoặc save hoàn tất.
- Duration khuyến nghị 120-180 ms cho control, 180-240 ms cho panel.
- Chỉ animate `transform` và `opacity`.
- `prefers-reduced-motion: reduce` phải loại bỏ chuyển động không thiết yếu.
- Press state dùng thay đổi nền hoặc translate tối đa 1 px. Không dùng scale mạnh, bounce hoặc perpetual animation.
- Durable error hiển thị tại đúng ngữ cảnh; toast chỉ dùng cho phản hồi ngắn hạn.

### 5.7 Layering và z-index

Z-index dùng thang cố định:

| Layer | Giá trị gợi ý |
| --- | ---: |
| Map canvas | 0 |
| Map overlays và selected feature | 10 |
| Floating controls | 20 |
| Floating panels | 30 |
| Sheet và drawer | 40 |
| Dialog và alert dialog | 50 |
| Toast | 60 |

Không tự thêm `z-index` vào shadcn overlays nếu component đã quản lý stacking context.

## 6. Kiến trúc Next.js và ranh giới RSC

Một Next.js App Router application phục vụ cả public và admin.

```text
app/
  (public)/
    layout.tsx
    page.tsx                 # /
  admin/
    layout.tsx
    page.tsx
    layers/
      page.tsx
      [layerId]/
        page.tsx
        edit/page.tsx
        review/page.tsx
  login/page.tsx
  error.tsx
  global-error.tsx
  not-found.tsx
```

### 6.1 Server Components mặc định

Server Components chịu trách nhiệm:

- Layout, metadata, public layer catalog và initial permissions.
- Admin authorization gate và dữ liệu khởi tạo của layer/revision.
- Render shell có ý nghĩa khi JavaScript hoặc Mapbox chưa sẵn sàng.
- Fetch song song và đặt Suspense boundary để tránh data waterfall.

### 6.2 Client islands có chủ đích

Chỉ các vùng cần browser API hoặc tương tác thời gian thực dùng `'use client'`:

- `MapRuntime`: tạo, cập nhật và cleanup Mapbox instance.
- `PublicMapWorkspace`: layer visibility, search, selected feature và floating panels.
- `TerraDrawWorkspace`: draw modes, selection và geometry edits.
- `AdminDraftStore`: editor state, undo/redo và đồng bộ server.
- `DexieRecoveryCoordinator`: persistence, recovery, quota và multi-tab ownership.
- Resizable panels, data grid và mobile drawer.

Mapbox, Terra Draw và Dexie phải được import trong client island hoặc dynamic import. Không truy cập `window`, IndexedDB hoặc Mapbox trong Server Component. Khi unmount phải gọi cleanup cho map, event listeners, Terra Draw adapter, BroadcastChannel và timers.

### 6.3 Dữ liệu và state

- Server state dùng API client sinh từ OpenAPI và cache/query layer phù hợp.
- UI state cục bộ dùng component state hoặc reducer.
- Shared editor state dùng một store duy nhất trong client boundary; không đưa geometry lớn qua React Context.
- Pan, zoom và pointer coordinates không được lưu trong React state mỗi frame.
- Public map state không được ghi vào query string hoặc hash. Không tạo URL dạng `?layers=...&lat=...&lng=...`.
- Reload public route luôn bắt đầu từ cấu hình mặc định của ứng dụng. Không persist basemap, selected feature, layer visibility hoặc viewport trong local preferences, query string hay hash.

## 7. Public map tại `/`

### 7.1 Component hierarchy

```text
PublicMapPage (RSC)
  PublicMapShell
    MapFallbackList (RSC/Suspense fallback)
    PublicMapWorkspace (Client)
      MapRuntime
        DynamicLayerRenderer
        SelectionOverlay
      BrandMark
      UnifiedSearch
      LayerCatalogPanel
      MapControlStack
        BasemapSwitcher
        ZoomControls
        GeolocateControl
      FeatureDetailPanel
      AccessibleFeatureList
      MapStatusRegion
```

### 7.2 Desktop layout

- Canvas chiếm toàn bộ `100dvh` và toàn bộ chiều rộng.
- Góc trên trái có brand mark gọn và search. Search là điểm vào chính, không bị chôn trong sidebar.
- Nút “Lớp dữ liệu” mở panel trái nổi; panel không che toàn bộ bản đồ.
- Map controls ở cạnh phải, tách thành nhóm theo chức năng.
- Feature detail mở panel phải và giữ vị trí feature trong vùng bản đồ còn nhìn thấy.
- Nếu panel trái và phải cùng mở, map gọi `resize()` và fit padding, không che feature đang chọn.

### 7.3 Mobile layout

- Dùng `min-height: 100dvh`, tôn trọng safe-area và thanh địa chỉ mobile.
- Search cố định ở phía trên với hit target tối thiểu 44 x 44 px.
- Layers, list và feature detail dùng bottom sheet có các mức collapsed, half và expanded.
- Không cho nhiều sheet cạnh tranh. Mở feature detail sẽ chuyển sheet hiện tại sang nội dung feature thay vì chồng thêm overlay.
- Map controls chỉ giữ geolocate, zoom cần thiết và basemap. Control ít dùng nằm trong overflow menu có nhãn rõ.

### 7.4 Unified search

Search gửi yêu cầu tới DanangMap backend. Backend hợp nhất:

1. Kết quả nội bộ từ layer và feature đã publish.
2. Kết quả địa điểm từ Geo Service riêng. MVP chỉ dùng autocomplete, text search và place details.

Frontend không gọi trực tiếp provider địa điểm bên thứ ba và không để lộ credential của Geo Service. Kết quả được nhóm theo nguồn bằng nhãn “Dữ liệu bản đồ” và “Địa điểm”. Search phải hỗ trợ:

- Debounce và hủy request cũ bằng `AbortController`.
- Loading, no result, partial failure và total failure.
- Điều hướng bàn phím theo combobox pattern.
- Highlight text an toàn, không dùng `dangerouslySetInnerHTML` với response.
- Khi một nguồn lỗi, nguồn còn lại vẫn dùng được và UI cho biết kết quả có thể chưa đầy đủ.

Geocode, nearby search, find place và directions nằm ngoài MVP. Khi các capability này được bổ sung, frontend vẫn chỉ gọi DanangMap backend; backend dùng Geo Service riêng làm integration boundary.

### 7.5 Dynamic layer renderer

UI không có component hard-code cho từng loại dữ liệu như v1. Renderer đọc layer manifest đã publish:

- `layerId`, `revisionId`, `geometryMode`, `sourceKind`.
- Style config, visibility mặc định, min/max zoom và clustering.
- Field schema, popup schema, filter schema và search capabilities.
- GeoJSON endpoint cho dataset nhỏ; vector tile endpoint cho dataset lớn.

Quy tắc render:

- Point/MultiPoint dùng Mapbox symbol hoặc Mapbox circle render layers và clustering. Từ “circle layer” trong câu này là kiểu render của Mapbox, không phải geometry mode `circle` của DanangMap. Không tạo hàng nghìn DOM markers.
- LineString/MultiLineString dùng line layers.
- Polygon/MultiPolygon dùng fill và outline layers.
- Circle HTTP chỉ nhận GeoJSON `Point` làm tâm và `radiusM` theo mét; database lưu `radius_m`. MultiPoint chỉ thuộc point layer, không hợp lệ cho circle. Renderer tạo biểu diễn theo mét mà không biến polygon render thành dữ liệu gốc.
- Mixed layer tách feature collection theo geometry family thành nhiều Mapbox render layers nhưng giữ một logical layer và một selection model.
- Feature ở React state chỉ giữ ID và detail cần hiển thị. Geometry số lượng lớn ở Mapbox source hoặc worker, không clone vào component tree.
- Layer IDs của Mapbox phải deterministic để cleanup, style switch và hot reload không tạo source/layer trùng.
- Khi đổi Street/Light, renderer chờ style load rồi attach lại custom sources/layers theo thứ tự ổn định.

## 8. Accessibility của public map

- Cung cấp link “Bỏ qua bản đồ, đến danh sách dữ liệu” là phần tử focus đầu tiên.
- `AccessibleFeatureList` đồng bộ với viewport, layer filters và search, có heading mô tả số kết quả.
- Map canvas không bẫy focus. Người dùng có thể rời map bằng Tab và quay lại control có nhãn rõ.
- Mọi icon-only button có accessible name và tooltip cho pointer users.
- Selected, hover và focus không chỉ phân biệt bằng màu.
- Screen reader nhận thông báo ngắn qua `aria-live=polite` khi số kết quả hoặc feature selection thay đổi; không đọc liên tục khi map pan.
- Popup có semantic heading, definition list cho metadata và thứ tự focus hợp lý.
- Touch targets tối thiểu 44 x 44 px.
- Body text đạt WCAG AA; focus ring phải thấy rõ trên cả Street, Light và panel trắng.
- Khi WebGL, Mapbox hoặc tile lỗi, danh sách và search vẫn hoạt động nếu API còn khả dụng.

## 9. Admin information architecture

Một app chung, không tách frontend thứ hai.

- `/admin`: overview và công việc cần xử lý.
- `/admin/layers`: catalog layer, trạng thái, revision hiện tại và hành động theo role.
- `/admin/layers/[layerId]`: metadata, schema, style, history và publication status.
- `/admin/layers/[layerId]/edit`: workspace biên tập desktop.
- `/admin/layers/[layerId]/review`: compare, comment, approve hoặc request changes.

Role hiển thị đúng capability:

- Editor tạo và sửa draft, import dữ liệu, gửi duyệt.
- Reviewer xem diff, comment, approve hoặc yêu cầu sửa; không duyệt revision do chính mình tạo.
- Publisher xuất bản revision đã approve và rollback snapshot đã publish.
- System Admin tạo thủ công, invite hoặc import account; cấu hình role và session. Không có nút bypass workflow ngầm.

## 10. Admin editor

### 10.1 Component hierarchy

```text
AdminLayerEditPage (RSC auth + bootstrap)
  EditorWorkspace (Client)
    EditorTopBar
      Breadcrumb
      RevisionStatus
      LocalSaveIndicator
      ServerSyncIndicator
      UndoRedoActions
      ValidateAction
      SubmitReviewAction
    EditorLeftRail
      SelectTool
      PointTool
      LineTool
      PolygonTool
      CircleTool
    FeatureExplorer
      LayerSummary
      FeatureSearch
      FeatureList
    EditorMap
      MapRuntime
      TerraDrawController
      GeometryValidationOverlay
    FeatureInspector
      GeometrySummary
      SchemaGeneratedForm
      AttachmentManager
      ValidationIssues
    ResizableDataPanel
      FeatureDataGrid
    DexieRecoveryCoordinator
    ConflictDialog
```

### 10.2 Bố cục lấy cảm hứng từ geojson.io

- Top bar: layer, revision, trạng thái local/server, undo/redo, validate, save và submit.
- Rail trái hẹp: select, point, line, polygon, circle. Tool đang active luôn có label hoặc tooltip, icon không phải tín hiệu duy nhất.
- Panel trái: feature list, search, filter và import entry.
- Trung tâm: Mapbox canvas với Terra Draw.
- Panel phải: properties form, geometry summary, validation và attachment.
- Panel đáy: data grid có thể resize, hide hoặc maximize.
- Kích thước panel được lưu như user preference, không nằm trong draft revision.

Admin là product UI có dữ liệu dày. Không áp dụng marketing patterns, bento, glass, hero, marquee hoặc motion kể chuyện.

### 10.3 Terra Draw

Terra Draw là thư viện editor đã chốt. Adapter dùng Mapbox GL JS. MVP hỗ trợ:

- Point, LineString, Polygon, Circle.
- MultiPoint, MultiLineString và MultiPolygon thông qua feature tools phù hợp hoặc combine/split flow được kiểm thử trước release.
- Select, move, edit vertices, delete, duplicate, undo và redo.
- Circle dùng đơn vị mét và canonical adapter round-trip thành HTTP `Point + radiusM`; backend ánh xạ sang database `radius_m`.
- Snapping và geometry constraints chỉ bật khi đã có spec rõ; không tự chỉnh geometry lặng lẽ.

Terra Draw output phải đi qua canonical geometry adapter trước khi vào store hoặc API. Không để format nội bộ của plugin trở thành API contract.

### 10.4 Desktop và mobile

- Authoring, import, sửa schema, data grid hàng loạt, publish và rollback chỉ bật trong môi trường **desktop-capable**.
- Capability gate không chỉ dựa vào breakpoint hoặc user agent. Tất cả điều kiện phải đạt: layout tối thiểu 1024 px ở browser zoom hiện tại, primary pointer chính xác có hover, và keyboard đã được xác nhận khả dụng cho focus/shortcut flow. Một tablet rộng không tự động được coi là desktop.
- Thông điệp user-facing gọi thống nhất là “Tính năng này cần máy tính có chuột hoặc trackpad và bàn phím”. Không dùng thuật ngữ breakpoint hoặc pointer media query trong UI.
- Khi không đủ điều kiện, `/edit` hiển thị lý do, trạng thái draft và CTA mở chế độ xem/review. Không render draw tools disabled khó hiểu.
- Mobile admin chỉ cho phép đọc layer, xem map, comment, approve và request changes. Mobile không hiển thị action publish, rollback, import, sửa schema hoặc authoring.
- Capability gate chỉ là UX guard. Backend vẫn kiểm tra role, revision state, participant history và optimistic concurrency cho mọi mutation.

### 10.5 Accessibility cho login, review và conflict

- Login, password, MFA TOTP và recovery-code flow phải dùng label thực, error liên kết bằng `aria-describedby`, focus vào lỗi đầu tiên và không làm lộ việc account có tồn tại.
- TOTP input có keyboard flow tuyến tính, hỗ trợ paste an toàn và không tự chuyển focus làm screen reader mất ngữ cảnh.
- Admin review có map/table/list alternative cho diff; approve và request-changes dùng dialog có title, focus trap, restore focus và keyboard submit/cancel rõ ràng.
- Conflict dialog hiển thị changed paths, server value và local value bằng text, không chỉ bằng màu. Mọi lựa chọn resolve dùng được chỉ bằng bàn phím và yêu cầu xác nhận trước khi bỏ local mutation.
- Publisher desktop phải thấy lý do bị chặn nếu từng tham gia revision với vai trò Editor hoặc Reviewer. Ẩn button không thay thế backend deny response.
- Các route login, MFA, review, conflict và workflow dialog phải đạt WCAG 2.2 AA cho non-map controls và không có axe violation mức critical/serious.

## 11. IndexedDB và Dexie crash-safe autosave

### 11.1 Vai trò và giới hạn

Dexie cung cấp local recovery cache để tránh mất thao tác khi reload, đóng tab, browser crash hoặc mạng gián đoạn. Nó không phải database nghiệp vụ, không tạo publication và không thay thế draft/revision trên backend.

UI phải phân biệt rõ:

- **Đã lưu cục bộ:** edit state đã ghi thành công vào IndexedDB.
- **Đang đồng bộ:** batch mutation đang gửi lên backend.
- **Đã lưu lên máy chủ:** backend đã ack batch mutation, trả server cursor, canonical ID mapping và ETag mới.
- **Có xung đột:** local base không còn khớp server revision.

Không hiển thị “Đã lưu” chung chung khi mới chỉ ghi cục bộ.

### 11.2 Mô hình dữ liệu Dexie

Database được version riêng với app và có các table logic:

| Table | Mục đích |
| --- | --- |
| `workspaces` | Khóa theo `userId + layerId + draftRevisionId + clientId`; lưu `serverCursor`, base ETag, schema fingerprint, timestamps, lifecycle state và local sequence |
| `pendingMutations` | Hàng đợi add/update/delete có `clientMutationId`, `clientFeatureId` khi create, canonical `featureId` khi đã có, base version, payload checksum và trạng thái pending/sending/acked/conflict |
| `idMappings` | Mapping bền vững `clientFeatureId -> canonicalFeatureId`, gắn với `clientMutationId` và server cursor trả về |
| `featureDeltas` | Projection cục bộ của mutation chưa ack để render và phục hồi, không nhân bản toàn bộ base dataset |
| `commandLog` | Undo/redo commands đã chuẩn hóa, có sequence, mutation references và checksum |
| `localCheckpoints` | Snapshot cục bộ theo chunk để phục hồi nhanh và compact command log; không phải server checkpoint |
| `uiPreferences` | Panel sizes, grid columns và tool preference; tách khỏi revision data |
| `recoveryEvents` | Log kỹ thuật tối thiểu về local checkpoint, quota và migration; không chứa property values |

`clientId` định danh browser client trong phạm vi principal, không phải credential. Mỗi mutation có `clientMutationId` duy nhất trước khi ghi Dexie để retry idempotent. Ack chỉ hoàn tất khi response có đúng mutation ID; create ack phải lưu canonical ID mapping trước khi xóa pending payload.

Không lưu original import file, import binary, attachment binary, MinIO presigned URL hoặc Mapbox tile vào Dexie. File import tối đa **25 MiB (26,214,400 bytes)** được upload vào MinIO qua backend; local cache chỉ giữ normalized mutation/delta và trạng thái mapping không chứa binary.

### 11.3 Ghi dữ liệu cục bộ và batch sync

- Edit phản hồi ngay trong memory store.
- Delta và pending mutation được ghi transactionally vào Dexie sau khoảng yên 500-1000 ms; thao tác quan trọng như delete hoặc apply một mapping plan đã xác nhận ghi ngay.
- Khi `visibilitychange` chuyển hidden hoặc `pagehide`, flush queue đồng bộ tốt nhất có thể. Không dựa vào `beforeunload` để bảo đảm dữ liệu.
- Command log được compact thành local checkpoint theo ngưỡng số lệnh hoặc dung lượng, không compact khi transaction chưa hoàn tất hoặc còn mapping chưa ghi bền vững.
- `bulkPut` theo chunk để tránh khóa main thread; serialize hoặc validate geometry lớn trong Web Worker.
- Batch sync tới backend chạy định kỳ khi online và khi người dùng chọn “Lưu lên máy chủ”. Request mang `clientId`, `baseCursor`, `If-Match` và các mutation có `clientMutationId`; batch phải tuân giới hạn API hiện hành.
- Response được xử lý theo từng mutation. Mutation `acked` lưu status, canonical feature ID/version ID và server cursor trước; mutation conflict/rejected vẫn ở local queue để người dùng xử lý.
- Chỉ sau khi backend ack đúng mutation ID và mapping/checksum đã ghi bền vững, local payload tương ứng mới được compact hoặc dọn. Không xóa trước response thành công.

Mục tiêu UX:

- Chỉ báo “Đã lưu cục bộ” xuất hiện trong 2 giây sau thao tác cuối ở điều kiện bình thường.
- Reload hoặc reopen cùng browser profile phục hồi được edit state cuối đã xác nhận cục bộ.
- Autosave không gây map pan, draw hoặc typing có INP vượt 200 ms ở bộ dữ liệu kiểm thử chuẩn.

### 11.4 Recovery flow

Sau khi đăng nhập và kiểm tra quyền, editor so sánh workspace local với server. Không có server lease và không tự tạo draft mới trong recovery flow:

1. Không có local delta: mở server draft bình thường.
2. Local base ETag và `serverCursor` còn hợp lệ: đề nghị tiếp tục bản phục hồi, xem thay đổi hoặc bỏ bản local; pending mutations được batch sync idempotent.
3. Server đã tiến lên sau local cursor: pull change feed, rebase pending mutations và chỉ merge property không chồng lấn sau khi người dùng xác nhận.
4. Geometry hoặc cùng field đã thay đổi ở cả hai phía: không auto-merge. Hiển thị compare và cho chọn giữ server, hoặc áp lại local value thành mutation mới trên cùng active draft sau xác nhận rõ ràng.
5. Khi API trả `SYNC_CURSOR_EXPIRED`, giữ nguyên pending mutations, fetch full workspace qua recovery URL, tải lại feature cần thiết, rebase có kiểm soát rồi hiển thị conflict. Không reset Dexie hoặc mất local queue.
6. Schema fingerprint khác: migrate local payload bằng migration đã khai báo; nếu không thể migrate an toàn, cho export recovery package và giữ bản local read-only.

Không tự áp bản local vào server khi mở editor. Mọi phục hồi phải có người dùng xác nhận và tạo audit event khi được đẩy lên backend.

### 11.5 Multi-tab coordination

- Mỗi workspace chỉ có một tab write-owner qua Web Locks API khi hỗ trợ.
- BroadcastChannel thông báo save status, takeover và server ETag giữa các tab.
- Tab thứ hai mở read-only và có nút yêu cầu quyền chỉnh sửa.
- Takeover phải kiểm tra heartbeat, flush tab cũ nếu còn phản hồi và tạo local checkpoint trước khi chuyển owner.
- Browser không hỗ trợ Web Locks dùng local lease record có expiry trong Dexie; đây chỉ là điều phối giữa tab, không phải server lease và không thay optimistic conflict check.

### 11.6 Privacy và encryption

IndexedDB cùng origin có thể bị đọc bởi JavaScript chạy trong origin đó. Encryption cục bộ không thay thế CSP, Trusted Types, output encoding và phòng chống XSS.

- Field schema có `sensitive` và `offlineCache`. Khi `sensitive=true`, `offlineCache` mặc định là `false`; chỉ policy được phê duyệt rõ mới được phép bật. Field `public=false` không tự động đồng nghĩa sensitive, nhưng vẫn phải tuân `offlineCache`.
- Property có `offlineCache=false` không xuất hiện trong local checkpoint, feature delta, command payload hoặc telemetry. UI phải cảnh báo rằng thay đổi đó cần batch sync thành công để có khả năng phục hồi sau crash.
- Dữ liệu recovery còn lại mã hóa AES-GCM bằng Web Crypto với non-extractable device key khi browser hỗ trợ.
- Key cục bộ chỉ giảm rủi ro đọc trực tiếp file profile; nó không chống được XSS đang chạy cùng origin. Giới hạn này phải được ghi trong threat model.
- Logout chủ động hoặc xóa user phải xóa toàn bộ Dexie records và device key của principal đó. Session expiry chỉ khóa recovery cho tới khi cùng principal re-auth thành công; đổi user không bao giờ cho principal mới đọc recovery cũ.
- Không lưu session token, MFA secret hoặc enrollment URI, recovery code, invite token, CSRF token hay MinIO presigned URL trong Dexie.
- Không ghi property values, geometry, tên file hoặc attachment metadata nhạy cảm vào console, analytics, error reporting hay `recoveryEvents`.
- CSP nghiêm, không dùng script inline tùy ý và không render HTML từ metadata động.

### 11.7 Quota, persistence và eviction

Browser quyết định quota và có thể thu hồi storage. Ứng dụng phải:

- Gọi `navigator.storage.estimate()` trước import/apply lớn và định kỳ theo local checkpoint.
- Yêu cầu `navigator.storage.persist()` như best effort; không coi kết quả true là backup.
- Cảnh báo khi workspace đạt 70% budget ứng dụng hoặc free quota còn thấp.
- Chặn thao tác làm tăng dữ liệu khi đạt 90%, đồng thời yêu cầu đồng bộ server hoặc export recovery package.
- TTL là 30 ngày và chỉ áp dụng cho workspace ở trạng thái synced, closed hoặc discarded. TTL được tính từ lần cập nhật cuối của trạng thái đủ điều kiện.
- Evict theo LRU chỉ với baselines có thể tải lại, local checkpoints đã sync và cache của workspace synced/closed/discarded.
- Tuyệt đối không TTL-delete hoặc evict pending/unsynced mutation, conflict chưa resolve hay command log cần để phục hồi. Dữ liệu này chỉ được xóa sau batch ack, người dùng xác nhận discard hoặc logout chủ động theo security policy.
- Không tự evict unsynced deltas hoặc command log cần để phục hồi. Nếu không còn quota, chuyển editor sang safe read-only cho tới khi sync/export thành công.
- Budget ứng dụng mặc định là giá trị nhỏ hơn giữa 250 MB và 40% quota khả dụng trên origin; phải đo lại bằng dataset thực trước release.

### 11.8 Versioning và migrations

Mỗi workspace lưu tối thiểu:

- `dexieSchemaVersion`.
- `editorStateVersion`.
- `appBuildId`.
- `userId`, `layerId`, `draftRevisionId`.
- `clientId`, `serverCursor`, `baseRevisionId`, `baseETag`, `schemaFingerprint`.
- `clientMutationId`, `clientFeatureId`, canonical ID mapping và ack status cho mutation liên quan.
- `lastLocalSequence`, `lastAckedMutationSequence`.
- `createdAt`, `updatedAt`, checksum.

Dexie migration phải forward-only, idempotent khi có thể và có fixture từ ít nhất hai schema version trước. Không xóa store cũ trong cùng migration trước khi dữ liệu mới được kiểm tra checksum. Khi downgrade app không đọc được schema mới, giữ dữ liệu và hiển thị hướng dẫn thay vì reset database.

## 12. shadcn/ui composition rules

- Dùng semantic tokens như `bg-background`, `text-foreground`, `border-border`, không ghi màu tùy ý trong component.
- Form dùng `FieldGroup`, `Field`, `FieldLabel`, description và error đúng cấu trúc.
- Dialog, Sheet và Drawer luôn có Title, kể cả khi title được ẩn bằng `sr-only`.
- Loading dùng `Skeleton` hoặc `Spinner` đúng ngữ cảnh; empty dùng `Empty`; durable callout dùng `Alert`; toast dùng `sonner`.
- Data-heavy layout ưu tiên `Resizable`, `ScrollArea`, `Tabs`, `Table` hoặc data-grid chuyên dụng đã được chốt.
- Button loading compose `Spinner`, `disabled` và label; không giả định prop `isLoading`.
- Icon đi theo một library duy nhất được project preset xác định. Không tự vẽ SVG paths.
- Trước khi dùng component, kiểm tra component đã cài và xem docs của version hiện tại. Không ship default shadcn appearance.

## 13. Loading, empty, error và degraded states

### 13.1 Public

| State | Hành vi |
| --- | --- |
| Initial loading | Render shell, search và skeleton có kích thước ổn định; danh sách có thể tải độc lập |
| Map loading | Hiển thị trạng thái trong map region, không khóa search/layer catalog |
| Layer loading | Progress tại row layer; layer khác vẫn dùng được |
| Empty viewport | Giải thích không có đối tượng trong vùng đang xem và có CTA xem toàn thành phố |
| No search result | Giữ query, gợi ý sửa chính tả hoặc đổi phạm vi; không xóa map state |
| Partial search failure | Hiển thị kết quả từ nguồn còn hoạt động và nhãn “Kết quả có thể chưa đầy đủ” |
| Map/WebGL failure | Chuyển sang accessible list, search và detail; có retry map |
| Offline | Dùng dữ liệu UI đã cache nếu có, không tuyên bố dữ liệu là mới nhất |

### 13.2 Admin

| State | Hành vi |
| --- | --- |
| Draft loading | Khóa draw tools, giữ shell và show skeleton theo panel |
| Empty layer | CTA vẽ feature đầu tiên hoặc import file; giải thích format hỗ trợ |
| Validation error | Highlight feature/field, mở issue list và cho điều hướng tới lỗi |
| Save local failed | Dừng thao tác tạo thêm dữ liệu nếu cần; cho retry hoặc export recovery |
| Server sync failed | Giữ local state, hiển thị khác biệt giữa local và server status |
| Conflict | Chặn publish/submit, không chặn xem; mở compare flow |
| Permission changed | Chuyển read-only, flush local cache an toàn và yêu cầu re-auth nếu cần |
| Quota exhausted | Safe read-only, ưu tiên sync hoặc export; không tự xóa unsynced edits |
| Worker/import failure | Giữ report, mapping plan và local edit state không chứa binary; cho retry từ server job state hoặc local checkpoint phù hợp |
| Sync cursor expired | Giữ pending mutation, fetch full workspace, rebase có kiểm soát và mở conflict flow; không reset local recovery |

## 14. Responsive behavior matrix

| Viewport | Public map | Admin |
| --- | --- | --- |
| `< 640px` | Search trên, bottom sheet, control tối giản | Chỉ view/comment/approve/request changes; không publish hoặc authoring |
| `640-1023px` | Sheet rộng hơn hoặc side sheet khi đủ chỗ | Chỉ view/comment/approve/request changes; không publish hoặc authoring |
| `1024-1279px` | Floating left panel và right detail có giới hạn width | Chỉ bật desktop editor compact khi pointer + hover + keyboard capability đều đạt; nếu không thì review-only |
| `>= 1280px` | Full floating layout, có thể mở panel hai phía | Chỉ bật full editor khi capability gate đạt; nếu không thì review-only |

Tất cả breakpoint phải test với zoom trình duyệt 200%. Viewport width không đủ để bật authoring và không bao giờ là cơ chế authorization. Mobile/review-only mode không hiển thị publish hoặc rollback.

## 15. Performance budget

- Public LCP của shell dưới 2.5 giây ở điều kiện test đã thống nhất; map có trạng thái riêng và không chặn contentful shell.
- INP dưới 200 ms cho search, layer toggle và admin edit chuẩn.
- CLS dưới 0.1; panel, icon, font và skeleton phải giữ kích thước.
- Mapbox, Terra Draw, Dexie admin recovery và data grid được lazy-load theo route/capability.
- Không render DOM marker cho dataset lớn.
- Search cũ bị abort khi query thay đổi.
- Spatial payload dùng bbox, pagination hoặc MVT. Không tải toàn bộ layer lớn chỉ để tính UI summary.
- Parsing import và geometry validation nặng chạy ở worker hoặc backend.
- Không re-render React tree theo từng `move` event của Mapbox.

## 16. E2E acceptance criteria

### 16.1 Public map

- [ ] `/` mở trực tiếp full map, không có landing page trung gian.
- [ ] Street và Light hoạt động; không có Satellite trong UI.
- [ ] Bật/tắt point, line, polygon, circle và mixed layer không tạo source/layer trùng.
- [ ] MultiPoint, MultiLineString và MultiPolygon render, select và hiển thị metadata đúng; MultiPoint chỉ dùng trong point layer.
- [ ] Search trả kết quả hợp nhất từ published internal data và Geo Service; partial failure vẫn sử dụng được.
- [ ] Public map không ghi layer, feature hoặc viewport vào URL.
- [ ] List view đồng bộ filter/viewport, dùng được chỉ bằng bàn phím và không phụ thuộc WebGL.
- [ ] Mobile chỉ có một bottom sheet active; selected feature không bị che hoàn toàn.
- [ ] Map failure có degraded list/search flow hoạt động.
- [ ] Public non-map flow không có axe violation mức critical/serious; focus order và contrast được kiểm tra thủ công.

### 16.2 Admin editor

- [ ] Desktop có thể vẽ, sửa, xóa và undo/redo point, line, polygon và circle bằng Terra Draw.
- [ ] Multi geometries round-trip qua API không mất part hoặc thay đổi geometry family.
- [ ] Circle HTTP round-trip chỉ dùng `Point + radiusM`; database giữ `radius_m` trong sai số được SRS quy định; MultiPoint circle bị từ chối.
- [ ] Thiết bị không đạt desktop capability không cho authoring, import, sửa schema, publish hoặc rollback; mobile vẫn xem, comment, approve và request changes theo role.
- [ ] Properties form sinh từ schema và hiển thị đủ loading, invalid, readonly và private states.
- [ ] Không có hành động editor tự duyệt revision của mình.
- [ ] Publisher từng là Editor hoặc Reviewer của revision bị chặn publish kể cả sau khi đổi role; UI giải thích và backend deny đều được kiểm thử.
- [ ] Login, MFA, admin review, conflict và workflow dialogs dùng được chỉ bằng bàn phím và không có axe violation mức critical/serious.

### 16.3 Dexie recovery

- [ ] Edit một feature, reload ngay sau chỉ báo local save và phục hồi đúng geometry, properties cùng undo history.
- [ ] Đóng tab rồi mở lại cùng browser profile vẫn thấy recovery prompt sau khi re-auth.
- [ ] Server draft vẫn là source of truth; local recovery không tự ghi lên server.
- [ ] ETag conflict không auto-merge geometry và không làm mất bản local hoặc server.
- [ ] Pending queue giữ đủ `clientId`, `clientMutationId`, `clientFeatureId`, `serverCursor`, ack status và canonical ID mapping để retry idempotent.
- [ ] `SYNC_CURSOR_EXPIRED` fetch full workspace, rebase mutation chưa ack và không làm mất local queue.
- [ ] Schema migration giữ được recovery fixture từ ít nhất hai version trước.
- [ ] Hai tab không cùng write workspace; takeover hoạt động và không tạo sequence trùng.
- [ ] Khi IndexedDB transaction fail hoặc quota đầy, editor chuyển sang safe state và cho sync/export.
- [ ] LRU eviction không xóa unsynced delta.
- [ ] Logout chủ động xóa Dexie principal; session expiry chỉ khóa tới khi cùng principal re-auth; user khác trên cùng profile không thấy recovery metadata.
- [ ] Field `sensitive=true` mặc định có `offlineCache=false`; mọi field `offlineCache=false` bị loại khỏi local recovery payload.
- [ ] TTL 30 ngày chỉ dọn synced/closed/discarded workspace; unsynced mutation không bị TTL hoặc LRU eviction.
- [ ] Session/MFA/invite/CSRF secret, presigned URL, original import file, import binary và attachment binary không xuất hiện trong IndexedDB.

### 16.4 Visual và responsive

- [ ] Implementation khớp visual direction đã chọn ở cùng viewport và state.
- [ ] Không có gradient, glass, glow hoặc animation không có mục đích.
- [ ] Mọi component dùng semantic tokens và radius scale đã định nghĩa.
- [ ] Public desktop, public mobile, admin desktop và admin review mobile không overflow ở các viewport chuẩn.
- [ ] `prefers-reduced-motion`, browser zoom 200% và high contrast focus đều sử dụng được.
- [ ] Loading, empty, error, offline, conflict và permission-changed states có test ảnh hoặc assertion hành vi.

## 17. Những điều không làm

- Không tạo landing page trước bản đồ.
- Không lưu map state vào URL để share.
- Không gọi trực tiếp dịch vụ geocoding, Places hoặc directions của bên thứ ba từ frontend.
- Không dùng MongoDB hoặc IndexedDB như nguồn dữ liệu publish.
- Không cho mobile authoring, import, sửa schema, publish hoặc rollback.
- Không hard-code component theo từng layer dữ liệu.
- Không dùng satellite, gradient, glassmorphism, AI-purple, decorative motion hoặc custom cursor.
- Không âm thầm merge geometry conflict.
- Không xóa unsynced local draft do quota hoặc migration lỗi.

## 18. Review checklist cho pull request frontend

- Visual direction đã được chọn và có source frame để so sánh.
- Component nằm đúng RSC/client boundary; browser-only dependency không lọt vào server bundle.
- Mapbox/Terra Draw event listeners và resources được cleanup.
- Dynamic layer không hard-code nghiệp vụ của một dataset cụ thể.
- shadcn composition, semantic tokens, radius và no-gradient rule được tuân thủ.
- Public flow có accessible list alternative và keyboard coverage.
- Admin mobile không lộ authoring, import, sửa schema, publish hoặc rollback action.
- Dexie change có migration, recovery fixture, quota path, conflict path và privacy review.
- API state và local state có nhãn phân biệt rõ.
- Loading, empty, error và degraded states được triển khai cùng happy path.
- Playwright E2E và visual regression chạy trong Docker pipeline liên quan.

## 19. Quyền sở hữu quyết định

- Product owner phê duyệt visual direction và thay đổi phạm vi trải nghiệm.
- Design owner quản lý token, layout patterns, accessibility và visual QA.
- Frontend owner quản lý RSC boundaries, Mapbox/Terra Draw integration và Dexie recovery.
- Backend owner quản lý revision truth, ETag, permissions, Geo Service gateway và publish state.
- Security review bắt buộc khi thay đổi local caching, sensitive fields, CSP hoặc session behavior.

Tài liệu này chỉ được xem là hoàn tất cho giai đoạn thiết kế khi đúng ba visual directions đã được tạo, một hướng được chọn, và các token thương hiệu chính thức đã được ghi nhận.
