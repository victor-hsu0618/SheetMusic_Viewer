import { CoordMapper } from './interaction/CoordMapper.js';
import { InteractionUI } from './interaction/UIManager.js';
import { CYCLE_GROUPS, CLOAK_GROUPS } from '../../constants.js';

export class InteractionManager {
    constructor(app) {
        this.app = app;
        this._penLongPressTimer = null;
    }

    _updateCursor(overlay, pointerType) {
        if (!overlay) return;
        const tool = this.app.activeStampType;
        
        // No custom cursor for touch (handled by virtual-pointer)
        if (pointerType === 'touch') {
            overlay.style.cursor = 'crosshair';
            return;
        }

        switch (tool) {
            case 'view':
                overlay.style.cursor = 'grab';
                break;
            case 'eraser':
                overlay.style.cursor = 'cell'; // Selection with intent to erase
                break;
            case 'select':
            case 'cycle':
                overlay.style.cursor = 'pointer';
                break;
            case 'copy':
                overlay.style.cursor = 'copy';
                break;
            case 'recycle-bin':
                overlay.style.cursor = 'wait'; // Or not-allowed
                break;
            case 'rect-shape':
            case 'circle-shape':
            case 'pen':
            case 'fine-pen':
            case 'marker-pen':
            case 'brush-pen':
            case 'fountain-pen':
            case 'pencil-pen':
            case 'red-pen':
            case 'green-pen':
            case 'blue-pen':
            case 'highlighter':
            case 'highlighter-red':
            case 'highlighter-blue':
            case 'highlighter-green':
            case 'cover-brush':
            case 'correction-pen':
                overlay.style.cursor = 'none'; // Custom virtual pointer
                break;
            default:
                // Standard stamp tools: hide browser cursor if we have a preview
                overlay.style.cursor = this.app.isStampTool() ? 'none' : 'default';
        }
    }

    _showStampContextMenu(stamp, clientX, clientY) {
        this._dismissStampContextMenu()

        const menu = document.createElement('div')
        menu.id = 'sf-stamp-ctx-menu'
        menu.className = 'sf-stamp-ctx-menu'

        const makeItem = (label, isDanger, action) => {
            const btn = document.createElement('button')
            btn.className = 'sf-ctx-menu-item' + (isDanger ? ' danger' : '')
            btn.textContent = label
            btn.addEventListener('click', (e) => { e.stopPropagation(); action() })
            return btn
        }

        menu.appendChild(makeItem('Duplicate', false, () => {
            this._dismissStampContextMenu()
            this._duplicateStamp(stamp)
        }))
        menu.appendChild(makeItem('Delete', true, async () => {
            this._dismissStampContextMenu()
            await this.app.annotationManager.eraseStampTarget(stamp)
            this.app.showMessage('Deleted', 'success')
        }))

        document.body.appendChild(menu)

        const mw = menu.offsetWidth || 148
        const mh = menu.offsetHeight || 88
        let left = clientX - mw / 2
        let top  = clientY - mh - 14
        if (top < 8) top = clientY + 14
        left = Math.max(8, Math.min(window.innerWidth - mw - 8, left))
        menu.style.left = `${left}px`
        menu.style.top  = `${top}px`

        setTimeout(() => {
            this._ctxOutside = (e) => { if (!menu.contains(e.target)) this._dismissStampContextMenu() }
            document.addEventListener('pointerdown', this._ctxOutside)
        }, 0)
    }

    _dismissStampContextMenu() {
        document.getElementById('sf-stamp-ctx-menu')?.remove()
        if (this._ctxOutside) {
            document.removeEventListener('pointerdown', this._ctxOutside)
            this._ctxOutside = null
        }
    }

    async _duplicateStamp(stamp) {
        const copy = JSON.parse(JSON.stringify(stamp))
        copy.id = crypto.randomUUID?.() || `stamp-${Date.now()}`
        copy.createdAt = Date.now()
        copy.updatedAt = Date.now()
        const offset = 0.015
        if (copy.points) {
            copy.points = copy.points.map(p => ({ ...p, x: p.x + offset, y: p.y + offset }))
        } else {
            copy.x = (copy.x || 0) + offset
            copy.y = (copy.y || 0) + offset
        }
        this.app.stamps.push(copy)
        this.app.pushHistory({ type: 'add', obj: JSON.parse(JSON.stringify(copy)) })
        this.app.redrawStamps(copy.page)
        await this.app.saveToStorage(true)
        if (this.app.supabaseManager) this.app.supabaseManager.pushAnnotation(copy, this.app.pdfFingerprint)
        this.app.showMessage('Duplicated', 'success')
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
        let potentialNudge = null;
        let nudgeStartClient = { x: 0, y: 0 };
        let nudgeStartObjectPos = { x: 0, y: 0 };
        let isNudging = false;
        let eraserClickTarget = null;  // Saved on pointerdown; erased on pointerup if no drag
        let eraserHasDragged = false;  // Set to true on first move during eraser drag

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
            potentialNudge = null;
            isNudging = false;
            eraserClickTarget = null;
            eraserHasDragged = false;
            virtualPointer?.classList.remove('active');
            activePointers.clear();
            isTwoFingerPanning = false;
            this.isAdjustingCurvature = false;
            this.app._dragLastPos = null;
            if (this._penLongPressTimer) clearTimeout(this._penLongPressTimer);
            InteractionUI.showTrash(false, wrapper);
            // Clean up both trash bins
            document.getElementById('sf-doc-trash-btn')?.classList.remove('drag-over', 'drag-active')
            document.getElementById('sf-edit-trash-btn')?.classList.remove('drag-over', 'drag-active')
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
        };

        // --- HELPERS ---

