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
        this.initPasteListener()

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
        
        // Fast-path: if touching the viewer background or a page, it's NOT UI
        if (e.target.id === 'viewer-container' || e.target.id === 'pdf-viewer' || e.target.classList.contains('page-container') || e.target.classList.contains('capture-overlay')) {
            return false
        }

        const uiSelector = 'button, label, input, select, .floating-stamp-bar, .floating-doc-bar, .modal-card, .jump-sub-panel, .library-overlay, .sidebar-recent-item, .recent-score-card, .bookmark-item, .sf-sub-bar, .sf-wide-bar, .sf-stamp-settings-panel'
        if (e.target.closest(uiSelector)) return true

        // On iOS, touch events can bleed through position:fixed overlays to the
        // underlying viewer. Check the actual touch coordinates to catch this.
        const touch = (e.changedTouches ?? e.touches)?.[0]
        if (touch) {
            const elAtPoint = document.elementFromPoint(touch.clientX, touch.clientY)
            // Safety: if elementFromPoint returns null or the root, it's workspace
            if (!elAtPoint || elAtPoint === document.documentElement || elAtPoint === document.body) return false
            if (elAtPoint.closest(uiSelector)) return true
        }
        return false
    }

    /**
     * Force-clears all interaction blockers, stagnant flags, and scroll locks.
     * Used after jumps or major UI transitions to ensure the workspace is responsive.
     */
    forceResetInteractionState() {
        console.log('[InputManager] 🛠️ Force resetting interaction state...');
        
        // 1. Reset Gesture Timers
        if (this.longPressTimer) { clearTimeout(this.longPressTimer); this.longPressTimer = null; }
        if (this.mouseLongPressTimer) { clearTimeout(this.mouseLongPressTimer); this.mouseLongPressTimer = null; }
        this.isLongPressActive = false;
        this.isMouseLongPressActive = false;
        this.mouseDownPos = null;

        // 2. Global App Flags
        this.app.isInteracting = false;
        this.app._wasPanning = false;
        this._suppressNextClick = false;

        // 3. Delegate to InteractionManager to reset overlays (very important for iPad)
        if (this.app.annotationManager?.interaction?.updateAllOverlaysTouchAction) {
            this.app.annotationManager.interaction.updateAllOverlaysTouchAction();
        }

        // 4. Safety: Force Restore Viewer Overflow
        if (this.app.viewer) {
            this.app.viewer.style.overflowY = '';
        }
    }

    initKeyboardListeners() {
        window.addEventListener('keydown', (e) => {
            const isInput = ['INPUT', 'TEXTAREA'].includes(e.target.tagName) || e.target.isContentEditable
            if (isInput) return

            const key = e.key.toLowerCase()
            const code = e.code

            // 0. Undo / Redo (Cmd+Z / Cmd+Shift+Z / Cmd+Y)
            if (e.metaKey || e.ctrlKey) {
                if (key === 'z') {
                    e.preventDefault()
                    if (e.shiftKey) this.app.redo()
                    else this.app.undo()
                    return
                }
                if (key === 'y') {
                    e.preventDefault()
                    this.app.redo()
                    return
                }
            }

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
                if (['s', 'v', 'o', 'f', 'r'].includes(key)) return
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

            // NEW: Check if clicking on a YouTube/Playback stamp first
            const vh = window.innerHeight
            const viewer = document.getElementById('viewer-container')
            const pages = Array.from(viewer.querySelectorAll('.page-container'))
            
            // Find page under click
            const pageUnderClick = pages.find(p => {
                const r = p.getBoundingClientRect()
                return e.clientY >= r.top && e.clientY <= r.bottom
            })

            if (pageUnderClick) {
                const pageNum = parseInt(pageUnderClick.dataset.page)
                const rect = pageUnderClick.getBoundingClientRect()
                const relX = (e.clientX - rect.left) / rect.width
                const relY = (e.clientY - rect.top) / rect.height

                const stamp = this.app.findClosestStamp(pageNum, relX, relY, true)
                if (stamp && stamp.draw?.variant === 'playback') {
                    console.log('[Click] Triggering YouTube Playback for stamp:', stamp.id)
                    this._triggerPlaybackStamp(stamp)
                    return
                }
            }

            this.gestureManager.handleZoneTap(e.clientX, e.clientY)
        })
    }

    _triggerPlaybackStamp(stamp) {
        if (!this.app.playbackManager) return
        
        let url = ''
        let time = 0
        
        if (typeof stamp.data === 'string' && stamp.data.startsWith('youtube|')) {
            const parts = stamp.data.split('|')
            const videoId = parts[1]
            time = parseFloat(parts[2]) || 0
            url = `https://www.youtube.com/watch?v=${videoId}`
        } else {
            // Fallback for legacy or unknown format
            url = stamp.data
        }

        if (url) {
            this.app.playbackManager.show()
            this.app.playbackManager.loadYoutube(url)
            // Seek after small delay to let player initialize if needed
            setTimeout(() => {
                this.app.playbackManager.seekTo(time)
                this.app.playbackManager.play()
            }, 1000)
            
            this.app.showMessage(`Playing YouTube: ${stamp.data?.split('|')[3] || 'Bookmark'}`, 'success')
        }
    }

    initScrollListener() {
        const viewer = document.getElementById('viewer-container')
        if (!viewer) return

        viewer.addEventListener('scroll', () => {
            if (!this.scrollTicking && !this.app.isPinching) {
                window.requestAnimationFrame(() => {
                    this.app.updateRulerMarks()  // already calls computeNextTarget internally
                    this.app.updateRulerClip()
                    if (this.app.jumpManager) this.app.jumpManager.updateDisplay()
                    this.scrollTicking = false
                })
                this.scrollTicking = true
            }
        }, { passive: true })
    }

    initPasteListener() {
        window.addEventListener('paste', (e) => this._handlePaste(e))
    }

    async _handlePaste(e) {
        // Don't intercept if user is typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            console.log('[Paste] Ignored: Focus on input element');
            return;
        }

        const text = (e.clipboardData || window.clipboardData).getData('text')
        if (!text) return
        
        console.log('[Paste] Received text:', text.substring(0, 100))

        // YouTube Regex (supports standard, shorts, live, and timestamps)
        const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
        const match = text.match(ytRegex)

        if (match && match[1]) {
            const videoId = match[1]
            console.log('[Paste] YouTube ID matched:', videoId)
            
            // Extract timestamp if exists (?t=123 or &t=123 or #t=123)
            let time = 0
            const tMatch = text.match(/[?&t=](\d+)(s)?/)
            if (tMatch) {
                time = parseInt(tMatch[1])
                console.log('[Paste] Timestamp extracted:', time)
            }

            const vh = window.innerHeight
            const centerLine = vh / 2
            
            const viewer = document.getElementById('viewer-container')
            const pages = Array.from(viewer.querySelectorAll('.page-container'))
            
            // Find most central page
            let centralPage = null
            let minCenterDist = Infinity

            pages.forEach(p => {
                const r = p.getBoundingClientRect()
                const pCenter = (r.top + r.bottom) / 2
                const dist = Math.abs(pCenter - centerLine)
                if (dist < minCenterDist) {
                    minCenterDist = dist
                    centralPage = p
                }
            })

            if (centralPage) {
                const pageNum = parseInt(centralPage.dataset.page)
                const rect = centralPage.getBoundingClientRect()
                console.log('[Paste] Target Page:', pageNum)
                
                const relX = 0.5
                const relY = Math.max(0.05, Math.min(0.95, (centerLine - rect.top) / rect.height))

                const stamp = {
                    id: `yt-${Date.now()}`,
                    page: pageNum,
                    type: 'music-anchor',
                    sourceId: this.app.activeSourceId || 'default',
                    x: relX,
                    y: relY,
                    color: '#ff0000', // Crimson Red
                    data: `youtube|${videoId}|${time}|YouTube Bookmark`,
                    draw: { type: 'special', variant: 'playback' },
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                    layerId: 'others'
                }

                if (this.app.annotationManager) {
                    this.app.stamps.push(stamp)
                    this.app.pushHistory({ type: 'add', obj: JSON.parse(JSON.stringify(stamp)) })
                    this.app.redrawStamps(pageNum)
                    await this.app.saveToStorage(true)
                    
                    if (this.app.supabaseManager) {
                        this.app.supabaseManager.pushAnnotation(stamp, this.app.pdfFingerprint)
                    }

                    this.app.showMessage('YouTube Bookmark Pasted', 'success')
                    console.log('[Paste] Stamp created successfully')
                }
            } else {
                console.warn('[Paste] No visible page found at center of screen')
            }
        } else {
            console.log('[Paste] No YouTube URL match found in text')
        }
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
