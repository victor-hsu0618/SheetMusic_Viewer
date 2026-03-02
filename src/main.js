import './style.css'
import * as pdfjsLib from 'pdfjs-dist'

// Use local worker for total offline reliability
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs'

class ScoreFlow {
  constructor() {
    this.pdf = null
    this.pages = []
    // Professional Layer Presets
    this.layers = [
      { id: 'draw', name: 'Draw Objects', color: '#ff4757', visible: true, type: 'draw' },
      { id: 'fingering', name: 'Fingering', color: '#3b82f6', visible: true, type: 'fingering' },
      { id: 'articulation', name: 'Articulations', color: '#10b981', visible: true, type: 'articulation' },
      { id: 'performance', name: 'Performance', color: '#f59e0b', visible: true, type: 'performance' },
      { id: 'other', name: 'Other (Layout)', color: '#64748b', visible: true, type: 'other' }
    ]
    this.stamps = []
    this.activeLayerId = 'draw'
    this.activeStampType = 'pen'
    this.activeCategory = 'draw'
    this.scale = 1.5
    this.isSidebarLocked = false

    this.initToolsets()
    this.initElements()
    this.initEventListeners()
    this.initDraggable()
    this.renderLayerUI()
    this.updateActiveTools()
    this.loadFromStorage()
    this.updateZoomDisplay()
    this.updateJumpLinePosition()
  }

  initToolsets() {
    this.toolsets = [
      {
        name: 'Pens',
        type: 'draw',
        tools: [
          { id: 'pen', label: 'Pen', icon: '<path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l5 2" /><path d="M2 2l2 5" />' },
          { id: 'highlighter', label: 'Highlighter', icon: '<rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="12" x2="20" y2="12" stroke-width="4" opacity="0.5" />' },
          { id: 'line', label: 'Line', icon: '<line x1="4" y1="20" x2="20" y2="4" stroke-width="2" />' },
          { id: 'eraser', label: 'Eraser', icon: '<path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z" /><path d="M17 17L7 7" />' }
        ]
      },
      {
        name: 'Fingering',
        type: 'fingering',
        tools: [
          { id: 'f0', label: '0', icon: '<text x="8" y="18" font-family="Outfit" font-weight="bold">0</text>' },
          { id: 'f1', label: '1', icon: '<text x="8" y="18" font-family="Outfit" font-weight="bold">1</text>' },
          { id: 'f2', label: '2', icon: '<text x="8" y="18" font-family="Outfit" font-weight="bold">2</text>' },
          { id: 'f3', label: '3', icon: '<text x="8" y="18" font-family="Outfit" font-weight="bold">3</text>' },
          { id: 'f4', label: '4', icon: '<text x="8" y="18" font-family="Outfit" font-weight="bold">4</text>' },
          { id: 'f5', label: '5', icon: '<text x="8" y="18" font-family="Outfit" font-weight="bold">5</text>' },
          { id: 'thumb', label: 'Thumb', icon: '<circle cx="12" cy="12" r="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="12" y1="6" x2="12" y2="18" />' }
        ]
      },
      {
        name: 'Articulation',
        type: 'articulation',
        tools: [
          { id: 'accent', label: 'Accent', icon: '<path d="M7 8l10 4-10 4" />' },
          { id: 'staccato', label: 'Staccato', icon: '<circle cx="12" cy="12" r="2" fill="currentColor" />' },
          { id: 'tenuto', label: 'Tenuto', icon: '<line x1="6" y1="12" x2="18" y2="12" stroke-width="3" />' },
          { id: 'fermata', label: 'Fermata', icon: '<path d="M6 16a6 6 0 0 1 12 0" /><circle cx="12" cy="13" r="1.5" fill="currentColor" />' }
        ]
      },
      {
        name: 'Tempo',
        type: 'performance',
        tools: [
          { id: 'tempo-quarter', label: 'q=', icon: '<path d="M10 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM12 16V4" />' },
          { id: 'tempo-text', label: 'Tempo', icon: '<text x="2" y="16" font-size="10" font-weight="bold">Tempo</text>' },
          { id: 'rit', label: 'rit.', icon: '<text x="4" y="16" font-size="10">rit.</text>' },
          { id: 'accel', label: 'accel.', icon: '<text x="2" y="16" font-size="9">accel.</text>' }
        ]
      },
      {
        name: 'Text',
        type: 'performance',
        tools: [
          { id: 'text', label: 'Exp.', icon: '<text x="6" y="18" font-family="Outfit" font-weight="bold">T</text>' },
          { id: 'forte', label: 'f', icon: '<path d="M12 4v16M8 8h8" />' },
          { id: 'piano', label: 'p', icon: '<circle cx="10" cy="10" r="4" /><path d="M10 6v12" />' }
        ]
      },
      {
        name: 'Layout',
        type: 'other',
        tools: [
          { id: 'system-break', label: 'Break', icon: '<path d="M4 4h16M4 20h16M8 4v16M16 4v16M4 12l4-4 4 4-4 4-4-4z" />' },
          { id: 'page-break', label: 'Page', icon: '<path d="M4 18h16M4 6h16M12 6v12" /><path d="M8 10l4 4 4-4" />' }
        ]
      },
      {
        name: 'Anchor',
        type: 'other',
        tools: [
          { id: 'anchor', label: 'Anchor', icon: '<path d="M12 2v20M5 12h14" stroke-width="2"/><circle cx="12" cy="12" r="4"/>' }
        ]
      }
    ]
  }

