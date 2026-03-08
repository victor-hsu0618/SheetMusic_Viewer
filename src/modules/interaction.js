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

        overlay.onmousedown = overlay.ontouchstart = (e) => {
            if (this.app.activeStampType === 'view') return
            e.preventDefault()
            const pos = getPos(e)
            this.app.addStamp(pageNum, pos.x, pos.y)
        }

        overlay.onmousemove = overlay.ontouchmove = (e) => {
            if (this.app.activeStampType === 'view') return
            // Preview logic ...
        }

        return overlay
    }
}
