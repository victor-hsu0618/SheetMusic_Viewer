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
        console.log(`[ScoreManager] importScore started for: ${file.name}`);
        const fingerprint = await this.calculateFingerprint(buffer);
        console.log(`[ScoreManager] Fingerprint: ${fingerprint}`);
        const existing = this.registry.find(s => s.fingerprint === fingerprint);

        if (existing) {
            console.log('[ScoreManager] Score already exists in registry, updating timestamp');
            existing.lastAccessed = Date.now();
            await this.saveRegistry();
            return existing;
        }

        try {
            // Generate Thumbnail (passing a slice to avoid detaching the main buffer)
            console.log('[ScoreManager] Generating thumbnail...');
            const thumbnail = await this.generateThumbnail(buffer.slice(0));
            console.log('[ScoreManager] Thumbnail generated');

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
            console.log('[ScoreManager] Registry updated and saved');

            // Save Binary Buffer to IndexedDB
            console.log('[ScoreManager] Saving buffer to IndexedDB...');
            await db.set(`score_buf_${fingerprint}`, buffer);
            console.log('[ScoreManager] Buffer saved');

            this.render();
            return newEntry;
        } catch (err) {
            console.error('[ScoreManager] importScore failed:', err);
            throw err;
        }
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
     * Generate a unique fingerprint for a PDF buffer.
     * Uses Web Crypto API if available, falls back to a simple fast hash for non-secure contexts (iPad/LAN).
     */
    async calculateFingerprint(buffer) {
        if (window.crypto && window.crypto.subtle) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Fallback: Simple fast hash (Murmur-like) for non-HTTPS LAN access (iPad)
        console.warn('[ScoreManager] crypto.subtle unavailable. Using fallback fast-hash.');
        let hash = 0;
        const view = new Uint8Array(buffer);
        for (let i = 0; i < view.length; i++) {
            hash = ((hash << 5) - hash) + view[i];
            hash |= 0; // Convert to 32bit integer
        }
        return 'fallback_' + Math.abs(hash).toString(16) + '_' + view.length;
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
        localStorage.removeItem('scoreflow_recent_solo_scores');
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
                    <button class="btn-delete-score" title="Delete Score" data-fp="${score.fingerprint}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
                <div class="score-info">
                    <div class="flex-row-center flex-space-between w-full">
                        <div class="score-title text-truncate" title="${score.title}">${score.title}</div>
                        <button class="btn-icon-mini btn-score-info" title="Score Details" data-fp="${score.fingerprint}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                        </button>
                    </div>
                    <div class="score-composer">${score.composer}</div>
                </div>
            `;

            // Explicit Actions
            const btnDelete = card.querySelector('.btn-delete-score');
            const btnInfo = card.querySelector('.btn-score-info');
            const thumbArea = card.querySelector('.score-thumb');
            const titleArea = card.querySelector('.score-title');

            if (btnDelete) {
                btnDelete.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteScore(score.fingerprint);
                });
            }

            if (btnInfo) {
                btnInfo.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.app.scoreDetailManager.showPanel(score.fingerprint);
                });
            }

            // Clicking the thumb or title opens the score
            if (thumbArea) {
                thumbArea.addEventListener('click', (e) => {
                    // Only open if we didn't click the delete button inside it
                    if (!e.target.closest('.btn-delete-score')) {
                        this.loadScore(score.fingerprint);
                    }
                });
            }
            if (titleArea) {
                titleArea.addEventListener('click', () => this.loadScore(score.fingerprint));
            }

            this.grid.appendChild(card);
        });
    }

    /**
     * Aggregates all data for a specific score for backup/export.
     */
    async exportScoreData(fingerprint) {
        // 1. Get registry info
        const score = this.registry.find(s => s.fingerprint === fingerprint);

        // 2. Get stamps (annotations)
        let stamps = [];
        try {
            const stored = localStorage.getItem(`scoreflow_stamps_${fingerprint}`);
            if (stored) stamps = JSON.parse(stored);
        } catch (e) { }

        // 3. Get score detail (metadata/media)
        let details = null;
        try {
            const stored = localStorage.getItem(`scoreflow_detail_${fingerprint}`);
            if (stored) details = JSON.parse(stored);
        } catch (e) { }

        // 4. Get bookmarks (if any are stored globally, though currently they are filtered per score in sync)
        // Note: For now we bundle registry, stamps, and details.
        return {
            fingerprint,
            exportedAt: Date.now(),
            app: 'ScoreFlow',
            version: '2.1',
            score: score || { title: 'Unknown' },
            annotations: stamps,
            metadata: details
        };
    }

    triggerDownload(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async deleteScore(fingerprint) {
        const score = this.registry.find(s => s.fingerprint === fingerprint);
        if (!score) return;

        const confirmed = await this.app.showDialog({
            title: 'Delete Score',
            message: `Are you sure you want to delete "${score.title}"? This will also remove its annotations.`,
            type: 'confirm',
            icon: '🗑️'
        });

        if (!confirmed) return;

        // 0. Backup before deletion
        try {
            console.log(`[ScoreManager] Backing up data for ${fingerprint} before deletion...`);
            const backupData = await this.exportScoreData(fingerprint);
            const safeName = (score.title || 'backup').replace(/[^a-z0-9]/gi, '_');
            this.triggerDownload(`ScoreFlow_Backup_${safeName}_${fingerprint.slice(0, 8)}.json`, backupData);
        } catch (err) {
            console.error('[ScoreManager] Backup failed, proceeding anyway:', err);
        }

        // 1. Remove from registry
        this.registry = this.registry.filter(s => s.fingerprint !== fingerprint);
        await this.saveRegistry();

        // 2. Purge Binary Buffer from IndexedDB
        await db.remove(`score_buf_${fingerprint}`);

        // 3. Purge Annotations from localStorage
        localStorage.removeItem(`scoreflow_stamps_${fingerprint}`);

        // 4. If current score, close it
        if (this.app.pdfFingerprint === fingerprint) {
            await this.app.closeFile();
        }

        this.render();
    }

    async loadScore(fingerprint) {
        const score = this.registry.find(s => s.fingerprint === fingerprint);
        if (!score) return;

        this.toggleOverlay(false);

        const buffer = await db.get(`score_buf_${fingerprint}`);
        if (buffer) {
            score.lastAccessed = Date.now();
            await this.saveRegistry();
            this.app.loadPDF(new Uint8Array(buffer), score.fileName);
        } else {
            this.app.showMessage('Score content missing. Please re-import.', 'error');
        }
    }
}
