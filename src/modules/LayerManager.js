export class LayerManager {
    constructor(app) {
        this.app = app
    }

    init() {
        this.app.layerShelf = document.getElementById('layer-shelf')
        this.app.layerToggleBtn = document.getElementById('layer-toggle-fab')
        this.app.closeLayerShelfBtn = document.getElementById('close-layer-shelf')
        this.app.externalLayerList = document.getElementById('external-layer-list')

        if (this.app.layerToggleBtn) {
            this.app.layerToggleBtn.addEventListener('click', () => {
                this.app.layerShelf.classList.toggle('active')
                if (this.app.layerShelf.classList.contains('active')) this.renderLayerUI()
            })
        }

        if (this.app.closeLayerShelfBtn) {
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
            const isInput = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA'
            if (isInput) return

            if (e.shiftKey && e.key === 'V') {
                if (this.app.layerShelf) this.app.layerShelf.classList.toggle('active')
                if (this.app.layerShelf.classList.contains('active')) this.renderLayerUI()
            }
        })

        this.initDraggable()
    }

    initDraggable() {
        let isDragging = false
        let startX, startY, initialX = 0, initialY = 0
        const el = this.app.layerShelf
        if (!el) return
        const handle = el.querySelector('.jump-drag-handle')

        const start = (e) => {
            if (e.target.closest('button') || e.target.closest('input')) return
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

            const style = window.getComputedStyle(el)
            const matrix = new WebKitCSSMatrix(style.transform)
            initialX = matrix.m41
            initialY = matrix.m42

            startX = clientX
            startY = clientY
            isDragging = true
            el.style.transition = 'none'
        }

        const move = (e) => {
            if (!isDragging) return
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

            const dx = clientX - startX
            const dy = clientY - startY

            el.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`
        }

        const end = () => {
            isDragging = false
            el.style.transition = ''
        }

        if (handle) {
            handle.addEventListener('mousedown', start)
            document.addEventListener('mousemove', move)
            document.addEventListener('mouseup', end)

            handle.addEventListener('touchstart', (e) => start(e), { passive: false })
            document.addEventListener('touchmove', move, { passive: false })
            document.addEventListener('touchend', end)
        }
    }

    addNewLayer() {
        const name = prompt('Notation Category Name (e.g., Bowing, Vibrato):')
        if (!name) return

        const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ff4757']
        const color = colors[this.app.layers.length % colors.length]
        const id = `layer_${Date.now()}`

        this.app.layers.push({
            id,
            name,
            color,
            visible: true,
            type: 'custom',
            updatedAt: Date.now()
        })

        this.app.activeLayerId = id
        this.app.saveToStorage()
        this.renderLayerUI()
        if (this.app.pdf) this.app.viewerManager.renderPDF()
    }

    deleteLayer(layerId) {
        const index = this.app.layers.findIndex(l => l.id === layerId)
        if (index === -1) return

        const layer = this.app.layers[index]
        if (layer.type !== 'custom') {
            this.app.showDialog({
                title: 'Protected Category',
                message: 'Cannot delete core system categories.',
                icon: '🛡️'
            })
            return
        }

        // Remap stamps to 'draw'
        this.app.stamps.forEach(s => {
            if (s.layerId === layerId) s.layerId = 'draw'
        })

        this.app.layers.splice(index, 1)
        if (this.app.activeLayerId === layerId) this.app.activeLayerId = 'draw'

        this.app.saveToStorage()
        this.renderLayerUI()
        if (this.app.pdf) this.app.viewerManager.renderPDF()
    }

    async resetLayers() {
        const confirmed = await this.app.showDialog({
            title: 'Reset Categories?',
            message: 'This will restore default categories and move custom notations to "Draw Objects". Continue?',
            icon: '⚠️',
            type: 'confirm'
        })

        if (!confirmed) return

        this.app.stamps.forEach(s => s.layerId = 'draw')
        this.app.layers = JSON.parse(JSON.stringify(this.app.INITIAL_LAYERS))
        this.app.activeLayerId = 'draw'

        this.app.saveToStorage()
        this.renderLayerUI()
        if (this.app.pdf) this.app.viewerManager.renderPDF()
    }

    renderLayerUI() {
        const list = this.app.externalLayerList || this.app.layerList
        if (!list) return
        list.innerHTML = ''

        const countByLayer = {}
        this.app.stamps.forEach(s => {
            countByLayer[s.layerId] = (countByLayer[s.layerId] || 0) + 1
        })

        this.app.layers.forEach(layer => {
            const item = document.createElement('div')
            item.className = `layer-item ${this.app.activeLayerId === layer.id ? 'active' : ''}`

            const count = countByLayer[layer.id] || 0
            const countBadge = count > 0 ? `<span class="layer-count-badge">${count}</span>` : ''

            const eyeIcon = layer.visible
                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`

            item.innerHTML = `
        <div class="layer-info">
          <div class="color-dot" style="background:${layer.color}"></div>
          <div class="layer-meta">
            <span class="layer-name">${layer.name} ${countBadge}</span>
          </div>
        </div>
        <div class="layer-actions">
           <button class="layer-vis-btn ${layer.visible ? 'visible' : 'inactive'}" title="${layer.visible ? 'Hide' : 'Show'}">
             ${eyeIcon}
           </button>
           ${layer.type === 'custom' ? '<button class="btn-delete-layer">✕</button>' : ''}
        </div>
      `

            // iPad fix: Stop touch propagation to prevent double-tap gesture from triggering stamp bar
            item.ontouchstart = (e) => e.stopPropagation()

            item.onclick = (e) => {
                if (e.target.closest('.layer-actions')) return
                this.app.activeLayerId = layer.id
                this.renderLayerUI()
                this.app.updateActiveTools()
            }

            const visBtn = item.querySelector('.layer-vis-btn')
            visBtn.ontouchstart = (e) => e.stopPropagation()
            visBtn.onclick = (e) => {
                e.stopPropagation()
                layer.visible = !layer.visible
                layer.updatedAt = Date.now()
                this.renderLayerUI()
                if (this.app.pdf) {
                    for (let p = 1; p <= this.app.pdf.numPages; p++) this.app.redrawStamps(p)
                }
            }

            const delBtn = item.querySelector('.btn-delete-layer')
            if (delBtn) {
                delBtn.ontouchstart = (e) => e.stopPropagation()
                delBtn.onclick = (e) => {
                    e.stopPropagation()
                    this.deleteLayer(layer.id)
                }
            }

            list.appendChild(item)
        })
    }
}
