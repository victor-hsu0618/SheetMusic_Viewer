# Copilot Instructions for ScoreFlow

## Commands

### Development
```bash
npm install                    # Install dependencies
npm run dev                    # Start dev server at http://localhost:5173/SheetMusic_Viewer/
npm run dev -- --host         # Dev server with LAN access (iPad/tablet testing)
npm run build                 # Production build to dist/
npm run preview -- --host     # Preview production build with LAN access
npm run test:e2e              # Run Playwright E2E tests (requires dev server running)
npx playwright install chromium  # Install Playwright browsers (first time only)
```

## Project Overview

**ScoreFlow** is a professional-grade sheet music viewer PWA built with **Vite + Vanilla JavaScript** (no framework). It transforms PDF reading into a collaborative musical workstation with annotation layers, smart navigation, and ensemble features. Base URL path: `/SheetMusic_Viewer/`.

### Core Technologies
- **Build System**: Vite
- **PDF Rendering**: PDF.js (with local worker for offline reliability)
- **Data Persistence**: IndexedDB (via `src/db.js`) + LocalStorage
- **Styling**: Modular CSS (26 files) with CSS custom properties
- **Deployment**: PWA (Service Workers) + GitHub Pages
- **Backend**: Supabase (optional, for sync/collaboration)
- **iOS**: Capacitor wrapper for App Store distribution

## Architecture

### Entry Points
- **`src/main.js`** (~867 lines) — Central orchestrator. Instantiates ~35 manager modules and registers PWA service worker.
- **`index.html`** (~3950 lines) — Complete DOM structure, anti-FOUC CSS, Google Sign-In script.

### Manager Pattern (`src/modules/`)
All feature logic lives in reusable manager classes. Key modules:

| Module | Purpose |
|---|---|
| `ViewerManager.js` | PDF rendering, canvas, page layout, zoom |
| `AnnotationManager.js` | Annotation CRUD, storage (calls AnnotationRenderer) |
| `AnnotationRenderer.js` | Drawing annotations onto canvas |
| `InteractionManager.js` | Pen/eraser/stamp input handling, canvas interaction |
| `annotation/interaction/CoordMapper.js` | PDF↔canvas coordinate mapping |
| `JumpManager.js` | Anchor-based navigation, history tracking |
| `RulerManager.js` | Vertical jump ruler (shows anchors & current target) |
| `LayerManager.js` | Professional annotation layers + visibility toggle |
| `ToolManager.js` | Toolbar state, tool persistence per category |
| `ScoreManager.js` | Score library, PDF import, fingerprinting |
| `ScoreDetailManager.js` | Per-score metadata (composer, title, fingerprint) |
| `PersistenceManager.js` | IndexedDB/LocalStorage abstraction layer |
| `InputManager.js` | Keyboard shortcuts, gesture handling |
| `GestureManager.js` | Touch & iPad-specific gestures |
| `DockingBarManager.js` | Floating draggable document control bar (FAB) |
| `EditSubBarManager.js` | Edit toolbar UI (largest module at ~70KB) |
| `SettingsPanelManager.js` | Settings & preferences |
| `SupabaseManager.js` | Cloud sync & real-time collaboration |
| `PlaybackManager.js` | Playback features & animation |
| `DocActionManager.js` | Project import/export, system dialogs |

### Supporting Utilities
- **`src/constants.js`** — Tool definitions, layer presets, toolsets
- **`src/db.js`** — Lightweight IndexedDB wrapper (`get`, `set`, `clear`)
- **`src/fingerprint.js`** — SHA-256 PDF fingerprinting for annotation keying
- **`src/styles/`** — 26 modular CSS files (animations, components, responsive layouts)

## Key Architectural Concepts

### Per-Score Annotation Isolation
- Every PDF receives a unique SHA-256 fingerprint on import
- All annotations keyed by this fingerprint in IndexedDB
- Switching scores auto-saves/restores annotations
- First-time opening = clean canvas

### Layered Annotation System
- 5 professional layers: Pens, B.Fingering, Articulation, Text, Others
- Each layer has independent visibility toggle (shows/hides all in that layer)
- Toolbar dynamically switches available tools based on active layer
- Tool persistence: switching layers restores last-used tool in that category

### Smart Jump & Anchor System
- Manual anchors mark jump targets (Space/arrow keys navigate)
- Jumps scroll to next anchor below a configurable **visual baseline** (horizontal dashed line)
- Dynamic viewport anchor auto-generates at bottom of current view if no manual anchors exist
- Jump fallback (no anchors in direction): steps exactly `viewportHeight - 2×jumpOffsetPx`
- `RulerManager` tracks navigation history via **Navigation Epoch** design (clears on manual jumps)

### Jump Ruler
- Vertical ruler on left side (right edge flush with PDF)
- Displays anchor marks and current jump target line
- Toggle via ruler button or keyboard `R`
- Visibility persisted in localStorage
- Uses `getComputedStyle()` for width measurement when hidden

### Continuous Measure Tool
- Click-to-place measure numbers (locked to `x: 0.05`, left edge)
- Custom modal prompts for starting number & auto-increment step
- Numbers visible on left ruler & canvas
- Independent from anchor system

### Persistence Flow
Annotate → IndexedDB (fingerprint-keyed) → Switch scores (auto-save/restore) → Export JSON bundle

