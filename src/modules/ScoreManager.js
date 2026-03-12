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
                document.getElementById('library-grid').classList.toggle('hidden', tabId !== 'scores');
                document.getElementById('setlist-grid').classList.toggle('hidden', tabId !== 'setlists');
                
                const scoreActions = document.getElementById('score-actions-area');
                const setlistActions = document.getElementById('setlist-actions-area');
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
            tags: []
        };

        this.registry.push(entry);
        await this.helper.saveRegistry(this.registry);
        await db.set(`score_buf_${fp}`, buffer);
        this.render();
        this.app.showMessage(`Imported: ${file.name}`, 'success');
        return entry;
    }

    async loadScore(fp) {
        const score = this.registry.find(s => s.fingerprint === fp);
        if (!score) return;
        this.toggleOverlay(false);
        const buffer = await db.get(`score_buf_${fp}`);
        if (buffer) {
            score.lastAccessed = Date.now();
            await this.helper.saveRegistry(this.registry);
            await this.app.loadPDF(new Uint8Array(buffer), score.fileName);
        }
    }

    toggleOverlay(force) {
        if (!this.overlay) return;
        const active = force !== undefined ? force : !this.overlay.classList.contains('active');
        this.overlay.classList.toggle('active', active);
        if (active) this.render();
    }

    render() { this.ui.render(); }

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
