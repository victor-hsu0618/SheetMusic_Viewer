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
    if (e.button !== 0 && e.pointerType === 'mouse') return
    
    e.preventDefault()
    e.stopPropagation()
    
    // 確保第一時間抓取 Pointer，這對解決 iPad 第一次觸碰沒反應非常重要
    this.thumb.setPointerCapture(e.pointerId)
    this.thumb.classList.add('dragging')
    
    this._dragging = true
    this._dragStartY = e.clientY
    this._dragStartScrollTop = this.viewer.scrollTop

    const onMove = ev => {
      if (!this._dragging) return
      
      const { scrollHeight, clientHeight } = this.viewer
      const trackH = clientHeight
      const thumbH = parseFloat(this.thumb.style.height) || 40
      const maxThumbTop = trackH - thumbH
      const scrollRange = scrollHeight - clientHeight
      
      if (maxThumbTop <= 0) return

      const dy = ev.clientY - this._dragStartY
      
      // 計算新的捲動位置
      // 靈敏度調整：乘以 0.66 (減慢約 1/3)，提供更精確的手指控制感
      const SENSITIVITY = 0.66
      const scrollDelta = -(dy / maxThumbTop) * scrollRange * SENSITIVITY
      const targetTop = this._dragStartScrollTop + scrollDelta
      
      // 使用 requestAnimationFrame 來平滑化捲動，減少 iPad 上的抖動感
      if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf)
      this._scrollRaf = requestAnimationFrame(() => {
        this.viewer.scrollTop = Math.max(0, Math.min(scrollRange, targetTop))
      })
    }

    const onUp = ev => {
      this._dragging = false
      if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf)
      this.thumb.releasePointerCapture(ev.pointerId)
      this.thumb.classList.remove('dragging')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }
}
