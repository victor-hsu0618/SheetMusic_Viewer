import * as db from '../db.js'
import { ScoreDetailUIManager } from './ScoreDetailUIManager.js'

export class ScoreDetailManager {
    constructor(app) {
        this.app = app
        this.ui = new ScoreDetailUIManager(app, this)
        this.currentInfo = {
            name: '',
            composer: '',
            lastEdit: null,
            lastAuthor: null,
            mediaList: [], 
            activeMediaId: null,
            stampScale: 1.0,
            lastScrollTop: 0
        }
        this.isLoading = false
        this.currentFp = null
    }

    init() {
        this.ui.init()
    }

    // Delegation wrappers for UI elements used by logic
    get scoreNameInput() { return this.ui.scoreNameInput }
    get scoreComposerInput() { return this.ui.scoreComposerInput }
    get btnSave() { return this.ui.btnSave }

    toggle(force) {
        if (!this.ui.panel) return
        const active = force !== null ? force : !this.ui.panel.classList.contains('active')
        
        if (active) {
            this.app.uiManager.closeAllActivePanels('ScoreDetailManager')
        }

        this.ui.panel.classList.toggle('active', active)
        
        // Sync button visual state
        if (this.app.btnScoreDetailToggle) {
            this.app.btnScoreDetailToggle.classList.toggle('active', active)
        }

        if (active) {
            document.querySelectorAll('.jump-sub-panel').forEach(p => p.style.zIndex = '11500')
            this.ui.panel.style.zIndex = '11501'
            this.refreshStats()
        }
    }

    async showPanel(fingerprint) {
        const targetFp = fingerprint || this.app.pdfFingerprint
        if (!targetFp) return

        // If clicking same button and panel is open, toggle it off
        if (!fingerprint && this.ui.panel?.classList.contains('active')) {
            this.toggle(false)
            return
        }

        await this.load(targetFp)
        this.toggle(true)
    }

    async load(fingerprint) {
        if (!fingerprint) return;
        this.isLoading = true;
        this.currentFp = fingerprint;
        
        console.log(`[ScoreDetailManager] load(${fingerprint.slice(0, 8)}) - Current Global FP: ${this.app.pdfFingerprint?.slice(0, 8)}`);

        // 1. Fetch data into temporary object to avoid partial UI state
        const info = await db.get(`detail_${fingerprint}`);
        const regScore = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);

        let newInfo = {
            name: '',
            composer: 'Unknown',
            lastEdit: 0,
            lastAuthor: null,
            mediaList: [],
            activeMediaId: null,
            stampScale: 1.0,
            lastScrollTop: 0
        };

        if (info) {
            newInfo = {
                ...newInfo,
                ...info,
                name: info.name || regScore?.title || '',
                composer: info.composer || regScore?.composer || '',
                nameEditedAt: info.nameEditedAt || info.lastEdit || 0,
                composerEditedAt: info.composerEditedAt || info.lastEdit || 0
            };
            
            if (regScore && info.name && info.name !== regScore.title) {
                console.log(`[ScoreDetailManager] Healing registry title for ${fingerprint.slice(0,8)}: "${regScore.title}" -> "${info.name}"`);
                this.app.scoreManager.updateMetadata(fingerprint, { title: info.name });
            }
        } else {
            let fallbackName = regScore?.title || (this.app.pdfFingerprint === fingerprint ? this.app.activeScoreName?.replace(/\.pdf$/i, '') : "") || "Untitled";
            newInfo.name = fallbackName;
            newInfo.composer = regScore?.composer || 'Unknown';
        }

        // 2. Final check: if fingerprint changed while we were awaiting DB, abort this load
        if (this.currentFp !== fingerprint) {
            console.warn(`[ScoreDetailManager] Abandoning load for ${fingerprint.slice(0, 8)} (Current is ${this.currentFp?.slice(0, 8)})`);
            return;
        }

        this.currentInfo = newInfo;
        this.render(fingerprint);
        this.isLoading = false;

