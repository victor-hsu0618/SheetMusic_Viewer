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

        const info = await db.get(`detail_${fingerprint}`)
        const regScore = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint)

        if (info) {
            try {
                this.currentInfo = {
                    name: info.name || regScore?.title || '',
                    composer: info.composer || regScore?.composer || '',
                    nameEditedAt: info.nameEditedAt || info.lastEdit || 0,
                    composerEditedAt: info.composerEditedAt || info.lastEdit || 0,
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
            // Determine a safe fallback name without contaminating from other open scores
            let fallbackName = regScore?.title || "";
            if (!fallbackName && this.app.pdfFingerprint === fingerprint) {
                fallbackName = this.app.activeScoreName?.replace(/\.pdf$/i, '') || "";
            }
            if (!fallbackName) fallbackName = "Untitled";

            this.currentInfo = {
                name: fallbackName,
                composer: regScore?.composer || 'Unknown',
                nameEditedAt: 0,
                composerEditedAt: 0,
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

    async save(fingerprint) {
        if (!fingerprint) return
        const saveData = { ...this.currentInfo }
        saveData.mediaList = saveData.mediaList.map(m => m.type === 'local' ? { ...m, source: null } : m)
        await db.set(`detail_${fingerprint}`, saveData)
    }

    /**
     * Initializes a new score detail record in storage without touching the current active state.
     * Essential for background imports to prevent UI/Sync cross-contamination.
     */
    initializeNewScore(fingerprint, name) {
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
        db.set(`detail_${fingerprint}`, info)
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
