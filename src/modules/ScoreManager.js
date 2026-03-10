import * as db from '../db.js';
import * as pdfjsLib from 'pdfjs-dist';

/**
 * ScoreManager handles the Library UI, Registry (Metadata), and PDF Buffer storage.
 * It identifies scores via SHA-256 fingerprints to enable cross-device sync.
 */
export class ScoreManager {
    constructor(app) {
        this.app = app;
        this.registry = [];
        this.overlay = null;
        this.grid = null;
        this.isLoaded = false;
    }

    async init() {
        // 1. Load Registry from IndexedDB
        const storedRegistry = await db.get('score_registry');
        this.registry = storedRegistry || [];

        // 2. Initial render of the library if it exists in DOM
        this.overlay = document.getElementById('library-overlay');
        this.grid = document.getElementById('library-grid');

        this.isLoaded = true;
        console.log(`[ScoreManager] Registry loaded: ${this.registry.length} items.`);

        // 3. Migrate legacy data if needed
        await this.migrateLegacyData();
    }

    /**
     * Import a new PDF into the library.
     */
    async importScore(file, buffer) {
        const fingerprint = await this.calculateFingerprint(buffer);
        const existing = this.registry.find(s => s.fingerprint === fingerprint);

        if (existing) {
            existing.lastAccessed = Date.now();
            await this.saveRegistry();
            return existing;
        }

        // Generate Thumbnail (passing a slice to avoid detaching the main buffer)
        const thumbnail = await this.generateThumbnail(buffer.slice(0));

        const newEntry = {
            fingerprint: fingerprint,
            title: file.name.replace(/\.pdf$/i, ''),
            fileName: file.name,
            composer: 'Unknown',
            thumbnail: thumbnail,
            dateImported: Date.now(),
            lastAccessed: Date.now(),
            tags: []
        };

        this.registry.push(newEntry);
        await this.saveRegistry();

        // Save Binary Buffer to IndexedDB
        await db.set(`score_buf_${fingerprint}`, buffer);

        this.render();
        return newEntry;
    }

    async saveRegistry() {
        await db.set('score_registry', this.registry);
    }

    async generateThumbnail(buffer) {
        try {
            const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/');
            const pdf = await pdfjsLib.getDocument({
                data: buffer,
                cMapUrl: new URL('pdfjs/cmaps/', baseUrl).href,
                cMapPacked: true,
                standardFontDataUrl: new URL('pdfjs/standard_fonts/', baseUrl).href,
                jbig2WasmUrl: new URL('pdfjs/wasm/jbig2.wasm', baseUrl).href,
                wasmUrl: new URL('pdfjs/wasm/', baseUrl).href,
                isEvalSupported: false,
                stopAtErrors: false
            }).promise;
            const page = await pdf.getPage(1);
            const scale = 0.5;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            return canvas.toDataURL('image/webp', 0.7);
        } catch (err) {
            console.error('[ScoreManager] Thumbnail failed:', err);
            return null;
        }
    }

    /**
     * Generate a unique SHA-256 fingerprint for a PDF buffer.
     */
    async calculateFingerprint(buffer) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Migrate from old localStorage based 'recentSoloScores'
     */
    async migrateLegacyData() {
        const legacyList = JSON.parse(localStorage.getItem('scoreflow_recent_solo_scores') || '[]');
        if (legacyList.length === 0) return;

        console.log(`[ScoreManager] Migrating ${legacyList.length} legacy scores...`);

        for (const item of legacyList) {
            const buffer = await db.get(`recent_buf_${item.name}`);
            if (buffer) {
                const fingerprint = await this.calculateFingerprint(buffer);
                if (!this.registry.find(s => s.fingerprint === fingerprint)) {
                    // Pass a slice to importScore since it might detach
                    await this.importScore({ name: item.name }, buffer.slice(0));
                }
            }
        }

        // Clear legacy list once migrated
        // localStorage.removeItem('scoreflow_recent_solo_scores');
    }

    toggleOverlay(force = null) {
        if (!this.overlay) return;
        const active = force !== null ? force : !this.overlay.classList.contains('active');
        this.overlay.classList.toggle('active', active);

        if (active) this.render();
    }

    render() {
        if (!this.grid) return;
        this.grid.innerHTML = '';

        if (this.registry.length === 0) {
            this.grid.innerHTML = '<div class="library-empty">Your library is empty. Import a PDF to begin.</div>';
            return;
        }

        // Sort by last accessed
        const sorted = [...this.registry].sort((a, b) => b.lastAccessed - a.lastAccessed);

        sorted.forEach(score => {
            const card = document.createElement('div');
            card.className = 'score-card';
            card.innerHTML = `
                <div class="score-thumb">
                    ${score.thumbnail ? `<img src="${score.thumbnail}" alt="${score.title}">` : '🎼'}
                </div>
                <div class="score-info">
                    <div class="score-title">${score.title}</div>
                    <div class="score-composer">${score.composer}</div>
                </div>
            `;

            card.onclick = () => this.loadScore(score.fingerprint);
            this.grid.appendChild(card);
        });
    }

    async loadScore(fingerprint) {
        const score = this.registry.find(s => s.fingerprint === fingerprint);
        if (!score) return;

        this.toggleOverlay(false);

        const buffer = await db.get(`score_buf_${fingerprint}`);
        if (buffer) {
            score.lastAccessed = Date.now();
            await this.saveRegistry();
            this.app.loadPdfBuffer(buffer, score.fileName, fingerprint);
        } else {
            this.app.showMessage('Score content missing. Please re-import.', 'error');
        }
    }
}
