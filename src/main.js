import './style.css'
import * as pdfjsLib from 'pdfjs-dist'
import * as db from './db.js'
import { INITIAL_LAYERS, TOOLSETS } from './constants.js'
import { DocBarManager } from './modules/docbar.js'
import { ViewerManager } from './modules/ViewerManager.js'
import { ProfileManager } from './modules/ProfileManager.js'
import { ScoreDetailManager } from './modules/ScoreDetailManager.js'
import { AnnotationManager } from './modules/annotation/AnnotationManager.js'
//import * as GDrive from './gdrive.js'

// Use local worker for total offline reliability
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs'

// Build constants injected by Vite build process
const APP_BRANCH = typeof __APP_BRANCH__ !== 'undefined' ? __APP_BRANCH__ : 'local-dev';
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'just-now';

class ScoreFlow {
  // ViewerManager Proxies
  get pdf() { return this.viewerManager.pdf }
  set pdf(val) { this.viewerManager.pdf = val }
  get pages() { return this.viewerManager.pages }
  set pages(val) { this.viewerManager.pages = val }
  get scale() { return this.viewerManager.scale }
  set scale(val) { this.viewerManager.scale = val }
  get pdfFingerprint() { return this.viewerManager.pdfFingerprint }
  set pdfFingerprint(val) { this.viewerManager.pdfFingerprint = val }
  get activeScoreName() { return this.viewerManager.activeScoreName }
  set activeScoreName(val) { this.viewerManager.activeScoreName = val }

  async loadPDF(data, filename = null) { return this.viewerManager.loadPDF(data, filename) }
  async renderPDF() { return this.viewerManager.renderPDF() }
  async getFingerprint(buffer) { return this.viewerManager.getFingerprint(buffer) }
  updateZoomDisplay() { return this.viewerManager.updateZoomDisplay() }
  async changeZoom(delta) { return this.viewerManager.changeZoom(delta) }
  async fitToWidth() { return this.viewerManager.fitToWidth() }
  async fitToHeight() { return this.viewerManager.fitToHeight() }
  showMainUI() { return this.viewerManager.showMainUI() }
  hideWelcome() { return this.viewerManager.hideWelcome() }
  async checkInitialView() { return this.viewerManager.checkInitialView() }
  async closeFile() { return this.viewerManager.closeFile() }
  async openFileHandle(handle) { return this.viewerManager.openFileHandle(handle) }

  // AnnotationManager Proxies
  redrawStamps(page) { this.annotationManager.redrawStamps(page) }
  redrawAllAnnotationLayers() { this.annotationManager.redrawAllAnnotationLayers() }
  drawPathOnCanvas(...args) { this.annotationManager.drawPathOnCanvas(...args) }
  drawStampOnCanvas(...args) { this.annotationManager.drawStampOnCanvas(...args) }
  createCaptureOverlay(...args) { this.annotationManager.createCaptureOverlay(...args) }
  isStampTool() { return this.annotationManager.isStampTool() }
  getStampLabel(stamp) { return this.annotationManager.getStampLabel(stamp) }
  getStampIcon(stamp) { return this.annotationManager.getStampIcon(stamp) }
  findNearbyStamps(...args) { return this.annotationManager.findNearbyStamps(...args) }
  findClosestStamp(...args) { return this.annotationManager.findClosestStamp(...args) }
  eraseStampTarget(stamp) { this.annotationManager.eraseStampTarget(stamp) }
  showEraseMenu(...args) { this.annotationManager.showEraseMenu(...args) }
  closeEraseMenu() { this.annotationManager.closeEraseMenu() }
  showEraseAllModal() { this.annotationManager.showEraseAllModal() }
  closeEraseAllModal() { this.annotationManager.closeEraseAllModal() }
  eraseAllByCategory(cat) { this.annotationManager.eraseAllByCategory(cat) }
  showSelectMenu(...args) { this.annotationManager.showSelectMenu(...args) }
  closeSelectMenu() { this.annotationManager.closeSelectMenu() }
  eraseStamp(page, x, y) {
    const target = this.annotationManager.findClosestStamp(page, x, y)
    if (target) this.annotationManager.eraseStampTarget(target)
  }
  async addStamp(page, type, x, y) { return this.annotationManager.addStamp(page, type, x, y) }

