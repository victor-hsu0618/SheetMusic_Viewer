export class AnnotationRenderer {
    constructor(app) {
        this.app = app;
    }

    /**
     * Redraw all visible annotations on a specific page.
     * @param {number} page - The page number to redraw.
     */
    redrawStamps(page) {
        const wrapper = document.querySelector(`.page-container[data-page="${page}"]`)
        if (!wrapper) return

        // We draw ALL visible sources onto the virtual canvas
        const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        this.app.sources.forEach(source => {
            if (!source.visible) return

            ctx.save()
            ctx.globalAlpha = source.opacity || 1
            const isForeign = source.id !== 'self'

            const sourceStamps = this.app.stamps.filter(s => s.page === page && s.sourceId === source.id && !s.deleted)
            sourceStamps.forEach(stamp => {
                const layer = this.app.layers.find(l => l.id === stamp.layerId)
                if (!layer || !layer.visible) return

                const isHovered = stamp === this.app.hoveredStamp           // red (eraser)
                const isSelectHovered = stamp === this.app.selectHoveredStamp // blue (select)

                if (stamp.points) {
                    this.drawPathOnCanvas(ctx, canvas, stamp, isForeign, isHovered, isSelectHovered)
                } else {
                    this.drawStampOnCanvas(ctx, canvas, stamp, layer.color, isForeign, isHovered, isSelectHovered)
                }
            })
            ctx.restore()
        })
    }

    /**
     * Redraw all annotation layers across all pages.
     */
    redrawAllAnnotationLayers() {
        if (!this.app.pdf) return;
        for (let i = 1; i <= this.app.pdf.numPages; i++) {
            this.redrawStamps(i);
        }
    }

    /**
     * Render a freehand path (pen/highlighter/line) on the canvas.
     */
    drawPathOnCanvas(ctx, canvas, path, isForeign = false, isHovered = false, isSelectHovered = false) {
        if (!path.points || path.points.length < 2) return

        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // Highlight if hovered
        if (isHovered) {
            ctx.shadowBlur = 10
            ctx.shadowColor = '#ef4444'
        } else if (isSelectHovered) {
            ctx.shadowBlur = 12
            ctx.shadowColor = '#6366f1'
        } else if (this.app.activeStampType === 'select' && !isForeign) {
            ctx.shadowBlur = 8
            ctx.shadowColor = '#6366f188' // Subtle interactive glow
        }

        // Dashed line for foreign (shared) annotations
        if (isForeign) {
            ctx.setLineDash([8 * (this.app.scale / 1.5), 6 * (this.app.scale / 1.5)])
        }

        const pageFactor = this.app.pageScales[path.page] || 1.0
        if (path.type === 'highlighter') {
            ctx.strokeStyle = isHovered ? '#ef4444' : (isForeign ? '#e5e7ebAA' : '#fde04788')
            ctx.lineWidth = 14 * (this.app.scale / 1.5) * pageFactor
        } else {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            ctx.lineWidth = (path.type === 'line' ? 2 : 3) * (this.app.scale / 1.5) * pageFactor
        }

        ctx.beginPath()
        const startX = path.points[0].x * canvas.width
        const startY = path.points[0].y * canvas.height
        ctx.moveTo(startX, startY)

        for (let i = 1; i < path.points.length; i++) {
            const px = path.points[i].x * canvas.width
            const py = path.points[i].y * canvas.height
            ctx.lineTo(px, py)
        }
        ctx.stroke()
        ctx.restore()
    }

    /**
     * Render a specific stamp (symbol) on the canvas.
     */
    drawStampOnCanvas(ctx, canvas, stamp, color, isForeign = false, isHovered = false, isSelectHovered = false, fingerPos = null) {
        const x = stamp.x * canvas.width
        const y = stamp.y * canvas.height
        const isBow = stamp.type === 'up-bow' || stamp.type === 'down-bow'

        // Smart Sizing: baseSize * PageFactor * UserMultiplier * ScoreMultiplier * ZoomScale
        const pageFactor = this.app.pageScales[stamp.page] || 1.0
        const userMultiplier = this.app.stampSizeMultiplier || 1.0
        const scoreMultiplier = this.app.scoreStampScale || 1.0
        const baseSize = 26 * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier

        const size = isBow ? baseSize * 0.85 : baseSize
        const textScale = size / 21 // Relative to the original baseline

        ctx.save()

        // Ghosting: Draw dashed connector line if finger position is provided
        if (fingerPos) {
            ctx.save()
            ctx.beginPath()
            ctx.setLineDash([5, 5])
            ctx.strokeStyle = color
            ctx.globalAlpha = 0.4
            ctx.lineWidth = 1.5 * (this.app.scale / 1.5)
            ctx.moveTo(fingerPos.x * canvas.width, fingerPos.y * canvas.height)
            ctx.lineTo(x, y)
            ctx.stroke()
            ctx.restore()
        }

        // Glow effects
        if (isHovered) {
            ctx.shadowBlur = 15
            ctx.shadowColor = '#ef4444'
        } else if (isSelectHovered) {
            ctx.shadowBlur = 15
            ctx.shadowColor = '#6366f1'
        } else if (this.app.activeStampType === 'select' && !isForeign) {
            ctx.shadowBlur = 12
            ctx.shadowColor = '#6366f166' // Subtle interactive glow
        }

        if (isForeign) {
            ctx.setLineDash([4, 3])
            ctx.globalAlpha *= 0.7
        }

        ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : color
        ctx.fillStyle = isHovered ? '#ef444433' : isSelectHovered ? '#6366f133' : `${color}33`
        ctx.lineWidth = 2.2 * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // Data-Driven Rendering: Find tool metadata
        let toolDef = stamp.draw ? { draw: stamp.draw } : null
        if (!toolDef) {
            for (const set of this.app.toolsets) {
                const tool = set.tools.find(t => t.id === stamp.type)
                if (tool) {
                    toolDef = tool
                    break
                }
            }
        }

        if (toolDef && toolDef.draw) {
            const d = toolDef.draw
            ctx.beginPath()

            switch (d.type) {
                case 'text':
                    ctx.font = `${d.font || ''} ${d.size * textScale}px ${d.fontFace || 'Outfit'}`
                    ctx.fillStyle = color
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(d.content, x, y)
                    break

                case 'shape':
                    if (d.shape === 'circle') {
                        ctx.arc(x, y, size * (d.radius || 1), 0, Math.PI * 2)
                        if (d.fill) { ctx.fillStyle = color; ctx.fill() }
                        ctx.stroke()
                    }
                    break

                case 'path':
                    // Relative path rendering (-1 to 1 space)
                    const pParts = d.data.split(' ')
                    ctx.save()
                    ctx.translate(x, y)
                    ctx.scale(size, size)
                    // Adjust line width to be consistent despite scaling
                    ctx.lineWidth = 2.5 * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier / size
                    ctx.lineCap = 'round'
                    ctx.lineJoin = 'round'

                    for (let i = 0; i < pParts.length; i++) {
                        const cmd = pParts[i]
                        if (cmd === 'M') ctx.moveTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]))
                        else if (cmd === 'L') ctx.lineTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]))
                        else if (cmd === 'C') ctx.bezierCurveTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]))
                    }
                    ctx.stroke()
                    ctx.restore()
                    break

                case 'special':
                    if (d.variant === 'input-text') {
                        ctx.font = `bold ${22 * textScale}px Outfit`
                        ctx.fillStyle = color
                        const lines = (stamp.data || '').split('\n')
                        const lineHeight = 26 * textScale
                        lines.forEach((line, i) => {
                            ctx.fillText(line, x, y + (i * lineHeight))
                        })
                    } else if (d.variant === 'measure') {
                        const bw = 22 * textScale, bh = 18 * textScale
                        const bx = x - bw / 2, by = y - bh / 2
                        // Outline-only box (no fill)
                        ctx.strokeStyle = isHovered ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)'
                        ctx.lineWidth = 0.8 * textScale
                        ctx.beginPath()
                        ctx.roundRect(bx, by, bw, bh, 3 * textScale)
                        ctx.stroke()
                        // Light text
                        ctx.font = `500 ${13 * textScale}px Outfit`
                        ctx.fillStyle = isHovered ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.35)'
                        ctx.textAlign = 'center'
                        ctx.textBaseline = 'middle'
                        ctx.fillText(stamp.data || '#', x, y)
                    }
                    break

                case 'complex':
                    // Legacy support for complex visual logic
                    if (d.variant === 'thumb') {
                        ctx.strokeStyle = color
                        ctx.lineWidth = 0.8 * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier
                        // Extra Small Hollow Vertical Ellipse
                        ctx.beginPath()
                        ctx.ellipse(x, y - size * 0.12, size * 0.16, size * 0.28, 0, 0, Math.PI * 2)
                        ctx.stroke()
                        // Extra Small Stem Line
                        ctx.beginPath()
                        ctx.moveTo(x, y + size * 0.16)
                        ctx.lineTo(x, y + size * 0.44)
                        ctx.stroke()
                    } else if (d.variant === 'fermata') {
                        const fSize = size * 0.45
                        ctx.arc(x, y, fSize, Math.PI, 0); ctx.stroke()
                        ctx.beginPath(); ctx.arc(x, y - fSize * 0.3, fSize * 0.15, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
                    } else if (d.variant === 'anchor') {
                        const isNextTarget = stamp === this.app.nextTargetAnchor
                        const aColor = isNextTarget ? color : '#94a3b8'
                        if (!isNextTarget) ctx.globalAlpha *= 0.35
                        ctx.fillStyle = aColor
                        ctx.strokeStyle = aColor
                        // 圓點
                        ctx.beginPath()
                        ctx.arc(x, y - size * 1.1, size * 0.18, 0, Math.PI * 2)
                        ctx.fill()
                        // 直棒
                        ctx.beginPath()
                        ctx.lineWidth = size * 0.12
                        ctx.moveTo(x, y - size * 0.9)
                        ctx.lineTo(x, y + size * 0.3)
                        ctx.stroke()
                        // 橫桿
                        ctx.beginPath()
                        ctx.moveTo(x - size * 0.6, y)
                        ctx.lineTo(x + size * 0.6, y)
                        ctx.stroke()
                        // 弧形
                        ctx.beginPath()
                        ctx.arc(x, y, size * 0.6, 0, Math.PI, false)
                        ctx.stroke()
                        ctx.lineWidth = 2.2 * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier
                    }
                    break
            }
        } else {
            if (stamp.type === 'circle') {
                ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            }
        }

        ctx.restore()
    }
}
