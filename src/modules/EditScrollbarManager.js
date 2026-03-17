export class EditScrollbarManager {
  constructor(app) {
    this.app = app
    this.track = null
    this.thumb = null
    this.viewer = null
    this._dragging = false
    this._dragStartY = 0
    this._dragStartScrollTop = 0
  }

  init() {
    this.track = document.getElementById('edit-scrollbar')
    this.thumb = document.getElementById('edit-scrollbar-thumb')
    this.viewer = this.app.viewer  // #viewer-container

    if (!this.track || !this.thumb || !this.viewer) return

    this.viewer.addEventListener('scroll', () => this.syncThumb(), { passive: true })
    window.addEventListener('resize', () => this.syncThumb(), { passive: true })
    // Catches PDF render / zoom changes that alter scrollHeight
    new ResizeObserver(() => this.syncThumb()).observe(this.viewer)

    this.thumb.addEventListener('pointerdown', e => this._onThumbDown(e))

    this.track.addEventListener('pointerdown', e => {
      if (e.target === this.thumb) return
      e.preventDefault()
      const rect = this.track.getBoundingClientRect()
      const ratio = 1 - ((e.clientY - rect.top) / rect.height)
      this.viewer.scrollTop = ratio * (this.viewer.scrollHeight - this.viewer.clientHeight)
    })

    this.syncThumb()
  }

  syncThumb() {
    if (!this.thumb || !this.viewer) return
    const { scrollTop, scrollHeight, clientHeight } = this.viewer
    if (scrollHeight <= clientHeight) {
      this.thumb.style.display = 'none'
      return
    }
    this.thumb.style.display = ''
    const trackH = clientHeight
    const thumbH = Math.max(40, trackH * (clientHeight / scrollHeight))
    const maxThumbTop = trackH - thumbH
    const thumbTop = maxThumbTop - (scrollTop / (scrollHeight - clientHeight)) * maxThumbTop
    this.thumb.style.height = `${thumbH}px`
    this.thumb.style.top = `${thumbTop}px`
  }

  _onThumbDown(e) {
    e.preventDefault()
    e.stopPropagation()
    this.thumb.setPointerCapture(e.pointerId)
    this.thumb.classList.add('dragging')
    this._dragging = true
    this._dragStartY = e.clientY
    this._dragStartScrollTop = this.viewer.scrollTop

    const onMove = ev => {
      if (!this._dragging) return
      const { scrollHeight, clientHeight } = this.viewer
      const thumbH = parseFloat(this.thumb.style.height) || 40
      const trackH = clientHeight
      const maxThumbTop = trackH - thumbH
      const scrollRange = scrollHeight - clientHeight
      const dy = ev.clientY - this._dragStartY
      const scrollDelta = -(dy / maxThumbTop) * scrollRange
      this.viewer.scrollTop = Math.max(0, Math.min(scrollRange, this._dragStartScrollTop + scrollDelta))
    }

    const onUp = () => {
      this._dragging = false
      this.thumb.classList.remove('dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
}