  constructor() {
    this.recycleItems = []
    this.nextTargetAnchor = null
    this.jumpHistory = [] // scroll positions before each forward jump
    this.rulerVisible = localStorage.getItem('scoreflow_ruler_visible') !== 'false'
    this.activeLayerId = 'draw'
    this.activeStampType = 'view'
    // Default categories: only Edit, Pens, Bow/Fingering
    this.activeCategories = ['Edit', 'Pens', 'Bow/Fingering']
    this.activeCategory = 'Edit'
    this.isMultiSelectMode = true // Default to High-Density mode for pro musicians
    this.toolbarWidth = 600 // High-Performance Default Width
    this._lastStampType = null // Remember the last used stamp for restoration
    this.lastUsedToolPerCategory = {} // Initialize missing object
    this.sources = [
      { id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' }
    ]
    this.activeSourceId = 'self'
    this.layers = JSON.parse(JSON.stringify(INITIAL_LAYERS))
    this.stamps = []

    this._svgCache = {}
    this.initToolsets()

    this.docBarManager = new DocBarManager(this)
    this.viewerManager = new ViewerManager(this)
    this.profileManager = new ProfileManager(this)
    this.scoreDetailManager = new ScoreDetailManager(this)
    this.annotationManager = new AnnotationManager(this)

    this.initElements()
    this.initEventListeners()
    this.docBarManager.init()
    this.profileManager.init()
    this.scoreDetailManager.init()
    this.initDraggable()
    this.initToolbarResizable()
    this.initSidebarResizable()
    this.loadFromStorage()
    this.renderLayerUI()
    this.renderSourceUI()
    this.updateActiveTools()
    this.renderSidebarRecentScores()
    this.renderWelcomeRecentScores()
    this.viewerManager.checkInitialView()
    this._preloadSvgs()
    this.renderBuildInfo()
  }

  renderBuildInfo() {
    const branchEl = document.getElementById('build-branch')
    const timeEl = document.getElementById('build-time')
    console.log(`[ScoreFlow] Build Info - Branch: ${APP_BRANCH}, Time: ${BUILD_TIME}`)
    if (branchEl) branchEl.textContent = APP_BRANCH
    if (timeEl) timeEl.textContent = BUILD_TIME
  }

  async _preloadSvgs() {
    const existingSvgs = [
      'pen', 'highlighter', 'line',
      'select', 'eraser',
      'anchor'
    ]
    const base = import.meta.env.BASE_URL
    const items = this.toolsets.flatMap(g =>
      g.tools.filter(t => existingSvgs.includes(t.id)).map(t => ({ id: t.id, path: `${base}assets/icons/${g.type}/${t.id}.svg` }))
    )
    await Promise.allSettled(items.map(async ({ id, path }) => {
      try {
        const r = await fetch(path)
        if (r.ok) this._svgCache[id] = await r.text()
      } catch { }
    }))
    this.updateActiveTools()
  }

  initToolsets() {
    this.toolsets = TOOLSETS
  }

  initElements() {
    this.container = document.getElementById('pdf-viewer')
    this.uploader = document.getElementById('pdf-upload')
    this.uploadBtn = document.getElementById('upload-btn')
    this.openPdfBtn = document.getElementById('open-pdf-btn')
    this.sidebar = document.getElementById('sidebar')
    this.sidebarTrigger = document.getElementById('sidebar-trigger')
    this.layerList = document.getElementById('layer-list')
    this.zoomInBtn = document.getElementById('zoom-in')
    this.zoomOutBtn = document.getElementById('zoom-out')
    this.zoomLevelDisplay = document.getElementById('zoom-level')
    this.btnFitWidth = document.getElementById('btn-fit-width')
    this.btnFitHeight = document.getElementById('btn-fit-height')
    this.clearStampsBtn = document.getElementById('clear-stamps-btn')
    this.shortcutsModal = document.getElementById('shortcuts-modal')
    this.closeShortcutsBtn = document.getElementById('close-shortcuts')
    this.closeSidebarBtn = document.getElementById('close-sidebar')
    this.viewer = document.getElementById('viewer-container')
    this.activeToolsContainer = document.getElementById('active-tools-container')
    this.jumpLine = document.getElementById('jump-line')
    this.jumpOffsetInput = document.getElementById('jump-offset')
    this.jumpOffsetValue = document.getElementById('jump-offset-value')
    this.docBar = document.getElementById('floating-doc-bar')
    this.exportBtn = document.getElementById('export-score-btn')
    this.importBtn = document.getElementById('import-score-btn')
    this.importFileInput = document.getElementById('import-score-file')
    this.globalExportBtn = document.getElementById('export-btn') // Backup reference
    this.globalImportBtn = document.getElementById('import-btn')
    this.globalImportFile = document.getElementById('import-file')
    this.sourceList = document.getElementById('source-list')
    this.addSourceBtn = document.getElementById('add-source-btn')

    // Score Detail Elements - Handled by ScoreDetailManager

    // Quick Load Elements
    this.quickLoadModal = document.getElementById('quick-load-modal')
    this.closeQuickLoadBtn = document.getElementById('close-quick-load-modal')
    this.recentScoresList = document.getElementById('recent-scores-list')
    this.openNewSoloBtn = document.getElementById('open-new-solo-btn')
    this.sidebarRecentList = document.getElementById('sidebar-recent-list')
    this.clearRecentBtn = document.getElementById('clear-recent-btn')


    // Member Profile Elements

    // Member Profile Elements

    this.welcomeView = document.getElementById('welcome-view')
    this.welcomeOpenFileBtn = document.getElementById('welcome-open-file-alt')
    this.welcomeRecentList = document.getElementById('welcome-recent-list')
    this.closeFileBtn = document.getElementById('close-file-btn')

    this.resetLayersBtn = document.getElementById('reset-layers-btn')
    this.resetSystemBtn = document.getElementById('reset-system-btn')

    // Jump & Mode UI
    this.btnJumpHead = document.getElementById('btn-jump-head')
    this.btnJumpEnd = document.getElementById('btn-jump-end')
    this.btnRulerToggle = document.getElementById('btn-ruler-toggle')
    this.btnFullscreen = document.getElementById('btn-fullscreen')
    this.btnModeAnchor = document.getElementById('btn-mode-anchor')
    this.btnModeEraser = document.getElementById('btn-mode-eraser')
    this.btnEraseAll = document.getElementById('btn-erase-all')
    this.eraseAllModal = document.getElementById('erase-all-modal')
    this.btnModeHand = document.getElementById('btn-mode-hand')
    this.btnStampPalette = document.getElementById('btn-stamp-palette')


    this.jumpOffsetPx = 1 * 37.8

    // Resizer
    this.sidebarResizer = document.getElementById('sidebar-resizer')
    this.externalLayerList = document.getElementById('external-layer-list')

    // Dialog Elements
    this.systemDialog = document.getElementById('system-dialog')
    this.dialogTitle = document.getElementById('dialog-title')
    this.dialogMessage = document.getElementById('dialog-message')
    this.dialogIcon = document.getElementById('dialog-icon')
    this.dialogActions = document.getElementById('dialog-actions')
    this.closeDialogBtn = document.getElementById('close-dialog')

    // Wire CSS tooltips from title attributes on all doc-bar buttons
    document.querySelectorAll('.zoom-btn-mini[title]').forEach(btn => {
      btn.dataset.tooltip = btn.title
    })
  }

  initEventListeners() {
    if (this.uploadBtn) {
      this.uploadBtn.addEventListener('click', () => this.uploader.click())
    }
    if (this.openPdfBtn) {
      // Desktop: use File System Access API for persistent handles
      // iOS: openPdfFilePicker detects iOS and calls uploader.click() synchronously
      this.openPdfBtn.addEventListener('click', () => this.openPdfFilePicker())
    }
    if (this.clearRecentBtn) {
      this.clearRecentBtn.addEventListener('click', async () => {
        if (!this.recentSoloScores?.length) return
        // Remove cached buffers and handles from IDB
        for (const s of this.recentSoloScores) {
          await db.set(`recent_buf_${s.name}`, undefined)
          await db.set(`recent_handle_${s.name}`, undefined)
        }
        this.recentSoloScores = []
        this.saveToStorage()
        this.renderSidebarRecentScores()
      })
    }
    this.uploader.addEventListener('change', (e) => this.handleUpload(e))

    // Score Detail Listeners - Handled by ScoreDetailManager

    this.sidebarTrigger.addEventListener('click', () => {
      this.sidebar.classList.add('open')
      this.updateLayoutState()
    })

    // iPad: tap outside sidebar to close it - Removed for "No auto collapse"


    // Exchange Listeners (Score-Specific)
    if (this.exportBtn) this.exportBtn.addEventListener('click', () => this.exportProject())
    if (this.importBtn) this.importBtn.addEventListener('click', () => this.importFileInput.click())
    if (this.importFileInput) this.importFileInput.addEventListener('change', (e) => this.handleImport(e))

    // Global Backup Listeners (Settings Tab)
    if (this.globalExportBtn) this.globalExportBtn.addEventListener('click', () => this.exportProject(true))
    if (this.globalImportBtn) this.globalImportBtn.addEventListener('click', () => this.globalImportFile.click())
    if (this.globalImportFile) this.globalImportFile.addEventListener('change', (e) => this.handleImport(e))

    // Dialog Close
    if (this.closeDialogBtn) {
      this.closeDialogBtn.addEventListener('click', () => {
        this.systemDialog.classList.remove('active')
      })
    }


    if (this.addSourceBtn) {
      this.addSourceBtn.addEventListener('click', () => this.addSource())
    }

    if (this.resetSystemBtn) {
      this.resetSystemBtn.addEventListener('click', () => this.resetToSystemDefault())
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

    if (this.closeFileBtn) {
      this.closeFileBtn.addEventListener('click', () => this.viewerManager.closeFile())
    }

    // Welcome Screen Hooks
    if (this.welcomeOpenFileBtn) {
      // iOS Safari blocks programmatic .click() inside async functions,
      // so we must call uploader.click() synchronously on iOS.
      this.welcomeOpenFileBtn.addEventListener('click', () => {
        if (window.showOpenFilePicker) {
          this.openPdfFilePicker()  // Desktop: persistent file handles
        } else {
          this.uploader.click()  // iOS: direct synchronous click
        }
      })
    }
    if (this.projectBackBtn) {
    }

    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener('click', () => this.viewerManager.changeZoom(0.1))
    }
    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener('click', () => this.viewerManager.changeZoom(-0.1))
    }
    if (this.btnFitWidth) {
      this.btnFitWidth.addEventListener('click', () => this.viewerManager.fitToWidth())
    }
    if (this.btnFitHeight) {
      this.btnFitHeight.addEventListener('click', () => this.viewerManager.fitToHeight())
    }

    if (this.closeShortcutsBtn) {
      this.closeShortcutsBtn.addEventListener('click', () => this.toggleShortcuts(false))
    }

    if (this.closeSidebarBtn) {
      this.closeSidebarBtn.addEventListener('click', () => {
        this.sidebar.classList.remove('open')
      })
    }

    if (this.resetLayersBtn) {
      this.resetLayersBtn.addEventListener('click', () => this.resetLayers())
    }



    if (this.closeFileBtn) {
      this.closeFileBtn.addEventListener('click', () => this.closeFile())
    }

    // Navigation (Jump) Actions
    if (this.btnJumpHead) this.btnJumpHead.onclick = () => this.goToHead()
    if (this.btnJumpEnd) this.btnJumpEnd.onclick = () => this.goToEnd()
    if (this.btnRulerToggle) this.btnRulerToggle.addEventListener('click', () => this.toggleRuler())
    if (this.btnFullscreen) this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen())

    // Quick Mode Actions
    if (this.btnModeEraser) {
      this.btnModeEraser.onclick = () => {
        this.activeStampType = this.activeStampType === 'eraser' ? 'view' : 'eraser'
        this.updateActiveTools()
      }
    }
    if (this.btnEraseAll) {
      this.btnEraseAll.onclick = () => this.showEraseAllModal()
    }
    document.getElementById('close-erase-all-modal')?.addEventListener('click', () => this.closeEraseAllModal())
    document.getElementById('erase-all-cancel')?.addEventListener('click', () => this.closeEraseAllModal())
    if (this.btnModeHand) {
      this.btnModeHand.onclick = () => {
        this.activeStampType = 'view'
        this.updateActiveTools()
      }
    }
    if (this.btnModeAnchor) {
      this.btnModeAnchor.onclick = () => {
        this.activeStampType = this.activeStampType === 'anchor' ? 'view' : 'anchor'
        this.updateActiveTools()
      }
    }
    if (this.btnStampPalette) {
      this.btnStampPalette.addEventListener('click', () => {
        this.toggleStampPalette()
      })
    }

