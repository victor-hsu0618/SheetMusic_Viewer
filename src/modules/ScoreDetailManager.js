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
            stampScale: 1.0,
            lastScrollTop: 0
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
        this.btnSave = document.getElementById('btn-save-score-detail')

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
        this.resizeHandle = this.panel.querySelector('.panel-resize-handle')

        this.initEventListeners()
        this.initDraggable()
        this.initResizable()
    }

    initEventListeners() {
        if (this.btnClose) {
            this.btnClose.addEventListener('click', () => this.toggle(false))
        }

        if (this.scoreNameInput) {
            this.scoreNameInput.addEventListener('input', () => this.handleInputChange())
            this.scoreNameInput.addEventListener('blur', () => this.handleAutoSave())
        }
        if (this.scoreComposerInput) {
            this.scoreComposerInput.addEventListener('input', () => this.handleInputChange())
            this.scoreComposerInput.addEventListener('blur', () => this.handleAutoSave())
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
        if (this.btnSave) {
            this.btnSave.addEventListener('click', () => this.handleSave())
        }

        this.btnAddSetlist = document.getElementById('btn-detail-add-setlist')
        if (this.btnAddSetlist) {
            this.btnAddSetlist.addEventListener('click', () => this.handleAddSetlist())
        }

        // Tab Switching Logic
        const tabBtns = this.panel.querySelectorAll('.segment-btn')
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab
                this.switchTab(tabId)
            })
        })
    }

    initDraggable() {
        let isDragging = false
        let startX, startY, initialX = 0, initialY = 0
        const el = this.panel
        const handle = el.querySelector('.jump-drag-handle')

        const start = (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

            // Get current transform matrix
            const style = window.getComputedStyle(el)
            const matrix = new WebKitCSSMatrix(style.transform)
            initialX = matrix.m41
            initialY = matrix.m42

            startX = clientX
            startY = clientY
            isDragging = true
            el.style.transition = 'none'
        }

        const move = (e) => {
            if (!isDragging) return
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

            const dx = clientX - startX
            const dy = clientY - startY

            el.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`
        }

        const end = () => {
            isDragging = false
            el.style.transition = ''
        }

        handle.addEventListener('mousedown', start)
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', end)

        handle.addEventListener('touchstart', start, { passive: false })
        document.addEventListener('touchmove', move, { passive: false })
        document.addEventListener('touchend', end)
    }

    initResizable() {
        if (!this.resizeHandle) return
        let isResizing = false
        let startX, startY, startWidth, startHeight
        const el = this.panel

        const start = (e) => {
            e.preventDefault()
            e.stopPropagation()
            isResizing = true

            startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY
            startWidth = el.offsetWidth
            startHeight = el.offsetHeight
            el.style.transition = 'none'
        }

        const move = (e) => {
            if (!isResizing) return
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

            const width = startWidth + (clientX - startX)
            const height = startHeight + (clientY - startY)

            if (width > 300) el.style.width = width + 'px'
            if (height > 200) el.style.height = height + 'px'
        }

        const end = () => {
            isResizing = false
            el.style.transition = ''
        }

        this.resizeHandle.addEventListener('mousedown', start)
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', end)

        this.resizeHandle.addEventListener('touchstart', start, { passive: false })
        document.addEventListener('touchmove', move, { passive: false })
        document.addEventListener('touchend', end)
    }

    switchTab(tabId) {
        // Update Button states
        const tabBtns = this.panel.querySelectorAll('.segment-btn')
        tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId)
        })

        // Update Pane visibility
        const panes = this.panel.querySelectorAll('.detail-tab-pane')
        panes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `pane-${tabId}`)
        })

        // Special render for Collaboration styles if switching to styles tab
        if (tabId === 'styles') {
            this.app.renderSourceUI()
        }
    }

    handleAddYoutube() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint) return;

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
        this.render(fingerprint)

        // If it's the first one, load it automatically
        if (this.currentInfo.activeMediaId === mediaObj.id) {
            this.app.playbackManager?.loadMedia(mediaObj)
        }
    }

    handleLocalFile(e) {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint) return;

        const file = e.target.files[0]
        if (!file) return

        const label = this.mediaLabelInput.value.trim() || file.name
        const mediaObj = {
            id: 'media-' + Date.now(),
            label,
            type: 'local',
            source: file
        }

        this.currentInfo.mediaList.push(mediaObj)
        if (!this.currentInfo.activeMediaId) this.currentInfo.activeMediaId = mediaObj.id

        this.mediaLabelInput.value = ''
        this.save(fingerprint)
        this.render(fingerprint)

        if (this.currentInfo.activeMediaId === mediaObj.id) {
            this.app.playbackManager?.loadMedia(mediaObj)
        }
        e.target.value = ''
    }

    selectMedia(id) {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint) return;

        this.currentInfo.activeMediaId = id
        this.save(fingerprint)
        this.render(fingerprint)

        const media = this.currentInfo.mediaList.find(m => m.id === id)
        if (media) {
            this.app.playbackManager?.loadMedia(media)
        }
    }

    deleteMedia(id) {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint) return;

        this.currentInfo.mediaList = this.currentInfo.mediaList.filter(m => m.id !== id)
        if (this.currentInfo.activeMediaId === id) {
            this.currentInfo.activeMediaId = this.currentInfo.mediaList[0]?.id || null
        }
        this.onModification() // Update timestamp for sync
        this.render(fingerprint)
    }

    refreshStats() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint) return;

        // Statistics should reflect the viewed score, not necessarily the open one
        // If viewing current open score, we can use app.stamps
        // If viewing an UNOPENED score from library, we need to load its stamps from storage
        let stamps = [];
        if (this.app.pdfFingerprint === fingerprint) {
            stamps = this.app.stamps || [];
        } else {
            try {
                const stored = localStorage.getItem(`scoreflow_stamps_${fingerprint}`);
                if (stored) stamps = JSON.parse(stored);
            } catch (e) {
                console.warn('[ScoreDetailManager] Failed to load stamps for stats:', e);
            }
        }

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
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint) return;

        this.currentInfo.lastEdit = Date.now();
        this.currentInfo.lastAuthor = this.app.profileManager?.data?.userName || 'Guest';

        this.save(fingerprint);

        // Mark as unsynced
        if (this.app.scoreManager) {
            this.app.scoreManager.updateSyncStatus(fingerprint, false);
        }

        // Also update registry to keep them in sync for immediate UI updates (e.g. library thumbnails)
        if (this.app.scoreManager && this.currentInfo.name) {
            this.app.scoreManager.updateMetadata(fingerprint, {
                title: this.currentInfo.name,
                composer: this.currentInfo.composer || 'Unknown'
            });
        }

        // If the Detail tab is currently active, refresh UI immediately
        const activeTab = document.querySelector('.sidebar-tab.active');
        if (activeTab && activeTab.dataset.tab === 'score-detail') {
            this.refreshStats();
        }
    }

    handleInputChange() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint || this.isLoading) return

        const newName = this.scoreNameInput.value.trim()
        const newComposer = this.scoreComposerInput.value.trim()

        if (newName !== this.currentInfo.name || newComposer !== this.currentInfo.composer) {
            this.btnSave?.classList.add('btn-primary-highlight')
        } else {
            this.btnSave?.classList.remove('btn-primary-highlight')
        }
    }

    async handleSave() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint || this.isLoading) return

        const newName = (this.scoreNameInput.value || '').trim()
        const newComposer = (this.scoreComposerInput.value || '').trim()

        // Update local state
        this.currentInfo.name = newName
        this.currentInfo.composer = newComposer

        this.onModification() // Update timestamp and save to localStorage

        // Sync with Library Registry (Authority)
        if (this.app.scoreManager) {
            await this.app.scoreManager.updateMetadata(fingerprint, {
                title: newName,
                composer: newComposer
            })
        }

        this.btnSave?.classList.remove('btn-primary-highlight')

        // Visual feedback
        if (this.btnSave) {
            const oldText = this.btnSave.textContent
            this.btnSave.textContent = '✓ Saved!'
            this.btnSave.classList.add('btn-success')

            setTimeout(() => {
                if (this.btnSave) {
                    this.btnSave.textContent = oldText
                    this.btnSave.classList.remove('btn-success')
                }
            }, 2000)
        }

        this.app.showMessage('Score info saved.', 'success')
    }

    /**
     * Silent auto-save when user leaves an input field.
     */
    async handleAutoSave() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint || this.isLoading) return

        const newName = (this.scoreNameInput.value || '').trim()
        const newComposer = (this.scoreComposerInput.value || '').trim()

        // Only save if there's actually a change
        if (newName === this.currentInfo.name && newComposer === this.currentInfo.composer) return

        console.log('[ScoreDetailManager] Auto-saving changes...');

        this.currentInfo.name = newName
        this.currentInfo.composer = newComposer
        this.onModification()

        if (this.app.scoreManager) {
            await this.app.scoreManager.updateMetadata(fingerprint, {
                title: newName,
                composer: newComposer
            })
        }

        this.btnSave?.classList.remove('btn-primary-highlight')
    }

    async handleAddSetlist() {
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        if (!fingerprint) return;

        const setlists = this.app.setlistManager?.setlists || [];
        if (setlists.length === 0) {
            this.app.showMessage('No setlists available. Create one first in the Library.', 'error');
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
            message: `Select a Setlist to add "${this.currentInfo.name || 'this score'}" to:`,
            type: 'actions',
            icon: '📋',
            actions: actions
        });

        if (setId && setId !== 'cancel') {
            const added = await this.app.setlistManager.addScore(setId, fingerprint);
            if (added) {
                this.app.showMessage('Added to Setlist.', 'success');
            } else {
                this.app.showMessage('Score already in the Setlist.', 'info');
            }
        }
    }

    toggle(force) {
        if (!this.panel) return
        const active = force !== null ? force : !this.panel.classList.contains('active')
        this.panel.classList.toggle('active', active)
        if (active) {
            // Bring to front among panels (above library overlay 5000)
            document.querySelectorAll('.jump-sub-panel').forEach(p => p.style.zIndex = '11500')
            this.panel.style.zIndex = '11501'
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
        // ALWAYS get the latest from registry as the authority for Name/Composer
        const regScore = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);

        if (detailData) {
            try {
                const info = JSON.parse(detailData)
                this.currentInfo = {
                    // Authority check: use registry if available, fallback to detail data
                    name: regScore?.title || info.name || '',
                    composer: regScore?.composer || info.composer || '',
                    lastEdit: info.lastEdit || 0,
                    lastAuthor: info.lastAuthor || null,
                    mediaList: info.mediaList || (info.media ? [{ id: 'legacy', label: 'Default Video', ...info.media }] : []),
                    activeMediaId: info.activeMediaId || (info.media ? 'legacy' : null),
                    stampScale: info.stampScale || 1.0,
                    lastScrollTop: info.lastScrollTop || 0
                }
                this.app.scoreStampScale = this.currentInfo.stampScale
            } catch (err) {
                console.error('[ScoreDetailManager] Failed to parse score detail data:', err)
                this.currentInfo = {
                    name: regScore?.title || '',
                    composer: regScore?.composer || '',
                    lastEdit: 0,
                    mediaList: [],
                    activeMediaId: null,
                    stampScale: 1.0,
                    lastScrollTop: 0
                }
            }
        } else {
            // New score defaults: Use active score name as fallback only if not in registry
            let initialName = regScore?.title
            if (!initialName) {
                initialName = this.app.activeScoreName ? this.app.activeScoreName.replace(/\.pdf$/i, '') : ''
            }

            this.currentInfo = {
                name: initialName,
                composer: regScore?.composer || '',
                lastEdit: 0,
                mediaList: [],
                activeMediaId: null,
                stampScale: 1.0,
                lastScrollTop: 0
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
        const fingerprint = this.currentFp || this.app.pdfFingerprint;
        return {
            name: this.currentInfo.name,
            composer: this.currentInfo.composer,
            fingerprint: fingerprint
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
