import * as db from '../db.js';
import { ScoreRegistryHelper } from './ScoreRegistryHelper.js';
import { ScoreLibraryUIManager } from './ScoreLibraryUIManager.js';

export class ScoreManager {
    constructor(app) {
        this.app = app;
        this.registry = [];
        this.overlay = null;
        this.grid = null;
        this.isLoaded = false;

        this.isSelectionMode = false;
        this.selectedFingerprints = new Set();
        this.searchQuery = '';
        this.sortMode = localStorage.getItem('scoreflow_library_sort') || 'accessed';

        this.helper = new ScoreRegistryHelper(app, this);
        this.ui = new ScoreLibraryUIManager(app, this);
    }

    async init() {
        if (this.isInitialized) return;
        this.isInitialized = true;
        
        const stored = await db.get('score_registry');
        this.registry = stored || [];

        // Backfill storageMode for existing entries
        for (const entry of this.registry) {
            if (!entry.storageMode) {
                const hasLocal = await db.get(`score_buf_${entry.fingerprint}`);
                entry.storageMode = hasLocal ? 'cached' : 'cloud';
            }
        }

        this.overlay = document.getElementById('library-overlay');
        this.grid = document.getElementById('library-grid');
        this.isLoaded = true;

        await this.helper.migrateLegacyData();
        this.helper.migrateFallbackFingerprints();
        this.initLibraryHeader();
        this.initBatchBar();
        this.initSearch();

        // Auto-load last score (or User Guide if library is empty)
        // [REVISION] Centered in main.js to avoid startup race conditions
        // this._autoLoadOnStartup();
    }

    findByFingerprint(fp) {
        return this.registry.find(e => e.fingerprint === fp) || null
    }

    async _autoLoadOnStartup() {
        // Find most recently accessed local score
        const localScores = this.registry
            .filter(s => s.storageMode !== 'cloud')
            .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

        if (localScores.length > 0) {
            await this.loadScore(localScores[0].fingerprint);
            return;
        }

        // No local scores — load bundled User Guide
        await this.loadUserGuide();
    }

    async loadUserGuide() {
        try {
            const base = import.meta.env.BASE_URL || '/';
            const url = `${base}assets/ScoreFlow_UserGuide.pdf`;
            const res = await fetch(url);
            if (!res.ok) return;
            const buf = new Uint8Array(await res.arrayBuffer());
            this.toggleOverlay(false);
            await this.app.loadPDF(buf, 'ScoreFlow User Guide');
        } catch (e) {
            console.warn('[ScoreManager] User Guide not available:', e);
        }
    }

