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

    /**
     * Centralized check to see if an event occurred within a UI element.
     * This is the "shield" that prevents workspace gestures from firing.
     */
    isEventInUI(e) {
        if (!e || !e.target) return false
        const uiSelector = 'button, label, input, select, .floating-stamp-bar, .floating-doc-bar, .layer-shelf, .modal-card, #sidebar, .toolbar-popover, .sidebar-recent-item, .recent-score-card'
        return !!e.target.closest(uiSelector)
    }

    initKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
            // ... rest of keyboard listeners
        })
    }

    initGestureListeners() {
        const viewer = document.getElementById('viewer-container')
        if (!viewer) return

        let lastTwoFingerTapTime = 0
        let lastSingleTapTime = 0

        // Handle START
        viewer.addEventListener('touchstart', (e) => {
            if (this.isEventInUI(e)) return

            if (e.touches.length === 1) {
                this.swipeStartY = e.touches[0].clientY
                this.swipeStartX = e.touches[0].clientX
                this.swipeStartTime = Date.now()
            } else if (e.touches.length === 2) {
                const now = Date.now()
                if (now - lastTwoFingerTapTime < 350) {
                    this.app.toolManager.toggleStampPalette(e.touches[0].clientX, e.touches[0].clientY)
                    lastTwoFingerTapTime = 0
                } else {
                    lastTwoFingerTapTime = now
                }
            }
        }, { passive: true })

        // Unified Handle END (Gesture logic only)
        viewer.addEventListener('touchend', (e) => {
            if (this.isEventInUI(e)) return

            if (e.changedTouches.length === 1) {
                const dy = this.swipeStartY - e.changedTouches[0].clientY
                const dx = this.swipeStartX - e.changedTouches[0].clientX
                const dt = Date.now() - this.swipeStartTime
                const now = Date.now()

                // 1. Double Tap Detection (Single finger)
                const doubleTapDiff = now - lastSingleTapTime
                if (doubleTapDiff < 300 && doubleTapDiff > 0 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                    e.preventDefault()
                    // Pass coordinates for smart positioning
                    this.app.toolManager.toggleStampPalette(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
                    lastSingleTapTime = 0
                    return
                }
                lastSingleTapTime = now

                // 2. Horizontal Swipe (Page Turns)
                if (dt < 400 && Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    dx > 0 ? this.app.jump(1) : this.app.jump(-1)
                    return
                }

                // 3. Vertical Swipe (Strategic Jump)
                if (dt < 400 && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
                    dy > 0 ? this.app.jump(1) : this.app.jump(-1)
                    return
                }

                // 4. Single Tap (Only if not part of a potential double tap - handled by timeout or view mode check)
                if (dt < 250 && Math.abs(dx) < 10 && Math.abs(dy) < 10) {
                    if (this.app.activeStampType === 'view') {
                        const tapY = e.changedTouches[0].clientY
                        tapY < window.innerHeight / 2 ? this.app.jump(-1) : this.app.jump(1)
                    }
                }
            }
        }, { passive: false })

        // Desktop fallback
        viewer.addEventListener('dblclick', (e) => {
            if (this.isEventInUI(e)) return
            this.app.toolManager.toggleStampPalette(e.clientX, e.clientY)
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
