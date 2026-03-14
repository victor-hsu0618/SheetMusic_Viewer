import { CoordMapper } from './interaction/CoordMapper.js';
import { InteractionUI } from './interaction/UIManager.js';

export class InteractionManager {
    constructor(app) {
        this.app = app;
    }

    createCaptureOverlay(wrapper, pageNum, width, height) {
        const overlay = document.createElement('div');
        overlay.className = 'capture-overlay';
        overlay.dataset.page = pageNum;
        overlay.style.width = `${width}px`;
        overlay.style.height = `${height}px`;

        const virtualPointer = document.createElement('div');
        virtualPointer.className = 'virtual-pointer';
        overlay.appendChild(virtualPointer);

        let isInteracting = false;
        let activeObject = null;
        let isMovingExisting = false;
        let isPanning = false;
        let graceObject = null;
        let graceTimer = null;
        let pointerIdleTimer = null;

        const resetPointerIdleTimer = () => {
            if (pointerIdleTimer) clearTimeout(pointerIdleTimer);
            
            // AUTO-REVERT DISABLED: User requested to keep the current tool active indefinitely.
            /*
            // If we are currently in "view" mode, "settings", or "recycle-bin", we don't need to auto-switch
            if (['view', 'settings', 'recycle-bin'].includes(this.app.activeStampType)) return;

            pointerIdleTimer = setTimeout(() => {
                // HARD SAFE MODE: Automatically switch to "view" (pan) tool
                this.app.activeStampType = 'view';
                if (this.app.toolManager) this.app.toolManager.updateActiveTools();
                InteractionUI.syncVirtualPointer({ type: 'mousemove' }, 'view', overlay, virtualPointer, CoordMapper, this.app);
            }, this.app.pointerIdleTimeoutMs || 8000); 
            */
        };

        // --- HELPERS ---

        const getPointerType = (e) => {
            if (e.pointerType) return e.pointerType;
            // Fallback for older environments or specific touch events
            if (e.type.startsWith('touch') || (e.touches && e.touches.length > 0)) return 'touch';
            return 'mouse';
        };

        const getWrapperPixels = (normX, normY) => {
            const canvas = wrapper.querySelector('.pdf-canvas') || wrapper.querySelector('.annotation-layer:not(.virtual-canvas)');
            if (!canvas) return { x: normX * width, y: normY * height };
            return {
                x: canvas.offsetLeft + (normX * canvas.offsetWidth),
                y: canvas.offsetTop + (normY * canvas.offsetHeight)
            };
        };

        const updateTouchAction = () => {
            const toolType = this.app.activeStampType;
            // Ensure body-level attribute is synced (redundant but safe)
            document.body.dataset.activeTool = toolType;
        };

        // --- HANDLERS ---

        const startAction = (e) => {
            if (isInteracting) return; 

            const pos = CoordMapper.getPos(e, overlay);
            const toolType = this.app.activeStampType;
            const pointerType = getPointerType(e);

            // 1. View Mode Panning (Only for mouse/pen in view mode)
            if (toolType === 'view') {
                if (pointerType !== 'touch') {
                    isPanning = true;
                    const startX = e.clientX, startY = e.clientY;
                    const startScrollTop = this.app.viewer.scrollTop;
                    const startScrollLeft = this.app.viewer.scrollLeft;
                    overlay.style.cursor = 'grabbing';
                    this.app.viewer.style.scrollBehavior = 'auto';
                    const doPan = (ev) => {
                        if (!isPanning) return;
                        this.app.viewer.scrollTop = startScrollTop - (ev.clientY - startY);
                        this.app.viewer.scrollLeft = startScrollLeft - (ev.clientX - startX);
                    };
                    const stopPan = () => {
                        isPanning = false;
                        overlay.style.cursor = '';
                        this.app.viewer.style.scrollBehavior = '';
                        window.removeEventListener('pointermove', doPan);
                        window.removeEventListener('mouseup', stopPan);
                    };
                    window.addEventListener('pointermove', doPan);
                    window.addEventListener('mouseup', stopPan);
                }
                return;
            }

            // 2. Prevent Scroll for all other tools (Select, Pen, Stamp, etc.)
            if (pointerType === 'touch') {
                if (e.touches && e.touches.length > 1) return; // Allow multi-touch zoom
                if (e.cancelable) e.preventDefault(); // Stop native scrolling
            }

            // 1. Grace Period Interaction
            if (graceObject) {
                const offsetPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay);
                const center = CoordMapper.getGraceCenter(graceObject);
                const dx = (offsetPos.x - center.x) * width;
                const dy = (offsetPos.y - center.y) * height;
                const distSq = dx * dx + dy * dy;
                const thresholdSq = Math.pow(CoordMapper.getGraceObjectPixelSize(graceObject, this.app) * 0.2, 2);
                
                if (distSq < thresholdSq) { 
                    activeObject = graceObject;
                    isMovingExisting = true;
                    isInteracting = true;
                    this.app.isInteracting = true;
                    
                    // SHOW TRASH only when the user actually grabs the grace object
                    // SHOW TRASH Pop-up Portal (70px above the object)
                    const wCenter = getWrapperPixels(center.x, center.y);
                    InteractionUI.showTrash(true, wrapper, wCenter.x, wCenter.y - 70);
                    
                    if (graceTimer) clearTimeout(graceTimer);
                    graceObject = null;
                    this.app._lastGraceObject = null;
                    this.app._dragLastPos = offsetPos;
                    attachGlobalListeners();
                    InteractionUI.syncVirtualPointer(e, activeObject.type, overlay, virtualPointer, CoordMapper, this.app);
                    return;
                } else {
                    if (graceTimer) clearTimeout(graceTimer);
                    graceObject = null;
                    this.app._lastGraceObject = null;
                    InteractionUI.showTrash(false, wrapper);
                    this.app.redrawStamps(pageNum);
                }
            }

            InteractionUI.showTrash(false, wrapper);
            isInteracting = true;
            this.app.isInteracting = true;
            
            // 2. Selection/Text Logic: Allow clicking existing objects even when not in explicit Select mode
            const pPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay);
            const target = this.app.selectHoveredStamp || this.app.findClosestStamp(pageNum, pPos.x, pPos.y, true);

