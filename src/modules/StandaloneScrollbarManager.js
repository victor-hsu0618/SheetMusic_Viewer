import '../styles/standalone-scrollbar.css'

/**
 * StandaloneScrollbarManager
 * ──────────────────────────
 * Independent spring-back velocity scrollbar, fixed on the right edge.
 * Same UX as the one inside EditStrip but self-contained.
 */
export class StandaloneScrollbarManager {
    constructor(app) {
        this.app = app
        this.el = null
    }

    init() {
        let el = document.getElementById('sf-standalone-scrollbar')
        if (!el) {
            el = document.createElement('div')
            el.id = 'sf-standalone-scrollbar'
            document.body.appendChild(el)
        }
        this.el = el
        this._build(el)
    }

    // ── Build ──────────────────────────────────────────────────────────────────

    _build(el) {
        el.innerHTML = ''

        const upArrow = document.createElement('div')
        upArrow.className = 'sf-scrollbar-arrow sf-scrollbar-arrow-up'
        upArrow.innerHTML = `<svg viewBox="0 0 24 36" width="20" height="30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">
            <polyline points="18 12 12 6 6 12" opacity="0.4"/>
            <polyline points="18 20 12 14 6 20" opacity="0.7"/>
            <polyline points="18 28 12 22 6 28"/>
        </svg>`

        const track = document.createElement('div')
        track.className = 'sf-strip-scrollbar-track'

        const thumb = document.createElement('div')
        thumb.className = 'sf-strip-scrollbar-thumb'
        track.appendChild(thumb)

        const downArrow = document.createElement('div')
        downArrow.className = 'sf-scrollbar-arrow sf-scrollbar-arrow-down'
        downArrow.innerHTML = `<svg viewBox="0 0 24 36" width="20" height="30" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none">
            <polyline points="6 8 12 14 18 8"/>
            <polyline points="6 16 12 22 18 16" opacity="0.7"/>
            <polyline points="6 24 12 30 18 24" opacity="0.4"/>
        </svg>`

        el.appendChild(upArrow)
        el.appendChild(track)
        el.appendChild(downArrow)

        this._attachArrowListeners(upArrow, -1)
        this._attachArrowListeners(downArrow, 1)
        this._attachTrackListeners(track, thumb, upArrow, downArrow)
    }

    // ── Track drag (spring-back, velocity-based) ───────────────────────────────

    _attachTrackListeners(track, thumb, upArrow, downArrow) {
        requestAnimationFrame(() => {
            const viewer = this.app.viewer
            const trackH = track.clientHeight || 120
            const thumbH = Math.max(28, Math.round(trackH / 5))
            const centerTop = Math.round((trackH - thumbH) / 2)
            thumb.style.height = thumbH + 'px'
            thumb.style.top = centerTop + 'px'

            let dragging = false, lastClientY = 0, lastTime = 0, movedDist = 0

            const onMove = (clientY) => {
                const now = performance.now()
                const dt = Math.max(1, now - lastTime)
                const dy = clientY - lastClientY

                if (dy < -2) { upArrow.classList.add('active'); downArrow.classList.remove('active') }
                else if (dy > 2) { downArrow.classList.add('active'); upArrow.classList.remove('active') }

                const speed = Math.abs(dy) / dt
                const multiplier = Math.min(8, Math.max(1, speed * 40))
                const maxScroll = viewer.scrollHeight - viewer.clientHeight
                viewer.scrollTop = Math.max(0, Math.min(maxScroll, viewer.scrollTop - dy * multiplier))
                movedDist += Math.abs(dy)

                const maxTop = trackH - thumbH
                thumb.style.top = Math.max(0, Math.min(maxTop, centerTop + dy * 0.5)) + 'px'
                lastClientY = clientY
                lastTime = now
            }

            const stopDrag = (e) => {
                if (!dragging) return
                dragging = false
                track.releasePointerCapture(e.pointerId)
                thumb.classList.remove('grabbing')
                upArrow.classList.remove('active')
                downArrow.classList.remove('active')
                thumb.style.top = centerTop + 'px'   // spring back
            }

            // ── Pointer Events (covers mouse + touch + pen, handles out-of-window release) ──
            track.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 && e.pointerType === 'mouse') return
                e.preventDefault()
                track.setPointerCapture(e.pointerId)   // ensures pointerup fires even outside window
                dragging = true
                lastClientY = e.clientY
                movedDist = 0
                lastTime = performance.now()
                thumb.classList.add('grabbing')
            })

