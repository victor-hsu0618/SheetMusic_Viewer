import { CoordMapper } from './interaction/CoordMapper.js';
import { InteractionUI } from './interaction/UIManager.js';
import { CYCLE_GROUPS, CLOAK_GROUPS } from '../../constants.js';

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

        // Force reset closure state when switching tools to prevent stuck interactions
        overlay._resetState = () => {
            isInteracting = false;
            isPanning = false;
            activeObject = null;
            isMovingExisting = false;
            this.app.isInteracting = false;
            if (graceTimer) clearTimeout(graceTimer);
            graceObject = null;
            this.app._lastGraceObject = null;
            virtualPointer?.classList.remove('active');
            activePointers.clear();
            isTwoFingerPanning = false;
            this.isAdjustingCurvature = false;
            this.app._dragLastPos = null;
            InteractionUI.showTrash(false, wrapper);
            // Always clean up doc bar trash state
            const _dt = document.getElementById('sf-doc-trash-btn')
            _dt?.classList.remove('drag-over', 'drag-active')
            this._hideDragGhost()
            detachGlobalListeners();
        };

        let activePointers = new Map(); // pointerId → {x, y}
        let isTwoFingerPanning = false;
        let twoFingerScrollStart = { top: 0, left: 0 };
        let twoFingerCentroidStart = { x: 0, y: 0 };
        let panCooldown = false;        // Brief post-pan window: suppress preview + stamp placement
        let panCooldownTimer = null;
        let touchBufferTimer = null;

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

        const getPixelsForWrapper = (targetWrap, normX, normY) => {
            const canvas = targetWrap.querySelector('.pdf-canvas') || targetWrap.querySelector('.annotation-layer:not(.virtual-canvas)');
            const rect = targetWrap.getBoundingClientRect();
            if (!canvas) return { x: normX * rect.width, y: normY * rect.height };
            return {
                x: canvas.offsetLeft + (normX * canvas.offsetWidth),
                y: canvas.offsetTop + (normY * canvas.offsetHeight)
            };
        };

        // Returns trash bin {x, y} for showTrash positioning.
        // Always place trash 70px ABOVE the stamp — with upward touch offset, the stamp
        // arrives at the trash slightly before the finger reaches it (forgiving).
        // Previously left-side stamps (x<0.15) had trash BELOW, but the upward offset
        // meant the finger had to travel past the trash bin — unreachable in practice.
        const getTrashPos = (normX, wCentX, wCentY) => {
            return { x: wCentX, y: wCentY - 210 };
        };

        const updateTouchAction = () => {
            const toolType = this.app.activeStampType;
            // Ensure body-level attribute is synced (redundant but safe)
            document.body.dataset.activeTool = toolType;
        };

        // Two-finger pan handlers (stamp mode)
        const doTwoFingerPan = (e) => {
            if (!isTwoFingerPanning || e.pointerType !== 'touch') return;
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            if (activePointers.size < 2) return;
            const pts = [...activePointers.values()];
            const cx = (pts[0].x + pts[1].x) / 2;
            const cy = (pts[0].y + pts[1].y) / 2;
            
            const dx = cx - twoFingerCentroidStart.x;
            const dy = cy - twoFingerCentroidStart.y;
            
            const targetTop = twoFingerScrollStart.top - dy;
            const maxScroll = this.app.viewer.scrollHeight - this.app.viewer.clientHeight;
            
            if (targetTop < 0) {
                this.app.viewer.scrollTop = 0;
                const overscroll = targetTop * 0.3; // Resistance
                this.app.container.style.transform = `translateY(${-overscroll}px)`;
            } else if (targetTop > maxScroll) {
                this.app.viewer.scrollTop = maxScroll;
                const overscroll = (targetTop - maxScroll) * 0.3; // Resistance
                this.app.container.style.transform = `translateY(${-overscroll}px)`;
            } else {
                this.app.viewer.scrollTop = targetTop;
                this.app.container.style.transform = '';
            }
            this.app.viewer.scrollLeft = twoFingerScrollStart.left - dx;
        };

        const stopTwoFingerPan = (e) => {
            activePointers.delete(e.pointerId);
            if (isTwoFingerPanning && activePointers.size < 2) {
                isTwoFingerPanning = false;
                window.removeEventListener('pointermove', doTwoFingerPan);
                window.removeEventListener('pointerup', stopTwoFingerPan);
                window.removeEventListener('pointercancel', stopTwoFingerPan);
                
                // Snap back overscroll
                this.app.container.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                this.app.container.style.transform = 'translateY(0)';
                setTimeout(() => { this.app.container.style.transition = ''; }, 400);

                // Cooldown: suppress stamp preview + placement for 400ms after pan ends
                panCooldown = true;
                virtualPointer?.classList.remove('active');
                if (panCooldownTimer) clearTimeout(panCooldownTimer);
                panCooldownTimer = setTimeout(() => { panCooldown = false; }, 400);
            }
        };

        // --- HANDLERS ---

        const startAction = async (e) => {
            if (e.target.closest('.text-editor-container')) return;

            const toolType = this.app.activeStampType;
            const pointerType = getPointerType(e);

            // Two-finger pan in any stamp mode
            if (this.app.twoFingerPanEnabled && pointerType === 'touch' && toolType !== 'view') {
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
                if (activePointers.size >= 2) {
                    if (touchBufferTimer) clearTimeout(touchBufferTimer);
                    // Cancel any in-progress single-finger stamp interaction
                    if (isInteracting) {
                        isInteracting = false;
                        this.app.isInteracting = false;
                        activeObject = null;
                        isMovingExisting = false;
                        InteractionUI.showTrash(false, wrapper);
                        detachGlobalListeners();
                    }
                    if (!isTwoFingerPanning) {
                        isTwoFingerPanning = true;
                        twoFingerScrollStart = { top: this.app.viewer.scrollTop, left: this.app.viewer.scrollLeft };
                        const pts = [...activePointers.values()];
                        twoFingerCentroidStart = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
                        window.addEventListener('pointermove', doTwoFingerPan);
                        window.addEventListener('pointerup', stopTwoFingerPan);
                        window.addEventListener('pointercancel', stopTwoFingerPan);
                        isInteracting = false;
                        this.app.isInteracting = false;
                        virtualPointer?.classList.remove('active');
                        this.app.redrawStamps(pageNum);
                    }
                    return;
                }
                
                // First finger: buffer it
                if (touchBufferTimer) clearTimeout(touchBufferTimer);
                touchBufferTimer = setTimeout(() => {
                    touchBufferTimer = null;
                    if (activePointers.size === 1 && !isTwoFingerPanning) {
                        proceedWithAction(e);
                    }
                }, 35);
                return;
            }

            proceedWithAction(e);
        };

        const proceedWithAction = async (e) => {
            const toolType = this.app.activeStampType;
            const pointerType = getPointerType(e);

            if (isInteracting) return;
            if (panCooldown) return; // Post-pan cooldown: ignore taps until fingers settle

            const pos = CoordMapper.getPos(e, overlay);

            // 1. View Mode Panning (JS-Powered for both Mouse and Touch)
            if (toolType === 'view') {
                // Ignore if already panning or interacting
                if (isPanning) return;

                isPanning = true;
                const startX = e.clientX, startY = e.clientY;
                const startScrollTop = this.app.viewer.scrollTop;
                const startScrollLeft = this.app.viewer.scrollLeft;

                overlay.style.cursor = 'grabbing';
                this.app.viewer.style.scrollBehavior = 'auto';

                const doPan = (ev) => {
                    if (!isPanning) return;
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;

                    // Threshold to distinguish between tap and pan
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                        this.app._wasPanning = true;
                    }

                    const targetTop = startScrollTop - dy;
                    const maxScroll = this.app.viewer.scrollHeight - this.app.viewer.clientHeight;

                    if (targetTop < 0) {
                        this.app.viewer.scrollTop = 0;
                        const overscroll = targetTop * 0.3; // Resistance
                        this.app.container.style.transform = `translateY(${-overscroll}px)`;
                    } else if (targetTop > maxScroll) {
                        this.app.viewer.scrollTop = maxScroll;
                        const overscroll = (targetTop - maxScroll) * 0.3; // Resistance
                        this.app.container.style.transform = `translateY(${-overscroll}px)`;
                    } else {
                        this.app.viewer.scrollTop = targetTop;
                        this.app.container.style.transform = '';
                    }
                    this.app.viewer.scrollLeft = startScrollLeft - dx;
                };

                const stopPan = () => {
                    isPanning = false;
                    overlay.style.cursor = '';
                    this.app.viewer.style.scrollBehavior = '';
                    
                    // Snap back overscroll
                    this.app.container.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    this.app.container.style.transform = 'translateY(0)';
                    setTimeout(() => { this.app.container.style.transition = ''; }, 400);

                    // Keep _wasPanning true for a brief moment to prevent accidental taps
                    setTimeout(() => { this.app._wasPanning = false; }, 100);
                    window.removeEventListener('pointermove', doPan);
                    window.removeEventListener('pointerup', stopPan);
                    window.removeEventListener('pointercancel', stopPan);
                };

                window.addEventListener('pointermove', doPan, { passive: true });
                window.addEventListener('pointerup', stopPan);
                window.addEventListener('pointercancel', stopPan);
                return;
            }

            // 2. Single-finger touch in stamp mode → paper drag (same as pan mode)
            //    Only Apple Pencil (pointerType === 'pen') goes through stamp placement.
            //    EXCEPTION: if a grace object is active, fall through so the user can grab it.
            if (pointerType === 'touch' && toolType !== 'view' && !graceObject) {
                if (e.cancelable) e.preventDefault();
                if (isPanning) return;
                isPanning = true;
                const startX = e.clientX, startY = e.clientY;
                const startScrollTop = this.app.viewer.scrollTop;
                const startScrollLeft = this.app.viewer.scrollLeft;
                this.app.viewer.style.scrollBehavior = 'auto';

                const doFingerPan = (ev) => {
                    if (!isPanning) return;
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    const targetTop = startScrollTop - dy;
                    const maxScroll = this.app.viewer.scrollHeight - this.app.viewer.clientHeight;
                    if (targetTop < 0) {
                        this.app.viewer.scrollTop = 0;
                        this.app.container.style.transform = `translateY(${-targetTop * 0.3}px)`;
                    } else if (targetTop > maxScroll) {
                        this.app.viewer.scrollTop = maxScroll;
                        this.app.container.style.transform = `translateY(${-(targetTop - maxScroll) * 0.3}px)`;
                    } else {
                        this.app.viewer.scrollTop = targetTop;
                        this.app.container.style.transform = '';
                    }
                    this.app.viewer.scrollLeft = startScrollLeft - dx;
                };

                const stopFingerPan = () => {
                    if (!isPanning) return;
                    isPanning = false;
                    this.app.viewer.style.scrollBehavior = '';
                    this.app.container.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    this.app.container.style.transform = 'translateY(0)';
                    setTimeout(() => { this.app.container.style.transition = ''; }, 400);
                    window.removeEventListener('pointermove', doFingerPan);
                    window.removeEventListener('pointerup', stopFingerPan);
                    window.removeEventListener('pointercancel', stopFingerPan);
                };

                window.addEventListener('pointermove', doFingerPan, { passive: true });
                window.addEventListener('pointerup', stopFingerPan);
                window.addEventListener('pointercancel', stopFingerPan);
                return;
            }

            // 1. Grace Period Interaction
            if (graceObject) {
                const offsetPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay);
                const threshold = CoordMapper.getGraceObjectPixelSize(graceObject, this.app) * 2.0;
                let distPx;
                if (graceObject.points && graceObject.points.length > 0) {
                    const distFromPos = CoordMapper.getMinPathDist(pos.x, pos.y, graceObject.points) * width;
                    const distFromOffset = CoordMapper.getMinPathDist(offsetPos.x, offsetPos.y, graceObject.points) * width;
                    distPx = Math.min(distFromPos, distFromOffset);
                } else {
                    const center = CoordMapper.getGraceCenter(graceObject);
                    const dxPos = (pos.x - center.x) * width;
                    const dyPos = (pos.y - center.y) * height;
                    const dxOff = (offsetPos.x - center.x) * width;
                    const dyOff = (offsetPos.y - center.y) * height;
                    distPx = Math.min(
                        Math.sqrt(dxPos * dxPos + dyPos * dyPos),
                        Math.sqrt(dxOff * dxOff + dyOff * dyOff)
                    );
                }

                const isDrawingTool = ['pen', 'red-pen', 'green-pen', 'blue-pen', 'highlighter', 'highlighter-red', 'highlighter-blue', 'highlighter-green', 'line', 'slur', 'dashed-pen', 'arrow-pen', 'bracket-left', 'bracket-right'].includes(toolType);
                if (distPx < threshold && !isDrawingTool) {
                    activeObject = graceObject;
                    isMovingExisting = true;
                    isInteracting = true;
                    this.app.isInteracting = true;

                    const graceCenter = CoordMapper.getGraceCenter(graceObject);
                    const wCenter = getPixelsForWrapper(wrapper, graceCenter.x, graceCenter.y);
                    const _tp0 = getTrashPos(graceCenter.x, wCenter.x, wCenter.y);
                    InteractionUI.showTrash(true, wrapper, _tp0.x, _tp0.y);

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
                    // Touch tapped far from grace object: dismiss grace and don't place a new stamp
                    if (pointerType === 'touch') return;
                }
            }

            InteractionUI.showTrash(false, wrapper);
            isInteracting = true;
            this.app.isInteracting = true;

            const pPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay);
            const target = this.app.selectHoveredStamp || this.app.findClosestStamp(pageNum, pPos.x, pPos.y, true);

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

            const isCloakTool = toolType.startsWith('cloak-');
            const isSelectionTool = ['copy', 'select', 'recycle-bin', 'cycle'].includes(toolType) || isCloakTool;
            const isSlurBending = (toolType === 'slur' && target && target.type === 'slur');

            if (isSelectionTool || isSlurBending) {
                if (target) {
                    overlay.style.cursor = pointerType === 'mouse' ? 'none' : (toolType === 'recycle-bin' ? 'none' : 'none');
                    if (toolType === 'cycle') {
                        const group = CYCLE_GROUPS.find(g => g.includes(target.type));
                        if (group) {
                            target.type = group[(group.indexOf(target.type) + 1) % group.length];
                            const newTool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === target.type);
                            if (newTool?.draw) target.draw = { ...newTool.draw };
                            target.updatedAt = Date.now();
                            await this.app.saveToStorage(true);
                            this.app.redrawAllAnnotationLayers();
                        }
                        isInteracting = false;
                        this.app.isInteracting = false;
                    } else if (isCloakTool) {
                        const cloakId = toolType.replace('cloak-', '');
                        target.hiddenGroup = (target.hiddenGroup === cloakId) ? undefined : cloakId;
                        target.updatedAt = Date.now();
                        await this.app.saveToStorage(true);
                        this.app.redrawAllAnnotationLayers();
                        isInteracting = false;
                        this.app.isInteracting = false;
                    } else if (toolType === 'recycle-bin') {
                        await this.app.annotationManager.eraseStampTarget(target);
                        isInteracting = false;
                        this.app.isInteracting = false;
                    } else if (toolType === 'copy') {
                        const clone = JSON.parse(JSON.stringify(target));
                        clone.id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}`;
                        clone.createdAt = Date.now();
                        clone.updatedAt = Date.now();
                        this.app.stamps.push(clone);
                        this.app.activeStampType = 'select';
                        activeObject = clone;
                        isMovingExisting = true;
                    } else {
                        activeObject = target;
                        isMovingExisting = true;

                        if (activeObject.type === 'slur' && activeObject._renderedApex) {
                            const dx = (pPos.x - activeObject._renderedApex.x) * width;
                            const dy = (pPos.y - activeObject._renderedApex.y) * height;
                            if (Math.sqrt(dx * dx + dy * dy) < 45) {
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
                        const wCent = getPixelsForWrapper(wrapper, cent.x, cent.y);
                        const _tp1 = getTrashPos(cent.x, wCent.x, wCent.y);
                        InteractionUI.showTrash(true, wrapper, _tp1.x, _tp1.y);
                        this.app.redrawStamps(pageNum);
                        const startSyncType = ['select', 'copy', 'recycle-bin'].includes(toolType) ? toolType : activeObject.type;
                        InteractionUI.syncVirtualPointer(e, startSyncType, overlay, virtualPointer, CoordMapper, this.app);
                        attachGlobalListeners();
                    }
                } else if (isSelectionTool) {
                    isInteracting = true;
                    this.app.isInteracting = true;
                    activeObject = null;
                    isMovingExisting = true;
                    this.app._dragLastPos = pPos;
                    attachGlobalListeners();
                    InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
                } else {
                    isInteracting = false;
                    this.app.isInteracting = false;
                }
            } else if (['pen', 'red-pen', 'green-pen', 'blue-pen', 'highlighter', 'highlighter-red', 'highlighter-blue', 'highlighter-green', 'line', 'slur', 'dashed-pen', 'arrow-pen', 'bracket-left', 'bracket-right'].includes(toolType)) {
                const toolDef = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === toolType);
                activeObject = {
                    type: toolType, page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId,
                    points: [CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay)],
                    color: (toolDef && toolDef.draw && toolDef.draw.color) ? toolDef.draw.color : this.app.activeColor,
                    dashed: toolDef?.draw?.dashed || false,
                    arrow: toolDef?.draw?.arrow || false,
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}`,
                    createdAt: Date.now(), updatedAt: Date.now(),
                    userScale: this.app.activeToolPreset || 1.0
                };
                if (toolType === 'slur') activeObject.curvature = -0.28;
                isInteracting = true;
                this.app.isInteracting = true;
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
            } else if (toolType === 'eraser') {
                const eraserTarget = this.app.hoveredStamp || this.app.findClosestStamp(pageNum, pPos.x, pPos.y, false);
                if (eraserTarget) {
                    await this.app.annotationManager.eraseStampTarget(eraserTarget);
                    isInteracting = false;
                    this.app.isInteracting = false;
                } else {
                    isInteracting = true;
                    this.app.isInteracting = true;
                    activeObject = null;
                    attachGlobalListeners();
                    InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
                }
            } else {
                const fPos = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, overlay);
                activeObject = {
                    page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId, type: toolType,
                    x: fPos.x, y: fPos.y, color: this.app.activeColor, data: null,
                    id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${Date.now()}`,
                    createdAt: Date.now(), updatedAt: Date.now(),
                    userScale: this.app.activeToolPreset || 1.0
                };
                const group = this.app.toolsets.find(g => g.tools.some(t => t.id === toolType));
                if (group) {
                    const layer = this.app.layers.find(l => l.type === group.type || l.id === group.type);
                    if (layer) activeObject.layerId = layer.id;
                }
                if (!activeObject.layerId) activeObject.layerId = 'draw';
                if (toolType.startsWith('custom-text-') && this.app._activeCustomText) {
                    activeObject.draw = { type: 'text', content: this.app._activeCustomText, font: 'italic 500', size: 16, fontFace: 'serif' };
                } else {
                    const tool = group?.tools.find(t => t.id === toolType);
                    if (tool && tool.draw) {
                        activeObject.draw = { ...tool.draw };
                    }
                }
                isInteracting = true;
                this.app.isInteracting = true;
                this.app.lastFocusedStamp = activeObject;
                const previewCanvas = wrapper.querySelector('.annotation-layer.virtual-canvas');
                if (previewCanvas) {
                    this.app.redrawStamps(pageNum);
                    const previewLayer = this.app.layers.find(l => l.id === activeObject.layerId);
                    this.app.drawStampOnCanvas(previewCanvas.getContext('2d'), previewCanvas, activeObject, previewLayer?.color || '#000', true, false, false, pos);
                }
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app);
            }
        };

        const moveAction = async (e) => {
            if (!isInteracting) return;

            const pointerType = getPointerType(e);
            const toolType = this.app.activeStampType;

            // Stop native behaviors (scrolling/swiping) during interaction
            if (pointerType === 'touch' && e.cancelable) {
                e.preventDefault();
            }

            // --- CROSS-PAGE HANDOFF LOGIC ---
            let currentOverlay = overlay;
            let currentWrapper = wrapper;
            let currentPageNum = pageNum;

            // Check if we are outside current overlay or if we have an activeObject on a different page
            const rawPos = CoordMapper.getPos(e, overlay);
            const outsideCurrentOverlay = rawPos.x < -0.01 || rawPos.x > 1.01 || rawPos.y < -0.01 || rawPos.y > 1.01;
            let outsideAllPages = false;
            if (outsideCurrentOverlay || (activeObject && activeObject.page !== pageNum)) {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const targetOverlay = el?.closest('.capture-overlay');
                if (targetOverlay) {
                    const newPageNum = parseInt(targetOverlay.dataset.page);
                    if (!isNaN(newPageNum)) {
                        currentPageNum = newPageNum;
                        currentOverlay = targetOverlay;
                        currentWrapper = targetOverlay.parentElement;
                    }
                } else if (outsideCurrentOverlay) {
                    outsideAllPages = true;
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
                        await this.app.annotationManager.eraseStampTarget(target);
                    } else {
                        activeObject = target;
                        isMovingExisting = true;
                        this.app.lastFocusedStamp = activeObject;
                        this.app._dragLastPos = pPos;
                        const cent = CoordMapper.getGraceCenter(activeObject);
                        const wCent = getPixelsForWrapper(currentWrapper, cent.x, cent.y);
                        const _tp2 = getTrashPos(cent.x, wCent.x, wCent.y);
                        InteractionUI.showTrash(true, currentWrapper, _tp2.x, _tp2.y);
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

            if (isMovingExisting && outsideAllPages) {
                // Pointer is outside all PDF pages — show ghost preview
                this._showDragGhost(e.clientX, e.clientY, activeObject)
                // Still highlight doc bar trash if pointer is over it
                const docTrash2 = document.getElementById('sf-doc-trash-btn')
                if (docTrash2) {
                    const r2 = docTrash2.getBoundingClientRect()
                    const over2 = e.clientX >= r2.left && e.clientX <= r2.right && e.clientY >= r2.top && e.clientY <= r2.bottom
                    docTrash2.classList.toggle('drag-over', over2)
                    docTrash2.classList.add('drag-active')
                }
                return;
            }
            if (isMovingExisting) this._hideDragGhost()

            if (isMovingExisting) {
                if (this.isAdjustingCurvature && activeObject.type === 'slur') {
                    const p0 = activeObject.points[0];
                    const p1 = activeObject.points[activeObject.points.length - 1];
                    const dxBaseline = p1.x - p0.x;
                    const dyBaseline = p1.y - p0.y;
                    const distBaseline = Math.sqrt(dxBaseline * dxBaseline + dyBaseline * dyBaseline);

                    if (distBaseline > 0.0001) {
                        const perpDist = (-dyBaseline * pos.x + dxBaseline * pos.y + (dyBaseline * p0.x - dxBaseline * p0.y)) / distBaseline;
                        activeObject.curvature = (perpDist / distBaseline) * 2;
                    }
                } else {
                    // When moving an existing object via select/copy/recycle-bin, use toolType (no offset)
                    // so the delta matches the no-offset _dragLastPos set in startAction.
                    const moveEffectiveType = ['select', 'copy', 'recycle-bin'].includes(toolType) ? toolType : activeObject.type;
                    const targetPos = CoordMapper.getStampPreviewPos(pos, pointerType, moveEffectiveType, this.app, currentOverlay);
                    if (activeObject.page !== currentPageNum) {
                        const oldPage = activeObject.page;
                        activeObject.page = currentPageNum;
                        this.app.redrawStamps(oldPage);
                    }
                    const dx = targetPos.x - (this.app._dragLastPos?.x ?? targetPos.x);
                    const dy = targetPos.y - (this.app._dragLastPos?.y ?? targetPos.y);
                    if (activeObject.points) {
                        activeObject.points = activeObject.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    } else {
                        activeObject.x = Number(activeObject.x) + dx;
                        activeObject.y = Number(activeObject.y) + dy;
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
                activeObject.x = Number(pPos.x); activeObject.y = Number(pPos.y);
                const canvas = currentWrapper.querySelector('.annotation-layer.virtual-canvas');
                if (canvas) {
                    this.app.redrawStamps(currentPageNum);
                    const layer = this.app.layers.find(l => l.id === activeObject.layerId);
                    this.app.drawStampOnCanvas(canvas.getContext('2d'), canvas, activeObject, layer?.color || '#000', true, false, false, pos);
                }
            }
            InteractionUI.setTrashActive(InteractionUI.isObjectOverTrash(activeObject, currentWrapper, CoordMapper), currentWrapper);
            // Keep trash bin visible during drag without repositioning
            if (isMovingExisting) {
                const trashBin = wrapper.querySelector('.grace-trash-bin');
                if (trashBin) trashBin.classList.add('show');
                // Highlight doc bar trash when pointer is over it
                const docTrash = document.getElementById('sf-doc-trash-btn')
                if (docTrash) {
                    const r = docTrash.getBoundingClientRect()
                    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
                    docTrash.classList.toggle('drag-over', over)
                    docTrash.classList.add('drag-active')
                }
            }

            // Sync current virtual pointer and hide others
            document.querySelectorAll('.virtual-pointer.active').forEach(vp => {
                if (vp !== currentVirtualPointer) vp.classList.remove('active');
            });
            const moveSyncType = isMovingExisting && ['select', 'copy', 'recycle-bin'].includes(toolType) ? toolType : activeObject.type;
            InteractionUI.syncVirtualPointer(e, moveSyncType, currentOverlay, currentVirtualPointer, CoordMapper, this.app);
            resetPointerIdleTimer();
        };

        const endAction = async (e) => {
            if (!isInteracting) return;
            try {
                if (activeObject) {
                    const targetPageNum = activeObject.page;
                    const targetWrapper = document.querySelector(`.page-container[data-page="${targetPageNum}"]`);
                    // Check doc bar trash (pointer position)
                    const docTrash = document.getElementById('sf-doc-trash-btn')
                    docTrash?.classList.remove('drag-over', 'drag-active')
                    const docTrashRect = docTrash?.getBoundingClientRect()
                    const isOverDocTrash = docTrashRect &&
                        e.clientX >= docTrashRect.left && e.clientX <= docTrashRect.right &&
                        e.clientY >= docTrashRect.top  && e.clientY <= docTrashRect.bottom

                    const isOverTrash = InteractionUI.isObjectOverTrash(activeObject, targetWrapper, CoordMapper) || isOverDocTrash;
                    if (isOverTrash) {
                        if (isMovingExisting) await this.app.annotationManager.eraseStampTarget(activeObject);
                        this.app.showMessage('Object Deleted', 'success');
                        activeObject = null;
                        InteractionUI.showTrash(false, targetWrapper);
                        this.app.redrawStamps(targetPageNum);
                    } else if (['text', 'tempo-text', 'quick-text'].includes(activeObject.type)) {
                        this.app.annotationManager.spawnTextEditor(targetWrapper, targetPageNum, activeObject);
                    } else if (['page-bookmark', 'music-anchor'].includes(activeObject.type) && !isMovingExisting) {
                        if (this.app.activeStampType === 'view') {
                            this.app.redrawStamps(targetPageNum);
                            return;
                        }
                        const targetObj = activeObject;
                        const defaultLabel = targetObj.type === 'page-bookmark' ? `Page ${targetObj.page}` : `Music at Pg ${targetObj.page}`;
                        const dialogTitle = targetObj.type === 'page-bookmark' ? 'Add Page Bookmark' : 'Add Music Anchor';

                        this.app.docActionManager?.showDialog({
                            title: dialogTitle,
                            message: '',
                            icon: targetObj.type === 'page-bookmark' ? '🔖' : '🎵',
                            type: 'input',
                            defaultValue: defaultLabel,
                            placeholder: 'e.g. Solo, Intro, Chorus...'
                        })?.then(async label => {
                            if (label !== null) {
                                targetObj.data = label || defaultLabel;
                                targetObj.updatedAt = Date.now();
                                this.app.stamps.push(targetObj);
                                await this.app.saveToStorage(true);

                                // Refresh Jump Panel if it's a page bookmark
                                if (targetObj.type === 'page-bookmark') {
                                    this.app.jumpManager?.renderBookmarks();
                                }

                                if (this.app.supabaseManager) {
                                    targetObj.updatedAt = Date.now();
                                    this.app.supabaseManager.pushAnnotation(targetObj, this.app.pdfFingerprint);
                                }
                                startGracePeriod(targetObj);
                            }
                            this.app.redrawStamps(targetPageNum);
                        });
                        return;
                    } else if (['measure', 'measure-free'].includes(activeObject.type) && !isMovingExisting) {
                        // Guard: if user switched back to view mode, don't trigger the keypad
                        if (this.app.activeStampType === 'view') {
                            this.app.redrawStamps(targetPageNum);
                            return;
                        }
                        const targetObj = activeObject;
                        this.app.annotationManager.promptMeasureNumber().then(async numStr => {
                            if (numStr !== null && numStr !== undefined && numStr !== '') {
                                targetObj.data = numStr;
                                targetObj.updatedAt = Date.now();
                                this.app.stamps.push(targetObj);
                                await this.app.saveToStorage(true);
                                this.app.updateRulerMarks();

                                // --- Supabase Sync ---
                                if (this.app.supabaseManager) {
                                    targetObj.updatedAt = Date.now();
                                    this.app.supabaseManager.pushAnnotation(targetObj, this.app.pdfFingerprint);
                                }

                                startGracePeriod(targetObj);
                            } else {
                                // If cancelled or empty, don't keep the temporary stamp
                                activeObject = null;
                            }
                            this.app.redrawStamps(targetPageNum);
                        });
                        return;
                    } else {
                        activeObject.updatedAt = Date.now();
                        if (!isMovingExisting && activeObject.type !== 'view') {
                            this.app.stamps.push(activeObject);
                            this.app.pushHistory({ type: 'add', obj: JSON.parse(JSON.stringify(activeObject)) });
                        }
                        if (activeObject.type === 'anchor') this.app.updateRulerMarks();
                        await this.app.saveToStorage(true);

                        // --- Supabase Sync ---
                        if (this.app.supabaseManager && activeObject.type !== 'view') {
                            activeObject.updatedAt = Date.now();
                            this.app.supabaseManager.pushAnnotation(activeObject, this.app.pdfFingerprint);
                        }

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

            // REDRAW to show the highlight/glow of the grace object
            this.app.redrawStamps(obj.page);

            // RESTORE IMMEDIATE TRASH SHOW: Show trash immediately so user knows they can delete it
            // Skip this for drawing tools to allow continuous writing without distraction
            const isDrawing = ['pen', 'red-pen', 'green-pen', 'blue-pen', 'highlighter', 'highlighter-red', 'highlighter-blue', 'highlighter-green', 'line', 'slur', 'dashed-pen', 'arrow-pen', 'bracket-left', 'bracket-right'].includes(obj.type);
            const targetWrapper = document.querySelector(`.page-container[data-page="${obj.page}"]`);
            if (targetWrapper && !isDrawing) {
                const cent = CoordMapper.getGraceCenter(obj);
                const wCent = getPixelsForWrapper(targetWrapper, cent.x, cent.y);
                const _tp3 = getTrashPos(cent.x, wCent.x, wCent.y);
                InteractionUI.showTrash(true, targetWrapper, _tp3.x, _tp3.y);
                this.updateAllOverlaysTouchAction(); // Sync pointer-events
            }

            if (graceTimer) clearTimeout(graceTimer);
            graceTimer = setTimeout(() => {
                if (graceObject === obj) {
                    graceObject = null;
                    const tWrapper = document.querySelector(`.page-container[data-page="${obj.page}"]`);
                    if (tWrapper) InteractionUI.showTrash(false, tWrapper);
                    const tOverlay = tWrapper?.querySelector('.capture-overlay');
                    const tVP = tOverlay?.querySelector('.virtual-pointer');
                    InteractionUI.syncVirtualPointer({ type: 'mousemove' }, null, tOverlay, tVP, CoordMapper, this.app);
                }
                if (this.app._lastGraceObject === obj) {
                    this.app._lastGraceObject = null;
                    this.app.redrawStamps(obj.page);
                    this.updateAllOverlaysTouchAction();
                }
            }, 1800); // Slightly longer to give user time to react
        };

        const cleanupInteraction = (e) => {
            isInteracting = false;
            this.app.isInteracting = false;
            isMovingExisting = false;
            activeObject = null;
            this.isAdjustingCurvature = false;
            this.app._dragLastPos = null;
            if (e?.pointerId !== undefined) activePointers.delete(e.pointerId);
            if (activePointers.size === 0 && touchBufferTimer) {
                clearTimeout(touchBufferTimer);
                touchBufferTimer = null;
            }

            const pointerType = getPointerType(e || { type: 'mousemove' });
            overlay.style.cursor = this.app.isStampTool() ? (pointerType === 'mouse' ? 'none' : 'crosshair') : '';

            if (!graceObject) InteractionUI.showTrash(false, wrapper);
            else InteractionUI.setTrashActive(false, wrapper);
            this._hideDragGhost()
            detachGlobalListeners();

            // Explicitly hide pointer if no activity
            InteractionUI.syncVirtualPointer({ type: 'mousemove' }, null, overlay, virtualPointer, CoordMapper, this.app);
        };

        const hoverAction = (e) => {
            if (isInteracting) return;
            // Suppress stamp preview when 2+ fingers are on screen (only when two-finger pan is enabled)
            if (this.app.twoFingerPanEnabled && getPointerType(e) === 'touch' && (e.touches?.length >= 2 || panCooldown)) {
                virtualPointer?.classList.remove('active');
                return;
            }
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
                        const wPx = getPixelsForWrapper(wrapper, found.x || found.points?.[0]?.x || 0, found.y || found.points?.[0]?.y || 0);
                        chip.style.left = `${wPx.x}px`; chip.style.top = `${wPx.y}px`;
                        wrapper.appendChild(chip);
                    }
                }
            }

            if (['select', 'copy', 'recycle-bin', 'cycle', 'text', 'tempo-text', 'quick-text'].includes(toolType) || toolType.startsWith('cloak-')) {
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
                    const canvas = wrapper.querySelector('.pdf-canvas') || wrapper.querySelector('.annotation-layer:not(.virtual-canvas)');
                    const cw = canvas?.offsetWidth || width;
                    let hoverDist;
                    if (graceObject.points && graceObject.points.length > 0) {
                        hoverDist = CoordMapper.getMinPathDist(pPos.x, pPos.y, graceObject.points) * cw;
                    } else {
                        const center = CoordMapper.getGraceCenter(graceObject);
                        const dx = (pPos.x - center.x) * cw;
                        const dy = (pPos.y - center.y) * (canvas?.offsetHeight || height);
                        hoverDist = Math.sqrt(dx * dx + dy * dy);
                    }
                    if (hoverDist < CoordMapper.getGraceObjectPixelSize(graceObject, this.app) * 0.7) {
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
                        this.app.drawStampOnCanvas(canvas.getContext('2d'), canvas, { type: toolType, x: pPos.x, y: pPos.y, page: pageNum, userScale: this.app.activeToolPreset || 1.0 }, layer?.color || '#000', true, false, false, pos);
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
        // Clean up activePointers tracking when a touch pointer lifts on the overlay
        // (covers single-tap lifts that don't go through endAction's global listener)
        overlay.addEventListener('pointerup', (e) => { activePointers.delete(e.pointerId); }, { passive: true });
        overlay.addEventListener('pointercancel', (e) => { activePointers.delete(e.pointerId); }, { passive: true });
        overlay.addEventListener('mouseleave', () => {
            virtualPointer?.classList.remove('active');
            this.app.hoveredStamp = this.app.selectHoveredStamp = null;
            this.app.redrawStamps(pageNum);
            wrapper.querySelector('.erase-hover-chip')?.remove();
        });

        InteractionUI.ensureTrashBin(wrapper);
        wrapper.appendChild(overlay);

        // Save reference for manual updates if needed
        overlay._updateTouchAction = () => this.updateAllOverlaysTouchAction();
        this.updateAllOverlaysTouchAction();
    }

    /**
     * Globally update the touch-action and pointer-events of all active overlays based on current tool.
     */
    updateAllOverlaysTouchAction() {
        const toolType = this.app.activeStampType;
        const isViewMode = toolType === 'view';

        // Sync data-active-tool for CSS selectors (cursor, etc.)
        document.documentElement.dataset.activeTool = toolType;
        document.body.dataset.activeTool = toolType;
        if (this.app.viewer) this.app.viewer.dataset.activeTool = toolType;

        // Fix for iPad/Desktop hybrid:
        // In "View" mode, we want native touch gestures (scroll/pinch) on mobile/iPad.
        // Setting pointer-events: none on the overlay allows gestures to fall through
        // to the scrollable viewer container.
        const isTouchScreen = window.matchMedia('(pointer: coarse)').matches;

        document.querySelectorAll('.capture-overlay').forEach(el => {
            // CRITICAL FIX (Ref: FA-CA-2026-03-01): 
            // DO NOT set pointer-events: none or display: none here. 
            // Changing overlay visibility/transparency on mode-switch causes 
            // the first gesture on iOS Safari to be dropped due to hit-test caching.
            // All modes (View/Stamp) now use pointer-events: auto + touch-action: none.
            
            // If switching to view mode, force-clear any stuck interaction state
            if (isViewMode && typeof el._resetState === 'function') {
                el._resetState();
            }

            el.style.touchAction = 'none';
            el.style.pointerEvents = 'auto';
            el.style.zIndex = isViewMode ? '10' : '50';
        });

        // SAFETY: Ensure the viewer's own touch-action is correct.
        if (this.app.viewer) {
            // In view mode, allow native panning (important for zoomed scores).
            // In annotation mode, set 'none' on the viewer so iOS Safari doesn't intercept
            // finger touch for scrolling — iOS ignores overlay touch-action:none if an
            // ancestor scroll container has pan-y. Apple Pencil / mouse are unaffected.
            this.app.viewer.style.touchAction = isViewMode ? 'pan-x pan-y' : 'none';
            // Ensure overflow-y is never stuck at 'hidden'
            if (this.app.viewer.style.overflowY === 'hidden') {
                this.app.viewer.style.overflowY = '';
            }
        }


        if (isViewMode) {
            this.app.isInteracting = false;
        }
    }

    _showDragGhost(clientX, clientY, obj) {
        let ghost = document.getElementById('sf-drag-ghost')
        if (!ghost) {
            ghost = document.createElement('div')
            ghost.id = 'sf-drag-ghost'
            document.body.appendChild(ghost)
        }
        // Use label, type name, or fallback icon
        const label = obj?.data || obj?.type || '◆'
        ghost.textContent = label
        ghost.style.display = 'block'
        ghost.style.left = (clientX + 18) + 'px'
        ghost.style.top  = (clientY - 16) + 'px'
    }

    _hideDragGhost() {
        const ghost = document.getElementById('sf-drag-ghost')
        if (ghost) ghost.style.display = 'none'
    }
}