        if (this.currentInfo.activeMediaId) {
            const activeMedia = this.currentInfo.mediaList.find(m => m.id === this.currentInfo.activeMediaId);
            if (activeMedia) this.app.playbackManager?.loadMedia(activeMedia);
        }
    }

    async save(fingerprint) {
        if (!fingerprint) return
        if (fingerprint !== this.currentFp) {
            console.warn(`[ScoreDetailManager] Blocked stale save for ${fingerprint.slice(0, 8)}. Current FP: ${this.currentFp?.slice(0, 8)}`);
            return;
        }
        const saveData = { ...this.currentInfo }
        saveData.mediaList = saveData.mediaList.map(m => m.type === 'local' ? { ...m, source: null } : m)
        await db.set(`detail_${fingerprint}`, saveData)
    }

    /**
     * Initializes a new score detail record in storage without touching the current active state.
     * Essential for background imports to prevent UI/Sync cross-contamination.
     */
    async initializeNewScore(fingerprint, name) {
        if (!fingerprint) return;
        const info = {
            name: name || 'Untitled',
            composer: 'Unknown',
            lastEdit: Date.now(),
            lastAuthor: this.app.profileManager?.data?.userName || 'Guest',
            mediaList: [],
            activeMediaId: null,
            stampScale: 1.0,
            lastScrollTop: 0
        };
        await db.set(`detail_${fingerprint}`, info)
        console.log(`[ScoreDetailManager] Initialized new record for: ${name} (${fingerprint.slice(0,8)})`);
    }

    /**
     * Safely retrieves metadata for a specific fingerprint from localStorage or Registry.
     * Prevents stale data contamination during background sync.
     */
    async getMetadata(fingerprint) {
        if (!fingerprint) return null;

        // If it's the currently loaded score, return in-memory currentInfo
        if (fingerprint === this.currentFp) return this.currentInfo;

        const regScore = this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint);
        try {
            const info = await db.get(`detail_${fingerprint}`);
            if (info) {
                return {
                    name: info.name || regScore?.title || '',
                    composer: info.composer || regScore?.composer || 'Unknown',
                    nameEditedAt: info.nameEditedAt || info.lastEdit || 0,
                    composerEditedAt: info.composerEditedAt || info.lastEdit || 0,
                    lastEdit: info.lastEdit || 0,
                    lastAuthor: info.lastAuthor || null,
                    mediaList: info.mediaList || [],
                    activeMediaId: info.activeMediaId || null,
                    stampScale: info.stampScale || 1.0,
                    lastScrollTop: info.lastScrollTop || 0
                };
            }
        } catch (err) {
            console.error('[ScoreDetailManager] getMetadata failed:', err);
        }

        // Fallback to Registry info if no detail record exists
        if (regScore) {
            return {
                name: regScore.title,
                composer: regScore.composer || 'Unknown',
                lastEdit: 0, lastAuthor: null,
                mediaList: [], activeMediaId: null,
                stampScale: 1.0, lastScrollTop: 0
            };
        }

        return null;
    }

    render(fingerprint) {
        this.ui.render(fingerprint, this.currentInfo)
    }

    refreshStats() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint
        if (fingerprint) this.ui.refreshStats(fingerprint, this.currentInfo)
    }

    async onModification() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint
        if (!fingerprint) return

        this.currentInfo.lastEdit = Date.now()
        this.currentInfo.lastAuthor = this.app.profileManager?.data?.userName || 'Guest'
        await this.save(fingerprint)

        if (this.app.scoreManager) {
            this.app.scoreManager.updateSyncStatus(fingerprint, false)
            if (this.currentInfo.name) {
                this.app.scoreManager.updateMetadata(fingerprint, {
                    title: this.currentInfo.name,
                    composer: this.currentInfo.composer || 'Unknown'
                })
            }
        }

        if (this.app.onAnnotationChanged) this.app.onAnnotationChanged()
        if (this.app.viewerManager?.updateFloatingTitle) this.app.viewerManager.updateFloatingTitle()
        this.refreshStats()
    }

    handleInputChange() {
        if (this.isLoading) return
        const isChanged = this.scoreNameInput.value.trim() !== this.currentInfo.name || 
                        this.scoreComposerInput.value.trim() !== this.currentInfo.composer
        this.btnSave?.classList.toggle('btn-primary-highlight', isChanged)
    }

    async handleSave() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint
        if (!fingerprint || this.isLoading) return

        const prevName = this.currentInfo.name;
        const prevComposer = this.currentInfo.composer;
        this.currentInfo.name = (this.scoreNameInput.value || '').trim()
        this.currentInfo.composer = (this.scoreComposerInput.value || '').trim()

        const nameChanged = this.currentInfo.name !== prevName;
        const composerChanged = this.currentInfo.composer !== prevComposer;
        const now = Date.now();
        if (nameChanged) {
            this.currentInfo.nameEditedAt = now;
            console.log(`[ScoreDetail] Title changed: "${prevName}" → "${this.currentInfo.name}"`);
        }
        if (composerChanged) {
            this.currentInfo.composerEditedAt = now;
            console.log(`[ScoreDetail] Composer changed: "${prevComposer}" → "${this.currentInfo.composer}"`);
        }

        this.onModification()

        if (this.app.scoreManager) {
            await this.app.scoreManager.updateMetadata(fingerprint, {
                title: this.currentInfo.name,
                composer: this.currentInfo.composer
            })
        }

        this.btnSave?.classList.remove('btn-primary-highlight')
        this.app.showMessage('Score info saved.', 'success')
    }

    async handleAutoSave() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint
        if (!fingerprint || this.isLoading) return

        // Safety Check: Ensure the UI we are reading belongs to the fingerprint we think we are saving.
        // If the panel fingerprint display doesn't match currentFp, we are in a transition state.
        const displayedFingerprint = this.ui.scoreFingerprintDisplay?.title;
        if (displayedFingerprint && displayedFingerprint !== fingerprint) {
            console.warn('[ScoreDetail] Auto-save blocked: UI fingerprint mismatch (Transitioning?)');
            return;
        }

        const newName = (this.scoreNameInput.value || '').trim()
        const newComposer = (this.scoreComposerInput.value || '').trim()
        if (newName === this.currentInfo.name && newComposer === this.currentInfo.composer) return

        const now = Date.now();
        if (newName !== this.currentInfo.name) {
            this.currentInfo.nameEditedAt = now;
        }
        if (newComposer !== this.currentInfo.composer) this.currentInfo.composerEditedAt = now;
        this.currentInfo.name = newName
        this.currentInfo.composer = newComposer
        this.onModification()
    }

    handleAddYoutube() {
        const url = this.ui.mediaUrlInput.value.trim()
        if (!url) return
        const mediaObj = {
            id: 'media-' + Date.now(),
            label: this.ui.mediaLabelInput.value.trim() || 'YouTube Video',
            type: 'youtube',
            source: url
        }
        this.currentInfo.mediaList.push(mediaObj)
        if (!this.currentInfo.activeMediaId) this.currentInfo.activeMediaId = mediaObj.id
        this.ui.mediaUrlInput.value = ''
        this.ui.mediaLabelInput.value = ''
        this.onModification()
        this.render(this.currentFp || this.app.pdfFingerprint)
    }

    handleLocalFile(e) {
        const file = e.target.files[0]
        if (!file) return
        const mediaObj = {
            id: 'media-' + Date.now(),
            label: this.ui.mediaLabelInput.value.trim() || file.name,
            type: 'local',
            source: file
        }
        this.currentInfo.mediaList.push(mediaObj)
        if (!this.currentInfo.activeMediaId) this.currentInfo.activeMediaId = mediaObj.id
        this.onModification()
        this.render(this.currentFp || this.app.pdfFingerprint)
    }

    selectMedia(id) {
        this.currentInfo.activeMediaId = id
        this.save(this.currentFp || this.app.pdfFingerprint)
        this.render(this.currentFp || this.app.pdfFingerprint)
        const media = this.currentInfo.mediaList.find(m => m.id === id)
        if (media) this.app.playbackManager?.loadMedia(media)
    }

    deleteMedia(id) {
        this.currentInfo.mediaList = this.currentInfo.mediaList.filter(m => m.id !== id)
        if (this.currentInfo.activeMediaId === id) {
            this.currentInfo.activeMediaId = this.currentInfo.mediaList[0]?.id || null
        }
        this.onModification()
        this.render(this.currentFp || this.app.pdfFingerprint)
    }

    async handleResetAll() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint
        if (!fingerprint) return

        const confirmed = await this.app.showDialog({
            title: 'Reset Score Meta Data?',
            message: `This will PERMANENTLY delete all markings, bookmarks, and cloud data for "${this.currentInfo.name || 'this score'}".`,
            type: 'confirm',
            icon: '⚠️'
        })
        if (!confirmed) return

        this.app.showMessage('Resetting score data...', 'system')
        if (this.app.pdfFingerprint === fingerprint) {
            this.app.stamps = []
            this.app.annotationManager.redrawAllAnnotationLayers()
        }
        db.remove(`stamps_${fingerprint}`)
        if (this.app.jumpManager) {
            this.app.jumpManager.bookmarks = []
            this.app.jumpManager.renderBookmarks()
            await db.remove(`bookmarks_${fingerprint}`)
        }

        const regScore = this.app.scoreManager?.registry.find(s => s.fingerprint === fingerprint)
        this.currentInfo = {
            name: regScore?.fileName?.replace(/\.pdf$/i, '') || 'Untitled',
            composer: 'Unknown',
            lastEdit: Date.now(),
            lastAuthor: this.app.profileManager?.data?.userName || 'Guest',
            mediaList: [],
            activeMediaId: null,
            stampScale: 1.0,
            lastScrollTop: 0
        }
        this.save(fingerprint)
        if (this.app.scoreManager) {
            await this.app.scoreManager.updateMetadata(fingerprint, { title: this.currentInfo.name, composer: 'Unknown' })
        }
        this.render(fingerprint)
        this.refreshStats()
        this.app.showMessage('Score reset successfully.', 'success')
    }

    async handleAddSetlist() {
        const fp = this.currentFp || this.app.pdfFingerprint
        if (!fp) return
        const setlists = this.app.setlistManager?.setlists || []
        if (setlists.length === 0) return this.app.showMessage('No setlists available.', 'error')

        const actions = setlists.map(list => ({ id: list.id, label: list.title, class: 'btn-outline-sm' }))
        actions.push({ id: 'cancel', label: 'Cancel', class: 'btn-ghost' })

        const setId = await this.app.showDialog({
            title: 'Add to Setlist',
            message: 'Select a Setlist:',
            type: 'actions',
            actions: actions
        })

        if (setId && setId !== 'cancel') {
            if (await this.app.setlistManager.addScore(setId, fp)) this.app.showMessage('Added to Setlist.', 'success')
            else this.app.showMessage('Already in the Setlist.', 'info')
        }
    }

    async handleManualPush() {
        const fp = this.currentFp || this.app.pdfFingerprint
        if (!fp) return
        if (!this.app.driveSyncManager?.isEnabled) return this.app.showMessage('Google Drive not connected', 'error')
        
        this.app.showMessage(`Forcing cloud push for current score...`, 'system')
        try {
            await this.app.driveSyncManager.pushScore(fp, true) // Force push
            this.app.showMessage('Cloud push completed.', 'success')
            this.refreshStats()
        } catch (err) {
            this.app.showMessage(`Push failed: ${err.message}`, 'error')
        }
    }

    async handleManualPull() {
        const fp = this.currentFp || this.app.pdfFingerprint
        if (!fp) return
        if (!this.app.driveSyncManager?.isEnabled) return this.app.showMessage('Google Drive not connected', 'error')

        this.app.showMessage(`Fetching latest data from cloud...`, 'system')
        try {
            console.log(`[ScoreDetailManager] Triggering manual pull for ${fp}`);
            const result = await this.app.driveSyncManager.syncScore(fp, false, true, false) // Force pull
            console.log(`[ScoreDetailManager] Manual pull result:`, result);
            if (result) {
                this.app.showMessage('Cloud data fetched and merged.', 'success')
                // Force reload if it's the active score
                if (this.app.pdfFingerprint === fp) {
                    console.log(`[ScoreDetailManager] Active score match. Reloading stamps...`);
                    await this.app.viewerManager.loadStamps(fp)
                    console.log(`[ScoreDetailManager] Redrawing layers...`);
                    this.app.annotationManager?.redrawAllAnnotationLayers()
                }
                this.refreshStats()
            } else {
                this.app.showMessage('No new data found on cloud.', 'info')
            }
        } catch (err) {
            this.app.showMessage(`Pull failed: ${err.message}`, 'error')
        }
    }

    async handleSupabaseRepair() {
        const fp = this.currentFp || this.app.pdfFingerprint
        if (!fp) return
        if (!this.app.supabaseManager?.user) return this.app.showMessage('Supabase not connected', 'error')

        this.app.showMessage(`🔍 檢查本地資料...`, 'system')
        try {
            const buffer = await db.get(`score_buf_${fp}`);
            if (!buffer || buffer.byteLength === 0) {
                return this.app.showMessage('本地找不到完整的樂譜資料，無法修復雲端。', 'error');
            }

            const confirmed = await this.app.showDialog({
                title: 'Repair Cloud File?',
                message: `確定要將本地樂譜 (${(buffer.byteLength / 1024).toFixed(1)} KB) 強制覆蓋到 Supabase 雲端嗎？此操作將修復 0 KB 的損毀檔案。`,
                type: 'confirm',
                icon: '☁️'
            });
            if (!confirmed) return;

            this.app.showMessage('正在上傳修復檔案...', 'system');
            const success = await this.app.supabaseManager.uploadPDFBuffer(fp, buffer);
            if (success) {
                this.app.showMessage('✅ 雲端檔案修復成功！', 'success');
            } else {
                this.app.showMessage('❌ 雲端修復失敗，請檢查網路。', 'error');
            }
        } catch (err) {
            console.error('[ScoreDetailManager] Supabase repair failed:', err);
            this.app.showMessage(`修復失敗: ${err.message}`, 'error');
        }
    }

    async handleSupabasePushAnnotations() {
        const fp = this.currentFp || this.app.pdfFingerprint
        if (!fp) return
        if (!this.app.supabaseManager?.user) return this.app.showMessage('Supabase not connected', 'error')

        this.app.showMessage(`🔍 準備同步標註...`, 'system')
        try {
            // Get current stamps (either global or from DB)
            let stamps = []
            if (this.app.pdfFingerprint === fp) {
                stamps = this.app.stamps || []
            } else {
                stamps = await db.get(`stamps_${fp}`) || []
            }

            if (stamps.length === 0) {
                return this.app.showMessage('此樂譜沒有任何本地標註可同步。', 'info');
            }

            const confirmed = await this.app.showDialog({
                title: 'Push All Markings?',
                message: `確定要將本地所有標註 (${stamps.length} 筆) 強制同步到 Supabase 雲端嗎？`,
                type: 'confirm',
                icon: '⬆️'
            });
            if (!confirmed) return;

            this.app.showMessage('正在上傳標註數據...', 'system');
            const success = await this.app.supabaseManager.pushAllAnnotations(fp, stamps);
            if (success) {
                this.app.showMessage(`✅ 成功上傳 ${stamps.length} 筆標註！`, 'success');
            } else {
                this.app.showMessage('❌ 標註同步失敗，請檢查網路。', 'error');
            }
        } catch (err) {
            console.error('[ScoreDetailManager] Supabase annotation push failed:', err);
            this.app.showMessage(`同步失敗: ${err.message}`, 'error');
        }
    }

    getExportMetadata() {
        return { name: this.currentInfo.name, composer: this.currentInfo.composer, fingerprint: this.currentFp || this.app.pdfFingerprint }
    }

    getExportFilename(isGlobal, userName) {
        const now = new Date();
        const datestr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        const clean = (s) => (s || '').trim().replace(/[\/\?<>\\:\*\|":]/g, '_').replace(/\s+/g, '_').replace(/\.+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        const safeUserName = clean(userName) || 'Guest';

        if (isGlobal) return `ScoreFlow_Backup_${safeUserName}_${datestr}.json`;

        let scoreBase = (this.currentInfo.name || '').trim() || (this.app.activeScoreName ? this.app.activeScoreName.replace(/\.[^/.]+$/, "") : 'Untitled');
        return `${clean(scoreBase)}_${clean(this.currentInfo.composer) || 'Unknown'}_${safeUserName}_${datestr}.json`;
    }
}
