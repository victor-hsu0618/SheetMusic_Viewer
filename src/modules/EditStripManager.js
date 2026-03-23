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
                // Tap — toggle strip
                this.collapsed = !this.collapsed
                this.el.classList.toggle('collapsed', this.collapsed)
                document.body.classList.toggle('sf-strip-collapsed', this.collapsed)

                if (this.collapsed) {
                    // Save sub-bar state then close all
                    this._subBarSnapshot = this._subBarMgr?.snapshotState()
                    this._subBarMgr?.closeAll()
                } else {
                    // Restore previously open sub-bars
                    this._subBarMgr?.restoreState(this._subBarSnapshot)
                    this._subBarSnapshot = null
                }
                // Re-apply fit mode after layout shift (wait for CSS transition).
                // Skip in overlay mode: score area doesn't change size, so no re-render needed.
                if (!document.body.classList.contains('sf-edit-strip-overlay')) {
                    setTimeout(() => this.app.viewerManager?.reapplyFit(), 320)
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
        this._expandTab = fab
    }

    _render() {
        const el = this.el
        el.innerHTML = ''

        // ── Others trigger (top of strip) ──────────────────────────────────
        const othersOpen = this._subBarMgr?.activeBar === 'others'
        const othersBtn = document.createElement('div')
        othersBtn.className = 'sf-strip-others-btn' + (othersOpen ? ' open' : '')
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

        // ── Divider ─────────────────────────────────────────────────────────
        el.appendChild(this._divider())

        // ── Edit tool buttons ────────────────────────────────────────────────
        const editGroup = TOOLSETS.find(g => g.type === 'edit')
        const editTools = editGroup ? [...editGroup.tools] : []

        // Append Shapes and Stamp triggers
        editTools.push({
            id: 'shapes',
            label: 'Shapes',
            isShapesTrigger: true,
            icon: '<path d="M4 8c4 8 12 8 16 0" fill="none" stroke="currentColor" stroke-width="1.5"/>'
                + '<line x1="4" y1="16" x2="20" y2="4" stroke="currentColor" stroke-width="1.2"/>'
                + '<path d="M14 18 L8 18 L8 12" fill="none" stroke="currentColor" stroke-width="1.5"/>'
        })
        editTools.push({
            id: 'stamp-palette',
            label: 'Stamps',
            isStampTrigger: true,
            icon: '<path d="M12 20h9"/>'
                + '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>'
        })

        // Apply saved order from panel_config
        const editOrder = this._getPanelOrder('editBar')
        if (editOrder.length) {
            const ordered = editOrder.map(id => editTools.find(t => t.id === id)).filter(Boolean)
            const missing = editTools.filter(t => !editOrder.includes(t.id))
            editTools.splice(0, editTools.length, ...ordered, ...missing)
        }

        editTools.forEach(tool => {
            const isPen    = tool.id === 'pen'
            const isShapes = !!tool.isShapesTrigger
            const isStamp  = !!tool.isStampTrigger
            const isText   = tool.id === 'quick-text'
            const hasSub   = isPen || isShapes || isStamp || isText

            const subActive = (isPen    && this._subBarMgr?.activeBar === 'pen')
                           || (isShapes && this._subBarMgr?.activeBar === 'shapes')
                           || (isStamp  && this._subBarMgr?.activeBar === 'stamp')
                           || (isText   && this._subBarMgr?.activeBar === 'text')
            // 'view' is the neutral/default mode — don't highlight it as active
            const toolActive = !hasSub && tool.id !== 'view' && this.app.activeStampType === tool.id
            const isActive   = toolActive || subActive

            const btn = document.createElement('div')
            btn.className = 'sf-strip-btn'
                + (isActive ? ' active' : '')
                + (hasSub ? ' has-sub' : '')
                + (subActive ? ' open' : '')
            btn.dataset.tool = tool.id
            btn.title = tool.label
            btn.innerHTML = tool.icon
                ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="22" height="22">${tool.icon}</svg>`
                : `<span style="font-size:10px;font-weight:700;color:inherit">${tool.textIcon || tool.label}</span>`

            btn.addEventListener('click', () => this._handleToolClick(tool, btn, isPen, isShapes, isStamp, isText))
            el.appendChild(btn)
        })

        // ── Divider before scrollbar ─────────────────────────────────────────
        el.appendChild(this._divider())

        // ── Scrollbar drag zone ──────────────────────────────────────────────
        this._buildScrollbar(el)

        // ── Collapse button (bottom) ─────────────────────────────────────────
        const collapseBtn = document.createElement('div')
        collapseBtn.className = 'sf-strip-collapse-btn'
        collapseBtn.title = 'Collapse edit strip'
        collapseBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">
            <polyline points="15 18 9 12 15 6"/>
        </svg>`
        collapseBtn.addEventListener('click', () => {
            this.collapsed = true
            this.el.classList.add('collapsed')
            document.body.classList.add('sf-strip-collapsed')
            document.getElementById('sf-doc-bar-strip')?.classList.add('collapsed')
            this._subBarSnapshot = this._subBarMgr?.snapshotState()
            this._subBarMgr?.closeAll()
            setTimeout(() => this.app.viewerManager?.reapplyFit(), 320)
        })
        el.appendChild(collapseBtn)
    }

    _handleToolClick(tool, btn, isPen, isShapes, isStamp, isText) {
        if (isPen) {
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
        this._render()
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
