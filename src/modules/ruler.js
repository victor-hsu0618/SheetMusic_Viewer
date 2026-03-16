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
            const viewerRect = this.app.viewer ? this.app.viewer.getBoundingClientRect() : { top: 0 }
            const viewerOffset = viewerRect.top
            this.app.jumpLine.style.top = `${this.jumpOffsetPx + viewerOffset}px`
        }
        this.updateRulerClip()
        this.updateRulerMarks()
    }

    updateRulerPosition() {
        this._cachedViewerOffset = undefined  // invalidate on zoom/resize
        const ruler = document.getElementById('jump-ruler')
        if (!ruler) return
        
        // Don't show if no PDF or Welcome Screen is active
        const welcomeActive = !document.querySelector('.welcome-screen').classList.contains('hidden')
        if (!this.app.pdf || welcomeActive) {
            ruler.style.display = 'none'
            return
        }

        // Manage both the hidden CSS class (controls children visibility) and display.
        if (this.rulerVisible) {
            ruler.classList.remove('hidden')
            ruler.style.display = 'block'
        } else {
            ruler.classList.add('hidden')
            ruler.style.display = ''
            return  // no need to reposition when not visible
        }

        const firstPage = document.querySelector('.page-container')
        if (!firstPage) return
        const pageRect = firstPage.getBoundingClientRect()
        const rawLeft = Math.floor(pageRect.left)
        let rulerLeft = Math.max(0, rawLeft)
        // When page is narrower than viewport and starts at x=0, center the ruler
        if (rawLeft === 0 && window.innerWidth > pageRect.width) {
            rulerLeft = Math.floor((window.innerWidth - pageRect.width) / 2)
        }

        // Track and marks sit on the left edge of the PDF page (uses white PDF background
        // for the backdrop-filter blur — keep at rulerLeft, not rulerLeft-rulerW).
        const track = ruler.querySelector('.ruler-track')
        const marksContainer = document.getElementById('ruler-marks')
        if (track) track.style.left = `${rulerLeft}px`
        if (marksContainer) marksContainer.style.left = `${rulerLeft}px`

        const beam = ruler.querySelector('.jump-line-beam')
        const indicator = ruler.querySelector('.jump-line-indicator')

        if (beam) {
            // Beam spans the visible portion of the page (clamped to viewport)
            beam.style.left = `${rulerLeft}px`
            const safeWidth = Math.floor(Math.min(pageRect.right, window.innerWidth) - rulerLeft)
            beam.style.width = `${Math.max(0, safeWidth)}px`
        }

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

        const currentScroll = this.app.viewer.scrollTop
        const viewportHeight = this.app.viewer.clientHeight
        const viewportCenter = currentScroll + viewportHeight / 2
        // baseline is the vertical point in the viewer we want to focus on
        const currentFocusY = currentScroll + this.jumpOffsetPx

        const visualMarks = this.app.stamps.filter(s => s.type === 'anchor')
        const metrics = this.app.viewerManager._pageMetrics
        if (!metrics) { this.nextTargetAnchor = null; return }

        const candidates = visualMarks.filter(stamp => {
            const m = metrics[stamp.page]
            if (!m) return false
            const absY = m.top + (stamp.y * m.height)
            return absY > currentFocusY + 2
        })
        
        candidates.sort((a, b) => {
            const ma = metrics[a.page]
            const mb = metrics[b.page]
            const ay = ma.top + (a.y * ma.height)
            const by = mb.top + (b.y * mb.height)
            if (a.page !== b.page) return a.page - b.page
            return ay - by
        })

        this.nextTargetAnchor = candidates[0] || null
    }

    scrollToNextTarget() {
        if (!this.nextTargetAnchor || !this.app.viewer) return

        const currentScroll = this.app.viewer.scrollTop
        const effectiveScroll = currentScroll
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

    stopJump() {
        this._isJumping = false;
        if (this._jumpTimer) {
            cancelAnimationFrame(this._jumpTimer);
            this._jumpTimer = null;
        }
        this._expectedTargetY = null;
    }

    _executeJump(targetScroll) {
        const maxScroll = Math.max(0, this.app.viewer.scrollHeight - this.app.viewer.clientHeight)
        const clampedTarget = Math.max(0, Math.min(targetScroll, maxScroll))

        // Prevent unnecessary jumps to identical positions
        if (Math.abs(clampedTarget - this.app.viewer.scrollTop) < 2) return;

        this.stopJump();

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

        this._jumpTimer = requestAnimationFrame(animateScroll)
    }

    jump(delta) {
        // Use expected target if jumping rapidly to allow queueing/skipping
        const effectiveScroll = (this._isJumping && this._expectedTargetY !== null)
            ? this._expectedTargetY
            : this.app.viewer.scrollTop

        const maxScroll = Math.max(0, this.app.viewer.scrollHeight - this.app.viewer.clientHeight)

        if (delta > 0) {
            if (effectiveScroll >= maxScroll - 2) return false; // Prevent spamming past the bottom

            this.computeNextTarget(effectiveScroll)
            if (this.nextTargetAnchor) {
                this.scrollToNextTarget(effectiveScroll)
            } else {
                const metrics = this.app.viewerManager._pageMetrics
                const viewportHeight = this.app.viewer.clientHeight

                // In fit-to-height mode, skip system stamps and jump by page
                if (this.app.viewerManager.isFitToHeight) {
                    const nextPageNum = Object.keys(metrics)
                        .map(Number)
                        .sort((a, b) => a - b)
                        .find(n => metrics[n].top > effectiveScroll + 10)
                    if (nextPageNum) {
                        this.jumpHistory.push(effectiveScroll)
                        if (this.jumpHistory.length > 50) this.jumpHistory.shift()
                        this._executeJump(metrics[nextPageNum].top)
                    }
                    return true
                }

                // Sort all system stamps by absolute Y position
                const systemStamps = this.app.stamps
                    .filter(s => s.type === 'system' && !s.deleted)
                    .sort((a, b) => {
                        const ma = metrics[a.page], mb = metrics[b.page]
                        return (ma?.top + a.y * ma?.height) - (mb?.top + b.y * mb?.height)
                    })

                // Primary: jump so the Nth-from-last visible system lands at the jump line
                const overlap = this.app.systemJumpOverlap ?? 1
                const visibleSystems = systemStamps.filter(sys => {
                    const m = metrics[sys.page]
                    if (!m) return false
                    const absY = m.top + sys.y * m.height
                    return absY > effectiveScroll && absY < effectiveScroll + viewportHeight
                })
                const overlapSystem = visibleSystems[Math.max(0, visibleSystems.length - overlap)]
                if (overlapSystem) {
                    const m = metrics[overlapSystem.page]
                    const targetY = m.top + overlapSystem.y * m.height
                    if (targetY > effectiveScroll + this.jumpOffsetPx + 10) {
                        this.jumpHistory.push(effectiveScroll)
                        if (this.jumpHistory.length > 50) this.jumpHistory.shift()
                        this._executeJump(targetY - this.jumpOffsetPx)
                        return true
                    }
                }

                // Secondary: next system after the jump line
                const nextSystem = systemStamps.find(sys => {
                    const m = metrics[sys.page]
                    if (!m) return false
                    return m.top + sys.y * m.height > effectiveScroll + this.jumpOffsetPx + 2
                })
                if (nextSystem) {
                    const m = metrics[nextSystem.page]
                    this.jumpHistory.push(effectiveScroll)
                    if (this.jumpHistory.length > 50) this.jumpHistory.shift()
                    this._executeJump(m.top + nextSystem.y * m.height - this.jumpOffsetPx)
                    return true
                }

                // Fallback: scroll by one viewport minus jump offset for symmetric navigation
                const targetScroll = effectiveScroll + (viewportHeight - this.jumpOffsetPx)
                this.jumpHistory.push(effectiveScroll)
                if (this.jumpHistory.length > 50) this.jumpHistory.shift()
                this._executeJump(targetScroll)
            }
            return true;
        } else {
            if (this.jumpHistory.length > 0) {
                const last = this.jumpHistory.pop()
                this._executeJump(last)
                return true;
            } else {
                if (effectiveScroll <= 2) return false; // Prevent spamming past the top

                if (this.app.viewerManager.isFitToHeight) {
                    const metrics = this.app.viewerManager._pageMetrics
                    const prevPageNum = Object.keys(metrics)
                        .map(Number)
                        .sort((a, b) => b - a)
                        .find(n => metrics[n].top < effectiveScroll - 10)

                    if (prevPageNum) {
                        this._executeJump(metrics[prevPageNum].top)
                        return true;
                    }
                } else {
                    const viewportHeight = this.app.viewer.clientHeight
                    const targetScroll = effectiveScroll - (viewportHeight - this.jumpOffsetPx)
                    this._executeJump(targetScroll)
                    return true;
                }
                return false;
            }
        }
    }

    _startMeasureDrag(e, stamp, markEl) {
        if (e.cancelable) e.preventDefault()
        e.stopPropagation()

        const metrics = this.app.viewerManager._pageMetrics
        const viewerOffset = this.app.viewer.getBoundingClientRect().top
        const startClientY = e.touches ? e.touches[0].clientY : e.clientY
        const startTop = parseFloat(markEl.style.top)

        markEl.classList.add('dragging')

        const onMove = (ev) => {
            const clientY = ev.touches ? ev.touches[0].clientY : ev.clientY
            markEl.style.top = `${startTop + (clientY - startClientY)}px`
        }

        const onEnd = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('touchmove', onMove)
            window.removeEventListener('mouseup', onEnd)
            window.removeEventListener('touchend', onEnd)
            markEl.classList.remove('dragging')

            // Convert final screen Y back to absolute scroll-space Y
            const absY = parseFloat(markEl.style.top) - viewerOffset + this.app.viewer.scrollTop

            // Find which page this Y falls on
            let newPage = stamp.page
            let newY = stamp.y
            for (const [pageNum, m] of Object.entries(metrics)) {
                if (absY >= m.top && absY < m.top + m.height) {
                    newPage = parseInt(pageNum)
                    newY = Math.max(0, Math.min(1, (absY - m.top) / m.height))
                    break
                }
            }

            stamp.page = newPage
            stamp.y = newY
            stamp.updatedAt = Date.now()
            this.app.saveToStorage(true)
            this.app.redrawAllAnnotationLayers()
            this.updateRulerMarks()
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('touchmove', onMove, { passive: false })
        window.addEventListener('mouseup', onEnd)
        window.addEventListener('touchend', onEnd)
    }

    updateRulerMarks() {
        this.computeNextTarget()
        const marksContainer = document.getElementById('ruler-marks')
        if (!marksContainer) return

        const visualMarks = this.app.stamps.filter(s =>
            s.type === 'anchor' || s.type === 'measure' || s.type === 'measure-free' ||
            (s.type === 'system' && this.app.showSystemStamps)
        )
        const viewportHeight = window.innerHeight
        const scrollY = this.app.viewer.scrollTop
        const metrics = this.app.viewerManager._pageMetrics

        // Compute which system stamp is the next jump target (mirrors jump() logic)
        let nextSystemTarget = null
        const vH = this.app.viewer?.clientHeight ?? window.innerHeight
        const sortedSystems = this.app.stamps
            .filter(s => s.type === 'system' && !s.deleted)
            .sort((a, b) => {
                const ma = metrics[a.page], mb = metrics[b.page]
                return (ma?.top + a.y * ma?.height) - (mb?.top + b.y * mb?.height)
            })
        if (sortedSystems.length) {
            const overlap = this.app.systemJumpOverlap ?? 1
            const visibleSystems = sortedSystems.filter(sys => {
                const m = metrics[sys.page]
                if (!m) return false
                const absY = m.top + sys.y * m.height
                return absY > scrollY && absY < scrollY + vH
            })
            const candidate = visibleSystems[Math.max(0, visibleSystems.length - overlap)]
            if (candidate) {
                const m = metrics[candidate.page]
                if (m && m.top + candidate.y * m.height > scrollY + this.jumpOffsetPx + 10) {
                    nextSystemTarget = candidate
                }
            }
            if (!nextSystemTarget) {
                nextSystemTarget = sortedSystems.find(sys => {
                    const m = metrics[sys.page]
                    return m && m.top + sys.y * m.height > scrollY + this.jumpOffsetPx + 2
                }) ?? null
            }
        }

        // viewerOffset = viewer's top in viewport — stable during scroll, only changes on resize/zoom
        if (this._cachedViewerOffset === undefined) {
            this._cachedViewerOffset = this.app.viewer ? this.app.viewer.getBoundingClientRect().top : 0
        }
        const viewerOffset = this._cachedViewerOffset
        const fragment = document.createDocumentFragment()

        visualMarks.forEach((stamp) => {
            const m = metrics[stamp.page]
            if (m) {
                const absY = (m.top - scrollY) + (stamp.y * m.height) + viewerOffset

                if (absY > -200 && absY < viewportHeight + 200) {
                    const mark = document.createElement('div')
                    if (stamp.type === 'anchor') {
                        const isNextTarget = stamp === this.nextTargetAnchor
                        mark.className = isNextTarget ? 'ruler-anchor-mark ruler-next-target' : 'ruler-anchor-mark'
                    } else if (stamp.type === 'measure' || stamp.type === 'measure-free') {
                        mark.className = 'ruler-measure-mark'
                        mark.textContent = stamp.data
                        mark.style.pointerEvents = 'auto'
                        mark.style.cursor = 'ns-resize'
                        mark.addEventListener('mousedown', (e) => this._startMeasureDrag(e, stamp, mark))
                    } else if (stamp.type === 'system') {
                        mark.className = stamp === nextSystemTarget
                            ? 'ruler-system-mark ruler-system-next-target'
                            : 'ruler-system-mark'
                    }
                    mark.style.top = `${absY}px`
                    fragment.appendChild(mark)
                }
            }
        })

        if (this.app.viewer && !this.nextTargetAnchor) {
            const fallbackY = this.jumpOffsetPx + viewerOffset
            const fallback = document.createElement('div')
            fallback.className = 'ruler-fallback-mark'
            fallback.style.top = `${fallbackY}px`
            fragment.appendChild(fallback)
        }

        marksContainer.innerHTML = ''
        marksContainer.appendChild(fragment)
    }
}
