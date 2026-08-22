# DanangMap visual directions

## Approved source targets

- `direction-1-refined.png` — public desktop
- `direction-1-public-mobile.png` — public mobile
- `direction-1-admin-editor-desktop.png` — admin editor desktop
- `direction-1-admin-review-mobile.png` — admin review mobile

## Implementation QA captures

The selected direction is `Direction 1 — Civic Focus (refined)`. Live Mapbox captures and same-input comparisons were recorded on 2026-08-22 at the exact CSS targets listed in `../../design-qa.md`.

Status: `SELECTED_LIVE_QA_ACCEPTED_DEFERRED_OPS`

The live application renders the product-owner-supplied custom Street style and the official Light style. A fresh automated browser gate passed Street → Light → Street plus the approved public/admin desktop/mobile targets. The product owner accepted frontend issue #4 with URL restriction deferred to deployment operations; this is not a claim that the token is already restricted. The small demo fixture remains visibly different from the approved source rasters and is tracked as later visual-fidelity work.

| Lựa chọn | Artifact | Trọng tâm |
|---|---|---|
| 1 | [`direction-1.png`](direction-1.png) | Civic Focus, floating layer panel và feature detail ổn định |
| 2 | [`direction-2.png`](direction-2.png) | Layer Dock, navigation rail, search command panel và active-layer dock |
| 3 | [`direction-3.png`](direction-3.png) | Civic Atlas, text-first layer catalogue và map/list switch |

Direction 2 and Direction 3 remain historical alternatives and must not be mixed into the selected system without a new product-owner review.
