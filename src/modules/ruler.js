export class RulerManager {
    constructor(app) {
        this.app = app
        this.rulerVisible = localStorage.getItem('scoreflow_ruler_visible') !== 'false'
        this.jumpOffsetPx = 40
        const storedSpeed = localStorage.getItem('scoreflow_jump_speed_ms')
        this.jumpDurationMs = storedSpeed ? parseInt(storedSpeed) : 300 // Customizable speed (lower = faster)
        this.nextTargetAnchor = null
        this.jumpHistory = []
        this._isJumping = false
        this._expectedTargetY = null
        this._jumpTimer = null
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

        // Use cached metrics for much faster mask generation
        const metrics = this.app.viewerManager._pageMetrics
        Object.keys(metrics).forEach(pageNum => {
            const m = metrics[pageNum]
            const topY = m.top - this.app.viewer.scrollTop
            const bottomY = topY + m.height

            if (bottomY <= 0 || topY >= vh) return
            const visibleTop = Math.max(0, topY)
            const visibleBottom = Math.min(vh, bottomY)
            stops.push(`transparent ${visibleTop}px`, `black ${visibleTop}px`, `black ${visibleBottom}px`, `transparent ${visibleBottom}px`)
        })

        const mask = `linear-gradient(to bottom, ${stops.join(', ')})`
        ruler.style.maskImage = mask
        ruler.style.webkitMaskImage = mask
    }

    computeNextTarget(baseScroll = null) {
        if (!this.app.pdf || !this.app.viewer) { this.nextTargetAnchor = null; return }

        const currentScroll = baseScroll !== null ? baseScroll : this.app.viewer.scrollTop
        const viewportHeight = this.app.viewer.clientHeight
        const viewportCenter = currentScroll + viewportHeight / 2
        const currentFocusY = currentScroll + this.jumpOffsetPx

        // Use cached metrics for faster candidate calculation
        const metrics = this.app.viewerManager._pageMetrics
        const candidates = this.app.stamps
            .filter(s => s.type === 'anchor')
            .map(s => {
                const m = metrics[s.page]
                if (!m) return null
                const absoluteY = m.top + (s.y * m.height)
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

    scrollToNextTarget(baseScroll = null) {
        this.computeNextTarget(baseScroll)
        if (!this.nextTargetAnchor) return

        const effectiveScroll = baseScroll !== null ? baseScroll : this.app.viewer.scrollTop;
        this.jumpHistory.push(effectiveScroll)
        if (this.jumpHistory.length > 50) this.jumpHistory.shift()

        const baseline = this.jumpOffsetPx
        const targetPageNum = this.nextTargetAnchor.page
        const m = this.app.viewerManager._pageMetrics[targetPageNum]
        if (!m) return
        
        // Ensure priority render for jump target
        this.app.viewerManager.ensurePageRendered(targetPageNum)

        const absoluteY = m.top + (this.nextTargetAnchor.y * m.height)

        const targetScroll = absoluteY - baseline
        this._executeJump(targetScroll)

        const beam = document.querySelector('.jump-line-beam')
        if (beam) {
            beam.classList.add('active')
            setTimeout(() => beam.classList.remove('active'), 800)
        }
    }

    _executeJump(targetScroll) {
        const maxScroll = Math.max(0, this.app.viewer.scrollHeight - this.app.viewer.clientHeight)
        const clampedTarget = Math.max(0, Math.min(targetScroll, maxScroll))

        // Prevent unnecessary jumps to identical positions
        if (Math.abs(clampedTarget - this.app.viewer.scrollTop) < 2) return;

        this._isJumping = true
        this._expectedTargetY = clampedTarget

        // Custom smooth scroll engine
        const startY = this.app.viewer.scrollTop
        const distance = clampedTarget - startY
        const startTime = performance.now()
        const duration = this.jumpDurationMs

        const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

        const animateScroll = (currentTime) => {
            const elapsed = currentTime - startTime
            const progress = Math.min(elapsed / duration, 1)
            const easeProgress = easeInOutCubic(progress)

            this.app.viewer.scrollTo({ top: startY + (distance * easeProgress) })

            if (progress < 1) {
                this._jumpTimer = requestAnimationFrame(animateScroll)
            } else {
                this._isJumping = false
                this._expectedTargetY = null
            }
        }

        if (this._jumpTimer) cancelAnimationFrame(this._jumpTimer)
        this._jumpTimer = requestAnimationFrame(animateScroll)
    }

    jump(delta) {
        // Use expected target if jumping rapidly to allow queueing/skipping
        const effectiveScroll = (this._isJumping && this._expectedTargetY !== null)
            ? this._expectedTargetY
            : this.app.viewer.scrollTop

        const maxScroll = Math.max(0, this.app.viewer.scrollHeight - this.app.viewer.clientHeight)

        if (delta > 0) {
            if (effectiveScroll >= maxScroll - 2) return; // Prevent spamming past the bottom

            this.computeNextTarget(effectiveScroll)
            if (this.nextTargetAnchor) {
                this.scrollToNextTarget(effectiveScroll)
            } else {
                // Fallback: Check for Fit to Height mode
                if (this.app.viewerManager.isFitToHeight) {
                    const metrics = this.app.viewerManager._pageMetrics
                    // Find next page from metrics
                    const nextPageNum = Object.keys(metrics)
                        .map(Number)
                        .sort((a, b) => a - b)
                        .find(n => metrics[n].top > effectiveScroll + 10)

                    if (nextPageNum) {
                        this.jumpHistory.push(effectiveScroll)
                        if (this.jumpHistory.length > 50) this.jumpHistory.shift()
                        this._executeJump(metrics[nextPageNum].top)
                    }
                } else {
                    // Fallback: Scroll down by exactly ONE viewport height
                    const viewportHeight = this.app.viewer.clientHeight
                    const targetScroll = effectiveScroll + viewportHeight
                    this.jumpHistory.push(effectiveScroll)
                    if (this.jumpHistory.length > 50) this.jumpHistory.shift()
                    this._executeJump(targetScroll)
                }
            }
        } else {
            if (this.jumpHistory.length > 0) {
                const last = this.jumpHistory.pop()
                this._executeJump(last)
            } else {
                if (effectiveScroll <= 2) return; // Prevent spamming past the top

                if (this.app.viewerManager.isFitToHeight) {
                    const metrics = this.app.viewerManager._pageMetrics
                    const prevPageNum = Object.keys(metrics)
                        .map(Number)
                        .sort((a, b) => b - a)
                        .find(n => metrics[n].top < effectiveScroll - 10)

                    if (prevPageNum) {
                        this._executeJump(metrics[prevPageNum].top)
                    }
                } else {
                    const viewportHeight = this.app.viewer.clientHeight
                    const targetScroll = effectiveScroll - viewportHeight
                    this._executeJump(targetScroll)
                }
            }
        }
    }

    updateRulerMarks() {
        this.computeNextTarget()
        const marksContainer = document.getElementById('ruler-marks')
        if (!marksContainer) return

        const visualMarks = this.app.stamps.filter(s => s.type === 'anchor' || s.type === 'measure')
        const viewportHeight = window.innerHeight
        const scrollY = this.app.viewer.scrollTop
        const metrics = this.app.viewerManager._pageMetrics

        // Optimized DOM updates: Use a document fragment or reconcile
        const fragment = document.createDocumentFragment()

        visualMarks.forEach((stamp) => {
            const m = metrics[stamp.page]
            if (m) {
                const absY = (m.top - scrollY) + (stamp.y * m.height)

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
                    fragment.appendChild(mark)
                }
            }
        })

        if (this.app.viewer && !this.nextTargetAnchor) {
            const fallbackY = this.app.viewer.clientHeight - this.jumpOffsetPx
            const fallback = document.createElement('div')
            fallback.className = 'ruler-fallback-mark'
            fallback.style.top = `${fallbackY}px`
            fragment.appendChild(fallback)
        }

        marksContainer.innerHTML = ''
        marksContainer.appendChild(fragment)
    }
}
