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
            if (x !== null && y !== null) {
                const binWidth = 64
                const binHeight = 64
                const padding = 12
                
                // Prioritize LEFT side of the object
                let left = x - 40 - binWidth 
                let top = y - binHeight / 2
                
                // Boundary check: Flip to right if left side is blocked
                if (left < padding) {
                    left = x + 40
                }
                
                const rect = wrapper.getBoundingClientRect()
                // Horizontal clamping
                left = Math.max(padding, Math.min(rect.width - binWidth - padding, left))
                // Vertical clamping
                top = Math.max(padding, Math.min(rect.height - binHeight - padding, top))
                
                bin.style.left = `${left}px`
                bin.style.top = `${top}px`
            }
            bin.classList.add('show')
        } else {
            bin.classList.remove('show')
            bin.classList.remove('active')
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
            return;
        }
        const pos = coordMapper.getPos(e, overlay)
        const isTouch = e.type.startsWith('touch') || (e.touches && e.touches.length > 0)
        const previewPos = coordMapper.getStampPreviewPos(pos, isTouch, toolType, app, overlay)
        const hasOffset = previewPos.x !== pos.x || previewPos.y !== pos.y
        
        if (hasOffset) {
            const rect = overlay.getBoundingClientRect()
            virtualPointer.style.left = `${previewPos.x * rect.width}px`
            virtualPointer.style.top = `${previewPos.y * rect.height}px`
            virtualPointer.classList.add('active')
        } else {
            virtualPointer.classList.remove('active')
        }
    }
}
