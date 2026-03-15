import { GestureManager } from './GestureManager.js'

export class InputManager {
    constructor(app) {
        this.app = app
        this.gestureManager = new GestureManager(app, this)

        // Gesture state tracking
        this.lastTapTime = 0
        this.tapCount = 0
        this.tapTimer = null
        this.longPressTimer = null
        this.isLongPressActive = false

        // Mouse Long Press state
        this.mouseLongPressTimer = null
        this.isMouseLongPressActive = false
        this.mouseDownPos = null
    }

    init() {
        this.initKeyboardListeners()
        this.initGestureListeners()
        this.initMouseListeners()
        this.initScrollListener()
        this.initResizeListener()
        this.updateDividerPositions()

        // Delegated to GestureManager
        this.gestureManager.initBottomSheetGestures()
    }

    initResizeListener() {
        window.addEventListener('resize', () => {
            if (this.app.viewerManager) this.app.viewerManager.updatePageMetrics()
            this.updateDividerPositions()
        })
    }

    /**
     * Centralized check to see if an event occurred within a UI element.
     * This is the "shield" that prevents workspace gestures from firing.
     */
    isEventInUI(e) {
        if (!e || !e.target) return false
        const uiSelector = 'button, label, input, select, .floating-stamp-bar, .floating-doc-bar, .modal-card, .jump-sub-panel, .library-overlay, .sidebar-recent-item, .recent-score-card, .bookmark-item'
        if (e.target.closest(uiSelector)) return true

        // On iOS, touch events can bleed through position:fixed overlays to the
        // underlying viewer. Check the actual touch coordinates to catch this.
        const touch = (e.changedTouches ?? e.touches)?.[0]
        if (touch) {
            const elAtPoint = document.elementFromPoint(touch.clientX, touch.clientY)
            if (elAtPoint?.closest(uiSelector)) return true
        }
        return false
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
                this.handleEscape()
                return
            }

            // 4. UI Toggles
            const toggleMap = {
                'g': () => this.app.jumpManager?.togglePanel(),
                's': () => this.app.toggleSettings(),
                'b': () => this.app.toggleDocBar(),
                't': () => this.app.toolManager.toggleStampPalette(),
                'v': () => this.app.viewPanelManager?.togglePanel(),
                'r': () => this.app.toggleRuler(),
                'o': () => this.app.toggleLibrary(),
                'f': () => this.app.toggleFullscreen(),
                'h': () => this.app.toggleShortcuts(),
                '?': () => this.app.toggleShortcuts()
            }
            if (toggleMap[key]) {
                e.preventDefault()
                toggleMap[key]()
            }

