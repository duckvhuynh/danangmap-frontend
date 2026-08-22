# DanangMap Frontend Design QA

> Run date: 2026-08-22
>
> Selected direction: Direction 1 — Civic Focus (refined)
>
> Final result: **blocked for release sign-off; live Mapbox runtime and core interaction pass**

## 1. Source and live implementation matrix

Every whole-screen comparison below contains the approved source and the running implementation in one raster. Captures came from the in-app browser, not a mocked canvas.

| Surface / state | Approved source | Live implementation | Combined comparison | Result |
| --- | --- | --- | --- | --- |
| Public desktop, layer catalog + feature detail | `docs/visual-directions/direction-1-refined.png` — 1484×1060 | `implementation-public-desktop-street-matched.png` — 1484×1060, supplied custom Street style | `comparison-public-desktop-street-live.png` | Runtime/controls pass; fixture density differs |
| Public desktop, Light round-trip | same UI source | `implementation-public-desktop-live-matched.png` — 1484×1060, Light | `comparison-public-desktop-live-matched.png` | Pass for style switch and overlay rehydration |
| Public mobile, feature detail sheet | `direction-1-public-mobile.png` — 390×844 CSS target | `implementation-public-mobile-live.png` — 390×844 | `comparison-public-mobile-live.png` | Map-first/sheet/touch layout pass; fixture density and camera framing differ |
| Admin editor desktop, selected geometry | `direction-1-admin-editor-desktop.png` — 1487×1058 | `implementation-admin-editor-desktop-live.png` — 1487×1058 | `comparison-admin-editor-desktop-live.png` | Terra Draw selection and workspace pass; target remains denser |
| Admin review mobile, map tab + enabled reviewer actions | `direction-1-admin-review-mobile.png` — 390×844 CSS target | `implementation-admin-review-mobile-live.png` — 390×844 | `comparison-admin-review-mobile-live.png` | Functional/layout pass; revision data, camera framing and bottom admin navigation differ |

Focused comparisons:

- `comparison-focus-public-overlay.png` — basemap labels, markers and polygon overlay.
- `comparison-focus-public-panel-controls.png` — feature panel hierarchy and control clearance.
- `comparison-focus-editor-selected-geometry.png` — Terra Draw selected geometry treatment.

The product owner supplied a new custom Street style after the source rasters were approved. Its cartography is therefore an explicit override to the source image's old basemap, while the white/blue UI shell, floating controls, radii, shadows and no-gradient rules remain the comparison target.

## 2. Live functional evidence

- The custom Street descriptor and official Light descriptor both returned HTTP 200 and rendered in Mapbox GL JS.
- Street → Light → Street completed without losing the GeoJSON source, polygon outlines, points or selected detail.
- The only browser warning was Mapbox rebuilding a style because sprite/glyph diffing is not implemented; no application or Mapbox load error remained.
- Demo public search now searches the loaded map dataset locally. `cong an` matches `Công an phường Hải Châu`, selects the existing feature and opens its schema-driven detail. Non-demo search still uses the combined backend + Geo Service contract.
- Terra Draw select and polygon modes activate through accessible buttons; selecting geometry enables the delete action. Unit coverage still exercises draw-mode, restore and Dexie recovery paths.
- Mobile review now opens map-first with Bản đồ/Thay đổi/Nhận xét tabs, compact summary, review-only guidance and fixed `Yêu cầu sửa` / `Phê duyệt` actions. The tablist uses roving focus plus Arrow Left/Right, Home and End keyboard navigation. Request changes remains comment-gated.

## 3. Visual-system findings

- Flat civic blue, white surfaces, Tabler Icons, Google Maps-like 8/10/12 px radii and neutral shadows remain consistent.
- No gradient, glassmorphism, satellite UI, decorative image or custom cursor was introduced.
- Polygon fill opacity was reduced from 0.18 to 0.12 so Street labels remain legible; outlines and point contrast remain clear on Street and Light.
- Public mobile and admin review mobile have one foreground sheet/panel at a time and preserve 44 px minimum controls.
- Admin review now occupies the exact 390×844 page viewport without an accidental document scrollbar.

## 4. Automated and container gates

- Focused regression: 39/39 tests pass across Mapbox style, admin API/demo role, public search, combobox and revision review.
- Full Vitest: 343/343 pass.
- ESLint: pass with zero warnings.
- TypeScript: pass.
- Next.js production build: pass, 17 static/dynamic route entries generated.
- Docker production image: pass.
- Container smoke: `/api/health` 200, `/` 200, brand present, runtime UID 1001 (non-root).

## 5. Remaining release blockers

### P1 — supplied public token is not URL-restricted

The same style descriptor returned HTTP 200 for both the allowed local origin and a deliberately unauthorized origin. The public token is client-safe by prefix, but it is not yet origin-restricted. Restrict it in the Mapbox dashboard to the production/staging domains and intentional localhost entries, then repeat the origin probe. The credential itself is ignored locally and is not present in tracked source, screenshots or this report.

### P1 — exact source-fixture fidelity is incomplete

The approved source rasters contain a richer legacy/demo dataset than the current five-feature sample. Public viewport and interaction state are aligned, but camera framing, marker count, layer catalog density and feature copy are not pixel-equivalent. Admin editor similarly has a valid Terra Draw workspace with two demo objects rather than the dense selected-vertex/table fixture in the source. Admin review uses the requested 390×844 viewport and working review state, but its revision number, feature count, author, camera framing and bottom navigation differ from the source. These differences must remain visible in the comparison evidence; they are not claimed as a pixel-match pass.

### P2 — later polish

- Enrich the demo fixture from approved municipal sample data so public and editor comparisons can use the same feature population as the source.
- Tighten selected-vertex styling in Terra Draw to approach the reference while keeping the supported adapter/mode APIs.
- Replace the neutral map brand mark only when an approved city crest/identity asset is supplied.

## 6. Gate decision

Mapbox activation, custom style rendering, Light fallback, overlay lifecycle, public search and mobile review are accepted for continued development. Final visual/security sign-off stays **blocked** until the token is URL-restricted and an exact reference-state comparison passes, or the product owner explicitly accepts every documented visual and demo-data variance.
