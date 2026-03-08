export class LayerManager {
    constructor(app) {
        this.app = app
    }

    addNewLayer() {
        const name = prompt('Enter new category name:')
        if (!name) return

        const id = 'custom_' + Date.now()
        this.app.layers.push({
            id,
            name,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16), // Random color
            visible: true,
            type: 'custom'
        })

        this.app.saveToStorage()
        this.renderLayerUI()
    }

    deleteLayer(layerId) {
        const index = this.app.layers.findIndex(l => l.id === layerId)
        if (index === -1) return

        const layer = this.app.layers[index]
        const isCore = ['draw', 'fingering', 'articulation', 'performance', 'other'].includes(layer.id)
        if (isCore) {
            this.app.showDialog({ title: 'Protected Category', message: 'Cannot delete core system categories.', icon: '🛡️' })
            return
        }

        // Re-route stamps to standard 'draw' layer
        this.app.stamps.forEach(s => {
            if (s.layerId === layerId) s.layerId = 'draw'
        })

        this.app.layers.splice(index, 1)

        if (this.app.activeLayerId === layerId) this.app.activeLayerId = 'draw'

        this.app.saveToStorage()
        this.renderLayerUI()
        if (this.app.pdf) this.app.renderPDF()
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
        this.app.layers = [
            { id: 'draw', name: 'Draw Objects', color: '#ff4757', visible: true, type: 'draw' },
            { id: 'fingering', name: 'Bow/Fingering', color: '#3b82f6', visible: true, type: 'fingering' },
            { id: 'articulation', name: 'Articulations', color: '#10b981', visible: true, type: 'articulation' },
            { id: 'performance', name: 'Performance', color: '#f59e0b', visible: true, type: 'performance' },
            { id: 'other', name: 'Other (Layout)', color: '#64748b', visible: true, type: 'other' }
        ]

        this.app.activeLayerId = 'draw'
        this.app.saveToStorage()
        this.renderLayerUI()
        if (this.app.pdf) this.app.renderPDF()
    }

    updateLayerVisibility() {
        if (this.app.pdf) this.app.renderPDF()
    }

    renderLayerUI() {
        const list = this.app.externalLayerList || this.app.layerList
        if (!list) return
        list.innerHTML = ''

        // Count stamps per layerId
        const countByLayer = {}
        for (const stamp of this.app.stamps) {
            countByLayer[stamp.layerId] = (countByLayer[stamp.layerId] || 0) + 1
        }

        this.app.layers.forEach(layer => {
            if (layer.visible === undefined) layer.visible = true

            const item = document.createElement('div')
            item.className = 'layer-item'

            const eyeIcon = layer.visible
                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`

            const isCore = ['draw', 'fingering', 'bowing', 'articulation', 'performance', 'other'].includes(layer.id)
            const count = countByLayer[layer.id] || 0
            const countBadge = count > 0
                ? `<span class="layer-count-badge">${count}</span>`
                : ''

            item.innerHTML = `
                <div class="layer-info">
                  <div class="color-dot" style="background:${layer.color}"></div>
                  <div class="layer-meta">
                    <span class="layer-name">${layer.name}${countBadge}</span>
                  </div>
                </div>
                <div class="layer-actions">
                   <button class="layer-vis-btn ${layer.visible ? 'visible' : 'inactive'}" title="${layer.visible ? 'Hide' : 'Show'}">
                     ${eyeIcon}
                   </button>
                   ${!isCore ? `<button class="btn-delete-layer" title="Delete Category">✕</button>` : ''}
                </div>
            `

            const btn = item.querySelector('.layer-vis-btn')
            btn.addEventListener('click', (e) => {
                e.stopPropagation()
                layer.visible = !layer.visible
                this.updateLayerVisibility()
                this.renderLayerUI()
            })

            const delBtn = item.querySelector('.btn-delete-layer')
            if (delBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation()
                    this.deleteLayer(layer.id)
                })
            }

            list.appendChild(item)
        })
    }
}
