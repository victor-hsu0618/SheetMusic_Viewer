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
                    this.drawStampOnCanvas(ctx, canvas, stamp, (stamp.color || layer.color), isForeign, isHovered, isSelectHovered)
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
            ctx.shadowBlur = 20
            ctx.shadowColor = '#ef4444'
            ctx.strokeStyle = '#ef4444' // Force red
        } else if (isSelectHovered) {
            ctx.shadowBlur = 12
            ctx.shadowColor = '#6366f1'
        } else if (path === this.app._lastGraceObject) {
            ctx.shadowBlur = 10
            ctx.shadowColor = '#6366f1'
            ctx.strokeStyle = '#6366f1' // Blue highlight
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
            ctx.lineWidth = (isHovered ? 18 : 14) * (this.app.scale / 1.5) * pageFactor
        } else {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            ctx.lineWidth = (path.type === 'line' ? 1.2 : 1.8) * (this.app.scale / 1.5) * pageFactor
            if (isHovered) ctx.lineWidth *= 1.5 // Make path thicker when hovered
        }

        const startX = path.points[0].x * canvas.width
        const startY = path.points[0].y * canvas.height

        if (path.type === 'slur' && path.points.length >= 2) {
            const p1 = path.points[0];
            const p2 = path.points[path.points.length - 1];
            const x1 = p1.x * canvas.width, y1 = p1.y * canvas.height;
            const x2 = p2.x * canvas.width, y2 = p2.y * canvas.height;
            
            // Midpoint
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            
            // Vector and Perpendicular
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Curvature offset (default 18% of length)
            const curvatureValue = path.curvature !== undefined ? path.curvature : 0.18;
            const curvature = dist * curvatureValue;
            const px = -(dy / dist) * curvature;
            const py = (dx / dist) * curvature;
            
            // Control point
            const cx = mx + px;
            const cy = my + py;
            
            // Actual Apex for handle and hit detection
            // Note: For quadratic bezier, the apex is at the average of (P0, P1, C) * 0.5 effectively, 
            // but we use the midpoint + half-offset as the visual apex for handles.
            const apexX = mx + px * 0.5;
            const apexY = my + py * 0.5;
            path._renderedApex = { x: apexX / canvas.width, y: apexY / canvas.height };
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.quadraticCurveTo(cx, cy, x2, y2);
        } else {
            ctx.beginPath()
            ctx.moveTo(startX, startY)

            for (let i = 1; i < path.points.length; i++) {
                const px = path.points[i].x * canvas.width
                const py = path.points[i].y * canvas.height
                ctx.lineTo(px, py)
            }
        }
        ctx.stroke()

        // GRACE RING for paths
        if (path === this.app._lastGraceObject) {
            ctx.beginPath()
            ctx.lineWidth = 1 * (this.app.scale / 1.5) * pageFactor
            ctx.setLineDash([4, 4])
            ctx.strokeStyle = '#6366f1'
            ctx.moveTo(startX, startY)
            for (let i = 1; i < path.points.length; i++) {
                const px = path.points[i].x * canvas.width
                const py = path.points[i].y * canvas.height
                ctx.lineTo(px, py)
            }
            ctx.stroke()

            // SLUR CURVATURE HANDLE & GUIDE
            if (path.type === 'slur' && path._renderedApex) {
                // Background Guide Line
                ctx.beginPath();
                ctx.setLineDash([3, 3]);
                ctx.strokeStyle = '#6366f166';
                ctx.lineWidth = 1;
                ctx.moveTo(mx, my);
                ctx.lineTo(path._renderedApex.x * canvas.width, path._renderedApex.y * canvas.height);
                ctx.stroke();

                // Apex Handle
                ctx.beginPath();
                ctx.setLineDash([]);
                ctx.fillStyle = '#6366f1';
                // Increased radius from 4 to 10 for easier grab
                ctx.arc(path._renderedApex.x * canvas.width, path._renderedApex.y * canvas.height, 10 * (this.app.scale / 1.5) * pageFactor, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }

        ctx.restore()
    }

    /**
     * Render a specific stamp (symbol) on the canvas.
     */
    drawStampOnCanvas(ctx, canvas, stamp, color, isForeign = false, isHovered = false, isSelectHovered = false, fingerPos = null) {
        const x = stamp.x * canvas.width
        const y = stamp.y * canvas.height
        const isBow = stamp.type === 'up-bow' || stamp.type === 'down-bow'
        let toolDef = null

        // PRIORITY 1: Embedded draw data (For "placed" stamps to ensure independence)
        if (stamp.draw) {
            toolDef = { draw: stamp.draw }
        }

        // PRIORITY 2: Static toolset lookup (For standard signs)
        if (!toolDef) {
            for (const set of this.app.toolsets) {
                const tool = set.tools.find(t => t.id === stamp.type)
                if (tool) {
                    toolDef = tool
                    break
                }
            }
        }
        
        // PRIORITY 3: Global state fallback (ONLY for unplaced/preview stamps)
        if (!toolDef && stamp.type && stamp.type.startsWith('custom-text-') && this.app._activeCustomText) {
            toolDef = {
                draw: {
                    type: 'text',
                    content: this.app._activeCustomText,
                    font: 'italic 300',
                    size: this.app.defaultFontSize,
                    fontFace: 'serif'
                }
            }
        }

        const toolSize = toolDef?.draw?.size || 24;

        // Smart Sizing: baseSize * PageFactor * UserMultiplier * ScoreMultiplier * ZoomScale
        const pageFactor = this.app.pageScales[stamp.page] || 1.0
        const userMultiplier = this.app.stampSizeMultiplier || 1.0
        const scoreMultiplier = this.app.scoreStampScale || 1.0
        const baseSize = 14 * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier * (toolSize / 24)

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
            ctx.shadowBlur = 25
            ctx.shadowColor = '#ef4444'
        } else if (isSelectHovered) {
            ctx.shadowBlur = 15
            ctx.shadowColor = '#6366f1'
        } else if (stamp === this.app._lastGraceObject) {
            ctx.shadowBlur = 8 
            ctx.shadowColor = '#6366f1'
            
            // Draw a SHRUNKEN VISUAL RING
            ctx.save()
            ctx.beginPath()
            ctx.setLineDash([2, 2])
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.6)'
            ctx.lineWidth = 1.0 * (this.app.scale / 1.5)
            ctx.arc(x, y, size * 0.4, 0, Math.PI * 2) 
            ctx.stroke()
            ctx.restore()
        } else if (this.app.activeStampType === 'select' && !isForeign) {
            ctx.shadowBlur = 12
            ctx.shadowColor = '#6366f166' // Subtle interactive glow
        }

        if (isForeign) {
            ctx.setLineDash([4, 3])
            ctx.globalAlpha *= 0.7
        }

        const finalColor = isHovered ? '#ef4444' : (isSelectHovered ? '#6366f1' : color)
        ctx.strokeStyle = finalColor
        ctx.fillStyle = isHovered ? '#ef444444' : (isSelectHovered ? '#6366f133' : `${color}33`)
        ctx.lineWidth = (isHovered ? 3.5 : 2.2) * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        if (toolDef && toolDef.draw) {
            const d = toolDef.draw
            ctx.beginPath()

            switch (d.type) {
                case 'text':
                    ctx.font = `${d.font || ''} ${d.size * textScale}px ${d.fontFace || 'Outfit'}`
                    ctx.fillStyle = finalColor
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
                        const lineHeight = 20 * textScale
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
                        
                        // Internal scaling for anchor to make it match text size (approx 0.6x original)
                        const s = size * 0.65; 

                        // 圓點
                        ctx.beginPath()
                        ctx.arc(x, y - s * 1.1, s * 0.18, 0, Math.PI * 2)
                        ctx.fill()
                        // 直棒
                        ctx.beginPath()
                        ctx.lineWidth = s * 0.15 // Slightly thicker line for readability at small size
                        ctx.moveTo(x, y - s * 0.9)
                        ctx.lineTo(x, y + s * 0.3)
                        ctx.stroke()
                        // 橫桿
                        ctx.beginPath()
                        ctx.moveTo(x - s * 0.6, y)
                        ctx.lineTo(x + s * 0.6, y)
                        ctx.stroke()
                        // 弧形
                        ctx.beginPath()
                        ctx.arc(x, y, s * 0.6, 0, Math.PI, false)
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

    /**
     * Render a simple virtual tip for freehand tools (Pen/Highlighter).
     * Used mainly for touch devices to show where the stroke will start relative to offset.
     */
    drawFreehandPreview(ctx, canvas, pos, color, type) {
        const x = pos.x * canvas.width
        const y = pos.y * canvas.height
        const size = 6 * (this.app.scale / 1.5)

        ctx.save()
        ctx.beginPath()
        ctx.globalAlpha = 0.5
        ctx.fillStyle = color
        
        if (type === 'highlighter') {
            // Rectangular tip for highlighter
            const w = size * 2.5, h = size * 0.8
            ctx.roundRect(x - w/2, y - h/2, w, h, 2)
        } else {
            // Circular tip for pen
            ctx.arc(x, y, size, 0, Math.PI * 2)
        }
        
        ctx.fill()
        
        // Slight border for visibility
        ctx.globalAlpha = 0.3
        ctx.strokeStyle = '#FFFFFF'
        ctx.lineWidth = 1
        ctx.stroke()
        
        ctx.restore()
    }
}
