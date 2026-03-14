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
        // Support PointerEvent, MouseEvent, and TouchEvent with viewport fallbacks
        let clientX = e.clientX;
        let clientY = e.clientY;

        if (clientX === undefined || clientX === null) {
            clientX = (e.touches && e.touches[0] ? e.touches[0].clientX : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : 0))
        }
        if (clientY === undefined || clientY === null) {
            clientY = (e.touches && e.touches[0] ? e.touches[0].clientY : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : 0))
        }

        return {
            x: (clientX - rect.left) / (rect.width || 1),
            y: (clientY - rect.top) / (rect.height || 1)
        }
    },

    /**
     * Calculate stamp preview position with offset based on pointer type.
     * pointerType: 'mouse', 'touch', or 'pen'
     */
    getStampPreviewPos: (pos, pointerType, toolType, app, overlay) => {
        // Mode detection
        const isTargetingTool = ['select', 'copy', 'recycle-bin', 'eraser', 'text', 'tempo-text', 'measure'].includes(toolType);
        
        const rect = overlay.getBoundingClientRect()
        const offsetX = Number(app.stampOffsetTouchX || 0);
        const offsetY = Number(app.stampOffsetTouchY || 0);

        // 1. Standard Measure Lock: Always stay on the left margin (applies to ALL pointer types)
        if (toolType === 'measure') {
            const dyPx = (pointerType === 'touch') ? -offsetY : 0;
            return { x: 0.05, y: Number(pos.y + dyPx / (rect.height || 1)) };
        }

        // No offset for any tool if using Mouse or Pen (high precision)
        if (pointerType !== 'touch') {
            return pos;
        }

        // 2. Direct Tools check: No offset for Pens and Edit tools
        const isPenTool = toolType && ['pen', 'red-pen', 'green-pen', 'blue-pen', 'highlighter', 'highlighter-red', 'highlighter-blue', 'highlighter-green', 'line', 'slur', 'dashed-pen', 'arrow-pen'].includes(toolType);
        const isEditTool = toolType && ['select', 'eraser', 'copy', 'recycle-bin', 'view'].includes(toolType);
        
        if (isPenTool || isEditTool) {
            return pos;
        }

        let dxPx = offsetX
        let dyPx = -offsetY

        // Disable horizontal offset for specific tools that need 1:1 finger placement
        const noXOffsetTools = ['measure-free', 'view', 'select', 'eraser', 'copy', 'recycle-bin'];
        if (noXOffsetTools.includes(toolType)) {
            dxPx = 0;
        }

        // Calculate target pixels and clamp to keep within page boundaries
        const targetXPx = (pos.x * rect.width) + dxPx;
        const targetYPx = (pos.y * rect.height) + dyPx;

        // Keep 5px margin from edges
        const margin = 5;
        const clampedX = Math.max(margin, Math.min(rect.width - margin, targetXPx));
        const clampedY = Math.max(margin, Math.min(rect.height - margin, targetYPx));

        return {
            x: clampedX / (rect.width || 1),
            y: clampedY / (rect.height || 1)
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
