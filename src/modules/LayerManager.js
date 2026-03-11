export class LayerManager {
    constructor(app) {
        this.app = app
    }

    init() {
        this.app.externalLayerList = document.getElementById('external-layer-list')
    }

    addNewLayer() {
        // Disabled per user request - we no longer allow adding categories manually
        console.warn('Adding new layers is disabled.')
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
            title: 'Reset to Defaults?',
            message: 'Restore 5 core categories? All current annotations will be moved to "Draw Objects".',
            icon: '🔄',
            type: 'confirm',
            confirmText: 'Reset',
            cancelText: 'Cancel'
        })

        if (!confirmed) return

        // 1. Remap all existing stamps to 'draw' to avoid orphan items
        this.app.stamps.forEach(s => {
            s.layerId = 'draw'
            s.updatedAt = Date.now()
        })

        // 2. Restore core 5 from constants
        this.app.layers = JSON.parse(JSON.stringify(INITIAL_LAYERS))
        this.app.activeLayerId = 'draw'

        this.app.saveToStorage()
        this.renderLayerUI()
        
        // Refresh all pages
        if (this.app.pdf) {
            for (let p = 1; p <= this.app.pdf.numPages; p++) {
                this.app.annotationManager.redrawStamps(p)
            }
        }
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
           ${count > 0 ? `<button class="layer-erase-btn" title="Erase All in this Category"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>` : ''}
        </div>
      `

            // iPad fix: Stop touch propagation
            item.ontouchstart = (e) => e.stopPropagation()

            item.onclick = (e) => {
                if (e.target.closest('.layer-actions')) return
                this.app.activeLayerId = layer.id
                this.renderLayerUI()
                this.app.updateActiveTools()
            }

            const visBtn = item.querySelector('.layer-vis-btn')
            visBtn.onclick = (e) => {
                e.stopPropagation()
                layer.visible = !layer.visible
                layer.updatedAt = Date.now()
                this.renderLayerUI()
                if (this.app.pdf) {
                    for (let p = 1; p <= this.app.pdf.numPages; p++) this.app.redrawStamps(p)
                }
            }

            const eraseBtn = item.querySelector('.layer-erase-btn')
            if (eraseBtn) {
                eraseBtn.onclick = (e) => {
                    e.stopPropagation()
                    this.app.annotationManager.confirmEraseSpecificStamps(layer.name, this.app.stamps.filter(s => s.layerId === layer.id && !s.deleted))
                }
            }

            list.appendChild(item)
        })
    }
}
