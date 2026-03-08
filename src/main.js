import './style.css'
import * as pdfjsLib from 'pdfjs-dist'
import * as db from './db.js'
import { INITIAL_LAYERS, TOOLSETS } from './constants.js'
import { DocBarManager } from './modules/docbar.js'
import { ViewerManager } from './modules/ViewerManager.js'
import { ProfileManager } from './modules/ProfileManager.js'
import { ScoreDetailManager } from './modules/ScoreDetailManager.js'
import { AnnotationManager } from './modules/annotation/AnnotationManager.js'
import { ToolManager } from './modules/tools.js'
import { RulerManager } from './modules/ruler.js'
import { PersistenceManager } from './modules/PersistenceManager.js'
import { LayerManager } from './modules/LayerManager.js'
import { DocActionManager } from './modules/DocActionManager.js'
import { SidebarManager } from './modules/sidebar.js'
import { CollaborationManager } from './modules/collaboration.js'
import { InputManager } from './modules/InputManager.js'

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

  // RulerManager Proxies
  get rulerVisible() { return this.rulerManager.rulerVisible }
  set rulerVisible(val) { this.rulerManager.rulerVisible = val }
  get jumpOffsetPx() { return this.rulerManager.jumpOffsetPx }
  set jumpOffsetPx(val) { this.rulerManager.jumpOffsetPx = val }
  get nextTargetAnchor() { return this.rulerManager.nextTargetAnchor }
  set nextTargetAnchor(val) { this.rulerManager.nextTargetAnchor = val }
  get jumpHistory() { return this.rulerManager.jumpHistory }
  set jumpHistory(val) { this.rulerManager.jumpHistory = val }

  openPdfFilePicker() { return this.viewerManager.openPdfFilePicker() }
  handleUpload(e) { return this.viewerManager.handleUpload(e) }
  jump(delta) { return this.rulerManager.jump(delta) }
  cleanupAnchors(page) { return this.annotationManager.cleanupAnchors(page) }
  drawPageEndAnchor(page) { return this.annotationManager.drawPageEndAnchor(page) }
  createAnnotationLayers(wrapper, p, w, h) { return this.viewerManager.createAnnotationLayers(wrapper, p, w, h) }
  toggleShortcuts(force) {
    if (!this.shortcutsModal) return
    if (force !== undefined) this.shortcutsModal.classList.toggle('active', force)
    else this.shortcutsModal.classList.toggle('active')
  }

  constructor() {
    this.recycleItems = []
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

    this.toolManager = new ToolManager(this)
    this.rulerManager = new RulerManager(this)
    this.docBarManager = new DocBarManager(this)
    this.viewerManager = new ViewerManager(this)
    this.profileManager = new ProfileManager(this)
    this.scoreDetailManager = new ScoreDetailManager(this)
    this.annotationManager = new AnnotationManager(this)
    this.persistenceManager = new PersistenceManager(this)
    this.layerManager = new LayerManager(this)
    this.docActionManager = new DocActionManager(this)
    this.sidebarManager = new SidebarManager(this)
    this.collaborationManager = new CollaborationManager(this)
    this.inputManager = new InputManager(this)

    this.initElements()
    this.initEventListeners()
    this.rulerManager.init()
    this.docBarManager.init()
    this.inputManager.init()
    this.profileManager.init()
    this.scoreDetailManager.init()
    this.toolManager.initDraggable()
    this.toolManager.initToolbarResizable()
    this.initSidebarResizable()
    this.initTabs()
    this.loadFromStorage()
    this.renderLayerUI()
    this.renderSourceUI()
    this.toolManager.updateActiveTools()
    this.renderSidebarRecentScores()
    this.renderWelcomeRecentScores()
    this.viewerManager.checkInitialView()
    this.toolManager.preloadSvgs()
    this.renderBuildInfo()
  }

  renderBuildInfo() {
    const branchEl = document.getElementById('build-branch')
    const timeEl = document.getElementById('build-time')
    console.log(`[ScoreFlow] Build Info - Branch: ${APP_BRANCH}, Time: ${BUILD_TIME}`)
    if (branchEl) branchEl.textContent = APP_BRANCH
    if (timeEl) timeEl.textContent = BUILD_TIME
  }

  // ToolManager Proxies
  async _preloadSvgs() { return this.toolManager.preloadSvgs() }
  getIcon(...args) { return this.toolManager.getIcon(...args) }
  updateActiveTools(...args) { return this.toolManager.updateActiveTools(...args) }
  toggleStampPalette() { return this.toolManager.toggleStampPalette() }
  initToolbarResizable() { return this.toolManager.initToolbarResizable() }
  initDraggable() { return this.toolManager.initDraggable() }

  // Persistence & Layer Proxies
  saveToStorage() { this.persistenceManager.saveToStorage() }
  loadFromStorage() { this.persistenceManager.loadFromStorage() }
  addToRecentSoloScores(name) { this.persistenceManager.addToRecentSoloScores(name) }
  addNewLayer() { this.layerManager.addNewLayer() }
  deleteLayer(id) { this.layerManager.deleteLayer(id) }
  resetLayers() { this.layerManager.resetLayers() }
  renderLayerUI() { this.layerManager.renderLayerUI() }

  // Documentation Action Proxies
  exportProject(isGlobal) { this.docActionManager.exportProject(isGlobal) }
  handleImport(e) { this.docActionManager.handleImport(e) }
  importAsNewPersona(data) { this.docActionManager.importAsNewPersona(data) }
  overwriteProject(data) { this.docActionManager.overwriteProject(data) }
  showDialog(opts) { return this.docActionManager.showDialog(opts) }

  // RulerManager Proxies
  updateJumpLinePosition() { return this.rulerManager.updateJumpLinePosition() }
  updateRulerPosition() { return this.rulerManager.updateRulerPosition() }
  updateRulerClip() { return this.rulerManager.updateRulerClip() }
  updateRulerMarks() { return this.rulerManager.updateRulerMarks() }
  computeNextTarget() { return this.rulerManager.computeNextTarget() }
  scrollToNextTarget() { return this.rulerManager.scrollToNextTarget() }
  toggleRuler() { return this.rulerManager.toggleRuler() }

  // SidebarManager Proxies
  initSidebarResizable() { this.sidebarManager.initSidebarResizable() }
  initTabs() { this.sidebarManager.initTabs() }
  renderRecentSoloScores() { this.sidebarManager.renderRecentSoloScores() }
  renderWelcomeRecentScores() { this.sidebarManager.renderWelcomeRecentScores() }
  renderSidebarRecentScores() { this.sidebarManager.renderSidebarRecentScores() }

  // CollaborationManager Proxies
  renderSourceUI() { this.collaborationManager.renderSourceUI() }
  addSource() { this.collaborationManager.addSource() }

  initToolsets() {
    this.toolsets = TOOLSETS
  }

  initElements() {
    this.container = document.getElementById('pdf-viewer')
    this.uploader = document.getElementById('pdf-upload')
    this.uploadBtn = document.getElementById('upload-btn')
    this.openPdfBtn = document.getElementById('open-pdf-btn')
    this.sidebar = document.getElementById('sidebar')
    this.btnSidebarToggle = document.getElementById('btn-sidebar-toggle')
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
    this.btnModeEraser = document.getElementById('btn-mode-eraser')
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

    // Unified Control Hub Listeners
    if (this.btnSidebarToggle) {
      this.btnSidebarToggle.addEventListener('click', () => {
        // Prevent toggle if we were just dragging the bar
        if (this.docBar && this.docBar._wasDragging) return
        this.sidebar.classList.toggle('open')
      })
    }

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

    // Tab & Resize Handled by SidebarManager
    // Tab & Resize Handled by SidebarManager
    // Input Handled by InputManager
  }

  showDynamicIndicator(absoluteY) {
    const indicator = document.createElement('div')
    indicator.className = 'dynamic-jump-indicator'
    indicator.style.top = `${absoluteY}px`
    this.viewer.appendChild(indicator)
    setTimeout(() => indicator.remove(), 1000)
  }

  updateScoreDetailUI(fingerprint) {
    if (this.scoreDetailManager) this.scoreDetailManager.load(fingerprint)
  }

  toggleFullscreen() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const useCSSFullscreen = isIOS || (isSafari && !document.fullscreenEnabled)
    const appEl = document.getElementById('app')
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || appEl?.classList.contains('css-fullscreen'))

    const updateBtn = (nowFs) => {
      if (this.btnFullscreen) {
        this.btnFullscreen.classList.toggle('active', nowFs)
        this.btnFullscreen.innerHTML = nowFs
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 0 2 2v3M16 21v-3a2 2 0 0 0 2-2h3"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`
      }
    }

    if (useCSSFullscreen) {
      if (!isFs) { appEl?.classList.add('css-fullscreen'); updateBtn(true) }
      else { appEl?.classList.remove('css-fullscreen'); updateBtn(false) }
    } else {
      if (!isFs) {
        const p = document.body.requestFullscreen ? document.body.requestFullscreen() : (document.body.webkitRequestFullscreen ? (document.body.webkitRequestFullscreen(), Promise.resolve()) : null)
        if (p) p.then(() => updateBtn(true))
      } else {
        const p = document.exitFullscreen ? document.exitFullscreen() : (document.webkitExitFullscreen ? (document.webkitExitFullscreen(), Promise.resolve()) : null)
        if (p) p.then(() => updateBtn(false))
      }
    }
  }

  goToHead() {
    this.jumpHistory = []
    this.viewer.scrollTo({ top: 0, behavior: 'smooth' })
  }

  goToEnd() {
    if (!this.pdf) return
    this.jumpHistory = []
    this.viewer.scrollTo({ top: this.viewer.scrollHeight, behavior: 'smooth' })
  }

  goToAnchor() {
    const anchorStamp = this.stamps.find(s => s.type === 'anchor')
    if (anchorStamp && anchorStamp.page) {
      const pageElem = document.querySelector(`.page-container[data-page="${anchorStamp.page}"]`)
      if (pageElem) {
        const canvas = pageElem.querySelector('.pdf-canvas')
        const absoluteY = pageElem.offsetTop + (anchorStamp.y * canvas.height)
        this.viewer.scrollTo({ top: Math.max(0, absoluteY - this.jumpOffsetPx), behavior: 'smooth' })
      }
    } else {
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
      localStorage.clear()
      try { await db.clear() } catch (err) { if (window.indexedDB) window.indexedDB.deleteDatabase('ScoreFlowStorage') }
      window.location.reload()
    }
  }
}

new ScoreFlow()