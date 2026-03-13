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
    }

    initLibraryHeader() {
        document.getElementById('btn-library-select')?.addEventListener('click', () => this.toggleSelectionMode());
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
            if (e) e.preventDefault();
            input?.focus();
        };

        wrapper?.addEventListener('click', focusInput);
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
        if (await this.app.showDialog({ title: 'Batch Delete', message: `Delete ${count} scores?`, type: 'confirm', icon: '🗑️' })) {
            for (const fp of this.selectedFingerprints) await this.deleteScore(fp);
            this.toggleSelectionMode(false);
        }
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
            const dateStr = new Date().toISOString().split('T')[0];
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

    async deleteScore(fp) {
        this.registry = this.registry.filter(s => s.fingerprint !== fp);
        await this.helper.saveRegistry(this.registry);
        await db.remove(`score_buf_${fp}`);
        this.render();
    }

    async importScore(file, buffer) {
        const fp = await this.helper.calculateFingerprint(buffer);
        if (this.registry.find(s => s.fingerprint === fp)) return this.app.showMessage('Score already exists', 'info');

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

        this.registry.push(entry);
        await this.helper.saveRegistry(this.registry);
        await db.set(`score_buf_${fp}`, buffer);

        // --- FIXED: Initialize Score Detail without touching active state ---
        if (this.app.scoreDetailManager) {
            this.app.scoreDetailManager.initializeNewScore(fp, entry.title);
        }

        this.render();
        this.app.showMessage(`Imported: ${file.name}`, 'success');
        return entry;
    }

    async loadScore(fp) {
        const score = this.registry.find(s => s.fingerprint === fp);
        if (!score) return;
        this.toggleOverlay(false);

        let buffer = await db.get(`score_buf_${fp}`);

        if (!buffer && score.storageMode === 'cloud') {
            const drive = this.app.driveSyncManager;
            if (!drive?.isEnabled || !drive?.accessToken) {
                this.app.showMessage('此樂譜僅存於雲端，請先連接 Google Drive', 'error');
                this.toggleOverlay(true);
                return;
            }
            try {
                this.app.showMessage('正在從雲端下載樂譜...', 'info');
                buffer = await drive.downloadPDF(fp);
                await db.set(`score_buf_${fp}`, buffer);
                score.storageMode = 'cached';
                await this.helper.saveRegistry(this.registry);
            } catch (err) {
                this.app.showMessage('雲端下載失敗: ' + err.message, 'error');
                this.toggleOverlay(true);
                return;
            }
        }

        if (buffer) {
            score.lastAccessed = Date.now();
            
            // --- ADDED: Auto-generate missing thumbnail ---
            if (!score.thumbnail) {
                console.log('[ScoreManager] Generating missing thumbnail...');
                const thumb = await this.helper.generateThumbnail(buffer.slice(0));
                if (thumb) {
                    score.thumbnail = thumb;
                }
            }

            await this.helper.saveRegistry(this.registry);
            await this.app.loadPDF(new Uint8Array(buffer), score.fileName);
        }
    }

    async setStorageMode(fp, mode) {
        const score = this.registry.find(s => s.fingerprint === fp);
        if (score) {
            score.storageMode = mode;
            await this.helper.saveRegistry(this.registry);
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
        
        if (active) {
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

    toggleSelectionMode(val) {
        this.isSelectionMode = val !== undefined ? val : !this.isSelectionMode;
        
        const btnSelect = document.getElementById('btn-library-select');
        if (btnSelect) {
            btnSelect.textContent = this.isSelectionMode ? 'Done' : 'Edit';
            btnSelect.classList.toggle('btn-primary', this.isSelectionMode);
        }

        if (!this.isSelectionMode) {
            this.selectedFingerprints.clear();
            if (this.batchBar) this.batchBar.classList.add('hidden');
        } else {
            this.updateBatchBar();
        }
        
        this.render();
    }

    updateBatchBar() {
        if (!this.batchBar) return;
        const count = this.selectedFingerprints.size;
        const active = this.isSelectionMode && count > 0;
        this.batchBar.classList.toggle('hidden', !active);
        
        const countEl = this.batchBar.querySelector('.batch-count');
        if (countEl) countEl.textContent = `${count} score${count !== 1 ? 's' : ''} selected`;
    }

    toggleSelectScore(fp) {
        if (this.selectedFingerprints.has(fp)) this.selectedFingerprints.delete(fp);
        else this.selectedFingerprints.add(fp);
        this.updateBatchBar();
        this.render();
    }

    async updateMetadata(fp, meta) {
        const score = this.registry.find(s => s.fingerprint === fp);
        if (score) {
            Object.assign(score, meta);
            await this.helper.saveRegistry(this.registry);
            this.render();
        }
    }
}
