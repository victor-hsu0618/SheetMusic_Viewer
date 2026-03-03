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
    this.activeCategories = ['Pens', 'Fingering', 'Bowing', 'Dynamic', 'Articulation', 'Tempo', 'Anchor']
    this.activeCategory = 'Pens'
    this.isMultiSelectMode = true // Default to High-Density mode for pro musicians
    this.scale = 1.5
    this.toolbarWidth = 600 // High-Performance Default Width
    this.isSidebarLocked = false
    this.pdfFingerprint = null // Professional Score ID
    this.lastUsedToolPerCategory = {}
    this.sources = [
      { id: 'self', name: 'My Study', visible: true, opacity: 1, color: '#6366f1' }
    ]
    this.activeSourceId = 'self'
    this.profiles = [
      { id: 'p1', name: 'Victor Hsu', orchestra: 'Taipei Symphony Orchestra', section: 'First Violins', initial: 'V' }
    ]
    this.activeProfileId = 'p1'

    this.initToolsets()
    this.initElements()
    this.initEventListeners()
    this.initDraggable()
    this.initResizable()
    this.renderLayerUI()
    this.updateActiveTools()
    this.loadFromStorage()
    this.updateZoomDisplay()
    this.updateJumpLinePosition()
    this.renderSourceUI()
    this.renderCommunityHub()
    this.renderActiveProfile()
    this.renderLibrary()
    this.initDocBarDraggable()
  }

  initToolsets() {
    this.toolsets = [
      {
        name: 'Edit',
        type: 'edit',
        tools: [
          { id: 'select', label: 'Select', icon: '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" />' },
          { id: 'eraser', label: 'Eraser', icon: '<path d="M20 20H7L3 16C2 15 2 13 3 12L13 2L22 11L20 20Z" /><path d="M17 17L7 7" />' }
        ]
      },
      {
        name: 'Pens',
        type: 'draw',
        tools: [
          { id: 'pen', label: 'Pen', icon: '<path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l5 2" /><path d="M2 2l2 5" />' },
          { id: 'highlighter', label: 'Highlighter', icon: '<rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="12" x2="20" y2="12" stroke-width="4" opacity="0.5" />' },
          { id: 'line', label: 'Line', icon: '<line x1="4" y1="20" x2="20" y2="4" stroke-width="2" />' }
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
        name: 'Bowing',
        type: 'articulation',
        tools: [
          { id: 'down-bow', label: 'Down', icon: '<path d="M6 10h12v8M6 18v-8M18 18v-8" stroke-width="2.5" />' },
          { id: 'up-bow', label: 'Up', icon: '<path d="M6 8l6 10 6-10" stroke-width="2.5" />' },
          { id: 'pizz', label: 'pizz.', icon: '<text x="2" y="16" font-size="10" font-weight="bold">pizz</text>' }
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
        name: 'Dynamic',
        type: 'performance',
        tools: [
          { id: 'forte', label: 'f', icon: '<text x="8" y="20" font-family="serif" font-style="italic" font-weight="bold" font-size="22">f</text>' },
          { id: 'piano', label: 'p', icon: '<text x="8" y="20" font-family="serif" font-style="italic" font-weight="bold" font-size="22">p</text>' },
          { id: 'text', label: 'Exp.', icon: '<text x="6" y="18" font-family="Outfit" font-weight="bold">T</text>' }
        ]
      },
      {
        name: 'Layout',
        type: 'layout',
        tools: [
          { id: 'system-break', label: 'Break', icon: '<path d="M4 4h16M4 20h16M8 4v16M16 4v16M4 12l4-4 4 4-4 4-4-4z" />' },
          { id: 'page-break', label: 'Page', icon: '<path d="M4 18h16M4 6h16M12 6v12" /><path d="M8 10l4 4 4-4" />' }
        ]
      },
      {
        name: 'Anchor',
        type: 'anchor',
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
    this.closeSidebarBtn = document.getElementById('close-sidebar')
    this.viewer = document.getElementById('viewer-container')
    this.activeToolsContainer = document.getElementById('active-tools-container')
    this.jumpLine = document.getElementById('jump-line')
    this.jumpOffsetInput = document.getElementById('jump-offset')
    this.jumpOffsetValue = document.getElementById('jump-offset-value')
    this.docBar = document.getElementById('floating-doc-bar')
    this.exportBtn = document.getElementById('export-btn')
    this.importBtn = document.getElementById('import-btn')
    this.importFileInput = document.getElementById('import-file')
    this.sourceList = document.getElementById('source-list')
    this.addSourceBtn = document.getElementById('add-source-btn')
    this.publishBtn = document.getElementById('publish-btn')
    this.sharedList = document.getElementById('shared-list')

    // Quick Load Elements
    this.quickLoadModal = document.getElementById('quick-load-modal')
    this.quickLoadMenuBtn = document.getElementById('quick-load-menu-btn')
    this.closeQuickLoadBtn = document.getElementById('close-quick-load-modal')
    this.recentScoresList = document.getElementById('recent-scores-list')
    this.openNewSoloBtn = document.getElementById('open-new-solo-btn')

    // Welcome Screen Buttons
    this.welcomeInitialView = document.getElementById('welcome-initial-view')
    this.projectRepertoireView = document.getElementById('project-repertoire-view')
    this.projectScoresList = document.getElementById('project-scores-list')
    this.projectNameDisplay = document.getElementById('current-project-name')
    this.projectSearchInput = document.getElementById('project-search')
    this.projectBackBtn = document.getElementById('project-back-btn')

    this.welcomeOpenFileBtn = document.getElementById('welcome-open-file')
    this.welcomeOpenProjectBtn = document.getElementById('welcome-open-project')

    // Member Profile Elements
    this.profileModal = document.getElementById('profile-modal')
    this.editProfileBtn = document.getElementById('edit-profile-btn')
    this.closeProfileBtn = document.getElementById('close-profile-modal')
    this.profileList = document.getElementById('profile-list')
    this.addNewProfileBtn = document.getElementById('add-new-profile-btn')
    this.profileDisplayName = document.getElementById('display-name')
    this.profileDisplayOrchestra = document.getElementById('display-orchestra')
    this.profileAvatarInitial = document.getElementById('profile-avatar-initial')
    this.connectCloudBtn = document.getElementById('connect-cloud-btn')
    this.syncCloudBtn = document.getElementById('sync-cloud-btn')
    this.cloudSyncFolder = null // Handle for File System Access API

    // New 4-Tier Elements
    this.resetSystemBtn = document.getElementById('reset-system-btn')
    this.libraryList = document.getElementById('library-scores-list')
    this.selectLibraryBtn = document.getElementById('select-library-btn')
    this.librarySearchInput = document.getElementById('library-search')

    this.libraryFiles = [] // Scanned repertoire
    this.libraryFolderHandle = null
    this.activeScoreName = null

    this.jumpOffsetPx = 1 * 37.8
  }

  initEventListeners() {
    if (this.uploadBtn) {
      this.uploadBtn.addEventListener('click', () => this.uploader.click())
    }
    this.uploader.addEventListener('change', (e) => this.handleUpload(e))

    this.sidebarTrigger.addEventListener('mouseenter', () => {
      this.sidebar.classList.add('open')
      this.updateLayoutState()
    })

    this.sidebar.addEventListener('mouseleave', () => {
      if (!this.isSidebarLocked) {
        this.sidebar.classList.remove('open')
        this.updateLayoutState()
      }
    })

    if (this.lockSidebarBtn) {
      this.lockSidebarBtn.addEventListener('click', () => {
        this.isSidebarLocked = !this.isSidebarLocked
        this.lockSidebarBtn.classList.toggle('locked', this.isSidebarLocked)
        this.updateLayoutState()
      })
    }

    // Exchange Listeners
    this.exportBtn.addEventListener('click', () => this.exportProject())
    this.importBtn.addEventListener('click', () => this.importFileInput.click())
    this.importFileInput.addEventListener('change', (e) => this.handleImport(e))

    if (this.publishBtn) {
      this.publishBtn.addEventListener('click', () => this.publishWork())
    }

    if (this.connectCloudBtn) {
      this.connectCloudBtn.addEventListener('click', () => this.connectCloudFolder())
    }
    if (this.syncCloudBtn) {
      this.syncCloudBtn.addEventListener('click', () => this.renderCommunityHub())
    }

    if (this.editProfileBtn) {
      this.editProfileBtn.addEventListener('click', () => this.toggleProfileModal(true))
    }
    if (this.closeProfileBtn) {
      this.closeProfileBtn.addEventListener('click', () => this.toggleProfileModal(false))
    }
    if (this.addNewProfileBtn) {
      this.addNewProfileBtn.addEventListener('click', () => this.addNewProfile())
    }

    if (this.addSourceBtn) {
      this.addSourceBtn.addEventListener('click', () => this.addSource())
    }

    if (this.resetSystemBtn) {
      this.resetSystemBtn.addEventListener('click', () => this.resetToSystemDefault())
    }

    if (this.quickLoadMenuBtn) {
      this.quickLoadMenuBtn.addEventListener('click', () => this.toggleQuickLoadModal(true))
    }
    if (this.closeQuickLoadBtn) {
      this.closeQuickLoadBtn.addEventListener('click', () => this.toggleQuickLoadModal(false))
    }
    if (this.openNewSoloBtn) {
      this.openNewSoloBtn.addEventListener('click', () => {
        this.toggleQuickLoadModal(false)
        this.uploader.click()
      })
    }

    if (this.selectLibraryBtn) {
      this.selectLibraryBtn.addEventListener('click', () => this.selectLibraryFolder())
    }
    if (this.librarySearchInput) {
      this.librarySearchInput.addEventListener('input', () => this.renderLibrary())
    }

    // Welcome Screen Hooks
    if (this.welcomeOpenFileBtn) {
      this.welcomeOpenFileBtn.addEventListener('click', () => this.uploader.click())
    }
    if (this.welcomeOpenProjectBtn) {
      this.welcomeOpenProjectBtn.addEventListener('click', () => this.selectLibraryFolder())
    }
    if (this.projectBackBtn) {
      this.projectBackBtn.addEventListener('click', () => {
        this.welcomeInitialView.classList.remove('hidden')
        this.projectRepertoireView.classList.add('hidden')
      })
    }
    if (this.projectSearchInput) {
      this.projectSearchInput.addEventListener('input', () => this.renderProjectRepertoire())
    }

    this.zoomInBtn.addEventListener('click', () => this.zoom(0.1))
    this.zoomOutBtn.addEventListener('click', () => this.zoom(-0.1))

    this.closeShortcutsBtn.addEventListener('click', () => this.toggleShortcuts(false))

    if (this.closeSidebarBtn) {
      this.closeSidebarBtn.addEventListener('click', () => {
        this.sidebar.classList.remove('open')
        this.isSidebarLocked = false // Force unlock if explicitly closed
        if (this.lockSidebarBtn) this.lockSidebarBtn.classList.remove('locked')
        this.updateLayoutState()
      })
    }

    if (this.addLayerBtn) {
      this.addLayerBtn.addEventListener('click', () => this.addNewLayer())
    }

    if (this.zoomInBtn) this.zoomInBtn.addEventListener('click', () => this.changeZoom(0.1))
    if (this.zoomOutBtn) this.zoomOutBtn.addEventListener('click', () => this.changeZoom(-0.1))

    if (this.clearStampsBtn) {
      this.clearStampsBtn.addEventListener('click', () => {
        const activeSource = this.sources.find(s => s.id === this.activeSourceId) || { name: 'Current Style' }
        if (confirm(`⚠️ DANGER: Clear ALL markings belonging to "${activeSource.name}"?\n\nThis will NOT affect markings from other shared interpretations.`)) {
          this.stamps = this.stamps.filter(s => s.sourceId !== this.activeSourceId)
          this.saveToStorage()
          if (this.pdf) {
            for (let i = 1; i <= this.pdf.numPages; i++) {
              this.redrawStamps(i)
            }
          }
          alert(`All markings for "${activeSource.name}" have been cleared.`)
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

      // Delete/Backspace for Focused Stamp
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.lastFocusedStamp) {
          const idx = this.stamps.indexOf(this.lastFocusedStamp)
          if (idx !== -1) {
            const page = this.lastFocusedStamp.page
            this.stamps.splice(idx, 1)
            this.saveToStorage()
            this.redrawStamps(page)
            this.lastFocusedStamp = null
          }
        }
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
    if (!file) return

    console.log(`Starting upload for: ${file.name}, size: ${file.size} bytes`)

    try {
      const reader = new FileReader()
      reader.onerror = (err) => {
        console.error('FileReader error:', err)
        alert('Error reading the file.')
      }

      reader.onload = async (event) => {
        const buffer = event.target.result
        try {
          await this.loadPDF(new Uint8Array(buffer))
          this.activeScoreName = file.name
          this.addToRecentSoloScores(file.name)
          this.saveToStorage()
          this.renderLibrary()
        } catch (pdfErr) {
          console.error('PDF.js Error:', pdfErr)
          alert('Failed to load PDF.')
        }
      }
      reader.readAsArrayBuffer(file)
    } catch (err) {
      console.error('General upload error:', err)
    }
  }

  async getFingerprint(buffer) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async loadPDF(data) {
    // 1. Save current score's stamps before switching
    if (this.pdfFingerprint) {
      this.saveToStorage()
    }

    // 2. Compute fingerprint of the new PDF
    const newFingerprint = await this.getFingerprint(data.buffer || data)
    this.pdfFingerprint = newFingerprint

    // 3. Load this score's saved stamps (or start fresh)
    const savedStamps = localStorage.getItem(`scoreflow_stamps_${newFingerprint}`)
    this.stamps = savedStamps ? JSON.parse(savedStamps) : []

    // 4. Load and render the PDF
    const loadingTask = pdfjsLib.getDocument({
      data: data,
      cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.5.207/cmaps/',
      cMapPacked: true,
    })

    this.pdf = await loadingTask.promise
    console.log(`PDF loaded successfully. Pages: ${this.pdf.numPages}, Fingerprint: ${newFingerprint.slice(0, 8)}...`)
    await this.renderPDF()
  }

  // Safe file opener: handles File System Access API permission re-requests
  async openFileHandle(fileHandle) {
    // Check current permission state
    try {
      let permission = await fileHandle.queryPermission({ mode: 'read' })
      if (permission !== 'granted') {
        permission = await fileHandle.requestPermission({ mode: 'read' })
      }
      if (permission !== 'granted') {
        alert(`Access denied to "${fileHandle.name}".\n\nPlease re-select your library folder to restore access.`)
        return null
      }
    } catch (e) {
      // queryPermission/requestPermission not supported in some environments — try anyway
      console.warn('Permission API not available, trying direct read:', e)
    }

    try {
      return await fileHandle.getFile()
    } catch (err) {
      console.error('getFile() failed:', err)
      alert(`Could not read "${fileHandle.name}".\n\nThis can happen if the library folder was moved or the browser session expired. Please use "Select Library Folder" to re-link.`)
      return null
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
    // Hide welcome screen BEFORE clearing container DOM
    const welcomeScreen = document.querySelector('.welcome-screen')
    if (welcomeScreen) welcomeScreen.classList.add('hidden')

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
      this.createCaptureOverlay(pageWrapper, i, viewport.width, viewport.height)
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

    let isInteracting = false
    let activeObject = null // Can be a new path or an existing stamp being moved
    let isMovingExisting = false

    const getPos = (e) => {
      const rect = overlay.getBoundingClientRect()
      const clientX = e.clientX || (e.touches && e.touches[0].clientX)
      const clientY = e.clientY || (e.touches && e.touches[0].clientY)
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height
      }
    }

    const startAction = (e) => {
      const pos = getPos(e)
      const toolType = this.activeStampType
      const isFreehand = ['pen', 'highlighter', 'line'].includes(toolType)

      if (e.type === 'touchstart') e.preventDefault()
      isInteracting = true

      if (toolType === 'select') {
        // Try to find a stamp near the click
        const threshold = 0.05
        const existingIndex = this.stamps.findIndex(s => {
          if (s.page !== pageNum) return false
          if (s.points) {
            return s.points.some(p => Math.sqrt(Math.pow(p.x - pos.x, 2) + Math.pow(p.y - pos.y, 2)) < threshold)
          }
          return Math.sqrt(Math.pow(s.x - pos.x, 2) + Math.pow(s.y - pos.y, 2)) < threshold
        })

        if (existingIndex !== -1) {
          isMovingExisting = true
          activeObject = this.stamps[existingIndex]
          this.lastFocusedStamp = activeObject
          // Optional: visually highlight it?
        } else {
          isInteracting = false
        }
      } else if (isFreehand) {
        activeObject = {
          type: toolType,
          page: pageNum,
          layerId: 'draw',
          sourceId: this.activeSourceId, // Link to current Persona
          points: [pos],
          color: this.layers.find(l => l.id === 'draw').color
        }
      } else if (toolType === 'eraser') {
        this.eraseStamp(pageNum, pos.x, pos.y)
        isInteracting = false
      } else {
        // Precise Placement for Stamps
        let targetLayerId = 'draw'
        const group = this.toolsets.find(g => g.tools.some(t => t.id === toolType))
        if (group) {
          const layer = this.layers.find(l => l.type === group.type)
          if (layer) targetLayerId = layer.id
        }

        activeObject = {
          page: pageNum,
          layerId: targetLayerId,
          sourceId: this.activeSourceId, // Link to current Persona
          type: toolType,
          x: pos.x,
          y: pos.y,
          data: null
        }
        this.lastFocusedStamp = activeObject
      }
    }

    const moveAction = (e) => {
      if (!isInteracting || !activeObject) return
      const pos = getPos(e)

      if (isMovingExisting) {
        if (activeObject.points) {
          // Move entire path (relative or absolute?) Let's do delta
          const dx = pos.x - activeObject.points[0].x
          const dy = pos.y - activeObject.points[0].y
          activeObject.points = activeObject.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
        } else {
          activeObject.x = pos.x
          activeObject.y = pos.y
        }
        this.redrawStamps(pageNum)
      } else if (activeObject.points) {
        if (this.activeStampType === 'line') {
          activeObject.points[1] = pos
        } else {
          activeObject.points.push(pos)
        }
        const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
        if (canvas) this.drawPathOnCanvas(canvas.getContext('2d'), canvas, activeObject)
      } else {
        // Preview new stamp movement
        activeObject.x = pos.x
        activeObject.y = pos.y
        this.redrawStamps(pageNum) // Redraw with the pending object? 
        // Better: redraw all + draw the pending one as ghost
        const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
        const ctx = canvas.getContext('2d')
        this.redrawStamps(pageNum)
        const layer = this.layers.find(l => l.id === activeObject.layerId)
        this.drawStampOnCanvas(ctx, canvas, activeObject, layer ? layer.color : '#000000', true)
      }
    }

    const endAction = (e) => {
      if (isInteracting && activeObject) {
        if (!isMovingExisting) {
          if (activeObject.type === 'text' || activeObject.type === 'tempo-text') {
            // Delay adding to stamps until we have the multi-line data
            this.spawnTextEditor(wrapper, pageNum, activeObject)
          } else {
            this.stamps.push(activeObject)
          }
        }
        this.saveToStorage()
        this.redrawStamps(pageNum)
      }
      isInteracting = false
      isMovingExisting = false
      activeObject = null
    }

    overlay.addEventListener('mousedown', startAction)
    overlay.addEventListener('mousemove', moveAction)
    window.addEventListener('mouseup', endAction)

    overlay.addEventListener('touchstart', startAction, { passive: false })
    overlay.addEventListener('touchmove', moveAction, { passive: false })
    overlay.addEventListener('touchend', endAction)

    wrapper.appendChild(overlay)
  }

  drawPageEndAnchor(page, width, height) {
    const pageWrapper = document.querySelector(`.page-container[data-page="${page}"]`)
    if (!pageWrapper) return  // Guard: DOM may not be ready yet (async race)
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

    this.stamps.push({
      page,
      layerId: targetLayerId,
      sourceId: this.activeSourceId, // Associated with active Persona
      type,
      x,
      y,
      data
    })
    this.saveToStorage()
    this.updateLayerVisibility()
    this.redrawStamps(page)
  }

  eraseStamp(page, x, y) {
    const threshold = 0.05 // Slightly larger for better UX (approx 40-50px)
    const initialCount = this.stamps.length

    this.stamps = this.stamps.filter(s => {
      if (s.page !== page) return true

      // OPTION A: Safety Lock
      if (s.sourceId !== this.activeSourceId) return true

      if (s.points) {
        // Precise hit-test for pen/paths
        return !s.points.some(p => Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2)) < (threshold * 0.7))
      } else {
        const dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2))
        return dist > threshold
      }
    })

    if (this.stamps.length !== initialCount) {
      console.log(`Eraser: Removed ${initialCount - this.stamps.length} stamps from active source: ${this.activeSourceId}`)
      this.saveToStorage()
      this.redrawStamps(page)
    }
  }

  redrawStamps(page) {
    const wrapper = document.querySelector(`.page-container[data-page="${page}"]`)
    if (!wrapper) return

    // We draw ALL visible sources onto the virtual canvas
    const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    this.sources.forEach(source => {
      if (!source.visible) return

      ctx.save()
      ctx.globalAlpha = source.opacity || 1
      const isForeign = source.id !== 'self'

      const sourceStamps = this.stamps.filter(s => s.page === page && s.sourceId === source.id)
      sourceStamps.forEach(stamp => {
        const layer = this.layers.find(l => l.id === stamp.layerId)
        if (!layer || !layer.visible) return

        if (stamp.points) {
          this.drawPathOnCanvas(ctx, canvas, stamp, isForeign)
        } else {
          this.drawStampOnCanvas(ctx, canvas, stamp, layer.color, isForeign)
        }
      })
      ctx.restore()
    })
  }

  drawPathOnCanvas(ctx, canvas, path, isForeign = false) {
    if (!path.points || path.points.length < 2) return

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (isForeign) {
      ctx.setLineDash([8 * (this.scale / 1.5), 6 * (this.scale / 1.5)])
    }

    if (path.type === 'highlighter') {
      ctx.strokeStyle = isForeign ? '#e5e7ebAA' : '#fde04788'
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
    ctx.restore()
  }

  drawStampOnCanvas(ctx, canvas, stamp, color, isForeign = false) {
    const x = stamp.x * canvas.width
    const y = stamp.y * canvas.height
    const size = 18 * (this.scale / 1.5)

    ctx.save()
    if (isForeign) {
      ctx.setLineDash([4, 3])
      ctx.globalAlpha *= 0.7
    }

    ctx.strokeStyle = color
    ctx.fillStyle = `${color}33`
    ctx.lineWidth = 2.5 * (this.scale / 1.5)
    ctx.beginPath()

    // Professional Music Symbols & Specialized Notation
    switch (stamp.type) {
      case 'circle':
        ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break
      case 'text':
      case 'tempo-text':
        ctx.font = `bold ${22 * (this.scale / 1.5)}px Outfit`
        ctx.fillStyle = color
        const lines = (stamp.data || '').split('\n')
        const lineHeight = 26 * (this.scale / 1.5)
        lines.forEach((line, i) => {
          // Editorial text uses dashed underline or slightly lighter style if foreign
          ctx.fillText(line, x, y + (i * lineHeight))
          if (isForeign) {
            ctx.beginPath()
            ctx.setLineDash([2, 1])
            ctx.moveTo(x, y + (i * lineHeight) + 2)
            ctx.lineTo(x + ctx.measureText(line).width, y + (i * lineHeight) + 2)
            ctx.stroke()
          }
        })
        break
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
      case 'f0': case 'f1': case 'f2': case 'f3': case 'f4': case 'f5':
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
      case 'tempo-quarter':
        ctx.font = `bold ${20 * (this.scale / 1.5)}px Outfit`
        ctx.fillStyle = color; ctx.fillText('q=', x, y); break
      case 'rit':
        ctx.font = `italic ${16 * (this.scale / 1.5)}px serif`
        ctx.fillStyle = color; ctx.fillText('rit.', x, y); break
      case 'accel':
        ctx.font = `italic ${16 * (this.scale / 1.5)}px serif`
        ctx.fillStyle = color; ctx.fillText('accel.', x, y); break
      case 'pizz':
        ctx.font = `bold italic ${14 * (this.scale / 1.5)}px serif`
        ctx.fillStyle = color; ctx.fillText('pizz.', x, y); break
    }
    ctx.restore()
  }

  updateActiveTools(forceShowDropdown = false) {
    this.activeToolsContainer.innerHTML = ""

    // Check if expanded or collapsed
    const isExpanded = this.activeToolsContainer.classList.contains("expanded")

    // 0. Active Tool FAB (Visible ONLY when collapsed)
    const fab = document.createElement("div")
    fab.className = "active-tool-fab"
    const activeTool = this.toolsets.flatMap(g => g.tools).find(t => t.id === this.activeStampType)
    if (activeTool) {
      fab.innerHTML = this.getIcon(activeTool, 32)
    }
    this.activeToolsContainer.appendChild(fab)

    if (!isExpanded) {
      this.activeToolsContainer.style.width = "" // Use CSS default for collapsed
      this.activeToolsContainer.onclick = () => {
        this.activeToolsContainer.classList.add("expanded")
        this.updateActiveTools()
      }
      return
    }

    // Apply saved workstation width
    this.activeToolsContainer.style.width = typeof this.toolbarWidth === "number" ? `${this.toolbarWidth}px` : this.toolbarWidth

    // 1 & 2. Unified Palette Header (Grip + Categories)
    const header = document.createElement("div")
    header.className = "palette-header"

    // 1. Drag / Toggle Handle (Professional Grip Pattern)
    const handle = document.createElement("div")
    handle.className = "drag-handle"
    handle.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="9" cy="5" r="1" fill="currentColor"/>
        <circle cx="15" cy="5" r="1" fill="currentColor"/>
        <circle cx="9" cy="12" r="1" fill="currentColor"/>
        <circle cx="15" cy="12" r="1" fill="currentColor"/>
        <circle cx="9" cy="19" r="1" fill="currentColor"/>
        <circle cx="15" cy="19" r="1" fill="currentColor"/>
      </svg>
    `
    handle.onclick = (e) => {
      e.stopPropagation()
      this.activeToolsContainer.classList.remove("expanded")
      this.updateActiveTools()
    }

    // 2. Category Selection Ribbon (Persistent Pills - forScore Style)
    const ribbon = document.createElement("div")
    ribbon.className = "category-ribbon"

    this.toolsets.forEach(group => {
      const isActive = this.activeCategories.includes(group.name)
      const pill = document.createElement("button")
      pill.className = `cat-pill ${isActive ? "active" : ""}`
      pill.textContent = group.name
      pill.onclick = (e) => {
        e.stopPropagation()
        if (isActive) {
          if (this.activeCategories.length > 1) {
            this.activeCategories = this.activeCategories.filter(c => c !== group.name)
          }
        } else {
          this.activeCategories.push(group.name)
        }
        this.updateActiveTools()
      }
      ribbon.appendChild(pill)
    })

    header.appendChild(handle)
    header.appendChild(ribbon)
    this.activeToolsContainer.appendChild(header)

    // 3. Active Tools Grid (Supporting Multi-Row Wrap)
    const grid = document.createElement("div")
    grid.className = "active-tools-grid"

    this.activeCategories.forEach((catName, index) => {
      const group = this.toolsets.find(g => g.name === catName)
      if (!group) return

      // Add Divider between groups for visual clarity
      if (index > 0) {
        const divider = document.createElement("div")
        divider.className = "tool-group-divider"
        grid.appendChild(divider)
      }

      group.tools.forEach(tool => {
        const wrapper = document.createElement("div")
        wrapper.className = "stamp-tool-wrapper"

        const btn = document.createElement("button")
        btn.className = `stamp-tool ${this.activeStampType === tool.id ? "active" : ""}`
        btn.innerHTML = this.getIcon(tool, 26)
        btn.onclick = (e) => {
          e.stopPropagation()
          this.activeStampType = tool.id
          // Remember this tool for its respective category
          this.lastUsedToolPerCategory[catName] = tool.id
          this.updateActiveTools()
        }

        const label = document.createElement("span")
        label.className = "stamp-label"
        label.textContent = tool.label

        wrapper.appendChild(btn)
        wrapper.appendChild(label)
        grid.appendChild(wrapper)
      })
    })
    this.activeToolsContainer.appendChild(grid)
    this.viewer.dataset.activeTool = this.activeStampType

    // 3.5 Resize Handle (Professional Custom Control)
    const resizer = document.createElement("div")
    resizer.className = "resize-handle"
    resizer.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M21 15L15 21M21 9L9 21M21 3L3 21"/>
      </svg>
    `
    this.activeToolsContainer.appendChild(resizer)

    // 4. Viewport Safety Check (Dynamic Height Protection for iPad)
    setTimeout(() => {
      const rect = this.activeToolsContainer.getBoundingClientRect()
      if (rect.top < 20) {
        // If expanding reaches the top, we cap the height and enable internal scrolling
        this.activeToolsContainer.style.maxHeight = (window.innerHeight - 80) + "px"
        this.activeToolsContainer.style.overflowY = "auto"
      } else {
        this.activeToolsContainer.style.maxHeight = "none"
        this.activeToolsContainer.style.overflowY = "visible"
      }
    }, 0)
  }

  getIcon(tool, size = 24) {
    const group = this.toolsets.find(g => g.tools.some(t => t.id === tool.id))
    const category = group ? group.type : 'draw'
    const path = `/assets/icons/${category}/${tool.id}.svg`

    // High Reliability Approach:
    // 1. SVG from code is shown by default (z-index 1)
    // 2. We try to load the img (z-index 2)
    // 3. ONLY if the img loads successfully, we hide the SVG and show the img
    return `
      <div class="icon-wrapper" style="width:${size}px; height:${size}px; position:relative; display:flex; align-items:center; justify-content:center;">
        <svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke="currentColor" stroke-width="2" fill="none" class="fallback-svg">
          ${tool.icon}
        </svg>
        <img src="${path}" 
             width="${size}" 
             height="${size}" 
             style="position:absolute; top:0; left:0; display:none; object-fit:contain; background:transparent;"
             onload="this.style.display='block'; this.previousElementSibling.style.display='none';"
             onerror="this.style.display='none';">
      </div>
    `
  }

  initResizable() {
    let isResizing = false
    let initialX, initialWidth
    const el = this.activeToolsContainer

    const handleMouseDown = (e) => {
      const handle = e.target.closest(".resize-handle")
      if (!handle) return
      e.stopPropagation()
      e.preventDefault()
      isResizing = true
      initialX = e.clientX || e.touches[0].clientX
      initialWidth = el.offsetWidth
      el.classList.add("resizing")
    }

    const handleMouseMove = (e) => {
      if (!isResizing) return
      const currentX = (e.clientX || (e.touches && e.touches[0].clientX))
      const deltaX = currentX - initialX
      this.toolbarWidth = Math.max(300, initialWidth + deltaX)
      el.style.width = this.toolbarWidth + "px"
    }

    const handleMouseUp = () => {
      if (isResizing) {
        isResizing = false
        el.classList.remove("resizing")
        this.updateActiveTools()
      }
    }

    el.addEventListener("mousedown", handleMouseDown)
    el.addEventListener("touchstart", handleMouseDown, { passive: false })
    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("touchmove", handleMouseMove, { passive: false })
    document.addEventListener("mouseup", handleMouseUp)
    document.addEventListener("touchend", handleMouseUp)
  }

  toggleQuickLoadModal(show) {
    if (this.quickLoadModal) {
      this.quickLoadModal.classList.toggle('active', show)
      if (show) this.renderRecentSoloScores()
    }
  }

  addToRecentSoloScores(name) {
    if (!this.recentSoloScores) this.recentSoloScores = []
    // Keep only unique names, move newest to front
    this.recentSoloScores = this.recentSoloScores.filter(s => s.name !== name)
    this.recentSoloScores.unshift({ name, date: new Date().toLocaleDateString() })
    // Limit to 10
    if (this.recentSoloScores.length > 10) this.recentSoloScores.pop()
    this.saveToStorage()
  }

  renderRecentSoloScores() {
    if (!this.recentScoresList) return
    this.recentScoresList.innerHTML = ''

    if (this.recentSoloScores.length === 0) {
      this.recentScoresList.innerHTML = '<div class="empty-state">No recent solo scores recorded.</div>'
      return
    }

    this.recentSoloScores.forEach(score => {
      const card = document.createElement('div')
      card.className = 'recent-score-card'
      card.innerHTML = `
        <div class="recent-score-icon">🎼</div>
        <div class="recent-score-info">
          <div class="recent-score-name">${score.name}</div>
          <div class="recent-score-date">Last Opened: ${score.date}</div>
        </div>
      `
      card.onclick = () => {
        // Since we don't have the file handle, we tell them it's marked as active 
        // but if it's not in the current session library, we invite them to re-pick.
        // For now, if it's already in the libraryFiles (project), we can use it!
        const libraryMatch = this.libraryFiles.find(f => f.name === score.name)
        if (libraryMatch) {
          libraryMatch.getFile().then(file => file.arrayBuffer()).then(buf => {
            this.activeScoreName = score.name
            this.renderPDF(buf)
            this.toggleQuickLoadModal(false)

            if (!this.isSidebarLocked) {
              this.sidebar.classList.remove('open')
              this.updateLayoutState()
            }
          })
        } else {
          alert(`Selected: ${score.name}\n\nNote: For solo scores not in your project folder, please click "+ Open New Solo PDF" to locate the file.`)
        }
      }
      this.recentScoresList.appendChild(card)
    })
  }

  initDraggable() {
    let isDragging = false
    let currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0
    const el = this.activeToolsContainer

    el.addEventListener("mousedown", dragStart)
    document.addEventListener("mousemove", drag)
    document.addEventListener("mouseup", dragEnd)

    function dragStart(e) {
      if (!e.target.closest(".drag-handle") && !e.target.closest(".active-tool-fab")) return
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

  initDocBarDraggable() {
    let isDragging = false
    let currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0
    const el = this.docBar
    if (!el) return

    el.addEventListener("mousedown", dragStart)
    document.addEventListener("mousemove", drag)
    document.addEventListener("mouseup", dragEnd)

    // Touch support for iPad
    el.addEventListener("touchstart", (e) => dragStart(e.touches[0]))
    document.addEventListener("touchmove", (e) => drag(e.touches[0]))
    document.addEventListener("touchend", dragEnd)

    function dragStart(e) {
      if (!e.target.closest(".doc-drag-handle")) return
      initialX = e.clientX - xOffset
      initialY = e.clientY - yOffset
      isDragging = true
    }

    function drag(e) {
      if (isDragging) {
        currentX = e.clientX - initialX
        currentY = e.clientY - initialY
        xOffset = currentX
        yOffset = currentY
        setTranslate(currentX, currentY, el)
      }
    }

    function dragEnd() {
      initialX = currentX
      initialY = currentY
      isDragging = false
    }

    function setTranslate(xPos, yPos, el) {
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

    const allAnchors = [
      { absoluteY: 0, type: 'anchor', isStart: true },
      ...pageEndAnchors,
      ...userAnchors
    ].sort((a, b) => a.absoluteY - b.absoluteY)

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
    // Save stamps under this score's fingerprint key
    if (this.pdfFingerprint) {
      localStorage.setItem(`scoreflow_stamps_${this.pdfFingerprint}`, JSON.stringify(this.stamps))
    }
    // Also save as current for backward compatibility / startup restore
    localStorage.setItem('scoreflow_stamps', JSON.stringify(this.stamps))
    localStorage.setItem('scoreflow_current_fingerprint', this.pdfFingerprint || '')
    localStorage.setItem('scoreflow_sources', JSON.stringify(this.sources))
    localStorage.setItem('scoreflow_active_source', this.activeSourceId)
    localStorage.setItem('scoreflow_profiles', JSON.stringify(this.profiles))
    localStorage.setItem('scoreflow_active_profile', this.activeProfileId)
    localStorage.setItem('scoreflow_recent_solo_scores', JSON.stringify(this.recentSoloScores || []))
    if (this.activeScoreName) {
      localStorage.setItem('scoreflow_last_opened_score', this.activeScoreName)
    }
  }

  loadFromStorage() {
    const layersData = localStorage.getItem('scoreflow_layers')
    const stampsData = localStorage.getItem('scoreflow_stamps')
    const sourcesData = localStorage.getItem('scoreflow_sources')
    const activeSourceData = localStorage.getItem('scoreflow_active_source')
    const fingerprintData = localStorage.getItem('scoreflow_current_fingerprint')
    const profilesData = localStorage.getItem('scoreflow_profiles')
    const activeProfileData = localStorage.getItem('scoreflow_active_profile')
    const recentSoloData = localStorage.getItem('scoreflow_recent_solo_scores')

    if (recentSoloData) this.recentSoloScores = JSON.parse(recentSoloData)

    if (sourcesData) this.sources = JSON.parse(sourcesData)
    if (activeSourceData) this.activeSourceId = activeSourceData
    if (fingerprintData) this.pdfFingerprint = fingerprintData
    if (profilesData) this.profiles = JSON.parse(profilesData)
    if (activeProfileData) this.activeProfileId = activeProfileData

    // PERSISTENCE SYNC: Preserve custom layers while respecting core defaults
    if (layersData) {
      const storedLayers = JSON.parse(layersData)
      // We take ALL stored layers (including custom ones)
      this.layers = storedLayers

      // But we MUST ensure core layers still have their standard IDs if they were somehow lost
      const coreIds = ['draw', 'fingering', 'articulation', 'performance', 'other']
      coreIds.forEach(id => {
        if (!this.layers.find(l => l.id === id)) {
          // This shouldn't happen normally, but safe fallback
          console.warn(`Layer ${id} recovered from source.`)
        }
      })
    }

    if (stampsData) {
      let parsedStamps = JSON.parse(stampsData)
      // If we have a fingerprint, prefer the score-specific stamps
      if (fingerprintData) {
        const scoreStamps = localStorage.getItem(`scoreflow_stamps_${fingerprintData}`)
        if (scoreStamps) parsedStamps = JSON.parse(scoreStamps)
      }
      this.stamps = parsedStamps
      // Cleanup old stamps that might have invalid layerIds from previous versions
      this.stamps.forEach(s => {
        if (!this.layers.find(l => l.id === s.layerId)) {
          s.layerId = 'draw'
        }
        if (!s.sourceId) {
          s.sourceId = this.activeSourceId
        }
      })
    }
    this.renderLayerUI()
    this.renderSourceUI() // Render sources after loading
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

  spawnTextEditor(wrapper, pageNum, stamp) {
    const overlay = wrapper.querySelector('.capture-overlay')
    if (!overlay) return

    const editor = document.createElement('textarea')
    editor.className = 'floating-text-editor'
    editor.placeholder = 'Type here...'
    editor.style.left = (stamp.x * 100) + '%'
    editor.style.top = (stamp.y * 100) + '%'

    const layer = this.layers.find(l => l.id === stamp.layerId)
    editor.style.color = layer ? layer.color : '#ff4757'

    overlay.appendChild(editor)

    // Set focus after a tiny delay to ensure it's in the DOM
    setTimeout(() => {
      editor.focus()
      // Adjust initial height
      editor.style.height = 'auto'
      editor.style.height = editor.scrollHeight + 'px'
    }, 10)

    const finalize = () => {
      if (editor.value.trim()) {
        stamp.data = editor.value
        this.stamps.push(stamp)
        this.saveToStorage()
        this.redrawStamps(pageNum)
      }
      editor.remove()
    }

    // Single click outside or Esc will cancel/finalize depending on logic
    // Blur usually happens when clicking elsewhere
    editor.onblur = (e) => {
      // Only finalize if we actually typed something
      if (editor.value.trim()) finalize()
      else editor.remove()
    }

    editor.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        finalize()
      }
      if (e.key === 'Escape') {
        editor.remove()
      }
      e.stopPropagation() // Prevent global shortcuts while typing
    }

    // Auto-resize horizontally and vertically
    editor.oninput = () => {
      editor.style.height = 'auto'
      editor.style.height = editor.scrollHeight + 'px'
    }
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

  exportProject() {
    const data = {
      version: '1.2',
      timestamp: new Date().toISOString(),
      layers: this.layers,
      stamps: this.stamps,
      sources: this.sources,
      activeSourceId: this.activeSourceId
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ScoreFlow_FullProject_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  handleImport(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result)
        const mode = confirm('Import Mode:\n\nClick [OK] to Merge as a New Persona (Maestro/Peer).\nClick [Cancel] to Overwrite current data.')

        if (mode) {
          // Merge as New Source
          const newSourceId = 'res_' + Date.now()
          const newSourceName = prompt('Enter name for this persona:', 'Imported Persona') || 'New Persona'

          this.sources.push({
            id: newSourceId,
            name: newSourceName,
            visible: true,
            opacity: 0.6, // Default to a bit ghosted for comparison
            color: '#' + Math.floor(Math.random() * 16777215).toString(16)
          })

          const importedStamps = (data.stamps || []).map(s => ({ ...s, sourceId: newSourceId }))
          this.stamps = this.stamps.concat(importedStamps)
          this.saveToStorage()
          location.reload()
        } else {
          // Overwrite
          this.layers = data.layers || this.layers
          this.stamps = data.stamps || []
          this.sources = data.sources || this.sources
          this.activeSourceId = data.activeSourceId || this.sources[0].id
          this.saveToStorage()
          location.reload()
        }
      } catch (err) {
        alert('Invalid project file.')
      }
    }
    reader.readAsText(file)
  }

  addSource() {
    const name = prompt('Interpretation Style (e.g., Conductor, Soloist, Principal):')
    if (!name) return

    const id = 'src_' + Date.now()
    this.sources.push({
      id,
      name,
      visible: true,
      opacity: 1,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16)
    })
    this.activeSourceId = id
    this.saveToStorage()
    this.renderSourceUI()
  }

  renderSourceUI() {
    if (!this.sourceList) return
    this.sourceList.innerHTML = ''

    this.sources.forEach(source => {
      const isActive = this.activeSourceId === source.id
      const item = document.createElement('div')
      item.className = `source-item ${isActive ? 'active' : ''}`

      item.innerHTML = `
        <div class="source-header">
          <div class="source-info">
            <div class="source-dot" style="background: ${source.color}"></div>
            <span class="source-name">${source.name}</span>
            ${isActive ? '<span class="active-source-badge">Active</span>' : ''}
          </div>
          <div class="source-controls">
            <button class="btn-sm-icon toggle-vis" title="Toggle Visibility">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${source.visible
          ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
          : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}
              </svg>
            </button>
            <button class="btn-sm-icon rename-src" title="Rename Persona">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${this.sources.length > 1 ? `
              <button class="btn-sm-icon danger delete-src" title="Remove Persona">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="source-opacity-box">
          <label>Compare</label>
          <input type="range" class="source-opacity-slider modern-slider" min="0" max="1" step="0.1" value="${source.opacity}">
        </div>
      `;

      item.onclick = (e) => {
        if (e.target.closest('.source-controls') || e.target.closest('.source-opacity-box')) return
        this.activeSourceId = source.id
        this.saveToStorage()
        this.renderSourceUI()
      }

      item.querySelector('.toggle-vis').onclick = (e) => {
        e.stopPropagation()
        source.visible = !source.visible
        this.saveToStorage()
        this.renderSourceUI()
        if (this.pdf) {
          for (let i = 1; i <= this.pdf.numPages; i++) this.redrawStamps(i)
        }
      }

      item.querySelector('.rename-src').onclick = (e) => {
        e.stopPropagation()
        const newName = prompt('Rename Interpretation Style:', source.name)
        if (newName) {
          source.name = newName
          this.saveToStorage()
          this.renderSourceUI()
        }
      }

      const delBtn = item.querySelector('.delete-src')
      if (delBtn) {
        delBtn.onclick = (e) => {
          e.stopPropagation()
          if (confirm(`Remove "${source.name}" and all its annotations?`)) {
            this.stamps = this.stamps.filter(s => s.sourceId !== source.id)
            this.sources = this.sources.filter(s => s.id !== source.id)
            if (this.activeSourceId === source.id) this.activeSourceId = this.sources[0].id
            this.saveToStorage()
            location.reload()
          }
        }
      }

      item.querySelector('.source-opacity-slider').oninput = (e) => {
        source.opacity = parseFloat(e.target.value)
        if (this.pdf) {
          for (let i = 1; i <= this.pdf.numPages; i++) this.redrawStamps(i)
        }
      }
      item.querySelector('.source-opacity-slider').onchange = () => this.saveToStorage()

      this.sourceList.appendChild(item)
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

  exportProject() {
    const data = {
      version: '1.3',
      timestamp: new Date().toISOString(),
      fingerprint: this.pdfFingerprint, // Anchors the markings to this specific PDF
      layers: this.layers,
      stamps: this.stamps,
      sources: this.sources,
      activeSourceId: this.activeSourceId
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ScoreFlow_v1.3_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  handleImport(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result)

        // --- SCORE AUDIT ---
        if (data.fingerprint && this.pdfFingerprint && data.fingerprint !== this.pdfFingerprint) {
          const proceed = confirm(
            "⚠️ SCORE VERSION MISMATCH!\n\n" +
            "The markings you are trying to load belong to a different edition or a different PDF file.\n" +
            "Importing might result in misaligned annotations (wrong bars/beats).\n\n" +
            "Proceed anyway?"
          )
          if (!proceed) return
        }

        const mode = confirm('Import Strategy:\n\n[OK] -> Merge as New Persona (Safe)\n[Cancel] -> Overwrite Everything')

        if (mode) {
          this.importAsNewPersona(data)
        } else {
          this.overwriteProject(data)
        }
      } catch (err) {
        alert('Invalid project file format.')
      }
    }
    reader.readAsText(file)
  }

  importAsNewPersona(data, prefix = "Imported") {
    const newSourceId = 'res_' + Date.now()
    const newSourceName = prompt('Name this imported marking set:', `${prefix} Persona`) || 'New Persona'

    this.sources.push({
      id: newSourceId,
      name: newSourceName,
      visible: true,
      opacity: 0.7,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16)
    })

    const importedStamps = (data.stamps || []).map(s => ({ ...s, sourceId: newSourceId }))
    this.stamps = this.stamps.concat(importedStamps)
    this.saveToStorage()
    location.reload()
  }

  overwriteProject(data) {
    this.layers = data.layers || this.layers
    this.stamps = data.stamps || []
    this.sources = data.sources || this.sources
    this.activeSourceId = data.activeSourceId || (this.sources[0] ? this.sources[0].id : 'self')
    this.saveToStorage()
    location.reload()
  }

  addSource() {
    const name = prompt('Interpretation Style (e.g., Conductor, Soloist, Principal):')
    if (!name) return

    const id = 'src_' + Date.now()
    this.sources.push({
      id,
      name,
      visible: true,
      opacity: 1,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16)
    })
    this.activeSourceId = id
    this.saveToStorage()
    this.renderSourceUI()
  }

  renderSourceUI() {
    if (!this.sourceList) return
    this.sourceList.innerHTML = ''
    // ... Existing Persona UI Logic (no changes needed)
  }

  // --- NEW COMMUNITY FEATURES ---

  async connectCloudFolder() {
    try {
      this.cloudSyncFolder = await window.showDirectoryPicker()
      const statusEl = document.querySelector('.hub-status')
      if (statusEl) statusEl.textContent = `☁️ Syncing: ${this.cloudSyncFolder.name}`
      if (this.syncCloudBtn) this.syncCloudBtn.classList.remove('hidden')

      alert(`✅ Synchronized: ${this.cloudSyncFolder.name}\n\nScoreFlow is now linked to your shared folder. Every interpretation you "Publish" will be saved directly into this directory. If this folder is inside your Google Drive, it will automatically sync to your other orchestral members!`)
      await this.renderCommunityHub()
    } catch (err) {
      console.warn('Cloud Sync connection cancelled or failed:', err)
    }
  }

  async publishWork() {
    const activeProfile = this.profiles.find(p => p.id === this.activeProfileId)
    // Create the digital interpretation package
    const data = {
      id: 'pub_' + Date.now(),
      author: activeProfile.name,
      section: activeProfile.section,
      orchestra: activeProfile.orchestra,
      timestamp: new Date().toLocaleTimeString(),
      layers: this.layers,
      stamps: this.stamps,
      sources: this.sources,
      fingerprint: this.pdfFingerprint
    }

    // 1. Local Cache Implementation
    const communityData = JSON.parse(localStorage.getItem('scoreflow_community') || '[]')
    communityData.unshift(data)
    localStorage.setItem('scoreflow_community', JSON.stringify(communityData.slice(0, 10)))

    // 2. Real Cloud Persistence (if folder connected)
    if (this.cloudSyncFolder) {
      try {
        const fileName = `sf_shared_${activeProfile.name.replace(/\s/g, '_')}_${Date.now()}.json`
        const fileHandle = await this.cloudSyncFolder.getFileHandle(fileName, { create: true })
        const writable = await fileHandle.createWritable()
        await writable.write(JSON.stringify(data, null, 2))
        await writable.close()
        console.log(`Cloud Sync: Published to ${fileName}`)
      } catch (err) {
        alert('Cloud publishing failed. Please check folder permissions.')
      }
    }

    alert(`🚀 Interpretation Published!\n\nYour markings are saved in the shared folder for "${activeProfile.section}". They will now be synchronized by your cloud provider (Google Drive / Dropbox).`)
    this.renderCommunityHub()
  }

  async renderCommunityHub() {
    if (!this.sharedList) return

    // 1. Get local persistent community data (Simulation)
    let communityData = JSON.parse(localStorage.getItem('scoreflow_community') || '[]')

    // 2. Scan for actual Cloud Sync files (Real collaboration)
    if (this.cloudSyncFolder) {
      try {
        const cloudFiles = []
        for await (const [name, handle] of this.cloudSyncFolder.entries()) {
          if (name.endsWith('.json') && name.startsWith('sf_shared_')) {
            const file = await handle.getFile()
            const text = await file.text()
            try {
              const sharedData = JSON.parse(text)
              // Only include if it matches our current PDF fingerprint
              if (sharedData.fingerprint === this.pdfFingerprint) {
                cloudFiles.push(sharedData)
              }
            } catch (pErr) { console.warn('Corrupt JSON in sync folder:', name) }
          }
        }
        // Merge and deduplicate by ID
        const existingIds = new Set(communityData.map(c => c.id))
        cloudFiles.forEach(f => {
          if (!existingIds.has(f.id)) {
            communityData.unshift(f)
            existingIds.add(f.id)
          }
        })
      } catch (err) {
        console.error('Cloud Sync scan failed:', err)
      }
    }

    // Initial Mock Data if absolutely empty
    if (communityData.length === 0) {
      communityData = [
        {
          id: 'mock_1', author: 'Maestro Hsu', section: 'First Violins',
          timestamp: 'Yesterday', stamps: new Array(14),
          layers: [], sources: [{ name: 'Conductor' }]
        }
      ]
    }

    this.sharedList.innerHTML = ''
    communityData.forEach(work => {
      const card = document.createElement('div')
      card.className = 'shared-card'
      card.innerHTML = `
        <div class="card-top">
           <div class="card-title">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>
             ${work.author}
           </div>
           <button class="btn-import-ghost" id="grab-${work.id}">Grab</button>
        </div>
        <div class="card-meta">${work.timestamp} • ${work.section}</div>
        <div class="card-tags">
           <span class="tag">${work.stamps ? work.stamps.length : 0} Annotations</span>
           <span class="tag">Studio: ${work.sources ? work.sources[0].name : 'Primary'}</span>
        </div>
      `

      const grabBtn = card.querySelector(`#grab-${work.id}`)
      if (grabBtn) {
        grabBtn.onclick = (e) => {
          e.stopPropagation()
          this.importSharedWork(work)
        }
      }

      this.sharedList.appendChild(card)
    })
  }

  importSharedWork(work) {
    if (!confirm(`Import markings from ${work.author} (${work.section}) as a new Interpretation Style?`)) return

    const newSourceId = 'hub_' + Date.now()
    const newSourceName = `${work.author} (${work.section})`

    // 1. Create a new source for this imported interpretation
    const newSource = {
      id: newSourceId,
      name: newSourceName,
      visible: true,
      opacity: 0.7, // Default to see-through for comparison
      color: '#' + Math.floor(Math.random() * 16777215).toString(16)
    }
    this.sources.push(newSource)

    // 2. Clone and link the stamps to the new source
    const importedStamps = (work.stamps || [])
      .filter(s => s && s.page) // Robust filter for real objects
      .map(s => ({ ...s, sourceId: newSourceId }))

    this.stamps = this.stamps.concat(importedStamps)
    this.saveToStorage()

    // 3. Update UI immediately
    this.renderSourceUI()
    if (this.pdf) {
      for (let i = 1; i <= this.pdf.numPages; i++) {
        this.redrawStamps(i)
      }
    }
    alert(`${work.author}'s interpretation imported! You can now toggle its visibility in the menu.`)
  }

  // --- MEMBER PROFILE MANAGEMENT ---

  toggleProfileModal(show) {
    if (this.profileModal) {
      this.profileModal.classList.toggle('active', show)
      if (show) this.renderProfileList()
    }
  }

  renderActiveProfile() {
    const active = this.profiles.find(p => p.id === this.activeProfileId) || this.profiles[0]
    if (!active) return

    if (this.profileDisplayName) this.profileDisplayName.textContent = active.name
    if (this.profileDisplayOrchestra) this.profileDisplayOrchestra.textContent = active.orchestra
    if (this.profileAvatarInitial) this.profileAvatarInitial.textContent = active.initial || active.name.charAt(0)

    // Update Section Hub title dynamically
    const statusEl = document.querySelector('.hub-status')
    if (statusEl) statusEl.textContent = `Section: ${active.section}`
  }

  resetToSystemDefault() {
    if (confirm('⚠️ WARNING: Reset ALL App Settings?\n\nThis will clear your Profiles, Interpretation Styles, and Global Configurations. Score markings (stamps) for the current session will remain unless cleared separately.')) {
      const keysToClear = [
        'scoreflow_profiles',
        'scoreflow_active_profile',
        'scoreflow_sources',
        'scoreflow_active_source',
        'scoreflow_layers'
      ]
      keysToClear.forEach(k => localStorage.removeItem(k))
      alert('App System has been reset. Reloading...')
      window.location.reload()
    }
  }

  async selectLibraryFolder() {
    try {
      this.libraryFolderHandle = await window.showDirectoryPicker()
      this.libraryFiles = []
      await this.scanLibrary(this.libraryFolderHandle)
      this.renderLibrary()

      // Switch to Repertoire View on Main Screen
      if (this.welcomeInitialView) this.welcomeInitialView.classList.add('hidden')
      if (this.projectRepertoireView) this.projectRepertoireView.classList.remove('hidden')
      if (this.projectNameDisplay) this.projectNameDisplay.textContent = `Project: ${this.libraryFolderHandle.name}`
      this.renderProjectRepertoire()

      // PERSISTENT RECOVERY: Attempt to auto-open last used score from this folder
      const lastScore = localStorage.getItem('scoreflow_last_opened_score')
      if (lastScore) {
        const found = this.libraryFiles.find(f => f.name === lastScore)
        if (found) {
          const file = await found.getFile()
          const arrayBuffer = await file.arrayBuffer()
          await this.loadPDF(new Uint8Array(arrayBuffer))
          this.activeScoreName = found.name
          this.renderLibrary()
        }
      }
    } catch (err) {
      console.warn('Library selection cancelled:', err)
    }
  }

  renderProjectRepertoire() {
    if (!this.projectScoresList) return
    this.projectScoresList.innerHTML = ''

    const query = this.projectSearchInput ? this.projectSearchInput.value.toLowerCase() : ''
    const filteredFiles = this.libraryFiles.filter(f => f.name.toLowerCase().includes(query))

    if (filteredFiles.length === 0) {
      this.projectScoresList.innerHTML = '<div class="empty-state" style="grid-column: 1/-1">No scores found matching your search.</div>'
      return
    }

    filteredFiles.forEach(fileHandle => {
      const card = document.createElement('div')
      card.className = 'project-score-card'
      card.innerHTML = `
        <div class="project-score-icon">🎼</div>
        <div class="project-score-meta">${fileHandle.name}</div>
      `
      card.onclick = async () => {
        try {
          const file = await this.openFileHandle(fileHandle)
          if (!file) return
          const arrayBuffer = await file.arrayBuffer()
          await this.loadPDF(new Uint8Array(arrayBuffer))
          this.activeScoreName = fileHandle.name
          this.renderLibrary()
          this.saveToStorage()

          if (!this.isSidebarLocked) {
            this.sidebar.classList.remove('open')
            this.updateLayoutState()
          }
        } catch (err) {
          console.error('Error loading project score:', err)
          alert('Could not open the selected score. Please try again.')
        }
      }
      this.projectScoresList.appendChild(card)
    })
  }

  async scanLibrary(directoryHandle) {
    for await (const entry of directoryHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
        this.libraryFiles.push(entry)
      } else if (entry.kind === 'directory') {
        // Flat list approach as requested, but we could recursive if needed
        await this.scanLibrary(entry)
      }
    }
  }

  renderLibrary() {
    if (!this.libraryList) return
    this.libraryList.innerHTML = ''

    const query = this.librarySearchInput ? this.librarySearchInput.value.toLowerCase() : ''
    const filteredFiles = this.libraryFiles.filter(f => f.name.toLowerCase().includes(query))

    if (this.libraryFiles.length === 0) {
      this.libraryList.innerHTML = '<div class="empty-state">Select a folder to load your repertoire.</div>'
      return
    }

    if (filteredFiles.length === 0 && query) {
      this.libraryList.innerHTML = '<div class="empty-state">No matching scores.</div>'
      return
    }

    filteredFiles.forEach(fileHandle => {
      const isActive = this.activeScoreName === fileHandle.name
      const displayName = fileHandle.name.replace(/\.pdf$/i, '')

      const item = document.createElement('div')
      item.className = `score-item ${isActive ? 'active' : ''}`
      item.innerHTML = `
        <div class="score-item-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="score-name">${displayName}</div>
        ${isActive ? '<div class="active-indicator-dot"></div>' : ''}
      `
      item.onclick = async () => {
        try {
          const file = await this.openFileHandle(fileHandle)
          if (!file) return
          const arrayBuffer = await file.arrayBuffer()
          await this.loadPDF(new Uint8Array(arrayBuffer))
          this.activeScoreName = fileHandle.name
          this.saveToStorage()
          this.renderLibrary()
          if (this.projectRepertoireView && !this.projectRepertoireView.classList.contains('hidden')) {
            this.renderProjectRepertoire()
          }
          if (!this.isSidebarLocked) {
            this.sidebar.classList.remove('open')
            this.updateLayoutState()
          }
        } catch (err) {
          console.error('Failed to open score:', fileHandle.name, err)
          alert(`Error opening "${fileHandle.name.replace(/\.pdf$/i, '')}":\n\n${err.message || err}\n\nIf this persists, try re-selecting your library folder.`)
        }
      }
      this.libraryList.appendChild(item)
    })
  }


  renderProfileList() {
    if (!this.profileList) return
    this.profileList.innerHTML = ''

    this.profiles.forEach(p => {
      const isActive = p.id === this.activeProfileId
      const item = document.createElement('div')
      item.className = `profile-selection-item ${isActive ? 'active' : ''}`
      item.innerHTML = `
        <div class="profile-avatar">${p.initial || p.name.charAt(0)}</div>
        <div class="profile-details">
          <div class="profile-name">${p.name}</div>
          <div class="profile-meta">${p.orchestra} • ${p.section}</div>
        </div>
        ${isActive ? '<div class="active-indicator-dot"></div>' : ''}
        ${this.profiles.length > 1 ? `
          <button class="btn-remove-profile" title="Remove Profile">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        ` : ''}
      `

      item.onclick = (e) => {
        if (e.target.closest('.btn-remove-profile')) return
        this.activeProfileId = p.id
        this.saveToStorage()
        this.renderActiveProfile()
        this.renderProfileList()
        this.renderCommunityHub() // Refresh community listings for context
      }

      const delBtn = item.querySelector('.btn-remove-profile')
      if (delBtn) {
        delBtn.onclick = (e) => {
          e.stopPropagation()
          if (confirm(`Delete the profile for ${p.orchestra}?`)) {
            this.profiles = this.profiles.filter(prof => prof.id !== p.id)
            if (this.activeProfileId === p.id) this.activeProfileId = this.profiles[0].id
            this.saveToStorage()
            this.renderActiveProfile()
            this.renderProfileList()
          }
        }
      }

      this.profileList.appendChild(item)
    })
  }

  addNewProfile() {
    const name = prompt('Enter your display name:', 'Victor Hsu')
    if (!name) return
    const orch = prompt('Enter Orchestra or Ensemble name:', 'Taipei Symphony Orchestra')
    if (!orch) return
    const section = prompt('Enter your Section (e.g., First Violins, Principal Cello):', 'First Violins')
    if (!section) return

    const id = 'p_' + Date.now()
    this.profiles.push({
      id,
      name,
      orchestra: orch,
      section,
      initial: name.charAt(0)
    })
    this.activeProfileId = id
    this.saveToStorage()
    this.renderActiveProfile()
    this.renderProfileList()
    this.renderCommunityHub()
  }

  updateLayoutState() {
    const app = document.getElementById('app')
    if (!app) return
    const isOpen = this.sidebar.classList.contains('open')
    app.classList.toggle('is-sidebar-active', isOpen)
  }
}

new ScoreFlow()