        const getPointerType = (e) => {
            if (e.pointerType) return e.pointerType;
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

        const getTrashPos = (normX, wCentX, wCentY) => {
            return { x: wCentX, y: wCentY - 210 };
        };

        const isDrawingType = (type) => {
            return ['pen', 'fine-pen', 'marker-pen', 'brush-pen', 'fountain-pen', 'pencil-pen',
                    'red-pen', 'green-pen', 'blue-pen', // legacy
                    'highlighter', 'highlighter-red', 'highlighter-blue', 'highlighter-green',
                    'line', 'slur', 'dashed-pen', 'arrow-pen', 'bracket-left', 'bracket-right',
                    'rect-shape', 'circle-shape',
                    'cover-brush', 'correction-pen'].includes(type);
        };

        const updateTouchAction = () => {
            const toolType = this.app.activeStampType;
            document.body.dataset.activeTool = toolType;
        };

        // --- HANDLERS ---

        const startAction = async (e) => {
            if (e.target.closest('.text-editor-container')) return;
            this._dismissStampContextMenu();

            const toolType = this.app.activeStampType;
            const pointerType = getPointerType(e);
            const isPen = pointerType === 'pen';

            // Always track pointers for multi-touch handling
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (activePointers.size >= 2) {
                if (touchBufferTimer) clearTimeout(touchBufferTimer);
                
                // --- CONSOLIDATED GESTURE HANDLING ---
                // GestureManager handles 2-finger Pan/Zoom globally (bubbles from overlays).
                // We simply stop our current INTERACTION (e.g., drawing) to let the zoom take over.
                if (isInteracting) {
                    isInteracting = false;
                    this.app.isInteracting = false;
                    activeObject = null;
                    isMovingExisting = false;
                    InteractionUI.showTrash(false, wrapper);
                    detachGlobalListeners();
                }
                
                isTwoFingerPanning = true; 
                isInteracting = false;
                this.app.isInteracting = false;
                virtualPointer?.classList.remove('active');
                return;
            }
            
            // Touch buffer to allow second finger to land
            if (pointerType === 'touch' && !isPen) {
                if (touchBufferTimer) clearTimeout(touchBufferTimer);
                touchBufferTimer = setTimeout(() => {
                    touchBufferTimer = null;
                    if (activePointers.size <= 1 && !isTwoFingerPanning) {
                        proceedWithAction(e);
                    }
                }, 35);
                return;
            }

            proceedWithAction(e);
        };

        const proceedWithAction = async (e) => {
            const toolTypeRaw = this.app.activeStampType;
            const pointerType = getPointerType(e);

            if (isInteracting) {
                isInteracting = false;
                this.app.isInteracting = false;
                activeObject = null;
                isMovingExisting = false;
                detachGlobalListeners();
            }
            if (panCooldown) return;

            const pos = CoordMapper.getPos(e, overlay);

            // --- APPLE PENCIL GESTURE: Long press with pen tip to toggle EditStrip (VIEW MODE ONLY) ---
            if (pointerType === 'pen' && !isInteracting && toolTypeRaw === 'view') {
                if (this._penLongPressTimer) clearTimeout(this._penLongPressTimer);
                
                // Track start position for movement-based cancellation
                const startX = e.clientX, startY = e.clientY;
                
                this._penLongPressTimer = setTimeout(() => {
                    overlay.style.background = 'rgba(255, 255, 255, 0.05)';
                    setTimeout(() => overlay.style.background = '', 150);
                    if (navigator.vibrate) navigator.vibrate(10);
                    this._penLongPressTimer = null;
                }, 600);

                const cleanup = () => {
                    if (this._penLongPressTimer) {
                        clearTimeout(this._penLongPressTimer);
                        this._penLongPressTimer = null;
                    }
                    window.removeEventListener('pointermove', cancelOnMove);
                    window.removeEventListener('pointerup', cleanup);
                };

                const cancelOnMove = (moveEv) => {
                    const dx = Math.abs(moveEv.clientX - startX);
                    const dy = Math.abs(moveEv.clientY - startY);
                    if (dx > 5 || dy > 5) cleanup();
                };

                window.addEventListener('pointermove', cancelOnMove);
                window.addEventListener('pointerup', cleanup);
            }

            // --- (B) HAND-PEN SEPARATION ---
            const isPen = pointerType === 'pen';
            let activeTool = toolTypeRaw;
            
            // Check if we are potentially picking up an existing object first
            const previewPosForGrab = CoordMapper.getStampPreviewPos(pos, pointerType, activeTool, this.app, overlay);
            const pickupTarget = graceObject || this.app.findClosestStamp(pageNum, previewPosForGrab.x, previewPosForGrab.y, true);
            
            // If it's a finger (touch) and we're NOT in Pan mode, AND not targeting an existing object to move:
            // force it to 'view' (Neutral Pan) to prevent palms from drawing.
            // Mouse is allowed to draw freely.
            if (pointerType === 'touch' && activeTool !== 'view' && !pickupTarget && !this.app.isStampTool()) {
                activeTool = 'view';
            }

            // 1. View Mode Panning
            if (activeTool === 'view') {
                const isTouch = (pointerType === 'touch' || pointerType === 'pen') && !this.app.isMac;
                
                // --- BLOCK 1-FINGER PAN FOR iPad ---
                // We keep 1-finger panning FOR Mac (to remain usable on desktop trackpads).
                if (isTouch) {
                    return; 
                }

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
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                        this.app._wasPanning = true;
                    }
                    const targetTop = startScrollTop - dy;
                    const maxScroll = this.app.viewer.scrollHeight - this.app.viewer.clientHeight;

                    if (targetTop < 0) {
                        this.app.viewer.scrollTop = 0;
                        const overscroll = targetTop * 0.3;
                        this.app.container.style.transform = `translateY(${-overscroll}px)`;
                    } else if (targetTop > maxScroll) {
                        this.app.viewer.scrollTop = maxScroll;
                        const overscroll = (targetTop - maxScroll) * 0.3;
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
                    this.app.container.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                    this.app.container.style.transform = 'translateY(0)';
                    setTimeout(() => { this.app.container.style.transition = ''; }, 400);
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

            // 2. Grace Period / Existing Object Interaction
            if (graceObject) {
                const offsetPos = CoordMapper.getStampPreviewPos(pos, pointerType, activeTool, this.app, overlay);
                const isDrawingTool = isDrawingType(activeTool);
                const baseThreshold = CoordMapper.getGraceObjectPixelSize(graceObject, this.app)
                    * (pointerType === 'touch' ? 4.0 : 2.0);
                const threshold = pointerType === 'touch' ? Math.max(50, baseThreshold) : baseThreshold;
                
                let distPx;
                if (graceObject.points && graceObject.points.length > 0) {
                    const distFromPos = CoordMapper.getMinPathDist(pos.x, pos.y, graceObject.points) * width;
                    const distFromOffset = CoordMapper.getMinPathDist(offsetPos.x, offsetPos.y, graceObject.points) * width;
                    distPx = Math.min(distFromPos, distFromOffset);
                } else {
                    const center = CoordMapper.getGraceCenter(graceObject);
                    const cw = overlay.getBoundingClientRect().width || width;
                    const ch = overlay.getBoundingClientRect().height || height;
                    const dxPos = (pos.x - center.x) * cw;
                    const dyPos = (pos.y - center.y) * ch;
                    const dxOff = (offsetPos.x - center.x) * cw;
                    const dyOff = (offsetPos.y - center.y) * ch;
                    distPx = Math.min(Math.sqrt(dxPos * dxPos + dyPos * dyPos), Math.sqrt(dxOff * dxOff + dyOff * dyOff));
                }

                if (distPx < threshold && !isDrawingTool) {
                    activeObject = graceObject;
                    isMovingExisting = true;
                    this.dragStartObject = JSON.parse(JSON.stringify(activeObject));
                    isInteracting = true;
                    this.app.isInteracting = true;

                    const graceCenter = CoordMapper.getGraceCenter(graceObject);
                    const wCenter = getPixelsForWrapper(wrapper, graceCenter.x, graceCenter.y);
                    const _tp0 = getTrashPos(graceCenter.x, wCenter.x, wCenter.y);
                    if (!isDrawingType(activeObject.type) && activeObject.type !== 'sticky-note') {
                        InteractionUI.showTrash(true, wrapper, _tp0.x, _tp0.y);
                    }

                    if (graceTimer) clearTimeout(graceTimer);
                    graceObject = null;
                    this.app._lastGraceObject = null;
                    this.app._dragLastPos = offsetPos;
                    attachGlobalListeners();
                    InteractionUI.syncVirtualPointer(e, activeObject.type, overlay, virtualPointer, CoordMapper, this.app);
                    return;
                } else {
                    potentialNudge = graceObject;
                    const cx = e.clientX !== undefined ? e.clientX : (e.touches?.[0]?.clientX || 0);
                    const cy = e.clientY !== undefined ? e.clientY : (e.touches?.[0]?.clientY || 0);
                    nudgeStartClient = { x: cx, y: cy };
                    nudgeStartObjectPos = { x: graceObject.x || (graceObject.points?.[0]?.x || 0), y: graceObject.y || (graceObject.points?.[0]?.y || 0) };
                    isNudging = false;
                    isInteracting = true;
                    this.app.isInteracting = true;
                    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
                    attachGlobalListeners();
                    return;
                }
            }

            InteractionUI.showTrash(false, wrapper);
            isInteracting = true;
            this.app.isInteracting = true;

            const pPos = CoordMapper.getStampPreviewPos(pos, pointerType, activeTool, this.app, overlay);
            const target = this.app.selectHoveredStamp || this.app.findClosestStamp(pageNum, pPos.x, pPos.y, true);

            if (target && (activeTool === 'text' || activeTool === 'tempo-text' || activeTool === 'sticky-note')) {
                activeObject = target;
                isMovingExisting = true;
                this.dragStartObject = JSON.parse(JSON.stringify(activeObject));
                this.app.lastFocusedStamp = activeObject;
                this.app._dragLastPos = pPos;
                InteractionUI.syncVirtualPointer(e, activeObject.type, overlay, virtualPointer, CoordMapper, this.app);
                attachGlobalListeners();
                return;
            }

            const isCloakTool = activeTool.startsWith('cloak-');
            const isSelectionTool = ['copy', 'select', 'recycle-bin', 'cycle'].includes(activeTool) || isCloakTool;

            if (isSelectionTool) {
                if (target) {
                    if (activeTool === 'cycle') {
                        const group = CYCLE_GROUPS.find(g => g.includes(target.type));
                        if (group) {
                            target.type = group[(group.indexOf(target.type) + 1) % group.length];
                            const nt = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === target.type);
                            if (nt?.draw) target.draw = { ...nt.draw };
                            target.updatedAt = Date.now();
                            await this.app.saveToStorage(true);
                            this.app.redrawAllAnnotationLayers();
                        }
                        isInteracting = false;
                        this.app.isInteracting = false;
                    } else if (isCloakTool) {
                        const cid = activeTool.replace('cloak-', '');
                        target.hiddenGroup = (target.hiddenGroup === cid) ? undefined : cid;
                        target.updatedAt = Date.now();
                        await this.app.saveToStorage(true);
                        this.app.redrawAllAnnotationLayers();
                        isInteracting = false;
                        this.app.isInteracting = false;
                    } else if (activeTool === 'recycle-bin') {
                        await this.app.annotationManager.eraseStampTarget(target);
                        isInteracting = false;
                        this.app.isInteracting = false;
                    } else if (activeTool === 'copy') {
                        const clone = JSON.parse(JSON.stringify(target));
                        clone.id = crypto.randomUUID?.() || `stamp-${Date.now()}`;
                        clone.createdAt = Date.now();
                        clone.updatedAt = Date.now();
                        this.app.stamps.push(clone);
                        this.app.activeStampType = 'select'; // Switch to select to move the copy
                        activeObject = clone;
                        isMovingExisting = true;
                    } else {
                        activeObject = target;
                        isMovingExisting = true;
                        this.dragStartObject = JSON.parse(JSON.stringify(activeObject));
                    }
                    if (activeObject) {
                        this.app.lastFocusedStamp = activeObject;
                        this.app._dragLastPos = pPos;
                        this.app.selectHoveredStamp = null;
                        const cent = CoordMapper.getGraceCenter(activeObject);
                        const wCent = getPixelsForWrapper(wrapper, cent.x, cent.y);
                        const _tp = getTrashPos(cent.x, wCent.x, wCent.y);
                        if (!isDrawingType(activeObject.type)) InteractionUI.showTrash(true, wrapper, _tp.x, _tp.y);
                        this.app.redrawStamps(pageNum);
                        attachGlobalListeners();
                        InteractionUI.syncVirtualPointer(e, activeTool, overlay, virtualPointer, CoordMapper, this.app);
                    }
                } else {
                    isInteracting = true;
                    this.app.isInteracting = true;
                    activeObject = null;
                    isMovingExisting = true;
                    this.app._dragLastPos = pPos;
                    attachGlobalListeners();
                    InteractionUI.syncVirtualPointer(e, activeTool, overlay, virtualPointer, CoordMapper, this.app);
                }
            } else if (isDrawingType(activeTool)) {
                const toolDef = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === activeTool);
                const strokeColor = activeTool === 'cover-brush'
                    ? this._samplePageColor(pageNum, pos.x, pos.y, wrapper)
                    : this.app.activeColor;
                activeObject = {
                    type: activeTool, page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId,
                    points: [{ ...CoordMapper.getStampPreviewPos(pos, pointerType, activeTool, this.app, overlay), pressure: e.pressure ?? 0.5 }],
                    color: strokeColor,
                    lineStyle: toolDef?.draw?.dashed ? 'dashed' : (this.app.activeLineStyle || 'solid'),
                    dashed: toolDef?.draw?.dashed || false,
                    arrow: toolDef?.draw?.arrow || false,
                    id: crypto.randomUUID?.() || `stamp-${Date.now()}`,
                    createdAt: Date.now(), updatedAt: Date.now(),
                    userScale: this.app.activeToolPreset || 1.0
                };
                if (activeTool === 'slur') activeObject.curvature = -0.28;
                isInteracting = true;
                this.app.isInteracting = true;
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, activeTool, overlay, virtualPointer, CoordMapper, this.app);
            } else if (activeTool === 'eraser') {
                const et = this.app.hoveredStamp || this.app.findClosestStamp(pageNum, pPos.x, pPos.y, false);
                // Don't erase immediately — wait to see if user drags (segment erase) or releases (whole erase)
                eraserClickTarget = et || null;
                eraserHasDragged = false;
                isInteracting = true;
                this.app.isInteracting = true;
                activeObject = null;
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, activeTool, overlay, virtualPointer, CoordMapper, this.app);
            } else {
                // Regular stamping
                const fPos = CoordMapper.getStampPreviewPos(pos, pointerType, activeTool, this.app, overlay);
                activeObject = {
                    page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId, type: activeTool,
                    x: fPos.x, y: fPos.y, color: this.app.activeColor, data: null,
                    id: crypto.randomUUID?.() || `stamp-${Date.now()}`,
                    createdAt: Date.now(), updatedAt: Date.now(),
                    userScale: this.app.activeToolPreset || 1.0
                };
                const grp = this.app.toolsets.find(g => g.tools.some(t => t.id === activeTool));
                if (grp) {
                    const l = this.app.layers.find(ly => ly.type === grp.type || ly.id === grp.type);
                    if (l) activeObject.layerId = l.id;
                }
                if (!activeObject.layerId) activeObject.layerId = 'draw';
                if (activeTool.startsWith('custom-text-') && this.app._activeCustomText) {
                    activeObject.draw = { type: 'text', content: this.app._activeCustomText, font: 'italic 500', size: 16, fontFace: 'serif' };
                } else {
                    const t = grp?.tools.find(tl => tl.id === activeTool);
                    if (t?.draw) activeObject.draw = { ...t.draw };
                }
                
                // For regular stamps, we just place it and end. No need to clear timer yet as we haven't reached endAction.
                // But we need to make sure endAction is called.
                isInteracting = true;
                this.app.isInteracting = true;
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas');
                if (canvas) {
                    this.app.redrawStamps(pageNum);
                    const l = this.app.layers.find(ly => ly.id === activeObject.layerId);
                    this.app.drawStampOnCanvas(canvas.getContext('2d'), canvas, activeObject, activeObject.color || l?.color || '#000', true, false, false, pos);
                }
                attachGlobalListeners();
                InteractionUI.syncVirtualPointer(e, activeTool, overlay, virtualPointer, CoordMapper, this.app);
            }
        };

        const moveAction = async (e) => {
            if (!isInteracting) return;
            const pointerType = getPointerType(e);
            const toolType = this.app.activeStampType;

            if (potentialNudge) {
                const cx = e.clientX ?? (e.touches?.[0]?.clientX || 0);
                const cy = e.clientY ?? (e.touches?.[0]?.clientY || 0);
                const dx = cx - nudgeStartClient.x;
                const dy = cy - nudgeStartClient.y;

                if (!isNudging && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
                    isNudging = true;
                    activeObject = potentialNudge;
                    isMovingExisting = true;
                    this.app.isInteracting = true;
                    this.dragStartObject = JSON.parse(JSON.stringify(activeObject));
                    activeObject.updatedAt = Date.now();
                    const cent = CoordMapper.getGraceCenter(activeObject);
                    const wCent = getPixelsForWrapper(wrapper, cent.x, cent.y);
                    const _tp = getTrashPos(cent.x, wCent.x, wCent.y);
                    if (!isDrawingType(activeObject.type)) InteractionUI.showTrash(true, wrapper, _tp.x, _tp.y);
                }

                if (isNudging) {
                    const rect = overlay.getBoundingClientRect();
                    const nDx = dx / (rect.width || 1);
                    const nDy = dy / (rect.height || 1);
                    if (activeObject.points) {
                        activeObject.points = this.dragStartObject.points.map(p => ({ x: p.x + nDx, y: p.y + nDy }));
                        if (activeObject.x !== undefined) activeObject.x = nudgeStartObjectPos.x + nDx;
                        if (activeObject.y !== undefined) activeObject.y = nudgeStartObjectPos.y + nDy;
                    } else {
                        activeObject.x = nudgeStartObjectPos.x + nDx;
                        activeObject.y = nudgeStartObjectPos.y + nDy;
                    }
                    this.app.redrawStamps(activeObject.page);
                    InteractionUI.setTrashActive(InteractionUI.isObjectOverTrash(activeObject, wrapper, CoordMapper), wrapper);
                    InteractionUI.syncVirtualPointer(e, toolType, overlay, virtualPointer, CoordMapper, this.app, activeObject);
                    return;
                }
                return;
            }

            if (pointerType === 'touch' && e.cancelable) e.preventDefault();

            let currentOverlay = overlay, currentWrapper = wrapper, currentPageNum = pageNum;
            const rawPos = CoordMapper.getPos(e, overlay);
            const outsideCurrent = rawPos.x < -0.01 || rawPos.x > 1.01 || rawPos.y < -0.01 || rawPos.y > 1.01;
            let outsideAll = false;
            
            if (outsideCurrent || (activeObject && activeObject.page !== pageNum)) {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const targetOverlay = el?.closest('.capture-overlay');
                if (targetOverlay) {
                    currentPageNum = parseInt(targetOverlay.dataset.page);
                    currentOverlay = targetOverlay;
                    currentWrapper = targetOverlay.parentElement;
                } else if (outsideCurrent) {
                    outsideAll = true;
                }
            }

            const pos = CoordMapper.getPos(e, currentOverlay);
            const currentVP = currentOverlay.querySelector('.virtual-pointer');

            if (!activeObject && ['select', 'eraser', 'copy', 'recycle-bin'].includes(toolType)) {
                const pp = CoordMapper.getStampPreviewPos(pos, pointerType, toolType, this.app, currentOverlay);
                const target = this.app.findClosestStamp(currentPageNum, pp.x, pp.y, toolType !== 'eraser');
                if (target) {
                    if (toolType === 'eraser') {
                        eraserHasDragged = true;
                        // Segment-erase pen/highlighter strokes; fully erase everything else
                        const SEGMENT_TYPES = new Set(['pen', 'fine-pen', 'marker-pen', 'brush-pen', 'red-pen', 'green-pen', 'blue-pen', 'highlighter', 'highlighter-red', 'highlighter-blue', 'highlighter-green', 'line', 'slur', 'cover-brush', 'correction-pen']);
                        if (SEGMENT_TYPES.has(target.type)) {
                            await this.app.annotationManager.eraseStrokeSegment(currentPageNum, pp.x, pp.y);
                        } else {
                            await this.app.annotationManager.eraseStampTarget(target);
                        }
                    } else if (toolType === 'recycle-bin') {
                        await this.app.annotationManager.eraseStampTarget(target);
                    } else {
                        activeObject = target;
                        isMovingExisting = true;
                        this.app.lastFocusedStamp = activeObject;
                        this.app._dragLastPos = pp;
                        const cent = CoordMapper.getGraceCenter(activeObject);
                        const wc = getPixelsForWrapper(currentWrapper, cent.x, cent.y);
                        const _tp = getTrashPos(cent.x, wc.x, wc.y);
                        if (!isDrawingType(activeObject.type)) InteractionUI.showTrash(true, currentWrapper, _tp.x, _tp.y);
                        this.app.redrawStamps(currentPageNum);
                    }
                }
            }

            if (!activeObject) {
                document.querySelectorAll('.virtual-pointer.active').forEach(vp => { if (vp !== currentVP) vp.classList.remove('active'); });
                InteractionUI.syncVirtualPointer(e, toolType, currentOverlay, currentVP, CoordMapper, this.app);
                return;
            }

            if (isMovingExisting && outsideAll) {
                this._showDragGhost(e.clientX, e.clientY, activeObject);
                const dt = document.getElementById('sf-doc-trash-btn');
                if (dt) {
                    const r = dt.getBoundingClientRect();
                    const over = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
                    dt.classList.toggle('drag-over', over);
                    dt.classList.add('drag-active');
                }
                return;
            }
            this._hideDragGhost();

            if (isMovingExisting) {
                if (this.isAdjustingCurvature && activeObject.type === 'slur') {
                    const p0 = activeObject.points[0], p1 = activeObject.points[activeObject.points.length - 1];
                    const dxB = p1.x - p0.x, dyB = p1.y - p0.y, distB = Math.sqrt(dxB * dxB + dyB * dyB);
                    if (distB > 0.0001) {
                        const perpDist = (-dyB * pos.x + dxB * pos.y + (dyB * p0.x - dxB * p0.y)) / distB;
                        activeObject.curvature = (perpDist / distB) * 2;
                    }
                } else {
                    const eType = ['select', 'copy', 'recycle-bin'].includes(toolType) ? toolType : activeObject.type;
                    const tPos = CoordMapper.getStampPreviewPos(pos, pointerType, eType, this.app, currentOverlay);
                    if (activeObject.page !== currentPageNum) {
                        const oldP = activeObject.page; activeObject.page = currentPageNum; this.app.redrawStamps(oldP);
                    }
                    const dx = tPos.x - (this.app._dragLastPos?.x ?? tPos.x);
                    const dy = tPos.y - (this.app._dragLastPos?.y ?? tPos.y);
                    if (activeObject.points) activeObject.points = activeObject.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
                    else { activeObject.x = Number(activeObject.x) + dx; activeObject.y = Number(activeObject.y) + dy; }
                    this.app._dragLastPos = tPos;
                }
                this.app.redrawStamps(currentPageNum);
            } else if (activeObject.points) {
                const cPos = CoordMapper.getStampPreviewPos(pos, pointerType, activeObject.type, this.app, currentOverlay);
                if (activeObject.page !== currentPageNum) {
                    const oldP = activeObject.page; activeObject.page = currentPageNum; this.app.redrawStamps(oldP);
                }
                if (['line', 'slur', 'rect-shape', 'circle-shape'].includes(activeObject.type)) activeObject.points = [activeObject.points[0], cPos];
                else activeObject.points.push({ ...cPos, pressure: e.pressure ?? 0.5 });
                const cvs = currentWrapper.querySelector('.annotation-layer.virtual-canvas');
                if (cvs) this.app.drawPathOnCanvas(cvs.getContext('2d'), cvs, activeObject);
            } else {
                const pPos = CoordMapper.getStampPreviewPos(pos, pointerType, activeObject.type, this.app, currentOverlay);
                if (activeObject.page !== currentPageNum) {
                    const oldP = activeObject.page; activeObject.page = currentPageNum; this.app.redrawStamps(oldP);
                }
                activeObject.x = Number(pPos.x); activeObject.y = Number(pPos.y);
                const cvs = currentWrapper.querySelector('.annotation-layer.virtual-canvas');
                if (cvs) {
                    this.app.redrawStamps(currentPageNum);
                    const lyr = this.app.layers.find(l => l.id === activeObject.layerId);
                    this.app.drawStampOnCanvas(cvs.getContext('2d'), cvs, activeObject, activeObject.color || lyr?.color || '#000', true, false, false, pos);
                }
            }
            if (!isDrawingType(activeObject.type)) {
                InteractionUI.setTrashActive(InteractionUI.isObjectOverTrash(activeObject, currentWrapper, CoordMapper), currentWrapper);
            }
            const mSyncType = isMovingExisting && ['select', 'copy', 'recycle-bin'].includes(toolType) ? toolType : activeObject.type;
            InteractionUI.syncVirtualPointer(e, mSyncType, currentOverlay, currentVP, CoordMapper, this.app);
            resetPointerIdleTimer();
        };

        const endAction = async (e) => {
            const pointerType = getPointerType(e);
            if (e?.pointerId !== undefined) activePointers.delete(e.pointerId);
            if (activePointers.size < 2) isTwoFingerPanning = false;

            if (this._penLongPressTimer) { clearTimeout(this._penLongPressTimer); this._penLongPressTimer = null; }
            if (!isInteracting) return;

            // Eraser click (no drag) → whole-stroke erase
            if (this.app.activeStampType === 'eraser' && eraserClickTarget && !eraserHasDragged) {
                await this.app.annotationManager.eraseStampTarget(eraserClickTarget);
            }
            eraserClickTarget = null;
            eraserHasDragged = false;

            if (potentialNudge) {
                const isDragDone = isNudging; potentialNudge = null; isNudging = false;
                if (!isDragDone) {
                    if (graceTimer) clearTimeout(graceTimer); graceObject = null; this.app._lastGraceObject = null;
                    InteractionUI.showTrash(false, wrapper); this.app.redrawStamps(pageNum);
                    const pt = getPointerType(e); const tt = this.app.activeStampType;
                    if (!['view', 'select', 'eraser', 'copy', 'recycle-bin', 'cycle'].includes(tt) && !tt.startsWith('cloak-')) {
                        const tapPos = CoordMapper.getPos(e, overlay);
                        const fPos = CoordMapper.getStampPreviewPos(tapPos, pt, tt, this.app, overlay);
                        activeObject = {
                            page: pageNum, layerId: 'draw', sourceId: this.app.activeSourceId, type: tt,
                            x: fPos.x, y: fPos.y, color: this.app.activeColor, data: null,
                            id: crypto.randomUUID?.() || `stamp-${Date.now()}`,
                            createdAt: Date.now(), updatedAt: Date.now(),
                            userScale: this.app.activeToolPreset || 1.0
                        };
                        const g = this.app.toolsets.find(grp => grp.tools.some(tl => tl.id === tt));
                        if (g) {
                            const l = this.app.layers.find(ly => ly.type === g.type || ly.id === g.type);
                            if (l) activeObject.layerId = l.id;
                        }
                        if (!activeObject.layerId) activeObject.layerId = 'draw';
                        if (tt.startsWith('custom-text-') && this.app._activeCustomText) {
                            activeObject.draw = { type: 'text', content: this.app._activeCustomText, font: 'italic 500', size: 16, fontFace: 'serif' };
                        } else {
                            const t = g?.tools.find(tl => tl.id === tt);
                            if (t?.draw) activeObject.draw = { ...t.draw };
                        }
                        isMovingExisting = false;
                    } else {
                        isInteracting = false; this.app.isInteracting = false; cleanupInteraction(e); return;
                    }
                }
            }

            let syncObj = activeObject;
            try {
                if (syncObj) {
                    const tPN = syncObj.page;
                    const tW = document.querySelector(`.page-container[data-page="${tPN}"]`);
                    const dt = document.getElementById('sf-doc-trash-btn'), et = document.getElementById('sf-edit-trash-btn');
                    const isPointerOverTrash = (ev, el) => {
                        if (!el) return false;
                        const r = el.getBoundingClientRect();
                        return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
                    };
                    const overExternalTrash = isPointerOverTrash(e, dt) || isPointerOverTrash(e, et);
                    const isOverTrash = InteractionUI.isObjectOverTrash(syncObj, tW, CoordMapper) || overExternalTrash;

                    if (isOverTrash) {
                        if (isMovingExisting) await this.app.annotationManager.eraseStampTarget(syncObj);
                        this.app.showMessage('Deleted', 'success');
                        activeObject = null;
                        InteractionUI.showTrash(false, tW);
                        this.app.redrawStamps(tPN);
                    } else if (['text', 'tempo-text', 'quick-text', 'sticky-note'].includes(syncObj.type)) {
                        if (syncObj.type === 'sticky-note' && syncObj.draw?.minimized) {
                            // Tap on minimized icon → expand
                            syncObj.draw.minimized = false
                            syncObj.updatedAt = Date.now()
                            if (!this.app.stamps.includes(syncObj)) this.app.stamps.push(syncObj)
                            await this.app.saveToStorage(true)
                            this.app.redrawStamps(tPN)
                            startGracePeriod(syncObj, pointerType)
                        } else if (syncObj.type === 'sticky-note' && isMovingExisting) {
                            // Existing sticky note in select mode
                            const hasMoved = !this.dragStartObject || syncObj.x !== this.dragStartObject.x || syncObj.y !== this.dragStartObject.y
                            if (hasMoved) {
                                // Just save new position after drag
                                syncObj.updatedAt = Date.now()
                                if (this.dragStartObject) this.app.pushHistory({ type: 'move', oldObj: this.dragStartObject, newObj: JSON.parse(JSON.stringify(syncObj)) })
                                await this.app.saveToStorage(true)
                                this.app.redrawStamps(tPN)
                            } else {
                                // Tap — check corner minimize button
                                const canvas = tW?.querySelector('.annotation-layer.virtual-canvas')
                                if (canvas && syncObj.draw && !syncObj.draw.minimized) {
                                    const tapPos = CoordMapper.getPos(e, overlay)
                                    const gs = this.app.scale / 1.5
                                    const btnCX = syncObj.x + (420 * gs) / canvas.width
                                    const btnCY = syncObj.y + (300 * gs) / canvas.height
                                    const btnR = (14 * gs) / Math.min(canvas.width, canvas.height)
                                    const dx = tapPos.x - btnCX, dy = tapPos.y - btnCY
                                    if (dx * dx + dy * dy < btnR * btnR) {
                                        syncObj.draw.minimized = true
                                        syncObj.updatedAt = Date.now()
                                        await this.app.saveToStorage(true)
                                        this.app.redrawStamps(tPN)
                                        return
                                    }
                                }
                                this.app.annotationManager.spawnTextEditor(tW, tPN, syncObj)
                            }
                        } else {
                            this.app.annotationManager.spawnTextEditor(tW, tPN, syncObj);
                        }
                    } else if (['page-bookmark', 'music-anchor'].includes(syncObj.type) && !isMovingExisting) {
                        const targetObj = syncObj;
                        const bookmarks = this.app.playbackManager?.currentMediaObj?.bookmarks || [];
                        const hasBookmarks = targetObj.type === 'music-anchor' && bookmarks.length > 0;

                        const showFinalDialog = (options = {}) => {
                             return this.app.docActionManager?.showDialog({
                                title: targetObj.type === 'page-bookmark' ? 'Add Page Bookmark' : 'Add Music Player',
                                ...options
                            });
                        };

                        const processLabel = async (label) => {
                            if (label !== null) {
                                targetObj.data = label || (targetObj.type === 'page-bookmark' ? `Page ${targetObj.page}` : 'Marker');
                                targetObj.updatedAt = Date.now();
                                this.app.stamps.push(targetObj);
                                this.app.pushHistory({ type: 'add', obj: JSON.parse(JSON.stringify(targetObj)) });
                                await this.app.saveToStorage(true);
                                if (targetObj.type === 'page-bookmark') this.app.jumpManager?.renderBookmarks();
                                if (this.app.supabaseManager) this.app.supabaseManager.pushAnnotation(targetObj, this.app.pdfFingerprint);
                                startGracePeriod(targetObj, pointerType);
                            }
                            this.app.redrawStamps(tPN);
                        };

                        const processYoutube = async (url) => {
                            if (!url) return;
                            const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts|live)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
                            const match = url.match(ytRegex);
                            if (match && match[1]) {
                                const videoId = match[1];
                                let time = 0;
                                const tMatch = url.match(/[?&t=](\d+)(s)?/);
                                if (tMatch) time = parseInt(tMatch[1]);
                                
                                targetObj.data = `youtube|${videoId}|${time}|YouTube Bookmark`;
                                targetObj.updatedAt = Date.now();
                                this.app.stamps.push(targetObj);
                                this.app.pushHistory({ type: 'add', obj: JSON.parse(JSON.stringify(targetObj)) });
                                await this.app.saveToStorage(true);
                                if (this.app.supabaseManager) this.app.supabaseManager.pushAnnotation(targetObj, this.app.pdfFingerprint);
                                startGracePeriod(targetObj, pointerType);
                                this.app.showMessage('YouTube Link Added', 'success');
                            } else {
                                this.app.showMessage('Invalid YouTube URL', 'error');
                            }
                            this.app.redrawStamps(tPN);
                        };

                        const pickerActions = [];
                        if (hasBookmarks) {
                            bookmarks.forEach(bm => {
                                pickerActions.push({ label: bm.label, subLabel: this.app.playbackManager.formatTime(bm.time), value: bm.label });
                            });
                        }
                        
                        if (targetObj.type === 'music-anchor') {
                            pickerActions.push({ label: '🔗 Link YouTube URL...', value: '__youtube__', subLabel: 'Paste URL' });
                        }
                        pickerActions.push({ label: '📝 Manual Label...', value: '__manual__', subLabel: 'Enter Text' });

                        showFinalDialog({
                            type: 'picker',
                            message: hasBookmarks ? 'Select a bookmark or link source:' : 'Choose anchor type:',
                            actions: pickerActions
                        })?.then(async result => {
                            if (result === '__manual__') {
                                showFinalDialog({ type: 'input', placeholder: 'e.g. Solo, Intro...' }).then(processLabel);
                            } else if (result === '__youtube__') {
                                showFinalDialog({ type: 'input', placeholder: 'Paste YouTube URL here...' }).then(processYoutube);
                            } else if (result !== null) {
                                processLabel(result);
                            }
                        });
                        return;
                    } else if (syncObj.type.startsWith('tempo-') && !isMovingExisting) {
                        const targetObj = syncObj;
                        const symbol = targetObj.draw?.noteSymbol || '♩';
                        this.app.annotationManager.promptBPM(symbol).then(async bpm => {
                            if (bpm) {
                                targetObj.data = bpm; targetObj.updatedAt = Date.now();
                                this.app.stamps.push(targetObj);
                                this.app.pushHistory({ type: 'add', obj: JSON.parse(JSON.stringify(targetObj)) });
                                await this.app.saveToStorage(true);
                                if (this.app.supabaseManager) this.app.supabaseManager.pushAnnotation(targetObj, this.app.pdfFingerprint);
                                startGracePeriod(targetObj, pointerType);
                            }
                            this.app.redrawStamps(tPN);
                        });
                        return;
                    } else if (['measure', 'measure-free'].includes(syncObj.type) && !isMovingExisting) {
                        const targetObj = syncObj;
                        this.app.annotationManager.promptMeasureNumber().then(async num => {
                            if (num) {
                                targetObj.data = num; targetObj.updatedAt = Date.now();
                                this.app.stamps.push(targetObj);
                                await this.app.saveToStorage(true);
                                this.app.updateRulerMarks();
                                if (this.app.supabaseManager) this.app.supabaseManager.pushAnnotation(targetObj, this.app.pdfFingerprint);
                                startGracePeriod(targetObj, pointerType);
                            }
                            this.app.redrawStamps(tPN);
                        });
                        return;
                    } else {
                        syncObj.updatedAt = Date.now();
                        if (!isMovingExisting && syncObj.type !== 'view') {
                            this.app.stamps.push(syncObj);
                            this.app.pushHistory({ type: 'add', obj: JSON.parse(JSON.stringify(syncObj)) });
                        } else if (isMovingExisting && this.dragStartObject) {
                            const moved = syncObj.points ? JSON.stringify(syncObj.points) !== JSON.stringify(this.dragStartObject.points) : (syncObj.x !== this.dragStartObject.x || syncObj.y !== this.dragStartObject.y || syncObj.page !== this.dragStartObject.page);
                            if (moved) this.app.pushHistory({ type: 'move', oldObj: this.dragStartObject, newObj: JSON.parse(JSON.stringify(syncObj)) });
                            else this._showStampContextMenu(syncObj, e.clientX, e.clientY);
                        }
                        if (syncObj.type === 'anchor') this.app.updateRulerMarks();
                        this.app.redrawStamps(tPN);
                        startGracePeriod(syncObj, pointerType);
                        await this.app.saveToStorage(true);
                        if (this.app.supabaseManager && syncObj.type !== 'view') this.app.supabaseManager.pushAnnotation(syncObj, this.app.pdfFingerprint);
                    }
                }
            } finally {
                cleanupInteraction(e);
            }
        };

        const startGracePeriod = (obj, pType) => {
            if (!obj || obj.deleted) return;
            
            // --- NO GRACE PERIOD FOR PEN OR DRAWING TYPES ---
            // This prevents "nudging" written characters during handwriting.
            const isDrawing = isDrawingType(obj.type);
            if (pType === 'pen' || isDrawing || obj.type === 'sticky-note') return;

            graceObject = obj; this.app._lastGraceObject = graceObject;
            this.app.redrawStamps(obj.page);
            const tW = document.querySelector(`.page-container[data-page="${obj.page}"]`);
            if (tW && !isDrawing) {
                const cent = CoordMapper.getGraceCenter(obj);
                const wc = getPixelsForWrapper(tW, cent.x, cent.y);
                const _tp = getTrashPos(cent.x, wc.x, wc.y);
                InteractionUI.showTrash(true, tW, _tp.x, _tp.y);
                this.updateAllOverlaysTouchAction();
            }
            if (graceTimer) clearTimeout(graceTimer);
            graceTimer = setTimeout(() => {
                if (graceObject === obj) {
                    graceObject = null;
                    const w = document.querySelector(`.page-container[data-page="${obj.page}"]`);
                    if (w) InteractionUI.showTrash(false, w);
                    const ov = w?.querySelector('.capture-overlay'), vp = ov?.querySelector('.virtual-pointer');
                    InteractionUI.syncVirtualPointer({ type: 'mousemove' }, null, ov, vp, CoordMapper, this.app);
                }
                if (this.app._lastGraceObject === obj) { this.app._lastGraceObject = null; this.app.redrawStamps(obj.page); this.updateAllOverlaysTouchAction(); }
            }, 1800);
        };

        const cleanupInteraction = (e) => {
            isInteracting = false; this.app.isInteracting = false; isMovingExisting = false; activeObject = null;
            this.isAdjustingCurvature = false; this.app._dragLastPos = null;
            if (e?.pointerId !== undefined) activePointers.delete(e.pointerId);
            if (activePointers.size === 0 && touchBufferTimer) { clearTimeout(touchBufferTimer); touchBufferTimer = null; }
            this._updateCursor(overlay, getPointerType(e || { type: 'mousemove' }));
            if (!graceObject) InteractionUI.showTrash(false, wrapper);
            else InteractionUI.setTrashActive(false, wrapper);
            this._hideDragGhost(); detachGlobalListeners();
            InteractionUI.syncVirtualPointer({ type: 'mousemove' }, null, overlay, virtualPointer, CoordMapper, this.app);
        };

        const hoverAction = (e) => {
            if (isInteracting) return;
            const pt = getPointerType(e); const tt = this.app.activeStampType;
            this._updateCursor(overlay, pt);
            const pPos = CoordMapper.getStampPreviewPos(CoordMapper.getPos(e, overlay), pt, tt, this.app, overlay);
            
            if (['select', 'eraser', 'copy', 'recycle-bin', 'cycle'].includes(tt) || tt.startsWith('cloak-')) {
                const f = this.app.findClosestStamp(pageNum, pPos.x, pPos.y, tt !== 'eraser');
                if (f !== (tt === 'eraser' ? this.app.hoveredStamp : this.app.selectHoveredStamp)) {
                    if (tt === 'eraser') this.app.hoveredStamp = f; else this.app.selectHoveredStamp = f;
                    this.app.redrawStamps(pageNum);
                }
            } else if (this.app.isStampTool() && tt !== 'view' && tt !== 'sticky-note') {
                const cvs = wrapper.querySelector('.annotation-layer.virtual-canvas');
                if (cvs) {
                    this.app.redrawStamps(pageNum);
                    const l = this.app.layers.find(ly => ly.id === 'draw');
                    this.app.drawStampOnCanvas(cvs.getContext('2d'), cvs, { type: tt, x: pPos.x, y: pPos.y, page: pageNum, userScale: this.app.activeToolPreset || 1.0 }, this.app.activeColor || l?.color || '#000', true, false, false, CoordMapper.getPos(e, overlay));
                }
            }
            InteractionUI.syncVirtualPointer(e, tt, overlay, virtualPointer, CoordMapper, this.app);
        };

        const attachGlobalListeners = () => { detachGlobalListeners(); window.addEventListener('pointermove', moveAction); window.addEventListener('pointerup', endAction); window.addEventListener('pointercancel', endAction); };
        const detachGlobalListeners = () => { window.removeEventListener('pointermove', moveAction); window.removeEventListener('pointerup', endAction); window.removeEventListener('pointercancel', endAction); };

        overlay.addEventListener('touchstart', (e) => { if (this.app.activeStampType !== 'view' && e.cancelable) e.preventDefault(); }, { passive: false });
        overlay.addEventListener('pointerdown', startAction);
        overlay.addEventListener('pointermove', hoverAction);
        overlay.addEventListener('pointerup', (e) => { 
            activePointers.delete(e.pointerId); 
            if (activePointers.size < 2) isTwoFingerPanning = false;
        }, { passive: true });
        overlay.addEventListener('pointercancel', (e) => { 
            activePointers.delete(e.pointerId); 
            if (activePointers.size < 2) isTwoFingerPanning = false;
        }, { passive: true });
        overlay.addEventListener('mouseleave', () => { virtualPointer?.classList.remove('active'); this.app.hoveredStamp = this.app.selectHoveredStamp = null; this.app.redrawStamps(pageNum); });

        InteractionUI.ensureTrashBin(wrapper);
        wrapper.appendChild(overlay);
        overlay._updateTouchAction = () => this.updateAllOverlaysTouchAction();
        this.updateAllOverlaysTouchAction();
    }

    updateAllOverlaysTouchAction() {
        const tt = this.app.activeStampType; const isView = tt === 'view';
        document.documentElement.dataset.activeTool = tt;
        document.body.dataset.activeTool = tt;
        if (this.app.viewer) this.app.viewer.dataset.activeTool = tt;
        document.querySelectorAll('.capture-overlay').forEach(el => {
            if (isView && el._resetState) el._resetState();
            el.style.touchAction = 'none'; el.style.pointerEvents = 'auto'; el.style.zIndex = isView ? '10' : '50';
            this._updateCursor(el, 'mouse');
        });
        if (this.app.viewer) { 
            const isIOS = this.app.isIOS;
            this.app.viewer.style.touchAction = (isIOS && isView) ? 'none' : 'pan-x pan-y';
        }
        if (isView) this.app.isInteracting = false;
    }

    _showDragGhost(cx, cy, obj) {
        let ghost = document.getElementById('sf-drag-ghost') || document.createElement('div');
        if (!ghost.id) { ghost.id = 'sf-drag-ghost'; document.body.appendChild(ghost); }
        ghost.textContent = obj?.data || obj?.type || '◆';
        ghost.style.color = obj?.color || this.app.activeColor || '#ef4444';
        ghost.style.display = 'block'; ghost.style.left = (cx + 18) + 'px'; ghost.style.top = (cy - 16) + 'px';
    }

    _hideDragGhost() { const g = document.getElementById('sf-drag-ghost'); if (g) g.style.display = 'none'; }

    /**
     * Sample the background color of the PDF canvas at normalized position (normX, normY).
     * Averages a 7×7 pixel patch to reduce noise from isolated dirty pixels.
     * Falls back to white if canvas is unavailable or tainted (cross-origin).
     */
    _samplePageColor(pageNum, normX, normY, wrapper) {
        const canvas = wrapper?.querySelector('.pdf-canvas');
        if (!canvas) return '#ffffff';
        try {
            const ctx = canvas.getContext('2d');
            const PATCH = 3; // sample 7×7 area
            const cx = Math.round(normX * canvas.width);
            const cy = Math.round(normY * canvas.height);
            const x0 = Math.max(0, cx - PATCH);
            const y0 = Math.max(0, cy - PATCH);
            const w = Math.min(PATCH * 2 + 1, canvas.width - x0);
            const h = Math.min(PATCH * 2 + 1, canvas.height - y0);
            const data = ctx.getImageData(x0, y0, w, h).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i]; g += data[i + 1]; b += data[i + 2]; count++;
            }
            r = Math.round(r / count); g = Math.round(g / count); b = Math.round(b / count);
            return `rgb(${r},${g},${b})`;
        } catch {
            return '#ffffff';
        }
    }
}
