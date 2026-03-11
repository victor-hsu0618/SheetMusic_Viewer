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
        this.searchQuery = '';
        this.sortMode = localStorage.getItem('scoreflow_library_sort') || 'accessed';
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

        // Tab Switching Logic
        const tabs = document.querySelectorAll('.library-tabs .segment-btn');
        tabs.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                tabs.forEach(t => t.classList.toggle('active', t === e.target));

                document.getElementById('library-grid').classList.toggle('hidden', tabId !== 'scores');
                document.getElementById('setlist-grid').classList.toggle('hidden', tabId !== 'setlists');

                // Hide search/select in setlist mode for now, or adapt them later
                const searchContainer = document.querySelector('.library-search-container');
                const btnSelect = document.getElementById('btn-library-select');
                if (searchContainer) searchContainer.style.opacity = tabId === 'scores' ? '1' : '0.3';
                if (btnSelect) btnSelect.style.display = tabId === 'scores' ? 'block' : 'none';

                if (tabId === 'setlists' && this.app.setlistManager) {
                    this.app.setlistManager.render();
                }
            });
        });

        this.initSearch();
    }

    initSearch() {
        const searchInput = document.getElementById('library-search-input');
        const searchClear = document.getElementById('btn-library-search-clear');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                if (searchClear) {
                    searchClear.classList.toggle('hidden', this.searchQuery.length === 0);
                }
                this.render();
            });
        }

        if (searchClear) {
            searchClear.addEventListener('click', () => {
                if (searchInput) {
                    searchInput.value = '';
                    this.searchQuery = '';
                    searchClear.classList.add('hidden');
                    this.render();
                }
            });
        }
    }

    initBatchBar() {
        this.batchBar = document.getElementById('library-batch-bar');
        const btnCancel = document.getElementById('batch-cancel-btn');
        const btnDelete = document.getElementById('batch-delete-btn');
        const btnBackup = document.getElementById('batch-backup-btn');
        const btnAddSetlist = document.getElementById('batch-add-setlist-btn');

        if (btnCancel) btnCancel.onclick = () => this.toggleSelectionMode(false);
        if (btnDelete) btnDelete.onclick = () => this.batchDelete();
        if (btnBackup) btnBackup.onclick = () => this.batchBackup();
        if (btnAddSetlist) btnAddSetlist.onclick = () => this.handleBatchAddSetlist();
    }

    async handleBatchAddSetlist() {
        if (this.selectedFingerprints.size === 0) return;

        const setlists = this.app.setlistManager?.setlists || [];
        if (setlists.length === 0) {
            this.app.showMessage('No setlists available. Create one first in the Setlists tab.', 'error');
            return;
        }

        const actions = setlists.map(list => ({
            id: list.id,
            label: list.title,
            class: 'btn-outline-sm'
        }));
        actions.push({ id: 'cancel', label: 'Cancel', class: 'btn-ghost' });

        const setId = await this.app.showDialog({
            title: 'Add to Setlist',
            message: `Add ${this.selectedFingerprints.size} score(s) to which Setlist?`,
            type: 'actions',
            icon: '📋',
            actions: actions
        });

        if (setId && setId !== 'cancel') {
            let addCount = 0;
            for (const fp of this.selectedFingerprints) {
                const added = await this.app.setlistManager.addScore(setId, fp);
                if (added) addCount++;
            }
            this.toggleSelectionMode(false);
            if (addCount > 0) {
                this.app.showMessage(`Added ${addCount} score(s) to Setlist.`, 'success');
            } else {
                this.app.showMessage(`Scores were already in the Setlist.`, 'info');
            }
        }
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
            this.app.showMessage('樂譜已存在於書庫中', 'info');
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

            // Trigger Drive Upload
            if (this.app.driveSyncManager && this.app.driveSyncManager.isEnabled) {
                // Don't await upload to keep UI responsive
                this.app.driveSyncManager.uploadPDF(fingerprint, buffer.slice(0), file.name).catch(e => {
                    console.error('[ScoreManager] Background upload failed:', e);
                    this.app.showMessage('雲端備份失敗，但本地匯入已完成', 'system');
                });
            }

            this.app.showMessage(`樂譜匯入成功: ${file.name}`, 'success');
            this.render();
            return newEntry;
        } catch (err) {
            console.error('[ScoreManager] importScore failed:', err);
            this.app.showMessage(`匯入失敗: ${err.message}`, 'error');
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
        // Ensure we are hashing the actual bytes, not a potentially larger shared buffer
        const bytes = (buffer instanceof ArrayBuffer) ? new Uint8Array(buffer) : buffer
        const bufferToHash = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

        if (window.crypto && window.crypto.subtle) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', bufferToHash);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }

        // Fallback: Simple fast hash (Murmur-like) for non-HTTPS LAN access (iPad)
        console.warn('[ScoreManager] crypto.subtle unavailable. Using fallback fast-hash.');
        let hash = 5381
        for (let i = 0; i < bytes.length; i += 64) {
            hash = ((hash << 5) + hash) ^ bytes[i]
            hash = hash >>> 0 // keep as unsigned 32-bit
        }
        return 'fallback_' + hash.toString(16) + '_' + bytes.length;
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

        // Sort by last accessed and filter by search
        let sorted = [...this.registry]
            .filter(s => {
                // Search filter
                if (this.searchQuery) {
                    const titleMatch = (s.title || '').toLowerCase().includes(this.searchQuery);
                    const composerMatch = (s.composer || '').toLowerCase().includes(this.searchQuery);
                    const fileMatch = (s.fileName || '').toLowerCase().includes(this.searchQuery);
                    return titleMatch || composerMatch || fileMatch;
                }
                return true;
            })
            .sort((a, b) => {
                if (this.sortMode === 'title') {
                    return (a.title || '').localeCompare(b.title || '');
                } else if (this.sortMode === 'composer') {
                    return (a.composer || '').localeCompare(b.composer || '');
                }
                // Default: lastAccessed (descending)
                const lastA = a.lastAccessed || 0;
                const lastB = b.lastAccessed || 0;
                return lastB - lastA;
            });

        if (sorted.length === 0 && this.registry.length > 0) {
            this.grid.innerHTML = '<div class="library-empty">No items match current filters.</div>';
            return;
        }

        sorted.forEach((score, index) => {
            const card = document.createElement('div');
            card.className = 'score-card';

            if (this.isSelectionMode) {
                card.classList.add('selectable');
                if (this.selectedFingerprints.has(score.fingerprint)) {
                    card.classList.add('selected');
                }
            }

            // Determine the display title (Fallback to fileName if title is empty or 'Unknown')
            let displayTitle = score.title;
            if (!displayTitle || displayTitle.trim() === '' || displayTitle === 'Unknown') {
                displayTitle = score.fileName || '未命名樂譜';
            }
            // Remove .pdf extension for cleaner display if it's a fallback filename
            if (displayTitle.toLowerCase().endsWith('.pdf')) {
                displayTitle = displayTitle.slice(0, -4);
            }

            const thumbContent = score.isCloudOnly ?
                '<div class="cloud-placeholder" style="font-size: 1.5rem;">☁️</div>' :
                (score.thumbnail ? `<img src="${score.thumbnail}" alt="${score.title}">` : '🎼');

            // Cloud Sync Status Logic:
            const isBroken = score.isCloudOnly && !score.isPdfAvailable;
            const isFullySynced = score.isSynced && score.isPdfAvailable;

            card.innerHTML = `
                <!-- Numerical Index (#1, #2...) -->
                <div class="score-index-badge">#${index + 1}</div>

                <!-- Selection Indicator (Album Style) -->
                <div class="selection-indicator">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>

                <div class="score-thumb">
                    ${thumbContent}
                </div>

                <div class="score-info">
                    <div class="score-meta-row" title="${displayTitle} · ${score.composer || 'Unknown'}">
                        <span class="score-title">${displayTitle}</span>
                        <span class="score-meta-separator">·</span>
                        <span class="score-composer">${score.composer || 'Unknown Composer'}</span>
                    </div>
                </div>

                <div class="cloud-sync-status ${isBroken ? 'broken' : (isFullySynced ? 'synced' : 'not-synced')}" 
                        title="${score.isSynced ? (score.isPdfAvailable ? '已同步並已下載至本地' : '同步異常：雲端找不到 PDF 檔案') : '已匯入本地 (尚未同步)'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${isBroken ?
                    '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>' :
                    `<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                             ${isFullySynced ? '<polyline points="10 13 12 15 16 11" stroke-width="2.5" />' : ''}`
                }
                    </svg>
                </div>

                <button class="btn-icon-mini btn-score-info score-info-btn" title="Score Details" data-fp="${score.fingerprint}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <path d="M9 17V12l4-1v5.5"></path>
                        <circle cx="8" cy="17" r="1.5"></circle>
                        <circle cx="12" cy="16" r="1.5"></circle>
                    </svg>
                </button>
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

        let removeFromCloud = false;

        if (!skipConfirm) {
            // Check if it's a cloud-related item
            const isSynced = score.isSynced || score.isCloudOnly;
            const isBroken = score.isCloudOnly && !score.isPdfAvailable;

            const actions = [
                { id: 'local', label: '僅刪除本地', class: 'btn-outline' },
                { id: 'all', label: '本地與雲端一併刪除', class: 'btn-primary text-danger' },
                { id: 'cancel', label: '取消', class: 'btn-ghost' }
            ];

            // If it's a broken sync item, emphasize clearing cloud record
            const message = isBroken ?
                `此樂譜為「Broken Sync」狀態 (雲端遺失檔案)。\n您要僅從本地列表移除，還是同時清除雲端索引記錄？` :
                `確定要刪除 "${score.title}" 嗎？\n(本地數據將在刪除前匯出備份)`;

            const result = isSynced ? await this.app.showDialog({
                title: '刪除樂譜',
                message: message,
                type: 'actions',
                icon: '🗑️',
                actions: actions
            }) : await this.app.showDialog({
                title: '刪除樂譜',
                message: `確定要刪除 "${score.title}" 嗎？`,
                type: 'confirm',
                icon: '🗑️'
            });

            if (result === 'cancel' || result === false) return;
            if (result === 'all') removeFromCloud = true;
        }

        // 0. Backup before deletion (Only if local buffer exists)
        try {
            const buffer = await db.get(`score_buf_${fingerprint}`);
            if (buffer) {
                console.log(`[ScoreManager] Backing up data for ${fingerprint} before deletion...`);
                const backupData = await this.exportScoreData(fingerprint);
                const safeName = (score.title || 'backup').replace(/[^a-z0-9]/gi, '_');
                this.triggerDownload(`ScoreFlow_Backup_${safeName}_${fingerprint.slice(0, 8)}.json`, backupData);
            }
        } catch (err) {
            console.error('[ScoreManager] Backup failed, proceeding anyway:', err);
        }

        // 1. Cloud Cleanup
        // NEW: If it's a synced or cloud-only score, ALWAYS remove from manifest 
        // even if we only do "local" deletion. This prevents the "deletion loop" where 
        // refresh re-imports it as a cloud placeholder.
        const isSynced = score.isSynced || score.isCloudOnly;
        if (isSynced && this.app.driveSyncManager) {
            console.log(`[ScoreManager] Unlinking ${fingerprint} from cloud manifest.`);
            await this.app.driveSyncManager.deleteManifestEntry(fingerprint);

            // ONLY delete raw files from Drive if "removeFromCloud" was explicitly chosen
            if (removeFromCloud) {
                console.log(`[ScoreManager] Deleting cloud files for ${fingerprint}...`);
                // AWAIT deletion to ensure sync state is finalized before UI update
                await this.app.driveSyncManager.deleteSyncFiles(fingerprint);
            }
        }

        // 2. Mark as Deleted in all Setlists (Ghost Record)
        if (this.app.setlistManager) {
            const score = this.registry.find(s => s.fingerprint === fingerprint);
            if (score) await this.app.setlistManager.markScoreAsDeletedAll(fingerprint, score.title);
        }

        // 3. Remove from registry
        this.registry = this.registry.filter(s => s.fingerprint !== fingerprint);
        await this.saveRegistry();

        // 4. Purge Binary Buffer from IndexedDB
        await db.remove(`score_buf_${fingerprint}`);

        // 4. Purge Annotations from localStorage
        localStorage.removeItem(`scoreflow_stamps_${fingerprint}`);

        // 5. If current score, close it
        if (this.app.pdfFingerprint === fingerprint) {
            await this.app.closeFile();
            // After closing the file, ensure we stay in the library overlay 
            // instead of jumping to the welcome screen.
            this.toggleOverlay(true);
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

        if (score.isCloudOnly) {
            if (score.isPdfAvailable === false) {
                this.app.showMessage('下載失敗：雲端找不到此樂譜的實體 PDF 檔案 (Broken Sync)', 'error');
                return;
            }
            this.app.showMessage('正在從雲端下載樂譜 PDF...', 'system');
            try {
                if (this.app.driveSyncManager) {
                    const downloadBuffer = await this.app.driveSyncManager.downloadPDF(fingerprint);

                    // Save to local DB
                    await db.set(`score_buf_${fingerprint}`, downloadBuffer);

                    // Generate Thumbnail
                    const thumbnail = await this.generateThumbnail(downloadBuffer.slice(0));

                    score.isCloudOnly = false;
                    score.thumbnail = thumbnail;
                    if (!score.fileName) score.fileName = score.title + '.pdf';

                    // Fix placeholder title if needed
                    if (score.title && score.title.includes('雲端備份')) {
                        score.title = score.fileName.replace(/\.pdf$/i, '');
                    }

                    score.lastAccessed = Date.now();

                    await this.saveRegistry();
                    this.render();
                    this.app.showMessage('樂譜下載完成', 'success');
                } else {
                    throw new Error('Sync Manager 不可用');
                }
            } catch (err) {
                this.app.showMessage(`下載失敗: ${err.message}`, 'error');
                return;
            }
        }

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
                let msg = err.message || err.toString();
                if (msg.includes('InvalidPDFException')) {
                    this.app.showMessage('樂譜檔案格式損毀或無效 (Invalid PDF)', 'error');
                } else {
                    this.app.showMessage('Failed to render PDF.', 'error');
                }
            }
        } else {
            // Local buffer is missing. Try to auto-recover from Drive if synced.
            const manifest = this.app.driveSyncManager?.manifest;
            const cloudEntry = manifest?.[fingerprint];
            const hasPdfOnCloud = cloudEntry?.pdfId;

            if (hasPdfOnCloud && this.app.driveSyncManager?.accessToken) {
                console.log(`[ScoreManager] Local buffer missing for ${score.fileName}. Auto-recovering from Drive...`);
                this.app.showMessage('本地數據遺失，正在從雲端自動恢復...', 'system');
                try {
                    const downloadBuffer = await this.app.driveSyncManager.downloadPDF(fingerprint);
                    await db.set(`score_buf_${fingerprint}`, downloadBuffer);
                    const thumbnail = await this.generateThumbnail(downloadBuffer.slice(0));
                    score.isCloudOnly = false;
                    score.thumbnail = thumbnail;
                    score.isPdfAvailable = true;
                    if (!score.fileName) score.fileName = score.title + '.pdf';

                    // Fix placeholder title if needed
                    if (score.title && score.title.includes('雲端備份')) {
                        score.title = score.fileName.replace(/\.pdf$/i, '');
                    }

                    score.lastAccessed = Date.now();
                    await this.saveRegistry();
                    this.render();
                    this.app.showMessage('已從雲端恢復，正在開啟...', 'success');
                    await this.app.loadPDF(new Uint8Array(downloadBuffer), score.fileName);
                } catch (err) {
                    console.error('[ScoreManager] Auto-recovery failed:', err);
                    this.app.showMessage(`雲端恢復失敗: ${err.message}`, 'error');
                }
            } else {
                console.error(`[ScoreManager] Failed: No binary content found for ${score.fileName}.`);
                this.app.showMessage('樂譜數據缺失，請重新匯入或確認 Google Drive 已連線後重試。', 'error');
            }
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

        const sortSelect = document.getElementById('library-sort-select');
        if (sortSelect) {
            sortSelect.value = this.sortMode;
            sortSelect.addEventListener('change', (e) => {
                this.sortMode = e.target.value;
                localStorage.setItem('scoreflow_library_sort', this.sortMode);
                this.render();
            });
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
                score.isSynced = false; // Important: Metadata change means it needs a sync
                await this.saveRegistry();
                if (this.overlay && this.overlay.classList.contains('active')) {
                    this.render();
                }

                // Also notify SetlistManager to refresh if it exists
                if (this.app.setlistManager) {
                    this.app.setlistManager.render();
                    if (this.app.setlistManager.renderDetailList) {
                        this.app.setlistManager.renderDetailList();
                    }
                }

                return true;
            }
        }
        return false;
    }
}
