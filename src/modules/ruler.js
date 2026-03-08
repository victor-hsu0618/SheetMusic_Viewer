export class RulerManager {
    constructor(app) {
        this.app = app
        this.rulerVisible = localStorage.getItem('scoreflow_ruler_visible') !== 'false'
        this.jumpHistory = []
        this.nextTargetAnchor = null
        this.jumpOffsetPx = 1 * 37.8 // 1cm default
    }

    updateRulerPosition() {
        const ruler = document.getElementById('jump-ruler')
        if (!ruler) return
        const firstPage = document.querySelector('.page-container')
        if (!firstPage) return
        const pageRect = firstPage.getBoundingClientRect()
        const rulerW = parseInt(getComputedStyle(ruler).getPropertyValue('width')) || 28
        ruler.style.left = `${Math.max(0, pageRect.left - rulerW)}px`
        const beam = ruler.querySelector('.jump-line-beam')
        if (beam) beam.style.width = `${pageRect.width}px`
        this.updateRulerClip()
    }

    updateRulerClip() {
        const ruler = document.getElementById('jump-ruler')
        if (!ruler || !this.app.pdf) {
            if (ruler) { ruler.style.maskImage = ''; ruler.style.webkitMaskImage = '' }
            return
        }
        const vh = window.innerHeight
        const stops = ['transparent 0px']

        document.querySelectorAll('.page-container').forEach(page => {
            const rect = page.getBoundingClientRect()
            if (rect.bottom <= 0 || rect.top >= vh) return
            const topY = Math.max(0, rect.top)
            const bottomY = Math.min(vh, rect.bottom)
            stops.push(`transparent ${topY}px`, `black ${topY}px`, `black ${bottomY}px`, `transparent ${bottomY}px`)
        })

        const mask = `linear-gradient(to bottom, ${stops.join(', ')})`
        ruler.style.maskImage = mask
        ruler.style.webkitMaskImage = mask
    }

    computeNextTarget() {
        if (!this.app.pdf || !this.app.viewer) { this.nextTargetAnchor = null; return }
        const currentScroll = this.app.viewer.scrollTop
        const viewportHeight = this.app.viewer.clientHeight
        const viewportCenter = currentScroll + viewportHeight / 2
        const currentFocusY = currentScroll + this.jumpOffsetPx

        const candidates = this.app.stamps
            .filter(s => s.type === 'anchor')
            .map(s => {
                const pageElem = document.querySelector(`.page-container[data-page="${s.page}"]`)
                if (!pageElem) return null
                const canvas = pageElem.querySelector('.pdf-canvas')
                const absoluteY = pageElem.offsetTop + (s.y * canvas.height)
                return { stamp: s, absoluteY }
            })
            .filter(a => a !== null && a.absoluteY > currentFocusY + 10)

        if (candidates.length === 0) {
            this.nextTargetAnchor = null
            return
        }

        candidates.sort((a, b) =>
            Math.abs(a.absoluteY - viewportCenter) - Math.abs(b.absoluteY - viewportCenter)
        )
        this.nextTargetAnchor = candidates[0].stamp
    }

    updateRulerMarks() {
        this.computeNextTarget()
        const marksContainer = document.getElementById('ruler-marks')
        if (!marksContainer) return

        const visualMarks = this.app.stamps.filter(s => s.type === 'anchor' || s.type === 'measure')
        marksContainer.innerHTML = ''
        const viewportHeight = window.innerHeight

        visualMarks.forEach((stamp) => {
            const pageWrapper = document.querySelector(`.page-container[data-page="${stamp.page}"]`)
            if (pageWrapper && this.app.pdf) {
                const rect = pageWrapper.getBoundingClientRect()
                const absY = rect.top + (stamp.y * rect.height)
                if (absY > -200 && absY < viewportHeight + 200) {
                    const mark = document.createElement('div')
                    if (stamp.type === 'anchor') {
                        const isNextTarget = stamp === this.nextTargetAnchor
                        mark.className = isNextTarget ? 'ruler-anchor-mark ruler-next-target' : 'ruler-anchor-mark'
                    } else if (stamp.type === 'measure') {
                        mark.className = 'ruler-measure-mark'
                        mark.textContent = stamp.data
                    }
                    mark.style.top = `${absY}px`
                    marksContainer.appendChild(mark)
                }
            }
        })

        if (this.app.viewer && !this.nextTargetAnchor) {
            const fallbackY = this.app.viewer.clientHeight - this.jumpOffsetPx
            const fallback = document.createElement('div')
            fallback.className = 'ruler-fallback-mark'
            fallback.style.top = `${fallbackY}px`
            marksContainer.appendChild(fallback)
        }
    }

    toggleRuler() {
        this.rulerVisible = !this.rulerVisible
        this.app.rulerVisible = this.rulerVisible
        localStorage.setItem('scoreflow_ruler_visible', this.rulerVisible)
        const ruler = document.getElementById('jump-ruler')
        if (ruler) {
            ruler.classList.toggle('hidden', !this.rulerVisible)
            ruler.style.display = this.rulerVisible ? 'block' : ''
        }
        if (this.app.btnRulerToggle) this.app.btnRulerToggle.classList.toggle('active', this.rulerVisible)
    }

    goToHead() {
        if (this.app.viewer) {
            this.jumpHistory.push(this.app.viewer.scrollTop)
            this.app.viewer.scrollTop = 0
        }
    }

    goToEnd() {
        if (this.app.viewer) {
            this.jumpHistory.push(this.app.viewer.scrollTop)
            this.app.viewer.scrollTop = this.app.viewer.scrollHeight
        }
    }

    updateJumpLinePosition() {
        if (!this.app.jumpLine) return
        const firstPage = document.querySelector('.page-container')
        let xOffset = 0
        if (firstPage) {
            const pageRect = firstPage.getBoundingClientRect()
            const viewerRect = this.app.viewer.getBoundingClientRect()
            xOffset = pageRect.left - viewerRect.left
        }
        this.app.jumpLine.style.left = `${xOffset}px`
        this.app.jumpLine.style.top = `${this.app.viewer.clientHeight - this.jumpOffsetPx}px`
    }
}
