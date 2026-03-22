import '../styles/doc-bar.css'


const NAV_BUTTONS = [
    {
        id: 'doc-head',
        label: 'Jump to Head',
        icon: '<polyline points="17 11 12 6 7 11"/><polyline points="17 17 12 12 7 17"/><line x1="5" y1="5" x2="19" y2="5"/>',
        primary: true,
        action: (app) => { if (app.viewer) app.viewer.scrollTop = 0 },
    },
    {
        id: 'doc-up',
        label: 'Page Up',
        icon: '<polyline points="18 15 12 9 6 15"/>',
        primary: true,
        action: (app) => app.jump?.(-1),
    },
    {
        id: 'doc-down',
        label: 'Page Down',
        icon: '<polyline points="6 9 12 15 18 9"/>',
        primary: true,
        action: (app) => app.jump?.(1),
    },
    {
        id: 'doc-ruler',
        label: 'Toggle Ruler (R)',
        icon: '<rect x="2" y="8" width="20" height="8" rx="1"/>'
            + '<line x1="6"  y1="8" x2="6"  y2="13"/>'
            + '<line x1="10" y1="8" x2="10" y2="11"/>'
            + '<line x1="14" y1="8" x2="14" y2="11"/>'
            + '<line x1="18" y1="8" x2="18" y2="13"/>',
        action: (app) => app.rulerManager?.toggleRuler(),
    },
]

const TOOL_BUTTONS = [
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
        id: 'doc-view-panel',
        label: 'View Inspector',
        icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
        action: (app) => app.viewPanelManager?.togglePanel(),
    },
    {
        id: 'doc-stamp',
        label: 'Stamp Palette (T)',
        icon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
        action: (app) => app.toolManager?.toggleStampPalette(),
    },
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
    }

    init() {
        this._build()
    }

    /** Call after a score loads to show the title */
    updateTitle(title) {
        const el = this.el?.querySelector('.sf-doc-score-title')
        if (!el) return
        el.textContent = title || ''
        el.classList.toggle('empty', !title)
    }

    /** Refresh active states (ruler toggle) */
    update() {
        if (!this.el) return
        const rulerBtn = this.el.querySelector('[data-activeId="doc-ruler"]')
        if (rulerBtn) {
            rulerBtn.classList.toggle('active', !!this.app.rulerManager?.rulerVisible)
        }
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    _build() {
        const el = document.createElement('div')
        el.id = 'sf-doc-bar-strip'
        document.body.prepend(el)
        this.el = el

        // Nav buttons
        NAV_BUTTONS.forEach(b => el.appendChild(this._btn(b)))

        el.appendChild(this._divider())

        // Tool buttons
        TOOL_BUTTONS.forEach(b => el.appendChild(this._btn(b)))

        // Score title — fills all remaining space
        const title = document.createElement('div')
        title.className = 'sf-doc-score-title empty'
        title.addEventListener('click', () => this.app.scoreDetailManager?.toggle())
        el.appendChild(title)

        // Trash drop zone — drag annotations here to delete
        const trash = document.createElement('div')
        trash.id = 'sf-doc-trash-btn'
        trash.className = 'sf-doc-trash'
        trash.title = 'Drop here to delete'
        trash.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4h6v2"/>
        </svg>`
        el.appendChild(trash)
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

    _divider() {
        const d = document.createElement('div')
        d.className = 'sf-doc-divider'
        return d
    }
}
