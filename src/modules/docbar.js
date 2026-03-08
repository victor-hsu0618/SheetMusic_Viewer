export class DocBarManager {
    constructor(app) {
        this.app = app
    }

    init() {
        this.app.docBar = document.getElementById('floating-doc-bar')
        this.app.docBarToggleBtn = document.getElementById('btn-doc-bar-toggle')

        this.app.zoomLevelDisplay = document.getElementById('zoom-level')


        this.app.layerShelf = document.getElementById('layer-shelf')
        this.app.layerToggleBtn = document.getElementById('layer-toggle-fab')
        this.app.closeLayerShelfBtn = document.getElementById('close-layer-shelf')

        this.initDraggable()
        this.initEventListeners()
    }

    initEventListeners() {
        // Control Suite Collapsible Toggle


        // Doc Bar Toggle
        if (this.app.docBarToggleBtn) {
            this.app.docBarToggleBtn.addEventListener('click', () => this.toggleDocBar())
        }

        // Navigation (Jump) Actions
        const btnJumpHead = document.getElementById('btn-jump-head')
        if (btnJumpHead) btnJumpHead.onclick = () => this.app.goToHead()

        const btnJumpEnd = document.getElementById('btn-jump-end')
        if (btnJumpEnd) btnJumpEnd.onclick = () => this.app.goToEnd()

        const btnFullscreen = document.getElementById('btn-fullscreen')
        if (btnFullscreen) btnFullscreen.addEventListener('click', () => this.app.toggleFullscreen())

        // Quick Mode Actions
        const btnModeHand = document.getElementById('btn-mode-hand')
        if (btnModeHand) {
            btnModeHand.onclick = () => {
                this.app.activeStampType = 'view'
                this.app.updateActiveTools()
            }
        }

        const btnModeEraser = document.getElementById('btn-mode-eraser')
        if (btnModeEraser) {
            btnModeEraser.onclick = () => {
                this.app.activeStampType = this.app.activeStampType === 'eraser' ? 'view' : 'eraser'
                this.app.updateActiveTools()
            }
        }

        const closeEraseAll = document.getElementById('close-erase-all-modal')
        if (closeEraseAll) closeEraseAll.addEventListener('click', () => this.app.annotationManager.closeEraseAllModal())

        const cancelEraseAll = document.getElementById('erase-all-cancel')
        if (cancelEraseAll) cancelEraseAll.addEventListener('click', () => this.app.annotationManager.closeEraseAllModal())

        const btnStampPalette = document.getElementById('btn-stamp-palette')
        if (btnStampPalette) {
            btnStampPalette.addEventListener('click', () => {
                this.app.toolManager.toggleStampPalette()
            })
        }

        // Layer Shelf Toggles
        if (this.app.layerToggleBtn) {
            this.app.layerToggleBtn.addEventListener('touchstart', (e) => e.stopPropagation())
            this.app.layerToggleBtn.addEventListener('click', () => {
                this.app.layerShelf.classList.toggle('active')
                if (this.app.layerShelf.classList.contains('active')) this.app.renderLayerUI()
            })
        }

        if (this.app.closeLayerShelfBtn) {
            this.app.closeLayerShelfBtn.addEventListener('touchstart', (e) => e.stopPropagation())
            this.app.closeLayerShelfBtn.addEventListener('click', () => {
                this.app.layerShelf.classList.remove('active')
            })
        }

        if (this.app.layerShelf) {
            this.app.layerShelf.addEventListener('touchstart', (e) => e.stopPropagation())
        }

        // iPad pointer containment
        document.addEventListener('touchstart', (e) => {
            if (this.app.layerShelf &&
                this.app.layerShelf.classList.contains('active') &&
                !this.app.layerShelf.contains(e.target) &&
                !this.app.layerToggleBtn.contains(e.target)) {
                this.app.layerShelf.classList.remove('active')
            }
        }, { passive: true })

        // Keyboard Shortcut for Layers
        document.addEventListener('keydown', (e) => {
            if (e.shiftKey && e.key === 'V') {
                if (this.app.layerShelf) this.app.layerShelf.classList.toggle('active')
            }
        })
    }

    toggleDocBar() {
        if (!this.app.docBar) return
        if (this.app.docBar._wasDragging) return
        this.app.docBar.classList.toggle('collapsed')
        localStorage.setItem('scoreflow_doc_bar_collapsed', this.app.docBar.classList.contains('collapsed'))
    }

    initDraggable() {
        let isDragging = false
        let startX, startY, initialX, initialY, xOffset = 0, yOffset = 0
        let dragDistance = 0
        const el = this.app.docBar
        if (!el) return

        const dragStart = (e) => {
            // In expanded mode, only drag-handle works. In collapsed mode, the whole bar (the button) works.
            const isCollapsed = el.classList.contains('collapsed')
            if (!isCollapsed && !e.target.closest(".doc-drag-handle")) return

            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

            startX = clientX
            startY = clientY
            initialX = clientX - xOffset
            initialY = clientY - yOffset
            isDragging = true
            dragDistance = 0
        }

        const drag = (e) => {
            if (isDragging) {
                const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
                const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

                const dx = clientX - startX
                const dy = clientY - startY
                dragDistance = Math.sqrt(dx * dx + dy * dy)

                currentX = clientX - initialX
                currentY = clientY - initialY
                xOffset = currentX
                yOffset = currentY
                el.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`
            }
        }

        const dragEnd = () => {
            initialX = currentX
            initialY = currentY
            isDragging = false
            // If we moved more than 5px, consider it a drag and prevent the next click
            if (dragDistance > 5) {
                el._wasDragging = true
                setTimeout(() => { el._wasDragging = false }, 50)
            }
        }

        let currentX, currentY

        el.addEventListener("mousedown", (e) => {
            e.stopPropagation()
            dragStart(e)
        })
        document.addEventListener("mousemove", drag)
        document.addEventListener("mouseup", dragEnd)

        el.addEventListener("touchstart", (e) => {
            e.stopPropagation() // Prevent triggering viewer gestures
            const isCollapsed = el.classList.contains('collapsed')
            if (!isCollapsed && !e.target.closest(".doc-drag-handle")) return
            dragStart(e)
        }, { passive: false })

        document.addEventListener("touchmove", (e) => {
            if (isDragging) {
                e.preventDefault()
                drag(e)
            }
        }, { passive: false })

        el.addEventListener("touchend", (e) => {
            e.stopPropagation()
            dragEnd()
        })
    }
}
