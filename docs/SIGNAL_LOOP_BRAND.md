# Signal Loop — Standalone Brand Canon

**Visual source:** approved cinematic mobile welcome screen, November 24, 2026. This is Signal Loop's independent visual identity, not an FCR dashboard.

## Signature
Continuous moonlit mountain-and-waterfall world; Loop and the builder as the hero; dark indigo/black, vivid amethyst and cyan lighting; radiant infinity mark; responsive clear glass surfaces with consistent 24px radius; feathered waterfall reflection motion; low-contrast subtle drifting particles; script accent *signals*.

## Behavior and accessibility
- Mobile first: hero artwork, brand message, CTA, human-controlled workflow, evidence notes, companion visual choices, truthful plans.
- Sign-up and login reuse existing backend routes, no OAuth claim or fake GitHub account state.
- `sl-companion` stores a local **visual preference only**. No imaginary AI agent or automatic social posting.
- Ambient water uses Web Audio only after an explicit button tap; stops when tab is hidden. Reduced motion disables visual ambience, not content.
- Verified commit binding, proof link preservation, tenant isolation, server-side quotas, and truth firewall remain untouched.
- Pro price stays null: display Early access, never a fabricated amount or active checkout.

## Evidence
- Local Chromium browser smoke: 320px, 390px, 768px, 1440px, no overflow or page errors; menu, companion selection, audio toggling and links checked.
- Seven node:test checks for brand contracts passed locally.
- Remote repository test and production status remain separately gated; no launch claim.

## Assets
Two generated scenic WebP images are shipped as base64-encoded public binary media within `src/brand-media.ts` for a zero-runtime-dependency Worker, served from `/assets/signal-world.webp` and `/assets/signal-world-mobile.webp`. These files contain only artwork, no private account data.