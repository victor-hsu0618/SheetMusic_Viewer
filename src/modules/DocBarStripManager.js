import '../styles/doc-bar.css'


const NAV_BUTTONS = [
    {
        id: 'doc-head',
        label: 'Jump to Head',
        icon: '<polyline points="17 11 12 6 7 11"/><polyline points="17 17 12 12 7 17"/><line x1="5" y1="5" x2="19" y2="5"/>',
        action: (app) => { if (app.viewer) app.viewer.scrollTop = 0 },
    },
    {
        id: 'doc-up',
        label: 'Page Up',
        icon: '<polyline points="18 15 12 9 6 15"/>',
        action: (app) => app.jump?.(-1),
    },
    {
        id: 'doc-down',
        label: 'Page Down',
        icon: '<polyline points="6 9 12 15 18 9"/>',
        action: (app) => app.jump?.(1),
    },
]

// View group: fullscreen + zoom + fit-width + fit-height + ruler (built separately)
const VIEW_BUTTONS = [
    {
        id: 'doc-fit-width',
        label: 'Fit Width (W)',
        icon: '<path d="M21 12H3M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/>',
        action: (app) => app.fitToWidth?.(),
    },
    {
        id: 'doc-fit-height',
        label: 'Fit Height (F)',
        icon: '<path d="M12 3v18M12 3L8 7M12 3l4 4M12 21l-4-4M12 21l4-4"/>',
        action: (app) => app.fitToHeight?.(),
    },
]

const TOOL_BUTTONS = [
    {
        id: 'doc-library',
        label: 'Library (O)',
        fill: true,
        icon: '<rect x="3" y="3" width="4" height="15" rx="1.5"/>'
            + '<rect x="10" y="6" width="4" height="12" rx="1.5"/>'
            + '<rect x="17" y="4.5" width="4" height="13.5" rx="1.5"/>'
            + '<rect x="2" y="19" width="20" height="2" rx="1"/>',
        action: (app) => app.toggleLibrary?.(),
    },
    {
        id: 'doc-jump-panel',
        label: 'Go To (G)',
        fill: true,
        icon: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
        action: (app) => app.jumpManager?.togglePanel(),
    },
    {
        id: 'score-name',
        label: 'Score Name',
        isTitle: true,
    },
    {
        id: 'trash-can',
        label: 'Trash Can',
        isTrash: true,
    }
]

const BOTTOM_BUTTONS = [
    {
        id: 'doc-settings',
        label: 'Settings',
        icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
        action: (app) => app.settingsPanelManager?.toggle(),
    },
    {
        id: 'doc-account',
        label: 'Account & Sync',
        icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
        action: (app) => app.accountPanelManager?.toggle(),
    },
]

/**
 * DocBarStripManager
 * ──────────────────
 * Left-side vertical doc bar strip.
 * Replaces the old #floating-doc-bar with a fixed left strip.
 *
 * Responsibilities:
 *  - Build #sf-doc-bar-strip DOM
 *  - Score title (vertical, rotated)
 *  - Nav buttons: jump-head, page-up, page-down
 *  - Tool buttons: fit-width, fit-height, library, jump-panel, view-panel, stamp
 *  - Color dots wired to app.activeColor
 */
export class DocBarStripManager {
    constructor(app) {
        this.app = app
        this.el = null
        this._zoomReadout = null
        this._fullscreenBtn = null
    }

    init() {
        this._build()
        // Initialize state from settings (default to shown if tabs are gone)
        const isHidden = localStorage.getItem('scoreflow_doc_bar_hide') === 'true'
        this.toggleCollapse(isHidden)
    }

    /** Toggle the visibility of the whole doc bar strip */
    toggleCollapse(isHidden) {
        if (!this.el) return
        this.el.classList.toggle('collapsed', isHidden)
        document.body.classList.toggle('sf-doc-bar-collapsed', isHidden)
        localStorage.setItem('scoreflow_doc_bar_hide', isHidden)
        
        // Re-fit score if skip calculation is not active (like in overlay mode)
        if (!document.body.classList.contains('sf-edit-strip-overlay')) {
            setTimeout(() => this.app.viewerManager?.reapplyFit(), 300)
        }
        
        // Update the toggle button icon if needed
        this._updateCollapseIcon()
    }

