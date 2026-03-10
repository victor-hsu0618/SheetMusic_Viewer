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

        // Selection Mode
        this.isSelectionMode = false;
        this.selectedFingerprints = new Set();
        this.showHidden = false; // Toggle to view hidden files
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

        this.initLibraryHeader();
        this.initBatchBar();
    }

    initLibraryHeader() {
        const btnSelect = document.getElementById('btn-library-select');
        if (btnSelect) {
            btnSelect.addEventListener('click', () => this.toggleSelectionMode());
        }
    }

    initBatchBar() {
        this.batchBar = document.getElementById('library-batch-bar');
        const btnCancel = document.getElementById('batch-cancel-btn');
        const btnDelete = document.getElementById('batch-delete-btn');
        const btnBackup = document.getElementById('batch-backup-btn');
        const btnHide = document.getElementById('batch-hide-btn');

        if (btnCancel) btnCancel.onclick = () => this.toggleSelectionMode(false);
        if (btnDelete) btnDelete.onclick = () => this.batchDelete();
        if (btnBackup) btnBackup.onclick = () => this.batchBackup();
        if (btnHide) btnHide.onclick = () => this.batchHide();
    }

    toggleSelectionMode(force) {
        this.isSelectionMode = force !== undefined ? force : !this.isSelectionMode;
        if (!this.isSelectionMode) {
            this.selectedFingerprints.clear();
        }

        if (this.overlay) {
            this.overlay.classList.toggle('selection-mode', this.isSelectionMode);
        }

        const btnSelect = document.getElementById('btn-library-select');
        if (btnSelect) {
            btnSelect.textContent = this.isSelectionMode ? 'Done' : 'Select';
            btnSelect.classList.toggle('btn-primary', this.isSelectionMode);
        }

        this.updateBatchBar();
        this.render();
    }

    updateBatchBar() {
        if (!this.batchBar) return;
        const count = this.selectedFingerprints.size;
        const active = this.isSelectionMode && count > 0;

        this.batchBar.classList.toggle('hidden', !active);

        const countDisplay = this.batchBar.querySelector('.batch-count');
        if (countDisplay) {
            countDisplay.textContent = `${count} item${count !== 1 ? 's' : ''} selected`;
        }
    }

    toggleSelectScore(fingerprint) {
        if (this.selectedFingerprints.has(fingerprint)) {
            this.selectedFingerprints.delete(fingerprint);
        } else {
            this.selectedFingerprints.add(fingerprint);
        }
        this.updateBatchBar();
        this.render();
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

        // Sort by last accessed and filter hidden
        let sorted = [...this.registry]
            .filter(s => this.showHidden || !s.hidden)
            .sort((a, b) => b.lastAccessed - a.lastAccessed);

        if (sorted.length === 0 && this.registry.length > 0) {
            this.grid.innerHTML = '<div class="library-empty">No items match current filters.</div>';
            return;
        }

        sorted.forEach(score => {
            const card = document.createElement('div');
            card.className = 'score-card';

            if (this.isSelectionMode) {
                card.classList.add('selectable');
                if (this.selectedFingerprints.has(score.fingerprint)) {
                    card.classList.add('selected');
                }
            }

            card.innerHTML = `
                <div class="score-thumb">
                    ${score.thumbnail ? `<img src="${score.thumbnail}" alt="${score.title}">` : '🎼'}
                </div>
                <div class="score-info">
                    <div class="flex-row-center flex-space-between w-full">
                        <div class="score-title text-truncate" title="${score.title}">${score.title}</div>
                        
                        <!-- Selection Indicator (Album Style) -->
                        <div class="selection-indicator">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>

                        <!-- Cloud Sync Status Icon -->
                        <div class="cloud-sync-status ${score.isSynced ? 'synced' : 'not-synced'}" 
                             title="${score.isSynced ? '已備份至雲端' : '已匯入本地 (尚未同步或雲端無備份)'}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                                ${score.isSynced ? '' : '<line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" stroke-width="1.5" opacity="0.5" />'}
                            </svg>
                        </div>

                        <!-- Info Button (Score Details) -->
                        <button class="btn-icon-mini btn-score-info" title="Score Details" data-fp="${score.fingerprint}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <path d="M9 17V12l4-1v5.5"></path>
                                <circle cx="8" cy="17" r="1.5"></circle>
                                <circle cx="12" cy="16" r="1.5"></circle>
                            </svg>
                        </button>
                    </div>
                    <div class="score-composer">${score.composer}</div>
                </div>
            `;

            // Interaction Logic
            card.onclick = (e) => {
                // Priority 1: Info button
                if (e.target.closest('.btn-score-info')) {
                    e.stopPropagation();
                    this.app.scoreDetailManager.showPanel(score.fingerprint);
                    return;
                }

                // Priority 2: Selection Mode
                if (this.isSelectionMode) {
                    this.toggleSelectScore(score.fingerprint);
                    return;
                }

                // Priority 3: Normal Open
                this.loadScore(score.fingerprint);
            };

            this.grid.appendChild(card);
        });
    }

    /**
     * Batch Actions
     */
    async batchDelete() {
        const count = this.selectedFingerprints.size;
        if (count === 0) return;

        const confirmed = await this.app.showDialog({
            title: 'Batch Delete',
            message: `Are you sure you want to delete ${count} scores? All annotations will be backed up locally before purging.`,
            type: 'confirm',
            icon: '🗑️'
        });

        if (!confirmed) return;

        // Process each selected fingerprint
        for (const fp of this.selectedFingerprints) {
            await this.deleteScore(fp, true); // Pass skipConfirm=true
        }

        this.toggleSelectionMode(false);
    }

    async batchBackup() {
        const count = this.selectedFingerprints.size;
        if (count === 0) return;

        this.app.showMessage(`Backing up ${count} items...`, 'system');

        const totalBackup = {
            exportedAt: Date.now(),
            type: 'batch_backup',
            items: []
        };

        for (const fp of this.selectedFingerprints) {
            const itemData = await this.exportScoreData(fp);
            totalBackup.items.push(itemData);
        }

        this.triggerDownload(`ScoreFlow_Batch_Backup_${Date.now()}.json`, totalBackup);
        this.app.showMessage('Batch backup completed.', 'success');
    }

    async batchHide() {
        const count = this.selectedFingerprints.size;
        if (count === 0) return;

        for (const fp of this.selectedFingerprints) {
            const score = this.registry.find(s => s.fingerprint === fp);
            if (score) score.hidden = true;
        }

        await this.saveRegistry();
        this.toggleSelectionMode(false);
        this.app.showMessage(`${count} scores hidden.`, 'info');
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

    async deleteScore(fingerprint, skipConfirm = false) {
        const score = this.registry.find(s => s.fingerprint === fingerprint);
        if (!score) return;

        if (!skipConfirm) {
            const confirmed = await this.app.showDialog({
                title: 'Delete Score',
                message: `Are you sure you want to delete "${score.title}"? This will also remove its annotations.`,
                type: 'confirm',
                icon: '🗑️'
            });
            if (!confirmed) return;
        }

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
        console.log(`[ScoreManager] Attempting to load score: ${fingerprint.slice(0, 8)}...`);
        const score = this.registry.find(s => s.fingerprint === fingerprint);
        if (!score) {
            console.error('[ScoreManager] Score not found in registry:', fingerprint);
            return;
        }

        this.toggleOverlay(false);

        // 1. Try Primary Buffer (score_buf_FP)
        let buffer = await db.get(`score_buf_${fingerprint}`);

        // 2. Fallback: Check if it's in legacy Recent Store (recent_buf_NAME)
        if (!buffer && score.fileName) {
            console.warn(`[ScoreManager] Primary buffer missing for ${score.fileName}, checking legacy storage...`);
            const legacyBuf = await db.get(`recent_buf_${score.fileName}`);
            if (legacyBuf) {
                console.log(`[ScoreManager] Found legacy buffer for ${score.fileName}, recovering...`);
                // Auto-migrate it back to primary storage for future speed
                await db.set(`score_buf_${fingerprint}`, legacyBuf);
                buffer = legacyBuf;
            }
        }

        if (buffer) {
            console.log(`[ScoreManager] Success: Buffer found (${buffer.byteLength} bytes). Calling app.loadPDF...`);
            score.lastAccessed = Date.now();
            await this.saveRegistry();
            try {
                await this.app.loadPDF(new Uint8Array(buffer), score.fileName);
                console.log('[ScoreManager] loadPDF call initiated.');
            } catch (err) {
                console.error('[ScoreManager] Error during loadPDF:', err);
                this.app.showMessage('Failed to render PDF.', 'error');
            }
        } else {
            console.error(`[ScoreManager] Failed: No binary content found for ${score.fileName}.`);
            this.app.showMessage('樂譜數據缺失，請嘗試重新匯入或從 Google Drive 下載即可恢復。', 'error');
        }
    }

    /**
     * Update sync status for a specific score.
     */
    async updateSyncStatus(fingerprint, isSynced) {
        const score = this.registry.find(s => s.fingerprint === fingerprint);
        if (score && score.isSynced !== isSynced) {
            score.isSynced = isSynced;
            await this.saveRegistry();
            if (this.overlay && this.overlay.classList.contains('active')) {
                this.render();
            }
        }
    }

    /**
     * Update metadata (title/composer) for a specific score in registry.
     */
    async updateMetadata(fingerprint, metadata) {
        const score = this.registry.find(s => s.fingerprint === fingerprint);
        if (score) {
            let changed = false;
            if (metadata.title !== undefined && score.title !== metadata.title) {
                score.title = metadata.title;
                changed = true;
            }
            if (metadata.composer !== undefined && score.composer !== metadata.composer) {
                score.composer = metadata.composer;
                changed = true;
            }

            if (changed) {
                await this.saveRegistry();
                if (this.overlay && this.overlay.classList.contains('active')) {
                    this.render();
                }
            }
        }
    }
}
