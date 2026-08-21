# DanangMap Frontend Design QA

> Run date: 2026-08-21
>
> Selected direction: Direction 1 — Civic Focus (refined)
>
> final result: blocked

## 1. Source and implementation matrix

| Surface / state | Approved source raster | Source CSS target / density | Implementation capture | Capture CSS / raster / density |
| --- | --- | --- | --- | --- |
| Public desktop, list + feature detail | `docs/visual-directions/direction-1-refined.png` — 1484×1060 px | 1484×1060 CSS px / 1× | `docs/visual-directions/implementation-public-desktop.png` | 1484×1060 CSS px / 1484×1060 px / DPR 1 |
| Public mobile, feature detail sheet | `docs/visual-directions/direction-1-public-mobile.png` — 853×1844 px | 390×844 CSS px / ≈2.19× source render | `docs/visual-directions/implementation-public-mobile.png` | 390×844 CSS px / 390×844 px / DPR 1 |
| Admin editor desktop | `docs/visual-directions/direction-1-admin-editor-desktop.png` — 1487×1058 px | Design target 1440×1024; raster review at 1487×1058 | `docs/visual-directions/implementation-admin-editor-desktop.png` | 1487×1058 CSS px / 1487×1058 px / DPR 1 |
| Admin review mobile | `docs/visual-directions/direction-1-admin-review-mobile.png` — 853×1844 px | 390×844 CSS px / ≈2.19× source render | `docs/visual-directions/implementation-admin-review-mobile.png` | 390×844 CSS px / 390×844 px / DPR 1 |

Additional degraded-state evidence:

- `docs/visual-directions/implementation-public-mobile-layers-degraded.png`
- `docs/visual-directions/implementation-public-mobile-detail-degraded.png`

All implementation images were captured from the running Next.js app through the in-app browser at explicit viewport overrides. Public/editor/review captures use the designed no-token state; no source raster or third-party Mapbox token was used to fake a live map.

## 2. Typography and copy

- Implementation uses `Roboto` through `next/font` with Latin and Vietnamese subsets; no runtime font `<link>` is used.
- Public body and search copy use a 16 px base with 24 px line height. Public panel labels use 14 px/20 px; feature headings use 18 px/24 px and 600 weight.
- Admin uses the approved denser 14 px/20 px product-UI scale; table labels use 12 px–14 px without uppercase tracking.
- Vietnamese diacritics render correctly in the inspected screenshots and DOM snapshots.
- Identity copy is exactly “Bản đồ số Đà Nẵng”; no `v2` or version badge is exposed.
- Public degraded copy names the missing Mapbox configuration and preserves the list-based route. Demo fixtures carry the persistent label “Chế độ demo · Không phải dữ liệu công bố.”
- High-impact admin actions that do not yet have a confirmed API contract are visibly disabled with an honest reason instead of appearing interactive.

## 3. Spacing, rhythm and layout

- The implementation uses a 4 px base rhythm. Public header/panels use 12–16 px outer spacing, 8–12 px grouped spacing and at least 44 px touch targets.
- Public desktop preserves stable zones: identity/search at top, layer catalog at left, optional results beside it, feature detail at right and map controls at the far right.
- The zoom group is vertical and no longer overlaps the shortened feature-detail panel.
- Public mobile retains the approved identity row, search, right-side map controls and one bottom sheet at a time. The feature-detail capture now matches the selected source state.
- Admin editor preserves the geojson.io-inspired explorer → Terra Draw rail → canvas → inspector relationship and a bottom data table. Density is intentionally higher than public UI.
- Mobile admin authoring is gated by width, hover and fine-pointer capabilities; review remains available with fixed reviewer actions.

## 4. Shape, elevation, color and icons

