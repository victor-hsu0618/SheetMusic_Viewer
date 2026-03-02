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
      { id: 'perf', name: 'Performance', color: '#ff4757', visible: true, type: 'general' },
      { id: 'fingering', name: 'Fingering', color: '#3b82f6', visible: true, type: 'fingering' },
      { id: 'bowing', name: 'Bowing', color: '#10b981', visible: true, type: 'bowing' },
      { id: 'personal', name: 'Personal', color: '#f59e0b', visible: true, type: 'general' }
    ]
    this.stamps = []
    this.activeLayerId = 'perf'
    this.activeStampType = 'circle'
    this.activeCategory = 'general'
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
        name: 'General',
        type: 'general',
        tools: [
          { id: 'circle', label: 'Circle', icon: '<circle cx="12" cy="12" r="10" />' },
          { id: 'text', label: 'Text', icon: '<text x="6" y="16" font-family="Arial" font-weight="bold">T</text>' },
          { id: 'accent', label: 'Accent', icon: '<path d="M7 8l10 4-10 4" />' },
          { id: 'staccato', label: 'Staccato', icon: '<circle cx="12" cy="12" r="2" fill="currentColor" />' },
          { id: 'forte', label: 'f', icon: '<path d="M12 4v16M8 8h8" />' },
          { id: 'piano', label: 'p', icon: '<circle cx="10" cy="10" r="4" /><path d="M10 6v12" />' },
          { id: 'eraser', label: 'Eraser', icon: '<path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z" /><path d="M17 17L7 7" />' },
          { id: 'anchor', label: 'Anchor', icon: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" y1="22" x2="4" y2="15" />' }
        ]
      },
      {
        name: 'Bowing',
        type: 'bowing',
        tools: [
          { id: 'down-bow', label: 'ㄇ', icon: '<path d="M6 14V6h12v8" />' },
          { id: 'up-bow', label: 'V', icon: '<path d="M6 6l6 12 6-12" />' }
        ]
      },
      {
        name: 'Fingering',
        type: 'fingering',
        tools: [
          { id: 'f0', label: '0', icon: '<text x="8" y="18">0</text>' },
          { id: 'f1', label: '1', icon: '<text x="8" y="18">1</text>' },
          { id: 'f2', label: '2', icon: '<text x="8" y="18">2</text>' },
          { id: 'f3', label: '3', icon: '<text x="8" y="18">3</text>' },
          { id: 'f4', label: '4', icon: '<text x="8" y="18">4</text>' },
          { id: 'thumb', label: 'Thumb', icon: '<circle cx="12" cy="12" r="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="12" y1="6" x2="12" y2="18" />' },
          { id: 'i', label: 'I', icon: '<text x="10" y="18">I</text>' },
          { id: 'ii', label: 'II', icon: '<text x="8" y="18">II</text>' },
          { id: 'iii', label: 'III', icon: '<text x="6" y="18">III</text>' },
          { id: 'iv', label: 'IV', icon: '<text x="6" y="18">IV</text>' }
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
    this.nextJumpBtn = document.getElementById('next-jump')
    this.prevJumpBtn = document.getElementById('prev-jump')
    this.headerNextJumpBtn = document.getElementById('header-next-jump')
    this.headerPrevJumpBtn = document.getElementById('header-prev-jump')
    this.viewer = document.getElementById('viewer-container')
    this.jumpLine = document.getElementById('jump-line')
    this.jumpOffsetInput = document.getElementById('jump-offset')
    this.jumpOffsetValue = document.getElementById('jump-offset-value')
    this.closeSidebarBtn = document.getElementById('close-sidebar')
    this.activeToolsContainer = document.getElementById('active-tools-container')
    this.layerSelector = document.getElementById('layer-selector')
    this.lockSidebarBtn = document.getElementById('lock-sidebar')

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
        // Update the lock icon logic could be here, but simpler via CSS toggle
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

    if (this.nextJumpBtn) this.nextJumpBtn.addEventListener('click', () => this.jump(1))
    if (this.prevJumpBtn) this.prevJumpBtn.addEventListener('click', () => this.jump(-1))
    if (this.headerNextJumpBtn) this.headerNextJumpBtn.addEventListener('click', () => this.jump(1))
    if (this.headerPrevJumpBtn) this.headerPrevJumpBtn.addEventListener('click', () => this.jump(-1))

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

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.key === '=' && e.metaKey) { e.preventDefault(); this.changeZoom(0.1); }
      if (e.key === '-' && e.metaKey) { e.preventDefault(); this.changeZoom(-0.1); }

      // Navigation shortcuts
      if (e.key === ' ' || e.key === 'ArrowDown' || e.key.toLowerCase() === 'j') {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
          e.preventDefault()
          if (e.shiftKey && e.key === ' ') {
            this.jump(-1)
          } else {
            this.jump(1)
          }
        }
      }
      if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'k') {
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

  createCaptureOverlay(wrapper, pageNum, width, height) {
    const overlay = document.createElement('div')
    overlay.className = 'capture-overlay'
    overlay.dataset.page = pageNum
    overlay.style.width = `${width}px`
    overlay.style.height = `${height}px`

    const handleEvent = (e) => {
      if (e.type === 'touchstart') e.preventDefault()
      const rect = overlay.getBoundingClientRect()
      const clientX = e.clientX || e.touches[0].clientX
      const clientY = e.clientY || e.touches[0].clientY
      const x = (clientX - rect.left) / rect.width
      const y = (clientY - rect.top) / rect.height
      this.addStamp(pageNum, this.activeStampType, x, y)
    }

    overlay.addEventListener('click', handleEvent)
    overlay.addEventListener('touchstart', handleEvent, { passive: false })
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

    // Auto-Target Layer based on tool type
    let targetLayerId = this.activeLayerId // Default to currently selected general layer

    if (this.toolsets.find(group => group.type === 'bowing').tools.some(t => t.id === type)) {
      targetLayerId = 'bowing'
    } else if (this.toolsets.find(group => group.type === 'fingering').tools.some(t => t.id === type)) {
      targetLayerId = 'fingering'
    }

    // Ensure the target layer exists and is visible (optionally auto-show it)
    const layer = this.layers.find(l => l.id === targetLayerId)
    if (layer) layer.visible = true

    let data = null
    if (type === 'text') {
      data = prompt('Enter marker text:')
      if (!data) return
    }

    this.stamps.push({ page, layerId: targetLayerId, type, x, y, data })
    this.saveToStorage()
    this.updateLayerVisibility() // Make sure it shows up if it was hidden
    this.redrawStamps(page)
  }

  eraseStamp(page, x, y) {
    const threshold = 0.03 // Normalized distance tolerance
    const initialCount = this.stamps.length

    this.stamps = this.stamps.filter(s => {
      if (s.page !== page) return true
      const dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2))
      return dist > threshold
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

      // Filter stamps mapping to currently visible "Virtual Layers"
      const visibleStamps = this.stamps.filter(s => {
        if (s.page !== page) return false
        const layer = this.layers.find(l => l.id === s.layerId)
        return layer ? layer.visible : true
      })

      visibleStamps.forEach(stamp => {
        const layer = this.layers.find(l => l.id === stamp.layerId)
        this.drawStampOnCanvas(ctx, canvas, stamp, layer ? layer.color : '#000000')
      })
    })
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
      catBtn.title = group.name
      catBtn.innerHTML = group.name.charAt(0)

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

    if (layersData) {
      const storedLayers = JSON.parse(layersData)
      // Merge logic: Ensure our core presets exist even if not in storage
      const coreIds = ['perf', 'fingering', 'bowing', 'personal']
      coreIds.forEach(id => {
        if (!storedLayers.find(l => l.id === id)) {
          const preset = this.layers.find(p => p.id === id)
          if (preset) storedLayers.push(preset)
        }
      })
      this.layers = storedLayers
    }

    if (stampsData) this.stamps = JSON.parse(stampsData)
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

    // Active Selector for General Tools (Stability Fix)
    this.layerSelector.innerHTML = ''
    const generalLayers = this.layers.filter(l => l.type === 'general')
    generalLayers.forEach(layer => {
      const div = document.createElement('label')
      div.className = 'selector-item'
      div.dataset.id = layer.id
      div.innerHTML = `
        <input type="radio" name="active-layer" ${layer.id === this.activeLayerId ? 'checked' : ''}>
        <span class="selector-label">${layer.name}</span>
      `
      div.querySelector('input').addEventListener('change', () => {
        this.activeLayerId = layer.id
      })
      this.layerSelector.appendChild(div)
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
