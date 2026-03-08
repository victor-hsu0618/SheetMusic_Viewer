import { TOOLSETS } from '../constants.js'

export class ToolManager {
    constructor(app) {
        this.app = app
        this.toolsets = TOOLSETS
        this.activeCategories = ['Edit', 'Pens', 'Bow/Fingering']
        this.activeCategory = 'Edit'
        this.activeStampType = 'view'
        this._stampBtnDefault = null
        this.lastUsedToolPerCategory = {}
        this._lastStampType = null
    }

    getIcon(tool, size = 20) {
        if (this.app._svgCache && this.app._svgCache[tool.id]) {
            return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${this.app._svgCache[tool.id]}</svg>`
        }
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${tool.icon}</svg>`
    }

    toggleStampPalette() {
        const isExpanded = this.app.activeToolsContainer.classList.toggle('expanded')
        this.updateActiveTools()
        // If opening, ensure the library/layers aren't overlapping on small screens
        if (isExpanded && window.innerWidth < 800) {
            if (this.app.sidebar) this.app.sidebar.classList.remove('open')
        }
    }

    updateActiveTools() {
        this.app.activeToolsContainer.innerHTML = ""
        const isExpanded = this.app.activeToolsContainer.classList.contains("expanded")

        if (this.app.viewer) {
            if (this.app.viewer.dataset.activeTool !== this.activeStampType) {
                this.app.viewer.dataset.activeTool = this.activeStampType
                this.app.redrawAllAnnotationLayers()
            }
        }

        if (this.app.btnModeHand) this.app.btnModeHand.classList.toggle('active', this.activeStampType === 'view')
        if (this.app.btnModeSelect) this.app.btnModeSelect.classList.toggle('active', this.activeStampType === 'select')
        if (this.app.btnModeEraser) this.app.btnModeEraser.classList.toggle('active', this.activeStampType === 'eraser')
        if (this.app.btnModeAnchor) this.app.btnModeAnchor.classList.toggle('active', this.activeStampType === 'anchor')

        const activeTool = this.toolsets.flatMap(g => g.tools).find(t => t.id === this.activeStampType)
        if (this.app.btnStampPalette) {
            this.app.btnStampPalette.classList.toggle('active', isExpanded || !!activeTool)
            if (!this._stampBtnDefault) this._stampBtnDefault = this.app.btnStampPalette.innerHTML
            this.app.btnStampPalette.innerHTML = activeTool
                ? this.getIcon(activeTool, 18)
                : this._stampBtnDefault
        }

        if (!isExpanded) return

        const header = document.createElement("div")
        header.className = "palette-header"

        const handle = document.createElement("div")
        handle.className = "drag-handle"
        handle.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>`
        handle.onclick = (e) => { e.stopPropagation(); this.toggleStampPalette() }

        const ribbon = document.createElement("div")
        ribbon.className = "stamp-category-ribbon"
        this.toolsets.forEach(group => {
            const isActive = this.activeCategories.includes(group.name)
            const pill = document.createElement("button")
            pill.className = `stamp-cat-pill ${isActive ? "active" : ""}`
            pill.textContent = group.name
            pill.onclick = (e) => {
                e.stopPropagation()
                if (isActive) {
                    if (this.activeCategories.length > 1) this.activeCategories = this.activeCategories.filter(c => c !== group.name)
                } else {
                    this.activeCategories.push(group.name)
                }
                this.app.saveToStorage()
                this.updateActiveTools()
            }
            ribbon.appendChild(pill)
        })
        header.appendChild(handle)
        header.appendChild(ribbon)
        this.app.activeToolsContainer.appendChild(header)

        const grid = document.createElement("div")
        grid.className = "active-tools-grid"
        const activeGroups = this.toolsets.filter(g => this.activeCategories.includes(g.name))
        activeGroups.forEach(group => {
            group.tools.forEach(tool => {
                const wrapper = document.createElement("div")
                wrapper.className = "stamp-tool-wrapper"
                const btn = document.createElement("button")
                btn.className = `stamp-tool ${this.activeStampType === tool.id ? "active" : ""}`
                btn.innerHTML = this.getIcon(tool)
                btn.onclick = (e) => {
                    e.stopPropagation()
                    this.activeStampType = tool.id
                    this.app.activeStampType = tool.id
                    this.updateActiveTools()
                }
                wrapper.appendChild(btn)
                const label = document.createElement("div")
                label.className = "stamp-label"
                label.textContent = tool.label
                wrapper.appendChild(label)
                grid.appendChild(wrapper)
            })
        })
        this.app.activeToolsContainer.appendChild(grid)
    }
}
