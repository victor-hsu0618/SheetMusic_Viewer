/**
 * ScoreDetailUIManager handles all DOM interactions, 
 * UI rendering, and statistics display for the Score Detail panel.
 * Extracted from ScoreDetailManager to comply with 500-line limit.
 */
export class ScoreDetailUIManager {
    constructor(app, manager) {
        this.app = app
        this.manager = manager
        this.panel = null
    }

    init() {
        this.panel = document.getElementById('pane-current-score')
        this.scoreNameInput = document.getElementById('score-name-input')
        this.scoreComposerInput = document.getElementById('score-composer-input')

        this.scoreFingerprintDisplay = document.getElementById('score-fingerprint-display')
        this.scoreLastReviewedDisplay = document.getElementById('score-last-reviewed-display')
        this.scoreStorageStatusDisplay = document.getElementById('score-storage-status-display')
        this.btnSave = document.getElementById('btn-save-score-detail')


        this.mediaLabelInput = document.getElementById('sidebar-media-label')
        this.mediaUrlInput = document.getElementById('sidebar-media-url')
        this.mediaListContainer = document.getElementById('sidebar-media-list')
        this.btnAddYoutube = document.getElementById('sidebar-add-youtube')


        this.statsTotalCount = document.getElementById('stats-total-count')
        this.statsSystemCount = document.getElementById('stats-system-count')
        this.statsLastEdit = document.getElementById('stats-last-edit')
        this.statsAuthor = document.getElementById('stats-author')
        
        this.initEventListeners()
    }

    initEventListeners() {
        const autoSaveFields = [this.scoreNameInput, this.scoreComposerInput]
        autoSaveFields.forEach(field => {
            if (field) {
                field.addEventListener('input', () => this.manager.handleInputChange())
                field.addEventListener('blur', () => this.manager.handleAutoSave())
            }
        })

        this.btnAddYoutube?.addEventListener('click', () => this.manager.handleAddYoutube())

        this.btnSave?.addEventListener('click', () => this.manager.handleSave())

        document.getElementById('btn-detail-add-setlist')?.addEventListener('click', () => this.manager.handleAddSetlist())
        document.getElementById('btn-reset-score-all')?.addEventListener('click', () => this.manager.handleResetAll())
        document.getElementById('btn-force-push-supabase')?.addEventListener('click', () => this.manager.handleForcePushSupabase())
        document.getElementById('btn-force-push-drive')?.addEventListener('click', () => this.manager.handleForcePushDrive())
        document.getElementById('btn-force-pull-supabase')?.addEventListener('click', () => this.manager.handleForcePullSupabase())


        document.getElementById('btn-toggle-keep-offline')?.addEventListener('change', async (e) => {
            const fp = this.manager.currentFp || this.app.pdfFingerprint
            if (!fp) return
            const score = this.app.scoreManager?.registry.find(s => s.fingerprint === fp)
            if (!score) return
            
            const isChecked = e.target.checked
            const newMode = isChecked ? 'pinned' : 'cached'

            await this.app.scoreManager?.setStorageMode(fp, newMode)
            this.app.scoreManager?.render()
        })

        const tabBtns = this.panel?.querySelectorAll('.detail-tab-btn')
        tabBtns?.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab))
        })
    }

    switchTab(tabId) {
        this.panel.querySelectorAll('.detail-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId))
        this.panel.querySelectorAll('.detail-tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === `pane-${tabId}`))
        if (tabId === 'styles') {
            this.app.collaboration?.renderSourceUI(
                this.manager.currentSources, 
                this.manager.currentStamps, 
                this.manager.currentFp
            );
        }
    }

    refreshStats(fingerprint, info) {
        if (this.app.pdfFingerprint === fingerprint) {
            this._applyStats(this.app.stamps || [], info)
        } else {
            import('../db.js').then(db => db.get(`stamps_${fingerprint}`)).then(stamps => {
                this._applyStats(stamps || [], info)
            }).catch(() => this._applyStats([], info))
        }
    }

    _applyStats(stamps, info) {
        let lastTime = 'Never'
        if (info.lastEdit) {
            lastTime = new Date(info.lastEdit).toLocaleString([], {
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            })
        }
        const activeStamps = stamps.filter(s => !s.deleted);
        const sysTypes = ['system', 'anchor', 'measure', 'measure-free', 'settings'];
        const annotCount = activeStamps.filter(s => s.type && !sysTypes.includes(s.type)).length;
        const systemCount = activeStamps.filter(s => !s.type || sysTypes.includes(s.type)).length;

        if (this.statsTotalCount) this.statsTotalCount.textContent = annotCount;
        if (this.statsSystemCount) this.statsSystemCount.textContent = systemCount;
        if (this.statsLastEdit) this.statsLastEdit.textContent = lastTime;
        if (this.statsAuthor) this.statsAuthor.textContent = info.lastAuthor || 'Guest';
    }

    updateKeepOfflineBtn(fingerprint) {
        const input = document.getElementById('btn-toggle-keep-offline')
        if (!input) return
        const score = this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint)
        if (!score) return
        const isPinned = score.storageMode === 'pinned'
        input.checked = isPinned
    }

    render(fingerprint, info) {
        if (!this.scoreNameInput) return
        this.scoreNameInput.value = info.name || ''
        this.scoreComposerInput.value = info.composer || ''
        this.updateKeepOfflineBtn(fingerprint)

        // Resolve Score Entry from Registry
        const registry = this.app.scoreManager?.registry || [];
        const regScore = registry.find(s => s.fingerprint === fingerprint)

        if (this.scoreFingerprintDisplay) {
            const shortFinger = fingerprint ? `${fingerprint.slice(0, 8)}...${fingerprint.slice(-8)}` : 'Unknown'
            this.scoreFingerprintDisplay.textContent = shortFinger
            this.scoreFingerprintDisplay.title = fingerprint || ''
        }

        if (this.scoreLastReviewedDisplay) {
            const fmt = this.app.scoreManager?.ui?.formatRelativeTime
            this.scoreLastReviewedDisplay.textContent = fmt ? fmt(regScore?.lastAccessed) : '—'
        }

        if (this.scoreStorageStatusDisplay) {
            const mode = regScore?.storageMode || 'cached'
            const labels = { pinned: '📌 Pinned', cached: '📍 Cached', cloud: '☁️ Cloud only' }
            this.scoreStorageStatusDisplay.textContent = labels[mode] ?? '📍 Cached'
        }


        if (this.mediaListContainer) {
            this.mediaListContainer.innerHTML = ''
            info.mediaList.forEach(media => {
                const isActive = media.id === info.activeMediaId
                const row = document.createElement('div')
                row.className = `media-item-row ${isActive ? 'active' : ''}`
                row.innerHTML = `
                    <div class="media-item-info">
                        <span class="media-item-label">${media.label}</span>
                        <span class="media-item-type">${media.type}</span>
                    </div>
                `
                const actions = document.createElement('div')
                actions.className = 'flex-row-center gap-5'
                
                const selectBtn = document.createElement('button')
                selectBtn.className = 'btn-icon-mini media-select-btn'
                selectBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
                selectBtn.onclick = () => this.manager.selectMedia(media.id)
                
                const deleteBtn = document.createElement('button')
                deleteBtn.className = 'btn-icon-mini media-delete-btn text-danger'
                deleteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
                deleteBtn.onclick = () => this.manager.deleteMedia(media.id)
                
                actions.appendChild(selectBtn); actions.appendChild(deleteBtn)
                row.appendChild(actions)
                this.mediaListContainer.appendChild(row)
            })
        }
    }
}
