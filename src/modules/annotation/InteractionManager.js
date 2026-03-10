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
         * Includes clamping to ensure coordinates stay within [0, 1] even if mouse drags slightly out.
         */
        const getPos = (e) => {
            const rect = overlay.getBoundingClientRect()
            const clientX = e.clientX || (e.touches && e.touches[0].clientX)
            const clientY = e.clientY || (e.touches && e.touches[0].clientY)
            return {
                x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
                y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
            }
        }

        // --- STAMP PREVIEW CONFIGURE ---
        const STAMP_OFFSET_X_PX = -45
        const STAMP_OFFSET_Y_PX = 65 // Base offset magnitude for calculations

        /**
         * Compute preview position for stamps with 4-edge smart lerp.
         * When approaching ANY edge, the offset smoothly transitions to zero
         * or flips to the other side to ensure the stamp is always reachable and visible.
         */
        const getStampPreviewPos = (pos) => {
            const rect = overlay.getBoundingClientRect()

            // 1. Vertical Positioning (Smooth Lerp + Edge Reachability)
            const cursorScreenY = rect.top + pos.y * rect.height
            const distFromBottom = window.innerHeight - cursorScreenY
            const distFromTop = cursorScreenY
            const transY = STAMP_OFFSET_Y_PX * 3 // Transition zone

            let dyPx = -STAMP_OFFSET_Y_PX // Default: Above

            if (distFromBottom < transY) {
                // If we approach bottom, we want to slide to being BELOW the cursor.
                // However, as pos.y reaches 1.0 (dead bottom), dyPx MUST be 0
                // to allow the stamp to actually touch the bottom edge.
                const t = Math.max(0, Math.min(1, distFromBottom / transY))
                // t=1 (far): -60 | t=0.5: 0 | t=0 (edge): +60
                // To allow reaching edge at pos.y=1.0, we need dyPx to be 0 at t=0
                // Actually, a better approach for reachability:
                // Flip offset sign but also multiply by t so it shrinks to 0 at the very edge.
                dyPx = -STAMP_OFFSET_Y_PX * Math.sin(t * Math.PI / 2) * (t > 0.5 ? 1 : -1)
                // Simplify: Just flip and shrink.
                if (distFromBottom < transY / 2) {
                    const localT = distFromBottom / (transY / 2) // 0 to 1
                    dyPx = STAMP_OFFSET_Y_PX * localT // Shrink to 0 as we hit edge
                } else {
                    const localT = (distFromBottom - transY / 2) / (transY / 2) // 0 to 1
                    dyPx = -STAMP_OFFSET_Y_PX * (1 - localT) - STAMP_OFFSET_Y_PX * localT
                    // Actually, let's use the most robust way:
                    const lerpT = Math.max(0, Math.min(1, distFromBottom / transY))
                    dyPx = -STAMP_OFFSET_Y_PX + (1 - lerpT) * (STAMP_OFFSET_Y_PX * 2)
                    // If near absolute edge, force shrink
                    if (pos.y > 0.98) dyPx *= (1.0 - pos.y) / 0.02
                    if (pos.y < 0.02) dyPx *= pos.y / 0.02
                }
            }

            // 2. Horizontal Positioning (Smooth Lerp + Edge Reachability)
            const cursorScreenX = rect.left + pos.x * rect.width
            const distFromRight = window.innerWidth - cursorScreenX
            const distFromLeft = cursorScreenX
            const transX = Math.abs(STAMP_OFFSET_X_PX) * 3 || 150

            let dxPx = STAMP_OFFSET_X_PX // Default: Left (-45)

            if (distFromLeft < transX) {
                // Approach LEFT: Slide to RIGHT side of cursor
                const lerpT = Math.max(0, Math.min(1, distFromLeft / transX))
                dxPx = STAMP_OFFSET_X_PX + (1 - lerpT) * (Math.abs(STAMP_OFFSET_X_PX) * 2)
            } else if (distFromRight < transX) {
                // Approach RIGHT: Stay LEFT side but shrink to 0 to REACH the edge
                const lerpT = Math.max(0, Math.min(1, distFromRight / transX))
                dxPx = STAMP_OFFSET_X_PX * lerpT
            }

            // Final edge clamp to be extra safe
            if (pos.x > 0.98) dxPx *= (1.0 - pos.x) / 0.02
            if (pos.x < 0.02) dxPx *= pos.x / 0.02
            if (pos.y > 0.98) dyPx *= (1.0 - pos.y) / 0.02
            if (pos.y < 0.02) dyPx *= pos.y / 0.02

            return {
                x: Math.max(0.001, Math.min(0.999, pos.x + dxPx / rect.width)),
                y: Math.max(0.001, Math.min(0.999, pos.y + dyPx / rect.height))
            }
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

            if (e.type === 'touchstart') {
                e.preventDefault()
                // Trigger initial hover/preview on first touch
                hoverAction(e)
            }
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
                        target.deleted = true
                        target.updatedAt = Date.now()
                        this.app.saveToStorage()
                        if (this.app.onAnnotationChanged) this.app.onAnnotationChanged()
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
                    color: this.app.layers.find(l => l.id === 'draw').color,
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    updatedAt: Date.now()
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
                let stampDraw = null
                if (toolType.startsWith('custom-text-') && this.app._activeCustomText) {
                    stampDraw = {
                        type: 'text',
                        content: this.app._activeCustomText,
                        font: 'italic 300',
                        size: 22,
                        fontFace: 'serif'
                    }
                }

                activeObject = {
                    page: pageNum,
                    layerId: targetLayerId,
                    sourceId: this.app.activeSourceId,
                    type: toolType,
                    x: pos.x, // Use pos.x instead of undefined nx
                    y: pos.y, // Use pos.y instead of undefined ny
                    data: null,
                    draw: stampDraw, // Critical: Attach drawing metadata for non-default tools
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                    updatedAt: Date.now()
                }
                const previewPosFinal = getStampPreviewPos(pos)
                activeObject.x = previewPosFinal.x
                activeObject.y = previewPosFinal.y
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
                this.app.drawStampOnCanvas(ctx, canvas, activeObject, layer ? layer.color : '#000000', true, false, false, pos)
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
                this.app._lastValidPos = pos // Persist for mouseleave "ghost" preview
                const previewPos = getStampPreviewPos(pos)
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
                if (canvas) {
                    this.app.redrawStamps(pageNum)
                    const ctx = canvas.getContext('2d')
                    const group = this.app.toolsets.find(g => g.tools.some(t => t.id === this.app.activeStampType))
                    const layer = group ? this.app.layers.find(l => l.type === group.type) : null
                    const color = layer ? layer.color : '#6366f1'

                    let previewDraw = null
                    if (this.app.activeStampType.startsWith('custom-text-') && this.app._activeCustomText) {
                        previewDraw = {
                            type: 'text',
                            content: this.app._activeCustomText,
                            font: 'italic 300',
                            size: 22,
                            fontFace: 'serif'
                        }
                    }
                    this.app.drawStampOnCanvas(ctx, canvas, {
                        type: this.app.activeStampType,
                        x: previewPos.x,
                        y: previewPos.y,
                        page: pageNum,
                        draw: previewDraw
                    }, color, true, false, false, pos)
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
                            measureObj.id = crypto.randomUUID()
                            measureObj.updatedAt = Date.now()
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
                if (this.app.onAnnotationChanged) this.app.onAnnotationChanged()
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

            // To keep stamp preview at edge when mouse leaves, we don't clear it immediately
            // if we are in a stamp tool.
            if (this.app.isStampTool() && this.app._lastValidPos) {
                // Ghost preview at the last edge position
                const pos = this.app._lastValidPos
                const previewPos = getStampPreviewPos(pos)
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
                if (canvas) {
                    this.app.redrawStamps(pageNum)
                    const ctx = canvas.getContext('2d')
                    const group = this.app.toolsets.find(g => g.tools.some(t => t.id === this.app.activeStampType))
                    const layer = group ? this.app.layers.find(l => l.type === group.type) : null
                    const color = layer ? layer.color : '#6366f1'
                    this.app.drawStampOnCanvas(ctx, canvas, {
                        type: this.app.activeStampType,
                        x: previewPos.x,
                        y: previewPos.y,
                        page: pageNum
                    }, color, true, false, false, pos)
                }
            } else if (needsRedraw) {
                this.app.redrawStamps(pageNum)
            }

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
