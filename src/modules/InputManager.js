export class InputManager {
    constructor(app) {
        this.app = app
        this.swipeStartY = 0
        this.swipeStartX = 0
        this.swipeStartTime = 0
        this.scrollTicking = false

        // Gesture state tracking
        this.lastTapTime = 0
        this.tapCount = 0
        this.tapTimer = null
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

        let lastTwoFingerTapTime = 0

        viewer.addEventListener('touchstart', (e) => {
            if (e.target.closest('button, label, .floating-stamp-bar, .floating-doc-bar')) return
            if (e.touches.length === 1) {
                this.swipeStartY = e.touches[0].clientY
                this.swipeStartX = e.touches[0].clientX
                this.swipeStartTime = Date.now()
            } else if (e.touches.length === 2) {
                const now = Date.now()
                if (now - lastTwoFingerTapTime < 350) {
                    // Two-finger double tap detected
                    this.app.toolManager.toggleStampPalette()
                    lastTwoFingerTapTime = 0 // Reset
                } else {
                    lastTwoFingerTapTime = now
                }
            }
        }, { passive: true })

        viewer.addEventListener('touchend', (e) => {
            // Handle Horizontal Swipes
            if (e.changedTouches.length === 1) {
                if (e.target.closest('button, label, .floating-stamp-bar, .floating-doc-bar, #sidebar')) return
                const dy = this.swipeStartY - e.changedTouches[0].clientY
                const dx = this.swipeStartX - e.changedTouches[0].clientX
                const dt = Date.now() - this.swipeStartTime

                // Horizontal Swipe detection (Conventional: Swipe Left -> Next, Swipe Right -> Prev)
                if (dt < 400 && Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    if (dx > 0) {
                        this.app.jump(1) // Swipe Left (Next)
                    } else {
                        this.app.jump(-1) // Swipe Right (Prev)
                    }
                    return // Prevent triggering taps if it was a swipe
                }

                // Vertical Swipe detection (Existing)
                if (dt < 400 && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
                    dy > 0 ? this.app.jump(1) : this.app.jump(-1)
                    return
                }

                // Handle Single Taps for Page Turns (Only in View Mode)
                if (dt < 250 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                    if (e.target.closest('button, label, .floating-stamp-bar, .floating-doc-bar, #sidebar')) return

                    if (this.app.activeStampType === 'view') {
                        const tapY = e.changedTouches[0].clientY
                        if (tapY < window.innerHeight / 2) {
                            this.app.jump(-1) // Top half: Previous
                        } else {
                            this.app.jump(1) // Bottom half: Next
                        }
                    }
                }
            }
        }, { passive: true })

        // Double-tap for stamp palette (Legacy Support for single finger double tap)
        let lastTapTime = 0
        viewer.addEventListener('touchend', (e) => {
            if (e.target.closest('button, label, .floating-stamp-bar, .floating-doc-bar')) return
            const now = Date.now()
            const diff = now - lastTapTime
            if (diff < 300 && diff > 0 && e.changedTouches.length === 1) {
                // Ensure it wasn't a swipe
                const dx = this.swipeStartX - e.changedTouches[0].clientX
                const dy = this.swipeStartY - e.changedTouches[0].clientY
                if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                    e.preventDefault()
                    this.app.toolManager.toggleStampPalette()
                    lastTapTime = 0
                }
            } else {
                lastTapTime = now
            }
        }, { passive: false })

        viewer.addEventListener('dblclick', (e) => {
            if (e.target.closest('button, label, .floating-stamp-bar, .floating-doc-bar')) return
            this.app.toolManager.toggleStampPalette()
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