- Primary is flat `#1A73E8`; selected pale surface is `#EAF3FF`; foreground is `#202124`; border is `#DADCE0`; subtle surface is `#F8FAFD`.
- Control radius is 8 px, map-control radius is 10 px and panel radius is 12 px. Mobile bottom sheets use the documented larger top corners only for the sheet affordance.
- Controls use neutral shadows `0 1px 2px rgb(60 64 67 / .18), 0 1px 3px 1px rgb(60 64 67 / .12)`; panels use `0 2px 6px 2px rgb(60 64 67 / .15)`.
- No CSS gradient, glass, glow, decorative background image or satellite control is present.
- User-facing icons come from `@tabler/icons-react` at 1.75 stroke. The current map mark is a neutral Tabler icon; an official city crest asset was not supplied and the v1 anniversary `1022` logo was intentionally not reused.
- Layer colors are catalog data, not UI color branches. Popup fields render from layer field schema rather than hard-coded address/phone rules.

## 5. Image, map and geometry quality

- The product has no decorative imagery; the map is the primary visual canvas.
- Mapbox GL JS is isolated to client components and supports Street/Light only. Custom GeoJSON sources/layers are deterministically recreated on `style.load` and updated from the latest feature ref.
- A focused unit test changes basemap twice and verifies one source, no duplicate layers and the latest feature collection after rehydration.
- Terra Draw uses the supported `terra-draw-mapbox-gl-adapter` and exposes select, point, line, polygon and circle modes. Dexie stores recovery geometry/form state only; no token, MFA secret, import binary or attachment is persisted.
- Live basemap labels, marker contrast, polygon composition and Terra Draw rendering cannot be visually scored without a URL-restricted Mapbox public token. Current captures correctly show the no-token degraded surface.

## 6. Primary interaction evidence

- Public: search combines feature names and metadata, layer toggles filter canvas/list data, list selection opens details, details use schema metadata, zoom/location/reset/basemap controls are wired, and the no-token route remains useful by list.
- Admin editor: draw mode changes are wired to Terra Draw; metadata changes and geometry snapshots mark the local draft dirty; Dexie autosave is debounced; recovery is blocked from autosave overwrite until Resume/Discard; restore requests made before map readiness are queued and applied once.
- Recovery keys are scoped by authenticated-principal placeholder + layer + draft revision. The dev principal is explicitly replaceable by the authenticated server-session subject.
- Admin mobile: authoring requires `(min-width: 1024px) and (hover: hover) and (pointer: fine)`; coarse/touch contexts receive the review-only capability gate.
- Public Playwright checks cover desktop degraded/list/detail and mobile layer sheet. Admin checks cover desktop editor and mobile capability gating.
- Public DOM, editor DOM and review DOM were inspected in the in-app browser. Browser console checks returned no errors or warnings in the inspected final states.

## 7. Focused-region evidence

No additional zoomed crop is claimed as pass evidence. The unresolved difference is global—the entire central cartographic canvas—so a focused crop would hide rather than clarify the blocker. Whole-viewport pairs are the correct evidence until a restricted token permits same-state live-map capture. After token configuration, focused crops should be added for marker/polygon contrast, the feature panel/control clearance and Terra Draw selected-vertex styling.

## 8. Comparison history and severity

### Iteration 1

- Public mobile was captured in layers state and omitted the approved identity row.
- Desktop zoom controls were horizontal and could overlap the feature panel.
- Admin/public canvases were correctly degraded because no token was available.

### Iteration 2

- Added the mobile identity row and captured the feature-detail state.
- Made zoom controls vertical, shortened detail height and removed the duplicate mobile close action.
- Added explicit demo labeling and prevented production API failure from silently showing fixture data.
- Corrected Mapbox style lifecycle, Dexie recovery overwrite/race behavior and pointer/hover capability gating.

### Open severity status

- **P0:** none open in the implemented/code-tested scope.
- **P1 (blocking final visual pass):** live map cannot be compared with approved targets because `NEXT_PUBLIC_MAPBOX_TOKEN` is absent.
- **P2:** replace the neutral map mark only when an approved city crest/identity asset is supplied; do not reuse the anniversary `1022` logo.

## 9. Gate decision

Configure a URL-restricted `NEXT_PUBLIC_MAPBOX_TOKEN`, repeat the four exact-viewport/state captures, add focused map/geometry crops, compare marker/label/geometry contrast on Street and Light, and update this report only after those checks pass.

The credential blocker does not prevent typecheck, lint, unit, production build, Playwright or Docker verification. It does prevent an honest final visual-fidelity pass against source targets that contain a live map.
