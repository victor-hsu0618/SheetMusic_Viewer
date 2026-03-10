import * as db from '../db.js'

export class ScoreDetailManager {
    constructor(app) {
        this.app = app
        this.currentInfo = {
            name: '',
            composer: '',
            lastEdit: null,
            lastAuthor: null,
            mediaList: [], // [{ id, label, type, source }]
            activeMediaId: null,
            stampScale: 1.0
        }
        this.isLoading = false
        this.panel = null
        this.currentFp = null
    }

    init() {
        this.panel = document.getElementById('score-detail-panel')
        this.btnClose = document.getElementById('btn-close-score-detail')
        this.scoreNameInput = document.getElementById('score-name-input')
        this.scoreComposerInput = document.getElementById('score-composer-input')
        this.scoreFilenameDisplay = document.getElementById('score-filename-display')
        this.scoreFingerprintDisplay = document.getElementById('score-fingerprint-display')

        // Media UI
        this.mediaLabelInput = document.getElementById('sidebar-media-label')
        this.mediaUrlInput = document.getElementById('sidebar-media-url')
        this.mediaListContainer = document.getElementById('sidebar-media-list')
        this.btnAddYoutube = document.getElementById('sidebar-add-youtube')
        this.btnAddLocal = document.getElementById('sidebar-add-local')
        this.localFileInput = document.getElementById('sidebar-local-input')

        // Stats Elements
        this.statsTotalCount = document.getElementById('stats-total-count')
        this.statsLastEdit = document.getElementById('stats-last-edit')
        this.statsAuthor = document.getElementById('stats-author')

        this.initEventListeners()
    }