  initElements() {
    this.container = document.getElementById('pdf-viewer')
    this.uploader = document.getElementById('pdf-upload')
    this.uploadBtn = document.getElementById('upload-btn')
    this.sidebar = document.getElementById('sidebar')
    this.sidebarTrigger = document.getElementById('sidebar-trigger')
    this.layerList = document.getElementById('layer-list')
    this.addLayerBtn = document.getElementById('add-layer-btn')
    this.zoomInBtn = document.getElementById('zoom-in')
    this.zoomOutBtn = document.getElementById('zoom-out')
    this.zoomLevelDisplay = document.getElementById('zoom-level')
    this.clearStampsBtn = document.getElementById('clear-stamps-btn')
    this.lockSidebarBtn = document.getElementById('lock-sidebar')
    this.shortcutsModal = document.getElementById('shortcuts-modal')
    this.closeShortcutsBtn = document.getElementById('close-shortcuts')

    this.jumpOffsetPx = 1 * 37.8
  }

  initEventListeners() {
    this.uploadBtn.addEventListener('click', () => this.uploader.click())
    this.uploader.addEventListener('change', (e) => this.handleUpload(e))

    this.sidebarTrigger.addEventListener('mouseenter', () => {
      this.sidebar.classList.add('open')
    })

    this.sidebar.addEventListener('mouseleave', () => {
      if (!this.isSidebarLocked) {
        this.sidebar.classList.remove('open')
      }
    })

    if (this.lockSidebarBtn) {
      this.lockSidebarBtn.addEventListener('click', () => {
        this.isSidebarLocked = !this.isSidebarLocked
        this.lockSidebarBtn.classList.toggle('locked', this.isSidebarLocked)
      })
    }

    if (this.closeShortcutsBtn) {
      this.closeShortcutsBtn.addEventListener('click', () => this.toggleShortcuts(false))
    }

    if (this.shortcutsModal) {
      this.shortcutsModal.addEventListener('click', (e) => {
        if (e.target === this.shortcutsModal) this.toggleShortcuts(false)
      })
    }

    if (this.closeSidebarBtn) {
      this.closeSidebarBtn.addEventListener('click', () => {
        this.sidebar.classList.remove('open')
      })
    }

    if (this.addLayerBtn) {
      this.addLayerBtn.addEventListener('click', () => this.addNewLayer())
    }

    if (this.zoomInBtn) this.zoomInBtn.addEventListener('click', () => this.changeZoom(0.1))
    if (this.zoomOutBtn) this.zoomOutBtn.addEventListener('click', () => this.changeZoom(-0.1))

    if (this.clearStampsBtn) {
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
    }


    if (this.jumpOffsetInput) {
      this.jumpOffsetInput.addEventListener('input', (e) => {
        const cm = parseFloat(e.target.value)
        if (this.jumpOffsetValue) this.jumpOffsetValue.textContent = `${cm.toFixed(1)}cm`
        this.jumpOffsetPx = cm * 37.8
        this.updateJumpLinePosition()
      })
    }

    // Viewer Event Delegation for Stamping (Reliable Fix)
    this.viewer.addEventListener('click', (e) => {
      const pageWrapper = e.target.closest('.page-container')
      if (!pageWrapper) return

      const pageNum = parseInt(pageWrapper.dataset.page)
      const rect = pageWrapper.getBoundingClientRect()

      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height

      this.addStamp(pageNum, this.activeStampType, x, y)
    })

    // No static stampTools anymore, they are dynamic

    // Keyboard Actions
    window.addEventListener('keydown', (e) => {
      // Don't trigger if typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return

      // If modal is open, any key closes it except the shortcuts trigger
      if (this.shortcutsModal && this.shortcutsModal.classList.contains('active')) {
        if (e.key !== '?' && e.key.toLowerCase() !== 'h') {
          this.toggleShortcuts(false)
          return
        }
      }

      // Help Overlay
      if (e.key === '?' || e.key.toLowerCase() === 'h') {
        this.toggleShortcuts()
      }

      // Sidebar Toggle
      if (e.key.toLowerCase() === 's') {
        this.sidebar.classList.toggle('open')
      }

      // Esc to close all
      if (e.key === 'Escape') {
        this.toggleShortcuts(false)
        this.sidebar.classList.remove('open')
      }

      // Zoom
      if (e.key === '=' || e.key === '+') {
        this.changeZoom(0.1)
      }
      if (e.key === '-') {
        this.changeZoom(-0.1)
      }

      // Musical Flow (Standardized J/K and Space)
      if (e.key === ' ' || e.key.toLowerCase() === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        if (e.shiftKey && e.key === ' ') {
          this.jump(-1)
        } else {
          this.jump(1)
        }
      }
      if (e.key.toLowerCase() === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        this.jump(-1)
      }
    })

    // Handle responsiveness/resizing
    window.addEventListener('resize', () => {
      // Debounced resize would be better but let's keep it simple
      if (this.pdf) this.renderPDF()
    })
  }

