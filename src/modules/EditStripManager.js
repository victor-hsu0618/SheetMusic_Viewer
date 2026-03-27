import { TOOLSETS } from '../constants.js'
import '../styles/edit-strip.css'

/**
 * EditStripManager
 * ─────────────────
 * Renders and manages the right-side vertical edit tool strip.
 *
 * Responsibilities:
 *  - Build #sf-edit-strip DOM (tool buttons, scrollbar drag zone, collapse btn)
 *  - Sync active button state with app.activeStampType
 *  - Delegate sub-bar triggers to EditSubBarManager (set via setSubBarManager)
 *  - Spring-back scrollbar that scrolls app.viewer proportionally
 */
export class EditStripManager {
    constructor(app) {
        this.app = app
        this.el = null
        this.collapsed = false
        this._subBarMgr = null
    }

    /** Called after EditSubBarManager is instantiated */
    setSubBarManager(mgr) {
        this._subBarMgr = mgr
    }

    init() {
        this._createStrip()
        this._initCollapse()
        this.update()
    }

    _initCollapse() {
        const isHidden = localStorage.getItem('scoreflow_edit_strip_hide') === 'true'
        this.toggleCollapse(isHidden)
    }

    /** Re-render all buttons (call after activeStampType changes) */
    update() {
        if (!this.el) return
        this._render()
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    /** Toggle the visibility of the whole edit strip */
    toggleCollapse(isHidden) {
        if (!this.el) return
        this.collapsed = isHidden
        this.el.classList.toggle('collapsed', isHidden)
        document.body.classList.toggle('sf-strip-collapsed', isHidden)
        localStorage.setItem('scoreflow_edit_strip_hide', isHidden)

        if (this.collapsed) {
            // 1. Save tool state then force View mode
            this._prevActiveTool = this.app.activeStampType
            this.app.activeStampType = 'view'
            this.app.toolManager?.updateActiveTools()
            this.update()

            // 2. Save sub-bar state then close all
            this._subBarSnapshot = this._subBarMgr?.snapshotState()
            this._subBarMgr?.closeAll()
        } else {
            // Restore tool if we saved one
            if (this._prevActiveTool) {
                this.app.activeStampType = this._prevActiveTool
                this.app.toolManager?.updateActiveTools()
            }
            this.update()
            
            // Restore previously open sub-bars
            this._subBarMgr?.restoreState(this._subBarSnapshot)
            this._subBarSnapshot = null
            this._prevActiveTool = null
        }

        this._updateCollapseIcon()
        this._handleLayoutTransition()
    }

    toggle() {
        this.toggleCollapse(!this.collapsed)
    }

    _handleLayoutTransition() {
        // Re-apply fit mode after layout shift (wait for CSS transition).
        // Skip in overlay mode: score area doesn't change size, so no re-render needed.
        if (!document.body.classList.contains('sf-edit-strip-overlay')) {
            setTimeout(() => this.app.viewerManager?.reapplyFit(), 320)
        }
    }

    _createStrip() {
        let el = document.getElementById('sf-edit-strip')
        if (el) {
            this.el = el
            return
        }
        el = document.createElement('div')
        el.id = 'sf-edit-strip'
        document.body.appendChild(el)
        this.el = el

        // ─── FAB Removal ───
        // The floating action button is now replaced by the persistent edge collapse button.
    }

    _render() {
        const el = this.el
        el.innerHTML = ''

        // ── Edit tool buttons ────────────────────────────────────────────────
        const editGroup = TOOLSETS.find(g => g.type === 'edit')
        const editTools = editGroup ? [...editGroup.tools] : []

        // Apply saved order from panel_config
        const editOrder = this._getPanelOrder('editBar')
        let finalEditTools = []
        if (editOrder.length) {
            editOrder.forEach(id => {
                if (id === '|' || id === '.') {
                    finalEditTools.push({ id, isDivider: true })
                } else if (id === 'scroll-bar') {
                    finalEditTools.push({
                        id: 'scroll-bar',
                        label: 'Line / Color / Opacity',
                        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                            <circle cx="5"  cy="12" r="1.5" fill="currentColor"/>
                            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                            <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
                        </svg>`
                    })
                } else {
                    const tool = editTools.find(t => t.id === id)
                    if (tool) finalEditTools.push(tool)
                }
            })
            // Append missing core tools that weren't in the saved order
            // (Exclude special tools that have symmetrical fallbacks at top/bottom)
            const specialIds = ['undo', 'redo', 'trash-can', 'scroll-bar']
            const missing = editTools.filter(t => !editOrder.includes(t.id) && !specialIds.includes(t.id))
            finalEditTools = [...finalEditTools, ...missing]
        } else {
            finalEditTools = editTools
        }

        // ── Main Loop ────────────────────────────────────────────────────────
        finalEditTools.forEach(tool => {
            if (tool.isDivider) {
                el.appendChild(this._divider())
                return
            }

            // Skip trash-can as it's always at the bottom
            // Skip scroll-bar (dots) as it's now at the very bottom
            if (tool.id === 'trash-can' || tool.id === 'scroll-bar') return

            const isPen = tool.isPenTrigger
            const isStamp = tool.isStampTrigger
            const isText = tool.isTextTrigger
            const isOthers = tool.id === 'scroll-bar'
            const hasSub = isPen || isStamp || isText || isOthers

            const subActive = (isPen && this._subBarMgr?.activeBar === 'pen')
                || (isStamp && this._subBarMgr?.activeBar === 'stamp')
                || (isText && this._subBarMgr?.activeBar === 'text')
                || (isOthers && this._subBarMgr?.activeBar === 'others')

            const btn = document.createElement('div')
            btn.className = 'sf-strip-btn'
                + (hasSub ? ' has-sub' : '')
                + (subActive ? ' open' : '')
            btn.dataset.tool = tool.id

            // --- NUCLEAR EXCLUSIVITY LOGIC (RE-ENGINEERED) ---
            const curTool = this.app.activeStampType
            let isActive = (curTool === tool.id)

            // Category Indicators: Only check if NO core tool is active
            const isCoreAction = ['view','select','eraser','cycle','recycle-bin'].includes(curTool)
            
            if (!isActive && !isCoreAction) {
                if (isPen) {
                    isActive = (curTool === 'pen' || curTool.includes('-pen') || 
                                curTool.includes('highlighter') || 
                                curTool === 'dashed-pen' || curTool === 'arrow-pen' ||
                                ['line', 'slur', 'bracket-left', 'bracket-right'].includes(curTool))
                } else if (isText) {
                    isActive = (curTool.startsWith('text-') || curTool === 'quick-text' || ['text','tempo-text'].includes(curTool))
                } else if (isStamp) {
                    // It's a stamp IF it's not a core tool and not identified as pen/shape/text above
                    const isDrawOrText = (curTool === 'pen' || curTool.includes('-pen') || curTool.includes('highlighter') || 
                                         ['line','slur', 'bracket-left', 'bracket-right','text','tempo-text'].includes(curTool) ||
                                         curTool.startsWith('text-') || curTool === 'quick-text')
                    isActive = !isDrawOrText
                }
            }

            if (isActive) btn.classList.add('active')
            btn.title = tool.label

            btn.innerHTML = tool.icon
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">${tool.icon}</svg>`
                : `<span style="font-size:10px;font-weight:700;color:inherit">${tool.textIcon || tool.label}</span>`

            btn.addEventListener('click', () => this._handleToolClick(tool, btn, isPen, false, isStamp, isText, isOthers, false)) // isTrash is false here
            el.appendChild(btn)
        })

        // ── Divider before scrollbar ─────────────────────────────────────────
        el.appendChild(this._divider())

        // ── Scrollbar drag zone ──────────────────────────────────────────────
        this._buildScrollbar(el)

        // ── Trash / Undo / Redo (Bottom) ───────────────────────────────────
        el.appendChild(this._divider())

        // Clear All (Trash)
        const trashBtn = document.createElement('div')
        trashBtn.id = 'sf-edit-trash-btn'
        trashBtn.className = 'sf-strip-btn sf-edit-trash'
        trashBtn.title = '回收桶 (長按清除目前所有劃記)'
        trashBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>`
        trashBtn.classList.toggle('active', this.app.activeStampType === 'recycle-bin')
        trashBtn.addEventListener('click', () => {
            const isAlreadyActive = this.app.activeStampType === 'recycle-bin'
            this.app.activeStampType = isAlreadyActive ? 'view' : 'recycle-bin'
            this.app.toolManager?.updateActiveTools()
        })
        // Long press for "Erase All"
        let trashPressTimer
        trashBtn.addEventListener('touchstart', (e) => {
            trashPressTimer = setTimeout(async () => {
                await this.app.annotationManager?.eraseAllAnnotationsWithConfirmation()
            }, 800)
        }, { passive: true })
        trashBtn.addEventListener('touchend', () => clearTimeout(trashPressTimer))
        trashBtn.addEventListener('touchmove', () => clearTimeout(trashPressTimer))
        // Desktop support: Right-click to clear all
        trashBtn.addEventListener('contextmenu', async (e) => {
            e.preventDefault()
            await this.app.annotationManager?.eraseAllAnnotationsWithConfirmation()
        })
        el.appendChild(trashBtn)

        // Fit to Width
        const fitWidthBtn = document.createElement('div')
        fitWidthBtn.className = 'sf-strip-btn'
        fitWidthBtn.title = 'Fit to Width (W)'
        fitWidthBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <path d="M21 12H3M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/>
        </svg>`
        fitWidthBtn.addEventListener('click', () => this.app.fitToWidth?.())
        el.appendChild(fitWidthBtn)

        // Fit to Height
        const fitHeightBtn = document.createElement('div')
        fitHeightBtn.className = 'sf-strip-btn'
        fitHeightBtn.title = 'Fit to Height (F)'
        fitHeightBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
            <path d="M12 3v18M12 3L8 7M12 3l4 4M12 21l-4-4M12 21l4-4"/>
        </svg>`
        fitHeightBtn.addEventListener('click', () => this.app.fitToHeight?.())
        el.appendChild(fitHeightBtn)

        // Others (Dots) Bar at the Bottom
        el.appendChild(this._divider())
        const othersBtn = document.createElement('div')
        othersBtn.id = 'sf-edit-others-btn'
        othersBtn.className = 'sf-strip-btn'
        othersBtn.title = 'Other Settings (S)'
        othersBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
            <circle cx="5"  cy="12" r="1.5" fill="currentColor"/>
            <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
            <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
        </svg>`
        othersBtn.addEventListener('click', (e) => {
            const btn = e.currentTarget
            this._subBarMgr?.toggle('others', btn)
        })
        el.appendChild(othersBtn)

        // ── PERSISTENT COLLAPSE TOGGLE (Always at the very end) ───────────────
        this._buildCollapseToggle(el)
    }

    _handleToolClick(tool, btn, isPen, isShapes, isStamp, isText, isOthers, isTrash) {
        if (isOthers) {
            this._subBarMgr?.toggle('others', btn)
        } else if (isTrash) {
            this._handleTrashClick()
        } else if (isPen) {
            this._subBarMgr?.toggle('pen', btn)
        } else if (isStamp) {
            this._subBarMgr?.toggle('stamp', btn)
        } else if (isText) {
            this._subBarMgr?.toggle('text', btn)
        } else {
            if (this._subBarMgr?.closeToolBars) {
                this._subBarMgr.closeToolBars()
            } else {
                this._subBarMgr?.closeAll()
            }
            // Toggle: clicking the already-active tool (eraser, select, etc.) switches back to view mode
            const isAlreadyActive = this.app.activeStampType === tool.id && tool.id !== 'view'
            this.app.activeStampType = isAlreadyActive ? 'view' : tool.id
            this.app.toolManager?.updateActiveTools()
        }
    }

    async _handleTrashClick() {
        if (this._subBarMgr?.closeToolBars) {
            this._subBarMgr.closeToolBars()
        } else {
            this._subBarMgr?.closeAll()
        }
        // Toggle recycle-bin tool to show/hide deleted items
        const isAlreadyActive = this.app.activeStampType === 'recycle-bin'
        this.app.activeStampType = isAlreadyActive ? 'view' : 'recycle-bin'
        this.app.toolManager?.updateActiveTools()
    }

    /** Read a saved order array from panel_config in localStorage */
    _getPanelOrder(key) {
        try {
            const cfg = JSON.parse(localStorage.getItem('scoreflow_panel_config') || '{}')
            return Array.isArray(cfg[key]) ? cfg[key] : []
        } catch { return [] }
    }

    /** Re-render after panel_config changes (e.g. Supabase sync) */
    applyPanelConfig() {
        this._render()
    }

    _divider() {
        const d = document.createElement('div')
        d.className = 'sf-strip-divider'
        return d
    }

    _buildScrollbar(el) {
        const track = document.createElement('div')
        track.className = 'sf-strip-scrollbar-track'
        el.appendChild(track)

        const thumb = document.createElement('div')
        thumb.className = 'sf-strip-scrollbar-thumb'
        track.appendChild(thumb)

        const upArrow = document.createElement('div')
        upArrow.className = 'sf-scrollbar-arrow sf-scrollbar-arrow-up'
        upArrow.innerHTML = `<svg viewBox="0 0 24 36" width="20" height="30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
            <polyline points="18 12 12 6 6 12" opacity="0.4"/>
            <polyline points="18 20 12 14 6 20" opacity="0.7"/>
            <polyline points="18 28 12 22 6 28"/>
        </svg>`
        track.appendChild(upArrow)

        const downArrow = document.createElement('div')
        downArrow.className = 'sf-scrollbar-arrow sf-scrollbar-arrow-down'
        downArrow.innerHTML = `<svg viewBox="0 0 24 36" width="20" height="30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none;">
            <polyline points="6 8 12 14 18 8"/>
            <polyline points="6 16 12 22 18 16" opacity="0.7"/>
            <polyline points="6 24 12 30 18 24" opacity="0.4"/>
        </svg>`
        track.appendChild(downArrow)

        // Attach interactive shortcuts (Short: Page Up/Down, Long: Home/End)
        this._attachArrowListeners(upArrow, -1)
        this._attachArrowListeners(downArrow, 1)

        requestAnimationFrame(() => {
            const viewer = this.app.viewer
            const trackH = track.clientHeight || 120
            const thumbH = Math.max(28, Math.round(trackH / 5))
            const centerTop = Math.round((trackH - thumbH) / 2)
            thumb.style.height = thumbH + 'px'
            thumb.style.top = centerTop + 'px'

            let dragging = false
            let lastClientY = 0
            let lastTime = 0
            let movedDist = 0

            const onMove = (clientY) => {
                const now = performance.now()
                const dt = Math.max(1, now - lastTime)   // ms since last frame
                const dy = clientY - lastClientY          // px since last frame

                // Toggle arrows based on direction (threshold of 2px for stability)
                if (dy < -2) {
                    upArrow.classList.add('active')
                    downArrow.classList.remove('active')
                } else if (dy > 2) {
                    downArrow.classList.add('active')
                    upArrow.classList.remove('active')
                }

                // Velocity-based: fast flick → bigger jump. Clamp 1×–8×.
                const speed = Math.abs(dy) / dt           // px/ms
                const multiplier = Math.min(8, Math.max(1, speed * 40))

                const maxScroll = viewer.scrollHeight - viewer.clientHeight
                viewer.scrollTop = Math.max(0, Math.min(maxScroll, viewer.scrollTop - dy * multiplier))
                movedDist += Math.abs(dy)

                // Thumb shows displacement from centre (visual feedback only, half speed)
                const maxTop = trackH - thumbH
                const thumbPos = Math.max(0, Math.min(maxTop, centerTop + dy * 0.5))
                thumb.style.top = thumbPos + 'px'

                lastClientY = clientY
                lastTime = now
            }

            const onUp = (e) => {
                if (!dragging) return
                if (e && e.touches && e.touches.length > 0) {
                    // Finger removed but others remain: recalibrate
                    lastClientY = _getAverageY(e)
                    lastTime = performance.now()
                    return
                }
                dragging = false
                thumb.classList.remove('grabbing')

                // Hide arrows
                upArrow.classList.remove('active')
                downArrow.classList.remove('active')

                // Spring back to centre
                thumb.style.top = centerTop + 'px'
                window.removeEventListener('mousemove', _mouseMove)
                window.removeEventListener('mouseup', _mouseUp)
                window.removeEventListener('touchstart', _touchStartExtra)
                window.removeEventListener('touchmove', _touchMove)
                window.removeEventListener('touchend', _touchUp)
            }

            const _mouseMove = (e) => onMove(e.clientY)
            const _getAverageY = (e) => {
                if (!e.touches || e.touches.length === 0) return 0
                let sum = 0
                for (let i = 0; i < e.touches.length; i++) sum += e.touches[i].clientY
                return sum / e.touches.length
            }
            const _touchMove = (e) => {
                if (e.cancelable) e.preventDefault()
                onMove(_getAverageY(e))
            }
            const _touchStartExtra = (e) => {
                // Recalibrate when a new finger touches anywhere while dragging
                lastClientY = _getAverageY(e)
                lastTime = performance.now()
            }
            const _mouseUp = () => onUp()
            const _touchUp = (e) => onUp(e)

            const startDrag = (clientY) => {
                dragging = true
                lastClientY = clientY
                movedDist = 0
                lastTime = performance.now()
                thumb.classList.add('grabbing')
                window.addEventListener('mousemove', _mouseMove)
                window.addEventListener('mouseup', _mouseUp)
                window.addEventListener('touchstart', _touchStartExtra, { passive: false })
                window.addEventListener('touchmove', _touchMove, { passive: false })
                window.addEventListener('touchend', _touchUp, { passive: false })
            }

            track.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientY) })
            track.addEventListener('touchstart', (e) => {
                if (e.cancelable) e.preventDefault()
                startDrag(_getAverageY(e))
            }, { passive: false })

            // MacOS Trackpad Support (Two-Finger Drag)
            let wheelTimer = null
            track.addEventListener('wheel', (e) => {
                if (e.cancelable) e.preventDefault()
                const maxScroll = viewer.scrollHeight - viewer.clientHeight
                viewer.scrollTop = Math.max(0, Math.min(maxScroll, viewer.scrollTop + e.deltaY))

                // Show arrows based on scroll direction
                if (e.deltaY < -2) {
                    upArrow.classList.add('active')
                    downArrow.classList.remove('active')
                } else if (e.deltaY > 2) {
                    downArrow.classList.add('active')
                    upArrow.classList.remove('active')
                }

                // Reset arrows shortly after scroll stops
                if (wheelTimer) clearTimeout(wheelTimer)
                wheelTimer = setTimeout(() => {
                    upArrow.classList.remove('active')
                    downArrow.classList.remove('active')
                }, 300)
            }, { passive: false })

            // Jump-on-Click / Tap
            track.addEventListener('click', (e) => {
                if (movedDist > 5) return // Ignore if we just finished a drag
                const rect = track.getBoundingClientRect()
                const relY = e.clientY - rect.top
                const pct = Math.max(0, Math.min(1, relY / rect.height))
                const maxScroll = viewer.scrollHeight - viewer.clientHeight
                viewer.scrollTop = maxScroll * pct
            })
        })
    }

    _attachArrowListeners(arrow, direction) {
        let longPressTimer = null
        let isLongPressAction = false
        let lastTouchTime = 0
        const LONG_PRESS_MS = 600

        const startPress = (e) => {
            if (e.type === 'touchstart') lastTouchTime = Date.now()
            else if (Date.now() - lastTouchTime < 500) return
            
            isLongPressAction = false
            arrow.classList.add('active')
            
            if (longPressTimer) clearTimeout(longPressTimer)
            longPressTimer = setTimeout(() => {
                isLongPressAction = true
                if (navigator.vibrate) navigator.vibrate(10)
                
                const viewer = this.app.viewer
                if (direction === -1) {
                    viewer.scrollTop = 0
                } else {
                    viewer.scrollTop = viewer.scrollHeight
                }
                
                setTimeout(() => arrow.classList.remove('active'), 200)
            }, LONG_PRESS_MS)
        }

        const endPress = (e) => {
            if (e.type === 'touchend') lastTouchTime = Date.now()
            else if (Date.now() - lastTouchTime < 500) return

            if (e.cancelable) e.preventDefault()
            e.stopPropagation()

            if (longPressTimer) {
                clearTimeout(longPressTimer)
                longPressTimer = null
            }

            if (!isLongPressAction) {
                // Short press: Page Up / Page Down
                // Using app.jump for consistent musical page navigation
                this.app.jump(direction)
                
                arrow.classList.add('active')
                setTimeout(() => arrow.classList.remove('active'), 150)
            } else {
                 arrow.classList.remove('active')
            }
        }

        arrow.addEventListener('mousedown', (e) => { e.stopPropagation(); startPress(e); })
        arrow.addEventListener('touchstart', (e) => { e.stopPropagation(); startPress(e); }, { passive: true })
        arrow.addEventListener('mouseup', (e) => { e.stopPropagation(); endPress(e); })
        arrow.addEventListener('touchend', (e) => { e.stopPropagation(); endPress(e); }, { passive: false })
        arrow.addEventListener('mouseleave', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer)
                longPressTimer = null
            }
            arrow.classList.remove('active')
        })
        arrow.addEventListener('click', (e) => {
            e.stopPropagation()
            e.preventDefault()
        })
    }

    _buildCollapseToggle(el) {
        const btn = document.createElement('div')
        btn.id = 'sf-edit-collapse-btn'
        btn.className = 'sf-strip-btn sf-edit-collapse-btn'
        btn.title = '收合編輯列 (長按全收合)'

        const iconWrap = document.createElement('div')
        iconWrap.style.display = 'flex'
        iconWrap.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        // Default point RIGHT (to collapse toward right edge)
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="9 18 15 12 9 6"/></svg>'
        btn.appendChild(iconWrap)

        // --- LONG PRESS DETECTION ---
        let lastTouchTime = 0
        let longPressTimer = null
        let isLongPressAction = false
        const LONG_PRESS_MS = 600

        const startPress = (e) => {
            if (e.type === 'touchstart') lastTouchTime = Date.now()
            else if (Date.now() - lastTouchTime < 500) return

            isLongPressAction = false
            if (longPressTimer) clearTimeout(longPressTimer)
            longPressTimer = setTimeout(() => {
                isLongPressAction = true
                if (navigator.vibrate) navigator.vibrate(10)
                this._handleLongPressToggle()
            }, LONG_PRESS_MS)
        }

        const endPress = (e) => {
            if (e.type === 'touchend') lastTouchTime = Date.now()
            else if (Date.now() - lastTouchTime < 500) return

            if (e.cancelable) e.preventDefault()
            e.stopPropagation()

            if (longPressTimer) {
                clearTimeout(longPressTimer)
                longPressTimer = null
            }
            if (!isLongPressAction) {
                // Short press logic
                this.toggleCollapse(!this.collapsed)
            }
        }

        btn.addEventListener('mousedown', startPress)
        btn.addEventListener('touchstart', startPress, { passive: true })
        btn.addEventListener('mouseup', endPress)
        btn.addEventListener('touchend', endPress, { passive: false })
        btn.addEventListener('mouseleave', () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer)
                longPressTimer = null
            }
        })

        // Standard click-stop to prevent unwanted bubbling
        btn.addEventListener('click', (e) => e.stopPropagation())

        el.appendChild(btn)
        this._collapseBtn = btn
        this._updateCollapseIcon()
    }

    _handleLongPressToggle() {
        // Decide target state based on current Edit Strip state
        const targetCollapsed = !this.collapsed

        // 1. Toggle this strip
        this.toggleCollapse(targetCollapsed)

        // 2. Toggle Doc Bar (left strip) if available
        const docBar = this.app.docBarStripManager
        if (docBar) {
            docBar.toggleCollapse(targetCollapsed)
        }
    }

    _updateCollapseIcon() {
        if (!this._collapseBtn) return
        const isCollapsed = this.collapsed
        const iconWrap = this._collapseBtn.querySelector('div')
        if (iconWrap) {
            // If collapsed, point LEFT to indicate Expand. Else point RIGHT to indicate Collapse.
            iconWrap.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'
        }
        this._collapseBtn.title = isCollapsed ? '展開編輯列' : '收合編輯列'
    }
}
