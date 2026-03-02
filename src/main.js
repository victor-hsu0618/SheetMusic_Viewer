import './style.css'
import * as pdfjsLib from 'pdfjs-dist'

// Use local worker for total offline reliability
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs'

class ScoreFlow {
  constructor() {
    this.pdf = null
    this.pages = []
    this.layers = [{ id: 'default', name: 'Performance', color: '#ff4757', visible: true }]
    this.stamps = [] // Vector storage for all stamps: { page, layerId, type, x, y, data }
    this.activeLayerId = 'default'
    this.activeStampType = 'circle'
    this.scale = 1.5

    this.initElements()
    this.initEventListeners()
    this.renderLayerUI()
    this.loadFromStorage()
    this.updateZoomDisplay()
    this.updateJumpLinePosition()
  }

  initElements() {
    this.container = document.getElementById('pdf-viewer')
    this.uploader = document.getElementById('pdf-upload')
    this.uploadBtn = document.getElementById('upload-btn')
    this.sidebar = document.getElementById('sidebar')
    this.toggleSidebarBtn = document.getElementById('toggle-sidebar')
    this.layerList = document.getElementById('layer-list')
    this.addLayerBtn = document.getElementById('add-layer-btn')
    this.stampTools = document.querySelectorAll('.stamp-tool')
    this.zoomInBtn = document.getElementById('zoom-in')
    this.zoomOutBtn = document.getElementById('zoom-out')
    this.zoomLevelDisplay = document.getElementById('zoom-level')
    this.clearStampsBtn = document.getElementById('clear-stamps-btn')
    this.nextJumpBtn = document.getElementById('next-jump')
    this.prevJumpBtn = document.getElementById('prev-jump')
    this.headerNextJumpBtn = document.getElementById('header-next-jump')
    this.headerPrevJumpBtn = document.getElementById('header-prev-jump')
    this.viewer = document.getElementById('viewer-container')
    this.jumpLine = document.getElementById('jump-line')
    this.jumpOffsetInput = document.getElementById('jump-offset')
    this.jumpOffsetValue = document.getElementById('jump-offset-value')

    // Convert 1cm to pixels (approx 96 DPI, so 1 * 37.8)
    this.jumpOffsetPx = 1 * 37.8
  }

