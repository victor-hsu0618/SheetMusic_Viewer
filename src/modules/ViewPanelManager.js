export class ViewPanelManager {
    constructor(app) {
        this.app = app
        this.panel = null
        this.zoomDisplay = null
        this.offsetSlider = null
        this.offsetValue = null
    }

    init() {
        this.panel = document.getElementById('view-control-panel')
        this.zoomDisplay = document.getElementById('view-panel-zoom-level')
        this.offsetSlider = document.getElementById('view-jump-offset')
        this.offsetValue = document.getElementById('view-jump-offset-value')

        if (!this.panel) return

        this.initEventListeners()
        this.initDraggable()
        this.updateZoomDisplay()
    }

    initEventListeners() {
        const btnToggle = document.getElementById('btn-view-panel-toggle')
        if (btnToggle) {
            btnToggle.addEventListener('click', () => this.togglePanel())
        }

        const btnClose = document.getElementById('btn-close-view-panel')
        if (btnClose) {
            btnClose.addEventListener('click', (e) => {
                e.stopPropagation()
                this.togglePanel(false)
            })
        }

        // Precision Controls
        if (this.offsetSlider) {
            this.offsetSlider.addEventListener('input', (e) => {
                const val = parseInt(e.target.value)
                if (this.offsetValue) this.offsetValue.textContent = `${val}px`
                if (this.app.rulerManager) {
                    this.app.rulerManager.jumpOffsetPx = val
                    this.app.rulerManager.updateJumpLinePosition()
                }
            })
        }

        // View Actions
        const map = {
            'view-zoom-in': () => this.app.changeZoom(0.1),
            'view-zoom-out': () => this.app.changeZoom(-0.1),
            'view-fit-width': () => this.app.fitToWidth(),
            'view-fit-height': () => this.app.fitToHeight(),
            'view-fullscreen': () => this.app.docActionManager.toggleFullscreen(),
            'view-ruler-toggle': () => this.app.rulerManager.toggleRuler()
        }

        Object.entries(map).forEach(([id, fn]) => {
            const el = document.getElementById(id)
            if (el) {
                el.addEventListener('click', (e) => {
                    e.stopPropagation()
                    fn()
                })
            }
        })

        // Close on outside click (Touch)
        document.addEventListener('touchstart', (e) => {
            if (this.panel && this.panel.classList.contains('active') &&
                !this.panel.contains(e.target) &&
                !document.getElementById('btn-view-panel-toggle').contains(e.target)) {
                this.togglePanel(false)
            }
        }, { passive: true })
    }

    updateZoomDisplay() {
        if (this.zoomDisplay) {
            this.zoomDisplay.textContent = `${Math.round(this.app.scale * 100)}%`
        }
    }

    togglePanel(force = null) {
        if (!this.panel) return
        const active = force !== null ? force : !this.panel.classList.contains('active')
        this.panel.classList.toggle('active', active)

        const btnToggle = document.getElementById('btn-view-panel-toggle')
        if (btnToggle) btnToggle.classList.toggle('active', active)

        if (active) {
            // Reset position to center whenever it's opened
            this.panel.style.top = ''
            this.panel.style.left = ''
            this.panel.style.transform = ''

            this.updateZoomDisplay()
            if (this.offsetSlider && this.app.rulerManager) {
                this.offsetSlider.value = this.app.rulerManager.jumpOffsetPx
                if (this.offsetValue) this.offsetValue.textContent = `${this.app.rulerManager.jumpOffsetPx}px`
            }
        }
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

        handle.addEventListener('touchstart', (e) => start(e), { passive: false })
        document.addEventListener('touchmove', move, { passive: false })
        document.addEventListener('touchend', end)
    }
}