            track.addEventListener('pointermove', (e) => {
                if (!dragging) return
                onMove(e.clientY)
            })

            track.addEventListener('pointerup',     (e) => stopDrag(e))
            track.addEventListener('pointercancel', (e) => stopDrag(e))

            // Trackpad wheel
            let wheelTimer = null
            track.addEventListener('wheel', (e) => {
                if (e.cancelable) e.preventDefault()
                const maxScroll = viewer.scrollHeight - viewer.clientHeight
                viewer.scrollTop = Math.max(0, Math.min(maxScroll, viewer.scrollTop + e.deltaY))
                if (e.deltaY < -2) { upArrow.classList.add('active'); downArrow.classList.remove('active') }
                else if (e.deltaY > 2) { downArrow.classList.add('active'); upArrow.classList.remove('active') }
                if (wheelTimer) clearTimeout(wheelTimer)
                wheelTimer = setTimeout(() => { upArrow.classList.remove('active'); downArrow.classList.remove('active') }, 300)
            }, { passive: false })

            // Tap on track → jump to position
            track.addEventListener('click', (e) => {
                if (movedDist > 5) return
                const rect = track.getBoundingClientRect()
                const pct = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
                viewer.scrollTop = (viewer.scrollHeight - viewer.clientHeight) * pct
            })
        })
    }

    // ── Arrow buttons (short press = jump, long press = head/end) ─────────────

    _attachArrowListeners(arrow, direction) {
        let longPressTimer = null, isLongPress = false, lastTouchTime = 0
        const LONG_PRESS_MS = 600

        const startPress = (e) => {
            if (e.type === 'touchstart') lastTouchTime = Date.now()
            else if (Date.now() - lastTouchTime < 500) return
            isLongPress = false
            arrow.classList.add('active')
            if (longPressTimer) clearTimeout(longPressTimer)
            longPressTimer = setTimeout(() => {
                isLongPress = true
                if (navigator.vibrate) navigator.vibrate(10)
                this.app.viewer.scrollTop = direction === -1 ? 0 : this.app.viewer.scrollHeight
                setTimeout(() => arrow.classList.remove('active'), 200)
            }, LONG_PRESS_MS)
        }

        const endPress = (e) => {
            if (e.type === 'touchend') lastTouchTime = Date.now()
            else if (Date.now() - lastTouchTime < 500) return
            if (e.cancelable) e.preventDefault()
            e.stopPropagation()
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
            if (!isLongPress) {
                const success = this.app.jump(direction)
                arrow.classList.add(success === false ? 'limit' : 'active')
                setTimeout(() => arrow.classList.remove('active', 'limit'), 400)
            } else {
                arrow.classList.remove('active')
            }
        }

        arrow.addEventListener('mousedown',  (e) => { e.stopPropagation(); startPress(e) })
        arrow.addEventListener('touchstart', (e) => { e.stopPropagation(); startPress(e) }, { passive: true })
        arrow.addEventListener('mouseup',    (e) => { e.stopPropagation(); endPress(e) })
        arrow.addEventListener('touchend',   (e) => { e.stopPropagation(); endPress(e) }, { passive: false })
        arrow.addEventListener('mouseleave', () => {
            if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null }
            arrow.classList.remove('active')
        })
        arrow.addEventListener('click', (e) => e.stopPropagation())
    }
}
