export class InteractionManager {
    constructor(app) {
        this.app = app;
    }

    /**
     * Create the interactive overlay (capture-overlay) for a page and attach all mouse/touch event listeners.
     * This handles drawing preview, tool interaction, and gesture passthrough.
     * 
     * @param {HTMLElement} wrapper - The page-container element.
     * @param {number} pageNum - The page number.
     * @param {number} width - Page width in pixels.
     * @param {number} height - Page height in pixels.
     */
    createCaptureOverlay(wrapper, pageNum, width, height) {
        const overlay = document.createElement('div')
        overlay.className = 'capture-overlay'
        overlay.dataset.page = pageNum
        overlay.style.width = `${width}px`
        overlay.style.height = `${height}px`

        let isInteracting = false
        let activeObject = null // Can be a new path or an existing stamp being moved
        let isMovingExisting = false
        let isPanning = false

        // Temporary tracking states (managed via app instance)
        this.app.hoveredStamp = null
        this.app.selectHoveredStamp = null

        /**
         * Get normalized (0-1) coordinates from mouse/touch event relative to overlay.
         */
        const getPos = (e) => {
            const rect = overlay.getBoundingClientRect()
            const clientX = e.clientX || (e.touches && e.touches[0].clientX)
            const clientY = e.clientY || (e.touches && e.touches[0].clientY)
            return {
                x: (clientX - rect.left) / rect.width,
                y: (clientY - rect.top) / rect.height
            }
        }

        // --- STAMP PREVIEW CONFIGURE ---
        const STAMP_OFFSET_X_PX = 15
        const STAMP_OFFSET_Y_PX = 30
        const EDGE_THRESHOLD_X = 0.15  // flip X when cursor within 15% of RIGHT edge
        const EDGE_THRESHOLD_Y = 0.12  // flip Y when cursor within 12% of BOTTOM edge

        /**
         * Compute preview position for stamps (offset from cursor).
         * Includes boundary compensation for right and bottom edges.
         */
        const getStampPreviewPos = (pos) => {
            const rect = overlay.getBoundingClientRect()
            // X: binary flip near right page edge
            const nearRight = pos.x > 1 - EDGE_THRESHOLD_X
            const dx = (nearRight ? 1 : -1) * STAMP_OFFSET_X_PX / rect.width

            // Y: smooth lerp near viewport bottom
            const cursorScreenY = rect.top + pos.y * rect.height
            const distFromBottom = window.innerHeight - cursorScreenY
            const TRANSITION_PX = STAMP_OFFSET_Y_PX * 4  // lerp zone height
            let dyPx
            if (distFromBottom >= TRANSITION_PX) {
                dyPx = -STAMP_OFFSET_Y_PX          // normal: above cursor
            } else if (distFromBottom <= 0) {
                dyPx = STAMP_OFFSET_Y_PX           // past viewport bottom: below cursor
            } else {
                // Smooth interpolation
                const t = 1 - distFromBottom / TRANSITION_PX
                dyPx = -STAMP_OFFSET_Y_PX + t * STAMP_OFFSET_Y_PX * 2
            }
            return {
                x: Math.max(0.01, Math.min(0.99, pos.x + dx)),
                y: Math.max(0.01, Math.min(0.99, pos.y + dyPx / rect.height))
            }
        }

        /**
         * Draw a dashed leader line between cursor and offset preview.
         */
        const drawLeaderLine = (ctx, canvas, cursorPos, previewPos) => {
            const scale = this.app.scale / 1.5
            ctx.save()
            ctx.setLineDash([5 * scale, 4 * scale])
            ctx.strokeStyle = 'rgba(80, 80, 80, 0.4)'
            ctx.lineWidth = 1.2 * scale
            ctx.beginPath()
            ctx.moveTo(cursorPos.x * canvas.width, cursorPos.y * canvas.height)
            ctx.lineTo(previewPos.x * canvas.width, previewPos.y * canvas.height)
            ctx.stroke()
            ctx.restore()
        }

        // --- ACTION HANDLERS ---

        const startAction = (e) => {
            const pos = getPos(e)
            const toolType = this.app.activeStampType

            // View mode: drag-to-pan (mouse only; touch uses native scroll)
            if (toolType === 'view') {
                if (e.type !== 'touchstart') {
                    isPanning = true
                    const startX = e.clientX, startY = e.clientY
                    const startScrollTop = this.app.viewer.scrollTop
                    const startScrollLeft = this.app.viewer.scrollLeft
                    overlay.style.cursor = 'grabbing'
                    e.preventDefault()
                    // Disable smooth scroll during drag
                    this.app.viewer.style.scrollBehavior = 'auto'
                    const doPan = (ev) => {
                        if (!isPanning) return
                        this.app.viewer.scrollTop = startScrollTop - (ev.clientY - startY)
                        this.app.viewer.scrollLeft = startScrollLeft - (ev.clientX - startX)
                    }
                    const stopPan = () => {
                        isPanning = false
                        overlay.style.cursor = ''
                        this.app.viewer.style.scrollBehavior = ''
                        window.removeEventListener('mousemove', doPan)
                        window.removeEventListener('mouseup', stopPan)
                    }
                    window.addEventListener('mousemove', doPan)
                    window.addEventListener('mouseup', stopPan)
                }
                return
            }

            // Allow multi-touch gestures to pass through
            if (e.type === 'touchstart' && e.touches && e.touches.length > 1) {
                return
            }

            if (e.type === 'touchstart') e.preventDefault()
            isInteracting = true

            const isFreehand = ['pen', 'highlighter', 'line'].includes(toolType)

            if (toolType === 'select' || toolType === 'recycle-bin') {
                const target = this.app.selectHoveredStamp
                    || this.app.findClosestStamp(pageNum, pos.x, pos.y, true)

                if (!target) {
                    isInteracting = false
                } else {
                    if (toolType === 'recycle-bin') {
                        // RECYCLE ACTION: Move to bin
                        this.app.stamps = this.app.stamps.filter(s => s !== target)
                        let toolDef = null
                        for (const set of this.app.toolsets) {
                            const tool = set.tools.find(t => t.id === target.type)
                            if (tool) { toolDef = tool; break }
                        }
                        this.app.recycleItems.push({
                            ...target,
                            label: toolDef ? toolDef.label : target.type,
                            icon: toolDef ? toolDef.icon : ''
                        })
                        this.app.saveToStorage()
                        this.app.redrawStamps(pageNum)
                        this.app.updateActiveTools()
                        isInteracting = false
                    } else {
                        // NORMAL SELECT: Start Move
                        isMovingExisting = true
                        activeObject = target
                        this.app.lastFocusedStamp = activeObject
                        this.app._dragLastPos = pos
                        this.app.selectHoveredStamp = null
                        this.app.redrawStamps(pageNum)
                    }
                }
            } else if (isFreehand) {
                activeObject = {
                    type: toolType,
                    page: pageNum,
                    layerId: 'draw',
                    sourceId: this.app.activeSourceId,
                    points: [pos],
                    color: this.app.layers.find(l => l.id === 'draw').color
                }
            } else if (toolType === 'eraser') {
                const nearby = this.app.findNearbyStamps(pageNum, pos.x, pos.y)
                if (nearby.length === 1) {
                    this.app.eraseStampTarget(nearby[0])
                } else if (nearby.length > 1) {
                    const clientX = e.clientX || (e.touches && e.touches[0].clientX)
                    const clientY = e.clientY || (e.touches && e.touches[0].clientY)
                    this.app.showEraseMenu(nearby, clientX, clientY)
                }
                isInteracting = false
            } else {
                // Precise Placement for Stamps
                let targetLayerId = 'draw'
                const group = this.app.toolsets.find(g => g.tools.some(t => t.id === toolType))
                if (group) {
                    const layer = this.app.layers.find(l => l.type === group.type)
                    if (layer) targetLayerId = layer.id
                }

                const previewPos = getStampPreviewPos(pos)
                activeObject = {
                    page: pageNum,
                    layerId: targetLayerId,
                    sourceId: this.app.activeSourceId,
                    type: toolType,
                    x: previewPos.x,
                    y: previewPos.y,
                    data: null
                }
                this.app.lastFocusedStamp = activeObject
            }
        }

        const moveAction = (e) => {
            if (!isInteracting || !activeObject) return
            const pos = getPos(e)

            if (isMovingExisting) {
                if (activeObject.points) {
                    const dx = pos.x - (this.app._dragLastPos?.x ?? pos.x)
                    const dy = pos.y - (this.app._dragLastPos?.y ?? pos.y)
                    activeObject.points = activeObject.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
                } else {
                    activeObject.x = pos.x
                    activeObject.y = pos.y
                }
                this.app._dragLastPos = pos
                this.app.redrawStamps(pageNum)
            } else if (activeObject.points) {
                if (this.app.activeStampType === 'line') {
                    activeObject.points[1] = pos
                } else {
                    activeObject.points.push(pos)
                }
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
                if (canvas) this.app.drawPathOnCanvas(canvas.getContext('2d'), canvas, activeObject)
            } else {
                // Preview new stamp
                const previewPos = getStampPreviewPos(pos)
                activeObject.x = previewPos.x
                activeObject.y = previewPos.y
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
                const ctx = canvas.getContext('2d')
                this.app.redrawStamps(pageNum)
                const layer = this.app.layers.find(l => l.id === activeObject.layerId)
                this.app.drawStampOnCanvas(ctx, canvas, activeObject, layer ? layer.color : '#000000', true)
                if (!e.touches) drawLeaderLine(ctx, canvas, pos, previewPos)
            }
        }

        const hoverAction = (e) => {
            // Eraser hover
            if (this.app.activeStampType === 'eraser' && !isInteracting) {
                const pos = getPos(e)
                const found = this.app.findClosestStamp(pageNum, pos.x, pos.y)
                if (found !== this.app.hoveredStamp) {
                    this.app.hoveredStamp = found
                    this.app.redrawStamps(pageNum)
                    const oldChip = wrapper.querySelector('.erase-hover-chip')
                    if (oldChip) oldChip.remove()
                    if (found) {
                        const canvas = wrapper.querySelector('.pdf-canvas')
                        if (canvas) {
                            const chipX = found.x != null ? found.x * canvas.offsetWidth : (found.points?.[0]?.x ?? 0) * canvas.offsetWidth
                            const chipY = found.y != null ? found.y * canvas.offsetHeight : (found.points?.[0]?.y ?? 0) * canvas.offsetHeight
                            const chip = document.createElement('div')
                            chip.className = 'erase-hover-chip'
                            chip.textContent = '🗑 Delete'
                            chip.style.left = `${chipX}px`
                            chip.style.top = `${chipY}px`
                            wrapper.appendChild(chip)
                        }
                    }
                }
            }

            // Select / Recycle Bin hover
            if ((this.app.activeStampType === 'select' || this.app.activeStampType === 'recycle-bin') && !isInteracting) {
                const pos = getPos(e)
                const found = this.app.findClosestStamp(pageNum, pos.x, pos.y, true)
                if (found !== this.app.selectHoveredStamp) {
                    this.app.selectHoveredStamp = found
                    this.app.redrawStamps(pageNum)
                }
            }

            // Stamp tool hover preview
            if (this.app.isStampTool() && !isInteracting) {
                const pos = getPos(e)
                const previewPos = getStampPreviewPos(pos)
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
                if (canvas) {
                    this.app.redrawStamps(pageNum)
                    const ctx = canvas.getContext('2d')
                    const group = this.app.toolsets.find(g => g.tools.some(t => t.id === this.app.activeStampType))
                    const layer = group ? this.app.layers.find(l => l.type === group.type) : null
                    const color = layer ? layer.color : '#6366f1'
                    this.app.drawStampOnCanvas(ctx, canvas, { type: this.app.activeStampType, x: previewPos.x, y: previewPos.y, page: pageNum }, color, true)
                    if (!e.touches) drawLeaderLine(ctx, canvas, pos, previewPos)
                }
            }
        }

        const endAction = async (e) => {
            if (isInteracting && activeObject) {
                if (!isMovingExisting) {
                    if (activeObject.type === 'text' || activeObject.type === 'tempo-text') {
                        this.app.annotationManager.spawnTextEditor(wrapper, pageNum, activeObject)
                    } else if (activeObject.type === 'measure') {
                        const measureObj = activeObject
                        isInteracting = false
                        activeObject = null
                        let defVal = 1
                        if (this.app.lastMeasureNum) {
                            defVal = parseInt(this.app.lastMeasureNum) + (this.app.measureStep || 4)
                        }
                        const data = await this.app.annotationManager.promptMeasureNumber(defVal)
                        if (data) {
                            this.app.lastMeasureNum = String(data)
                            measureObj.data = String(data)
                            const existingMeasure = this.app.stamps.find(s => s.type === 'measure' && s.page === pageNum)
                            if (existingMeasure) measureObj.x = existingMeasure.x
                            this.app.stamps.push(measureObj)
                            this.app.updateRulerMarks()
                            this.app.saveToStorage(true)
                            this.app.redrawStamps(pageNum)
                        }
                        return
                    } else {
                        this.app.stamps.push(activeObject)
                    }
                }

                if (activeObject.type === 'anchor') {
                    this.app.updateRulerMarks()
                } else if (activeObject.type === 'measure') {
                    this.app.updateRulerMarks()
                }

                this.app.saveToStorage(true)
                this.app.redrawStamps(pageNum)
            }
            isInteracting = false
            isMovingExisting = false
            activeObject = null
            this.app._dragLastPos = null
        }

        // --- ATTACH LISTENERS ---

        overlay.addEventListener('mousedown', startAction)
        overlay.addEventListener('mousemove', (e) => {
            moveAction(e)
            hoverAction(e)
        })
        overlay.addEventListener('mouseleave', () => {
            let needsRedraw = false
            if (this.app.hoveredStamp) { this.app.hoveredStamp = null; needsRedraw = true }
            if (this.app.selectHoveredStamp) { this.app.selectHoveredStamp = null; needsRedraw = true }
            if (needsRedraw || this.app.isStampTool()) this.app.redrawStamps(pageNum)
            const chip = wrapper.querySelector('.erase-hover-chip')
            if (chip) chip.remove()
        })
        window.addEventListener('mouseup', endAction)

        overlay.addEventListener('touchstart', startAction, { passive: false })
        overlay.addEventListener('touchmove', moveAction, { passive: false })
        overlay.addEventListener('touchend', endAction)

        wrapper.appendChild(overlay)
    }
}
