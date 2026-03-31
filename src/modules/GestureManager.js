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
        
        // Pinch & Pan State
        this._initialDistance = 0
        this._initialScale = 1
        this._isPinching = false
        this._pinchCenterX = 0
        this._pinchCenterY = 0
        
        this._lastPinchX = 0
        this._lastPinchY = 0
        this._suppressSingleTouchUntil = 0
        this._lastZoneTapAt = 0
        
        this._viewerEl = null
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

    initNavigationGestures(viewerContainer) {
        this._viewerEl = document.getElementById('pdf-viewer')
        
        viewerContainer.addEventListener('touchstart', (e) => {
            // Update Body Class for CSS touch-action lock
            const isViewMode = this.app.activeStampType === 'view'
            document.body.classList.toggle('view-mode-active', isViewMode)

            if (this.inputManager.isEventInUI(e)) return
            if (this.app.viewerManager?.isApplyingZoom) return
            this.inputManager.isLongPressActive = false

            if (e.touches.length === 1 && Date.now() < this._suppressSingleTouchUntil) {
                if (e.cancelable) e.preventDefault()
                return
            }

            if (e.touches.length === 1) {
                this._startX = e.touches[0].clientX
                this._startY = e.touches[0].clientY
                this._startTime = Date.now()
            } else if (e.touches.length === 2) {
                // START PINCH/PAN (Available in all modes)
                this._isPinching = true
                if (this.app.isIOS) this.app.isPinching = true; // Only suppress updates on mobile
                
                this._initialDistance = this.getDistance(e.touches[0], e.touches[1])
                this._initialScale = this.app.viewerManager?.scale || 1
                this._isZoomActive = false 
                this._gestureLocked = null // 'pan' or 'zoom'
                
                this._lastPinchX = (e.touches[0].clientX + e.touches[1].clientX) / 2
                this._lastPinchY = (e.touches[0].clientY + e.touches[1].clientY) / 2
                this._pinchStartCentroid = { x: this._lastPinchX, y: this._lastPinchY }
                
                // Prioritize GPU resources & disable transitions
                // Set transform-origin to pinch centroid so scale doesn't shift content
                if (this._viewerEl) {
                    const rect = this._viewerEl.getBoundingClientRect()
                    const originX = this._pinchStartCentroid.x - rect.left
                    const originY = this._pinchStartCentroid.y - rect.top
                    this._viewerEl.style.transformOrigin = `${originX}px ${originY}px`
                    this._viewerEl.style.willChange = 'transform'
                    this._viewerEl.style.transition = 'none'
                }
            }
        }, { passive: true })

        // SUPPORT MAC TRACKPAD PINCH-TO-ZOOM (Wheel with Ctrl key)
        viewerContainer.addEventListener('wheel', (e) => {
            if (e.ctrlKey && this._viewerEl) {
                e.preventDefault()
                // Capture the zoom magnitude from wheel delta
                const delta = -e.deltaY * 0.01
                this.app.viewerManager?.changeZoom(delta * 0.2) // Dampened for Mac
            }
        }, { passive: false })

        viewerContainer.addEventListener('touchmove', (e) => {
            if (this._isPinching && e.touches.length === 2) {
                if (e.cancelable) e.preventDefault()
                
                const currentX = (e.touches[0].clientX + e.touches[1].clientX) / 2
                const currentY = (e.touches[0].clientY + e.touches[1].clientY) / 2
                
                // 1. GESTURE LOCKING LOGIC
                const currentDist = this.getDistance(e.touches[0], e.touches[1])
                const distDelta = Math.abs(currentDist - this._initialDistance)
                const panDelta = Math.sqrt(Math.pow(currentX - this._pinchStartCentroid.x, 2) + Math.pow(currentY - this._pinchStartCentroid.y, 2))

                if (!this._gestureLocked) {
                    // Give priority to panning (two-finger drag) if movement is detected but fingers stay at similar distance
                    if (panDelta > 15 && distDelta < 25) {
                        this._gestureLocked = 'pan' 
                    } else if (distDelta > 35) {
                        this._gestureLocked = 'zoom' 
                        this._isZoomActive = true
                    }
                }

                // 2. PINCH LOGIC (Visual Scale) - Only runs if NOT locked to pan
                if (this._gestureLocked !== 'pan') {
                    const rawRatio = currentDist / Math.max(10, this._initialDistance)
                    // Damping (0.85) remains direct, but activation is now less twitchy
                    const ratio = 1 + (rawRatio - 1) * 0.85

                    // Activation threshold: 0.06 (6% change) to distinguish from accidental drag-drifts
                    if (!this._isZoomActive && Math.abs(ratio - 1) > 0.06) {
                        this._isZoomActive = true
                        this._gestureLocked = 'zoom'
                    }

                    if (this._isZoomActive && this._viewerEl) {
                        this._viewerEl.style.transform = `scale(${ratio})`
                    }
                }

                // 3. PAN LOGIC (Manual Scroll) — only when explicitly locked to pan
                if (this._gestureLocked === 'pan') {
                    const dy = this._lastPinchY - currentY
                    viewerContainer.scrollTop += dy
                }

                this._lastPinchX = currentX
                this._lastPinchY = currentY
                return
            }

            // SINGLE-FINGER DRAG PREVENTION
            if (e.touches.length === 1 && !this.app.isMac) {
                if (Date.now() < this._suppressSingleTouchUntil) {
                    if (e.cancelable) e.preventDefault()
                    return
                }
                const dx = Math.abs(e.touches[0].clientX - this._startX)
                const dy = Math.abs(e.touches[0].clientY - this._startY)
                if (dx > 5 || dy > 5) { 
                    if (e.cancelable) e.preventDefault()
                }
            }
        }, { passive: false })

        viewerContainer.addEventListener('touchend', (e) => {
            if (this._isPinching) {
                const endedPanGesture = this._gestureLocked === 'pan'
                this._isPinching = false
                this.app.isPinching = false
                this.app._wasPanning = endedPanGesture

                const ratioStr = this._viewerEl?.style.transform || "";
                const match = ratioStr.match(/scale\(([^)]+)\)/);
                const ratio = match ? parseFloat(match[1]) : 1;

                // Reset visual transform immediately
                if (this._viewerEl) {
                    this._viewerEl.style.transform = ''
                    this._viewerEl.style.transformOrigin = ''
                    this._viewerEl.style.willChange = ''
                    this._viewerEl.style.transition = 'transform 0.15s ease-out' 
                }

                // After a two-finger pan on iPad, briefly block residual single-finger
                // scrolling so lift-off does not fall through to native vertical scroll.
                if (endedPanGesture) {
                    this._suppressSingleTouchUntil = Date.now() + 180
                    this._gestureLocked = null
                    if (e.cancelable) e.preventDefault()
                    return
                }

                // Apply final scale to PDF.js
                if (e.touches.length < 2) {
                    const newScale = this._initialScale * ratio
                    const delta = newScale - this._initialScale
                    
                    // Final threshold: 0.01 (1% change) to support fine adjustments
                    if (Math.abs(delta) > 0.01) {
                        this.app.viewerManager?.changeZoom(delta, ratio)
                    }
                }
                this._gestureLocked = null
                return
            }

            if (this.inputManager.isEventInUI(e)) return
            if (this.app.viewerManager?.isApplyingZoom) return

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
                if (this.app.activeStampType === 'view' && dt < 400 && Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    dx > 0 ? this.app.jump(1) : this.app.jump(-1)
                    return
                }

                // Zone Tapping
                if (this.app.activeStampType === 'view' && dt < 300 && Math.abs(dx) < 30 && Math.abs(dy) < 30) {
                    this.inputManager._suppressNextClick = true
                    this.handleZoneTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
                }
            }
        }, { passive: false })

        viewerContainer.addEventListener('touchcancel', (e) => {
            if (!this._isPinching) return

            const endedPanGesture = this._gestureLocked === 'pan'
            this._isPinching = false
            this.app.isPinching = false
            this.app._wasPanning = endedPanGesture
            this._gestureLocked = null

            if (this._viewerEl) {
                this._viewerEl.style.transform = ''
                this._viewerEl.style.transformOrigin = ''
                this._viewerEl.style.willChange = ''
                this._viewerEl.style.transition = 'transform 0.15s ease-out'
            }

            if (endedPanGesture) this._suppressSingleTouchUntil = Date.now() + 180

            if (e.cancelable) e.preventDefault()
        }, { passive: false })
    }

    handleZoneTap(tapX, tapY) {
        const now = Date.now()
        if (now - this._lastZoneTapAt < 350) return
        this._lastZoneTapAt = now

        // Guard: don't trigger navigation when tapping near the dock bar or FAB
        for (const id of ['sf-dock-fab', 'sf-dock-bar']) {
            const el = document.getElementById(id)
            if (!el) continue
            const r = el.getBoundingClientRect()
            const pad = 24
            if (tapX >= r.left - pad && tapX <= r.right + pad &&
                tapY >= r.top - pad && tapY <= r.bottom + pad) return
        }

        const vh = window.innerHeight
        const viewer = document.getElementById('viewer-container')
        const pages = Array.from(viewer.querySelectorAll('.page-container'))
        const pageUnderTap = pages.find(page => {
            const rect = page.getBoundingClientRect()
            return tapY >= rect.top && tapY <= rect.bottom
        }) || pages[0]
        
        if (pageUnderTap) {
            const rect = pageUnderTap.getBoundingClientRect()
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

    getDistance(t1, t2) {
        if (!t1 || !t2) return 0
        return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2))
    }
}
