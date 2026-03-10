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
        this.app.jumpOffsetInput = document.getElementById('view-jump-offset')
        this.app.jumpOffsetValue = document.getElementById('view-jump-offset-value')
        this.app.btnJumpHead = document.getElementById('btn-jump-head')
        this.app.btnJumpEnd = document.getElementById('btn-jump-end')
        this.app.btnRulerToggle = document.getElementById('view-ruler-toggle')

        this.initEventListeners()
        this.updateJumpLinePosition()
        this.updateRulerPosition()

        // Sync ruler position when window is resized (score shifts to center)
        window.addEventListener('resize', () => {
            this.updateRulerPosition()
            this.updateRulerMarks()
        })
    }

    initEventListeners() {
        if (this.app.jumpOffsetInput) {
            this.app.jumpOffsetInput.addEventListener('input', (e) => {
                this.app.updateJumpOffset(parseInt(e.target.value))
            })
        }

        const handle = document.querySelector('.jump-line-handle')
        if (handle) {
            let isDraggingRuler = false

            const startDragging = (e) => {
                isDraggingRuler = true
                if (e.cancelable) e.preventDefault()
            }

            const moveDragging = (e) => {
                if (!isDraggingRuler) return
                const clientY = e.touches ? e.touches[0].clientY : e.clientY
                let newY = clientY
                if (newY < 0) newY = 0
                if (newY > window.innerHeight - 50) newY = window.innerHeight - 50
                this.app.updateJumpOffset(newY)
            }

            const stopDragging = () => {
                if (isDraggingRuler) {
                    isDraggingRuler = false
                    const beam = document.querySelector('.jump-line-beam')
                    if (beam) {
                        beam.classList.add('pulse')
                        setTimeout(() => beam.classList.remove('pulse'), 600)
                    }
                }
            }

            handle.addEventListener('mousedown', startDragging)
            handle.addEventListener('touchstart', startDragging, { passive: false })

            window.addEventListener('mousemove', moveDragging)
            window.addEventListener('touchmove', moveDragging, { passive: false })

            window.addEventListener('mouseup', stopDragging)
            window.addEventListener('touchend', stopDragging)
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
        // If layout isn't ready yet, we might get 0. Try to fallback to center calculation.
        let rulerLeft = Math.floor(pageRect.left)
        if (rulerLeft === 0 && window.innerWidth > pageRect.width) {
            rulerLeft = Math.floor((window.innerWidth - pageRect.width) / 2)
        }

        // Position internal parts within the full-width transparent overlay
        const track = ruler.querySelector('.ruler-track')
        const marksContainer = document.getElementById('ruler-marks')

        if (track) track.style.left = `${rulerLeft}px`
        if (marksContainer) marksContainer.style.left = `${rulerLeft}px`

        const beam = ruler.querySelector('.jump-line-beam')
        const indicator = ruler.querySelector('.jump-line-indicator')

        if (beam) {
            // Beam starts exactly where page starts
            beam.style.left = `${rulerLeft}px`
            // Ensure width doesn't spill past viewport right edge
            const safeWidth = Math.min(pageRect.width, window.innerWidth - pageRect.left - 1)
            beam.style.width = `${Math.floor(safeWidth)}px`
        }

        // Ensure the handle stays with the track
        if (indicator) {
            indicator.style.left = `${rulerLeft}px`
        }

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

    jump(delta) {
        if (delta > 0) {
            this.computeNextTarget()
            if (this.nextTargetAnchor) {
                this.scrollToNextTarget()
            } else {
                // Fallback: Check for Fit to Height mode
                if (this.app.viewerManager.isFitToHeight) {
                    // Find current top page and jump to next
                    const currentScroll = this.app.viewer.scrollTop
                    const pages = Array.from(document.querySelectorAll('.page-container'))
                    const nextPage = pages.find(p => p.offsetTop > currentScroll + 10)
                    if (nextPage) {
                        this.jumpHistory.push(currentScroll)
                        if (this.jumpHistory.length > 50) this.jumpHistory.shift()
                        this.app.viewer.scrollTo({ top: nextPage.offsetTop, behavior: 'smooth' })
                    }
                } else {
                    // Fallback: Scroll down by exactly ONE viewport height (as requested: 跳到下個未顯示的畫面)
                    const viewportHeight = this.app.viewer.clientHeight
                    this.jumpHistory.push(this.app.viewer.scrollTop)
                    if (this.jumpHistory.length > 50) this.jumpHistory.shift()
                    this.app.viewer.scrollBy({ top: viewportHeight, behavior: 'smooth' })
                }
            }
        } else {
            if (this.jumpHistory.length > 0) {
                const last = this.jumpHistory.pop()
                this.app.viewer.scrollTo({ top: last, behavior: 'smooth' })
            } else {
                // Fallback for backward jump
                if (this.app.viewerManager.isFitToHeight) {
                    const currentScroll = this.app.viewer.scrollTop
                    const pages = Array.from(document.querySelectorAll('.page-container')).reverse()
                    const prevPage = pages.find(p => p.offsetTop < currentScroll - 10)
                    if (prevPage) {
                        this.app.viewer.scrollTo({ top: prevPage.offsetTop, behavior: 'smooth' })
                    }
                } else {
                    const viewportHeight = this.app.viewer.clientHeight
                    this.app.viewer.scrollBy({ top: -viewportHeight, behavior: 'smooth' })
                }
            }
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