    initEventListeners() {
        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => this.toggle(false))
        }

        if (this.scoreNameInput) {
            this.scoreNameInput.addEventListener('input', () => this.handleInputChange())
        }
        if (this.scoreComposerInput) {
            this.scoreComposerInput.addEventListener('input', () => this.handleInputChange())
        }

        if (this.btnAddYoutube) {
            this.btnAddYoutube.addEventListener('click', () => this.handleAddYoutube())
        }
        if (this.btnAddLocal) {
            this.btnAddLocal.addEventListener('click', () => this.localFileInput.click())
        }
        if (this.localFileInput) {
            this.localFileInput.addEventListener('change', (e) => this.handleLocalFile(e))
        }
    }

    handleAddYoutube() {
        const url = this.mediaUrlInput.value.trim()
        const label = this.mediaLabelInput.value.trim() || 'YouTube Video'
        if (!url) return

        const mediaObj = {
            id: 'media-' + Date.now(),
            label,
            type: 'youtube',
            source: url
        }

        this.currentInfo.mediaList.push(mediaObj)
        if (!this.currentInfo.activeMediaId) this.currentInfo.activeMediaId = mediaObj.id

        this.mediaUrlInput.value = ''
        this.mediaLabelInput.value = ''

        this.onModification() // Ensure lastEdit is updated for sync
        this.render(this.app.pdfFingerprint)

        // If it's the first one, load it automatically
        if (this.currentInfo.activeMediaId === mediaObj.id) {
            this.app.playbackManager?.loadMedia(mediaObj)
        }
    }

    handleLocalFile(e) {
        const file = e.target.files[0]
        if (!file) return

        const label = this.mediaLabelInput.value.trim() || file.name
        const mediaObj = {
            id: 'media-' + Date.now(),
            label,
            type: 'local',
            source: file // Note: File object, will need special handling for persistence if desired, 
            // but for now we follow the existing pattern
        }

        this.currentInfo.mediaList.push(mediaObj)
        if (!this.currentInfo.activeMediaId) this.currentInfo.activeMediaId = mediaObj.id

        this.mediaLabelInput.value = ''
        this.save(this.app.pdfFingerprint)
        this.render(this.app.pdfFingerprint)

        if (this.currentInfo.activeMediaId === mediaObj.id) {
            this.app.playbackManager?.loadMedia(mediaObj)
        }
        e.target.value = ''
    }

    selectMedia(id) {
        this.currentInfo.activeMediaId = id
        this.save(this.app.pdfFingerprint)
        this.render(this.app.pdfFingerprint)

        const media = this.currentInfo.mediaList.find(m => m.id === id)
        if (media) {
            this.app.playbackManager?.loadMedia(media)
        }
    }

    deleteMedia(id) {
        this.currentInfo.mediaList = this.currentInfo.mediaList.filter(m => m.id !== id)
        if (this.currentInfo.activeMediaId === id) {
            this.currentInfo.activeMediaId = this.currentInfo.mediaList[0]?.id || null
        }
        this.onModification() // Update timestamp for sync
        this.render(this.app.pdfFingerprint)
    }

    refreshStats() {
        if (!this.app.pdfFingerprint) return;

        const stamps = this.app.stamps || [];
        const count = stamps.length;

        let lastTime = 'Never';
        if (this.currentInfo.lastEdit) {
            const date = new Date(this.currentInfo.lastEdit);
            lastTime = date.toLocaleString([], {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        }

        // Display results
        if (this.statsTotalCount) this.statsTotalCount.textContent = count;
        if (this.statsLastEdit) this.statsLastEdit.textContent = lastTime;
        if (this.statsAuthor) {
            this.statsAuthor.textContent = this.currentInfo.lastAuthor || 'Guest';
        }

        console.log('[ScoreDetailManager] Data statistics refreshed.');
    }

    onModification() {
        if (!this.app.pdfFingerprint) return;

        this.currentInfo.lastEdit = Date.now();
        this.currentInfo.lastAuthor = this.app.profileManager?.data?.userName || 'Guest';

        this.save(this.app.pdfFingerprint);

        // If the Detail tab is currently active, refresh UI immediately
        const activeTab = document.querySelector('.sidebar-tab.active');
        if (activeTab && activeTab.dataset.tab === 'score-detail') {
            this.refreshStats();
        }
    }

    handleInputChange() {
        if (!this.app.pdfFingerprint || this.isLoading) return

        const newName = this.scoreNameInput.value.trim()
        const newComposer = this.scoreComposerInput.value.trim()

        // Defensive check: Only modify if data actually changed
        // Prevents browser auto-fill from triggering a sync on unchanged/empty data
        if (newName === this.currentInfo.name && newComposer === this.currentInfo.composer) {
            return
        }

        this.currentInfo.name = newName
        this.currentInfo.composer = newComposer

        this.onModification() // Update timestamp for sync
    }

    toggle(force) {
        if (!this.panel) return
        const active = force !== null ? force : !this.panel.classList.contains('active')
        this.panel.classList.toggle('active', active)
        if (active) {
            // Bring to front among panels
            document.querySelectorAll('.jump-sub-panel').forEach(p => p.style.zIndex = '1000')
            this.panel.style.zIndex = '1001'
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

        const detailData = localStorage.getItem(`scoreflow_detail_${fingerprint}`)
        if (detailData) {
            try {
                const info = JSON.parse(detailData)
                this.currentInfo = {
                    name: info.name || '',
                    composer: info.composer || '',
                    lastEdit: info.lastEdit || 0, // Ensure numeric 0 for sync LWW
                    lastAuthor: info.lastAuthor || null,
                    mediaList: info.mediaList || (info.media ? [{ id: 'legacy', label: 'Default Video', ...info.media }] : []),
                    activeMediaId: info.activeMediaId || (info.media ? 'legacy' : null),
                    stampScale: info.stampScale || 1.0
                }
                this.app.scoreStampScale = this.currentInfo.stampScale
            } catch (err) {
                console.error('[ScoreDetailManager] Failed to parse score detail data:', err)
                this.currentInfo = { name: '', composer: '', lastEdit: 0, mediaList: [], activeMediaId: null }
            }
        } else {
            // New score defaults
            this.currentInfo = {
                name: this.app.activeScoreName ? this.app.activeScoreName.replace(/\.pdf$/i, '') : '',
                composer: '',
                lastEdit: 0, // NEW FILE: 0 timestamp means remote will always win
                mediaList: [],
                activeMediaId: null,
                stampScale: 1.0
            }
            this.app.scoreStampScale = 1.0
        }

        this.render(fingerprint)
        this.isLoading = false

        // Load active media if sidebar is loaded
        if (this.currentInfo.activeMediaId) {
            const activeMedia = this.currentInfo.mediaList.find(m => m.id === this.currentInfo.activeMediaId)
            if (activeMedia) this.app.playbackManager?.loadMedia(activeMedia)
        }
    }

    save(fingerprint) {
        if (!fingerprint) return
        // We don't save File objects to localStorage, so filter them out or handle specifically
        // Existing patterns in this app seem to prioritize ephemeral local file access
        const saveData = { ...this.currentInfo }
        saveData.mediaList = saveData.mediaList.map(m => m.type === 'local' ? { ...m, source: null } : m)
        localStorage.setItem(`scoreflow_detail_${fingerprint}`, JSON.stringify(saveData))
    }

    render(fingerprint) {
        if (!this.scoreNameInput || !this.scoreComposerInput) return

        // Update inputs
        this.scoreNameInput.value = this.currentInfo.name || ''
        this.scoreComposerInput.value = this.currentInfo.composer || ''

        // Update meta displays
        if (this.scoreFingerprintDisplay) {
            this.scoreFingerprintDisplay.textContent = fingerprint ? fingerprint : 'Unknown'
            this.scoreFingerprintDisplay.title = fingerprint || ''
        }

        // Specific file info if multiple
        const regScore = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint)
        if (this.scoreFilenameDisplay) {
            this.scoreFilenameDisplay.textContent = regScore ? regScore.fileName : (this.app.pdfFingerprint === fingerprint ? this.app.activeScoreName : 'Unknown File')
        }

        // Render Media List
        if (this.mediaListContainer) {
            this.mediaListContainer.innerHTML = ''
            this.currentInfo.mediaList.forEach(media => {
                const isActive = media.id === this.currentInfo.activeMediaId
                const row = document.createElement('div')
                row.className = `media-item-row ${isActive ? 'active' : ''}`
                row.innerHTML = `
                    <div class="media-item-info">
                        <span class="media-item-label">${media.label}</span>
                        <span class="media-item-type">${media.type}</span>
                    </div>
                    <div class="flex-row-center gap-5">
                        <button class="btn-icon-mini media-select-btn" title="Set Active">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                        </button>
                        <button class="btn-icon-mini media-delete-btn text-danger" title="Delete">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                `
                row.querySelector('.media-select-btn').onclick = () => this.selectMedia(media.id)
                row.querySelector('.media-delete-btn').onclick = () => this.deleteMedia(media.id)
                this.mediaListContainer.appendChild(row)
            })
        }
    }

    getExportMetadata() {
        return {
            name: this.currentInfo.name,
            composer: this.currentInfo.composer,
            fingerprint: this.app.pdfFingerprint
        }
    }

    getExportFilename(isGlobal, userName) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const datestr = `${year}-${month}-${day}`;

        // Robust sanitization (removes only problematic system characters)
        const clean = (s) => {
            if (!s) return '';
            // Trim and replace spaces/dots/problematic chars with underscores
            return s.trim()
                .replace(/[\/\?<>\\:\*\|":]/g, '_') // Windows/Linux illegal chars
                .replace(/\s+/g, '_')               // Spaces to underscores
                .replace(/\.+/g, '_')               // Dots to underscores (prevent double extensions)
                .replace(/_+/g, '_')                // Clean duplicate underscores
                .replace(/^_|_$/g, '');             // Trim underscores from ends
        }

        const safeUserName = clean(userName) || 'Guest';

        if (isGlobal) {
            return `ScoreFlow_Backup_${safeUserName}_${datestr}.json`;
        }

        // Try to get a meaningful score name
        let scoreBase = (this.currentInfo.name || '').trim();
        if (!scoreBase || scoreBase.toLowerCase() === 'untitled') {
            scoreBase = this.app.activeScoreName ? this.app.activeScoreName.replace(/\.[^/.]+$/, "") : 'Untitled';
        }

        const scoreName = clean(scoreBase) || 'Untitled';
        const composer = clean(this.currentInfo.composer) || 'Unknown';

        const finalFilename = `${scoreName}_${composer}_${safeUserName}_${datestr}.json`;
        console.log('[ScoreDetailManager] Final filename generated:', finalFilename);
        return finalFilename;
    }
}
