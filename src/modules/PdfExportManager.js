export class PdfExportManager {
    constructor(app) {
        this.app = app;
    }

    async exportFlattenedPDF(options = {}) {
        const { returnBlob = false } = options;
        if (!this.app.viewerManager.pdf) {
            this.app.showMessage('請先開啟一份樂譜。', 'info');
            return null;
        }

        // Ask which cloaks to include in PDF
        const cloakDefs = [
            { id: 'black', label: '黑色斗篷' },
            { id: 'red',   label: '紅色斗篷' },
            { id: 'blue',  label: '藍色斗篷' },
        ]
        const hasCloaked = this.app.stamps.some(s => s.hiddenGroup)
        let pdfIncludeCloaks = { black: true, red: true, blue: true }
        if (hasCloaked) {
            const result = await this.app.showDialog({
                title: 'PDF 斗篷標籤',
                message: '選擇要包含在 PDF 中的斗篷標籤：',
                icon: '👻',
                type: 'cloak-export',
                cloakDefs,
                defaultInclude: pdfIncludeCloaks,
            })
            if (result === 'cancel') return null
            if (result && typeof result === 'object') pdfIncludeCloaks = result
        }
        // Temporarily override cloakVisible for rendering
        const savedCloakVisible = { ...this.app.cloakVisible }
        this.app.cloakVisible = pdfIncludeCloaks;

        if (!window.jspdf || !window.jspdf.jsPDF) {
            this.app.showMessage('PDF 匯出套件載入失敗，請檢查網路連線。', 'error');
            return;
        }

        this.app.showMessage('正在生成 PDF，請稍候...', 'system');
        const pdfViewer = this.app.viewerManager.pdf;
        const numPages = pdfViewer.numPages;
        const jsPDF = window.jspdf.jsPDF;
        
        let outPdf = null;
        const currentActiveTools = document.getElementById('active-tools-container');
        if (currentActiveTools) currentActiveTools.style.display = 'none'; // Hide tools during capture

        // REUSE CANVASES
        const baseCanvas = document.createElement('canvas');
        const annoCanvas = document.createElement('canvas');

        try {
            console.log('[PdfExportManager] Starting export loop...');
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                this.app.showMessage(`正在處理第 ${pageNum} / ${numPages} 頁...`, 'system');
                console.log(`[PdfExportManager] Processing page ${pageNum}`);
                
                // 1. Render Base PDF Page to offscreen canvas
                const page = await pdfViewer.getPage(pageNum);
                
                // --- Canvas Size Capping for Export Stability ---
                // Lowering export cap to 16M pixels to ensure stability on memory-constrained iPads
                const MAX_AREA = 16777216; 
                let baseViewport = page.getViewport({ scale: 2.0 });
                let exportRenderScale = 1.0;
                
                if (baseViewport.width * baseViewport.height > MAX_AREA && (baseViewport.width * baseViewport.height) > 0) {
                    exportRenderScale = Math.sqrt(MAX_AREA / (baseViewport.width * baseViewport.height));
                    console.warn(`[PdfExportManager] Page ${pageNum} exceeds MAX_AREA. Falling back to scale ${ (2.0 * exportRenderScale).toFixed(2) }x`);
                }
                const viewport = page.getViewport({ scale: 2.0 * exportRenderScale });

                const baseCtx = baseCanvas.getContext('2d', { alpha: false });
                baseCanvas.width = viewport.width;
                baseCanvas.height = viewport.height;
                
                const renderTask = page.render({
                    canvasContext: baseCtx,
                    viewport: viewport,
                    intent: 'display'
                });
                await renderTask.promise;
                console.log(`[PdfExportManager] Base canvas rendered (${baseCanvas.width}x${baseCanvas.height})`);

                // 2. Render Annotations to offscreen canvas
                annoCanvas.width = viewport.width;
                annoCanvas.height = viewport.height;
                const annoCtx = annoCanvas.getContext('2d');
                
                // Get scale ratio between export viewport and abstract 595.0 width used for stamps
                const exportScale = viewport.width / 595.0;
                // Unified drawing scale (matching live renderer's zoom/1.5 logic)
                const drawScale = exportScale / 1.5;

                // Determine visible sources and layers beforehand
                const visibleSources = new Set(this.app.sources.filter(s => s.visible).map(s => s.id));
                const visibleLayerIds = new Set(this.app.layers.filter(l => l.visible).map(l => l.id));

                // Draw stamps
                const pageStamps = this.app.stamps.filter(s => s.page === pageNum);
                for (const group of pageStamps) {
                    if (group.deleted) continue;
                    
                    const effLayerId = this.app.annotationManager.getEffectiveLayerId(group);
                    if (!visibleLayerIds.has(effLayerId)) continue;
                    if (!visibleSources.has(group.sourceId)) continue;

                    const layer = this.app.layers.find(l => l.id === group.layerId);
                    const isForeign = group.sourceId !== 'self';
                    annoCtx.globalAlpha = 1.0; 
                    if (isForeign) {
                       const source = this.app.sources.find(s => s.id === group.sourceId);
                       if (source && source.opacity) annoCtx.globalAlpha = source.opacity;
                    }

                    if (group.points && Array.isArray(group.points)) {
                        annoCtx.save();
                        annoCtx.setLineDash([]);
                        annoCtx.lineCap = 'round';
                        annoCtx.lineJoin = 'round';
                        
                        // Adjust dash for export scale
                        if (isForeign || group.dashed) {
                            annoCtx.setLineDash([8 * drawScale, 6 * drawScale]);
                        }

                        if (group.type && group.type.includes('highlighter')) {
                            const baseColor = group.color || '#fde047';
                            annoCtx.strokeStyle = isForeign ? '#e5e7ebAA' : baseColor + '44';
                            annoCtx.lineWidth = 14 * drawScale;
                        } else {
                            annoCtx.strokeStyle = group.color || layer?.color || '#ff4757';
                            annoCtx.lineWidth = (group.type === 'line' ? 1.2 : 1.8) * drawScale;
                        }

                        const startX = group.points[0].x * annoCanvas.width;
                        const startY = group.points[0].y * annoCanvas.height;
                        
                        if (group.type === 'slur' && group.points.length >= 2) {
                             const p1 = group.points[0];
                             const p2 = group.points[group.points.length - 1];
                             const x1 = p1.x * annoCanvas.width, y1 = p1.y * annoCanvas.height;
                             const x2 = p2.x * annoCanvas.width, y2 = p2.y * annoCanvas.height;
                             const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
                             const dx = x2 - x1, dy = y2 - y1;
                             const dist = Math.sqrt(dx * dx + dy * dy);
                             const curvatureValue = group.curvature !== undefined ? group.curvature : -0.28;
                             const curvature = dist * curvatureValue;
                             const px = -(dy / dist) * curvature;
                             const py = (dx / dist) * curvature;
                             const cx = mx + px, cy = my + py;
                             annoCtx.beginPath();
                             annoCtx.moveTo(x1, y1);
                             annoCtx.quadraticCurveTo(cx, cy, x2, y2);
                             annoCtx.stroke();
                        } else {
                            annoCtx.beginPath();
                            annoCtx.moveTo(startX, startY);
                            for (let i = 1; i < group.points.length; i++) {
                                annoCtx.lineTo(group.points[i].x * annoCanvas.width, group.points[i].y * annoCanvas.height);
                            }
                            annoCtx.stroke();
                        }
                        
                        if (group.arrow && group.points.length >= 2) {
                            const p2 = group.points[group.points.length - 1];
                            const p1 = group.points[group.points.length - 2];
                            const x2 = p2.x * annoCanvas.width, y2 = p2.y * annoCanvas.height;
                            const x1 = p1.x * annoCanvas.width, y1 = p1.y * annoCanvas.height;
                            const dx = x2 - x1, dy = y2 - y1;
                            const angle = Math.atan2(dy, dx);
                            const headlen = 15 * exportScale;
                            annoCtx.beginPath();
                            annoCtx.setLineDash([]);
                            annoCtx.moveTo(x2, y2);
                            annoCtx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
                            annoCtx.moveTo(x2, y2);
                            annoCtx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
                            annoCtx.stroke();
                        }
                        annoCtx.restore();
                    } else {
                        // IT IS A STAMP OR TEXT
                        annoCtx.save();
                        const x = group.x * annoCanvas.width;
                        const y = group.y * annoCanvas.height;
                        let toolDef = null;
                        
                        if (group.draw) {
                            toolDef = { draw: group.draw };
                        }
                        if (!toolDef) {
                            for (const set of this.app.toolsets) {
                                const tool = set.tools.find(t => t.id === group.type);
                                if (tool) { toolDef = tool; break; }
                            }
                        }
                        
                        const toolSize = this.app.stampSizeOverrides?.[toolDef?.id] ?? toolDef?.draw?.size ?? 24;
                        const userMultiplier = this.app.stampSizeMultiplier || 1.0;
                        const scoreMultiplier = this.app.scoreStampScale || 1.0;
                        
                        // Unified Scale Factor (Standardizing on reference scale 1.5 to match live renderer)
                        const globalScale = drawScale * userMultiplier * scoreMultiplier;
                        
                        const size = toolSize * globalScale;
                        const textScale = globalScale;
                        const color = group.color || layer?.color || '#ff4757';
                        
                        if (isForeign) {
                            annoCtx.setLineDash([4, 3]);
                            annoCtx.globalAlpha *= 0.7;
                        }
                        annoCtx.strokeStyle = color;
                        annoCtx.fillStyle = `${color}33`; // fallback for fill
                        annoCtx.lineWidth = 2.2 * globalScale;
                        annoCtx.lineCap = 'round';
                        annoCtx.lineJoin = 'round';
                        
                        if (toolDef && toolDef.draw) {
                            const d = toolDef.draw;
                            annoCtx.beginPath();
                            switch (d.type) {
                                case 'text':
                                    annoCtx.font = `${d.font || ''} ${(d.size || 24) * textScale}px ${d.fontFace || 'Outfit'}`;
                                    annoCtx.fillStyle = color;
                                    annoCtx.textAlign = 'center';
                                    annoCtx.textBaseline = 'middle';
                                    annoCtx.fillText(d.content, x, y);
                                    break;
                                case 'shape':
                                    if (d.shape === 'circle') {
                                        annoCtx.arc(x, y, size * (d.radius || 1), 0, Math.PI * 2);
                                        if (d.fill) { annoCtx.fillStyle = color; annoCtx.fill(); }
                                        annoCtx.stroke();
                                    }
                                    break;
                                case 'path':
                                    annoCtx.translate(x, y);
                                    annoCtx.scale(size, size);
                                    annoCtx.lineWidth = (d.strokeWidth || 2.5) * globalScale / size;
                                    try {
                                        const pathObj = new Path2D(d.data);
                                        annoCtx.strokeStyle = color;
                                        annoCtx.stroke(pathObj);
                                        if (d.fill !== 'none') {
                                            annoCtx.fillStyle = color;
                                            annoCtx.fill(pathObj);
                                        }
                                    } catch (e) {
                                        console.error("Path2D error:", e, d.data);
                                    }
                                    break;
                                case 'special':
                                    if (d.variant === 'input-text') {
                                        const content = group.data || '';
                                        const hasCJK = /[\u4e00-\u9fa5]/.test(content);
                                        let fontSize = 15 * textScale;
                                        let fontWeight = 'bold';
                                        if (hasCJK) { fontSize *= 0.85; fontWeight = '500'; }
                                        annoCtx.font = `${fontWeight} ${fontSize}px Outfit`;
                                        annoCtx.fillStyle = color;
                                        annoCtx.textAlign = 'left';
                                        annoCtx.textBaseline = 'top';
                                        const lines = content.split('\n');
                                        const lineHeight = fontSize * 1.2;
                                        lines.forEach((line, i) => {
                                            annoCtx.fillText(line, x, y + (i * lineHeight));
                                        });
                                    } else if (d.variant === 'measure') {
                                        // Normalize to renderer reference scale (1.5) so size matches live view
                                        const isFree = group.type === 'measure-free';
                                        const REF_SCALE = 1.5;
                                        const fontSize = (isFree ? 12 : 13) / REF_SCALE * textScale;
                                        const gScale = textScale / REF_SCALE;
                                        annoCtx.font = `700 ${fontSize}px Outfit`;
                                        annoCtx.fillStyle = 'rgba(0,0,0,0.55)';
                                        annoCtx.textAlign = 'left';
                                        annoCtx.textBaseline = 'middle';
                                        if (isFree) {
                                            const tw = annoCtx.measureText(group.data || '#').width;
                                            const pad = fontSize * 0.4;
                                            const fw = tw + pad * 2, fh = fontSize + pad;
                                            annoCtx.strokeStyle = 'rgba(0,0,0,0.55)';
                                            annoCtx.lineWidth = 1.2 * gScale;
                                            annoCtx.beginPath();
                                            if (annoCtx.roundRect) annoCtx.roundRect(x - pad, y - fh / 2, fw, fh, 4 * gScale);
                                            else annoCtx.strokeRect(x - pad, y - fh / 2, fw, fh);
                                            annoCtx.stroke();
                                            annoCtx.fillStyle = 'rgba(0,0,0,0.8)';
                                        }
                                        annoCtx.fillText(group.data || '#', x, y);
                                    }
                                    break;
                                case 'complex':
                                    if (d.variant === 'fermata') {
                                        const fSize = size * 0.45;
                                        annoCtx.arc(x, y, fSize, Math.PI, 0); annoCtx.stroke();
                                        annoCtx.beginPath(); annoCtx.arc(x, y - fSize * 0.3, fSize * 0.15, 0, Math.PI * 2); annoCtx.fillStyle = color; annoCtx.fill();
                                    } else if (d.variant === 'anchor') {
                                        // Do not export anchors to PDF, purely visual UI aid
                                    }
                                    break;
                            }
                        } else {
                            // Basic fallback for unknown stamps without toolDef
                            annoCtx.font = `${24 * exportScale * (group.scale || 1)}px "Outfit", sans-serif`;
                            annoCtx.textBaseline = 'middle';
                            annoCtx.textAlign = 'center';
                            annoCtx.fillStyle = color;
                            annoCtx.fillText(group.icon || group.type, x, y);
                        }
                        annoCtx.restore();
                    }
                }

                console.log(`[PdfExportManager] Annotations drawn`);

                // 3. Composite Annotations onto Base PDF Canvas
                baseCtx.drawImage(annoCanvas, 0, 0);

                // 4. Convert to Image and add to jsPDF
                console.log(`[PdfExportManager] Converting to image...`);
                let imgData;
                try {
                    imgData = baseCanvas.toDataURL('image/jpeg', 0.85);
                } catch (e) {
                    console.error('[PdfExportManager] Failed toDataURL:', e);
                    throw e;
                }
                
                const orientation = viewport.width > viewport.height ? 'l' : 'p';
                console.log(`[PdfExportManager] Creating/adding to jsPDF, orientation=${orientation}`);
                
                if (pageNum === 1) {
                    try {
                        outPdf = new jsPDF({
                            orientation: orientation,
                            unit: 'px',
                            format: [viewport.width, viewport.height]
                        });
                        console.log(`[PdfExportManager] jsPDF instance created successfully`);
                    } catch (e) {
                        console.error('[PdfExportManager] Failed to construct jsPDF:', e);
                        throw e;
                    }
                } else {
                    outPdf.addPage([viewport.width, viewport.height], orientation);
                }
                
                outPdf.setPage(pageNum);
                outPdf.addImage(imgData, 'JPEG', 0, 0, viewport.width, viewport.height);
                console.log(`[PdfExportManager] Image added to page ${pageNum}`);
            }

            console.log('[PdfExportManager] Saving output...');
            const userName = this.app.profileManager?.data?.userName || 'Export';
            const baseFilename = this.app.scoreDetailManager?.currentInfo?.name || 'ScoreFlow_Export';

            if (returnBlob) {
                const blob = outPdf.output('blob');
                console.log('[PdfExportManager] Returning blob');
                return blob;
            }

            // 5. Save the output PDF
            outPdf.save(`${baseFilename}_${userName}_Annotated.pdf`);
            this.app.showMessage('PDF 匯出完畢！', 'system');
            console.log('[PdfExportManager] Export complete');

        } catch (err) {
            console.error('[PdfExportManager] PDF Export Failed Details:', err.name, err.message, err.stack);
            if (!returnBlob) this.app.showMessage(`PDF 匯出失敗: ${err.message || 'Unknown Error'}`, 'error');
            return null;
        } finally {
            // Memory Cleanup
            baseCanvas.width = 0; baseCanvas.height = 0;
            annoCanvas.width = 0; annoCanvas.height = 0;
            
            if (currentActiveTools) currentActiveTools.style.display = '';
            this.app.cloakVisible = savedCloakVisible; // Restore cloak visibility
        }
    }
}
