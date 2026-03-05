# GEMINI.md - ScoreFlow v3.0 Context

## Project Overview
**ScoreFlow** is a high-end, professional-grade Progressive Web App (PWA) sheet music viewer designed for musicians and conductors. It prioritizes continuous vertical scrolling, professional layered annotations, and a strategic "Smart Anchor & Jump" system for seamless performance navigation.

- **Primary Technologies:** Vite, Vanilla JavaScript (no framework), PDF.js, IndexedDB (for offline persistence), and CSS Glassmorphism.
- **Architecture:** Centered around a monolithic `ScoreFlow` class in `src/main.js` that orchestrates PDF rendering, annotation logic, and UI state.
- **Key Concepts:**
    - **Score Fingerprinting:** Uses SHA-256 hashes of PDF content to bind annotations to specific score versions.
    - **Smart Anchor Jump:** A visual-baseline-driven jump system allowing musicians to "prepare" the next phrase during rest points.
    - **Continuous Measure Tool:** A specialized tool for rapid, auto-incrementing measure numbering aligned to a vertical ruler.
    - **Layered Annotations:** Independent layers (Performance, Fingering, Bowing, etc.) for granular control over notation visibility.

## Technical Standards & Workflow
- **Development Environment:** 
    - `npm run dev` to start the Vite server.
    - `npm run dev -- --host` for iPad/tablet testing over LAN.
    - Base URL: `/SheetMusic_Viewer/`.
- **Persistence:** 
    - `src/db.js` provides a thin wrapper around IndexedDB.
    - `localStorage` is used for UI preferences (e.g., ruler visibility).
- **Coding Style:**
    - **Vanilla JS:** Avoid introducing heavy frameworks. Use modern ES6+ features.
    - **Monolithic Logic:** `src/main.js` is large (~4.8k lines); when modifying, maintain the internal method organization (init, render, update, handler groups).
    - **Iconography:** UI icons are managed via `public/assets/icons/` and preloaded into an SVG cache in the `ScoreFlow` instance.
- **Testing:**
    - E2E tests are located in `tests/automation-check.js` using Playwright.
    - Manual verification on touch devices (iPad) is critical for UI/UX changes.

## Key Files & Directories
- `src/main.js`: Main application logic and `ScoreFlow` class.
- `index.html`: UI structure, embedded critical CSS, and entry point.
- `src/constants.js`: Toolsets, layer definitions, and default configurations.
- `src/db.js`: IndexedDB abstraction for annotation storage.
- `src/style.css`: Core application styling and theme definitions.
- `public/assets/icons/`: SVG assets for professional music notation stamps.

## Performance & Optimization
- **Offline First:** Service workers (via `vite-plugin-pwa`) cache all assets including PDF.js workers and fonts.
- **Rendering:** Uses HTML5 Canvas for vector-based annotations to ensure high performance during scrolls.
- **Responsive Layout:** Automatically toggles between "Split-View" (sidebar + score) and "Float-View" (overlay sidebar) based on viewport width.

---
*This file is maintained for AI context. Refer to `CLAUDE.md` for specific developer commands and `PRD.MD` for product requirements.*