            // 5. Deletion (Grace Period)
            if ((key === 'delete' || key === 'backspace') && this.app._lastGraceObject) {
                e.preventDefault()
                this.app.eraseStampTarget(this.app._lastGraceObject)
                this.app._lastGraceObject = null
                return
            }
        })
    }

    handleEscape() {
        // Order: Shortcuts -> View Panel -> Jump Panel -> Layer Shelf -> Sidebar
        if (this.app.shortcutsModal?.classList.contains('active')) {
            this.app.toggleShortcuts(false)
        } else if (this.app.viewPanelManager?.panel.classList.contains('active')) {
            this.app.viewPanelManager.togglePanel(false)
        } else if (this.app.jumpManager?.panel.classList.contains('active')) {
            this.app.jumpManager.togglePanel(false)
        } else if (this.app.scoreManager?.overlay?.classList.contains('active')) {
            this.app.toggleLibrary(false)
        } else if (this.app.settingsPanelManager?.panel?.classList.contains('active')) {
            this.app.toggleSettings(false)
        }
    }

    initGestureListeners() {
        const viewer = document.getElementById('viewer-container')
        if (!viewer) return

        // Specialized workspace gestures offloaded to GestureManager
        this.gestureManager.initNavigationGestures(viewer)

        // Basic Long Press for Palette
        viewer.addEventListener('touchstart', (e) => {
            if (this.isEventInUI(e) || e.touches.length !== 1) return

            // Reset long press flag immediately - but only for the purpose of clearing state.
            // We only block if the most recent long press was VERY recent (to prevent ghost clicks).
            this.isLongPressActive = false

            const msSinceLongPress = this.lastLongPressAt ? Date.now() - this.lastLongPressAt : Infinity
            if (msSinceLongPress < 500) return

            const startX = e.touches[0].clientX
            const startY = e.touches[0].clientY
            this._lpStartX = startX
            this._lpStartY = startY

            if (this.longPressTimer) clearTimeout(this.longPressTimer)

            this.longPressTimer = setTimeout(() => {
                this.isLongPressActive = true
                this.lastLongPressAt = Date.now()
                // Bottom 15% of screen → toggle doc bar hidden/visible
                if (startY > window.innerHeight * 0.85) {
                    if (navigator.vibrate) navigator.vibrate(12)
                    this.app.docBarManager?.toggleDocBarHidden()
                } else {
                    // Only OPEN if currently closed. Do NOT close via long press.
                    if (!this.app.toolManager?.isStampPaletteOpen) {
                        if (navigator.vibrate) navigator.vibrate(12)
                        this.app.toolManager.toggleStampPalette(startX, startY)
                    }
                }
            }, 500)
        }, { passive: true })

        viewer.addEventListener('touchmove', (e) => {
            if (!this.longPressTimer) return
            const touch = e.touches[0]
            const dx = touch.clientX - this._lpStartX
            const dy = touch.clientY - this._lpStartY
            if (Math.sqrt(dx * dx + dy * dy) > 10) {
                clearTimeout(this.longPressTimer)
                this.longPressTimer = null
            }
        }, { passive: true })

        // Cancel long press if the touch ends before 500ms (i.e. single tap, not a hold)
        viewer.addEventListener('touchend', () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer)
                this.longPressTimer = null
            }
        }, { passive: true })

        viewer.addEventListener('touchcancel', () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer)
                this.longPressTimer = null
            }
        }, { passive: true })
    }

    initMouseListeners() {
        const viewer = document.getElementById('viewer-container')
        if (!viewer) return

        viewer.addEventListener('mousedown', (e) => {
            if (this.isEventInUI(e) || e.button !== 0) return

            this.isMouseLongPressActive = false
            this.mouseDownPos = { x: e.clientX, y: e.clientY }

            if (this.mouseLongPressTimer) clearTimeout(this.mouseLongPressTimer)
            this.mouseLongPressTimer = setTimeout(() => {
                this.isMouseLongPressActive = true
                // Bottom 15% of screen → toggle doc bar hidden/visible
                if (e.clientY > window.innerHeight * 0.85) {
                    this.app.docBarManager?.toggleDocBarHidden()
                } else {
                    // Only OPEN if currently closed. Do NOT close via long press.
                    if (!this.app.toolManager?.isStampPaletteOpen) {
                        this.app.toolManager.toggleStampPalette(e.clientX, e.clientY)
                    }
                }
            }, 500)
        })

        viewer.addEventListener('mousemove', (e) => {
            if (!this.mouseDownPos || this.isMouseLongPressActive) return
            const dx = e.clientX - this.mouseDownPos.x
            const dy = e.clientY - this.mouseDownPos.y
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                if (this.mouseLongPressTimer) {
                    clearTimeout(this.mouseLongPressTimer)
                    this.mouseLongPressTimer = null
                }
            }
        })

        viewer.addEventListener('mouseup', (e) => {
            if (this.mouseLongPressTimer) {
                clearTimeout(this.mouseLongPressTimer)
                this.mouseLongPressTimer = null
            }
            if (this.isMouseLongPressActive && this.app.activeStampType === 'view') {
                e.preventDefault()
            }
            this.mouseDownPos = null
        })

        viewer.addEventListener('click', (e) => {
            // Suppress iOS synthetic click that fires after touchend zone tap
            if (this._suppressNextClick) {
                this._suppressNextClick = false
                return
            }

            // Ignore if this is part of a long press OR if we just finished panning
            if (this.isMouseLongPressActive || this.app._wasPanning) {
                this.isMouseLongPressActive = false
                this.app._wasPanning = false // Consumption
                return
            }

            // Only trigger in view mode and if not clicking on UI
            if (this.app.activeStampType !== 'view' || this.isEventInUI(e)) return

            this.gestureManager.handleZoneTap(e.clientX, e.clientY)
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
                    this.updateDividerPositions()
                    this.scrollTicking = false
                })
                this.scrollTicking = true
            }
        }, { passive: true })
    }

    updateDividerPositions() {
        const hDivider = document.getElementById('nav-divider-h')
        const vDivider = document.getElementById('nav-divider-v')
        if (!hDivider || !vDivider) return

        const viewer = document.getElementById('viewer-container')
        const firstPage = viewer.querySelector('.page-container')

        if (firstPage) {
            const rect = firstPage.getBoundingClientRect()
            const vh = window.innerHeight
            const intersectY = vh * 0.35
            const intersectX = rect.left + rect.width * 0.40
            const hWidth = rect.width * 0.20

            hDivider.style.top = `${intersectY}px`
            hDivider.style.left = `${intersectX - hWidth / 2}px`
            hDivider.style.width = `${hWidth}px`

            const vHeight = vh * 0.20
            vDivider.style.top = `${intersectY}px`
            vDivider.style.left = `${intersectX}px`
            vDivider.style.height = `${vHeight}px`
        }
    }

    flashDividers() {
        if (!document.body.classList.contains('show-nav-dividers')) return
        const hDivider = document.getElementById('nav-divider-h')
        const vDivider = document.getElementById('nav-divider-v')
        if (!hDivider || !vDivider) return

        if (this._flashTimeout) clearTimeout(this._flashTimeout)
        hDivider.classList.add('active')
        vDivider.classList.add('active')

        this._flashTimeout = setTimeout(() => {
            hDivider.classList.remove('active')
            vDivider.classList.remove('active')
            this._flashTimeout = null
        }, 500)
    }
}
