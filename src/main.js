/* eslint-disable */
if (process.env.NODE_ENV === 'development') {
    (function() {
        const HOST = '192.168.0.200'; // 偵測到的您的 Mac IP
        const PORT = '3001';
        const log = (type, args) => {
            const device = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'iPad' : 
                           /Macintosh/.test(navigator.userAgent) ? 'Mac' : 'Browser';
            fetch(`http://${HOST}:${PORT}`, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, device, msg: Array.from(args) })
            }).catch(() => {});
        };
        ['log', 'error', 'warn', 'info'].forEach(t => {
            const o = console[t];
            console[t] = (...a) => { log(t, a); o.apply(console, a); };
        });
        window.onerror = (m, u, l, c, e) => log('WINDOW_ERROR', { m, u, l, c, stack: e?.stack });
    })();
}

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
import { SetlistManager } from './modules/SetlistManager.js'
import { UIManager } from './modules/UIManager.js'
import { InitializationManager } from './modules/InitializationManager.js'
import { PdfExportManager } from './modules/PdfExportManager.js'
import { applyAppProxies } from './modules/AppProxyHandler.js'
import { StaffDetector } from './modules/StaffDetector.js'
import { GistShareManager } from './modules/GistShareManager.js'
import { LocalBackupManager } from './modules/LocalBackupManager.js'
import { SupabaseManager } from './modules/SupabaseManager.js'
import { EditStripManager } from './modules/EditStripManager.js'
import { EditSubBarManager } from './modules/EditSubBarManager.js'
import { DocBarStripManager } from './modules/DocBarStripManager.js'
import { AccountPanelManager } from './modules/AccountPanelManager.js'

const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/')
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', baseUrl).href

const APP_BRANCH = typeof __APP_BRANCH__ !== 'undefined' ? __APP_BRANCH__ : 'local-dev'
const BUILD_TIME = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'just-now'

