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
        this.update()
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

        if (this.collapsed) {
            // Save sub-bar state then close all
            this._subBarSnapshot = this._subBarMgr?.snapshotState()
            this._subBarMgr?.closeAll()
        } else {
            // Restore previously open sub-bars
            this._subBarMgr?.restoreState(this._subBarSnapshot)
            this._subBarSnapshot = null
        }

        this._handleLayoutTransition()
    }

    _handleLayoutTransition() {
        // Re-apply fit mode after layout shift (wait for CSS transition).
        // Skip in overlay mode: score area doesn't change size, so no re-render needed.
        if (!document.body.classList.contains('sf-edit-strip-overlay')) {
            setTimeout(() => this.app.viewerManager?.reapplyFit(), 320)
        }
    }

    _createStrip() {
        const el = document.createElement('div')
        el.id = 'sf-edit-strip'
        document.body.appendChild(el)
        this.el = el

        // Draggable FAB — shows when strip is collapsed, drag to reposition
        const fab = document.createElement('div')
        fab.id = 'sf-edit-strip-fab'
        fab.title = 'Edit tools'
        fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" width="22" height="22">
            <rect x="3"  y="3"  width="7" height="7" rx="1"/>
            <rect x="14" y="3"  width="7" height="7" rx="1"/>
            <rect x="3"  y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>`

        // Restore saved position (stored as left/top), clamped to current viewport
        const savedPos = JSON.parse(localStorage.getItem('sf_edit_fab_pos') || 'null')
        const W = 40, H = 40
        const rawLeft = savedPos?.left ?? (window.innerWidth  - 84)  // default: left of strip
        const rawTop  = savedPos?.top  ?? (window.innerHeight - 60)
        fab.style.left = Math.max(0, Math.min(window.innerWidth  - W, rawLeft)) + 'px'
        fab.style.top  = Math.max(0, Math.min(window.innerHeight - H, rawTop))  + 'px'

        // Drag logic — use left/top for clean math
        let dragging = false, moved = false
        let startX = 0, startY = 0, startLeft = 0, startTop = 0

        fab.addEventListener('pointerdown', (e) => {
            dragging  = true
            moved     = false
            e.currentTarget.setPointerCapture(e.pointerId)
            startX    = e.clientX
            startY    = e.clientY
            startLeft = fab.getBoundingClientRect().left
            startTop  = fab.getBoundingClientRect().top
            fab.classList.add('dragging')
        })

        fab.addEventListener('pointermove', (e) => {
            if (!dragging) return
            const dx = e.clientX - startX
            const dy = e.clientY - startY
            if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true
            const W = fab.offsetWidth  || 28
            const H = fab.offsetHeight || 28
            fab.style.left = Math.max(0, Math.min(window.innerWidth  - W, startLeft + dx)) + 'px'
            fab.style.top  = Math.max(0, Math.min(window.innerHeight - H, startTop  + dy)) + 'px'
        })

        fab.addEventListener('pointerup', () => {
            if (!dragging) return
            dragging = false
            fab.classList.remove('dragging')
            localStorage.setItem('sf_edit_fab_pos', JSON.stringify({
                left: parseInt(fab.style.left),
                top:  parseInt(fab.style.top)
            }))
            if (!moved) {
                // Master Toggle: If anything is open -> Close All. If both closed -> Open All.
                const isLeftOpen = !document.body.classList.contains('sf-doc-bar-collapsed')
                const isRightOpen = !this.collapsed
                const isAnyOpen = isLeftOpen || isRightOpen

                if (isAnyOpen) {
                    // Close BOTH
                    this.toggleCollapse(true)
                    this.app.docBarStripManager?.toggleCollapse(true)
                } else {
                    // Open BOTH
                    this.toggleCollapse(false)
                    this.app.docBarStripManager?.toggleCollapse(false)
                }
            }
        })

        // Dead-zone guard: transparent ring around FAB that absorbs stray taps
        const guard = document.createElement('div')
        guard.id = 'sf-edit-strip-fab-guard'
        guard.addEventListener('pointerdown', (e) => e.stopPropagation())
        guard.addEventListener('click',       (e) => e.stopPropagation())
        document.body.appendChild(guard)
        this._fabGuard = guard

        // Keep guard centred on FAB whenever FAB moves
        const syncGuard = () => {
            const r = fab.getBoundingClientRect()
            const pad = 28
            guard.style.left   = (r.left   - pad) + 'px'
            guard.style.top    = (r.top    - pad) + 'px'
            guard.style.width  = (r.width  + pad * 2) + 'px'
            guard.style.height = (r.height + pad * 2) + 'px'
        }
        fab.addEventListener('pointermove', syncGuard)
        fab.addEventListener('pointerup',   syncGuard)
        requestAnimationFrame(syncGuard)

        // Re-clamp FAB position when window is resized so it never goes off-screen
        window.addEventListener('resize', () => {
            const fabW = fab.offsetWidth  || 40
            const fabH = fab.offsetHeight || 40
            const curLeft = parseInt(fab.style.left) || 0
            const curTop  = parseInt(fab.style.top)  || 0
            fab.style.left = Math.max(0, Math.min(window.innerWidth  - fabW, curLeft)) + 'px'
            fab.style.top  = Math.max(0, Math.min(window.innerHeight - fabH, curTop))  + 'px'
            syncGuard()
        })

        document.body.appendChild(fab)
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
                } else if (id === 'trash-can') {
                    finalEditTools.push({
                        id: 'trash-can',
                        label: 'Clear All / Drop to delete',
                        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
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

        // ── Others (Scroll / Settings) ───────────────────────────────────────
        // Only show at top if not explicitly placed in the middle section
        if (!finalEditTools.find(t => t.id === 'scroll-bar')) {
            const othersBtn = document.createElement('div')
            othersBtn.id = 'sf-edit-others-btn'
            othersBtn.className = 'sf-strip-btn'
            othersBtn.title = 'Line / Color / Opacity'
            othersBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">
                <circle cx="5"  cy="12" r="1.5" fill="currentColor"/>
                <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
            </svg>`
            othersBtn.addEventListener('click', () => {
                this._subBarMgr?.toggle('others', othersBtn)
                this._render()
            })
            el.appendChild(othersBtn)

            // Divider after hardcoded 'others'
            el.appendChild(this._divider())
        }

        // ── Edit tool buttons ────────────────────────────────────────────────
        finalEditTools.forEach(tool => {
            if (tool.isDivider) {
                el.appendChild(this._divider())
                return
            }
            const isPen    = tool.id === 'pen'
            const isShapes = !!tool.isShapesTrigger || tool.id === 'shapes'
            const isStamp  = !!tool.isStampTrigger  || tool.id === 'stamp-palette'
            const isText   = tool.id === 'quick-text'
            const isOthers = tool.id === 'scroll-bar'
            const isTrash  = tool.id === 'trash-can'
            const hasSub   = isPen || isShapes || isStamp || isText || isOthers

            const subActive = (isPen    && this._subBarMgr?.activeBar === 'pen')
                           || (isShapes && this._subBarMgr?.activeBar === 'shapes')
                           || (isStamp  && this._subBarMgr?.activeBar === 'stamp')
                           || (isText   && this._subBarMgr?.activeBar === 'text')
                           || (isOthers && this._subBarMgr?.activeBar === 'others')

            const toolActive = !hasSub && tool.id !== 'view' && this.app.activeStampType === tool.id

            const btn = document.createElement('div')
            btn.className = 'sf-strip-btn'
                + (hasSub ? ' has-sub' : '')
                + (subActive ? ' open' : '')
            btn.dataset.tool = tool.id
            btn.title = tool.label
            btn.innerHTML = tool.icon
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22">${tool.icon}</svg>`
                : `<span style="font-size:10px;font-weight:700;color:inherit">${tool.textIcon || tool.label}</span>`

            btn.addEventListener('click', () => this._handleToolClick(tool, btn, isPen, isShapes, isStamp, isText, isOthers, isTrash))
            el.appendChild(btn)
        })

        // ── Divider before scrollbar ─────────────────────────────────────────
        el.appendChild(this._divider())

        // ── Scrollbar drag zone ──────────────────────────────────────────────
        this._buildScrollbar(el)

        // ── Trash / Undo / Redo (Bottom) ───────────────────────────────────
        el.appendChild(this._divider())

        // Only add symmetrical bottom tools if they aren't already in the middle section
        const currentIds = finalEditTools.map(t => t.id)
        const hasTrash = currentIds.includes('trash-can')
        const hasUndo = currentIds.includes('undo')
        const hasRedo = currentIds.includes('redo')

        // Clear All (Trash)
        if (!hasTrash) {
            const trashBtn = document.createElement('div')
            trashBtn.id = 'sf-edit-trash-btn'
            trashBtn.className = 'sf-strip-trash-btn'
            trashBtn.title = 'Clear All / Drop to delete'
            trashBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>`
            trashBtn.addEventListener('click', async () => {
                const ok = await this.app.showDialog({
                    title: 'Clear All Annotations',
                    message: 'Are you sure you want to clear all hand-drawn annotations on this page?',
                    type: 'confirm',
                    icon: '🗑️'
                })
                if (ok) this.app.annotationManager?.clearAllLayers()
            })
            el.appendChild(trashBtn)
        }

        // Undo
        if (!hasUndo) {
            const undoBtn = document.createElement('div')
            undoBtn.className = 'sf-strip-btn'
            undoBtn.dataset.activeId = 'undo'
            undoBtn.title = 'Undo (Cmd+Z)'
            undoBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                <path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
            </svg>`
            undoBtn.addEventListener('click', () => this.app.undo())
            el.appendChild(undoBtn)
        }

        // Redo
        if (!hasRedo) {
            const redoBtn = document.createElement('div')
            redoBtn.className = 'sf-strip-btn'
            redoBtn.title = 'Redo (Cmd+Shift+Z)'
            redoBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" 
                stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                <path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
            </svg>`
            redoBtn.addEventListener('click', () => this.app.redo())
            el.appendChild(redoBtn)
        }
    }

    _handleToolClick(tool, btn, isPen, isShapes, isStamp, isText, isOthers, isTrash) {
        if (isOthers) {
            this._subBarMgr?.toggle('others', btn)
        } else if (isTrash) {
            this._handleTrashClick()
        } else if (isPen) {
            this._subBarMgr?.toggle('pen', btn)
        } else if (isShapes) {
            this._subBarMgr?.toggle('shapes', btn)
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
        const ok = await this.app.showDialog({
            title: 'Clear All Annotations',
            message: 'Are you sure you want to clear all hand-drawn annotations on this page?',
            type: 'confirm',
            icon: '🗑️'
        })
        if (ok) this.app.annotationManager?.clearAllLayers()
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

        requestAnimationFrame(() => {
            const viewer = this.app.viewer
            const trackH = track.clientHeight || 120
            const thumbH = Math.max(28, Math.round(trackH / 5))
            const centerTop = Math.round((trackH - thumbH) / 2)
            thumb.style.height = thumbH + 'px'
            thumb.style.top    = centerTop + 'px'

            let dragging = false
            let lastClientY = 0
            let lastTime = 0

            const onMove = (clientY) => {
                if (!dragging || !viewer) return
                const now = performance.now()
                const dt = Math.max(1, now - lastTime)   // ms since last frame
                const dy = clientY - lastClientY          // px since last frame

                // Velocity-based: fast flick → bigger jump. Clamp 1×–8×.
                const speed = Math.abs(dy) / dt           // px/ms
                const multiplier = Math.min(8, Math.max(1, speed * 40))

                const maxScroll = viewer.scrollHeight - viewer.clientHeight
                viewer.scrollTop = Math.max(0, Math.min(maxScroll, viewer.scrollTop - dy * multiplier))

                // Thumb shows displacement from centre (visual feedback only, half speed)
                const maxTop = trackH - thumbH
                const thumbPos = Math.max(0, Math.min(maxTop, centerTop + dy * 0.5))
                thumb.style.top = thumbPos + 'px'

                lastClientY = clientY
                lastTime = now
            }

            const onUp = () => {
                if (!dragging) return
                dragging = false
                thumb.classList.remove('grabbing')
                // Spring back to centre so next drag starts fresh
                thumb.style.top = centerTop + 'px'
                window.removeEventListener('mousemove', _mouseMove)
                window.removeEventListener('mouseup',   _mouseUp)
                window.removeEventListener('touchmove', _touchMove)
                window.removeEventListener('touchend',  _touchUp)
            }

            const _mouseMove = (e) => onMove(e.clientY)
            const _touchMove = (e) => onMove(e.touches[0].clientY)
            const _mouseUp   = () => onUp()
            const _touchUp   = () => onUp()

            const startDrag = (clientY) => {
                dragging = true
                lastClientY = clientY
                lastTime = performance.now()
                thumb.classList.add('grabbing')
                window.addEventListener('mousemove', _mouseMove)
                window.addEventListener('mouseup',   _mouseUp)
                window.addEventListener('touchmove', _touchMove, { passive: true })
                window.addEventListener('touchend',  _touchUp)
            }

            track.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientY) })
            track.addEventListener('touchstart', (e) => startDrag(e.touches[0].clientY), { passive: true })
        })
    }
}
