/**
 * InteractionUI manages the creation and state of interactive DOM elements
 * like the trash bin and virtual pointer.
 */
export const InteractionUI = {
    /**
     * Ensure the trash bin exists on the page wrapper.
     */
    ensureTrashBin: (wrapper) => {
        let bin = wrapper.querySelector('.grace-trash-bin')
        if (!bin) {
            bin = document.createElement('div')
            bin.className = 'grace-trash-bin'
            bin.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"/></svg>`
            wrapper.appendChild(bin)
        }
        return bin
    },

    /**
     * Set trash bin active state (glow/red).
     */
    setTrashActive: (active, wrapper) => {
        const bin = InteractionUI.ensureTrashBin(wrapper)
        if (active) bin.classList.add('active')
        else bin.classList.remove('active')
    },

    /**
     * Position and show/hide the trash bin.
     * x, y should be relative to the WRAPPER.
     */
    showTrash: (show, wrapper, x = null, y = null) => {
        const bin = InteractionUI.ensureTrashBin(wrapper)
        if (show) {
            // Restore display: flex first to allow position calculations (via class or style)
            bin.classList.add('show') 
            
            if (x !== null && y !== null) {
                const binWidth = 72 
                const binHeight = 72
                
                let left = x - binWidth / 2
                let top = y - binHeight / 2 
                
                const rect = wrapper.getBoundingClientRect()
                const padding = 20
                left = Math.max(padding, Math.min(rect.width - binWidth - padding, left))
                top = Math.max(padding, Math.min(rect.height - binHeight - padding, top))
                
                bin.style.position = 'absolute'
                bin.style.left = `${left}px`
                bin.style.top = `${top}px`
            } else {
                // If showing but no coords, clear previous absolute positioning to use CSS fixed position
                bin.style.left = ''
                bin.style.top = ''
                bin.style.position = ''
            }
        } else {
            bin.classList.remove('show')
            bin.classList.remove('active')
            // Reset position to avoid ghost footprints
            bin.style.left = ''
            bin.style.top = ''
            bin.style.position = ''
        }
    },

    /**
     * Check if an object (stamp/path) overlaps with the trash bin.
     */
    isObjectOverTrash: (obj, wrapper, coordMapper) => {
        if (!obj) return false
        const bin = InteractionUI.ensureTrashBin(wrapper)
        const binRect = bin.getBoundingClientRect()
        
        // Target center in pixel coordinates relative to viewport
        const center = coordMapper.getGraceCenter(obj)
        // Find the main rendering canvas to get its viewport rect
        const canvas = wrapper.querySelector('.pdf-canvas') || wrapper.querySelector('.annotation-layer:not(.virtual-canvas)')
        if (!canvas) return false
        
        const canvasRect = canvas.getBoundingClientRect()
        const objX = canvasRect.left + (center.x * canvasRect.width)
        const objY = canvasRect.top + (center.y * canvasRect.height)
        
        // Trash bin bounds in viewport coordinates
        // Using a 15px bleed for easier hitting
        const tolerance = 15
        return (
            objX >= (binRect.left - tolerance) &&
            objX <= (binRect.right + tolerance) &&
            objY >= (binRect.top - tolerance) &&
            objY <= (binRect.bottom + tolerance)
        )
    },

    /**
     * Sync the virtual pointer's position and visibility.
     */
    syncVirtualPointer: (e, toolType, overlay, virtualPointer, coordMapper, app) => {
        if (!toolType || !virtualPointer) {
            if (virtualPointer) virtualPointer.classList.remove('active');
            virtualPointer.classList.remove('idle-pan');
            if (overlay && !app.isTouch) overlay.style.cursor = '';
            return;
        }
        
        // Treat 'view' as the idle-pan state
        const isIdle = toolType === 'idle-pan' || toolType === 'view';
        const effectiveTool = toolType === 'idle-pan' ? app.activeStampType : toolType;
        
        const pos = coordMapper.getPos(e, overlay)
        const isTouch = e.type.startsWith('touch') || (e.touches && e.touches.length > 0)
        const previewPos = coordMapper.getStampPreviewPos(pos, isTouch, effectiveTool, app, overlay)
        const hasOffset = previewPos.x !== pos.x || previewPos.y !== pos.y
        
        const isTargetingTool = ['select', 'copy', 'recycle-bin', 'text', 'tempo-text', 'view'].includes(effectiveTool);
        const isDesktopStamp = !app.isTouch && (app.isStampTool() || isTargetingTool);
        
        if (hasOffset || isDesktopStamp || isIdle) {
            const rect = overlay.getBoundingClientRect()
            virtualPointer.style.left = `${previewPos.x * rect.width}px`
            virtualPointer.style.top = `${previewPos.y * rect.height}px`
            virtualPointer.classList.add('active')
            
            // Handle idle state styling (hand icon)
            virtualPointer.classList.toggle('idle-pan', isIdle);
            
            // Toggle dragging class based on app state
            virtualPointer.classList.toggle('dragging', !!app.isInteracting);
            
            // Ensure system cursor is hidden if we are showing the custom one on desktop
            if (isDesktopStamp || isIdle) {
                // Use 'grabbing' if interacting, else 'grab'
                overlay.style.cursor = isIdle ? (app.isInteracting ? 'grabbing' : 'grab') : 'none';
            }
        } else {
            virtualPointer.classList.remove('active')
            virtualPointer.classList.remove('idle-pan')
            if (overlay && !app.isTouch) overlay.style.cursor = ''
        }
    }
}