  initEventListeners() {
    this.uploadBtn.addEventListener('click', () => this.uploader.click())
    this.uploader.addEventListener('change', (e) => this.handleUpload(e))

    this.toggleSidebarBtn.addEventListener('click', () => {
      this.sidebar.classList.toggle('open')
    })

    this.addLayerBtn.addEventListener('click', () => this.addNewLayer())

    this.zoomInBtn.addEventListener('click', () => this.changeZoom(0.1))
    this.zoomOutBtn.addEventListener('click', () => this.changeZoom(-0.1))

    this.clearStampsBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear ALL stamps across all layers?')) {
        this.stamps = []
        this.saveToStorage()
        if (this.pdf) {
          for (let i = 1; i <= this.pdf.numPages; i++) {
            this.redrawStamps(i)
          }
        }
      }
    })

    this.nextJumpBtn.addEventListener('click', () => this.jump(1))
    this.prevJumpBtn.addEventListener('click', () => this.jump(-1))
    this.headerNextJumpBtn.addEventListener('click', () => this.jump(1))
    this.headerPrevJumpBtn.addEventListener('click', () => this.jump(-1))

    this.jumpOffsetInput.addEventListener('input', (e) => {
      const cm = parseFloat(e.target.value)
      this.jumpOffsetValue.textContent = `${cm.toFixed(1)}cm`
      this.jumpOffsetPx = cm * 37.8
      this.updateJumpLinePosition()
    })

    this.stampTools.forEach(tool => {
      tool.addEventListener('click', () => {
        this.stampTools.forEach(t => t.classList.remove('active'))
        tool.classList.add('active')
        this.activeStampType = tool.dataset.stamp
      })
    })

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === '=' && e.metaKey) { e.preventDefault(); this.changeZoom(0.1); }
      if (e.key === '-' && e.metaKey) { e.preventDefault(); this.changeZoom(-0.1); }

      // Navigation shortcuts
      if (e.key === ' ' || e.key === 'ArrowDown') {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
          e.preventDefault()
          this.jump(1)
        }
      }
      if (e.key === 'ArrowUp') {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
          e.preventDefault()
          this.jump(-1)
        }
      }
    })

    // Handle responsiveness/resizing
    window.addEventListener('resize', () => {
      // Debounced resize would be better but let's keep it simple
      if (this.pdf) this.renderPDF()
    })
  }

  async handleUpload(e) {
    const file = e.target.files[0]
    if (!file) {
      console.log('No file selected')
      return
    }

    console.log(`Starting upload for: ${file.name}, size: ${file.size} bytes`)

    try {
      const reader = new FileReader()

      reader.onerror = (err) => {
        console.error('FileReader error:', err)
        alert('Error reading the file. Please try again.')
      }

      reader.onload = async (event) => {
        console.log('FileReader finished reading. Document size:', event.target.result.byteLength)
        const typedarray = new Uint8Array(event.target.result)

        try {
          const loadingTask = pdfjsLib.getDocument({
            data: typedarray,
            cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.5.207/cmaps/',
            cMapPacked: true,
          })

          this.pdf = await loadingTask.promise
          console.log(`PDF loaded successfully. Number of pages: ${this.pdf.numPages}`)
          this.renderPDF()
        } catch (pdfErr) {
          console.error('PDF.js Error:', pdfErr)
          alert('Failed to load PDF. It might be corrupted or protected.')
        }
      }

      reader.readAsArrayBuffer(file)
    } catch (err) {
      console.error('General upload error:', err)
    }
  }

  async changeZoom(delta) {
    this.scale = Math.min(Math.max(0.5, this.scale + delta), 4)
    this.updateZoomDisplay()
    if (this.pdf) await this.renderPDF()
  }

  updateZoomDisplay() {
    if (this.zoomLevelDisplay) {
      this.zoomLevelDisplay.textContent = `${Math.round(this.scale * 100)}%`
    }
  }

  async renderPDF() {
    this.container.innerHTML = ''
    this.pages = []

    for (let i = 1; i <= this.pdf.numPages; i++) {
      const page = await this.pdf.getPage(i)
      const pageWrapper = this.createPageElement(i)
      this.container.appendChild(pageWrapper)

      const canvas = pageWrapper.querySelector('.pdf-canvas')
      const context = canvas.getContext('2d')

      const viewport = page.getViewport({ scale: this.scale })
      canvas.height = viewport.height
      canvas.width = viewport.width

      await page.render({ canvasContext: context, viewport }).promise

      this.createAnnotationLayers(pageWrapper, i, viewport.width, viewport.height)
      this.redrawStamps(i)
      this.drawPageEndAnchor(i, viewport.width, viewport.height)
    }
  }

  drawPageEndAnchor(page, width, height) {
    const pageWrapper = document.querySelector(`.page-container[data-page="${page}"]`)
    // We draw the default anchor on a separate tiny overlay or the active layer?
    // Let's draw it on the active layer for simplicity, but it's "virtual"
    const activeCanvas = pageWrapper.querySelector(`.annotation-layer[data-layer-id="${this.activeLayerId}"]`)
    if (activeCanvas) {
      const ctx = activeCanvas.getContext('2d')
      this.drawStampOnCanvas(ctx, activeCanvas, { type: 'anchor', x: 0.05, y: 1.0, isDefault: true }, '#3b82f6')
    }
  }

  createPageElement(pageNum) {
    const div = document.createElement('div')
    div.className = 'page-container'
    div.dataset.page = pageNum
    div.style.width = 'fit-content'
    div.innerHTML = `<canvas class="pdf-canvas"></canvas>`
    return div
  }

  createAnnotationLayers(wrapper, pageNum, width, height) {
    this.layers.forEach(layer => {
      const canvas = document.createElement('canvas')
      canvas.className = `annotation-layer ${layer.id === this.activeLayerId ? 'active' : ''}`
      canvas.dataset.layerId = layer.id
      canvas.dataset.page = pageNum
      canvas.width = width
      canvas.height = height
      canvas.style.display = layer.visible ? 'block' : 'none'
      wrapper.appendChild(canvas)

      this.attachCanvasListeners(canvas, pageNum, layer.id)
    })
  }

  attachCanvasListeners(canvas, pageNum, layerId) {
    const handleEvent = (e) => {
      if (layerId !== this.activeLayerId) return
      if (e.type === 'touchstart') e.preventDefault()

      const rect = canvas.getBoundingClientRect()
      const clientX = e.clientX || e.touches[0].clientX
      const clientY = e.clientY || e.touches[0].clientY

      // Normalized coordinates (0 to 1) for zoom independence
      const x = (clientX - rect.left) / rect.width
      const y = (clientY - rect.top) / rect.height

      this.addStamp(pageNum, layerId, this.activeStampType, x, y)
    }

    canvas.addEventListener('mousedown', handleEvent)
    canvas.addEventListener('touchstart', handleEvent, { passive: false })
  }

  addStamp(page, layerId, type, x, y) {
    let data = null
    if (type === 'text') {
      data = prompt('Enter marker text:')
      if (!data) return
    }

    this.stamps.push({ page, layerId, type, x, y, data })
    this.saveToStorage()
    this.redrawStamps(page)
  }

  redrawStamps(page) {
    const pageWrappers = document.querySelectorAll(`.page-container[data-page="${page}"]`)
    pageWrappers.forEach(wrapper => {
      this.layers.forEach(layer => {
        const canvas = wrapper.querySelector(`.annotation-layer[data-layer-id="${layer.id}"]`)
        if (!canvas) return

        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        const layerStamps = this.stamps.filter(s => s.page === page && s.layerId === layer.id)
        layerStamps.forEach(stamp => {
          this.drawStampOnCanvas(ctx, canvas, stamp, layer.color)
        })
      })
    })
  }

  drawStampOnCanvas(ctx, canvas, stamp, color) {
    const x = stamp.x * canvas.width
    const y = stamp.y * canvas.height
    const size = 20 * (this.scale / 1.5) // Adjust size with scale

    ctx.strokeStyle = color
    ctx.fillStyle = `${color}33`
    ctx.lineWidth = 3 * (this.scale / 1.5)
    ctx.beginPath()

    switch (stamp.type) {
      case 'circle':
        ctx.arc(x, y, size, 0, Math.PI * 2)
        ctx.fill(); ctx.stroke()
        break
      case 'square':
        ctx.rect(x - size, y - size, size * 2, size * 2)
        ctx.fill(); ctx.stroke()
        break
      case 'check':
        ctx.moveTo(x - size, y)
        ctx.lineTo(x - size / 3, y + size)
        ctx.lineTo(x + size, y - size)
        ctx.stroke()
        break
      case 'text':
        ctx.font = `bold ${20 * (this.scale / 1.5)}px Outfit`
        ctx.fillStyle = color
        ctx.fillText(stamp.data, x, y)
        break
      case 'anchor':
        // Wave flag for anchor
        const isDefault = stamp.isDefault
        ctx.fillStyle = isDefault ? '#3b82f6' : color // Blue for default, layer color for user
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y - (size * 1.5))
        ctx.lineTo(x + size, y - (size * 1.1))
        ctx.lineTo(x, y - (size * 0.7))
        ctx.fill()
        ctx.stroke()
        break
      case 'dynamic':
        // Dynamic viewport anchor (semi-transparent yellow)
        ctx.fillStyle = 'rgba(255, 235, 59, 0.5)'
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.8)'
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x, y - (size * 1.5))
        ctx.lineTo(x + size, y - (size * 1.1))
        ctx.lineTo(x, y - (size * 0.7))
        ctx.fill()
        ctx.stroke()
        break
    }
  }

  jump(direction) {
    // Generate virtual "page end" anchors for all loaded pages
    const pageEndAnchors = []
    if (this.pdf) {
      for (let i = 1; i <= this.pdf.numPages; i++) {
        const pageElem = document.querySelector(`.page-container[data-page="${i}"]`)
        if (pageElem) {
          const canvas = pageElem.querySelector('.pdf-canvas')
          // Position at the very bottom of the page
          const absoluteY = pageElem.offsetTop + canvas.height
          pageEndAnchors.push({ page: i, type: 'anchor', y: 1, absoluteY, isDefault: true })
        }
      }
    }

    const userAnchors = this.stamps
      .filter(s => s.type === 'anchor')
      .map(s => {
        const pageElem = document.querySelector(`.page-container[data-page="${s.page}"]`)
        if (!pageElem) return null
        const canvas = pageElem.querySelector('.pdf-canvas')
        const absoluteY = pageElem.offsetTop + (s.y * canvas.height)
        return { ...s, absoluteY, isDefault: false }
      })
      .filter(a => a !== null)

    const allAnchors = [...pageEndAnchors, ...userAnchors]
      .sort((a, b) => a.absoluteY - b.absoluteY)

    const currentScroll = this.viewer.scrollTop
    const currentFocusY = currentScroll + this.jumpOffsetPx
    const viewportHeight = this.viewer.clientHeight

    let target = null

    if (direction === 1) {
      target = allAnchors.find(a => a.absoluteY > currentFocusY + 10)

      // If no anchor found ahead, create a dynamic one at the bottom of the viewport
      if (!target) {
        const dynamicY = currentScroll + viewportHeight - 50 // 50px safety margin
        target = { absoluteY: dynamicY, type: 'dynamic', isDynamic: true }
        this.showDynamicIndicator(dynamicY)
      }
    } else {
      target = [...allAnchors].reverse().find(a => a.absoluteY < currentFocusY - 10)
    }

    if (target) {
      const targetScroll = target.absoluteY - this.jumpOffsetPx
      this.viewer.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: 'smooth'
      })
    }
  }

  showDynamicIndicator(absoluteY) {
    // Briefly show where we jumped to if it was a dynamic jump
    const indicator = document.createElement('div')
    indicator.className = 'dynamic-jump-indicator'
    indicator.style.top = `${absoluteY}px`
    this.viewer.appendChild(indicator)
    setTimeout(() => indicator.remove(), 1000)
  }

  updateJumpLinePosition() {
    if (this.jumpLine) {
      // The viewer-container starts below the header (64px)
      // The jump line is fixed, so we calculate its top relative to the header
      const headerHeight = 64
      this.jumpLine.style.top = `${headerHeight + this.jumpOffsetPx}px`
    }
  }

  saveToStorage() {
    localStorage.setItem('scoreflow_layers', JSON.stringify(this.layers))
    localStorage.setItem('scoreflow_stamps', JSON.stringify(this.stamps))
  }

  loadFromStorage() {
    const layers = localStorage.getItem('scoreflow_layers')
    const stamps = localStorage.getItem('scoreflow_stamps')
    if (layers) this.layers = JSON.parse(layers)
    if (stamps) this.stamps = JSON.parse(stamps)
    this.renderLayerUI()
  }

  addNewLayer() {
    const name = prompt('Layer Name:') || `Layer ${this.layers.length + 1}`
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ff4757']
    const color = colors[this.layers.length % colors.length]
    const id = `layer-${Date.now()}`

    this.layers.push({ id, name, color, visible: true })
    this.activeLayerId = id
    this.saveToStorage()
    this.renderLayerUI()

    if (this.pdf) this.renderPDF() // Re-render to add new canvases
  }

  renderLayerUI() {
    this.layerList.innerHTML = ''
    this.layers.forEach(layer => {
      const item = document.createElement('div')
      item.className = `layer-item ${layer.id === this.activeLayerId ? 'active' : ''}`
      item.innerHTML = `
        <div class="layer-info">
          <div class="color-dot" style="background:${layer.color}"></div>
          <span>${layer.name}</span>
        </div>
        <div class="layer-actions">
           <button class="btn-icon layer-toggle" title="Toggle Visibility">
             ${layer.visible ? '👁️' : '🙈'}
           </button>
           <button class="btn-icon layer-delete" title="Delete Layer">
             🗑️
           </button>
        </div>
      `

      item.addEventListener('click', (e) => {
        if (e.target.closest('.layer-toggle')) {
          layer.visible = !layer.visible
          this.updateLayerVisibility()
          this.renderLayerUI()
          return
        }
        if (e.target.closest('.layer-delete')) {
          if (confirm('Delete this layer and all its stamps?')) {
            this.layers = this.layers.filter(l => l.id !== layer.id)
            this.stamps = this.stamps.filter(s => s.layerId !== layer.id)
            if (this.activeLayerId === layer.id && this.layers.length > 0) {
              this.activeLayerId = this.layers[0].id
            } else if (this.layers.length === 0) {
              this.activeLayerId = null
            }
            this.saveToStorage()
            this.renderLayerUI()
            if (this.pdf) this.renderPDF()
          }
          return
        }
        this.activeLayerId = layer.id
        this.updateLayerVisibility()
        this.renderLayerUI()
      })

      this.layerList.appendChild(item)
    })
  }

  updateLayerVisibility() {
    document.querySelectorAll('.annotation-layer').forEach(canvas => {
      const layerId = canvas.dataset.layerId
      const layer = this.layers.find(l => l.id === layerId)
      if (!layer) return

      canvas.style.display = layer.visible ? 'block' : 'none'
      if (layerId === this.activeLayerId) {
        canvas.classList.add('active')
      } else {
        canvas.classList.remove('active')
      }
    })
  }
}

new ScoreFlow()
