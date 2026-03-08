export class RulerManager {
    constructor(app) {
        this.app = app
        this.rulerVisible = localStorage.getItem('scoreflow_ruler_visible') !== 'false'
        this.jumpOffsetPx = 450
        this.nextTargetAnchor = null
        this.jumpHistory = []
    }

    init() {
        this.app.jumpLine = document.getElementById('jump-line')
        this.app.jumpOffsetInput = document.getElementById('jump-offset')
        this.app.jumpOffsetValue = document.getElementById('jump-offset-value')
        this.app.btnJumpHead = document.getElementById('btn-jump-head')
        this.app.btnJumpEnd = document.getElementById('btn-jump-end')
        this.app.btnRulerToggle = document.getElementById('btn-ruler-toggle')

        this.initEventListeners()
        this.updateJumpLinePosition()
        this.updateRulerPosition()
    }

    initEventListeners() {
        if (this.app.jumpOffsetInput) {
            this.app.jumpOffsetInput.addEventListener('input', (e) => {
                const cm = parseFloat(e.target.value)
                if (this.app.jumpOffsetValue) this.app.jumpOffsetValue.textContent = `${cm.toFixed(1)}cm`
                this.jumpOffsetPx = cm * 37.8
                this.updateJumpLinePosition()
            })
        }

        const handle = document.querySelector('.jump-line-handle')
        if (handle) {
            let isDraggingRuler = false
            handle.addEventListener('mousedown', (e) => {
                isDraggingRuler = true
                e.preventDefault()
            })
            window.addEventListener('mousemove', (e) => {
                if (!isDraggingRuler) return
                let newY = e.clientY
                if (newY < 0) newY = 0
                if (newY > window.innerHeight - 50) newY = window.innerHeight - 50
                this.jumpOffsetPx = newY
                this.updateJumpLinePosition()
                if (this.app.jumpOffsetInput) {
                    const cm = newY / 37.8
                    this.app.jumpOffsetInput.value = cm
                    if (this.app.jumpOffsetValue) this.app.jumpOffsetValue.textContent = `${cm.toFixed(1)}cm`
                }
            })
            window.addEventListener('mouseup', () => {
                if (isDraggingRuler) {
                    isDraggingRuler = false
                    const beam = document.querySelector('.jump-line-beam')
                    if (beam) {
                        beam.classList.add('pulse')
                        setTimeout(() => beam.classList.remove('pulse'), 600)
                    }
                }
            })
        }

        if (this.app.btnRulerToggle) {
            this.app.btnRulerToggle.addEventListener('click', () => this.toggleRuler())
        }
    }

    toggleRuler() {
        this.rulerVisible = !this.rulerVisible
        localStorage.setItem('scoreflow_ruler_visible', this.rulerVisible)
        this.updateRulerPosition()
        if (this.app.btnRulerToggle) {
            this.app.btnRulerToggle.classList.toggle('active', this.rulerVisible)
            const icon = this.app.btnRulerToggle.querySelector('svg')
            if (icon) icon.style.opacity = this.rulerVisible ? '1' : '0.4'
        }
    }

    updateJumpLinePosition() {
        if (this.app.jumpLine) {
            this.app.jumpLine.style.top = `${this.jumpOffsetPx}px`
        }
        this.updateRulerClip()
        this.updateRulerMarks()
    }

    updateRulerPosition() {
        const ruler = document.getElementById('jump-ruler')
        if (!ruler) return
        ruler.style.display = this.rulerVisible ? 'block' : 'none'

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

    scrollToNextTarget() {
        this.computeNextTarget()
        if (!this.nextTargetAnchor) return

        this.jumpHistory.push(this.app.viewer.scrollTop)
        if (this.jumpHistory.length > 50) this.jumpHistory.shift()

        const baseline = this.jumpOffsetPx
        // We need the absolute Y of the anchor again
        const pageElem = document.querySelector(`.page-container[data-page="${this.nextTargetAnchor.page}"]`)
        if (!pageElem) return
        const canvas = pageElem.querySelector('.pdf-canvas')
        const absoluteY = pageElem.offsetTop + (this.nextTargetAnchor.y * canvas.height)

        const targetScroll = absoluteY - baseline
        this.app.viewer.scrollTo({ top: targetScroll, behavior: 'smooth' })

        const beam = document.querySelector('.jump-line-beam')
        if (beam) {
            beam.classList.add('active')
            setTimeout(() => beam.classList.remove('active'), 800)
        }
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
}
