export class InteractionManager {
    constructor(app) {
        this.app = app
        this.lastX = 0
        this.lastY = 0
        this.isDragging = false
    }

    createCaptureOverlay(wrapper, pageNum, width, height) {
        const overlay = document.createElement('div')
        overlay.className = 'capture-overlay'
        overlay.style.width = width + 'px'
        overlay.style.height = height + 'px'
        wrapper.appendChild(overlay)

        const getPos = (e) => {
            const rect = overlay.getBoundingClientRect()
            const clientX = e.touches ? e.touches[0].clientX : e.clientX
            const clientY = e.touches ? e.touches[0].clientY : e.clientY
            return {
                x: (clientX - rect.left) / width,
                y: (clientY - rect.top) / height,
                rawX: clientX - rect.left,
                rawY: clientY - rect.top
            }
        }

        const handleStart = (e) => {
            if (this.app.activeStampType === 'view') return
            // For stamp mode, prevent default to avoid scrolling while stamping
            if (e.cancelable) e.preventDefault()
            const pos = getPos(e)
            this.app.addStamp(pageNum, pos.x, pos.y)
        }

        const handleMove = (e) => {
            if (this.app.activeStampType === 'view') return
        }

        overlay.addEventListener('mousedown', handleStart)
        overlay.addEventListener('touchstart', handleStart, { passive: true })
        overlay.addEventListener('mousemove', handleMove)
        overlay.addEventListener('touchmove', handleMove, { passive: true })

        return overlay
    }
}
