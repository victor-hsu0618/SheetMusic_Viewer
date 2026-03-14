/**
 * GestureManager handles specialized touch and mouse gestures 
 * (Swipe-to-navigate, Tap Zones, Long-Press Palette, Bottom Sheet swipes)
 * Extracted from InputManager to maintain modularity (500-line limit).
 */
export class GestureManager {
    constructor(app, inputManager) {
        this.app = app
        this.inputManager = inputManager
        
        // Internal state
        this._startY = 0
        this._startX = 0
        this._startTime = 0
        this._lastMobilePanelId = null
        this._potentialSwipeUp = false
        this._flashTimeout = null
    }

    /**
     * Mobile Bottom Sheet Gestures: Swipe Down to Dismiss / Swipe Up to Reopen
     * Uses an interception pattern ({capture: true}) to keep manager code clean.
     */
    initBottomSheetGestures() {
        const panels = document.querySelectorAll('.jump-sub-panel.calculator-style')
        let activePanel = null
        let isDraggingGesture = false

        panels.forEach(panel => {
            const handle = panel.querySelector('.jump-drag-handle')
            if (!handle) return

            handle.addEventListener('touchstart', (e) => {
                if (window.innerWidth > 600) return 
                e.stopImmediatePropagation() // Kill manager handles
                this._startY = e.touches[0].clientY
                activePanel = panel
                isDraggingGesture = true
                panel.style.transition = 'none'
                this._lastMobilePanelId = panel.id
            }, { capture: true, passive: false })
        })

        document.addEventListener('touchmove', (e) => {
            if (!isDraggingGesture || !activePanel) return
            const currentY = e.touches[0].clientY
            const diff = currentY - this._startY
            if (diff > 0) {
                if (e.cancelable) e.preventDefault()
                activePanel.style.transform = `translate3d(0, ${diff}px, 0)`
            }
        }, { passive: false })

        document.addEventListener('touchend', (e) => {
            if (!isDraggingGesture || !activePanel) return
            isDraggingGesture = false
            const diff = e.changedTouches[0].clientY - this._startY
            activePanel.style.transition = '' 
            if (diff > 120) {
                this.executePanelToggle(activePanel.id, false)
            } else {
                activePanel.style.transform = ''
            }
            activePanel = null
        }, { passive: true })

        // Swipe-up-to-open removed: conflicts with normal page scrolling.
    }

    executePanelToggle(panelId, forceState) {
        const managerMap = {
            'view-control-panel': 'viewPanelManager',
            'jump-panel': 'jumpManager',
            'settings-panel': 'settingsPanelManager',
            'score-detail-panel': 'scoreDetailManager'
        }
        const managerName = managerMap[panelId]
        const manager = this.app[managerName]
        if (manager) {
            if (typeof manager.toggle === 'function') manager.toggle(forceState)
            else if (typeof manager.togglePanel === 'function') manager.togglePanel(forceState)
        }
    }

    /**
     * Workspace Navigation Gestures (Tap-to-turn, Swipe-to-turn)
     */
    initNavigationGestures(viewer) {
        viewer.addEventListener('touchstart', (e) => {
            if (this.inputManager.isEventInUI(e)) return

            // Reset long press flag for safety, but check timing for blocking ghost clicks
            this.inputManager.isLongPressActive = false

            const msSinceLongPress = this.inputManager.lastLongPressAt
                ? Date.now() - this.inputManager.lastLongPressAt
                : Infinity
            if (msSinceLongPress < 500) return

            if (e.touches.length === 1) {
                this._startX = e.touches[0].clientX
                this._startY = e.touches[0].clientY
                this._startTime = Date.now()
            }
        }, { passive: true })

        viewer.addEventListener('touchend', (e) => {
            if (this.inputManager.isEventInUI(e)) return

            // Block navigation if a long press fired (boolean) or fired very recently (timestamp guard)
            const msSinceLongPress = this.inputManager.lastLongPressAt
                ? Date.now() - this.inputManager.lastLongPressAt
                : Infinity
            if (this.inputManager.isLongPressActive || msSinceLongPress < 600) {
                this.inputManager.isLongPressActive = false
                return
            }

            if (e.changedTouches.length === 1) {
                const dy = this._startY - e.changedTouches[0].clientY
                const dx = this._startX - e.changedTouches[0].clientX
                const dt = Date.now() - this._startTime

                // Page Swipes
                if (dt < 400 && Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    dx > 0 ? this.app.jump(1) : this.app.jump(-1)
                    return
                }

                // Zone Tapping
                if (this.app.activeStampType === 'view' && dt < 300 && Math.abs(dx) < 30 && Math.abs(dy) < 30) {
                    this.handleZoneTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
                }
            }
        }, { passive: false })
    }

    handleZoneTap(tapX, tapY) {
        const vh = window.innerHeight
        const viewer = document.getElementById('viewer-container')
        const firstPage = viewer.querySelector('.page-container')
        
        if (firstPage) {
            const rect = firstPage.getBoundingClientRect()
            const relX = tapX - rect.left
            let success = true
            if (tapY < vh * 0.35) {
                success = this.app.jump(-1)
                this.showZoneIndicator('up', tapX, tapY, !success)
            } else if (relX < rect.width * 0.40) {
                success = this.app.jump(-1)
                this.showZoneIndicator('left', tapX, tapY, !success)
            } else {
                success = this.app.jump(1)
                this.showZoneIndicator('right', tapX, tapY, !success)
            }
            this.inputManager.flashDividers()
        }
    }

    showZoneIndicator(type, x, y, isLimit = false) {
        const indicator = document.createElement('div')
        indicator.className = `tap-zone-indicator ${type}${isLimit ? ' limit' : ''}`
        indicator.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>'
        indicator.style.left = `${x - 20}px`
        indicator.style.top = `${y - 20}px`
        document.body.appendChild(indicator)
        setTimeout(() => indicator.classList.add('fade-out'), 50)
        setTimeout(() => indicator.remove(), 600)
    }
}