  toggleShortcuts(force) {
    if (!this.shortcutsModal) return
    if (force !== undefined) {
      this.shortcutsModal.classList.toggle('active', force)
    } else {
      this.shortcutsModal.classList.toggle('active')
    }
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

  createCaptureOverlay(wrapper, pageNum, width, height) {
    const overlay = document.createElement('div')
    overlay.className = 'capture-overlay'
    overlay.dataset.page = pageNum
    overlay.style.width = `${width}px`
    overlay.style.height = `${height}px`

    let isDrawing = false
    let currentPath = null

    const getPos = (e) => {
      const rect = overlay.getBoundingClientRect()
      const clientX = e.clientX || (e.touches && e.touches[0].clientX)
      const clientY = e.clientY || (e.touches && e.touches[0].clientY)
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height
      }
    }

    const startDraw = (e) => {
      // Logic to determine if we should draw or stamp
      const toolType = this.activeStampType
      const isFreehand = ['pen', 'highlighter', 'line'].includes(toolType)

      if (isFreehand) {
        if (e.type === 'touchstart') e.preventDefault()
        isDrawing = true
        const pos = getPos(e)
        currentPath = {
          type: toolType,
          page: pageNum,
          layerId: 'draw',
          points: [pos],
          color: this.layers.find(l => l.id === 'draw').color
        }
      }
    }

    const moveDraw = (e) => {
      if (!isDrawing) return
      const pos = getPos(e)

      if (this.activeStampType === 'line') {
        currentPath.points[1] = pos
      } else {
        currentPath.points.push(pos)
      }

      // Local preview drawing for performance
      const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
      if (canvas) {
        const ctx = canvas.getContext('2d')
        this.drawPathOnCanvas(ctx, canvas, currentPath)
      }
    }

    const endDraw = (e) => {
      if (isDrawing && currentPath) {
        this.stamps.push(currentPath)
        this.saveToStorage()
        this.redrawStamps(pageNum)
      }
      isDrawing = false
      currentPath = null
    }

    const handleClick = (e) => {
      if (['pen', 'highlighter', 'line'].includes(this.activeStampType)) return
      const pos = getPos(e)
      this.addStamp(pageNum, this.activeStampType, pos.x, pos.y)
    }

    overlay.addEventListener('mousedown', startDraw)
    overlay.addEventListener('mousemove', moveDraw)
    window.addEventListener('mouseup', endDraw) // Global to catch release outside

    overlay.addEventListener('touchstart', startDraw, { passive: false })
    overlay.addEventListener('touchmove', moveDraw, { passive: false })
    overlay.addEventListener('touchend', endDraw)

    overlay.addEventListener('click', handleClick)

    wrapper.appendChild(overlay)
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
    const canvas = document.createElement('canvas')
    canvas.className = 'annotation-layer virtual-canvas'
    canvas.dataset.page = pageNum
    canvas.width = width
    canvas.height = height
    wrapper.appendChild(canvas)
  }

