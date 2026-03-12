export class DocBarManager {
    constructor(app) {
        this.app = app
    }

    init() {
        this.app.docBar = document.getElementById('floating-doc-bar')
        this.app.zoomLevelDisplay = document.getElementById('zoom-level')

        // Restore hidden state
        if (localStorage.getItem('scoreflow_doc_bar_hidden') === 'true') {
            this.app.docBar?.classList.add('doc-hidden')
        }

        this.initGrip()
        this.initGripPositionSetting()
    }

    applyGripPosition(pos) {
        const el = this.app.docBar
        if (!el) return
        el.classList.toggle('grip-right', pos === 'right')
        localStorage.setItem('scoreflow_grip_position', pos)
        document.querySelectorAll('[data-grip]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.grip === pos)
        })
    }

    initGripPositionSetting() {
        const saved = localStorage.getItem('scoreflow_grip_position') || 'right'
        this.applyGripPosition(saved)
        document.querySelectorAll('[data-grip]').forEach(btn => {
            btn.addEventListener('click', () => this.applyGripPosition(btn.dataset.grip))
        })
    }

    toggleDocBar() {
        if (!this.app.docBar) return
        this.app.docBar.classList.toggle('collapsed')
        localStorage.setItem('scoreflow_doc_bar_collapsed', this.app.docBar.classList.contains('collapsed'))
    }

    toggleDocBarHidden(force = null) {
        const el = this.app.docBar
        if (!el) return
        const hidden = force !== null ? force : !el.classList.contains('doc-hidden')
        el.classList.toggle('doc-hidden', hidden)
        localStorage.setItem('scoreflow_doc_bar_hidden', hidden)
    }

    // Grip: tap → toggle collapsed/expanded
    // Hide button (⌄): tap → hide doc bar
    // Show: long press in bottom 15% of viewer (handled in InputManager)
    initGrip() {
        const el = this.app.docBar
        if (!el) return
        const handle = el.querySelector('.doc-drag-handle')
        if (handle) handle.addEventListener('click', () => this.toggleDocBar())

        document.getElementById('btn-hide-docbar')
            ?.addEventListener('click', () => this.toggleDocBarHidden(true))
    }
}
