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
        if (!page || isNaN(page)) return;
        const wrapper = document.querySelector(`.page-container[data-page="${page}"]`)
        if (!wrapper) return

        const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
        if (!canvas) {
            return;
        }
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        // OPTIMIZATION: Filter page stamps once before the sources loop
        // Exclude system stamps when the feature is disabled — avoids iterating ~1000 auto stamps on every redraw.
        const pageStamps = this.app.stamps.filter(s =>
            s.page === page && !s.deleted &&
            (s.type !== 'system' || this.app.showSystemStamps)
        );
        if (pageStamps.length === 0) {
            return;
        }

        this.app.sources.forEach(source => {
            if (!source.visible) return;

            ctx.save()
            ctx.globalAlpha = source.opacity || 1
            const isForeign = source.id !== 'self'

            const sourceStamps = pageStamps.filter(s => s.sourceId === source.id)
            sourceStamps.forEach(stamp => {
                const effectiveLayerId = this.app.annotationManager.getEffectiveLayerId(stamp)
                const layer = this.app.layers.find(l => l.id === effectiveLayerId)

                if (!layer || !layer.visible) return;
                if (stamp.hiddenGroup && !this.app.cloakVisible?.[stamp.hiddenGroup]) return;

                const isHovered = stamp === this.app.hoveredStamp
                const isMultiSelected = this.app.annotationManager?.interaction?._multiSelected?.has(stamp.id) ?? false
                const isSelectHovered = stamp === this.app.selectHoveredStamp || isMultiSelected

                if (stamp.points) {
                    this.drawPathOnCanvas(ctx, canvas, stamp, isForeign, isHovered, isSelectHovered)
                } else {
                    this.drawStampOnCanvas(ctx, canvas, stamp, (stamp.color || layer.color), isForeign, isHovered, isSelectHovered)
                }

                // --- 巡檢追蹤提示 (Inspector Radar Pulse) ---
                if (this.app.inspectorTarget === stamp) {
                    this._drawRadarPulse(ctx, canvas, stamp);
                }
            })
            ctx.restore()
        });
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
            ctx.shadowBlur = 8
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

        // Line style: resolve from lineStyle field (new) or dashed bool (legacy)
        const _resolvedLineStyle = path.lineStyle || (path.dashed ? 'dashed' : 'solid')
        const _s = this.app.scale / 1.5
        if (isForeign) {
            ctx.setLineDash([8 * _s, 6 * _s])
        } else if (_resolvedLineStyle === 'dashed') {
            ctx.setLineDash([8 * _s, 6 * _s])
        } else if (_resolvedLineStyle === 'dotted') {
            ctx.setLineDash([2 * _s, 5 * _s])
        }

        const pageFactor = this.app.pageScales[path.page] || 1.0
        const globalMultiplier = this.app.stampSizeMultiplier || 1.0;
        const individualScale = path.userScale || 1.0;

        if (path.type === 'correction-pen') {
            // Erase-mode pen: removes annotation pixels without touching the PDF layer
            ctx.shadowBlur = 0
            if (isHovered) {
                // Show as red preview when hovered (so user can see what will be erased)
                ctx.strokeStyle = '#ef4444'
                ctx.globalAlpha = 0.5
            } else {
                ctx.globalCompositeOperation = 'destination-out'
                ctx.strokeStyle = 'rgba(0,0,0,1)' // Color irrelevant; alpha is what erases
                ctx.globalAlpha = 1.0
            }
            ctx.lineWidth = 3 * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
        } else if (path.type === 'cover-brush') {
            // Fully opaque wide stroke — covers PDF dirt with sampled background color
            ctx.shadowBlur = 0  // No glow; edges must be invisible
            ctx.strokeStyle = isHovered ? '#ef4444' : (path.color || '#ffffff')
            ctx.lineWidth = (isHovered ? 14 : 9) * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
            ctx.globalAlpha = isHovered ? 0.7 : 1.0
        } else if (path.type && path.type.includes('highlighter')) {
            const baseColor = path.color || '#fde047'
            // Use high alpha (99 = ~60% or B3 = 70%) with multiply for natural looking highlight
            ctx.strokeStyle = isHovered ? '#ef4444' : (isForeign ? '#e5e7ebAA' : baseColor + '99')
            ctx.lineWidth = (isHovered ? 36 : 24) * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
            if (!isHovered && !isSelectHovered && path !== this.app._lastGraceObject) {
                ctx.globalCompositeOperation = 'multiply'
            }
        } else if (path.type === 'fine-pen') {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            ctx.lineWidth = (isHovered ? 1.4 : 0.8) * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
        } else if (path.type === 'marker-pen') {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (isForeign ? '#e5e7ebAA' : (path.color || '#ff4757') + 'BF')
            ctx.lineWidth = (isHovered ? 18 : 13.5) * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
        } else if (path.type === 'brush-pen') {
            // Style set here; variable-width rendering handled below before ctx.stroke()
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            ctx.lineWidth = 2.5 * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale // fallback for hover
        } else if (path.type === 'rect-shape' || path.type === 'circle-shape') {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            ctx.lineWidth = 1.8 * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
            if (isHovered) ctx.lineWidth *= 1.5
        } else if (path.type === 'fountain-pen') {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            ctx.lineWidth = 2.0 * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale // fallback for hover
        } else if (path.type === 'pencil-pen') {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            ctx.lineWidth = 1.2 * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale // fallback for hover
        } else {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            let baseWidth = (path.type === 'line' ? 1.2 : 1.8);
            if (path.type === 'bracket-left' || path.type === 'bracket-right') baseWidth = 3.0;
            ctx.lineWidth = baseWidth * (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale
            if (isHovered) ctx.lineWidth *= 1.6 // Reduced from 2.5 to prevent blurring
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
        } else if ((path.type === 'curly-left' || path.type === 'curly-right') && path.points.length >= 2) {
            const p1 = path.points[0];
            const p2 = path.points[path.points.length - 1];
            const x1 = p1.x * canvas.width,  y1 = p1.y * canvas.height;
            const x2 = p2.x * canvas.width,  y2 = p2.y * canvas.height;
            const h  = y2 - y1;
            // Horizontal extent of the curly bump (scales with bracket height)
            const w  = Math.abs(h) * 0.18 * (path.type === 'curly-left' ? -1 : 1);
            const mx = x1;  // x is locked, so x1 === x2
            const my = (y1 + y2) / 2;
            ctx.beginPath();
            // Top half: straight start → curve out to midpoint
            ctx.moveTo(mx, y1);
            ctx.bezierCurveTo(mx, y1 + h * 0.18,  mx + w, my - h * 0.06,  mx + w, my);
            // Bottom half: midpoint → curve back to straight end
            ctx.bezierCurveTo(mx + w, my + h * 0.06,  mx, y2 - h * 0.18,  mx, y2);
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
        } else if (path.type === 'rect-shape' && path.points.length >= 2) {
            const p2 = path.points[path.points.length - 1]
            ctx.beginPath()
            ctx.rect(startX, startY, p2.x * canvas.width - startX, p2.y * canvas.height - startY)
        } else if (path.type === 'circle-shape' && path.points.length >= 2) {
            const p2 = path.points[path.points.length - 1]
            const cx = (startX + p2.x * canvas.width) / 2
            const cy = (startY + p2.y * canvas.height) / 2
            const rx = Math.abs(p2.x * canvas.width - startX) / 2
            const ry = Math.abs(p2.y * canvas.height - startY) / 2
            ctx.beginPath()
            ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2)
        } else {
            ctx.beginPath();
            ctx.moveTo(startX, startY);

            let isDot = true;
            let lastX = startX, lastY = startY;
            
            // 1. Process points to build the main path and determine if it's just a dot
            for (let i = 1; i < path.points.length; i++) {
                const px = path.points[i].x * canvas.width;
                const py = path.points[i].y * canvas.height;
                
                // Keep the "anti-dark-point" skip logic but ensure it doesn't break standard stroke
                if (Math.abs(px - lastX) < 0.1 && Math.abs(py - lastY) < 0.1) continue;
                
                isDot = false;
                ctx.lineTo(px, py);
                lastX = px; lastY = py;
            }

            // 2. Render based on detection
            if (isDot) {
                // TRUE DOT: Ensure even tiny clicks are rendered as visible circles
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath();
                ctx.arc(startX, startY, Math.max(ctx.lineWidth / 2, 0.5), 0, Math.PI * 2);
                ctx.fill();
            } else {
                // TRUE PATH: Branch based on tool type
                if (['brush-pen', 'fountain-pen', 'pencil-pen'].includes(path.type) && !isHovered && !isSelectHovered) {
                    // Special stylized pens need segment-by-segment rendering
                    this._renderSpecialPen(ctx, canvas, path, pageFactor, globalMultiplier, individualScale, oldAlpha);
                } else {
                    // Standard: pen, highlighter, correction-pen, markers, or hover-state previews
                    // The lineTo() commands were already issued in the loop above.
                    ctx.stroke();
                }
            }
        }
        
        ctx.globalAlpha = oldAlpha;
        ctx.globalCompositeOperation = 'source-over'; // Ensure reset after any tool-specific operations

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
            ctx.stroke()
        }

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

        // ENDPOINT HANDLES for two-point strokes (shown on grace period or select hover)
        const TWO_PT_HANDLE_TYPES = new Set(['line', 'slur', 'bracket-left', 'bracket-right', 'curly-left', 'curly-right', 'rect-shape', 'circle-shape']);
        if (TWO_PT_HANDLE_TYPES.has(path.type) && path.points?.length >= 2 &&
            (path === this.app._lastGraceObject || isSelectHovered)) {
            const p0 = path.points[0];
            const pN = path.points[path.points.length - 1];
            const hr = 7 * (this.app.scale / 1.5) * pageFactor;
            ctx.save();
            ctx.setLineDash([]);
            ctx.shadowBlur = 0;
            for (const [hx, hy] of [
                [p0.x * canvas.width,  p0.y * canvas.height],
                [pN.x * canvas.width,  pN.y * canvas.height],
            ]) {
                ctx.beginPath();
                ctx.arc(hx, hy, hr, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.restore()
    }

    /**
     * Internal helper to render stylized pens segment-by-segment.
     */
    _renderSpecialPen(ctx, canvas, path, pageFactor, globalMultiplier, individualScale, oldAlpha) {
        const BASE = (this.app.scale / 1.5) * pageFactor * globalMultiplier * individualScale;
        const n = path.points.length;

        if (path.type === 'brush-pen') {
            const MIN_W = 0.8 * BASE, MAX_W = 4.5 * BASE;
            const SLOW_PX = 1.5 * BASE, FAST_PX = 30 * BASE;
            for (let i = 0; i < n - 1; i++) {
                const p1 = path.points[i], p2 = path.points[i + 1];
                let w = MAX_W;
                if (p1.pressure !== undefined && p1.pressure !== 0.5) {
                    w = MIN_W + (MAX_W - MIN_W) * ((p1.pressure + p2.pressure) / 2);
                } else {
                    const dx = (p2.x - p1.x) * canvas.width;
                    const dy = (p2.y - p1.y) * canvas.height;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const t = Math.max(0, Math.min(1, (dist - SLOW_PX) / (FAST_PX - SLOW_PX)));
                    w = MAX_W * (1 - t) + MIN_W * t;
                }
                ctx.lineWidth = w;
                ctx.beginPath();
                ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                ctx.stroke();
            }
        } 
        else if (path.type === 'fountain-pen') {
            const MIN_W = 0.4 * BASE, MAX_W = 4.0 * BASE;
            const hasPressure = n > 0 && path.points[0].pressure !== undefined && path.points[0].pressure !== 0.5;
            for (let i = 0; i < n - 1; i++) {
                const p1 = path.points[i], p2 = path.points[i + 1];
                const progress = (i + 0.5) / Math.max(n - 1, 1);
                // Smooth taper envelope: 0 at ends, 1 in middle
                const taper = Math.min(progress / 0.12, 1) * Math.min((1 - progress) / 0.12, 1);
                const avgPressure = hasPressure ? ((p1.pressure ?? 0.5) + (p2.pressure ?? 0.5)) / 2 : 0.6;
                ctx.lineWidth = MIN_W + (MAX_W - MIN_W) * avgPressure * taper;
                ctx.beginPath();
                ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
                ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
                ctx.stroke();
            }
        } 
        else if (path.type === 'pencil-pen') {
            const hasPressure = n > 0 && path.points[0].pressure !== undefined && path.points[0].pressure !== 0.5;
            const passes = [{ aFactor: 1.0, jScale: 0 }, { aFactor: 0.3, jScale: 0.7 }];
            for (const pass of passes) {
                for (let i = 0; i < n - 1; i++) {
                    const p1 = path.points[i], p2 = path.points[i + 1];
                    const avgPressure = hasPressure ? ((p1.pressure ?? 0.5) + (p2.pressure ?? 0.5)) / 2 : 0.6;
                    const jx = Math.sin(i * 127.1 + pass.jScale * 311.7) * pass.jScale * BASE;
                    const jy = Math.cos(i * 311.7 + pass.jScale * 127.1) * pass.jScale * BASE;
                    ctx.globalAlpha = oldAlpha * (0.25 + avgPressure * 0.6) * pass.aFactor;
                    ctx.lineWidth = BASE * (0.7 + avgPressure * 0.5);
                    ctx.beginPath();
                    ctx.moveTo(p1.x * canvas.width + jx, p1.y * canvas.height + jy);
                    ctx.lineTo(p2.x * canvas.width + jx, p2.y * canvas.height + jy);
                    ctx.stroke();
                }
            }
        }
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
        if (!toolDef && stamp.type && stamp.type.startsWith('custom-text') && this.app._activeCustomText) {
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
        let globalScale = (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier * individualScale;

        // HOVER POP: Scale up the object when hovered to make it obvious
        if (isHovered) {
            globalScale *= 1.18;
        }

        // SANITY CAP: Prevent anchors/stamps from becoming ridiculously large (e.g. if multipliers are stacked)
        // Hard cap at 5x the base size at zoom 1.5
        const MAX_SANITY_SCALE = 5.0;
        if (globalScale > MAX_SANITY_SCALE) {
            // console.warn(`[AnnotationRenderer] Sanity Cap triggered for ${stamp.type}: ${globalScale.toFixed(2)} -> ${MAX_SANITY_SCALE}`);
            globalScale = MAX_SANITY_SCALE;
        }

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
            ctx.shadowBlur = 12
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
        ctx.fillStyle = isHovered ? '#ef444433' : (isSelectHovered ? '#6366f133' : `${color}33`)
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

                case 'tempo':
                    const noteChar = d.noteSymbol || '\uE1D5';
                    const bpmValue = stamp.data || '120';
                    const isDotted = d.dotted || false;

                    const baseSize = 16 * textScale;
                    const noteSize = baseSize * 1.8;
                    const tSize = baseSize;

                    ctx.fillStyle = finalColor;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';

                    // 1. Note (Bravura)
                    ctx.font = `400 ${noteSize}px Bravura`;
                    ctx.fillText(noteChar, x, y);

                    // Fixed advance based on visual notehead width in Bravura
                    let curX = x + (noteSize * 0.55);

                    // 2. Dot
                    if (isDotted) {
                        ctx.beginPath();
                        // Placement: Tightly to the right of notehead, shifted slightly down from center
                        ctx.arc(curX + (noteSize * 0.08), y + (noteSize * 0.08), noteSize * 0.05, 0, Math.PI * 2);
                        ctx.fill();
                        curX += (noteSize * 0.22);
                    }

                    // 3. Equals (Serif, slightly elevated for visual baseline)
                    ctx.font = `600 ${tSize}px serif`;
                    ctx.fillText('=', curX, y - (tSize * 0.05));
                    curX += (tSize * 0.95);

                    // 4. BPM (Outfit / Sans-serif) - Enlarged by 25%
                    ctx.font = `600 ${tSize * 1.25}px Outfit`;
                    ctx.fillText(bpmValue, curX, y);
                    break;

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
                        ctx.textAlign = 'left'
                        ctx.textBaseline = 'top' // top-left of text aligns with stamp.x/y
                        const lines = content.split('\n')
                        const lineHeight = fontSize * 1.2
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
                        ctx.fillStyle = isHovered ? 'rgba(0,0,0,0.9)' : isSelectHovered ? 'rgba(99,102,241,0.9)' : 'rgba(0,0,0,0.55)'
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
                            const rectY = y - h / 2
                            if (ctx.roundRect) {
                                ctx.roundRect(rectX, rectY, w, h, radius)
                            } else {
                                ctx.strokeRect(rectX, rectY, w, h)
                            }
                            ctx.stroke()

                            // Slightly darker text inside frame
                            ctx.fillStyle = isHovered ? 'rgba(0,0,0,1)' : isSelectHovered ? 'rgba(99,102,241,1)' : 'rgba(0,0,0,0.8)'
                        }

                        ctx.fillText(stamp.data || '#', x, y)
                    } else if (d.variant === 'playback') {
                        // Restore missing Music Player / Playback Head
                        const s = size * 0.45
                        ctx.strokeStyle = color
                        ctx.lineWidth = 1.2 * globalScale
                        ctx.beginPath()
                        ctx.moveTo(x, y - s)
                        ctx.lineTo(x, y + s)
                        ctx.arc(x, y - s, 6 * globalScale, 0, Math.PI * 2)
                        ctx.stroke()

                        // Label text to the right (NEW: Fix missing description)
                        if (stamp.data) {
                            let label = stamp.data;
                            if (typeof label === 'string' && label.includes('|')) {
                                const parts = label.split('|');
                                label = parts[3] || parts[0]; // Use label or type
                            }
                            
                            ctx.fillStyle = color
                            ctx.font = `600 ${10 * textScale}px Outfit`
                            ctx.textAlign = 'left'
                            ctx.textBaseline = 'middle'
                            ctx.fillText(label.substring(0, 16), x + 8 * globalScale, y)
                        }
                    } else if (d.variant === 'page-bookmark') {
                        // Bookmark ribbon flag shape with V-notch at bottom
                        const s = size * 0.55
                        ctx.fillStyle = color
                        ctx.beginPath()
                        ctx.moveTo(x - s * 0.38, y - s * 0.65)  // top-left
                        ctx.lineTo(x + s * 0.38, y - s * 0.65)  // top-right
                        ctx.lineTo(x + s * 0.38, y + s * 0.65)  // bottom-right
                        ctx.lineTo(x, y + s * 0.2)   // V-notch point
                        ctx.lineTo(x - s * 0.38, y + s * 0.65)  // bottom-left
                        ctx.closePath()
                        ctx.fill()
                        // The user requested: "不需要把圖章的內容打在score上" -> Text label removed.
                    }
                    break

                case 'sticky': {
                    const isMinimized = d.minimized === true

                    if (isMinimized) {
                        // ── Minimized: small sticky icon ──
                        const mW = 28 * globalScale
                        const mH = 22 * globalScale
                        const mFold = 7 * globalScale
                        ctx.shadowColor = 'rgba(0,0,0,0.2)'
                        ctx.shadowBlur = 3 * globalScale
                        ctx.shadowOffsetX = 1 * globalScale
                        ctx.shadowOffsetY = 1 * globalScale
                        ctx.fillStyle = '#fef08a'
                        ctx.beginPath()
                        ctx.moveTo(x, y)
                        ctx.lineTo(x + mW - mFold, y)
                        ctx.lineTo(x + mW, y + mFold)
                        ctx.lineTo(x + mW, y + mH)
                        ctx.lineTo(x, y + mH)
                        ctx.closePath()
                        ctx.fill()
                        ctx.shadowColor = 'transparent'
                        ctx.fillStyle = 'rgba(0,0,0,0.13)'
                        ctx.beginPath()
                        ctx.moveTo(x + mW - mFold, y)
                        ctx.lineTo(x + mW, y + mFold)
                        ctx.lineTo(x + mW - mFold, y + mFold)
                        ctx.closePath()
                        ctx.fill()
                        break
                    }

                    // ── Full size (4×) ──
                    const W = 440 * globalScale
                    const H = 320 * globalScale
                    const pad = 16 * globalScale
                    const fold = 40 * globalScale

                    ctx.shadowColor = 'rgba(0,0,0,0.22)'
                    ctx.shadowBlur = 8 * globalScale
                    ctx.shadowOffsetX = 3 * globalScale
                    ctx.shadowOffsetY = 3 * globalScale

                    ctx.fillStyle = '#fef08a'
                    ctx.beginPath()
                    ctx.moveTo(x, y)
                    ctx.lineTo(x + W - fold, y)
                    ctx.lineTo(x + W, y + fold)
                    ctx.lineTo(x + W, y + H)
                    ctx.lineTo(x, y + H)
                    ctx.closePath()
                    ctx.fill()

                    ctx.shadowColor = 'transparent'
                    ctx.fillStyle = 'rgba(0,0,0,0.13)'
                    ctx.beginPath()
                    ctx.moveTo(x + W - fold, y)
                    ctx.lineTo(x + W, y + fold)
                    ctx.lineTo(x + W - fold, y + fold)
                    ctx.closePath()
                    ctx.fill()

                    ctx.strokeStyle = 'rgba(0,0,0,0.18)'
                    ctx.lineWidth = 1.2 * globalScale
                    ctx.beginPath()
                    ctx.moveTo(x + W - fold, y)
                    ctx.lineTo(x + W, y + fold)
                    ctx.stroke()

                    const sContent = stamp.data || ''
                    const sfs = 18 * globalScale
                    const lineH = sfs * 1.35
                    const maxW = W - pad * 2 - fold * 0.3
                    ctx.font = `500 ${sfs}px Outfit`
                    ctx.fillStyle = '#854d0e'
                    ctx.textAlign = 'left'
                    ctx.textBaseline = 'top'

                    const sLines = []
                    sContent.split('\n').forEach(para => {
                        if (!para) { sLines.push(''); return }
                        const words = para.split(' ')
                        let cur = ''
                        words.forEach(w => {
                            const test = cur ? cur + ' ' + w : w
                            if (ctx.measureText(test).width > maxW && cur) {
                                sLines.push(cur); cur = w
                            } else { cur = test }
                        })
                        sLines.push(cur)
                    })

                    sLines.forEach((line, i) => {
                        const lineY = y + pad + i * lineH
                        if (lineY + sfs < y + H - pad) ctx.fillText(line, x + pad, lineY)
                    })

                    // ── Corner minimize button (bottom-right) ──
                    const btnR = 12 * globalScale
                    const btnCX = x + W - 20 * globalScale
                    const btnCY = y + H - 20 * globalScale
                    ctx.fillStyle = 'rgba(180, 120, 20, 0.75)'
                    ctx.beginPath()
                    ctx.arc(btnCX, btnCY, btnR, 0, Math.PI * 2)
                    ctx.fill()
                    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
                    ctx.lineWidth = 1.8 * globalScale
                    ctx.beginPath()
                    ctx.moveTo(btnCX - 6 * globalScale, btnCY)
                    ctx.lineTo(btnCX + 6 * globalScale, btnCY)
                    ctx.stroke()
                    break
                }

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
        const preset = this.app.activeToolPreset || 1.0
        const size = 6 * (this.app.scale / 1.5) * preset

        ctx.save()
        ctx.beginPath()
        ctx.globalAlpha = 0.3
        ctx.fillStyle = color

        if (type === 'highlighter') {
            // Rectangular tip for highlighter - match the new base 26
            const w = size * 4.5, h = size * 1.5
            ctx.roundRect(x - w / 2, y - h / 2, w, h, 2)
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

    /**
     * Draw a pulsating golden radar circle around the target.
     * Uses Date.now() for smooth time-based animation.
     */
    _drawRadarPulse(ctx, canvas, s) {
        // Use normalized coordinates and convert back to pixel space
        const x = s.points ? s.points[0].x * canvas.width : (s.x || 0) * canvas.width;
        const y = s.points ? s.points[0].y * canvas.height : (s.y || 0) * canvas.height;
        
        const time = Date.now() / 1000;
        const pulseCount = 3; 
        
        ctx.save();
        ctx.setLineDash([]); // Reset line dash
        ctx.shadowBlur = 4;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
        
        for (let i = 0; i < pulseCount; i++) {
            const progress = (time + (i / pulseCount)) % 1; // 0 to 1
            const radius = 12 + progress * 60; // Expand from 12 to 72 pixels
            const alpha = (1 - progress) * 0.8; // Fade out
            
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 223, 0, ${alpha})`; // Golden highlight
            ctx.lineWidth = 3 * (1 - progress * 0.5);
            ctx.stroke();
            
            // Add a solid inner core
            if (i === 0) {
                ctx.beginPath();
                ctx.arc(x, y, 15, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 215, 0, 0.3)`;
                ctx.fill();
                ctx.strokeStyle = `rgba(255, 255, 255, 0.6)`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
        
        ctx.restore();

        // If inspector is active and there's a target, keep animating the frame
        // NOTE: We do NOT use requestAnimationFrame() directly inside the logic loop to avoid infinite recursion.
        // Animation should be driven by the InspectorManager or specific UI triggers.
    }
}
