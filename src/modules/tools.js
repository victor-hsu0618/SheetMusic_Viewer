export class ToolManager {
    constructor(app) {
        this.app = app
        this._stampBtnDefault = null
        this._lastPaletteToggleTime = 0
        this._stampDragMoved = false
        this._isDragging = false
        this._dragStartX = 0
        this._dragStartY = 0
        this._dragInitialLeft = 0
        this._dragInitialTop = 0
        this.isStampPaletteOpen = false
    }

    enableClickToScroll(el) {
        if (!el) return
        let isDown = false
        let startX
        let scrollLeft

        const start = (pageX) => {
            isDown = true
            el.classList.add('dragging')
            startX = pageX - el.offsetLeft
            scrollLeft = el.scrollLeft
            el.style.cursor = 'grabbing'
            el.style.userSelect = 'none'
        }

        const end = () => {
            isDown = false
            el.classList.remove('dragging')
            el.style.cursor = ''
            el.style.userSelect = ''
        }

        const move = (pageX) => {
            if (!isDown) return
            const x = pageX - el.offsetLeft
            const walk = (x - startX) * 2
            el.scrollLeft = scrollLeft - walk
        }

        el.addEventListener('mousedown', (e) => start(e.pageX))
        el.addEventListener('touchstart', (e) => start(e.touches[0].pageX), { passive: true })

        el.addEventListener('mouseleave', end)
        el.addEventListener('mouseup', end)
        el.addEventListener('touchend', end)

        el.addEventListener('mousemove', (e) => {
            if (isDown) e.preventDefault()
            move(e.pageX)
        })
        el.addEventListener('touchmove', (e) => {
            if (isDown) {
                // Do NOT preventDefault here if we want native scroll to potentially kick in,
                // but since we are doing custom horizontal scroll, we usually prevent it.
                // However, the palette is already preventing it globally.
                move(e.touches[0].pageX)
            }
        }, { passive: true })
    }

    async preloadSvgs() {
        const existingSvgs = [
            'pen', 'highlighter', 'line',
            'select', 'eraser',
            'anchor'
        ]
        const base = import.meta.env.BASE_URL
        const items = this.app.toolsets.flatMap(g =>
            g.tools.filter(t => existingSvgs.includes(t.id)).map(t => ({ id: t.id, path: `${base}assets/icons/${g.type}/${t.id}.svg` }))
        )
        await Promise.allSettled(items.map(async ({ id, path }) => {
            try {
                const r = await fetch(path)
                if (r.ok) this.app._svgCache[id] = await r.text()
            } catch { }
        }))
        this.updateActiveTools()
    }

    getIcon(tool, size = 24, color = null) {
        const strokeColor = color || 'currentColor'
        if (this.app._svgCache?.[tool.id]) {
            // Strip existing width/height and inject the correct size and color
            return this.app._svgCache[tool.id].replace(/<svg\b([^>]*)>/, (_, attrs) => {
                const a = attrs.replace(/\s+width="[^"]*"/, '').replace(/\s+height="[^"]*"/, '')
                return `<svg${a} width="${size}" height="${size}" style="color: ${strokeColor};">`
            })
        }
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke="${strokeColor}" stroke-width="1.3" fill="none" style="color: ${strokeColor};">${tool.icon}</svg>`
    }

    updateActiveTools() {
        const toolType = this.app.activeStampType;
        if (this.app.viewer) {
            this.app.viewer.dataset.activeTool = toolType;
            document.body.dataset.activeTool = toolType;

            if (toolType !== 'view') {
                this.app.redrawAllAnnotationLayers();
            } else {
                requestAnimationFrame(() => this.app.redrawAllAnnotationLayers());
            }

            this.app.annotationManager?.interaction?.updateAllOverlaysTouchAction();
            this.app?.rulerManager?.updateRulerMarks();
            
            // Sync UI button states
            this.app.editStripManager?.update();
            this.app.docBarStripManager?.update();
        }
    }

    /** Legacy methods removed to streamline UI */
    initDraggable() {}
    initToolbarResizable() {}
    toggleStampPalette() {}
}