    initLibraryHeader() {
        document.getElementById('btn-library-select')?.addEventListener('click', () => this.toggleSelectionMode());
        document.getElementById('btn-open-user-guide')?.addEventListener('click', () => this.loadUserGuide());
        document.getElementById('btn-full-backup')?.addEventListener('click', () => this.fullBackup());
        document.getElementById('btn-full-restore')?.addEventListener('click', () => this.fullRestore());
        document.getElementById('btn-library-sync-cloud')?.addEventListener('click', () => this.syncWithCloud());
        const sortSelect = document.getElementById('library-sort-select');
        if (sortSelect) {
            sortSelect.value = this.sortMode;
            sortSelect.addEventListener('change', (e) => {
                this.sortMode = e.target.value;
                localStorage.setItem('scoreflow_library_sort', this.sortMode);
                this.render();
            });
        }

        document.querySelectorAll('.library-tabs .segment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                document.querySelectorAll('.library-tabs .segment-btn').forEach(t => t.classList.toggle('active', t === e.target));
                
                const libraryGrid = document.getElementById('library-grid');
                const setlistGrid = document.getElementById('setlist-grid');
                if (libraryGrid) libraryGrid.classList.toggle('hidden', tabId !== 'scores');
                if (setlistGrid) setlistGrid.classList.toggle('hidden', tabId !== 'setlists');
                
                const scoreActions = document.getElementById('score-actions-area');
                const setlistActions = document.getElementById('setlist-actions-area');
                
                // Explicitly set one to show and the other to hide
                if (scoreActions) scoreActions.classList.toggle('hidden', tabId !== 'scores');
                if (setlistActions) setlistActions.classList.toggle('hidden', tabId !== 'setlists');

                if (tabId === 'setlists') this.app.setlistManager?.render();
            });
        });
    }

    initSearch() {
        const input = document.getElementById('library-search-input');
        const clear = document.getElementById('btn-library-search-clear');
        const wrapper = document.getElementById('library-search-wrapper');

        const focusInput = (e) => {
            // Guard: On touch devices, clicking the library button sometimes 
            // causes the opening animation to slide the search box under the finger.
            // We prevent focus unless it's a deliberate click when stable.
            if (e && e.pointerType === 'touch') return; 

            if (e) e.preventDefault();
            input?.focus();
        };

        wrapper?.addEventListener('mousedown', focusInput);

        input?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase().trim();
            clear?.classList.toggle('hidden', this.searchQuery.length === 0);
            this.render();
        });
        clear?.addEventListener('click', () => {
            if (input) { input.value = ''; this.searchQuery = ''; clear.classList.add('hidden'); this.render(); }
        });
    }

    initBatchBar() {
        this.batchBar = document.getElementById('library-batch-bar');
        document.getElementById('batch-cancel-btn')?.addEventListener('click', () => this.toggleSelectionMode(false));
        document.getElementById('batch-delete-btn')?.addEventListener('click', () => this.batchDelete());
        document.getElementById('batch-backup-btn')?.addEventListener('click', () => this.batchBackup());
        document.getElementById('batch-add-setlist-btn')?.addEventListener('click', () => this.handleBatchAddSetlist());
    }

    async batchDelete() {
        const count = this.selectedFingerprints.size;
        if (count === 0) return;

        const sync = this.app.driveSyncManager;
        const isDriveConnected = sync?.isEnabled && sync?.accessToken;
        let deleteFromCloud = false;

        if (isDriveConnected) {
            const actions = [
                { id: 'local', label: 'Delete Locally Only', class: 'btn-outline-sm' },
                { id: 'everywhere', label: 'Delete Everywhere', class: 'btn-outline-danger' },
                { id: 'cancel', label: 'Cancel', class: 'btn-ghost' }
            ];

            const choice = await this.app.showDialog({
                title: 'Batch Delete',
                message: `You are about to delete ${count} score${count !== 1 ? 's' : ''}. How would you like to proceed?`,
                type: 'actions',
                icon: '🗑️',
                actions: actions
            });

            if (!choice || choice === 'cancel') return;
            deleteFromCloud = (choice === 'everywhere');
        } else {
            // Fallback for non-cloud users
            const confirmed = await this.app.showDialog({
                title: 'Batch Delete',
                message: `Delete ${count} score${count !== 1 ? 's' : ''} from this device?`,
                type: 'confirm',
                icon: '🗑️'
            });
            if (!confirmed) return;
        }

        this.app.showMessage(`Deleting ${count} score${count !== 1 ? 's' : ''}...`, 'system');
        
        let activeScoreDeleted = false;
        for (const fp of this.selectedFingerprints) {
            if (fp === this.app.pdfFingerprint) activeScoreDeleted = true;
            await this.deleteScore(fp, deleteFromCloud, true); // skip autoload inside the loop
        }

        if (activeScoreDeleted) {
            console.log('[ScoreManager] Active score was deleted, triggering auto-load of replacement...');
            await this._autoLoadOnStartup();
        }

        this.toggleSelectionMode(false);
        this.app.showMessage('Deletion completed.', 'success');
    }

    async batchBackup() {
        const count = this.selectedFingerprints.size;
        if (count === 0) return;
        
        this.app.showMessage(`Preparing ZIP for ${count} items...`, 'system');

        try {
            // 1. Dynamic Load JSZip if not present
            if (!window.JSZip) {
                console.log('[ScoreManager] Loading JSZip from CDN...');
                await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
                    script.onload = resolve;
                    script.onerror = reject;
                    document.head.appendChild(script);
                });
            }

            const zip = new JSZip();
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
            const rootFolder = zip.folder(`ScoreFlow_Backup_${dateStr}`);

            for (const fp of this.selectedFingerprints) {
                const score = this.registry.find(s => s.fingerprint === fp);
                const title = (score?.title || score?.fileName || fp.slice(0, 8)).replace(/[/\\?%*:|"<>\.]/g, '_');
                const scoreFolder = rootFolder.folder(title);

                // A. PDF Buffer
                const buffer = await this.helper.getScoreBuffer(fp);
                if (buffer) {
                    scoreFolder.file(`${title}.pdf`, buffer);
                }

                // B. Annotation Metadata
                const meta = await this.helper.exportScoreData(fp);
                scoreFolder.file(`${title}_annotations.json`, JSON.stringify(meta, null, 2));
            }

            this.app.showMessage(`Compressing ZIP...`, 'system');
            const blob = await zip.generateAsync({ type: 'blob' });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ScoreFlow_Batch_Backup_${dateStr}.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.app.showMessage('ZIP Export completed.', 'success');
            this.toggleSelectionMode(false);

        } catch (err) {
            console.error('[ScoreManager] ZIP Export failed:', err);
            this.app.showMessage('Export failed: ' + err.message, 'error');
        }
    }

    async fullBackup() {
        this.app.showMessage('Preparing Full System Backup...', 'system');
        try {
            const allKeys = await db.getAllKeys();
            const backupData = {
                type: 'ScoreFlow_FullBackup',
                timestamp: Date.now(),
                version: '3.0',
                storage: {}
            };

            for (const key of allKeys) {
                backupData.storage[key] = await db.get(key);
            }

            // Also include critical localStorage if any 
            backupData.settings = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('scoreflow_')) {
                    backupData.settings[key] = localStorage.getItem(key);
                }
            }

            const blob = new Blob([JSON.stringify(backupData)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const a = document.createElement('a');
            a.href = url;
            a.download = `ScoreFlow_FullBackup_${dateStr}.json`;
            a.click();
            URL.revokeObjectURL(url);
            this.app.showMessage('Full Backup completed.', 'success');
        } catch (err) {
            console.error('[ScoreManager] Full backup failed:', err);
            this.app.showMessage('Backup failed: ' + err.message, 'error');
        }
    }

    async fullRestore() {
        const confirmed = await this.app.showDialog({
            title: '⚠️ FULL SYSTEM RESTORE',
            message: 'This will DELETE ALL current scores and data on this device and replace them with the backup file. This cannot be undone. Proceed?',
            type: 'confirm',
            icon: '⛔'
        });

        if (!confirmed) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                this.app.showMessage('Restoring data... Please wait.', 'system');
                const text = await file.text();
                const data = JSON.parse(text);

                if (data.type !== 'ScoreFlow_FullBackup') {
                    throw new Error('Not a valid ScoreFlow Full Backup file.');
                }

                // Clear current DB
                await db.clear();

                // Restore items
                for (const [key, value] of Object.entries(data.storage || {})) {
                    await db.set(key, value);
                }

                // Restore localStorage settings
                if (data.settings) {
                    for (const [key, value] of Object.entries(data.settings)) {
                        localStorage.setItem(key, value);
                    }
                }

                this.app.showMessage('Restore completed. Reloading...', 'success');
                setTimeout(() => location.reload(), 1500);

            } catch (err) {
                console.error('[ScoreManager] Restore failed:', err);
                this.app.showMessage('Restore failed: ' + err.message, 'error');
            }
        };
        input.click();
    }

    async handleBatchAddSetlist() {
        const count = this.selectedFingerprints.size;
        if (count === 0) return;

        const setlists = this.app.setlistManager?.setlists || [];
        if (setlists.length === 0) return this.app.showMessage('No setlists available.', 'error');

        const actions = setlists.map(list => ({ id: list.id, label: list.title, class: 'btn-outline-sm' }));
        actions.push({ id: 'cancel', label: 'Cancel', class: 'btn-ghost' });

        const setId = await this.app.showDialog({
            title: 'Add to Setlist',
            message: `Add ${count} scores to which Setlist?`,
            type: 'actions',
            icon: '📋',
            actions: actions
        });

        if (setId && setId !== 'cancel') {
            let addedCount = 0;
            for (const fp of this.selectedFingerprints) {
                if (await this.app.setlistManager.addScore(setId, fp)) addedCount++;
            }
            this.app.showMessage(`Added ${addedCount} scores to setlist.`, 'success');
            this.toggleSelectionMode(false);
        }
    }

    async deleteScore(fp, deleteFromCloud = false, skipAutoLoad = false) {
        // 1. Cloud Deletion (if requested and available)
        if (deleteFromCloud) {
            // Google Drive
            if (this.app.driveSyncManager) {
                try {
                    await this.app.driveSyncManager.deleteSyncFiles(fp, true);
                } catch (err) {
                    console.error(`[ScoreManager] Drive deletion failed for ${fp}:`, err);
                }
            }
            
            // Supabase
            if (this.app.supabaseManager) {
                try {
                    await this.app.supabaseManager.deleteScore(fp);
                } catch (err) {
                    console.error(`[ScoreManager] Supabase deletion failed for ${fp}:`, err);
                }
            }
        }

        // 2. Local Deletion
        this.registry = this.registry.filter(s => s.fingerprint !== fp);
        await this.helper.saveRegistry(this.registry);
        await db.remove(`score_buf_${fp}`);
        
        // Also remove metadata and stamps
        await db.remove(`detail_${fp}`);
        await db.remove(`stamps_${fp}`);
        await db.remove(`bookmarks_${fp}`);

        // If we deleted the active score and aren't skipping autoload (e.g. not in a batch), 
        // immediately switch to a different score.
        if (!skipAutoLoad && fp === this.app.pdfFingerprint) {
            console.log('[ScoreManager] Open score deleted individually, switching to next available...');
            await this._autoLoadOnStartup();
        }

        this.render();
    }

    async importScore(file, buffer) {
        if (!buffer || buffer.byteLength === 0) {
            this.app.showMessage('匯入失敗：檔案內容為空 (0 bytes)。', 'error');
            console.error(`[ScoreManager] importScore failed: Buffer is empty for ${file.name}`);
            return;
        }
        this.app.showMessage('正在計算指紋...', 'system')
        const fp = await this.helper.calculateFingerprint(buffer);
        const existingScore = this.registry.find(s => s.fingerprint === fp);
        if (existingScore) {
            const existingBuf = await db.get(`score_buf_${fp}`);
            const isCorrupt = !existingBuf || existingBuf.byteLength === 0;

            if (isCorrupt) {
                console.log(`[ScoreManager] Existing buffer for ${fp} is corrupt/empty. Overwriting with new import.`);
                await db.set(`score_buf_${fp}`, buffer);
                existingScore.storageMode = 'cached';
                await this.helper.saveRegistry(this.registry);
                this.app.showMessage('已修復並更新損毀的樂譜檔案。', 'success');
            } else {
                this.app.showMessage('此樂譜已存在於樂譜庫中，已為您開啟。', 'info');
            }
            this.loadScore(fp);
            return;
        }

        this.app.showMessage('正在生成縮略圖...', 'system')
        const thumbnail = await this.helper.generateThumbnail(buffer.slice(0));
        const entry = {
            fingerprint: fp,
            title: file.name.replace(/\.pdf$/i, ''),
            fileName: file.name,
            composer: 'Unknown',
            thumbnail,
            dateImported: Date.now(),
            lastAccessed: Date.now(),
            tags: [],
            storageMode: 'cached'
        };

        this.app.showMessage('正在儲存...', 'system')
        this.registry.push(entry);
        await this.helper.saveRegistry(this.registry);
        await db.set(`score_buf_${fp}`, buffer);

        // --- FIXED: Initialize Score Detail without touching active state ---
        if (this.app.scoreDetailManager) {
            await this.app.scoreDetailManager.initializeNewScore(fp, entry.title);
        }

        this.render();
        this.app.showMessage(`✓ 已匯入：${file.name.replace(/\.pdf$/i, '')}`, 'success');

        // --- Supabase Sync ---
        if (this.app.supabaseManager) {
            await this.app.supabaseManager.syncScore(fp, entry);
        }

        return entry;
    }

    async loadScore(fp) {
        const score = this.registry.find(s => s.fingerprint === fp);
        if (!score) return;
        this.toggleOverlay(false);

        let buffer = await db.get(`score_buf_${fp}`);

        // If buffer is 0 bytes, treat it as missing so we can try re-downloading
        if (buffer && buffer.byteLength === 0) {
            console.warn(`[ScoreManager] Local buffer for ${fp} is 0 bytes. Treating as missing.`);
            buffer = null;
        }

        if (!buffer) {
            this.app.showMessage('正在從雲端下載檔案...', 'system');
            // Priority 1: Supabase Storage (New Single-Cloud)
            if (this.app.supabaseManager?.user) {
                try {
                    const blob = await this.app.supabaseManager.downloadPDFBuffer(fp);
                    if (blob) {
                        // Compatibility fix: Use FileReader fallback if arrayBuffer() is missing
                        const safeGetBuffer = async (b) => {
                            if (b.arrayBuffer) return await b.arrayBuffer();
                            return new Promise((r, j) => {
                                const fr = new FileReader();
                                fr.onload = () => r(fr.result);
                                fr.onerror = j;
                                fr.readAsArrayBuffer(b);
                            });
                        };
                        buffer = await safeGetBuffer(blob);
                        await db.set(`score_buf_${fp}`, buffer);
                        score.isCloudOnly = false;
                        score.storageMode = 'cached';
                    } else {
                        console.warn(`[ScoreManager] downloadPDFBuffer returned null for ${fp}`);
                    }
                } catch (e) { 
                    console.warn(`[ScoreManager] Supabase download failed for ${fp}:`, e.message || e); 
                    if (e.message?.includes('CORS') || e.message?.includes('Network Error')) {
                        this.app.showMessage('下載失敗：請檢查 Supabase CORS 設定或暫時關閉廣告攔截器。', 'error', 8000);
                    }
                }
            }

            // Priority 2: Google Drive Legacy
            if (!buffer && score.storageMode === 'cloud') {
                const drive = this.app.driveSyncManager;
                if (drive?.isEnabled && drive?.accessToken) {
                    try {
                        this.app.showMessage('正在從 Google Drive 下載...', 'info');
                        buffer = await drive.downloadPDF(fp);
                    } catch (err) { console.error('Drive download failed:', err); }
                }
            }

            if (buffer) {
                await db.set(`score_buf_${fp}`, buffer);
                score.storageMode = 'cached';
                await this.helper.saveRegistry(this.registry);
            } else {
                this.app.showMessage('無法獲取樂譜檔案，請連接網路或 Google Drive', 'error');
                this.toggleOverlay(true);
                return;
            }
        }

        if (buffer && buffer.byteLength > 0) {
            score.lastAccessed = Date.now();
            
            await this.helper.saveRegistry(this.registry);
            await this.app.loadPDF(new Uint8Array(buffer), score.fileName, fp);
        } else {
            this.app.showMessage('樂譜檔案內容為空 (0 bytes)，載入失敗。', 'error');
            console.error(`[ScoreManager] loadScore failed: Buffer is empty for ${fp}`);
            this.toggleOverlay(true);
            return;
        }

            // --- Supabase Sync ---
            if (this.app.supabaseManager) {
                // Sync score metadata (fire-and-forget)
                // Note: pullAnnotations is handled inside ViewerManager after loadPDF completes.
                this.app.supabaseManager.syncScore(fp, score);
            }
    }

    async setStorageMode(fp, mode) {
        const score = this.registry.find(s => s.fingerprint === fp);
        if (score) {
            const oldMode = score.storageMode;
            score.storageMode = mode;

            // Trigger download if switching from cloud to a local mode
            if (oldMode === 'cloud' && (mode === 'pinned' || mode === 'cached')) {
                const buffer = await db.get(`score_buf_${fp}`);
                if (!buffer) {
                    this.app.showMessage('正在下載樂譜檔...', 'system');
                    try {
                        const blob = await this.app.supabaseManager?.downloadPDFBuffer(fp);
                        if (blob) {
                            const safeGetBuffer = async (b) => {
                                if (b.arrayBuffer) return await b.arrayBuffer();
                                return new Promise((r, j) => {
                                    const fr = new FileReader();
                                    fr.onload = () => r(fr.result);
                                    fr.onerror = j;
                                    fr.readAsArrayBuffer(b);
                                });
                            };
                            const buf = await safeGetBuffer(blob);
                            await db.set(`score_buf_${fp}`, buf);
                            score.isCloudOnly = false;
                        }
                    } catch (e) {
                        console.error('[ScoreManager] Storage mode switch download failed:', e.message || e);
                    }
                }
            }

            await this.helper.saveRegistry(this.registry);
            this.render();
        }
    }

    async syncWithCloud() {
        if (!this.app.supabaseManager?.user) {
            this.app.showMessage('請先登入 Supabase 以進行雲端同步', 'warn');
            return;
        }

        const btn = document.getElementById('btn-library-sync-cloud');
        if (btn) btn.classList.add('syncing');

        try {
            this.app.showMessage('正在同步雲端書庫...', 'info');
            
            // 1. Push Phase: Ensure all local scores are known by cloud
            console.log('[ScoreManager] ⬆️ Pushing local registry to cloud...');
            await this.app.supabaseManager.syncScoreRegistry(this.registry);
            
            // 2. Pull Phase: Get new placements from other devices
            console.log('[ScoreManager] ↓ Pulling cloud placeholders...');
            await this.app.supabaseManager.pullScoreRegistry();
            
            this.app.showMessage('書庫同步完成！', 'success');
        } catch (err) {
            console.error('[ScoreManager] Sync with cloud failed:', err);
            this.app.showMessage('同步失敗: ' + err.message, 'error');
        } finally {
            if (btn) btn.classList.remove('syncing');
        }
    }

    async updateSyncStatus(fp, isSynced) {
        const score = this.registry.find(s => s.fingerprint === fp);
        if (score) {
            score.isSynced = isSynced;
            await this.helper.saveRegistry(this.registry);
            this.render();
        }
    }

    toggleOverlay(force) {
        if (!this.overlay) return;
        const active = force !== undefined ? force : !this.overlay.classList.contains('active');
        this.overlay.classList.toggle('active', active);
        this.app.btnLibraryToggle?.classList.toggle('active', active);

        if (active) {
            // Close all other panels first (mutual exclusion)
            this.app.uiManager?.closeAllActivePanels('ScoreManager');
            // Ensure header and toolbar are visible when opening library
            document.querySelector('.library-header')?.classList.remove('hidden-important');
            document.querySelector('.library-toolbar')?.classList.remove('hidden-important');
            this.app.setlistManager?.closeDetailView(); // Close any left-over detail view
            this.render();
        }
    }

    render() { this.ui.render(); }

    async saveRegistry() {
        await this.helper.saveRegistry(this.registry);
    }

    async rebuildLibrary() {
        await this.helper.rebuildLibrary();
    }

    async healLibrary() {
        await this.helper.healLibrary();
    }

    toggleSelectionMode(val) {
        this.isSelectionMode = val !== undefined ? val : !this.isSelectionMode;
        console.log('[ScoreManager] toggleSelectionMode:', this.isSelectionMode);
        
        // Re-query elements to ensure they aren't stale
        const btnSelect = document.getElementById('btn-library-select');
        this.batchBar = document.getElementById('library-batch-bar');
        this.grid = document.getElementById('library-grid');
        
        if (btnSelect) {
            btnSelect.textContent = this.isSelectionMode ? 'Cancel' : 'Edit';
            btnSelect.classList.toggle('btn-primary', this.isSelectionMode);
        }

        if (!this.isSelectionMode) {
            this.selectedFingerprints.clear();
            if (this.batchBar) this.batchBar.classList.add('hidden');
        } else {
            console.log('[ScoreManager] Entering selection mode');
            this.updateBatchBar();
        }
        
        this.render();
    }

    updateBatchBar() {
        const bar = this.batchBar || document.getElementById('library-batch-bar');
        if (!bar) return;
        
        const count = this.selectedFingerprints.size;
        // Make it visible as soon as we enter selection mode for better feedback
        const shouldShow = this.isSelectionMode; 
        bar.classList.toggle('hidden', !shouldShow);
        
        const countEl = bar.querySelector('.batch-count');
        if (countEl) {
            countEl.textContent = count > 0 
                ? `${count} score${count !== 1 ? 's' : ''} selected`
                : 'Select scores to modify';
        }
    }

    toggleSelectScore(fp) {
        if (this.selectedFingerprints.has(fp)) this.selectedFingerprints.delete(fp);
        else this.selectedFingerprints.add(fp);
        console.log('[ScoreManager] Toggled selection for:', fp, 'New set size:', this.selectedFingerprints.size);
        this.updateBatchBar();
        this.render();
    }

    async updateMetadata(fp, meta) {
        const score = this.registry.find(s => s.fingerprint === fp);
        if (score) {
            Object.assign(score, meta);
            score.updatedAt = Date.now();
            await this.helper.saveRegistry(this.registry);
            this.render();

            // Sync update to Detail record and Active UI
            try {
                const detail = await db.get(`detail_${fp}`);
                if (detail) {
                    if (meta.title) detail.name = meta.title;
                    if (meta.composer) detail.composer = meta.composer;
                    await db.set(`detail_${fp}`, detail);
                }

                // If this is the active score, refresh display labels
                if (fp === this.app.pdfFingerprint) {
                    this.app.viewerManager?.updateFloatingTitle();
                    if (this.app.scoreDetailManager?.currentFp === fp) {
                        this.app.scoreDetailManager.render(fp);
                    }
                }
            } catch (e) {
                console.warn('[ScoreManager] Detail update failed during metadata change:', e);
            }
        }
    }
}
