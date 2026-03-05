# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:5173/SheetMusic_Viewer/
npm run dev -- --host  # Dev server with LAN access (for iPad testing)
npm run build        # Production build to dist/
npm run preview -- --host  # Preview production build with LAN access
npm run test:e2e     # Run Playwright E2E tests
```

## Architecture

**ScoreFlow** is a PWA sheet music viewer for professional musicians built with **Vite + Vanilla JS** (no framework). The base URL path is `/SheetMusic_Viewer/`.

### Core files

- **`src/main.js`** (~4200 lines) — Monolithic `ScoreFlow` class containing all application logic: PDF rendering, annotation drawing, layer management, UI controls, persistence, and collaboration.
- **`index.html`** (~3950 lines) — Main entry point with all HTML structure, embedded anti-FOUC CSS, and Google Sign-In script.
- **`src/constants.js`** — Tool category definitions (Edit, Pens, Bowing, Fingering, Articulation, Tempo, Dynamic, Anchor).
- **`src/db.js`** — Thin IndexedDB wrapper (`get`, `set`, `clear`) for offline storage.
- **`src/gdrive.js`** — Google Drive integration (stub/in-progress).
- **`src/style.css`** — Application styles with dark/light theme.

### Key architectural concepts

**Layered annotation system:** Annotations are grouped into professional layers (Performance, Fingering, Bowing, Personal). Each layer has an independent visibility toggle. The toolbar dynamically changes tools based on the active layer.

**Score fingerprinting:** On PDF upload, a SHA-256 fingerprint is computed. All annotations are keyed by this fingerprint in IndexedDB, so annotations are isolated per score version.

**Smart Anchor & Jump system:** Anchor flags mark jump targets. Pressing Space/arrow keys scrolls to the next anchor below a configurable visual baseline (horizontal dashed line). A dynamic viewport anchor auto-generates at the bottom of the current view when no manual anchors exist. Jump fallback (no anchors in direction) steps exactly `viewportHeight - 2×jumpOffsetPx` for symmetric J/K navigation.

**Ruler (Jump Ruler):** A vertical ruler sits to the left of the PDF (right edge flush with PDF left edge) and displays anchor marks and the current jump target line. Toggle with the ruler button in the doc bar or keyboard shortcut `R`. Visibility persisted in localStorage. Uses `getComputedStyle` for width measurement when ruler is hidden (`offsetWidth` returns 0 for `display:none`).

**Continuous Measure Tool:** Clicking places a measure number label locked to `x: 0.05` (left edge). A custom modal prompts for starting number and auto-increment step. Numbers also appear on the left vertical ruler. Measure markers are styled as a light outline box with no fill and translucent text. Measure markers are independent from the Anchor system.

**Category state memory:** Switching tool categories restores the last-used tool in that category.

**Persistence flow:** User annotates → canvas drawings stored in IndexedDB (keyed by score fingerprint) → switching scores saves/restores from IndexedDB → export produces a `.json` bundle.

**Exit Mission flow:** Settings > Exit Mission hides all main UI elements (floating-doc-bar, ruler, sidebar-trigger, layer-toggle-fab) and returns to the startup wizard (Mission Hub) unless the user cancels the dialog.

### Floating Document Control Bar (`#floating-doc-bar`)

The right-side docked toolbar contains these button groups:

| Group | Buttons | Shortcuts |
|---|---|---|
| Jump Controls | Jump to Head, Jump to End, Toggle Ruler | Home, End, R |
| Quick Modes | Pan/View, Select, Eraser, Anchor | (click), V, E, A |
| Zoom | Zoom In, Zoom Out, Fit to Width, Fit to Height | +/=, -, W, F |
| Visibility | Notation Visibility toggle | Shift+V |
| Stamp Palette | Toggle stamp tool panel | T |

**CSS Tooltips:** All `.zoom-btn-mini` buttons have `data-tooltip` auto-wired from their `title` attribute in `initElements()`. CSS `::after` pseudo-element shows a styled dark tooltip on hover (hidden on touch devices via `@media (pointer: coarse)`).

### Zoom system

- `this.scale` — current zoom level (default 1.5 = 150%)
- `changeZoom(delta)` — increments scale by delta, clamps to [0.5, 4], re-renders
- `fitToWidth()` — calculates scale so page width fills viewer width (accounting for ruler if visible)
- `fitToHeight()` — calculates scale so page height fills viewer height
- After any zoom change: `updateRulerPosition()`, `computeNextTarget()`, `updateRulerMarks()` are called to recalculate layout

### Pan / View mode

In **Pan mode** (hand tool active, `activeStampType === 'view'`):
- **Mouse drag:** clicking and dragging scrolls the viewer (`viewer.scrollTop/Left`). Implemented via window-level `mousemove`/`mouseup` listeners attached on `mousedown`, self-cleaning on release.
- **Touch:** native iOS/browser scroll (no `preventDefault()` called in view mode for `touchstart`)
- Cursor shows `grab`; changes to `grabbing` during mouse drag

### Interaction mode cursors

Set via `data-active-tool` attribute on `#viewer-container`:
- `view` → `grab` / `grabbing` (during drag)
- `select` → `default`
- `pen`, `highlighter` → `crosshair`
- Others (stamps) → `default`

### Platform targets

Optimized for macOS (desktop) and iPad/iOS. The layout has two modes:
- **Split-View** (wide screens): sidebar and score side-by-side
- **Float-View** (narrow screens): slide-in sidebar overlay

**iPad Safari:** `overscroll-behavior: none` on `body` prevents Safari's back/forward swipe gesture from conflicting with the app. `overscroll-behavior: contain` on `.viewer-container` prevents rubber-band scroll propagation. No `touch-action` overrides (breaks annotation overlay touch handlers). No JS edge-swipe interceptors (block doc-bar button taps near the right edge).

PWA service worker caches all assets for fully offline operation (important for concert halls without WiFi).

### Testing

E2E tests use Playwright (`tests/automation-check.js`). Test PDFs are stored locally at `Test_Document/`. Manual testing on an iPad via `npm run dev -- --host` is part of the standard workflow.

### Keyboard shortcuts reference

| Key | Action |
|---|---|
| Space | Jump forward (next anchor) |
| ← / → | Jump backward / forward |
| Home / End | Jump to head / end of score |
| R | Toggle ruler |
| V | Toggle Select mode |
| E | Toggle Eraser mode |
| A | Toggle Anchor mode |
| W | Fit to Width |
| F | Fit to Height |
| + / = | Zoom in |
| - | Zoom out |
| S | Toggle sidebar |
| H / ? | Help / Shortcuts overlay |
| Shift+V | Toggle notation visibility |
| T | Toggle stamp palette |
| Esc | Close all panels, return to View mode |
| Delete / Backspace | Delete focused stamp |
