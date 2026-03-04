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

- **`src/main.js`** (~4000 lines) — Monolithic `ScoreFlow` class containing all application logic: PDF rendering, annotation drawing, layer management, UI controls, persistence, and collaboration.
- **`index.html`** (~3900 lines) — Main entry point with all HTML structure, embedded anti-FOUC CSS, and Google Sign-In script.
- **`src/constants.js`** — Tool category definitions (Edit, Pens, Bowing, Fingering, Articulation, Tempo, Dynamic, Anchor).
- **`src/db.js`** — Thin IndexedDB wrapper (`get`, `set`, `clear`) for offline storage.
- **`src/gdrive.js`** — Google Drive integration (stub/in-progress).
- **`src/style.css`** — Application styles with dark/light theme.

### Key architectural concepts

**Layered annotation system:** Annotations are grouped into professional layers (Performance, Fingering, Bowing, Personal). Each layer has an independent visibility toggle. The toolbar dynamically changes tools based on the active layer.

**Score fingerprinting:** On PDF upload, a SHA-256 fingerprint is computed. All annotations are keyed by this fingerprint in IndexedDB, so annotations are isolated per score version.

**Smart Anchor & Jump system:** Anchor flags mark jump targets. Pressing Space/arrow keys scrolls to the next anchor below a configurable visual baseline (horizontal dashed line). A dynamic viewport anchor auto-generates at the bottom of the current view when no manual anchors exist.

**Continuous Measure Tool:** Clicking places a measure number label locked to `x: 0.05` (left edge). A custom modal prompts for starting number and auto-increment step. Numbers also appear on the left vertical ruler. Measure markers are independent from the Anchor system.

**Category state memory:** Switching tool categories restores the last-used tool in that category.

**Persistence flow:** User annotates → canvas drawings stored in IndexedDB (keyed by score fingerprint) → switching scores saves/restores from IndexedDB → export produces a `.json` bundle.

### Platform targets

Optimized for macOS (desktop) and iPad/iOS. The layout has two modes:
- **Split-View** (wide screens): sidebar and score side-by-side
- **Float-View** (narrow screens): slide-in sidebar overlay

PWA service worker caches all assets for fully offline operation (important for concert halls without WiFi).

### Testing

E2E tests use Playwright (`tests/automation-check.js`). Test PDFs are stored locally at `Test_Document/`. Manual testing on an iPad via `npm run dev -- --host` is part of the standard workflow.