            // Special handling for Text Tool: click existing text to edit it
            if (target && (toolType === 'text' || toolType === 'tempo-text')) {
                if (target.type === 'text' || target.type === 'tempo-text') {
                    activeObject = target;
                    isMovingExisting = true;
                    this.app.lastFocusedStamp = activeObject;
                    this.app._dragLastPos = pPos;
                    InteractionUI.syncVirtualPointer(e, activeObject.type, overlay, virtualPointer, CoordMapper, this.app);
                    attachGlobalListeners();
                    return;
                }
            }

            const isSelectionTool = ['copy', 'select', 'recycle-bin'].includes(toolType);
            const isSlurBending = (toolType === 'slur' && target && target.type === 'slur');

            if (isSelectionTool || isSlurBending) {
                if (target) {
                    overlay.style.cursor = pointerType === 'mouse' ? 'none' : (toolType === 'recycle-bin' ? 'none' : 'none'); 
                    if (toolType === 'recycle-bin') {
                        this.app.annotationManager.eraseStampTarget(target);
                        isInteracting = false;
                        this.app.isInteracting = false;
                    } else if (toolType === 'copy') {
                        const clone = JSON.parse(JSON.stringify(target));
                        clone.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}`;
                        clone.updatedAt = Date.now();
                        this.app.stamps.push(clone);
                        this.app.activeStampType = 'select';
                        activeObject = clone;
                        isMovingExisting = true;
                    } else {
                        activeObject = target;
                        isMovingExisting = true;

                        // SLUR CURVATURE CHECK: If clicking near the apex of a selected slur
                        if (activeObject.type === 'slur' && activeObject._renderedApex) {
                            const dx = (pPos.x - activeObject._renderedApex.x) * width;
                            const dy = (pPos.y - activeObject._renderedApex.y) * height;
                            // Increased tolerance to 45 for easier touch targeting
                            if (Math.sqrt(dx*dx + dy*dy) < 45) {
                                this.isAdjustingCurvature = true;
                            } else {
                                this.isAdjustingCurvature = false;
                            }
                        } else {
                            this.isAdjustingCurvature = false;
                        }
                    }
                    
                    if (activeObject) {
                        this.app.lastFocusedStamp = activeObject;
                        this.app._dragLastPos = pPos;
                        this.app.selectHoveredStamp = null;
                        const cent = CoordMapper.getGraceCenter(activeObject);
                        const wCent = getWrapperPixels(cent.x, cent.y);
                        InteractionUI.showTrash(true, wrapper, wCent.x, wCent.y - 70);
                        this.app.redrawStamps(pageNum);
                        InteractionUI.syncVirtualPointer(e, activeObject.type, overlay, virtualPointer, CoordMapper, this.app);
                        attachGlobalListeners();
                    }
                } else if (isSelectionTool) {
                    // MAGNETIC START: Allow starting interaction even if we hit nothing (ONLY for selection tools)
                    isInteracting = true;
                    this.app.isInteracting = true;
                    activeObject = null;
                    isMovingExisting = true; // Flag that we ARE looking for something to move/interact with
                    this.app._dragLastPos = pPos;
                    attachGlobalListeners();
                    InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
                } else {
                    isInteracting = false;
                    this.app.isInteracting = false;
                }
            } else if (['pen', 'red-pen', 'green-pen', 'blue-pen', 'highlighter', 'highlighter-red', 'highlighter-blue', 'highlighter-green', 'line', 'slur', 'dashed-pen', 'arrow-pen'].includes(toolType)) {
                const toolDef = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === toolType);
                activeObject = {
                    type: toolType, page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId,
                    points: [CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay)],
                    color: (toolDef && toolDef.draw && toolDef.draw.color) ? toolDef.draw.color : this.app.activeColor,
                    dashed: toolDef?.draw?.dashed || false,
                    arrow: toolDef?.draw?.arrow || false,
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}`,
                    updatedAt: Date.now()
                };
                if (toolType === 'slur') activeObject.curvature = -0.28;
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
            } else if (toolType === 'eraser') {
                const eraserTarget = this.app.hoveredStamp || this.app.findClosestStamp(pageNum, pPos.x, pPos.y, false);
                if (eraserTarget) {
                    this.app.annotationManager.eraseStampTarget(eraserTarget);
                    isInteracting = false;
                    this.app.isInteracting = false;
                } else {
                    // MAGNETIC START for eraser
                    isInteracting = true;
                    this.app.isInteracting = true;
                    activeObject = null;
                    attachGlobalListeners();
                    InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
                }
            } else {
                // New stamp placement
                const fPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay);
                activeObject = {
                    page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId, type: toolType,
                    x: toolType === 'measure' ? 0.05 : fPos.x, 
                    y: fPos.y, color: this.app.activeColor, data: null, updatedAt: Date.now(),
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}`
                };
                const group = this.app.toolsets.find(g => g.tools.some(t => t.id === toolType));
                if (group) {
                    const layer = this.app.layers.find(l => l.type === group.type || l.id === group.type);
                    if (layer) activeObject.layerId = layer.id;
                }
                if (!activeObject.layerId) activeObject.layerId = 'draw';
                if (toolType.startsWith('custom-text-') && this.app._activeCustomText) {
                    activeObject.draw = { type: 'text', content: this.app._activeCustomText, font: 'italic 300', size: this.app.defaultFontSize, fontFace: 'serif' };
                } else {
                    const tool = group?.tools.find(t => t.id === toolType);
                    if (tool && tool.draw) {
                        activeObject.draw = { ...tool.draw };
                    }
                }
                this.app.lastFocusedStamp = activeObject;
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
            }
        };

        const moveAction = (e) => {
            if (!isInteracting) return;
            
            const pointerType = getPointerType(e);
            const toolType = this.app.activeStampType;

            // --- CROSS-PAGE HANDOFF LOGIC ---
            let currentOverlay = overlay;
            let currentWrapper = wrapper;
            let currentPageNum = pageNum;

            // Check if we are outside current overlay or if we have an activeObject on a different page
            const rawPos = CoordMapper.getPos(e, overlay);
            if (rawPos.y < -0.01 || rawPos.y > 1.01 || (activeObject && activeObject.page !== pageNum)) {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const targetOverlay = el?.closest('.capture-overlay');
                if (targetOverlay) {
                    const newPageNum = parseInt(targetOverlay.dataset.page);
                    if (!isNaN(newPageNum)) {
                        currentPageNum = newPageNum;
                        currentOverlay = targetOverlay;
                        currentWrapper = targetOverlay.parentElement;
                    }
                }
            }
            
            const pos = CoordMapper.getPos(e, currentOverlay);
            const currentVirtualPointer = currentOverlay.querySelector('.virtual-pointer');

            // MAGNETIC PICKUP: If we started an interaction but hadn't hit anything yet
            if (!activeObject && (['select', 'eraser', 'copy', 'recycle-bin'].includes(toolType))) {
                const pPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, currentOverlay);
                const target = this.app.findClosestStamp(currentPageNum, pPos.x, pPos.y, toolType !== 'eraser');
                if (target) {
                    if (toolType === 'eraser' || toolType === 'recycle-bin') {
                        this.app.annotationManager.eraseStampTarget(target);
                    } else {
                        activeObject = target;
                        isMovingExisting = true;
                        this.app.lastFocusedStamp = activeObject;
                        this.app._dragLastPos = pPos;
                        const cent = CoordMapper.getGraceCenter(activeObject);
                        const wCent = getWrapperPixels(cent.x, cent.y); // This uses Page 1's wrapper still, might need fix but trash is fixed anyway
                        InteractionUI.showTrash(true, currentWrapper, wCent.x, wCent.y - 70);
                        this.app.redrawStamps(currentPageNum);
                    }
                }
            }

            if (!activeObject) {
                // If no object, hide all virtual pointers except the current one
                document.querySelectorAll('.virtual-pointer.active').forEach(vp => {
                    if (vp !== currentVirtualPointer) vp.classList.remove('active');
                });
                InteractionUI.syncVirtualPointer(e, toolType, currentOverlay, currentVirtualPointer, CoordMapper, this.app);
                return;
            }

            if (isMovingExisting) {
                if (this.isAdjustingCurvature && activeObject.type === 'slur') {
                    const p0 = activeObject.points[0];
                    const p1 = activeObject.points[activeObject.points.length - 1];
                    const dxBaseline = p1.x - p0.x;
                    const dyBaseline = p1.y - p0.y;
                    const distBaseline = Math.sqrt(dxBaseline*dxBaseline + dyBaseline*dyBaseline);
                    
                    if (distBaseline > 0.0001) {
                        const perpDist = (-dyBaseline * pos.x + dxBaseline * pos.y + (dyBaseline * p0.x - dxBaseline * p0.y)) / distBaseline;
                        activeObject.curvature = (perpDist / distBaseline) * 2;
                    }
                } else {
                    const targetPos = CoordMapper.getStampPreviewPos(pos, pointerType, activeObject.type, this.app, currentOverlay);
                    if (activeObject.page !== currentPageNum) {
                        const oldPage = activeObject.page;
                        activeObject.page = currentPageNum;
                        this.app.redrawStamps(oldPage);
                    }
                    if (activeObject.points) {
                        const dx = targetPos.x - (this.app._dragLastPos?.x ?? targetPos.x);
                        const dy = targetPos.y - (this.app._dragLastPos?.y ?? targetPos.y);
                        activeObject.points = activeObject.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    } else {
                        activeObject.x = activeObject.type === 'measure' ? 0.05 : targetPos.x;
                        activeObject.y = targetPos.y;
                    }
                    this.app._dragLastPos = targetPos;
                }
                this.app.redrawStamps(currentPageNum);
            } else if (activeObject.points) {
                const currentPos = CoordMapper.getStampPreviewPos(pos, pointerType, activeObject.type, this.app, currentOverlay);
                if (activeObject.page !== currentPageNum) {
                    const oldPage = activeObject.page;
                    activeObject.page = currentPageNum;
                    this.app.redrawStamps(oldPage);
                }
                if (activeObject.type === 'line' || activeObject.type === 'slur') {
                    activeObject.points = [activeObject.points[0], currentPos];
                } else {
                    activeObject.points.push(currentPos);
                }
                const canvas = currentWrapper.querySelector('.annotation-layer.virtual-canvas');
                if (canvas) this.app.drawPathOnCanvas(canvas.getContext('2d'), canvas, activeObject);
            } else {
                const pPos = CoordMapper.getStampPreviewPos(pos, pointerType, activeObject.type, this.app, currentOverlay);
                if (activeObject.page !== currentPageNum) {
                    const oldPage = activeObject.page;
                    activeObject.page = currentPageNum;
                    this.app.redrawStamps(oldPage);
                }
                activeObject.x = pPos.x; activeObject.y = pPos.y;
                const canvas = currentWrapper.querySelector('.annotation-layer.virtual-canvas');
                if (canvas) {
                    this.app.redrawStamps(currentPageNum);
                    const layer = this.app.layers.find(l => l.id === activeObject.layerId);
                    this.app.drawStampOnCanvas(canvas.getContext('2d'), canvas, activeObject, layer?.color || '#000', true, false, false, pos);
                }
            }
            InteractionUI.setTrashActive(InteractionUI.isObjectOverTrash(activeObject, currentWrapper, CoordMapper), currentWrapper);
            
            // Sync current virtual pointer and hide others
            document.querySelectorAll('.virtual-pointer.active').forEach(vp => {
                if (vp !== currentVirtualPointer) vp.classList.remove('active');
            });
            InteractionUI.syncVirtualPointer(e, activeObject.type, currentOverlay, currentVirtualPointer, CoordMapper, this.app);
            resetPointerIdleTimer();
        };

        const endAction = (e) => {
            if (!isInteracting) return;
            try {
                if (activeObject) {
                    const targetPageNum = activeObject.page;
                    const targetWrapper = document.querySelector(`.page-container[data-page="${targetPageNum}"]`);
                    const isOverTrash = InteractionUI.isObjectOverTrash(activeObject, targetWrapper, CoordMapper);
                    if (isOverTrash) {
                        if (isMovingExisting) this.app.annotationManager.eraseStampTarget(activeObject);
                        this.app.showMessage('Object Deleted', 'success');
                        activeObject = null;
                        InteractionUI.showTrash(false, targetWrapper);
                        this.app.redrawStamps(targetPageNum);
                    } else if (activeObject.type === 'text' || activeObject.type === 'tempo-text') {
                        this.app.annotationManager.spawnTextEditor(targetWrapper, targetPageNum, activeObject);
                    } else if (['measure', 'measure-free'].includes(activeObject.type) && !isMovingExisting) {
                        const targetObj = activeObject;
                        const defVal = parseInt(this.app.lastMeasureNum || 0) + (this.app.measureStep || 4);
                        this.app.annotationManager.promptMeasureNumber(defVal).then(num => {
                            if (num !== null && num !== undefined) {
                                targetObj.data = String(num); this.app.lastMeasureNum = String(num);
                                this.app.stamps.push(targetObj); this.app.saveToStorage(true); this.app.updateRulerMarks();
                                startGracePeriod(targetObj);
                            }
                            this.app.redrawStamps(targetPageNum);
                        });
                        return;
                    } else {
                        if (!isMovingExisting && activeObject.type !== 'view') this.app.stamps.push(activeObject);
                        if (activeObject.type === 'anchor') this.app.updateRulerMarks();
                        this.app.saveToStorage(true);
                        this.app.redrawStamps(targetPageNum);
                        startGracePeriod(activeObject);
                    }
                }
            } finally {
                // HIDE POINTER on end
                InteractionUI.syncVirtualPointer(e, null, overlay, virtualPointer, CoordMapper, this.app);
                cleanupInteraction(e);
            }
        };

        const startGracePeriod = (obj) => {
            if (!obj || obj.deleted) return;
            graceObject = obj;
            this.app._lastGraceObject = graceObject;
            // REMOVED IMMEDIATE TRASH SHOW: Don't show trash until the user actually drags the object again.
            if (graceTimer) clearTimeout(graceTimer);
            graceTimer = setTimeout(() => {
                if (graceObject === obj) { 
                    graceObject = null; 
                    const targetWrapper = document.querySelector(`.page-container[data-page="${obj.page}"]`);
                    InteractionUI.showTrash(false, targetWrapper); 
                    const targetOverlay = targetWrapper?.querySelector('.capture-overlay');
                    const targetVP = targetOverlay?.querySelector('.virtual-pointer');
                    InteractionUI.syncVirtualPointer({ type: 'mousemove' }, null, targetOverlay, targetVP, CoordMapper, this.app);
                }
                if (this.app._lastGraceObject === obj) { this.app._lastGraceObject = null; this.app.redrawStamps(obj.page); }
            }, 1500);
        };

        const cleanupInteraction = (e) => {
            isInteracting = false;
            this.app.isInteracting = false;
            isMovingExisting = false;
            activeObject = null;
            this.isAdjustingCurvature = false;
            this.app._dragLastPos = null;
            
            const pointerType = getPointerType(e || { type: 'mousemove' });
            overlay.style.cursor = this.app.isStampTool() ? (pointerType === 'mouse' ? 'none' : 'crosshair') : '';
            
            if (!graceObject) InteractionUI.showTrash(false, wrapper);
            else InteractionUI.setTrashActive(false, wrapper);
            detachGlobalListeners();

            // Explicitly hide pointer if no activity
            InteractionUI.syncVirtualPointer({ type: 'mousemove' }, null, overlay, virtualPointer, CoordMapper, this.app);
        };

        const hoverAction = (e) => {
            if (isInteracting) return;
            const pos = CoordMapper.getPos(e, overlay);
            const pointerType = getPointerType(e);
            const toolType = this.app.activeStampType;

            if (toolType === 'eraser') {
                const found = this.app.findClosestStamp(pageNum, pos.x, pos.y, false);
                if (found !== this.app.hoveredStamp) {
                    this.app.hoveredStamp = found;
                    this.app.redrawStamps(pageNum);
                    wrapper.querySelector('.erase-hover-chip')?.remove();
                    if (found) {
                        const chip = document.createElement('div');
                        chip.className = 'erase-hover-chip';
                        chip.textContent = '🗑 Delete';
                        const wPx = getWrapperPixels(found.x || found.points?.[0]?.x || 0, found.y || found.points?.[0]?.y || 0);
                        chip.style.left = `${wPx.x}px`; chip.style.top = `${wPx.y}px`;
                        wrapper.appendChild(chip);
                    }
                }
            }

            if (['select', 'copy', 'recycle-bin', 'text', 'tempo-text'].includes(toolType)) {
                const pPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay);
                const found = this.app.findClosestStamp(pageNum, pPos.x, pPos.y, true);
                if (found !== this.app.selectHoveredStamp) {
                    this.app.selectHoveredStamp = found;
                    this.app.redrawStamps(pageNum);
                }
            } else if (this.app.isStampTool()) {
                const pPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay);
                let shouldPreview = true;
                if (graceObject) {
                    const center = CoordMapper.getGraceCenter(graceObject);
                    const canvas = wrapper.querySelector('.pdf-canvas') || wrapper.querySelector('.annotation-layer:not(.virtual-canvas)');
                    const dx = (pPos.x - center.x) * (canvas?.offsetWidth || width);
                    const dy = (pPos.y - center.y) * (canvas?.offsetHeight || height);
                    if (Math.sqrt(dx*dx + dy*dy) < CoordMapper.getGraceObjectPixelSize(graceObject, this.app) * 0.6) {
                        this.app.redrawStamps(pageNum);
                        overlay.style.cursor = 'grab';
                        shouldPreview = false;
                    }
                }
                if (shouldPreview) {
                    overlay.style.cursor = pointerType === 'mouse' ? 'none' : 'crosshair';
                    const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas');
                    if (canvas) {
                        this.app.redrawStamps(pageNum);
                        const layer = this.app.layers.find(l => l.id === 'draw');
                        this.app.drawStampOnCanvas(canvas.getContext('2d'), canvas, { type: toolType, x: pPos.x, y: pPos.y, page: pageNum }, layer?.color || '#000', true, false, false, pos);
                    }
                }
            }
            InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
            resetPointerIdleTimer();
        };

        const attachGlobalListeners = () => {
            detachGlobalListeners(); 
            window.addEventListener('pointermove', moveAction);
            window.addEventListener('pointerup', endAction);
            window.addEventListener('pointercancel', endAction);
        };

        const detachGlobalListeners = () => {
            window.removeEventListener('pointermove', moveAction);
            window.removeEventListener('pointerup', endAction);
            window.removeEventListener('pointercancel', endAction);
        };

        overlay.addEventListener('pointerdown', startAction);
        overlay.addEventListener('pointermove', hoverAction);
        overlay.addEventListener('mouseleave', () => {
            virtualPointer?.classList.remove('active');
            this.app.hoveredStamp = this.app.selectHoveredStamp = null;
            this.app.redrawStamps(pageNum);
            wrapper.querySelector('.erase-hover-chip')?.remove();
        });

        InteractionUI.ensureTrashBin(wrapper);
        wrapper.appendChild(overlay);
        
        // Save reference for manual updates if needed
        overlay._updateTouchAction = updateTouchAction;
        updateTouchAction();
    }

    /**
     * Globally update the touch-action of all active overlays based on current tool.
     */
    updateAllOverlaysTouchAction() {
        const toolType = this.app.activeStampType;
        const action = (toolType === 'view') ? 'pan-y' : 'none';
        document.querySelectorAll('.capture-overlay').forEach(el => {
            el.style.touchAction = action;
        });
    }
}