    /** Call on every zoom change to keep the readout in sync */
    updateZoom() {
        if (this._zoomReadout && this.app.scale != null) {
            this._zoomReadout.textContent = `${Math.round(this.app.scale * 100)}%`
        }
    }

    /** Call after a score loads to show the title */
    updateTitle(title) {
        const el = this.el?.querySelector('.sf-doc-score-title')
        if (!el) return
        el.textContent = title || ''
        el.classList.toggle('empty', !title)
    }

    /** Refresh active states */
    update() {}

    // ─── Private ──────────────────────────────────────────────────────────────

    /** Read docBar order from panel_config in localStorage */
    _getPanelOrder() {
        try {
            const cfg = JSON.parse(localStorage.getItem('scoreflow_panel_config') || '{}')
            return Array.isArray(cfg.docBar) ? cfg.docBar : []
        } catch { return [] }
    }

    /** Sort a button group by saved order, appending unknown IDs at end */
    _sortGroup(buttons, order) {
        if (!order || !order.length) return buttons
        const result = []
        order.forEach(id => {
            if (id === '|' || id === '.') {
                // Add a virtual divider
                result.push({ id, isDivider: true })
            } else {
                const b = buttons.find(x => x.id === id)
                if (b) result.push(b)
            }
        })
        const missing = buttons.filter(b => !order.includes(b.id))
        return [...result, ...missing]
    }

    _build() {
        const el = document.createElement('div')
        el.id = 'sf-doc-bar-strip'
        document.body.prepend(el)
        this.el = el
        this._populate(el)
    }

    /** Rebuild DOM in-place after panel_config changes (e.g. Supabase sync) */
    applyPanelConfig() {
        if (!this.el) return
        // Preserve refs that were cached
        this._zoomReadout = null
        this._expandTab   = null
        this.el.innerHTML = ''
        this._populate(this.el)
    }

    _populate(el) {
        const order = this._getPanelOrder()
        const currentIds = []

        const renderItem = (b) => {
            if (b.isDivider) {
                el.appendChild(this._divider())
            } else if (b.isTitle) {
                el.appendChild(this._buildTitle())
                currentIds.push('score-name')
            } else if (b.isTrash) {
                el.appendChild(this._buildTrash())
                currentIds.push('trash-can')
            } else {
                el.appendChild(this._btn(b))
                currentIds.push(b.id)
            }
        }

        // ── Nav: head / page-up / page-down ──────────────────────────────────
        this._sortGroup(NAV_BUTTONS, order).forEach(renderItem)

        el.appendChild(this._divider())

        // ── View group: fullscreen | zoom(−|%|+) | fit-width | fit-height | ruler
        this._buildFullscreenBtn(el)
        this._buildZoomGroup(el)
        this._sortGroup(VIEW_BUTTONS, order).forEach(renderItem)

        el.appendChild(this._divider())

        // ── Tool buttons: library | go-to | stamp ────────────────────────────
        this._sortGroup(TOOL_BUTTONS, order).forEach(renderItem)

        // ── Score title fallback — fills remaining space ─────────────────────
        if (!currentIds.includes('score-name')) {
            el.appendChild(this._buildTitle())
        }

        // ── Trash fallback ───────────────────────────────────────────────────
        if (!currentIds.includes('trash-can')) {
            el.appendChild(this._buildTrash())
        }

        // ── Settings / Account (bottom) ───────────────────────────────────────
        el.appendChild(this._divider())
        this._sortGroup(BOTTOM_BUTTONS, order).forEach(renderItem)

        // ── PERSISTENT COLLAPSE TOGGLE (Always at the very end) ───────────────
        this._buildCollapseToggle(el)
    }

    _buildTitle() {
        const title = document.createElement('div')
        title.className = 'sf-doc-score-title empty'
        title.addEventListener('click', () => this.app.scoreDetailManager?.toggle())
        return title
    }

