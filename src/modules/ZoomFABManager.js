import '../styles/zoom-fab.css'

/**
 * ZoomFABManager
 * ──────────────
 * A standalone, floating "Debug Console" style zoom controller.
 * Displays current zoom percentage and expands into a control capsule.
 */
export class ZoomFABManager {
    constructor(app) {
        this.app = app
        this.el = null
        this.readout = null
        this.capsule = null
        this._expanded = false
        this._lastZoom = 0
    }

    init() {
        // Create main container
        const container = document.createElement('div')
        container.id = 'sf-zoom-fab-container'
        container.className = 'sf-zoom-fab-idle' // Start in idle/collapsed state
        
        // 1. The main FAB button (Readout)
        const fab = document.createElement('div')
        fab.className = 'sf-zoom-fab-trigger'
        fab.innerHTML = `
            <span class="sf-zoom-val">100%</span>
        `
        this.readout = fab.querySelector('.sf-zoom-val')
        
        // 2. The Capsule Menu (Hidden by default)
        const capsule = document.createElement('div')
        capsule.className = 'sf-zoom-capsule'
        capsule.innerHTML = `
            <button class="sf-zoom-cap-btn" data-action="fit-w" title="Fit to Width">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12H3M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/></svg>
            </button>
            <button class="sf-zoom-cap-btn" data-action="fit-h" title="Fit to Height">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M12 3L8 7M12 3l4 4M12 21l-4-4M12 21l4-4"/></svg>
            </button>
            <div class="sf-zoom-cap-divider"></div>
            <button class="sf-zoom-cap-btn" data-action="zoom-in" title="Zoom In">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <button class="sf-zoom-cap-btn" data-action="zoom-out" title="Zoom Out">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
        `

        container.appendChild(capsule)
        container.appendChild(fab)
        document.body.appendChild(container)
        this.el = container
        this.capsule = capsule

        // Event Listeners
        fab.addEventListener('click', (e) => {
            e.stopPropagation()
            this.toggle()
        })

        capsule.querySelectorAll('.sf-zoom-cap-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                const action = btn.dataset.action
                this._handleAction(action)
                // Optional: auto-collapse after fit actions? No, keep it open for fine-tuning.
            })
        })

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (this._expanded && !container.contains(e.target)) {
                this.collapse()
            }
        })

        // Initial sync
        this.sync()
        
        // Hook into ViewerManager if possible (periodical check or via proxy)
        setInterval(() => this.sync(), 500)
    }

    sync() {
        const zoom = this.app.viewerManager?.currentZoom || 1.0
        if (Math.abs(zoom - this._lastZoom) < 0.001) return
        
        this._lastZoom = zoom
        const percent = Math.round(zoom * 100)
        if (this.readout) {
            this.readout.textContent = `${percent}%`
            // Visual feedback on value change
            this.readout.classList.remove('pop')
            void this.readout.offsetWidth // trigger reflow
            this.readout.classList.add('pop')
        }
    }

    toggle() {
        if (this._expanded) this.collapse()
        else this.expand()
    }

    expand() {
        this._expanded = true
        this.el.classList.add('expanded')
    }

    collapse() {
        this._expanded = false
        this.el.classList.remove('expanded')
    }

    _handleAction(action) {
        switch (action) {
            case 'fit-w':
                this.app.fitToWidth?.()
                break
            case 'fit-h':
                this.app.fitToHeight?.()
                break
            case 'zoom-in':
                this.app.changeZoom?.(0.2)
                break
            case 'zoom-out':
                this.app.changeZoom?.(-0.2)
                break
        }
        // Force sync immediately
        setTimeout(() => this.sync(), 50)
    }
}
