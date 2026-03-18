export class DocBarManager {
    constructor(app) {
        this.app = app
    }

    init() {
        this.app.docBar = document.getElementById('floating-doc-bar')
        this.app.zoomLevelDisplay = document.getElementById('zoom-level')
        this.app.floatingScoreTitle = document.getElementById('floating-score-title')

        // Restore hidden state
        if (localStorage.getItem('scoreflow_doc_bar_hidden') === 'true') {
            this.app.docBar?.classList.add('doc-hidden')
        }

        this.initGrip()
        this.initGripPositionSetting()
        this.initScoreTitleLongPress()
        
        // Handle responsive behavior on resize
        window.addEventListener('resize', () => this.updateScoreTitleInteraction())
    }

    updateScoreTitleInteraction() {
        const titleEl = this.app.floatingScoreTitle
        if (!titleEl) return

        const isNarrow = window.matchMedia("(max-width: 480px)").matches
        const detailBtn = document.getElementById('btn-score-detail-toggle')

        if (isNarrow) {
            if (detailBtn) detailBtn.style.display = ''
            titleEl.classList.remove('clickable')
            titleEl.title = ""
        } else {
            if (detailBtn) detailBtn.style.display = 'none'
            titleEl.classList.add('clickable')
            titleEl.title = "Long press for Details (I), Short press to close"
        }
    }

    initScoreTitleLongPress() {
        const titleEl = this.app.floatingScoreTitle
        if (!titleEl) return

        this.updateScoreTitleInteraction()

        let timer = null
        let startPos = null
        let isLongPressTriggered = false

        const start = (e) => {
            if (timer) clearTimeout(timer)
            if (e.type === 'mousedown' && e.button !== 0) return // only left click
            
            isLongPressTriggered = false
            const point = e.type === 'touchstart' ? e.touches[0] : e
            startPos = { x: point.clientX, y: point.clientY }

            timer = setTimeout(() => {
                isLongPressTriggered = true
                if (navigator.vibrate) navigator.vibrate(10)
                this.app.scoreDetailManager?.showPanel()
                timer = null
            }, 600) // 600ms long press
        }

        const move = (e) => {
            if (!timer || !startPos) return
            const point = e.type === 'touchmove' ? e.touches[0] : e
            const dx = Math.abs(point.clientX - startPos.x)
            const dy = Math.abs(point.clientY - startPos.y)
            if (dx > 10 || dy > 10) cancel()
        }

        const cancel = (e) => {
            // Handle short press on release
            if (e && (e.type === 'mouseup' || e.type === 'touchend')) {
                const wasShortPress = timer !== null && !isLongPressTriggered
                if (wasShortPress) {
                    const detail = this.app.scoreDetailManager
                    if (detail?.ui?.panel?.classList.contains('active')) {
                        detail.toggle(false)
                    }
                }
            }

            if (timer) {
                clearTimeout(timer)
                timer = null
            }
            startPos = null
        }

        titleEl.addEventListener('mousedown', start)
        titleEl.addEventListener('touchstart', start, { passive: true })
        titleEl.addEventListener('mousemove', move)
        titleEl.addEventListener('touchmove', move, { passive: true })
        
        // Use capture or specific listeners to ensure we catch the release even outside the element
        window.addEventListener('mouseup', cancel)
        window.addEventListener('touchend', cancel)
        window.addEventListener('touchcancel', cancel)
    }

    applyGripPosition(pos) {
        const el = this.app.docBar
        if (!el) return
        el.classList.toggle('grip-right', pos === 'right')
        localStorage.setItem('scoreflow_grip_position', pos)
        document.querySelectorAll('[data-grip]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.grip === pos)
        })
    }

    initGripPositionSetting() {
        const saved = localStorage.getItem('scoreflow_grip_position') || 'right'
        this.applyGripPosition(saved)
        document.querySelectorAll('[data-grip]').forEach(btn => {
            btn.addEventListener('click', () => this.applyGripPosition(btn.dataset.grip))
        })
    }

    toggleDocBar() {
        if (!this.app.docBar) return
        this.app.docBar.classList.toggle('collapsed')
        localStorage.setItem('scoreflow_doc_bar_collapsed', this.app.docBar.classList.contains('collapsed'))
        this._updateGripTooltip()
    }

    _updateGripTooltip() {
        const handle = this.app.docBar?.querySelector('.doc-drag-handle')
        if (!handle) return
        const collapsed = this.app.docBar.classList.contains('collapsed')
        handle.dataset.tooltip = collapsed ? '快速工具' : '標準工具列'
    }

    toggleDocBarHidden(force = null) {
        const el = this.app.docBar
        if (!el) return
        const hidden = force !== null ? force : !el.classList.contains('doc-hidden')
        el.classList.toggle('doc-hidden', hidden)
        localStorage.setItem('scoreflow_doc_bar_hidden', hidden)
    }

    // Grip: tap → toggle collapsed/expanded
    // Hide button (⌄): tap → hide doc bar
    // Show: long press in bottom 15% of viewer (handled in InputManager)
    initGrip() {
        const el = this.app.docBar
        if (!el) return
        const handle = el.querySelector('.doc-drag-handle')
        if (handle) {
            handle.addEventListener('click', () => this.toggleDocBar())
            this._updateGripTooltip() // set initial tooltip
        }

        document.getElementById('btn-hide-docbar')
            ?.addEventListener('click', () => this.toggleDocBarHidden(true))
    }
}