    _buildTrash() {
        const trash = document.createElement('div')
        trash.id = 'sf-doc-trash-btn'
        trash.className = 'sf-doc-trash'
        trash.title = '回收桶 (垃圾點擊切換)'
        trash.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
        </svg>`
        trash.classList.toggle('active', this.app.activeStampType === 'recycle-bin')
        trash.addEventListener('click', () => {
            const isAlreadyActive = this.app.activeStampType === 'recycle-bin'
            this.app.activeStampType = isAlreadyActive ? 'view' : 'recycle-bin'
            this.app.toolManager?.updateActiveTools()
        })
        return trash
    }

    _btn({ id, label, icon, fill, primary, action }) {
        const btn = document.createElement('div')
        btn.className = 'sf-doc-btn' + (primary ? ' primary' : '')
        btn.dataset.activeId = id
        const svgAttrs = fill
            ? `fill="currentColor" stroke="none"`
            : `fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`
        btn.innerHTML = `<svg viewBox="0 0 24 24" ${svgAttrs} width="22" height="22">${icon}</svg>`
                      + `<div class="sf-doc-tip">${label}</div>`
        btn.addEventListener('click', () => action(this.app))
        return btn
    }

    _buildZoomGroup(el) {
        const minus = document.createElement('div')
        minus.className = 'sf-doc-btn sf-doc-zoom-btn'
        minus.title = 'Zoom Out (-)'
        minus.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
        minus.addEventListener('click', () => this.app.changeZoom?.(-0.1))
        el.appendChild(minus)

        const readout = document.createElement('div')
        readout.className = 'sf-doc-zoom-readout'
        readout.title = 'Current zoom'
        readout.textContent = `${Math.round((this.app.scale || 1.5) * 100)}%`
        el.appendChild(readout)
        this._zoomReadout = readout

        const plus = document.createElement('div')
        plus.className = 'sf-doc-btn sf-doc-zoom-btn'
        plus.title = 'Zoom In (+)'
        plus.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
        plus.addEventListener('click', () => this.app.changeZoom?.(0.1))
        el.appendChild(plus)
    }

    _buildFullscreenBtn(el) {
        const ICON_EXPAND = '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'
        const ICON_EXIT   = '<path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 0 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/>'

        const btn = document.createElement('div')
        btn.className = 'sf-doc-btn'
        btn.dataset.activeId = 'doc-fullscreen'
        btn.title = 'Full Screen'
        const updateIcon = () => {
            const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement
                         || document.getElementById('app-root')?.classList.contains('css-fullscreen'))
            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">${isFs ? ICON_EXIT : ICON_EXPAND}</svg>`
                          + `<div class="sf-doc-tip">Full Screen</div>`
            btn.classList.toggle('active', isFs)
        }
        updateIcon()
        btn.addEventListener('click', () => {
            this.app.toggleFullscreen?.()
            setTimeout(updateIcon, 100)
        })
        document.addEventListener('fullscreenchange', updateIcon)
        el.appendChild(btn)
        this._fullscreenBtn = btn
    }

    _divider() {
        const d = document.createElement('div')
        d.className = 'sf-doc-divider'
        return d
    }

    _buildCollapseToggle(el) {
        const btn = document.createElement('div')
        btn.id = 'sf-doc-collapse-btn'
        btn.className = 'sf-doc-btn sf-doc-collapse-btn'
        btn.title = '收合工具列'
        
        // Use a container inside that can be rotated or swapped
        const iconWrap = document.createElement('div')
        iconWrap.style.display = 'flex'
        iconWrap.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        iconWrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>'
        
        btn.appendChild(iconWrap)
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            const isCollapsing = !this.el.classList.contains('collapsed')
            this.toggleCollapse(isCollapsing)
        })

        el.appendChild(btn)
        this._collapseBtn = btn
        this._updateCollapseIcon()
    }

    _updateCollapseIcon() {
        const btn = this._collapseBtn
        if (!btn) return
        const isCollapsed = this.el?.classList.contains('collapsed')
        const iconWrap = btn.querySelector('div')
        if (iconWrap) {
            iconWrap.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'
        }
        btn.title = isCollapsed ? '展開工具列' : '收合工具列'
    }
}
