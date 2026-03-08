export class InputManager {
    constructor(app) {
        this.app = app
        this.swipeStartY = 0
        this.swipeStartX = 0
        this.swipeStartTime = 0
        this.scrollTicking = false
    }

    init() {
        this.initKeyboardListeners()
        this.initGestureListeners()
        this.initScrollListener()
    }

    initKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return

            if (this.app.shortcutsModal && this.app.shortcutsModal.classList.contains('active')) {
                if (e.key !== '?' && e.key.toLowerCase() !== 'h') {
                    this.app.toggleShortcuts(false)
                    return
                }
            }

            if (e.key === '?' || e.key.toLowerCase() === 'h') this.app.toggleShortcuts()
            if (e.key.toLowerCase() === 's') this.app.sidebar.classList.toggle('open')
            if (e.key.toLowerCase() === 'v') {
                this.app.activeStampType = this.app.activeStampType === 'select' ? 'view' : 'select'
                this.app.updateActiveTools()
            }
            if (e.key.toLowerCase() === 'b') this.app.docBarManager?.toggleDocBar()
            if (e.key.toLowerCase() === 'e') {
                this.app.activeStampType = this.app.activeStampType === 'eraser' ? 'view' : 'eraser'
                this.app.updateActiveTools()
            }
            if (e.key.toLowerCase() === 'a') {
                this.app.activeStampType = this.app.activeStampType === 'anchor' ? 'view' : 'anchor'
                this.app.updateActiveTools()
            }
            if (e.key.toLowerCase() === 'r') this.app.toggleRuler()
            if (e.key.toLowerCase() === 'g') this.app.toggleFullscreen()

            if (e.key === 'Escape') {
                this.app.toggleShortcuts(false)
                this.app.sidebar.classList.remove('open')
                this.app.activeStampType = 'view'
                this.app.updateActiveTools()
            }

            if (e.key === '=' || e.key === '+' || e.key === 'Add') this.app.changeZoom(0.1)
            if (e.key === '-' || e.key === '_' || e.key === 'Subtract') this.app.changeZoom(-0.1)
            if (e.key.toLowerCase() === 'w') this.app.fitToWidth()
            if (e.key.toLowerCase() === 'f') this.app.fitToHeight()

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (this.app.lastFocusedStamp) {
                    const idx = this.app.stamps.indexOf(this.app.lastFocusedStamp)
                    if (idx !== -1) {
                        const page = this.app.lastFocusedStamp.page
                        this.app.stamps.splice(idx, 1)
                        this.app.saveToStorage()
                        this.app.redrawStamps(page)
                        this.app.lastFocusedStamp = null
                    }
                }
            }

            let isForward = false, isBackward = false
            const turnerMode = document.getElementById('turner-mode-select')?.value || 'default'

            switch (turnerMode) {
                case 'pgupdn':
                    if (e.key === 'PageDown') isForward = true
                    if (e.key === 'PageUp') isBackward = true
                    break
                case 'arrows':
                    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') isForward = true
                    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') isBackward = true
                    break
                default:
                    if (e.key === ' ' || e.key.toLowerCase() === 'j' || e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
                        if (e.shiftKey && e.key === ' ') isBackward = true; else isForward = true
                    }
                    if (e.key.toLowerCase() === 'k' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') isBackward = true
                    break
            }

            if (isForward) { e.preventDefault(); this.app.jump(1) }
            else if (isBackward) { e.preventDefault(); this.app.jump(-1) }
        })
    }

    initGestureListeners() {
        const viewer = document.getElementById('viewer-container')
        if (!viewer) return

        viewer.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return
            this.swipeStartY = e.touches[0].clientY
            this.swipeStartX = e.touches[0].clientX
            this.swipeStartTime = Date.now()
        }, { passive: true })

        viewer.addEventListener('touchend', (e) => {
            if (e.changedTouches.length !== 1) return
            const dy = this.swipeStartY - e.changedTouches[0].clientY
            const dx = this.swipeStartX - e.changedTouches[0].clientX
            const dt = Date.now() - this.swipeStartTime
            if (dt < 400 && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
                dy > 0 ? this.app.jump(1) : this.app.jump(-1)
            }
        }, { passive: true })

        // Double-tap for stamp palette
        let lastTapTime = 0
        viewer.addEventListener('touchend', (e) => {
            if (e.target.closest('button, .floating-stamp-bar, .floating-doc-bar')) return
            const now = Date.now()
            const diff = now - lastTapTime
            if (diff < 300 && diff > 0) {
                e.preventDefault()
                this.app.toggleStampPalette()
                lastTapTime = 0
            } else {
                lastTapTime = now
            }
        }, { passive: false })

        viewer.addEventListener('dblclick', (e) => {
            if (e.target.closest('button, .floating-stamp-bar, .floating-doc-bar')) return
            this.app.toggleStampPalette()
        })
    }

    initScrollListener() {
        const viewer = document.getElementById('viewer-container')
        if (!viewer) return

        viewer.addEventListener('scroll', () => {
            if (!this.scrollTicking) {
                window.requestAnimationFrame(() => {
                    this.app.updateRulerMarks()
                    this.app.updateRulerClip()
                    this.app.computeNextTarget()
                    if (this.app.pdf) {
                        for (let i = 1; i <= this.app.pdf.numPages; i++) {
                            const pageElem = document.querySelector(`.page-container[data-page="${i}"]`)
                            if (pageElem) {
                                const rect = pageElem.getBoundingClientRect()
                                if (rect.bottom > 0 && rect.top < window.innerHeight) {
                                    this.app.redrawStamps(i)
                                }
                            }
                        }
                    }
                    this.scrollTicking = false
                })
                this.scrollTicking = true
            }
        }, { passive: true })
    }
}