### Zoom System
- `this.scale` default: 1.5 (150%)
- `changeZoom(delta)` increments scale, clamps to [0.5, 4], re-renders
- `fitToWidth()` / `fitToHeight()` calculate scale to fill viewport (accounts for ruler)
- After zoom: `updateRulerPosition()`, `computeNextTarget()`, `updateRulerMarks()` called

### Pan / View Mode
- Hand tool active: `activeStampType === 'view'`
- Mouse drag: scrolls viewer via `viewer.scrollTop/Left`
- Touch: native iOS/browser scroll (no preventDefault in view mode)
- Cursor: `grab` (idle), `grabbing` (dragging)

## Code Conventions

### Language & Communication
- All code comments, documentation, and communication in **Traditional Chinese (繁體中文)**

### Naming & Style
- **Classes**: `PascalCase` (e.g., `AnnotationManager`)
- **Methods/Variables**: `camelCase`
- **CSS filenames**: kebab-case (e.g., `src/styles/view-panel.css`)
- **ES Modules**: All imports use `import { X } from './path.js'`
- Follow existing file indentation and formatting (2 spaces preferred)

### Commit Convention
Extend existing history style:
- `fix(feature): ...` (e.g., `fix(drag): prevent stall on slow devices`)
- `feat(feature): ...` (e.g., `feat(theme): add dark mode`)
- `Docs: ...` (documentation-only)
- `Perf: ...` (performance improvements)

### Code Placement
- **New feature logic**: Extract to manager in `src/modules/` or `src/modules/annotation/`
- **Shared constants**: Add to `src/constants.js`
- **Utilities**: Create reusable modules, don't pile into `src/main.js`
- **Styles**: Create new `.css` in `src/styles/`, import in `src/style.css`
- **No placeholder comments**: Never use `// 其餘不變` — commits must be complete, executable code

### Performance Rules
- **High-frequency events** (scroll, drag, resize): Avoid `getBoundingClientRect()`, repeated `querySelector()`, layout thrashing
- Prefer cached data from manager state (e.g., `ViewerManager` metrics)
- Coordinate/pagination logic: Add boundary protection & clamp operations
- CSS animations preferred; if precision timing needed, use maintainable `requestAnimationFrame`

## Testing & Validation

### E2E Testing
1. Ensure dev server is running: `npm run dev`
2. Run tests: `npm run test:e2e`
3. Tests use Playwright, defined in `tests/automation-check.js`
4. Test PDFs stored locally in `Test_Document/`

### Manual Testing
Refer to `tests/README.md` for comprehensive manual test procedures covering:
- Sidebar & tab switching
- Annotation visibility toggles
- Jump & anchor navigation
- iPad touch gestures & LAN access
- Layer switching & tool persistence

### Platform Targets
- **macOS**: Primary desktop target
- **iPad/iOS**: Full touch support via Capacitor
  - `overscroll-behavior: none` on `body` prevents Safari back/forward swipe conflicts
  - `overscroll-behavior: contain` on `.viewer-container` prevents rubber-band scroll propagation
  - No `touch-action` overrides (breaks annotation handlers)
  - No JS edge-swipe interceptors (interferes with doc-bar buttons)

## Keyboard Shortcuts Reference

| Key | Action |
|---|---|
| Space | Jump forward (next anchor) |
| ← / → | Jump backward / forward |
| Home / End | Jump to head / end |
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
| T | Toggle stamp palette |
| Esc | Close panels, return to View mode |
| Delete / Backspace | Delete focused stamp |

## PWA & Offline

- All assets (including PDF.js workers) cached via Service Worker
- Fully functional offline in concert halls without WiFi
- Registered in `src/main.js` via `registerSW()` from `vite-plugin-pwa`

## Important Files to Review

- **`CLAUDE.md`** — Technical deep-dive on architecture, modules, zoom/pan systems
- **`GEMINI.md`** — High-level product overview and feature reference
- **`AGENTS.md`** — Repository guidelines & conventions (in Traditional Chinese)
- **`PRD.MD`** — Product requirements & feature roadmap
- **`Known_Issue.md`** — Current bugs & planned enhancements
- **`.cursorrules`**, **`.windsurf`** — Additional AI tool configs (if present)

## Workflow

All development follows a three-phase workflow:
1. **Engagement** (`engage`): Planning & analysis phase
2. **Implementation** (`commit`): Create commits after engagement
3. **Deployment** (`deploy`): Build/publish after commits

Major design or architecture changes require:
- Update `PRD.MD` with new requirements
- Update `GEMINI.md` for product overview changes
- Update `implementation_plan.md` if scope changes
- PR should include: summary, impact scope, test steps, UI screenshots/video (if applicable)

## Development Tips

- Start dev server on LAN (`npm run dev -- --host`) for iPad testing during development
- Use browser DevTools console to observe manager logs and state (many managers log activities)
- High-frequency events (scroll, drag, resize) should delegate to managers' cached metrics
- When adding zoom/pan features, always update ruler calculations to keep UI consistent
- Annotation rendering is separate from interaction — coordinate via `AnnotationManager`
- Use `src/db.js` for IndexedDB operations, don't access IndexedDB directly

## Resources

- **Project Root**: `/SheetMusic_Viewer/` (base path on GitHub Pages)
- **Entry**: `src/main.js` imports all managers
- **Tests**: `tests/automation-check.js` (Playwright E2E)
- **Build Output**: `dist/` (production build)
- **Public Assets**: `public/` (PDF.js worker files, static resources)
- **Icons**: `assets/` (UI icons & images)
- **iOS App**: `ios/` + `capacitor.config.json`
