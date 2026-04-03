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
     * FEATURE DISABLED: Virtual pointer (hover preview) is no longer used.
     */
    syncVirtualPointer: (e, toolType, overlay, virtualPointer, coordMapper, app, targetObject = null) => {
        if (virtualPointer) virtualPointer.classList.remove('active', 'idle-pan', 'dragging', 'pen-tip', 'eraser-tip');
        // Restore standard system cursors
        if (overlay) {
            const pt = (e.pointerType) ? e.pointerType : (e.type.startsWith('touch') ? 'touch' : 'mouse');
            if (pt === 'mouse') overlay.style.cursor = 'crosshair';
            else overlay.style.cursor = '';
        }
    }
}
