import './style.css'
import { registerSW } from 'virtual:pwa-register'
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
import { SettingsPanelManager } from './modules/SettingsPanelManager.js'
import { ScoreManager } from './modules/ScoreManager.js'
import { CollaborationManager } from './modules/collaboration.js'
import { InputManager } from './modules/InputManager.js'
import { PlaybackManager } from './modules/PlaybackManager.js'
import { JumpManager } from './modules/JumpManager.js'
import { ViewPanelManager } from './modules/ViewPanelManager.js'
import { DriveSyncManager } from './modules/DriveSyncManager.js'
import { SetlistManager } from './modules/SetlistManager.js'
import { UIManager } from './modules/UIManager.js'
import { InitializationManager } from './modules/InitializationManager.js'
import { PdfExportManager } from './modules/PdfExportManager.js'
import { applyAppProxies } from './modules/AppProxyHandler.js'
import { StaffDetector } from './modules/StaffDetector.js'

const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/')
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', baseUrl).href

const APP_BRANCH = typeof __APP_BRANCH__ !== 'undefined' ? __APP_BRANCH__ : 'local-dev'
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'just-now'

class ScoreFlow {
  constructor() {
    window.app = this
    this.DEBUG_VERSION = '2026.03.14.v3'
    console.log(`%c [ScoreFlow] Initializing Version: ${this.DEBUG_VERSION} `, 'background: #222; color: #bada55');
    this.activeLayerId = 'draw'
    this.activeStampType = 'view'
    this.activeCategories = ['Pens']
    this.isMultiSelectMode = false
    this.activeColor = '#ff4757'
    this.defaultFontSize = 15
    this.toolbarWidth = 600
    this.lastUsedToolPerCategory = {}
    this.recentTools = []
    this.userTextLibrary = ['dolce']
    this.stampSizeMultiplier = 1.0
    this.stampSizeOverrides = {}   // per-tool size overrides: { toolId: sizeNumber }
    this.pageScales = {}
    this.sources = [{ id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' }]
    this.activeSourceId = 'self'
    this.layers = JSON.parse(JSON.stringify(INITIAL_LAYERS))
    this.stamps = []
    this.toolsets = TOOLSETS
    this.scoreStampScale = 1.0
    this.stampOffsetTouchY = 50
    this.stampOffsetTouchX = -30
    this.stampOffsetMouseY = 25
    this.stampOffsetMouseX = 0
    this.showSystemStamps = localStorage.getItem('scoreflow_show_systems') !== 'false'
    this.systemJumpOverlap = parseInt(localStorage.getItem('scoreflow_system_jump_overlap') || '1')

    // Managers Initialization
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
    this.settingsPanelManager = new SettingsPanelManager(this)
    this.scoreManager = new ScoreManager(this)
    this.collaborationManager = new CollaborationManager(this)
    this.playbackManager = new PlaybackManager(this)
    this.inputManager = new InputManager(this)
    this.driveSyncManager = new DriveSyncManager(this)
    this.setlistManager = new SetlistManager(this)
    this.uiManager = new UIManager(this)
    this.pdfExportManager = new PdfExportManager(this)
    this.initManager = new InitializationManager(this)
    this.staffDetector = new StaffDetector(this)

    // Apply Proxies
    applyAppProxies(this)

    // UI & Logic Sync
    this.initManager.initElements()
    this.uiManager.init()
    this.jumpManager = new JumpManager(this)
    this.viewPanelManager = new ViewPanelManager(this)
    this.jumpManager.init()
    this.viewPanelManager.init()
    this.layerManager.init()
    this.initManager.initEventListeners()
    this.viewerManager.init()
    this.rulerManager.init()
    this.docBarManager.init()
    this.inputManager.init()
    this.profileManager.init()
    this.scoreDetailManager.init()
    this.driveSyncManager.init()
    this.playbackManager.init()
    this.scoreManager.init()
    this.settingsPanelManager.init()
    this.setlistManager.init()
    this.toolManager.initDraggable()
    this.toolManager.initToolbarResizable()

    this.loadFromStorage()
    this.renderLayerUI()
    this.renderSourceUI()
    this.toolManager.updateActiveTools()
    this.viewerManager.checkInitialView()
    this.toolManager.preloadSvgs()
    this.renderBuildInfo()
    console.log('[ScoreFlow] Initialized - Version 2.3.5')
  }

  renderBuildInfo() {
    const branchEl = document.getElementById('build-branch')
    const timeEl = document.getElementById('build-time')
    if (branchEl) branchEl.textContent = APP_BRANCH
    if (timeEl) timeEl.textContent = BUILD_TIME
  }

  async openRecentScore(name) {
    if (this.sidebar) this.sidebar.classList.remove('open')
    const buf = await db.get(`recent_buf_${name}`)
    if (buf) return this.loadPDF(new Uint8Array(buf), name)
    const handle = await db.get(`recent_handle_${name}`)
    if (handle) {
      const file = await this.viewerManager.openFileHandle(handle)
      if (file) {
        const b = await file.arrayBuffer()
        return this.loadPDF(new Uint8Array(b), name)
      }
    }
    alert(`Could not find the original file for "${name}". Please re-upload it.`)
  }

  onAnnotationChanged() {
    if (this.driveSyncManager?.isEnabled) this.driveSyncManager.pushDebounce()
  }

  toggleFullscreen() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
    const root = document.getElementById('app-root')
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || root?.classList.contains('css-fullscreen'))
    
    const updateBtn = (nowFs) => {
      if (this.btnFullscreen) {
        this.btnFullscreen.classList.toggle('active', nowFs)
        this.btnFullscreen.innerHTML = nowFs
          ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 0 2 2v3M16 21v-3a2 2 0 0 0 2-2h3"/></svg>`
          : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>`
      }
    }

    if (!this._fsBound) {
      const fsEvent = (document.webkitFullscreenElement !== undefined) ? 'webkitfullscreenchange' : 'fullscreenchange'
      document.addEventListener(fsEvent, () => {
        const nowFs = !!(document.fullscreenElement || document.webkitFullscreenElement || root?.classList.contains('css-fullscreen'))
        updateBtn(nowFs)
      })
      this._fsBound = true
    }

    if (isIOS || (isSafari && !document.fullscreenEnabled)) {
      root?.classList.toggle('css-fullscreen', !isFs); updateBtn(!isFs)
    } else {
      if (!isFs) {
        const target = root || document.body
        const req = target.requestFullscreen ? target.requestFullscreen() : target.webkitRequestFullscreen?.()
        req?.then(() => updateBtn(true)).catch(err => {
          console.warn('[Fullscreen] Request rejected:', err)
          // Fallback to CSS if API fails (e.g. not called from user gesture)
          root?.classList.add('css-fullscreen'); updateBtn(true)
        })
      } else {
        (document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen?.())?.then(() => updateBtn(false))
      }
    }
  }

  goToHead() { this.jumpManager.goToHead() }
  goToEnd() { this.jumpManager.goToEnd() }
  goToAnchor() {
    const anchor = this.stamps.find(s => s.type === 'anchor')
    if (anchor && anchor.page) {
        const page = document.querySelector(`.page-container[data-page="${anchor.page}"]`)
        if (page) {
            const canvas = page.querySelector('.pdf-canvas')
            this.viewer.scrollTo({ top: page.offsetTop + (anchor.y * canvas.height) - this.jumpOffsetPx, behavior: 'smooth' })
            return
        }
    }
    this.goToHead()
  }

  async resetToSystemDefault() {
    const confirmed = await this.showDialog({ 
      title: '⚠️ 徹底重置本地系統', 
      message: '這將永久刪除本地所有的 PDF 樂譜、劃記、書籤及個人設定。此操作不可撤銷。確定要清空本地資料嗎？', 
      type: 'confirm', 
      icon: '☢️' 
    })
    
    if (confirmed) {
      // 1. Stop all active background processes
      this.driveSyncManager?.stopAutoSync()
      
      // 2. Clear all storage types
      localStorage.clear()
      sessionStorage.clear()
      
      try { 
        await db.clear() 
        console.log('[System] IndexedDB cleared successfully.')
      } catch (err) { 
        console.warn('[System] db.clear failed, attempting deleteDatabase:', err)
        window.indexedDB?.deleteDatabase('ScoreFlowStorage') 
      }
      
      this.showMessage('本地系統已重置，正在重新載入...', 'success')
      
      // 3. Force reload ignoring cache
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname + '?reset=' + Date.now()
      }, 1000)
    }
  }

  updateJumpOffset(val) {
    if (this.rulerManager) { this.rulerManager.jumpOffsetPx = val; this.rulerManager.updateJumpLinePosition() }
    [this.jumpOffsetInput, this.settingsJumpOffsetInput].forEach(inp => { if (inp) inp.value = val })
    const label = `${val}px`; [this.jumpOffsetValue, this.settingsJumpOffsetValue].forEach(v => { if (v) v.textContent = label })
  }

  updateStampSize(val) {
    this.stampSizeMultiplier = parseFloat(val)
    if (this.settingsStampSizeInput) {
      this.settingsStampSizeInput.value = val
      if (this.settingsStampSizeValue) this.settingsStampSizeValue.textContent = `${this.stampSizeMultiplier.toFixed(1)}x`
    }
    if (this._redrawTimer) cancelAnimationFrame(this._redrawTimer)
    this._redrawTimer = requestAnimationFrame(() => { this.redrawAllAnnotationLayers(); this._redrawTimer = null })
    this.saveToStorage()
  }

  updateScoreStampScale(val) {
    this.scoreStampScale = parseFloat(val) || 1.0
    if (this.scoreDetailManager) {
      this.scoreDetailManager.currentInfo.stampScale = this.scoreStampScale
      this.scoreDetailManager.save(this.pdfFingerprint)
    }
    if (this._redrawTimer) cancelAnimationFrame(this._redrawTimer)
    this._redrawTimer = requestAnimationFrame(() => { this.redrawAllAnnotationLayers(); this._redrawTimer = null })
  }

  showMessage(msg, type = 'info') { this.uiManager.showMessage(msg, type) }
}

new ScoreFlow()

// Register Service Worker for offline support
registerSW({
  onNeedRefresh() {
    console.log('[PWA] New content available, please refresh.')
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline.')
  },
})