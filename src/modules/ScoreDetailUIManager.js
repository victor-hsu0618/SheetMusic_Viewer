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
        this.panel = document.getElementById('score-detail-panel')
        this.btnClose = document.getElementById('btn-close-score-detail')
        this.scoreNameInput = document.getElementById('score-name-input')
        this.scoreComposerInput = document.getElementById('score-composer-input')
        this.scoreFilenameDisplay = document.getElementById('score-filename-display')
        this.scoreFingerprintDisplay = document.getElementById('score-fingerprint-display')
        this.btnSave = document.getElementById('btn-save-score-detail')

        this.mediaLabelInput = document.getElementById('sidebar-media-label')
        this.mediaUrlInput = document.getElementById('sidebar-media-url')
        this.mediaListContainer = document.getElementById('sidebar-media-list')
        this.btnAddYoutube = document.getElementById('sidebar-add-youtube')
        this.btnAddLocal = document.getElementById('sidebar-add-local')
        this.localFileInput = document.getElementById('sidebar-local-input')

        this.statsTotalCount = document.getElementById('stats-total-count')
        this.statsLastEdit = document.getElementById('stats-last-edit')
        this.statsAuthor = document.getElementById('stats-author')
        
        this.initEventListeners()
        // Disable draggable for PC to maintain "Stacked Shelf" design
        // this.initDraggable()
        this.initResizable()
    }

    initEventListeners() {
        this.btnClose?.addEventListener('click', () => this.manager.toggle(false))
        
        const autoSaveFields = [this.scoreNameInput, this.scoreComposerInput]
        autoSaveFields.forEach(field => {
            if (field) {
                field.addEventListener('input', () => this.manager.handleInputChange())
                field.addEventListener('blur', () => this.manager.handleAutoSave())
            }
        })

        this.btnAddYoutube?.addEventListener('click', () => this.manager.handleAddYoutube())
        this.btnAddLocal?.addEventListener('click', () => this.localFileInput.click())
        this.localFileInput?.addEventListener('change', (e) => this.manager.handleLocalFile(e))
        this.btnSave?.addEventListener('click', () => this.manager.handleSave())

        document.getElementById('btn-detail-add-setlist')?.addEventListener('click', () => this.manager.handleAddSetlist())
        document.getElementById('btn-reset-score-all')?.addEventListener('click', () => this.manager.handleResetAll())

        const tabBtns = this.panel?.querySelectorAll('.detail-tab-btn')
        tabBtns?.forEach(btn => {
            btn.addEventListener('click', () => this.switchTab(btn.dataset.tab))
        })
    }

    initDraggable() {
        let isDragging = false
        let startX, startY, initialX = 0, initialY = 0
        const el = this.panel
        const handle = el?.querySelector('.jump-drag-handle')
        if (!handle) return

        const start = (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY
            const matrix = new WebKitCSSMatrix(window.getComputedStyle(el).transform)
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
            el.style.transform = `translate(${initialX + (clientX - startX)}px, ${initialY + (clientY - startY)}px)`
        }

        const end = () => { isDragging = false; el.style.transition = '' }

        handle.addEventListener('mousedown', start)
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', end)
        handle.addEventListener('touchstart', start, { passive: false })
        document.addEventListener('touchmove', move, { passive: false })
        document.addEventListener('touchend', end)
    }

    initResizable() {
        const handle = this.panel?.querySelector('.panel-resize-handle')
        if (!handle) return
        let isResizing = false
        let startX, startY, startWidth, startHeight
        const el = this.panel

        const start = (e) => {
            e.preventDefault(); e.stopPropagation()
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

        const end = () => { isResizing = false; el.style.transition = '' }

        handle.addEventListener('mousedown', start)
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', end)
        handle.addEventListener('touchstart', start, { passive: false })
        document.addEventListener('touchmove', move, { passive: false })
        document.addEventListener('touchend', end)
    }

    switchTab(tabId) {
        this.panel.querySelectorAll('.detail-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId))
        this.panel.querySelectorAll('.detail-tab-pane').forEach(pane => pane.classList.toggle('active', pane.id === `pane-${tabId}`))
        if (tabId === 'styles') this.app.renderSourceUI()
    }

    refreshStats(fingerprint, info) {
        let stamps = []
        if (this.app.pdfFingerprint === fingerprint) stamps = this.app.stamps || []
        else {
            try {
                const stored = localStorage.getItem(`scoreflow_stamps_${fingerprint}`)
                if (stored) stamps = JSON.parse(stored)
            } catch (e) {}
        }

        let lastTime = 'Never'
        if (info.lastEdit) {
            lastTime = new Date(info.lastEdit).toLocaleString([], {
                year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
            })
        }

        if (this.statsTotalCount) this.statsTotalCount.textContent = stamps.length
        if (this.statsLastEdit) this.statsLastEdit.textContent = lastTime
        if (this.statsAuthor) this.statsAuthor.textContent = info.lastAuthor || 'Guest'
    }

    render(fingerprint, info) {
        if (!this.scoreNameInput) return
        this.scoreNameInput.value = info.name || ''
        this.scoreComposerInput.value = info.composer || ''
        if (this.scoreFingerprintDisplay) {
            const shortFinger = fingerprint ? `${fingerprint.slice(0, 8)}...${fingerprint.slice(-8)}` : 'Unknown'
            this.scoreFingerprintDisplay.textContent = shortFinger
            this.scoreFingerprintDisplay.title = fingerprint || ''
        }
        if (this.scoreFilenameDisplay) {
            const regScore = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint)
            this.scoreFilenameDisplay.textContent = regScore ? regScore.fileName : (this.app.pdfFingerprint === fingerprint ? this.app.activeScoreName : 'Unknown File')
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
