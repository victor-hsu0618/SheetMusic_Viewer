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

        if (active) {
            document.querySelectorAll('.jump-sub-panel').forEach(p => p.style.zIndex = '11500')
            this.ui.panel.style.zIndex = '11501'
            this.refreshStats()
        }
    }

    async showPanel(fingerprint) {
        this.currentFp = fingerprint || this.app.pdfFingerprint
        if (!this.currentFp) return
        await this.load(this.currentFp)
        this.toggle(true)
    }

    async load(fingerprint) {
        if (!fingerprint) return
        this.isLoading = true
        this.currentFp = fingerprint

        // Reset to clean state first
        this.currentInfo = {
            name: '',
            composer: 'Unknown',
            lastEdit: 0,
            lastAuthor: null,
            mediaList: [],
            activeMediaId: null,
            stampScale: 1.0,
            lastScrollTop: 0
        }

        const detailData = localStorage.getItem(`scoreflow_detail_${fingerprint}`)
        const regScore = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint)

        if (detailData) {
            try {
                const info = JSON.parse(detailData)
                this.currentInfo = {
                    name: regScore?.title || info.name || '',
                    composer: regScore?.composer || info.composer || '',
                    lastEdit: info.lastEdit || 0,
                    lastAuthor: info.lastAuthor || null,
                    mediaList: info.mediaList || [],
                    activeMediaId: info.activeMediaId || null,
                    stampScale: info.stampScale || 1.0,
                    lastScrollTop: info.lastScrollTop || 0
                }
            } catch (err) {
                console.error('[ScoreDetailManager] Load failed:', err)
                this.currentInfo.name = regScore?.title || ''
            }
        } else {
            this.currentInfo = {
                name: regScore?.title || (this.app.activeScoreName?.replace(/\.pdf$/i, '') || ''),
                composer: regScore?.composer || 'Unknown',
                lastEdit: 0,
                lastAuthor: null,
                mediaList: [],
                activeMediaId: null,
                stampScale: 1.0,
                lastScrollTop: 0
            }
        }

        this.render(fingerprint)
        this.isLoading = false

        if (this.currentInfo.activeMediaId) {
            const activeMedia = this.currentInfo.mediaList.find(m => m.id === this.currentInfo.activeMediaId)
            if (activeMedia) this.app.playbackManager?.loadMedia(activeMedia)
        }
    }

    save(fingerprint) {
        if (!fingerprint) return
        const saveData = { ...this.currentInfo }
        saveData.mediaList = saveData.mediaList.map(m => m.type === 'local' ? { ...m, source: null } : m)
        localStorage.setItem(`scoreflow_detail_${fingerprint}`, JSON.stringify(saveData))
    }

    render(fingerprint) {
        this.ui.render(fingerprint, this.currentInfo)
    }

    refreshStats() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint
        if (fingerprint) this.ui.refreshStats(fingerprint, this.currentInfo)
    }

    onModification() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint
        if (!fingerprint) return

        this.currentInfo.lastEdit = Date.now()
        this.currentInfo.lastAuthor = this.app.profileManager?.data?.userName || 'Guest'
        this.save(fingerprint)

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

        this.currentInfo.name = (this.scoreNameInput.value || '').trim()
        this.currentInfo.composer = (this.scoreComposerInput.value || '').trim()
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

        const newName = (this.scoreNameInput.value || '').trim()
        const newComposer = (this.scoreComposerInput.value || '').trim()
        if (newName === this.currentInfo.name && newComposer === this.currentInfo.composer) return

        this.currentInfo.name = newName
        this.currentInfo.composer = newComposer
        this.onModification()
    }

    async handleSyncRename() {
        const fp = this.currentFp || this.app.pdfFingerprint;
        if (!fp) return;

        const drive = this.app.driveSyncManager;
        if (!drive?.isEnabled || !drive?.accessToken) {
            alert('請先連接 Google Drive');
            return;
        }

        const rawName = (this.ui.syncFilenameInput.value || '').trim();
        const hash = fp.slice(0, 8);
        
        // Final name format: MozSym40_abc12345.json
        const finalFilename = rawName ? `${rawName}_${hash}.json` : `sync_${hash}.json`;

        const entry = drive.manifest[fp];
        if (!entry || !entry.syncId) {
            alert('此樂譜尚未在雲端建立劃記同步檔');
            return;
        }

        try {
            this.app.showMessage('正在重新命名雲端檔案...', 'system');
            await drive.renameFile(entry.syncId, finalFilename);
            
            // Update local manifest and Save
            entry.name = rawName; // Store only the display part in name field
            await drive.saveManifest();
            
            this.app.showMessage('雲端檔名已更新', 'success');
            this.render(fp);
        } catch (err) {
            console.error('[ScoreDetail] Rename failed:', err);
            alert('重命名失敗: ' + err.message);
        }
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
            title: 'Reset Entire Score?',
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
        localStorage.removeItem(`scoreflow_stamps_${fingerprint}`)
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

    getExportMetadata() {
        return { name: this.currentInfo.name, composer: this.currentInfo.composer, fingerprint: this.currentFp || this.app.pdfFingerprint }
    }

    getExportFilename(isGlobal, userName) {
        const now = new Date();
        const datestr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const clean = (s) => (s || '').trim().replace(/[\/\?<>\\:\*\|":]/g, '_').replace(/\s+/g, '_').replace(/\.+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        const safeUserName = clean(userName) || 'Guest';

        if (isGlobal) return `ScoreFlow_Backup_${safeUserName}_${datestr}.json`;

        let scoreBase = (this.currentInfo.name || '').trim() || (this.app.activeScoreName ? this.app.activeScoreName.replace(/\.[^/.]+$/, "") : 'Untitled');
        return `${clean(scoreBase)}_${clean(this.currentInfo.composer) || 'Unknown'}_${safeUserName}_${datestr}.json`;
    }
}
