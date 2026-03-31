/**
 * InteractionUI manages the creation and state of interactive DOM elements
 * like the trash bin and virtual pointer.
 */
export const InteractionUI = {
    ensureTrashBin: (wrapper) => {
        return null
    },

    setTrashActive: (active, wrapper) => {
        return
    },

    showTrash: (show, wrapper, x = null, y = null) => {
        return
    },

    isObjectOverTrash: (obj, wrapper, coordMapper) => {
        return false
    },

    /**
     * Sync the virtual pointer's position and visibility.
     */
    syncVirtualPointer: (e, toolType, overlay, virtualPointer, coordMapper, app, targetObject = null) => {
        if (!virtualPointer) return;

        // Determine pointer type early
        let pointerType = 'mouse'
        if (e.pointerType) {
            pointerType = e.pointerType
        } else if (e.type.startsWith('touch') || (e.touches && e.touches.length > 0)) {
            pointerType = 'touch'
        }

        // 1. HARD DISABLE for Pen: Pen should NEVER see a virtual pointer or square frame
        if (pointerType === 'pen') {
            virtualPointer.classList.remove('active', 'idle-pan', 'dragging', 'pen-tip', 'eraser-tip');
            if (overlay) overlay.style.cursor = 'crosshair'; // Keep system crosshair for pen
            return;
        }

        // 2. Standard Hiding: If no tool or no overlay
        if (!toolType) {
            virtualPointer.classList.remove('active', 'idle-pan', 'dragging', 'pen-tip', 'eraser-tip');
            if (overlay) overlay.style.cursor = '';
            return;
        }

        // Treat 'view' as the idle-pan state
        const isIdle = toolType === 'idle-pan' || toolType === 'view';
        const effectiveTool = toolType === 'idle-pan' ? app.activeStampType : toolType;

        let pos, previewPos;
        if (targetObject) {
            // If targetObject is provided (Nudge mode), center the pointer on the object
            previewPos = coordMapper.getGraceCenter(targetObject);
            pos = previewPos;
        } else {
            pos = coordMapper.getPos(e, overlay)
            previewPos = coordMapper.getStampPreviewPos(pos, pointerType, effectiveTool, app, overlay)
        }

        const hasOffset = Math.abs(previewPos.x - pos.x) > 0.0001 || Math.abs(previewPos.y - pos.y) > 0.0001

        const isTargetingTool = ['select', 'copy', 'recycle-bin', 'text', 'tempo-text', 'eraser', 'measure', 'sticky-note'].includes(effectiveTool);

        const isDrawingEffectiveTool = ['pen', 'fine-pen', 'marker-pen', 'brush-pen', 'fountain-pen', 'pencil-pen',
            'red-pen', 'green-pen', 'blue-pen', 'highlighter',
            'highlighter-red', 'highlighter-blue', 'highlighter-green', 'line', 'slur',
            'dashed-pen', 'arrow-pen', 'bracket-left', 'bracket-right',
            'rect-shape', 'circle-shape',
            'cover-brush', 'correction-pen'].includes(effectiveTool);

        // Show virtual pointer if:
        // 1. It's touch and has an offset (to bridge finger distance)
        // 2. It's touch, currently dragging/placing a non-drawing tool (shows icon at placement position)
        // 3. It's mouse and it's a stamp tool or drawing tool (to show placement / drawing cursor)
        // 4. It's idle pan mode
        const shouldShow = (pointerType === 'touch' && hasOffset) ||
            (pointerType === 'touch' && !!app.isInteracting && !isDrawingEffectiveTool) ||
            (pointerType === 'mouse' && (app.isStampTool() || isIdle || isDrawingEffectiveTool)) ||
            isIdle;

        // For mouse + drawing tools: show a small pen-tip dot instead of the stamp circle
        if (pointerType === 'mouse' && isDrawingEffectiveTool && !isIdle) {
            const rect = overlay.getBoundingClientRect()
            virtualPointer.style.left = `${pos.x * rect.width}px`
            virtualPointer.style.top = `${pos.y * rect.height}px`
            virtualPointer.style.setProperty('--pen-tip-color', app.activeColor || '#ff4757')
            virtualPointer.classList.add('active', 'pen-tip')
            virtualPointer.classList.remove('idle-pan', 'dragging')
            // Eraser-type tools: hollow ring cursor
            virtualPointer.classList.toggle('eraser-tip', effectiveTool === 'correction-pen')
            if (overlay) overlay.style.cursor = 'none';
            return;
        }

        if (shouldShow) {
            const rect = overlay.getBoundingClientRect()
            virtualPointer.style.left = `${previewPos.x * rect.width}px`
            virtualPointer.style.top = `${previewPos.y * rect.height}px`
            virtualPointer.classList.remove('pen-tip')
            virtualPointer.classList.add('active')

            // Handle idle state styling (hand icon)
            virtualPointer.classList.toggle('idle-pan', isIdle);

            // Toggle dragging class based on app state
            virtualPointer.classList.toggle('dragging', !!app.isInteracting);

            // Ensure system cursor is hidden if we are showing the custom one on desktop
            if (pointerType === 'mouse' || isIdle) {
                // Use 'grabbing' if interacting, else 'grab'
                if (overlay) overlay.style.cursor = isIdle ? (app.isInteracting ? 'grabbing' : 'grab') : 'none';
            }
        } else {
            virtualPointer.classList.remove('active', 'idle-pan', 'dragging', 'pen-tip', 'eraser-tip');
            if (overlay) {
                if (pointerType === 'mouse') overlay.style.cursor = isTargetingTool ? 'default' : 'none';
                else if (pointerType === 'pen') overlay.style.cursor = 'crosshair';
                else if (pointerType === 'touch') overlay.style.cursor = 'none'; // Keep none to let system hide original dot
            }
        }
    }
}