  attachCanvasListeners(canvas, pageNum, layerId) {
    // Events now handled by createCaptureOverlay
  }

  addStamp(page, type, x, y) {
    if (type === 'eraser') {
      this.eraseStamp(page, x, y)
      return
    }

    // Auto-Target Layer based on toolset metadata
    let targetLayerId = 'draw' // Default

    const group = this.toolsets.find(g => g.tools.some(t => t.id === type))
    if (group) {
      // Map category type to layer ID if exists
      const layer = this.layers.find(l => l.type === group.type)
      if (layer) targetLayerId = layer.id
    }

    const layer = this.layers.find(l => l.id === targetLayerId)
    if (layer) layer.visible = true

    let data = null
    if (type === 'text' || type === 'tempo-text') {
      data = prompt('Enter text:')
      if (!data) return
    }

    this.stamps.push({ page, layerId: targetLayerId, type, x, y, data })
    this.saveToStorage()
    this.updateLayerVisibility()
    this.redrawStamps(page)
  }

  eraseStamp(page, x, y) {
    const threshold = 0.03
    const initialCount = this.stamps.length

    this.stamps = this.stamps.filter(s => {
      if (s.page !== page) return true

      if (s.points) {
        // Check distance to any point in the path
        return !s.points.some(p => Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < threshold)
      } else {
        const dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2))
        return dist > threshold
      }
    })

    if (this.stamps.length !== initialCount) {
      this.saveToStorage()
      this.redrawStamps(page)
    }
  }

  redrawStamps(page) {
    const pageWrappers = document.querySelectorAll(`.page-container[data-page="${page}"]`)
    pageWrappers.forEach(wrapper => {
      const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
      if (!canvas) return

      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      const visibleStamps = this.stamps.filter(s => {
        if (s.page !== page) return false
        const layer = this.layers.find(l => l.id === (s.layerId || 'draw'))
        return layer ? layer.visible : true
      })

      visibleStamps.forEach(stamp => {
        const layer = this.layers.find(l => l.id === (stamp.layerId || 'draw'))
        const color = layer ? layer.color : '#000000'

        if (stamp.points) {
          this.drawPathOnCanvas(ctx, canvas, stamp)
        } else {
          this.drawStampOnCanvas(ctx, canvas, stamp, color)
        }
      })
    })
  }

  drawPathOnCanvas(ctx, canvas, path) {
    if (!path.points || path.points.length < 2) return

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (path.type === 'highlighter') {
      ctx.strokeStyle = '#fde04788'
      ctx.lineWidth = 14 * (this.scale / 1.5)
    } else {
      ctx.strokeStyle = path.color || '#ff4757'
      ctx.lineWidth = (path.type === 'line' ? 2 : 3) * (this.scale / 1.5)
    }

    ctx.beginPath()
    const startX = path.points[0].x * canvas.width
    const startY = path.points[0].y * canvas.height
    ctx.moveTo(startX, startY)

    for (let i = 1; i < path.points.length; i++) {
      const px = path.points[i].x * canvas.width
      const py = path.points[i].y * canvas.height
      ctx.lineTo(px, py)
    }
    ctx.stroke()
  }

  drawStampOnCanvas(ctx, canvas, stamp, color) {
    const x = stamp.x * canvas.width
    const y = stamp.y * canvas.height
    const size = 18 * (this.scale / 1.5)

    ctx.strokeStyle = color
    ctx.fillStyle = `${color}33`
    ctx.lineWidth = 2.5 * (this.scale / 1.5)
    ctx.beginPath()

    // Professional Music Symbols & Specialized Notation
    switch (stamp.type) {
      case 'circle':
        ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break
      case 'text':
        ctx.font = `bold ${22 * (this.scale / 1.5)}px Outfit`
        ctx.fillStyle = color; ctx.fillText(stamp.data, x, y); break
      case 'accent':
        ctx.moveTo(x - size, y - size / 2); ctx.lineTo(x + size, y); ctx.lineTo(x - size, y + size / 2); ctx.stroke(); break
      case 'staccato':
        ctx.beginPath(); ctx.arc(x, y, size * 0.2, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); break
      case 'forte':
        ctx.font = `italic bold ${24 * (this.scale / 1.5)}px serif`
        ctx.fillStyle = color; ctx.fillText('f', x, y); break
      case 'piano':
        ctx.font = `italic bold ${24 * (this.scale / 1.5)}px serif`
        ctx.fillStyle = color; ctx.fillText('p', x, y); break
      case 'down-bow': // ㄇ
        ctx.moveTo(x - size * 0.6, y + size * 0.4); ctx.lineTo(x - size * 0.6, y - size * 0.6);
        ctx.lineTo(x + size * 0.6, y - size * 0.6); ctx.lineTo(x + size * 0.6, y + size * 0.4); ctx.stroke(); break
      case 'up-bow': // V
        ctx.moveTo(x - size * 0.6, y - size * 0.6); ctx.lineTo(x, y + size * 0.6); ctx.lineTo(x + size * 0.6, y - size * 0.6); ctx.stroke(); break
      case 'thumb':
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2); ctx.stroke()
        ctx.moveTo(x, y - size * 0.9); ctx.lineTo(x, y + size * 0.9);
        ctx.moveTo(x - size * 0.9, y); ctx.lineTo(x + size * 0.9, y); ctx.stroke(); break
      case 'f0': case 'f1': case 'f2': case 'f3': case 'f4':
        ctx.font = `bold ${18 * (this.scale / 1.5)}px Outfit`
        ctx.fillStyle = color; ctx.fillText(stamp.type.slice(1), x - size * 0.3, y + size * 0.3); break
      case 'i': case 'ii': case 'iii': case 'iv':
        ctx.font = `bold ${16 * (this.scale / 1.5)}px Outfit`
        ctx.fillStyle = color; ctx.fillText(stamp.type.toUpperCase(), x - size * 0.5, y + size * 0.3); break
      case 'anchor':
        const isDefault = stamp.isDefault
        ctx.fillStyle = isDefault ? '#3b82f6' : color
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - (size * 1.5));
        ctx.lineTo(x + size, y - (size * 1.1)); ctx.lineTo(x, y - (size * 0.7)); ctx.fill(); ctx.stroke(); break
      case 'dynamic':
        ctx.fillStyle = 'rgba(255, 235, 59, 0.5)'; ctx.strokeStyle = 'rgba(255, 193, 7, 0.8)';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - (size * 1.5));
        ctx.lineTo(x + size, y - (size * 1.1)); ctx.lineTo(x, y - (size * 0.7)); ctx.fill(); ctx.stroke(); break
    }
  }

  updateActiveTools() {
    this.activeToolsContainer.innerHTML = ""

    // Check if expanded or collapsed
    const isExpanded = this.activeToolsContainer.classList.contains("expanded")

    // 0. Active Tool FAB (Visible ONLY when collapsed)
    const fab = document.createElement("div")
    fab.className = "active-tool-fab"
    const activeTool = this.toolsets.flatMap(g => g.tools).find(t => t.id === this.activeStampType)
    if (activeTool) {
      fab.innerHTML = `<svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" stroke-width="2.5" fill="none">${activeTool.icon}</svg>`
    }
    this.activeToolsContainer.appendChild(fab)

    if (!isExpanded) {
      this.activeToolsContainer.onclick = () => {
        this.activeToolsContainer.classList.add("expanded")
        this.updateActiveTools()
      }
      return
    }

    // 1. Drag / Toggle Handle
    const handle = document.createElement("div")
    handle.className = "drag-handle"
    handle.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 18l-6-6 6-6" /></svg>`

    handle.onclick = (e) => {
      e.stopPropagation()
      this.activeToolsContainer.classList.remove("expanded")
      this.updateActiveTools()
    }
    this.activeToolsContainer.appendChild(handle)

    // 2. Category Switcher
    const switcher = document.createElement("div")
    switcher.className = "category-switcher"

    this.toolsets.forEach(group => {
      const catBtn = document.createElement("button")
      catBtn.className = `cat-btn ${this.activeCategory === group.type ? "active" : ""}`
      catBtn.style.width = 'auto'
      catBtn.style.padding = '0 12px'
      catBtn.style.borderRadius = '16px'
      catBtn.innerHTML = `<span style="font-size: 0.8rem; font-weight: 700;">${group.name}</span>`

      catBtn.addEventListener("click", (e) => {
        e.stopPropagation()
        this.activeCategory = group.type
        this.updateActiveTools()
      })
      switcher.appendChild(catBtn)
    })
    this.activeToolsContainer.appendChild(switcher)

    // 3. Active Tools Grid
    const activeGroup = this.toolsets.find(g => g.type === this.activeCategory)
    if (!activeGroup) return

    const grid = document.createElement("div")
    grid.className = "active-tools-grid"

    activeGroup.tools.forEach(tool => {
      const wrapper = document.createElement("div")
      wrapper.className = "stamp-tool-wrapper"

      const btn = document.createElement("button")
      btn.className = `stamp-tool ${this.activeStampType === tool.id ? "active" : ""}`
      btn.dataset.stamp = tool.id
      btn.title = tool.label
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="26" height="26" stroke="currentColor" stroke-width="2" fill="none">${tool.icon}</svg>`

      btn.addEventListener("click", (e) => {
        e.stopPropagation()
        this.activeStampType = tool.id
        // Selecting a tool NO LONGER closes the bar automatically (User habit requested)
        this.updateActiveTools()
      })

      const label = document.createElement("span")
      label.className = "stamp-label"
      label.textContent = tool.label

      wrapper.appendChild(btn)
      wrapper.appendChild(label)
      grid.appendChild(wrapper)
    })

    this.activeToolsContainer.appendChild(grid)
  }

  initDraggable() {
    let isDragging = false
    let currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0
    const el = this.activeToolsContainer

    el.addEventListener("mousedown", dragStart)
    document.addEventListener("mousemove", drag)
    document.addEventListener("mouseup", dragEnd)

    function dragStart(e) {
      if (!e.target.closest(".drag-handle")) return
      initialX = e.clientX - xOffset
      initialY = e.clientY - yOffset
      isDragging = true
    }

    function drag(e) {
      if (isDragging) {
        e.preventDefault()
        currentX = e.clientX - initialX
        currentY = e.clientY - initialY
        xOffset = currentX
        yOffset = currentY
        setTranslate(currentX, currentY, el)
      }
    }

    function dragEnd(e) {
      initialX = currentX
      initialY = currentY
      isDragging = false
    }

    function setTranslate(xPos, yPos, el) {
      // Anchored to left 40px, so we just add the offset
      el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`
    }
  }

  jump(direction) {
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
      // The header is gone, so the jump line is relative to the screen top
      this.jumpLine.style.top = `${this.jumpOffsetPx}px`
    }
  }

  saveToStorage() {
    localStorage.setItem('scoreflow_layers', JSON.stringify(this.layers))
    localStorage.setItem('scoreflow_stamps', JSON.stringify(this.stamps))
  }

  loadFromStorage() {
    const layersData = localStorage.getItem('scoreflow_layers')
    const stampsData = localStorage.getItem('scoreflow_stamps')

    // Always start with fresh core layers but attempt to restore visibility states
    const coreLayers = [...this.layers]

    if (layersData) {
      const storedLayers = JSON.parse(layersData)
      coreLayers.forEach(l => {
        const stored = storedLayers.find(sl => sl.id === l.id)
        if (stored) l.visible = stored.visible
      })
    }

    this.layers = coreLayers

    if (stampsData) {
      this.stamps = JSON.parse(stampsData)
      // Cleanup old stamps that might have invalid layerIds from previous versions
      this.stamps.forEach(s => {
        if (!this.layers.find(l => l.id === s.layerId)) {
          s.layerId = 'draw' // Fallback to Draw group
        }
      })
    }
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
      item.className = 'layer-item'
      item.innerHTML = `
        <div class="layer-info">
          <div class="color-dot" style="background:${layer.color}"></div>
          <div class="layer-meta">
            <span class="layer-name">${layer.name}</span>
            <span class="layer-type-tag">${layer.type.charAt(0).toUpperCase() + layer.type.slice(1)} Group</span>
          </div>
        </div>
        <div class="layer-actions">
           <button class="layer-vis-btn ${layer.visible ? 'visible' : 'hidden'}" title="Toggle Visibility">
             ${layer.visible ? '<span>Show</span>' : '<span>Hide</span>'}
           </button>
        </div>
      `
      item.querySelector('.layer-vis-btn').addEventListener('click', (e) => {
        e.stopPropagation()
        layer.visible = !layer.visible
        this.updateLayerVisibility()
        this.renderLayerUI()
      })
      this.layerList.appendChild(item)
    })
  }

  updateLayerVisibility() {
    this.saveToStorage()
    // In Virtual Layer mode, we just redraw everything to respect visibility states
    if (this.pdf) {
      for (let i = 1; i <= this.pdf.numPages; i++) {
        this.redrawStamps(i)
      }
    }
  }
}

new ScoreFlow()
