# GEMINI.md - ScoreFlow (SheetMusic Viewer)

## Project Overview
ScoreFlow is a professional-grade, high-performance sheet music viewer (PWA) designed for musicians, conductors, and ensembles. It transforms standard PDF reading into a specialized musical workstation featuring multi-interpretation overlays, ensemble collaboration, and advanced performance project management.

### Key Technologies
- **Build System**: [Vite](https://vitejs.dev/)
- **Core Engine**: Vanilla JavaScript (ES6+)
- **PDF Rendering**: [PDF.js](https://mozilla.github.io/pdf.js/) (with local worker for offline reliability)
- **Data Persistence**: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) (via `src/db.js`) & LocalStorage
- **Styling**: Modular CSS (Variables, Glassmorphism)
- **Deployment**: PWA (Service Workers), GitHub Pages

## Architecture & Core Modules
The application follows a modular "Manager" pattern coordinated by a central `ScoreFlow` class in `src/main.js`.

### Core Controller
- **`src/main.js`**: The main entry point that orchestrates all managers and handles global application state.

### Manager Modules (`src/modules/`)
- **`AnnotationManager`**: Centralizes logic for drawing (pens, stamps), coordinate mapping, erasing, and anchor/measure cleanup logic.
- **`ViewerManager`**: Manages PDF.js rendering, zoom, fit-to-screen, and file access (including iOS sync upload fixes).
- **`InputManager`**: Unified event hub for keyboard shortcuts, iPad touch gestures (Swipe Jump), and scroll-linked UI updates.
- **`ToolManager`**: Manages the toolbar state, dynamic toolsets per layer, and last-used tool persistence.
- **`RulerManager`**: Manages the vertical Jump Ruler, next-target calculations, and jump history.
- **`SidebarManager`**: Handles the sidebar UI, tab navigation, and responsive workspace layouts (Split-View/Float-View).
- **`PersistenceManager`**: Abstraction layer for data storage (LocalStorage/IndexedDB) and state caching.
- **`LayerManager`**: Orchestrates professional annotation layers (Performance, Fingering, etc.) and visibility state.
- **`DocBarManager`**: Manages the floating draggable document control bar.
- **`DocActionManager`**: Handles project import/export, system-wide dialogs, and backup operations.
- **`CollaborationManager`**: Manages the multi-interpretation style engine and source data routing.
- **`ProfileManager`**: Manages user identity and profile settings.
- **`ScoreDetailManager`**: Manages score-specific metadata (Composer, Title) linked to PDF fingerprints.

### Supporting Files
- **`index.html`**: Main DOM structure and entry point.
- **`src/constants.js`**: Tool definitions, layer presets, and application constants.
- **`src/db.js`**: Lightweight IndexedDB wrapper for large data storage.
- **`src/styles/`**: Modularized CSS files (animations, components, layout).

## Development Workflows

### Key Commands
```bash
npm run dev          # Start dev server at http://localhost:5173/SheetMusic_Viewer/
npm run dev -- --host  # Dev server with LAN access (for iPad/tablet testing)
npm run build        # Production build to dist/
npm run preview -- --host  # Preview production build with LAN access
npm run test:e2e     # Run Playwright E2E tests
```

### Core Conventions
1. **Per-Score Isolation**: Every PDF is identified by a SHA-256 fingerprint. Annotations are strictly isolated by this ID in IndexedDB.
2. **Continuous Scrolling**: The viewer defaults to vertical continuous scrolling rather than discrete page turns.
3. **Layered Annotation System**: Annotations are grouped into professional layers. Switching layers dynamically updates the available tools.
4. **Smart Jump & Anchors**: The "Smart Jump" system uses manual anchors or dynamic viewport anchors to align the score to a customizable visual baseline.
5. **Offline Reliability**: As a PWA, all assets (including PDF.js workers) are cached via Service Worker to ensure functionality in concert halls without Wi-Fi.
6. **Tool Persistence**: The system remembers the last-used tool in each category for quick switching.

## Documentation Reference
- **`PRD.MD`**: Detailed product requirements and feature roadmap.
- **`CLAUDE.md`**: Technical overview and command reference for AI assistants.
- **`Known_Issue.md`**: Current bug list and planned enhancements.