    // Double-tap (touch, iPad) OR dblclick (PC mouse) to toggle stamp palette
    if (this.viewer) {
      // iPad / touch: two taps within 300ms
      let lastTapTime = 0
      this.viewer.addEventListener('touchend', (e) => {
        if (e.target.closest('button, .floating-stamp-bar, .floating-doc-bar')) return
        const now = Date.now()
        const diff = now - lastTapTime
        if (diff < 300 && diff > 0) {
          e.preventDefault()
          this.toggleStampPalette()
          lastTapTime = 0
        } else {
          lastTapTime = now
        }
      }, { passive: false })

      // PC mouse: native dblclick
      this.viewer.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, .floating-stamp-bar, .floating-doc-bar')) return
        this.toggleStampPalette()
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

    // Draggable Jump Line Indicator
    const handle = document.querySelector('.jump-line-handle')
    if (handle) {
      let isDraggingRuler = false
      handle.addEventListener('mousedown', (e) => {
        isDraggingRuler = true
        e.preventDefault() // prevent text selection
      })
      window.addEventListener('mousemove', (e) => {
        if (!isDraggingRuler) return
        let newY = e.clientY
        // Clamp to sane values
        if (newY < 0) newY = 0
        if (newY > window.innerHeight - 50) newY = window.innerHeight - 50

        this.jumpOffsetPx = newY
        this.updateJumpLinePosition()

        // Update input range backwards if it's open
        if (this.jumpOffsetInput) {
          const cm = newY / 37.8
          this.jumpOffsetInput.value = cm
          if (this.jumpOffsetValue) this.jumpOffsetValue.textContent = `${cm.toFixed(1)}cm`
        }
      })
      window.addEventListener('mouseup', () => {
        if (isDraggingRuler) {
          isDraggingRuler = false
          // Flash the jump line beam to confirm setting
          const beam = document.querySelector('.jump-line-beam')
          if (beam) {
            beam.style.opacity = '1'
            setTimeout(() => beam.style.opacity = '', 500)
          }
        }
      })

      // Touch support for dragging
      handle.addEventListener('touchstart', (e) => {
        isDraggingRuler = true
        e.stopPropagation(); // prevent page scroll
      }, { passive: false })
      window.addEventListener('touchmove', (e) => {
        if (!isDraggingRuler) return
        e.preventDefault() // prevent page scroll
        let newY = e.touches[0].clientY
        if (newY < 0) newY = 0
        if (newY > window.innerHeight - 50) newY = window.innerHeight - 50

        this.jumpOffsetPx = newY
        this.updateJumpLinePosition()

        if (this.jumpOffsetInput) {
          const cm = newY / 37.8
          this.jumpOffsetInput.value = cm
          if (this.jumpOffsetValue) this.jumpOffsetValue.textContent = `${cm.toFixed(1)}cm`
        }
      }, { passive: false })
      window.addEventListener('touchend', () => {
        isDraggingRuler = false
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

      // Quick Modes (toggle: press again to return to view mode)
      if (e.key.toLowerCase() === 'v') {
        this.activeStampType = this.activeStampType === 'select' ? 'view' : 'select'
        this.updateActiveTools()
      }
      if (e.key.toLowerCase() === 'b') {
        this.toggleDocBar()
      }
      if (e.key.toLowerCase() === 'e') {
        this.activeStampType = this.activeStampType === 'eraser' ? 'view' : 'eraser'
        this.updateActiveTools()
      }
      if (e.key.toLowerCase() === 'a') {
        this.activeStampType = this.activeStampType === 'anchor' ? 'view' : 'anchor'
        this.updateActiveTools()
      }
      if (e.key.toLowerCase() === 'r') {
        this.toggleRuler()
      }
      if (e.key.toLowerCase() === 'g') {
        this.toggleFullscreen()
      }

      // Esc: close all + return to view mode
      if (e.key === 'Escape') {
        this.toggleShortcuts(false)
        this.sidebar.classList.remove('open')
        this.activeStampType = 'view'
        this.updateActiveTools()
      }

      // Zoom
      if (e.key === '=' || e.key === '+' || e.key === 'Add') {
        this.changeZoom(0.1)
      }
      if (e.key === '-' || e.key === '_' || e.key === 'Subtract') {
        this.changeZoom(-0.1)
      }
      if (e.key.toLowerCase() === 'w') {
        this.fitToWidth()
      }
      if (e.key.toLowerCase() === 'f') {
        this.fitToHeight()
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

      // Page Turner Settings Logic
      let isForward = false;
      let isBackward = false;
      const turnerMode = document.getElementById('turner-mode-select') ? document.getElementById('turner-mode-select').value : 'default';

      switch (turnerMode) {
        case 'pgupdn':
          if (e.key === 'PageDown') isForward = true;
          if (e.key === 'PageUp') isBackward = true;
          break;
        case 'arrows':
          if (e.key === 'ArrowDown' || e.key === 'ArrowRight') isForward = true;
          if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') isBackward = true;
          break;
        case 'default':
        case 'custom':
        default:
          // Musical Flow (Standardized J/K and Space, + Page Turner Support)
          if (e.key === ' ' || e.key.toLowerCase() === 'j' || e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
            if (e.shiftKey && e.key === ' ') {
              isBackward = true;
            } else {
              isForward = true;
            }
          }
          if (e.key.toLowerCase() === 'k' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
            isBackward = true;
          }
          break;
      }

      if (isForward) {
        e.preventDefault()
        this.jump(1)
      } else if (isBackward) {
        e.preventDefault()
        this.jump(-1)
      }
    })

    // Sidebar Tab Switcher
    const tabs = this.sidebar.querySelectorAll('.sidebar-tab')
    const panels = this.sidebar.querySelectorAll('.tab-panel')

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab

        // Update Tabs
        tabs.forEach(t => t.classList.toggle('active', t === tab))

        // Update Panels
        panels.forEach(p => p.classList.toggle('active', p.dataset.panel === target))

        // Performance Optimization: Only refresh stats when opening Detail tab
        if (target === 'orchestra' && this.scoreDetailManager) {
          this.scoreDetailManager.refreshStats()
        }
      })
    })

    // Handle responsiveness/resizing
    window.addEventListener('resize', () => {
      if (this.pdf) this.renderPDF()
      else this.updateRulerPosition()
    })

    // iPad Swipe Gesture: swipe up = next anchor, swipe down = prev anchor
    let swipeStartY = 0, swipeStartX = 0, swipeStartTime = 0
    const viewer = document.getElementById('viewer-container')
    if (viewer) {
      viewer.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return
        swipeStartY = e.touches[0].clientY
        swipeStartX = e.touches[0].clientX
        swipeStartTime = Date.now()
      }, { passive: true })
      viewer.addEventListener('touchend', (e) => {
        if (e.changedTouches.length !== 1) return
        const dy = swipeStartY - e.changedTouches[0].clientY
        const dx = swipeStartX - e.changedTouches[0].clientX
        const dt = Date.now() - swipeStartTime
        // Fast (<400ms), mostly vertical, long enough (>60px)
        if (dt < 400 && Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
          dy > 0 ? this.jump(1) : this.jump(-1)
        }
      }, { passive: true })

      // Scroll event for dynamic anchor marks on ruler
      let scrollTicking = false
      viewer.addEventListener('scroll', () => {
        if (!scrollTicking) {
          window.requestAnimationFrame(() => {
            this.updateRulerMarks()
            this.updateRulerClip()
            this.computeNextTarget()
            // Redraw visible pages so anchor colors update in real-time
            if (this.pdf) {
              for (let i = 1; i <= this.pdf.numPages; i++) {
                const pageElem = document.querySelector(`.page-container[data-page="${i}"]`)
                if (pageElem) {
                  const rect = pageElem.getBoundingClientRect()
                  if (rect.bottom > 0 && rect.top < window.innerHeight) {
                    this.redrawStamps(i)
                  }
                }
              }
            }
            scrollTicking = false
          })
          scrollTicking = true
        }
      }, { passive: true })
    }
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

    const loaderId = 'ipad-upload-loader'
    let loader = document.getElementById(loaderId)
    if (!loader) {
      loader = document.createElement('div')
      loader.id = loaderId
      loader.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);color:white;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:99999;font-family:Outfit,sans-serif;'
      document.body.appendChild(loader)
    }
    loader.innerHTML = `
      <div style="border:4px solid rgba(255,255,255,0.2);border-top:4px solid #3b82f6;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;margin-bottom:20px;"></div>
      <style>@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>
      <h2 style="font-weight:400;margin:0;text-align:center;padding:0 20px;">Opening ${file.name}...</h2>
      <p style="opacity:0.7;margin-top:10px;text-align:center;max-width:80%;">Please wait while the file is processed.</p>
      <p style="opacity:0.4;font-size:14px;text-align:center;max-width:80%;">If this is an iCloud file, your device may need time to download it.</p>
    `
    loader.style.display = 'flex'

    const cleanup = () => { if (loader) loader.style.display = 'none' }

    try {
      const reader = new FileReader()
      reader.onerror = (err) => {
        console.error('FileReader error:', err)
        cleanup()
        alert('Error reading the file from your device.')
      }

      reader.onload = async (event) => {
        const buffer = event.target.result
        try {
          // Store a copy before loadPDF — PDF.js transfers (detaches) the buffer to its worker
          await db.set(`recent_buf_${file.name}`, buffer.slice(0))
          await this.loadPDF(new Uint8Array(buffer), file.name)
          this.addToRecentSoloScores(file.name)
          this.saveToStorage()
        } catch (pdfErr) {
          console.error('PDF.js Error:', pdfErr)
          alert('Failed to construct PDF. The file might be corrupted.')
        } finally {
          cleanup()
        }
      }
      reader.readAsArrayBuffer(file)
    } catch (err) {
      console.error('General upload error:', err)
      cleanup()
    } finally {
      // Clear value so the same file selected next time still fires the change event
      e.target.value = ''
    }
  }


  async openPdfFilePicker() {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'PDF Files', accept: { 'application/pdf': ['.pdf'] } }],
          multiple: false,
        })
        const file = await handle.getFile()
        const buf = await file.arrayBuffer()
        // Cache the buffer too for more reliable reopen without permission prompts
        await db.set(`recent_buf_${file.name}`, buf.slice(0))
        await this.loadPDF(new Uint8Array(buf), file.name)
        await db.set(`recent_handle_${file.name}`, handle)
        this.addToRecentSoloScores(file.name)
        this.saveToStorage()
      } catch (e) {
        if (e.name !== 'AbortError') console.error('openPdfFilePicker:', e)
      }
    } else {
      // iOS Safari fallback — no persistent handle, but file still opens
      this.uploader.click()
    }
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


  createAnnotationLayers(wrapper, pageNum, width, height) {
    const canvas = document.createElement('canvas')
    canvas.className = 'annotation-layer virtual-canvas'
    canvas.dataset.page = pageNum
    canvas.width = width
    canvas.height = height
    wrapper.appendChild(canvas)
  }

  // AddStamp moved to AnnotationManager

  updateActiveTools(forceShowDropdown = false) {
    this.activeToolsContainer.innerHTML = ""

    // Check if expanded or collapsed
    const isExpanded = this.activeToolsContainer.classList.contains("expanded")

    // Always sync the active tool to the viewer so CSS cursors & overlay work
    if (this.viewer) {
      if (this.viewer.dataset.activeTool !== this.activeStampType) {
        this.viewer.dataset.activeTool = this.activeStampType
        // Redraw all layers to show/hide interactive shadows (e.g. for Select tool)
        this.redrawAllAnnotationLayers()
      }
    }

    // Sync Mode Buttons in Doc Bar
    if (this.btnModeHand) this.btnModeHand.classList.toggle('active', this.activeStampType === 'view')
    if (this.btnModeSelect) this.btnModeSelect.classList.toggle('active', this.activeStampType === 'select')
    if (this.btnModeEraser) this.btnModeEraser.classList.toggle('active', this.activeStampType === 'eraser')
    if (this.btnModeAnchor) this.btnModeAnchor.classList.toggle('active', this.activeStampType === 'anchor')
    // Sync stamp palette button — show active tool icon when a stamp is selected
    const activeTool = this.toolsets.flatMap(g => g.tools).find(t => t.id === this.activeStampType)
    if (this.btnStampPalette) {
      this.btnStampPalette.classList.toggle('active', isExpanded || !!activeTool)
      if (!this._stampBtnDefault) this._stampBtnDefault = this.btnStampPalette.innerHTML
      this.btnStampPalette.innerHTML = activeTool
        ? this.getIcon(activeTool, 18)
        : this._stampBtnDefault
    }

    if (!isExpanded) {
      // Palette is hidden — nothing to render
      this.activeToolsContainer.onclick = null
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
    // Only close on click — not if the user dragged (indicated by _dragMoved flag set in initDraggable)
    handle.addEventListener('click', (e) => {
      e.stopPropagation()
      if (this._stampDragMoved) {
        this._stampDragMoved = false
        return // was a drag, not a tap — ignore
      }
      this.toggleStampPalette()
    })

    // iPad: double-tap handle to toggle (collapse/expand)
    let lastGripTap = 0
    handle.addEventListener('touchend', (e) => {
      const now = Date.now()
      const timeSinceLast = now - lastGripTap
      if (timeSinceLast < 300 && timeSinceLast > 0) {
        e.preventDefault()
        e.stopPropagation()
        this.toggleStampPalette()
        lastGripTap = 0
      } else {
        lastGripTap = now
      }
    }, { passive: false })

    // PC: dblclick handle to toggle
    handle.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      this.toggleStampPalette()
    })

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
        this.saveToStorage()
        this.updateActiveTools()
      }
      ribbon.appendChild(pill)
    })

    header.appendChild(handle)
    header.appendChild(ribbon)
    this.activeToolsContainer.appendChild(header)

    // -- SPECIAL MODE: RECYCLE BIN --
    if (this.activeStampType === "recycle-bin") {
      const binContainer = document.createElement("div")
      binContainer.className = "recycle-bin-view"

      const binHeader = document.createElement("div")
      binHeader.className = "bin-header"
      binHeader.innerHTML = `<h3>Recycle Bin</h3><p>Select stamps on score to move them here.</p>`

      const closeBtn = document.createElement("button")
      closeBtn.className = "bin-close-btn"
      closeBtn.textContent = "Back to Tools"
      closeBtn.onclick = () => { this.activeStampType = "view"; this.updateActiveTools() }
      binHeader.appendChild(closeBtn)
      binContainer.appendChild(binHeader)

      if (this.recycleItems.length === 0) {
        const empty = document.createElement("div")
        empty.className = "bin-empty"
        empty.textContent = "Bin is empty."
        binContainer.appendChild(empty)
      } else {
        const binGrid = document.createElement("div")
        binGrid.className = "bin-grid"
        this.recycleItems.forEach((item, idx) => {
          const slot = document.createElement("div")
          slot.className = "bin-slot"

          // Render a preview of the recycled item
          const preview = document.createElement("div")
          preview.className = "bin-item-preview"
          preview.innerHTML = this.getIcon({ id: item.type, icon: item.icon || "" }, 30)

          slot.onclick = () => {
            // Pick it back up: Set as active stamp and remove from bin
            this.activeStampType = item.type
            this.recycleItems.splice(idx, 1)
            this.updateActiveTools()
          }

          const label = document.createElement("span")
          label.className = "bin-item-label"
          label.textContent = item.label || item.type

          slot.appendChild(preview)
          slot.appendChild(label)
          binGrid.appendChild(slot)
        })
        binContainer.appendChild(binGrid)
      }

      this.activeToolsContainer.appendChild(binContainer)
    } else {
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
          btn.title = tool.label
          btn.dataset.tooltip = tool.label
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
    }


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
        this.activeToolsContainer.style.overflowY = "hidden" // Ensure no scrollbars ever show
      }
    }, 0)
  }

  getIcon(tool, size = 24) {
    if (this._svgCache?.[tool.id]) {
      // Strip existing width/height and inject the correct size
      return this._svgCache[tool.id].replace(/<svg\b([^>]*)>/, (_, attrs) => {
        const a = attrs.replace(/\s+width="[^"]*"/, '').replace(/\s+height="[^"]*"/, '')
        return `<svg${a} width="${size}" height="${size}">`
      })
    }
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke="currentColor" stroke-width="1.3" fill="none">${tool.icon}</svg>`
  }

  initToolbarResizable() {
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
      // Dragging to the RIGHT (positive deltaX) now INCREASES width
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

  initSidebarResizable() {
    let isResizing = false
    let initialX, initialWidth
    const sidebar = this.sidebar

    const handleMouseDown = (e) => {
      isResizing = true
      initialX = e.clientX || (e.touches && e.touches[0].clientX)
      initialWidth = sidebar.offsetWidth
      sidebar.classList.add('resizing')
      document.body.style.cursor = 'ew-resize'
      e.preventDefault()
    }

    const handleMouseMove = (e) => {
      if (!isResizing) return
      const currentX = e.clientX || (e.touches && e.touches[0].clientX)
      // Since sidebar is on the right, moving X to the left (smaller X) increases width
      const deltaX = initialX - currentX
      const newWidth = Math.min(Math.max(280, initialWidth + deltaX), 800)

      document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`)
    }

    const handleMouseUp = () => {
      if (isResizing) {
        isResizing = false
        sidebar.classList.remove('resizing')
        document.body.style.cursor = ''
      }
    }

    if (this.sidebarResizer) {
      this.sidebarResizer.addEventListener('mousedown', handleMouseDown)
      this.sidebarResizer.addEventListener('touchstart', handleMouseDown, { passive: false })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('touchmove', handleMouseMove, { passive: false })
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchend', handleMouseUp)
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
    // Limit to 15
    if (this.recentSoloScores.length > 15) this.recentSoloScores.pop()
    this.saveToStorage()
    this.renderSidebarRecentScores()
    this.renderWelcomeRecentScores()
  }

  async openRecentScore(name) {
    try {
      // 1. Try stored FileSystemFileHandle (from showOpenFilePicker)
      const storedHandle = await db.get(`recent_handle_${name}`)
      if (storedHandle) {
        const file = await this.openFileHandle(storedHandle)
        if (file) {
          const buf = await file.arrayBuffer()
          await this.loadPDF(new Uint8Array(buf), name)
          this.toggleQuickLoadModal(false)
          return true
        }
      }

      // 2. Try cached ArrayBuffer (fallback for all)
      const cachedBuf = await db.get(`recent_buf_${name}`)
      if (cachedBuf) {
        await this.loadPDF(new Uint8Array(cachedBuf), name)
        this.toggleQuickLoadModal(false)
        return true
      }

      // 3. Try current project folder (Library)
      if (this.libraryFiles) {
        const libraryMatch = this.libraryFiles.find(f => f.name === name)
        if (libraryMatch) {
          const file = await this.openFileHandle(libraryMatch)
          if (file) {
            const buf = await file.arrayBuffer()
            await this.loadPDF(new Uint8Array(buf), name)
            this.toggleQuickLoadModal(false)
            return true
          }
        }
      }

      alert(`Cannot reopen "${name}" directly.\n\nPlease use "Open PDF..." to locate the file again.`)
      return false
    } catch (err) {
      console.error('Failed to open recent score:', err)
      return false
    }
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
      card.onclick = () => this.openRecentScore(score.name)
      this.recentScoresList.appendChild(card)
    })
  }

  renderWelcomeRecentScores() {
    if (!this.welcomeRecentList) return
    this.welcomeRecentList.innerHTML = ''
    if (!this.recentSoloScores || this.recentSoloScores.length === 0) {
      this.welcomeRecentList.innerHTML = '<div class="empty-state">No recent scores yet.</div>'
      return
    }
    this.recentSoloScores.forEach(score => {
      const item = document.createElement('div')
      item.className = 'sidebar-recent-item'
      item.title = score.name
      item.innerHTML = `
        <span class="sidebar-recent-icon">🎼</span>
        <span class="sidebar-recent-name">${score.name.replace(/\.pdf$/i, '')}</span>
        <span class="sidebar-recent-date">${score.date}</span>
      `
      item.onclick = () => this.openRecentScore(score.name)
      this.welcomeRecentList.appendChild(item)
    })
  }

  renderSidebarRecentScores() {
    if (!this.sidebarRecentList) return
    this.sidebarRecentList.innerHTML = ''

    if (!this.recentSoloScores || this.recentSoloScores.length === 0) {
      this.sidebarRecentList.innerHTML = '<div class="empty-state">No recent scores yet.</div>'
      return
    }

    this.recentSoloScores.forEach(score => {
      const item = document.createElement('div')
      item.className = 'sidebar-recent-item'
      item.title = score.name
      item.innerHTML = `
        <span class="sidebar-recent-icon">🎼</span>
        <span class="sidebar-recent-name">${score.name.replace(/\.pdf$/i, '')}</span>
        <span class="sidebar-recent-date">${score.date}</span>
      `
      item.onclick = () => this.openRecentScore(score.name)
      this.sidebarRecentList.appendChild(item)
    })
  }

  // Placeholder for logic moved to AnnotationManager

  toggleStampPalette() {
    // 🛡️ Global Debounce for iPad / rapid interaction
    const now = Date.now()
    if (this._lastPaletteToggleTime && (now - this._lastPaletteToggleTime < 350)) {
      return
    }
    this._lastPaletteToggleTime = now

    const el = this.activeToolsContainer
    const isExpanding = !el.classList.contains('expanded')

    if (isExpanding) {
      el.classList.add('expanded')
      // Always open in view mode to prevent accidental drawing on panel open
    } else {
      el.classList.remove('expanded')
      // When panel closes, reset to view mode to avoid accidental stamps
      if (this.activeStampType !== 'view' && this.activeStampType !== 'select' && this.activeStampType !== 'eraser' && this.activeStampType !== 'anchor') {
        this.activeStampType = 'view'
      }
    }

    this.updateActiveTools()
  }

  initDraggable() {
    let isDragging = false
    let startMouseX, startMouseY, startLeft, startTop
    let touchStartY = 0
    const el = this.activeToolsContainer

    const dragStart = (clientX, clientY, target) => {
      if (!target.closest(".drag-handle") && !target.closest(".active-tool-fab")) return

      if (!el._positionMaterialized) {
        const rect = el.getBoundingClientRect()
        el.style.left = rect.left + 'px'
        el.style.top = rect.top + 'px'
        el.style.bottom = 'auto'
        el.style.transform = 'none'
        el._positionMaterialized = true
      }

      startMouseX = clientX
      startMouseY = clientY
      startLeft = parseFloat(el.style.left) || 0
      startTop = parseFloat(el.style.top) || 0
      isDragging = true
      this._stampDragMoved = false
    }

    const drag = (clientX, clientY) => {
      if (!isDragging) return
      const dx = clientX - startMouseX
      const dy = clientY - startMouseY
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) this._stampDragMoved = true
      el.style.left = (startLeft + dx) + 'px'
      el.style.top = (startTop + dy) + 'px'
    }

    const dragEnd = () => {
      isDragging = false
    }

    // Mouse events
    el.addEventListener("mousedown", (e) => dragStart(e.clientX, e.clientY, e.target))
    document.addEventListener("mousemove", (e) => { if (isDragging) { e.preventDefault(); drag(e.clientX, e.clientY) } })
    document.addEventListener("mouseup", dragEnd)

    // iPad / Touch - Unified Handler
    el.addEventListener("touchstart", (e) => {
      e.stopPropagation() // Always prevent background scroll start
      if (e.target.closest(".drag-handle")) {
        dragStart(e.touches[0].clientX, e.touches[0].clientY, e.target)
        if (isDragging) e.preventDefault()
      } else {
        // Prepare for swipe-to-close
        touchStartY = e.touches[0].clientY
      }
    }, { passive: false })

    document.addEventListener("touchmove", (e) => {
      if (isDragging) {
        e.preventDefault()
        e.stopPropagation()
        drag(e.touches[0].clientX, e.touches[0].clientY)
      } else if (el.contains(e.target)) {
        e.stopPropagation()
        // If not scrolling panel content, block background scroll
        if (el.style.overflowY !== 'auto') {
          e.preventDefault()
        }
      }
    }, { passive: false })

    document.addEventListener("touchend", (e) => {
      if (isDragging) {
        dragEnd()
        e.stopPropagation()
      } else if (el.contains(e.target)) {
        e.stopPropagation()
        // Check for vertical swipe to close
        if (touchStartY !== 0 && e.changedTouches.length === 1) {
          const deltaY = e.changedTouches[0].clientY - touchStartY
          if (Math.abs(deltaY) > 60) {
            this.toggleStampPalette()
          }
        }
      }
      touchStartY = 0
    }, { passive: false })
  }

  cleanupAnchors(page) {
    const anchors = this.stamps.filter(s => s.page === page && s.type === 'anchor')
    if (anchors.length <= 1) return false

    // Sort by Y (highest Y is at the bottom of the page)
    anchors.sort((a, b) => a.y - b.y)

    let stampsToRemove = []
    let currentCluster = []

    anchors.forEach(stamp => {
      if (currentCluster.length === 0) {
        currentCluster.push(stamp)
      } else {
        // 1/3 page range merging (0.33)
        if (stamp.y - currentCluster[0].y <= 0.333) {
          currentCluster.push(stamp)
        } else {
          // Keep the lowest one (max Y)
          const winner = currentCluster.reduce((max, cur) => cur.y > max.y ? cur : max)
          currentCluster.forEach(s => {
            if (s !== winner) stampsToRemove.push(s)
          })
          currentCluster = [stamp]
        }
      }
    })

    if (currentCluster.length > 0) {
      const winner = currentCluster.reduce((max, cur) => cur.y > max.y ? cur : max)
      currentCluster.forEach(s => {
        if (s !== winner) stampsToRemove.push(s)
      })
    }

    if (stampsToRemove.length > 0) {
      this.stamps = this.stamps.filter(s => !stampsToRemove.includes(s))
      return true
    }
    return false
  }

  updateRulerMarks() {
    this.computeNextTarget()
    const marksContainer = document.getElementById('ruler-marks')
    if (!marksContainer) return

    const visualMarks = this.stamps.filter(s => s.type === 'anchor' || s.type === 'measure')

    marksContainer.innerHTML = ''
    const viewportHeight = window.innerHeight

    visualMarks.forEach((stamp) => {
      const pageWrapper = document.querySelector(`.page-container[data-page="${stamp.page}"]`)
      if (pageWrapper && this.pdf) {
        const rect = pageWrapper.getBoundingClientRect()
        // Determine the absolute Y position relative to the viewport
        const absY = rect.top + (stamp.y * rect.height)

        // Hide if too far out of viewport for clean rendering
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

    // If no user anchor is the next target, show the system fallback marker
    if (this.viewer && !this.nextTargetAnchor) {
      const fallbackY = this.viewer.clientHeight - this.jumpOffsetPx
      const fallback = document.createElement('div')
      fallback.className = 'ruler-fallback-mark'
      fallback.style.top = `${fallbackY}px`
      marksContainer.appendChild(fallback)
    }
  }

  jump(direction) {
    const currentScroll = this.viewer.scrollTop
    const viewportHeight = this.viewer.clientHeight
    const viewportCenter = currentScroll + viewportHeight / 2
    const currentFocusY = currentScroll + this.jumpOffsetPx

    if (direction === 1) {
      // Forward: push current position to history, then jump to next anchor (or fixed step)
      this.jumpHistory.push(currentScroll)

      const candidates = this.stamps
        .filter(s => s.type === 'anchor')
        .map(s => {
          const pageElem = document.querySelector(`.page-container[data-page="${s.page}"]`)
          if (!pageElem) return null
          const canvas = pageElem.querySelector('.pdf-canvas')
          const absoluteY = pageElem.offsetTop + (s.y * canvas.height)
          return { absoluteY }
        })
        .filter(a => a !== null && a.absoluteY > currentFocusY + 10)

      let targetScrollTop
      if (candidates.length > 0) {
        candidates.sort((a, b) =>
          Math.abs(a.absoluteY - viewportCenter) - Math.abs(b.absoluteY - viewportCenter)
        )
        targetScrollTop = Math.max(0, candidates[0].absoluteY - this.jumpOffsetPx)
      } else {
        // Fallback: fixed step forward
        targetScrollTop = currentScroll + viewportHeight - this.jumpOffsetPx
      }

      this.viewer.scrollTo({ top: targetScrollTop, behavior: 'smooth' })

    } else {
      // Backward: pop history to return to exact pre-jump position
      if (this.jumpHistory.length > 0) {
        const prevScroll = this.jumpHistory.pop()
        this.viewer.scrollTo({ top: prevScroll, behavior: 'smooth' })
      } else {
        // No history yet — fallback fixed step back
        const targetScrollTop = Math.max(0, currentScroll - viewportHeight + 2 * this.jumpOffsetPx)
        this.viewer.scrollTo({ top: targetScrollTop, behavior: 'smooth' })
      }
    }
  }

  computeNextTarget() {
    if (!this.pdf || !this.viewer) { this.nextTargetAnchor = null; return }

    const currentScroll = this.viewer.scrollTop
    const viewportHeight = this.viewer.clientHeight
    const viewportCenter = currentScroll + viewportHeight / 2
    const currentFocusY = currentScroll + this.jumpOffsetPx

    const candidates = this.stamps
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

  showDynamicIndicator(absoluteY) {
    // Briefly show where we jumped to if it was a dynamic jump
    const indicator = document.createElement('div')
    indicator.className = 'dynamic-jump-indicator'
    indicator.style.top = `${absoluteY}px`
    this.viewer.appendChild(indicator)
    setTimeout(() => indicator.remove(), 1000)
  }

  updateJumpLinePosition() {
    const indicator = document.getElementById('jump-line')
    if (indicator) {
      indicator.style.top = `${this.jumpOffsetPx}px`
    }
  }

  updateRulerPosition() {
    const ruler = document.getElementById('jump-ruler')
    if (!ruler) return
    const firstPage = document.querySelector('.page-container')
    if (!firstPage) return
    const pageRect = firstPage.getBoundingClientRect()
    // Use CSS width directly — offsetWidth returns 0 when ruler is hidden (display:none)
    const rulerW = parseInt(getComputedStyle(ruler).getPropertyValue('width')) || 28
    // Ruler right edge flush with PDF left edge — sits entirely outside PDF
    ruler.style.left = `${Math.max(0, pageRect.left - rulerW)}px`
    // Beam spans the full PDF width from PDF left edge
    const beam = ruler.querySelector('.jump-line-beam')
    if (beam) beam.style.width = `${pageRect.width}px`
    this.updateRulerClip()
  }

  updateRulerClip() {
    const ruler = document.getElementById('jump-ruler')
    if (!ruler || !this.pdf) {
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

  updateScoreDetailUI(fingerprint) {
    if (this.scoreDetailManager) {
      this.scoreDetailManager.load(fingerprint)
    }
  }

  saveToStorage(isScoreChange = false) {
    if (isScoreChange && this.scoreDetailManager) {
      this.scoreDetailManager.onModification()
    }
    localStorage.setItem('scoreflow_layers', JSON.stringify(this.layers))
    // Save stamps under this score's fingerprint key
    if (this.pdfFingerprint) {
      localStorage.setItem(`scoreflow_stamps_${this.pdfFingerprint}`, JSON.stringify(this.stamps))
      // Score Info - Handled by ScoreDetailManager
    }
    // Also save as current for backward compatibility / startup restore
    localStorage.setItem('scoreflow_stamps', JSON.stringify(this.stamps))
    localStorage.setItem('scoreflow_current_fingerprint', this.pdfFingerprint || '')
    localStorage.setItem('scoreflow_sources', JSON.stringify(this.sources))
    localStorage.setItem('scoreflow_active_source', this.activeSourceId)
    localStorage.setItem('scoreflow_recent_solo_scores', JSON.stringify(this.recentSoloScores || []))
    localStorage.setItem('scoreflow_active_categories', JSON.stringify(this.activeCategories))

    const turnerMode = document.getElementById('turner-mode-select') ? document.getElementById('turner-mode-select').value : 'default';
    localStorage.setItem('scoreflow_turner_mode', turnerMode)

    if (this.activeScoreName) {
      localStorage.setItem('scoreflow_last_opened_score', this.activeScoreName)
      // Save mapping of filename to fingerprint
      if (this.pdfFingerprint) {
        const map = JSON.parse(localStorage.getItem('scoreflow_fingerprint_map') || '{}')
        map[this.activeScoreName] = this.pdfFingerprint
        localStorage.setItem('scoreflow_fingerprint_map', JSON.stringify(map))
      }
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
    const turnerModeData = localStorage.getItem('scoreflow_turner_mode')
    const activeCategoriesData = localStorage.getItem('scoreflow_active_categories')
    const docBarCollapsed = localStorage.getItem('scoreflow_doc_bar_collapsed') === 'true'
    const rulerVisibleData = localStorage.getItem('scoreflow_ruler_visible')

    if (recentSoloData) this.recentSoloScores = JSON.parse(recentSoloData)

    if (sourcesData) {
      this.sources = JSON.parse(sourcesData)
      if (this.sources.length === 0) {
        this.sources = [{ id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' }]
      }
    }
    if (activeSourceData) this.activeSourceId = activeSourceData
    if (fingerprintData) this.pdfFingerprint = fingerprintData
    if (activeCategoriesData) this.activeCategories = JSON.parse(activeCategoriesData)
    if (docBarCollapsed && this.docBar) this.docBar.classList.add('collapsed')
    if (rulerVisibleData !== null) this.rulerVisible = JSON.parse(rulerVisibleData)


    const turnerSelect = document.getElementById('turner-mode-select')
    if (turnerSelect) {
      if (turnerModeData) turnerSelect.value = turnerModeData
      turnerSelect.addEventListener('change', () => this.saveToStorage())
    }

    // Fingerprint Map for Library Indicators
    const mapData = localStorage.getItem('scoreflow_fingerprint_map')
    this.scoreFingerprintMap = mapData ? JSON.parse(mapData) : {}

    // PERSISTENCE SYNC: Preserve custom layers while respecting core defaults
    if (layersData) {
      const storedLayers = JSON.parse(layersData)
      // We take ALL stored layers (including custom ones)
      this.layers = storedLayers

      // Ensure all core layers exist — restore any that are missing from saved data
      INITIAL_LAYERS.forEach(coreLayer => {
        if (!this.layers.find(l => l.id === coreLayer.id)) {
          this.layers.push({ ...coreLayer })
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

  async addNewLayer() {
    const name = prompt('Notation Category Name (e.g., Bowing, Vibrato):')
    if (!name) return

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ff4757']
    const color = colors[this.layers.length % colors.length]
    const id = `layer_${Date.now()}`

    this.layers.push({
      id,
      name,
      color,
      visible: true,
      type: 'custom' // Mark as custom to allow deletion
    })

    this.activeLayerId = id
    this.saveToStorage()
    this.renderLayerUI()
    if (this.pdf) this.renderPDF() // Add new canvas for the layer

    this.showDialog({
      title: 'Category Created',
      message: `Successfully added "${name}" to notation categories.`,
      icon: '✅',
      type: 'info'
    })
  }

  async deleteLayer(layerId) {
    const coreIds = ['draw', 'fingering', 'articulation', 'performance', 'other', 'bowing']
    if (coreIds.includes(layerId)) {
      this.showDialog({ title: 'Protected Layer', message: 'Cannot delete core system layers.', icon: '🛡️' })
      return
    }

    const index = this.layers.findIndex(l => l.id === layerId)
    if (index === -1) return

    const layer = this.layers[index]
    const confirmed = await this.showDialog({
      title: 'Delete Category?',
      message: `Are you sure you want to delete "${layer.name}"? Original markings will be moved to "Draw Objects".`,
      icon: '🗑️',
      type: 'confirm'
    })

    if (!confirmed) return

    // Re-route stamps to standard 'draw' layer
    this.stamps.forEach(s => {
      if (s.layerId === layerId) s.layerId = 'draw'
    })

    // Splice is safer for in-place array management during multiple calls
    this.layers.splice(index, 1)

    // Fallback if we deleted the currently active layer
    if (this.activeLayerId === layerId) this.activeLayerId = 'draw'

    this.saveToStorage(true)
    this.renderLayerUI()
    if (this.pdf) this.renderPDF()
  }

  async resetLayers() {
    const confirmed = await this.showDialog({
      title: 'Emergency Reset?',
      message: '🛑 This will remove ALL custom notation categories and restore the 5 professional standards. Markings will be moved to "Draw Objects". Continue?',
      icon: '⚠️',
      type: 'confirm',
      confirmText: 'Yes, Reset Now'
    })

    if (!confirmed) return

    // 1. Move all stamps to 'draw'
    this.stamps.forEach(s => s.layerId = 'draw')

    // 2. Reset layers array to defaults
    this.layers = [
      { id: 'draw', name: 'Draw Objects', color: '#ff4757', visible: true, type: 'draw' },
      { id: 'fingering', name: 'Bow/Fingering', color: '#3b82f6', visible: true, type: 'fingering' },
      { id: 'articulation', name: 'Articulations', color: '#10b981', visible: true, type: 'articulation' },
      { id: 'performance', name: 'Performance', color: '#f59e0b', visible: true, type: 'performance' },
      { id: 'other', name: 'Other (Layout)', color: '#64748b', visible: true, type: 'other' }
    ]

    this.activeLayerId = 'draw'
    this.saveToStorage(true)
    this.renderLayerUI()
    if (this.pdf) this.renderPDF()

    this.showDialog({
      title: 'System Restored',
      message: 'Layers have been reset to system standards successfully.',
      icon: '🔄',
      type: 'info'
    })
  }

  renderLayerUI() {
    // We now render to the external left-side list
    const list = this.externalLayerList || this.layerList
    if (!list) return
    list.innerHTML = ''

    // Count stamps per layerId
    const countByLayer = {}
    for (const stamp of this.stamps) {
      countByLayer[stamp.layerId] = (countByLayer[stamp.layerId] || 0) + 1
    }

    this.layers.forEach(layer => {
      if (layer.visible === undefined) layer.visible = true

      const item = document.createElement('div')
      item.className = 'layer-item'

      const eyeIcon = layer.visible
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`

      const isCore = ['draw', 'fingering', 'bowing', 'articulation', 'performance', 'other'].includes(layer.id)
      const count = countByLayer[layer.id] || 0
      const countBadge = count > 0
        ? `<span class="layer-count-badge">${count}</span>`
        : ''

      item.innerHTML = `
        <div class="layer-info">
          <div class="color-dot" style="background:${layer.color}"></div>
          <div class="layer-meta">
            <span class="layer-name">${layer.name}${countBadge}</span>
          </div>
        </div>
        <div class="layer-actions">
           <button class="layer-vis-btn ${layer.visible ? 'visible' : 'inactive'}" title="${layer.visible ? 'Hide' : 'Show'}">
             ${eyeIcon}
           </button>
           ${!isCore ? `<button class="btn-delete-layer" title="Delete Category">✕</button>` : ''}
        </div>
      `

      const btn = item.querySelector('.layer-vis-btn')
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        layer.visible = !layer.visible
        this.updateLayerVisibility()
        this.renderLayerUI()
      })

      const delBtn = item.querySelector('.btn-delete-layer')
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation()
          this.deleteLayer(layer.id)
        })
      }

      list.appendChild(item)
    })

  }

  // Placeholder (logic in AnnotationManager)

  exportProject(isGlobal = false) {
    try {
      if (!isGlobal && !this.pdfFingerprint) {
        alert('Please open a score before exporting markings.')
        return
      }

      const data = {
        version: '1.4',
        timestamp: new Date().toISOString(),
        user: {
          name: this.profileManager.data.userName,
          email: this.profileManager.data.email
        },
        scoreInfo: this.scoreDetailManager.getExportMetadata(),
        fingerprint: this.pdfFingerprint,
        layers: this.layers,
        stamps: this.stamps,
        sources: this.sources,
        activeSourceId: this.activeSourceId
      }

      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const filename = this.scoreDetailManager.getExportFilename(isGlobal, this.profileManager.data.userName) || 'ScoreFlow_Export.json'

      console.log('[ScoreFlow] Exporting:', filename)

      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.style.display = 'none'

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Removed immediate revocation to prevent Chrome from losing the filename.

    } catch (err) {
      console.error('[ScoreFlow] Export failed:', err)
      alert(`Export failed: ${err.message}`)
    }
  }

  handleImport(e) {
    const file = e.target.files[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result)

        // --- USER IDENTITY AUDIT ---
        const user = data.user || {}
        const currentName = this.profileManager.data.userName
        const currentEmail = this.profileManager.data.email

        if (user.name && user.email) {
          if (user.name !== currentName || user.email !== currentEmail) {
            const title = `Import Marks from ${user.name}`
            const proceedIdentity = confirm(
              `These markings belong to:\nName: ${user.name}\nEmail: ${user.email}\n\n` +
              `You are currently signed in as:\nName: ${currentName}\nEmail: ${currentEmail}\n\n` +
              `Proceed with importing into your profile?`
            )
            if (!proceedIdentity) return
          }
        }

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

    this.sources.forEach(source => {
      const isActive = this.activeSourceId === source.id

      // Force the 'self' source to match the current User Profile name
      if (source.id === 'self') {
        const userName = this.profileManager?.data?.userName
        if (userName) {
          source.name = userName
        } else {
          source.name = 'Primary Interpretation'
        }
      }

      const item = document.createElement('div')
      item.className = `source-item ${isActive ? 'active' : ''}`

      // Check if it's a shared style with contributor info
      const contributorBadge = source.author
        ? `<div class="source-contributor">
             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>
             ${source.author} • ${source.section}
           </div>`
        : '';

      // Calculate stamp count for this specific source
      const stampCount = this.stamps.filter(s => s.sourceId === source.id).length;

      item.innerHTML = `
        <div class="source-header">
          <div class="source-info">
            <div class="source-dot" style="background: ${source.color}"></div>
            <div class="source-meta-box">
              <div class="style-name-row" style="display:flex; justify-content:space-between; align-items:center;">
                <span class="source-name">${source.name}</span>
                <span class="stamp-count-mini" style="font-size:0.65rem; color:var(--text-muted); font-weight:700;">${stampCount} marks</span>
              </div>
              ${contributorBadge}
            </div>
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
            <button class="btn-sm-icon rename-src" title="Rename Style">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${this.sources.length > 1 ? `
              <button class="btn-sm-icon danger delete-src" title="Remove Style">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
          <div class="source-actions">
          <label><input type="checkbox" class="source-compare-toggle" ${source.visible ? 'checked' : ''}> Compare</label>
        </div>
        <div class="source-opacity-box">
          <label for="opacity-slider-${source.id}">Opacity</label>
          <input id="opacity-slider-${source.id}" type="range" class="source-opacity-slider modern-slider" min="0" max="1" step="0.1" value="${source.opacity}">
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


  toggleRuler() {
    this.rulerVisible = !this.rulerVisible
    localStorage.setItem('scoreflow_ruler_visible', this.rulerVisible)
    const ruler = document.getElementById('jump-ruler')
    if (ruler) {
      ruler.classList.toggle('hidden', !this.rulerVisible)
      ruler.style.display = this.rulerVisible ? 'block' : ''
    }
    if (this.btnRulerToggle) this.btnRulerToggle.classList.toggle('active', this.rulerVisible)
  }

  toggleFullscreen() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const useCSSFullscreen = isIOS || (isSafari && !document.fullscreenEnabled)

    const appEl = document.getElementById('app')
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || appEl?.classList.contains('css-fullscreen'))

    const updateBtn = (nowFs) => {
      if (this.btnFullscreen) {
        this.btnFullscreen.classList.toggle('active', nowFs)
        this.btnFullscreen.innerHTML = nowFs
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 0 2 2v3M16 21v-3a2 2 0 0 0 2-2h3"/>
             </svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
               <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
             </svg>`
      }
    }

    if (useCSSFullscreen) {
      // iOS Safari: CSS fake fullscreen (avoids swipe-to-dismiss conflict with scroll)
      if (!isFs) {
        appEl?.classList.add('css-fullscreen')
        updateBtn(true)
      } else {
        appEl?.classList.remove('css-fullscreen')
        updateBtn(false)
      }
    } else {
      // Desktop: use native fullscreen API (must be synchronous from user gesture)
      if (!isFs) {
        const p = document.body.requestFullscreen
          ? document.body.requestFullscreen()
          : (document.body.webkitRequestFullscreen ? (document.body.webkitRequestFullscreen(), Promise.resolve()) : null)
        if (p) p.then(() => updateBtn(true)).catch(err => console.warn('[ScoreFlow] Fullscreen failed:', err))
      } else {
        const p = document.exitFullscreen
          ? document.exitFullscreen()
          : (document.webkitExitFullscreen ? (document.webkitExitFullscreen(), Promise.resolve()) : null)
        if (p) p.then(() => updateBtn(false)).catch(() => { })
      }
    }
  }







  showDialog({ title, message, icon = '⚠️', type = 'info', confirmText = 'Confirm', cancelText = 'Cancel', actions = null }) {
    // Safety check: Don't show empty or undefined messages (Ghost Dialog prevention)
    if (!message || message.trim() === '') return Promise.resolve(false)

    return new Promise((resolve) => {
      this.dialogTitle.textContent = title
      this.dialogMessage.textContent = message
      this.dialogIcon.textContent = icon
      this.dialogActions.innerHTML = ''

      if (actions && Array.isArray(actions)) {
        // Use custom action buttons
        actions.forEach(action => {
          const btn = document.createElement('button')
          btn.className = `btn ${action.type === 'primary' ? 'btn-primary' : 'btn-outline'}`
          btn.textContent = action.label
          btn.onclick = () => {
            this.systemDialog.classList.remove('active')
            resolve(action.value)
          }
          this.dialogActions.appendChild(btn)
        })
      } else if (type === 'confirm') {
        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'btn btn-outline'
        cancelBtn.textContent = cancelText
        cancelBtn.onclick = () => {
          this.systemDialog.classList.remove('active')
          resolve(false)
        }

        const confirmBtn = document.createElement('button')
        confirmBtn.className = 'btn btn-primary'
        confirmBtn.textContent = confirmText
        confirmBtn.onclick = () => {
          this.systemDialog.classList.remove('active')
          resolve(true)
        }

        this.dialogActions.appendChild(cancelBtn)
        this.dialogActions.appendChild(confirmBtn)
      } else {
        const okBtn = document.createElement('button')
        okBtn.className = 'btn btn-primary'
        okBtn.textContent = 'OK'
        okBtn.onclick = () => {
          this.systemDialog.classList.remove('active')
          resolve(true)
        }
        this.dialogActions.appendChild(okBtn)
      }

      this.systemDialog.classList.add('active')
    })
  }

  // --- NAVIGATION ACTIONS ---
  goToHead() {
    this.jumpHistory = []
    this.currentPageNum = 1
    this.viewer.scrollTo({ top: 0, behavior: 'smooth' })
  }

  goToEnd() {
    if (!this.pdf) return
    this.jumpHistory = []
    const total = this.pdf.numPages
    this.currentPageNum = total
    this.viewer.scrollTo({ top: this.viewer.scrollHeight, behavior: 'smooth' })
  }

  goToAnchor() {
    // Find the first stamp of type 'anchor'
    const anchorStamp = this.stamps.find(s => s.type === 'anchor')
    if (anchorStamp && anchorStamp.page) {
      this.currentPageNum = anchorStamp.page
      const pageElem = document.querySelector(`.page-container[data-page="${anchorStamp.page}"]`)
      if (pageElem) {
        const canvas = pageElem.querySelector('.pdf-canvas')
        const absoluteY = pageElem.offsetTop + (anchorStamp.y * canvas.height)
        const targetScroll = absoluteY - this.jumpOffsetPx
        this.viewer.scrollTo({
          top: Math.max(0, targetScroll),
          behavior: 'smooth'
        })
      }
    } else {
      // Fallback if no anchor exists
      this.goToHead()
    }
  }

  async resetToSystemDefault() {
    const confirmReset = await this.showDialog({
      title: 'System Reset',
      message: 'This will permanently delete all scores, annotations, and profiles. Are you absolutely sure?',
      type: 'confirm',
      icon: '⚠️'
    })

    if (confirmReset) {
      // 1. Clear LocalStorage
      localStorage.clear()

      // 2. Clear IndexedDB
      try {
        await db.clear()
        console.log('[ScoreFlow] IndexedDB cleared successfully.')
      } catch (err) {
        console.warn('[ScoreFlow] IndexedDB clear failed, trying fallback delete database', err)
        if (window.indexedDB) window.indexedDB.deleteDatabase('ScoreFlowStorage')
      }

      // 3. Reload
      window.location.reload()
    }
  }
}

new ScoreFlow()