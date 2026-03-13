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

        const getWrapperPixels = (normX, normY) => {
            const canvas = wrapper.querySelector('.pdf-canvas') || wrapper.querySelector('.annotation-layer:not(.virtual-canvas)');
            if (!canvas) return { x: normX * width, y: normY * height };
            return {
                x: canvas.offsetLeft + (normX * canvas.offsetWidth),
                y: canvas.offsetTop + (normY * canvas.offsetHeight)
            };
        };

        // --- HANDLERS ---

        const startAction = (e) => {
            if (isInteracting) return; 

            const pos = CoordMapper.getPos(e, overlay);
            const toolType = this.app.activeStampType;

            if (toolType === 'view') {
                if (e.type !== 'touchstart') {
                    isPanning = true;
                    const startX = e.clientX, startY = e.clientY;
                    const startScrollTop = this.app.viewer.scrollTop;
                    const startScrollLeft = this.app.viewer.scrollLeft;
                    overlay.style.cursor = 'grabbing';
                    e.preventDefault();
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
                        window.removeEventListener('mousemove', doPan);
                        window.removeEventListener('mouseup', stopPan);
                    };
                    window.addEventListener('mousemove', doPan);
                    window.addEventListener('mouseup', stopPan);
                }
                return;
            }

            if (e.type === 'touchstart' && e.touches && e.touches.length > 1) return;
            if (e.type === 'touchstart') e.preventDefault();

            // 1. Grace Period Interaction
            if (graceObject) {
                const isTouch = e.type.startsWith('touch') || (e.touches && e.touches.length > 0);
                const offsetPos = CoordMapper.getStampPreviewPos(pos, isTouch, toolType, this.app, overlay);
                const center = CoordMapper.getGraceCenter(graceObject);
                const dx = (offsetPos.x - center.x) * width;
                const dy = (offsetPos.y - center.y) * height;
                const distSq = dx * dx + dy * dy;
                const thresholdSq = Math.pow(CoordMapper.getGraceObjectPixelSize(graceObject, this.app) * 0.6, 2);
                
                if (distSq < thresholdSq) { 
                    activeObject = graceObject;
                    isMovingExisting = true;
                    isInteracting = true;
                    const wCenter = getWrapperPixels(center.x, center.y);
                    InteractionUI.showTrash(true, wrapper, wCenter.x, wCenter.y);
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
            const isTouch = e.type.startsWith('touch') || (e.touches && e.touches.length > 0);
            
            // 2. Selection/Text Logic: Allow clicking existing objects even when not in explicit Select mode
            const pPos = CoordMapper.getStampPreviewPos(pos, isTouch, toolType, this.app, overlay);
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

            if (toolType === 'copy' || toolType === 'select' || toolType === 'recycle-bin') {
                if (target) {
                    if (toolType === 'recycle-bin') {
                        this.app.annotationManager.eraseStampTarget(target);
                        isInteracting = false;
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
                    }
                    
                    if (activeObject) {
                        this.app.lastFocusedStamp = activeObject;
                        this.app._dragLastPos = pPos;
                        this.app.selectHoveredStamp = null;
                        const cent = CoordMapper.getGraceCenter(activeObject);
                        const wCent = getWrapperPixels(cent.x, cent.y);
                        InteractionUI.showTrash(true, wrapper, wCent.x, wCent.y);
                        this.app.redrawStamps(pageNum);
                        InteractionUI.syncVirtualPointer(e, activeObject.type, overlay, virtualPointer, CoordMapper, this.app);
                        attachGlobalListeners();
                    }
                } else {
                    isInteracting = false;
                }
            } else if (['pen', 'highlighter', 'line'].includes(toolType)) {
                activeObject = {
                    type: toolType, page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId,
                    points: [CoordMapper.getStampPreviewPos(pos, isTouch, toolType, this.app, overlay)],
                    color: this.app.layers.find(l => l.id === 'draw').color,
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}`,
                    updatedAt: Date.now()
                };
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
            } else if (toolType === 'eraser') {
                const eraserTarget = this.app.hoveredStamp || this.app.findClosestStamp(pageNum, pos.x, pos.y, false);
                if (eraserTarget) this.app.annotationManager.eraseStampTarget(eraserTarget);
                isInteracting = false;
            } else {
                // New stamp placement
                const fPos = CoordMapper.getStampPreviewPos(pos, isTouch, toolType, this.app, overlay);
                activeObject = {
                    page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId, type: toolType,
                    x: fPos.x, y: fPos.y, data: null, updatedAt: Date.now(),
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}`
                };
                const group = this.app.toolsets.find(g => g.tools.some(t => t.id === toolType));
                if (group) {
                    const layer = this.app.layers.find(l => l.type === group.type || l.id === group.type);
                    if (layer) activeObject.layerId = layer.id;
                }
                if (!activeObject.layerId) activeObject.layerId = 'draw';
                if (toolType.startsWith('custom-text-') && this.app._activeCustomText) {
                    activeObject.draw = { type: 'text', content: this.app._activeCustomText, font: 'italic 300', size: 20, fontFace: 'serif' };
                }
                this.app.lastFocusedStamp = activeObject;
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
            }
        };

        const moveAction = (e) => {
            if (!isInteracting || !activeObject) return;
            const pos = CoordMapper.getPos(e, overlay);
            const isTouch = e.type.startsWith('touch') || (e.touches && e.touches.length > 0);

            if (isMovingExisting) {
                overlay.style.cursor = 'grabbing';
                const targetPos = CoordMapper.getStampPreviewPos(pos, isTouch, activeObject.type, this.app, overlay);
                if (activeObject.points) {
                    const dx = targetPos.x - (this.app._dragLastPos?.x ?? targetPos.x);
                    const dy = targetPos.y - (this.app._dragLastPos?.y ?? targetPos.y);
                    activeObject.points = activeObject.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                } else {
                    activeObject.x = targetPos.x;
                    activeObject.y = targetPos.y;
                }
                this.app._dragLastPos = targetPos;
                this.app.redrawStamps(pageNum);
            } else if (activeObject.points) {
                const currentPos = CoordMapper.getStampPreviewPos(pos, isTouch, activeObject.type, this.app, overlay);
                if (activeObject.type === 'line') {
                    // Constant 2 points for a straight line: [start, current]
                    activeObject.points = [activeObject.points[0], currentPos];
                } else {
                    activeObject.points.push(currentPos);
                }
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas');
                if (canvas) this.app.drawPathOnCanvas(canvas.getContext('2d'), canvas, activeObject);
            } else {
                const pPos = CoordMapper.getStampPreviewPos(pos, isTouch, activeObject.type, this.app, overlay);
                activeObject.x = pPos.x; activeObject.y = pPos.y;
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas');
                if (canvas) {
                    this.app.redrawStamps(pageNum);
                    const layer = this.app.layers.find(l => l.id === activeObject.layerId);
                    this.app.drawStampOnCanvas(canvas.getContext('2d'), canvas, activeObject, layer?.color || '#000', true, false, false, pos);
                }
            }
            InteractionUI.setTrashActive(InteractionUI.isObjectOverTrash(activeObject, wrapper, CoordMapper), wrapper);
            InteractionUI.syncVirtualPointer(e, activeObject.type, overlay, virtualPointer, CoordMapper, this.app);
        };

        const endAction = (e) => {
            if (!isInteracting) return;
            try {
                if (activeObject) {
                    const isOverTrash = InteractionUI.isObjectOverTrash(activeObject, wrapper, CoordMapper);
                    if (isOverTrash) {
                        if (isMovingExisting) this.app.annotationManager.eraseStampTarget(activeObject);
                        this.app.showMessage('Object Deleted', 'success');
                        activeObject = null;
                        InteractionUI.showTrash(false, wrapper);
                        this.app.redrawStamps(pageNum);
                    } else if (activeObject.type === 'text' || activeObject.type === 'tempo-text') {
                        this.app.annotationManager.spawnTextEditor(wrapper, pageNum, activeObject);
                    } else if (activeObject.type === 'measure' && !isMovingExisting) {
                        this.app.annotationManager.promptMeasureNumber(this.app.lastMeasureNum).then(num => {
                            if (num) {
                                activeObject.data = String(num); this.app.lastMeasureNum = String(num);
                                this.app.stamps.push(activeObject); this.app.saveToStorage(true); this.app.updateRulerMarks();
                                startGracePeriod(activeObject);
                            }
                            this.app.redrawStamps(pageNum);
                        });
                        return;
                    } else {
                        if (!isMovingExisting) this.app.stamps.push(activeObject);
                        if (activeObject.type === 'anchor') this.app.updateRulerMarks();
                        this.app.saveToStorage(true);
                        this.app.redrawStamps(pageNum);
                        startGracePeriod(activeObject);
                    }
                }
            } finally {
                cleanupInteraction();
            }
        };

        const startGracePeriod = (obj) => {
            if (!obj || obj.deleted) return;
            graceObject = obj;
            this.app._lastGraceObject = graceObject;
            const center = CoordMapper.getGraceCenter(graceObject);
            const wPix = getWrapperPixels(center.x, center.y);
            InteractionUI.showTrash(true, wrapper, wPix.x, wPix.y);
            if (graceTimer) clearTimeout(graceTimer);
            graceTimer = setTimeout(() => {
                if (graceObject === obj) { graceObject = null; InteractionUI.showTrash(false, wrapper); }
                if (this.app._lastGraceObject === obj) { this.app._lastGraceObject = null; this.app.redrawStamps(pageNum); }
            }, 2000);
        };

        const cleanupInteraction = () => {
            isInteracting = false;
            isMovingExisting = false;
            activeObject = null;
            this.app._dragLastPos = null;
            overlay.style.cursor = this.app.isStampTool() ? 'crosshair' : '';
            if (!graceObject) InteractionUI.showTrash(false, wrapper);
            else InteractionUI.setTrashActive(false, wrapper);
            detachGlobalListeners();
        };

        const hoverAction = (e) => {
            if (isInteracting) return;
            const pos = CoordMapper.getPos(e, overlay);
            const isTouch = e.type.startsWith('touch') || (e.touches && e.touches.length > 0);
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
                const pPos = CoordMapper.getStampPreviewPos(pos, isTouch, toolType, this.app, overlay);
                const found = this.app.findClosestStamp(pageNum, pPos.x, pPos.y, true);
                if (found !== this.app.selectHoveredStamp) {
                    this.app.selectHoveredStamp = found;
                    this.app.redrawStamps(pageNum);
                }
            } else if (this.app.isStampTool()) {
                const pPos = CoordMapper.getStampPreviewPos(pos, isTouch, toolType, this.app, overlay);
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
                    overlay.style.cursor = 'crosshair';
                    const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas');
                    if (canvas) {
                        this.app.redrawStamps(pageNum);
                        const layer = this.app.layers.find(l => l.id === 'draw');
                        this.app.drawStampOnCanvas(canvas.getContext('2d'), canvas, { type: toolType, x: pPos.x, y: pPos.y, page: pageNum }, layer?.color || '#000', true, false, false, pos);
                    }
                }
            }
            InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
        };

        const attachGlobalListeners = () => {
            detachGlobalListeners(); 
            window.addEventListener('mousemove', moveAction);
            window.addEventListener('mouseup', endAction);
            window.addEventListener('touchmove', moveAction, { passive: false });
            window.addEventListener('touchend', endAction);
            window.addEventListener('touchcancel', endAction);
        };

        const detachGlobalListeners = () => {
            window.removeEventListener('mousemove', moveAction);
            window.removeEventListener('mouseup', endAction);
            window.removeEventListener('touchmove', moveAction);
            window.removeEventListener('touchend', endAction);
            window.removeEventListener('touchcancel', endAction);
        };

        overlay.addEventListener('mousedown', startAction);
        overlay.addEventListener('mousemove', hoverAction);
        overlay.addEventListener('mouseleave', () => {
            virtualPointer?.classList.remove('active');
            this.app.hoveredStamp = this.app.selectHoveredStamp = null;
            this.app.redrawStamps(pageNum);
            wrapper.querySelector('.erase-hover-chip')?.remove();
        });
        overlay.addEventListener('touchstart', startAction, { passive: false });
        overlay.addEventListener('touchend', endAction);

        InteractionUI.ensureTrashBin(wrapper);
        wrapper.appendChild(overlay);
    }
}