class ScoreFlow {
  constructor() {
    window.app = this
    this.DEBUG_VERSION = 'V3.1.4'
    this.isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    this.isDev = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' || 
                 window.location.hostname.startsWith('192.168.') ||
                 window.location.hostname.startsWith('172.') ||
                 window.location.hostname.startsWith('10.');
    
    // We categorize local LAN as Dev (Blue)
    if (this.isDev) {
        document.body.classList.add('env-dev');
    }
    console.log(`%c [ScoreFlow] Initializing Version: ${this.DEBUG_VERSION} (${this.isDev ? 'Dev' : 'Prod'}) on ${window.location.hostname}`, 'background: #222; color: #bada55');
    this.activeLayerId = 'draw'
    this.activeStampType = 'view'
    this.activeCategories = ['Pens']
    this.isMultiSelectMode = false
    this.activeColor = '#ff4757'
    this.defaultFontSize = 15
    this.toolbarWidth = 600
    this.lastUsedToolPerCategory = {}
    this.recentTools = []
    this.userTextLibrary = ['指揮', '小提', '大提', '管樂', '打擊', '獨奏', '換頁', '換譜', '呼吸', 'dolce']
    this.stampSizeMultiplier = 1.0
    this.stampSizeOverrides = {}   // per-tool size overrides: { toolId: sizeNumber }
    this.pageScales = {}
    this.sources = [{ id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' }]
    this.activeSourceId = 'self'
    this.layers = JSON.parse(JSON.stringify(INITIAL_LAYERS))
    this.stamps = []
    this.toolsets = TOOLSETS
    this.scoreStampScale = 1.0
    this.activeToolPreset = 1.0 // S/M/L preset for the active tool
    this.activeLineStyle = 'solid' // 'solid' | 'dashed' | 'dotted'
    this.presetScales = JSON.parse(localStorage.getItem('scoreflow_preset_scales')) || { S: 0.7, M: 1.0, L: 1.6 }
    
    // Undo/Redo History
    this.history = []
    this.redoStack = []
    
    this.stampOffsetTouchY = 50
    this.stampOffsetTouchX = -30
    this.stampOffsetMouseY = 25
    this.stampOffsetMouseX = 0
    this.showSystemStamps = localStorage.getItem('scoreflow_show_systems') === 'true'
    this.showCloakBadge = localStorage.getItem('scoreflow_show_cloak_badge') !== 'false'
    this.twoFingerPanEnabled = localStorage.getItem('scoreflow_two_finger_pan') === 'true' // default OFF
    this.systemJumpOverlap = parseInt(localStorage.getItem('scoreflow_system_jump_overlap') || '1')
    this.cloakVisible = {
        black: localStorage.getItem('scoreflow_cloak_visible_black') !== 'false',
        red:   localStorage.getItem('scoreflow_cloak_visible_red')   !== 'false',
        blue:  localStorage.getItem('scoreflow_cloak_visible_blue')  !== 'false',
    }

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
    this.accountPanelManager = new AccountPanelManager(this)
    this.scoreManager = new ScoreManager(this)
    this.collaborationManager = new CollaborationManager(this)
    this.playbackManager = new PlaybackManager(this)
    this.inputManager = new InputManager(this)
this.setlistManager = new SetlistManager(this)
    this.uiManager = new UIManager(this)
    this.pdfExportManager = new PdfExportManager(this)
    this.initManager = new InitializationManager(this)
    this.staffDetector = new StaffDetector(this)
    this.gistShareManager = new GistShareManager(this)
    this.localBackupManager = new LocalBackupManager(this)
    this.supabaseManager = new SupabaseManager(this)
    this.editSubBarManager = new EditSubBarManager(this)
    this.editStripManager  = new EditStripManager(this)
    this.docBarStripManager = new DocBarStripManager(this)
    // Link strip ↔ sub-bar
    this.editStripManager.setSubBarManager(this.editSubBarManager)

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
    this.editSubBarManager.init()
    this.editStripManager.init()
    this.docBarStripManager.init()
    this.rulerManager.init()
    this.docBarManager.init()
    this.inputManager.init()
    this.profileManager.init()
    this.scoreDetailManager.init()
this.playbackManager.init()
    this.scoreManager.init()
    this.gistShareManager.init()
    this.settingsPanelManager.init()
    this.accountPanelManager.init()
    this.setlistManager.init()
    this.toolManager.initDraggable()
    this.toolManager.initToolbarResizable()

    const boot = async () => {
        try {
            this.showMessage('[Boot] 初始化系統 V3.1.4...', 'system')
            console.log('[ScoreFlow] Boot sequence started V3.1.4')
            await this.scoreManager.init()
            await this.setlistManager.init()

            // Wait for Supabase Auth to resolve (up to 2 seconds)
            if (this.supabaseManager) {
                let authAttempts = 0;
                while (!this.supabaseManager.user && authAttempts < 15) {
                    await new Promise(r => setTimeout(r, 100));
                    authAttempts++;
                }

                if (this.supabaseManager.user) {
                    console.log('[ScoreFlow] 📡 Supabase Auth ready, pulling setlists...');
                    const cloudSetlists = await this.supabaseManager.pullSetlists();
                    if (cloudSetlists && cloudSetlists.length > 0) {
                        await this.setlistManager.mergeSetlists(cloudSetlists);
                    } else if (this.setlistManager.setlists.length > 0) {
                        console.log('[ScoreFlow] Cloud is empty but local has data, pushing first flight...');
                        await this.supabaseManager.pushSetlists(this.setlistManager.setlists);
                    }
                    // Pull score registry AFTER scoreManager.init() completes.
                    // This prevents a race where SIGNED_IN fires during init() and
                    // the cloud-populated registry gets overwritten by the empty IndexedDB read.
                    // Critical for recovery when Safari purges IndexedDB storage.
                    await this.supabaseManager.pullScoreRegistry();
                } else {
                    console.log('[ScoreFlow] ⚠️ Supabase Auth not ready after wait, skipping early sync.');
                }
            }
            this.showMessage(`[Boot] 已載入 ${this.setlistManager.setlists.length} 個歌單`, 'system')
            await this.loadFromStorage()
            
            // 1. Primary Restore: Fingerprint-First (Most Reliable)
            const lastFp = localStorage.getItem('scoreflow_current_fingerprint')
            const lastScore = localStorage.getItem('scoreflow_last_opened_score')
            let restored = false

            if (lastFp) {
                this.showMessage(`[Boot] 嘗試指紋還原: ${lastFp.slice(0, 8)}`, 'system')
                const buf = await db.get(`score_buf_${lastFp}`)
                if (buf) {
                    console.log(`[ScoreFlow] Fingerprint buffer found for ${lastFp}`)
                    await this.loadPDF(new Uint8Array(buf), null, lastFp)
                    restored = true
                } else {
                    console.warn(`[ScoreFlow] Registry fingerprint exists but buffer missing: ${lastFp}`)
                }
            }

            // 2. Secondary Restore: Filename/Registry lookup (Fallback)
            if (!restored && lastScore) {
                this.showMessage(`[Boot] 嘗試檔名還原: ${lastScore}`, 'system')
                try {
                    restored = await this.openRecentScore(lastScore)
                } catch (err) {
                    console.warn('[ScoreFlow] Filename restore failed:', err)
                }
            }

            // 3. Tertiary Restore: Use ScoreManager auto-load (Library recent)
            if (!restored) {
                this.showMessage('[Boot] 嘗試載入最近庫存樂譜...', 'system')
                await this.scoreManager._autoLoadOnStartup()
            }

            // --- FINAL INSURANCE: If still no PDF loaded AND no load is currently in progress
            // (e.g. user clicked a library card while boot was running), load User Guide.
            if (!this.viewerManager.pdf && !this.viewerManager._loadingPdf) {
                this.showMessage('[Boot] 自動還原皆失敗，載入教學手冊...', 'info')
                await this.scoreManager.loadUserGuide()
            }
            
            this.renderLayerUI()
            this.renderSourceUI()
            this.toolManager.updateActiveTools()
            this.viewerManager.checkInitialView()
            this.toolManager.preloadSvgs()
            this.renderBuildInfo()
            console.log('[ScoreFlow] Boot complete - Version 3.1.4')
        } catch (err) {
            console.error('[ScoreFlow] CRITICAL BOOT ERROR:', err)
            this.showMessage('啟動出錯: ' + err.message, 'error')
            this.viewerManager.checkInitialView()
        }
    }
    boot()

    this.restoreTheme()
  }

  renderBuildInfo() {
    const branchEl = document.getElementById('build-branch')
    const timeEl = document.getElementById('build-time')
    const mode = typeof __APP_MODE__ !== 'undefined' ? __APP_MODE__ : 'current'
    
    if (branchEl) {
        branchEl.textContent = APP_BRANCH + (this.isDev ? ' (LOCAL)' : '')
        if (mode === 'stable') {
            branchEl.style.color = '#8b5cf6' // Purple for stable
            branchEl.textContent += ' [STABLE]'
        } else if (this.isDev) {
            branchEl.style.color = '#3b82f6' // Blue for dev
        }
    }
    if (timeEl) timeEl.textContent = BUILD_TIME

    const normalizedBranch = APP_BRANCH.replace('refs/heads/', '')
    if (mode === 'stable') {
        document.body.classList.add('env-stable')
        console.log('[ScoreFlow] Mode: STABLE (Purple)')
    } else if (this.isDev) {
        // Dev (LAN/Local) Priority
        document.body.classList.remove('env-main')
        document.body.classList.add('env-dev')
        console.log('[ScoreFlow] Mode: DEV/LAN (Blue)')
    } else if (normalizedBranch === 'main' || mode === 'current') {
        document.body.classList.add('env-main')
        console.log('[ScoreFlow] Mode: MAIN/GitHub (Amber)')
    }
  }

  async openRecentScore(name) {
    if (this.sidebar) this.sidebar.classList.remove('open')
    
    // 1. Check Transient Buffer (Solo uploads)
    const buf = await db.get(`recent_buf_${name}`)
    if (buf) {
        await this.loadPDF(new Uint8Array(buf), name)
        return true
    }

    // 2. NEW: Check Library Registry (Persisted scores)
    if (this.scoreManager?.registry?.length > 0) {
        const entry = this.scoreManager.registry.find(s => s.fileName === name || s.title === name)
        if (entry) {
            console.log(`[ScoreFlow] Found "${name}" in library registry. Using fingerprint: ${entry.fingerprint.slice(0, 8)}`)
            const libBuf = await db.get(`score_buf_${entry.fingerprint}`)
            if (libBuf) {
                await this.loadPDF(new Uint8Array(libBuf), entry.fileName || name, entry.fingerprint)
                return true
            }
        }
    }
    
    // 3. Check FileSystemHandle (Desktop only)
    const handle = await db.get(`recent_handle_${name}`)
    if (handle) {
      const file = await this.viewerManager.openFileHandle(handle)
      if (file) {
        const b = await file.arrayBuffer()
        await this.loadPDF(new Uint8Array(b), name)
        return true
      }
    }
    
    console.warn(`[ScoreFlow] Could not find the original file for "${name}".`)
    return false
  }

  onAnnotationChanged() {
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
      // 1. Clear all storage types
      localStorage.clear()
      sessionStorage.clear()
      
      try { 
        db.closeDB(); // CRITICAL: Close connection before clearing/deleting
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

  updateActiveToolPreset(val) {
      this.activeToolPreset = parseFloat(val) || 1.0
      // Redraw only for PREVIEW purpose of the current tool
      if (this.annotationManager) this.annotationManager.redrawAllAnnotationLayers()
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

  pushHistory(action) {
    this.history.push(action)
    if (this.history.length > 50) this.history.shift()
    this.redoStack = []
  }

  async undo() {
    if (this.history.length === 0) return
    const action = this.history.pop()
    this.redoStack.push(action)
    
    if (action.type === 'add') {
      const idx = this.stamps.findIndex(s => s.id === action.obj.id)
      if (idx !== -1) {
        const removed = this.stamps.splice(idx, 1)[0]
        if (this.supabaseManager) this.supabaseManager.pushAnnotation({...removed, deleted: true, updatedAt: Date.now()}, this.pdfFingerprint)
      }
    } else if (action.type === 'delete') {
      this.stamps.push(action.obj)
      if (this.supabaseManager) this.supabaseManager.pushAnnotation(action.obj, this.pdfFingerprint)
    }

    await this.saveToStorage(true)
    this.redrawAllAnnotationLayers()
    if (this.onAnnotationChanged) this.onAnnotationChanged()
  }

  async redo() {
    if (this.redoStack.length === 0) return
    const action = this.redoStack.pop()
    this.history.push(action)

    if (action.type === 'add') {
      this.stamps.push(action.obj)
      if (this.supabaseManager) this.supabaseManager.pushAnnotation(action.obj, this.pdfFingerprint)
    } else if (action.type === 'delete') {
      const idx = this.stamps.findIndex(s => s.id === action.obj.id)
      if (idx !== -1) {
        const removed = this.stamps.splice(idx, 1)[0]
        if (this.supabaseManager) this.supabaseManager.pushAnnotation({...removed, deleted: true, updatedAt: Date.now()}, this.pdfFingerprint)
      }
    }

    await this.saveToStorage(true)
    this.redrawAllAnnotationLayers()
    if (this.onAnnotationChanged) this.onAnnotationChanged()
  }

  showMessage(msg, type = 'info') { this.uiManager.showMessage(msg, type) }

  restoreTheme() {
    const savedTheme = localStorage.getItem('scoreflow_theme')
    if (savedTheme) {
        if (savedTheme === 'default') {
            document.documentElement.removeAttribute('data-theme')
        } else {
            document.documentElement.setAttribute('data-theme', savedTheme)
        }
    }

    const savedAccent = localStorage.getItem('scoreflow_accent_color')
    const savedAccentRgb = localStorage.getItem('scoreflow_accent_rgb')
    if (savedAccent && savedAccentRgb) {
        document.documentElement.style.setProperty('--primary', savedAccent)
        document.documentElement.style.setProperty('--primary-rgb', savedAccentRgb)
        document.documentElement.style.setProperty('--primary-hover', savedAccent)
    }
  }
}

new ScoreFlow()

// Register Service Worker for offline support
registerSW({
  onNeedRefresh() {
    if (confirm('ScoreFlow 偵測到重大更新 (V3.1.4)，是否立即重新載入以啟用歌單雲端同步？')) {
      window.location.reload();
    }
  },
  onOfflineReady() {
    console.log('[PWA] App ready to work offline.')
  },
})