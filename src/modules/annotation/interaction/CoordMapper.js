/**
 * CoordMapper provides centralized logic for coordinate conversion, 
 * stamp preview offsets, and grace object geometry calculations.
 */
export const CoordMapper = {
    /**
     * Get normalized (0-1) coordinates from mouse/touch/pointer event relative to overlay.
     */
    getPos: (e, overlay) => {
        const rect = overlay.getBoundingClientRect()
        // Support PointerEvent, MouseEvent, and TouchEvent
        const clientX = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0))
        const clientY = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0))
        return {
            x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
        }
    },

    /**
     * Calculate stamp preview position with offset based on pointer type.
     * pointerType: 'mouse', 'touch', or 'pen'
     */
    getStampPreviewPos: (pos, pointerType, toolType, app, overlay) => {
        // No offset for specific tools or if viewing
        if (toolType === 'view' || toolType === 'select' || toolType === 'eraser' || toolType === 'copy' || toolType === 'recycle-bin' || toolType === 'text' || toolType === 'tempo-text' || toolType === 'measure') {
            return pos
        }

        const rect = overlay.getBoundingClientRect()
        const offsetX = -45
        
        let offsetY = app.stampOffsetMouseY // Default to mouse offset
        if (pointerType === 'touch') {
            offsetY = app.stampOffsetTouchY
        } else if (pointerType === 'pen') {
            // For iPad Pen, use zero offset for maximum precision
            return pos
        }

        let dxPx = offsetX
        let dyPx = -offsetY

        // Edge detection to pull stamp away from toolbars/edges
        const distFromLeftPx = pos.x * rect.width
        const distFromRightPx = rect.width - (pos.x * rect.width)
        const transX = 60 

        if (distFromLeftPx < transX) {
            const t = Math.max(0, Math.min(1, distFromLeftPx / transX))
            dxPx = offsetX * t
        } else if (distFromRightPx < transX) {
            const t = Math.max(0, Math.min(1, distFromRightPx / transX))
            dxPx = offsetX * t
        }

        return {
            x: Math.max(0.0001, Math.min(0.9999, pos.x + dxPx / rect.width)),
            y: Math.max(0.0001, Math.min(0.9999, pos.y + dyPx / rect.height))
        }
    },

    /**
     * Calculate center of a grace object (stamp or path).
     */
    getGraceCenter: (obj) => {
        if (!obj) return { x: 0, y: 0 }
        if (obj.points && obj.points.length > 0) {
            const avgX = obj.points.reduce((sum, p) => sum + p.x, 0) / obj.points.length
            const avgY = obj.points.reduce((sum, p) => sum + p.y, 0) / obj.points.length
            return { x: avgX, y: avgY }
        }
        return { x: obj.x || 0, y: obj.y || 0 }
    },

    /**
     * Get effective pixel size of a grace object for collision detection.
     */
    getGraceObjectPixelSize: (obj, app) => {
        if (!obj) return 26
        const pageFactor = app.pageScales[obj.page] || 1.0
        const userMultiplier = app.stampSizeMultiplier || 1.0
        const scoreMultiplier = app.scoreStampScale || 1.0
        
        let toolSize = 24
        for (const set of app.toolsets) {
            const tool = set.tools.find(t => t.id === obj.type)
            if (tool) { toolSize = tool.size || 24; break }
        }
        const baseSize = 14 * (app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier * (toolSize / 24)
        const isBow = obj.type === 'up-bow' || obj.type === 'down-bow'
        return isBow ? baseSize * 0.85 : baseSize
    }
}
