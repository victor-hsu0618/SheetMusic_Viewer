import { CLOAK_GROUPS } from '../../constants.js';

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

        const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        let drawnCount = 0;
        let skippedCount = 0;
        const skipReasons = {};

        this.app.sources.forEach(source => {
            if (!source.visible) {
                const count = this.app.stamps.filter(s => s.page === page && s.sourceId === source.id && !s.deleted).length;
                if (count > 0) {
                    skipReasons[`hidden_source_${source.id}`] = (skipReasons[`hidden_source_${source.id}`] || 0) + count;
                    skippedCount += count;
                }
                return;
            }

            ctx.save()
            ctx.globalAlpha = source.opacity || 1
            const isForeign = source.id !== 'self'

            const sourceStamps = this.app.stamps.filter(s => s.page === page && s.sourceId === source.id && !s.deleted)
            sourceStamps.forEach(stamp => {
                const effectiveLayerId = this.app.annotationManager.getEffectiveLayerId(stamp)
                const layer = this.app.layers.find(l => l.id === effectiveLayerId)
                
                if (!layer) {
                    skipReasons['no_layer'] = (skipReasons['no_layer'] || 0) + 1;
                    skippedCount++;
                    return;
                }
                if (!layer.visible) {
                    skipReasons[`hidden_layer_${layer.id}`] = (skipReasons[`hidden_layer_${layer.id}`] || 0) + 1;
                    skippedCount++;
                    return;
                }
                if (stamp.hiddenGroup && !this.app.cloakVisible?.[stamp.hiddenGroup]) {
                    skipReasons['hidden_cloak'] = (skipReasons['hidden_cloak'] || 0) + 1;
                    skippedCount++;
                    return;
                }

                const isHovered = stamp === this.app.hoveredStamp
                const isSelectHovered = stamp === this.app.selectHoveredStamp

                drawnCount++;
                if (stamp.points) {
                    this.drawPathOnCanvas(ctx, canvas, stamp, isForeign, isHovered, isSelectHovered)
                } else {
                    this.drawStampOnCanvas(ctx, canvas, stamp, (stamp.color || layer.color), isForeign, isHovered, isSelectHovered)
                }
            })
            ctx.restore()
        });

        // console.log(`[AnnotationRenderer] Page ${page}: Drew ${drawnCount}, Skipped ${skippedCount}. Reasons:`, skipReasons);
    }

    /**
     * Redraw annotation layers. 
     * Optimized: Only redraws visible pages OR pages with pending interaction states.
     * @param {boolean} forceAll - If true, strictly redraws everything (use sparingly).
     */
    redrawAllAnnotationLayers(forceAll = false) {
        if (!this.app.pdf) return;
        
        const numPages = this.app.pdf.numPages;
        const targetPages = new Set();
        
        // 1. Always prioritize visible pages
        document.querySelectorAll('.page-container[data-page]').forEach(el => {
            const rect = el.getBoundingClientRect();
            if (rect.top < window.innerHeight && rect.bottom > 0) {
                targetPages.add(parseInt(el.dataset.page));
            }
        });

        // 2. Identify pages that might have stale interaction ghosts (hover, select, etc.)
        // We look at the stamps that WERE hovered or selected recently
        if (this.app._lastRedrawPages) {
            this.app._lastRedrawPages.forEach(p => targetPages.add(p));
        }

        // 3. Redraw the target set
        targetPages.forEach(p => this.redrawStamps(p));

        // Track what we just redrew so we can clean up their ghosts next time
        this.app._lastRedrawPages = new Set(targetPages);

        // 4. If forceAll is requested, batch the rest in background
        if (forceAll) {
            const remainingPages = [];
            for (let i = 1; i <= numPages; i++) {
                if (!targetPages.has(i)) remainingPages.push(i);
            }
            if (remainingPages.length > 0) {
                const batchSize = 10;
                let currentIdx = 0;
                const processBatch = () => {
                    const end = Math.min(currentIdx + batchSize, remainingPages.length);
                    for (let i = currentIdx; i < end; i++) {
                        this.redrawStamps(remainingPages[i]);
                    }
                    currentIdx = end;
                    if (currentIdx < remainingPages.length) {
                        if (window.requestIdleCallback) requestIdleCallback(processBatch);
                        else setTimeout(processBatch, 100);
                    }
                };
                if (window.requestIdleCallback) requestIdleCallback(processBatch);
                else setTimeout(processBatch, 100);
            }
        }
    }

    /**
     * Render a freehand path (pen/highlighter/line) on the canvas.
     */
    drawPathOnCanvas(ctx, canvas, path, isForeign = false, isHovered = false, isSelectHovered = false) {
        if (!path.points || path.points.length < 2) return

        ctx.save()
        ctx.setLineDash([]) // Safety reset
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
        }

        // Dashed line for foreign (shared) annotations or specialized pens
        if (isForeign || path.dashed) {
            ctx.setLineDash([8 * (this.app.scale / 1.5), 6 * (this.app.scale / 1.5)])
        }

        const pageFactor = this.app.pageScales[path.page] || 1.0
        const globalMultiplier = this.app.stampSizeMultiplier || 1.0;
        const individualScale = path.userScale || 1.0;
        
        if (path.type && path.type.includes('highlighter')) {
            const baseColor = path.color || '#fde047'
            ctx.strokeStyle = isHovered ? '#ef4444' : (isForeign ? '#e5e7ebAA' : baseColor + '2D')
            ctx.lineWidth = (isHovered ? 18 : 14) * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
        } else {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            let baseWidth = (path.type === 'line' ? 1.2 : 1.8);
            if (path.type === 'bracket-left' || path.type === 'bracket-right') baseWidth = 3.0;
            ctx.lineWidth = baseWidth * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
            if (isHovered) ctx.lineWidth *= 1.5 
        }

        // Transparency for brackets
        const oldAlpha = ctx.globalAlpha;
        if (path.type === 'bracket-left' || path.type === 'bracket-right') {
            ctx.globalAlpha = 0.6;
        }

        const startX = path.points[0].x * canvas.width
        const startY = path.points[0].y * canvas.height

        let mx = 0, my = 0;
        if (path.type === 'slur' && path.points.length >= 2) {
            const p1 = path.points[0];
            const p2 = path.points[path.points.length - 1];
            const x1 = p1.x * canvas.width, y1 = p1.y * canvas.height;
            const x2 = p2.x * canvas.width, y2 = p2.y * canvas.height;
            
            // Midpoint
            mx = (x1 + x2) / 2;
            my = (y1 + y2) / 2;
            
            // Vector and Perpendicular
            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Curvature offset (default -28% of length to curve downwards)
            const curvatureValue = path.curvature !== undefined ? path.curvature : -0.28;
            const curvature = dist * curvatureValue;
            const px = -(dy / dist) * curvature;
            const py = (dx / dist) * curvature;
            
            // Control point
            const cx = mx + px;
            const cy = my + py;
            
            // Actual Apex for handle and hit detection
            const apexX = mx + px * 0.5;
            const apexY = my + py * 0.5;
            path._renderedApex = { x: apexX / canvas.width, y: apexY / canvas.height };
            
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.quadraticCurveTo(cx, cy, x2, y2);
        } else if ((path.type === 'bracket-left' || path.type === 'bracket-right') && path.points.length >= 2) {
            const p1 = path.points[0];
            const p2 = path.points[path.points.length - 1];
            const x1 = p1.x * canvas.width, y1 = p1.y * canvas.height;
            const x2 = p2.x * canvas.width, y2 = p2.y * canvas.height;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            // Perpendicular vector for caps
            const capLen = 12 * (this.app.scale / 1.5) * pageFactor * individualScale;
            // For bracket-left, cap points "inward" (right if drawing top-down)
            // For bracket-right, cap points "inward" (left if drawing top-down)
            const side = path.type === 'bracket-left' ? -1 : 1;
            const px = -(dy / dist) * capLen * side;
            const py = (dx / dist) * capLen * side;

            ctx.beginPath();
            // Start cap
            ctx.moveTo(x1 + px, y1 + py);
            ctx.lineTo(x1, y1);
            // Main spine
            ctx.lineTo(x2, y2);
            // End cap
            ctx.lineTo(x2 + px, y2 + py);
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
        ctx.globalAlpha = oldAlpha;

        // 矢印の描画 (Arrowhead rendering)
        if (path.arrow && path.points.length >= 2) {
            const p2 = path.points[path.points.length - 1]
            const p1 = path.points[path.points.length - 2]
            const x2 = p2.x * canvas.width, y2 = p2.y * canvas.height
            const x1 = p1.x * canvas.width, y1 = p1.y * canvas.height
            
            const dx = x2 - x1, dy = y2 - y1
            const angle = Math.atan2(dy, dx)
            const headlen = 15 * (this.app.scale / 1.5) * pageFactor
            
            ctx.beginPath()
            ctx.setLineDash([]) // Arrowhead should be solid
            ctx.moveTo(x2, y2)
            ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6))
            ctx.moveTo(x2, y2)
            ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6))
            ctx.stroke()
        }

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
        }
        ctx.stroke()

        // SLUR CURVATURE HANDLE & GUIDE: Show if slur is active or being edited
        const showSlurControls = path.type === 'slur' && path._renderedApex && 
                                (path === this.app._lastGraceObject || isSelectHovered || 
                                 (this.app.activeStampType === 'slur' && isHovered));

        if (showSlurControls) {
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
            ctx.arc(path._renderedApex.x * canvas.width, path._renderedApex.y * canvas.height, 10 * (this.app.scale / 1.5) * pageFactor, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
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

        const toolSize = this.app.stampSizeOverrides?.[toolDef?.id] ?? toolDef?.draw?.size ?? 24;

        // Smart Sizing: baseSize * PageFactor * UserMultiplier * ScoreMultiplier * ZoomScale
        const pageFactor = this.app.pageScales[stamp.page] || 1.0
        const userMultiplier = this.app.stampSizeMultiplier || 1.0
        const scoreMultiplier = this.app.scoreStampScale || 1.0
        const individualScale = stamp.userScale || 1.0
        
        // Unified Scale Factor (Standardizing on zoom=1.5 as base)
        const globalScale = (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier * individualScale;
        
        // Final pixel size for paths/shapes
        const size = toolSize * globalScale;

        // textScale is now simply the global multiplier, so d.size * textScale = final pixels
        const textScale = globalScale;

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
        }

        if (isForeign) {
            ctx.setLineDash([4, 3])
            ctx.globalAlpha *= 0.7
        }

        const finalColor = isHovered ? '#ef4444' : (isSelectHovered ? '#6366f1' : color)
        ctx.strokeStyle = finalColor
        ctx.fillStyle = isHovered ? '#ef444444' : (isSelectHovered ? '#6366f133' : `${color}33`)
        ctx.lineWidth = (isHovered ? 3.5 : 2.2) * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier * individualScale
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        if (toolDef && toolDef.draw) {
            const d = toolDef.draw
            ctx.beginPath()

            switch (d.type) {
                case 'text':
                    let textContent = d.content || stamp.data || '#'
                    const hasCJK = /[\u4e00-\u9fa5]/.test(textContent)
                    
                    let fontStr = d.font || ''
                    let fontSize = (d.size || 24) * textScale
                    
                    if (hasCJK) {
                        // CJK characters fill the em-box more than Latin, so we balance them
                        fontSize *= 0.85 // Scale down by 15%
                        fontStr = fontStr.replace('italic', '').trim() // Remove italics for CJK
                    }

                    ctx.font = `${fontStr} ${fontSize}px ${d.fontFace || 'Outfit'}`
                    ctx.fillStyle = finalColor
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(textContent, x, y)
                    break

                case 'shape':
                    if (d.shape === 'circle') {
                        ctx.arc(x, y, size * (d.radius || 1), 0, Math.PI * 2)
                        if (d.fill) { ctx.fillStyle = color; ctx.fill() }
                        ctx.stroke()
                    }
                    break

                case 'path':
                    // Native SVG Path rendering using Path2D
                    ctx.save()
                    ctx.translate(x, y)
                    ctx.scale(size, size)
                    
                    // Maintain standard line width despite internal coordinate space scaling
                    const baseStrokeWeight = d.strokeWidth || 2.5
                    const effectiveLineWidth = baseStrokeWeight * globalScale / size
                    ctx.lineWidth = effectiveLineWidth
                    ctx.lineCap = 'round'
                    ctx.lineJoin = 'round'

                    try {
                        const pathObj = new Path2D(d.data)
                        ctx.strokeStyle = finalColor
                        ctx.stroke(pathObj)
                        if (d.fill !== 'none') {
                            ctx.fillStyle = finalColor
                            ctx.fill(pathObj)
                        }
                    } catch (e) {
                        console.error("Path2D error:", e, d.data)
                    }
                    ctx.restore()
                    break

                case 'special':
                    if (d.variant === 'input-text') {
                        const content = stamp.data || ''
                        const hasCJK = /[\u4e00-\u9fa5]/.test(content)
                        
                        let fontSize = 15 * textScale
                        let fontWeight = 'bold'
                        
                        if (hasCJK) {
                            fontSize *= 0.85
                            fontWeight = '500' // Less aggressive than bold for CJK
                        }
                        
                        ctx.font = `${fontWeight} ${fontSize}px Outfit`
                        ctx.fillStyle = color
                        const lines = content.split('\n')
                        const lineHeight = fontSize
                        lines.forEach((line, i) => {
                            ctx.fillText(line, x, y + (i * lineHeight))
                        })
                    } else if (d.variant === 'measure') {
                        const isFree = stamp.type === 'measure-free'
                        
                        // Skip if user has hidden measure stamps, but NOT for Free Measures
                        if (this.app.hideMeasureNumbers && !isFree) {
                            break
                        }
                        
                        // Text Tightness (Compactness)
                        // Use a slightly smaller font than before (14 -> 13) and tighter weight if needed
                        // Also for Free Measure, add a circle frame
                        const fontSize = (isFree ? 12 : 13) * textScale
                        ctx.font = `700 ${fontSize}px Outfit`
                        ctx.fillStyle = isHovered ? 'rgba(0,0,0,0.9)' : 'rgba(0,0,0,0.55)'
                        ctx.textAlign = 'left'
                        ctx.textBaseline = 'middle'

                        if (isFree) {
                            // Rounded frame for Free Measure, left aligned
                            const textWidth = ctx.measureText(stamp.data || '#').width
                            const padding = fontSize * 0.4
                            const w = textWidth + padding * 2
                            const h = fontSize + padding
                            
                            ctx.strokeStyle = ctx.fillStyle
                            ctx.lineWidth = 1.2 * globalScale
                            
                            // Rounded rectangle for "softer" look
                            const radius = 4 * globalScale
                            ctx.beginPath()
                            const rectX = x - padding
                            const rectY = y - h/2
                            if (ctx.roundRect) {
                                ctx.roundRect(rectX, rectY, w, h, radius)
                            } else {
                                ctx.strokeRect(rectX, rectY, w, h)
                            }
                            ctx.stroke()
                            
                            // Slightly darker text inside frame
                            ctx.fillStyle = isHovered ? 'rgba(0,0,0,1)' : 'rgba(0,0,0,0.8)'
                        }

                        ctx.fillText(stamp.data || '#', x, y)
                    } else if (d.variant === 'playback') {
                        // Restore missing Music Anchor / Playback Head
                        const s = size * 0.45 
                        ctx.strokeStyle = color
                        ctx.lineWidth = 1.2 * globalScale
                        ctx.beginPath()
                        ctx.moveTo(x, y - s)
                        ctx.lineTo(x, y + s)
                        ctx.arc(x, y - s, 6 * globalScale, 0, Math.PI * 2)
                        ctx.stroke()
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

        // Cloak badge: small dot at top-right corner of stamp
        if (stamp.hiddenGroup && this.app.cloakVisible?.[stamp.hiddenGroup] && this.app.showCloakBadge !== false) {
            const cloakDef = CLOAK_GROUPS.find(c => c.id === stamp.hiddenGroup);
            if (cloakDef) {
                const badgeR = 3.5 * (this.app.scale / 1.5);
                const badgeX = x + size * 0.5 + badgeR;
                const badgeY = y - size * 0.5 - badgeR;
                ctx.save();
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
                ctx.fillStyle = cloakDef.color;
                ctx.globalAlpha = 0.9;
                ctx.fill();
                ctx.restore();
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
        ctx.globalAlpha = 0.3
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
