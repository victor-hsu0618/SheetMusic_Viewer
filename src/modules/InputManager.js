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
            const isInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable
            if (isInput) return

            const key = e.key.toLowerCase()
            const code = e.code

            // 1. Zoom Control (Meta+ / Ctrl+ / +/-)
            if (e.metaKey || e.ctrlKey) {
                if (key === '=' || key === '+' || code === 'Equal' || code === 'NumpadAdd') {
                    e.preventDefault()
                    this.app.changeZoom(0.1)
                    return
                }
                if (key === '-' || code === 'Minus' || code === 'NumpadSubtract') {
                    e.preventDefault()
                    this.app.changeZoom(-0.1)
                    return
                }
                // Prevent trigger UI toggles when Cmd/Ctrl is held (e.g., Cmd+S)
                if (['s', 'b', 't', 'v', 'o', 'f', 'r'].includes(key)) return
            }

            // 2. Navigation
            if (key === ' ' || key === 'j' || code === 'ArrowDown' || code === 'PageDown') {
                e.preventDefault()
                this.app.jump(1)
                return
            }
            if (key === 'k' || (e.shiftKey && key === ' ') || code === 'ArrowUp' || code === 'PageUp') {
                e.preventDefault()
                this.app.jump(-1)
                return
            }

            // 3. Global Esc Handling (Cascading Close)
            if (key === 'escape' || code === 'Escape') {
                e.preventDefault()
                // Order: Shortcuts -> View Panel -> Jump Panel -> Layer Shelf -> Sidebar
                if (this.app.shortcutsModal && this.app.shortcutsModal.classList.contains('active')) {
                    this.app.toggleShortcuts(false)
                } else if (this.app.viewPanelManager && this.app.viewPanelManager.panel.classList.contains('active')) {
                    this.app.viewPanelManager.togglePanel(false)
                } else if (this.app.jumpManager && this.app.jumpManager.panel.classList.contains('active')) {
                    this.app.jumpManager.togglePanel(false)
                } else if (this.app.layerShelf && this.app.layerShelf.classList.contains('active')) {
                    this.app.layerShelf.classList.remove('active')
                } else if (this.app.sidebar && this.app.sidebar.classList.contains('open')) {
                    this.app.sidebar.classList.remove('open')
                }
                return
            }

            // 4. UI Toggles
            switch (key) {
                case 'g': // Page Jump (Calculator)
                    e.preventDefault()
                    if (this.app.jumpManager) this.app.jumpManager.togglePanel()
                    break
                case 's': // Sidebar
                    e.preventDefault()
                    this.app.toggleSidebar()
                    break
                case 'b': // Dock Expansion
                    e.preventDefault()
                    this.app.toggleDocBar()
                    break
                case 't': // Stamp Palette
                    e.preventDefault()
                    this.app.toolManager.toggleStampPalette()
                    break
                case 'v': // View Inspector (V) vs Notation Layers (Shift+V)
                    e.preventDefault()
                    if (e.shiftKey) {
                        if (this.app.layerShelf) {
                            this.app.layerShelf.classList.toggle('active')
                            if (this.app.layerShelf.classList.contains('active')) this.app.renderLayerUI()
                        }
                    } else {
                        if (this.app.viewPanelManager) this.app.viewPanelManager.togglePanel()
                    }
                    break
                case 'r': // Ruler
                    e.preventDefault()
                    this.app.toggleRuler()
                    break
                case 'o': // Open PDF
                    e.preventDefault()
                    this.app.openPdfFilePicker()
                    break
                case 'f': // Fullscreen
                    e.preventDefault()
                    this.app.toggleFullscreen()
                    break
                case 'h':
                case '?': // Help
                    e.preventDefault()
                    this.app.toggleShortcuts()
                    break
            }
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
                // Clear any existing long press timer first
                if (this.longPressTimer) clearTimeout(this.longPressTimer)

                this.swipeStartY = e.touches[0].clientY
                this.swipeStartX = e.touches[0].clientX
                this.swipeStartTime = Date.now()

                // Long Press (0.5s) to toggle palette reliably
                this.isLongPressActive = false
                if (this.longPressTimer) clearTimeout(this.longPressTimer)

                this.longPressTimer = setTimeout(() => {
                    this.isLongPressActive = true
                    // Vibrate for feedback
                    if (navigator.vibrate) navigator.vibrate(12)

                    // Call toggle with latest coordinates
                    console.log('[InputManager] Long Press Triggered')
                    this.app.toolManager.toggleStampPalette(this.swipeStartX, this.swipeStartY)
                    lastSingleTapTime = 0
                }, 500)
            } else if (e.touches.length === 2) {
                if (this.longPressTimer) clearTimeout(this.longPressTimer)
                const x = (e.touches[0].clientX + e.touches[1].clientX) / 2
                const y = (e.touches[0].clientY + e.touches[1].clientY) / 2
                this.app.toolManager.toggleStampPalette(x, y)
                lastSingleTapTime = 0
            }
        }, { passive: false })

        // Handle MOVE (to cancel long press if moving too much)
        viewer.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                const dx = e.touches[0].clientX - this.swipeStartX
                const dy = e.touches[0].clientY - this.swipeStartY
                // Highly forgiving threshold (45px) for iPad jitter
                if (Math.abs(dx) > 45 || Math.abs(dy) > 45) {
                    if (this.longPressTimer) {
                        clearTimeout(this.longPressTimer)
                        this.longPressTimer = null
                    }
                }
            } else {
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer)
                    this.longPressTimer = null
                }
            }
        }, { passive: false })

        // Unified Handle END (Gesture logic only)
        viewer.addEventListener('touchend', (e) => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer)
                this.longPressTimer = null
            }

            // If we just handled a long press, stop here to avoid accidental page turn
            if (this.isLongPressActive) {
                this.isLongPressActive = false
                // Prevent ghost taps/turns
                e.preventDefault()
                return
            }

            if (this.isEventInUI(e)) return

            if (e.changedTouches.length === 1) {
                const dy = this.swipeStartY - e.changedTouches[0].clientY
                const dx = this.swipeStartX - e.changedTouches[0].clientX
                const dt = Date.now() - this.swipeStartTime
                const now = Date.now()

                // 1. Double Tap Detection (Single finger) - Relaxed for iPad (300ms -> 350ms, 10px -> 35px)
                const doubleTapDiff = now - lastSingleTapTime
                if (doubleTapDiff < 350 && doubleTapDiff > 0 && Math.abs(dx) < 35 && Math.abs(dy) < 35) {
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

                // 4. Single Tap (Zone Tapping)
                if (dt < 300 && Math.abs(dx) < 30 && Math.abs(dy) < 30) {
                    if (this.app.activeStampType === 'view') {
                        const tapX = e.changedTouches[0].clientX
                        const tapY = e.changedTouches[0].clientY
                        const vw = window.innerWidth

                        // Define Zones: Left 25% (Prev), Right 25% (Next)
                        if (tapX < vw * 0.25) {
                            this.app.jump(-1)
                            this.showZoneIndicator('prev', tapX, tapY)
                        } else if (tapX > vw * 0.75) {
                            this.app.jump(1)
                            this.showZoneIndicator('next', tapX, tapY)
                        }
                    }
                }
                // No more aggressive preventDefault/return here to allow native momentum to finish
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
                    if (this.app.jumpManager) this.app.jumpManager.updateDisplay()
                    this.scrollTicking = false
                })
                this.scrollTicking = true
            }
        }, { passive: true })
    }

    showZoneIndicator(type, x, y) {
        const indicator = document.createElement('div')
        indicator.className = 'tap-zone-indicator'
        indicator.innerHTML = type === 'next'
            ? '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>'
            : '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>'

        indicator.style.left = `${x - 20}px`
        indicator.style.top = `${y - 20}px`
        document.body.appendChild(indicator)

        setTimeout(() => indicator.classList.add('fade-out'), 50)
        setTimeout(() => indicator.remove(), 600)
    }
}
