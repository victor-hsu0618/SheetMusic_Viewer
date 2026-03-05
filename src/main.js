import './style.css'
import * as pdfjsLib from 'pdfjs-dist'
import * as db from './db.js'
import { INITIAL_LAYERS, TOOLSETS } from './constants.js'
import * as GDrive from './gdrive.js'

// Use local worker for total offline reliability
pdfjsLib.GlobalWorkerOptions.workerSrc = './pdfjs/pdf.worker.min.mjs'

class ScoreFlow {
  constructor() {
    this.pdf = null
    this.pages = []
    // Professional Layer Presets
    this.layers = [...INITIAL_LAYERS]
    this.stamps = []
    this.nextTargetAnchor = null
    this.rulerVisible = localStorage.getItem('scoreflow_ruler_visible') !== 'false'
    this.activeLayerId = 'draw'
    this.activeStampType = 'view'
    this.activeCategories = null // initialized after initToolsets()
    this.activeCategory = 'Edit'
    this.isMultiSelectMode = true // Default to High-Density mode for pro musicians
    this.scale = 1.5
    this.toolbarWidth = 600 // High-Performance Default Width
    this.isSidebarLocked = false
    this.pdfFingerprint = null // Professional Score ID
    this.lastUsedToolPerCategory = {}
    this.sources = [
      { id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' }
    ]
    this.activeSourceId = 'self'
    this.profiles = [
      { id: 'p1', name: 'Guest Musician', orchestra: 'Standard Orchestra', section: 'Section', initial: 'G' }
    ]
    this.activeProfileId = 'p1'

    // Mission State Context
    this.pendingMissionProfileId = null
    this.pendingMissionHandle = null
    this.pendingOrchestraHandle = null

    this._svgCache = {}
    this.initToolsets()
    this.initElements()
    this.initEventListeners()
    this.initDraggable()
    this.initToolbarResizable()
    this.initSidebarResizable()
    this.renderLayerUI()
    this.updateActiveTools()
    this.loadFromStorage()
    this.renderInlineRecentScores()
    this.updateZoomDisplay()
    this.updateJumpLinePosition()
    this.renderSourceUI()
    this.renderCommunityHub()
    this.renderActiveProfile()
    this.renderLibrary()
    this.initDocBarDraggable()
    this.checkInitialView()
    this.initGDriveWhenReady()
    this._preloadSvgs()
  }

  async initGDriveWhenReady() {
    try {
      await GDrive.init()
    } catch (e) {
      console.warn('GDrive init failed (GSI not loaded?):', e)
      return
    }

    const signinBtn   = document.getElementById('gdrive-signin-btn')
    const signoutBtn  = document.getElementById('gdrive-signout-btn')
    const saveBtn     = document.getElementById('gdrive-save-btn')
    const loadBtn     = document.getElementById('gdrive-load-btn')
    const browseBtn   = document.getElementById('gdrive-browse-btn')
    const closeBtn    = document.getElementById('close-gdrive-browser')
    const searchInput = document.getElementById('gdrive-search')
    const loadMoreBtn = document.getElementById('gdrive-load-more-btn')

    if (signinBtn) {
      signinBtn.onclick = async () => {
        signinBtn.textContent = 'Connecting...'
        signinBtn.disabled = true
        try {
          await GDrive.signIn()
          this.updateDriveUI()
        } catch (e) {
          console.error('Drive sign-in failed:', e)
          signinBtn.textContent = '☁ Connect Google Drive'
          signinBtn.disabled = false
        }
      }
    }

    if (signoutBtn) {
      signoutBtn.onclick = () => { GDrive.signOut(); this.updateDriveUI() }
    }

    if (browseBtn) {
      browseBtn.onclick = () => this.showDriveBrowser()
    }

    if (saveBtn) {
      saveBtn.onclick = async () => {
        if (!this.pdfFingerprint) { alert('No score loaded.'); return }
        const orig = saveBtn.textContent
        saveBtn.textContent = 'Saving...'
        saveBtn.disabled = true
        try {
          await GDrive.saveAnnotations(this.pdfFingerprint, this.stamps)
          saveBtn.textContent = '✅ Saved!'
        } catch (e) {
          console.error('Drive save failed:', e)
          saveBtn.textContent = '❌ Failed'
        }
        setTimeout(() => { saveBtn.textContent = orig; saveBtn.disabled = false }, 2500)
      }
    }

    if (loadBtn) {
      loadBtn.onclick = async () => {
        if (!this.pdfFingerprint) { alert('No score loaded.'); return }
        const orig = loadBtn.textContent
        loadBtn.textContent = 'Loading...'
        loadBtn.disabled = true
        try {
          const data = await GDrive.loadAnnotations(this.pdfFingerprint)
          if (!data) {
            loadBtn.textContent = '(No backup found)'
            setTimeout(() => { loadBtn.textContent = orig; loadBtn.disabled = false }, 2500)
            return
          }
          this.stamps = data.stamps || []
          this.saveToStorage()
          const pages = [...new Set(this.stamps.map(s => s.page))]
          pages.forEach(p => this.redrawStamps(p))
          this.updateRulerMarks()
          loadBtn.textContent = '✅ Loaded!'
        } catch (e) {
          console.error('Drive load failed:', e)
          loadBtn.textContent = '❌ Failed'
        }
        setTimeout(() => { loadBtn.textContent = orig; loadBtn.disabled = false }, 2500)
      }
    }

    if (closeBtn) {
      closeBtn.onclick = () => document.getElementById('gdrive-browser-modal')?.classList.remove('active')
    }

    let _searchTimer
    if (searchInput) {
      searchInput.oninput = () => {
        clearTimeout(_searchTimer)
        _searchTimer = setTimeout(() => {
          this._driveNextPage = null
          this._loadDriveFiles(searchInput.value)
        }, 400)
      }
    }

    if (loadMoreBtn) {
      loadMoreBtn.onclick = () => {
        const q = document.getElementById('gdrive-search')?.value || ''
        this._loadDriveFiles(q, true)
      }
    }
  }

  updateDriveUI() {
    const signedIn   = GDrive.isSignedIn()
    const signinBtn  = document.getElementById('gdrive-signin-btn')
    const userInfo   = document.getElementById('gdrive-user-info')
    const statusText = document.getElementById('gdrive-status-text')
    const browseBtn  = document.getElementById('gdrive-browse-btn')

    if (signinBtn)  signinBtn.style.display  = signedIn ? 'none' : ''
    if (userInfo)   userInfo.style.display    = signedIn ? 'block' : 'none'
    if (statusText) statusText.textContent    = signedIn ? `✅ ${GDrive.getUserEmail()}` : ''
    if (browseBtn)  browseBtn.style.display   = signedIn ? '' : 'none'
  }

  async showDriveBrowser() {
    const modal = document.getElementById('gdrive-browser-modal')
    if (!modal) return
    modal.classList.add('active')
    this._driveNextPage = null
    const searchInput = document.getElementById('gdrive-search')
    if (searchInput) searchInput.value = ''
    await this._loadDriveFiles('')
  }

  async _loadDriveFiles(query = '', append = false) {
    const list    = document.getElementById('gdrive-files-list')
    const moreBtn = document.getElementById('gdrive-load-more-btn')
    if (!list) return

    if (!append) {
      list.innerHTML = '<div class="empty-state" style="padding:20px 0">Loading...</div>'
      this._driveNextPage = null
    }

    try {
      const data = await GDrive.listPDFs(query, append ? this._driveNextPage : null)
      this._driveNextPage = data.nextPageToken || null
      if (moreBtn) moreBtn.style.display = this._driveNextPage ? '' : 'none'

      if (!append) list.innerHTML = ''

      if (!data.files?.length) {
        if (!append) list.innerHTML = '<div class="empty-state" style="padding:20px 0">No PDF files found.</div>'
        return
      }

      data.files.forEach(file => {
        const row = document.createElement('div')
        row.className = 'gdrive-file-row'
        const size = file.size ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : ''
        const date = file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : ''
        row.innerHTML = `
          <span style="font-size:1.2rem;flex-shrink:0">📄</span>
          <div style="flex:1;min-width:0">
            <div class="gdrive-file-name">${file.name}</div>
            <div class="gdrive-file-meta">${[date, size].filter(Boolean).join(' · ')}</div>
          </div>
        `
        row.onclick = async () => {
          row.style.opacity = '0.5'
          row.style.pointerEvents = 'none'
          try {
            const buf = await GDrive.downloadFile(file.id)
            await this.addToRecentSoloScores(file.name)
            await this.loadPDF(new Uint8Array(buf))
            this.activeScoreName = file.name
            this.saveToStorage()
            this.renderLibrary()
            document.getElementById('gdrive-browser-modal')?.classList.remove('active')
          } catch (e) {
            console.error('Drive open failed:', e)
            row.style.opacity = ''
            row.style.pointerEvents = ''
            alert('Failed to open from Drive. Please try again.')
          }
        }
        list.appendChild(row)
      })
    } catch (e) {
      console.error('Drive list failed:', e)
      list.innerHTML = '<div class="empty-state">Failed to load. Check connection.</div>'
    }
  }

  async _preloadSvgs() {
    const base = import.meta.env.BASE_URL
    const items = this.toolsets.flatMap(g =>
      g.tools.map(t => ({ id: t.id, path: `${base}assets/icons/${g.type}/${t.id}.svg` }))
    )
    await Promise.allSettled(items.map(async ({ id, path }) => {
      try {
        const r = await fetch(path)
        if (r.ok) this._svgCache[id] = await r.text()
      } catch {}
    }))
    this.updateActiveTools()
  }

  initToolsets() {
    this.toolsets = TOOLSETS
    this.activeCategories = this.toolsets.map(g => g.name)
  }

  initElements() {
    this.container = document.getElementById('pdf-viewer')
    this.uploader = document.getElementById('pdf-upload')
    this.uploadBtn = document.getElementById('upload-btn')
    this.sidebar = document.getElementById('sidebar')
    this.sidebarTrigger = document.getElementById('sidebar-trigger')
    this.layerList = document.getElementById('layer-list')
    this.zoomInBtn = document.getElementById('zoom-in')
    this.zoomOutBtn = document.getElementById('zoom-out')
    this.zoomLevelDisplay = document.getElementById('zoom-level')
    this.btnFitWidth = document.getElementById('btn-fit-width')
    this.btnFitHeight = document.getElementById('btn-fit-height')
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
    this.monkeyEnabledInput = document.getElementById('monkey-enabled')
    this.jumpSpeedInput = document.getElementById('jump-speed')
    this.jumpSpeedValue = document.getElementById('jump-speed-value')
    this.docBar = document.getElementById('floating-doc-bar')

    this.monkeyEnabled = localStorage.getItem('scoreflow_monkey_enabled') !== 'false'
    this.jumpSpeed = parseInt(localStorage.getItem('scoreflow_jump_speed')) || 400

    if (this.monkeyEnabledInput) this.monkeyEnabledInput.checked = this.monkeyEnabled
    if (this.jumpSpeedInput) {
      this.jumpSpeedInput.value = this.jumpSpeed
      if (this.jumpSpeedValue) this.jumpSpeedValue.textContent = `${this.jumpSpeed}ms`
    }
    this.exportBtn = document.getElementById('export-btn')
    this.importBtn = document.getElementById('import-btn')
    this.importFileInput = document.getElementById('import-file')
    this.sourceList = document.getElementById('source-list')
    this.addSourceBtn = document.getElementById('add-source-btn')
    this.sharedList = document.getElementById('shared-list')

    // Collaboration Buttons & UI
    this.publishPersonalBtn = document.getElementById('publish-personal-btn')
    this.publishOrchestraBtn = document.getElementById('publish-orchestra-btn')
    this.connectPersonalBtn = document.getElementById('connect-personal-btn')
    this.connectOrchestraBtn = document.getElementById('connect-orchestra-btn')
    this.syncAllBtn = document.getElementById('sync-all-btn')

    this.personalStatus = document.getElementById('personal-status')
    this.orchestraStatus = document.getElementById('orchestra-status')

    // Quick Load Elements
    this.quickLoadModal = document.getElementById('quick-load-modal')
    this.quickLoadMenuBtn = document.getElementById('quick-load-menu-btn')
    this.closeQuickLoadBtn = document.getElementById('close-quick-load-modal')
    this.recentScoresList = document.getElementById('recent-scores-list')
    this.recentScoresInline = document.getElementById('recent-scores-inline')
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
    this.personalSyncFolder = null
    this.orchestraSyncFolder = null

    // Mission & Welcome Elements
    this.missionSelectionView = document.getElementById('mission-selection-view')
    this.startMissionBtn = document.getElementById('start-new-mission-btn')
    this.recentMissionsContainer = document.getElementById('recent-missions-container')
    this.openExistingMissionBtn = document.getElementById('open-existing-mission-btn')
    this.welcomeSoloPanel = document.getElementById('welcome-solo-panel')
    this.backToMissionsBtn = document.getElementById('back-to-missions-btn')
    this.openSoloAltBtn = document.getElementById('welcome-open-file-alt')
    this.demoPDFBtn = document.getElementById('welcome-demo-btn')
    this.exitMissionBtn = document.getElementById('exit-mission-btn')

    this.identitySelectionView = document.getElementById('identity-selection-view')
    this.setupStage1 = document.getElementById('setup-stage-1')
    this.setupStage2 = document.getElementById('setup-stage-2')
    this.setupStage3 = document.getElementById('setup-stage-3')

    this.welcomeProfileList = document.getElementById('welcome-profile-list')
    this.welcomeAddProfileBtn = document.getElementById('welcome-add-profile-btn')
    this.resetLayersStandardBtn = document.getElementById('reset-layers-standard-btn')
    this.resetLayersSidebarBtn = document.getElementById('reset-layers-sidebar-btn')
    this.libraryList = document.getElementById('library-scores-list')
    this.openFileBtn = document.getElementById('open-file-btn')
    this.librarySearchInput = document.getElementById('library-search')
    this.resetSystemBtn = document.getElementById('reset-system-btn')

    this.setupCardScore = document.getElementById('setup-card-score')
    this.setupCardShared = document.getElementById('setup-card-shared')
    this.setupStatusScore = document.getElementById('setup-status-score')
    this.setupStatusShared = document.getElementById('setup-status-shared')
    this.finalStartMissionBtn = document.getElementById('final-start-mission')
    // Jump & Mode UI
    this.btnJumpHead = document.getElementById('btn-jump-head')
    this.btnJumpEnd = document.getElementById('btn-jump-end')
    this.btnRulerToggle = document.getElementById('btn-ruler-toggle')
    this.btnFullscreen = document.getElementById('btn-fullscreen')
    this.btnModeAnchor = document.getElementById('btn-mode-anchor')
    this.btnModeSelect = document.getElementById('btn-mode-select')
    this.btnModeEraser = document.getElementById('btn-mode-eraser')
    this.btnModeHand = document.getElementById('btn-mode-hand')
    this.btnStampPalette = document.getElementById('btn-stamp-palette')

    this.libraryFiles = [] // Scanned repertoire
    this.libraryFolderHandle = null
    this.activeScoreName = null

    this.jumpOffsetPx = 1 * 37.8

    // Role Selection Elements
    this.roleModal = document.getElementById('role-selection-modal')
    this.closeRoleModalBtn = document.getElementById('close-role-modal')
    this.roleBtns = document.querySelectorAll('.role-btn')

    // Resizer
    this.sidebarResizer = document.getElementById('sidebar-resizer')

    // Floating Layer Control
    this.layerToggleBtn = document.getElementById('layer-toggle-fab')
    this.layerShelf = document.getElementById('layer-shelf')
    this.closeLayerShelfBtn = document.getElementById('close-layer-shelf')
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
    this.uploader.addEventListener('change', (e) => this.handleUpload(e))

    this.sidebarTrigger.addEventListener('click', () => {
      this.sidebar.classList.add('open')
      this.updateLayoutState()
    })

    this.sidebar.addEventListener('mouseleave', () => {
      if (!this.isSidebarLocked) {
        this.sidebar.classList.remove('open')
        this.updateLayoutState()
      }
    })

    // iPad: tap outside sidebar to close it
    document.addEventListener('touchstart', (e) => {
      if (!this.isSidebarLocked &&
        this.sidebar.classList.contains('open') &&
        !this.sidebar.contains(e.target) &&
        !this.sidebarTrigger.contains(e.target)) {
        this.sidebar.classList.remove('open')
        this.updateLayoutState()
      }
    }, { passive: true })

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

    // Dialog Close
    if (this.closeDialogBtn) {
      this.closeDialogBtn.addEventListener('click', () => {
        this.systemDialog.classList.remove('active')
      })
    }

    // Collaboration Listeners
    if (this.publishPersonalBtn) {
      this.publishPersonalBtn.addEventListener('click', () => this.publishWork('personal'))
    }
    if (this.publishOrchestraBtn) {
      this.publishOrchestraBtn.addEventListener('click', () => this.publishWork('orchestra'))
    }
    if (this.connectPersonalBtn) {
      this.connectPersonalBtn.addEventListener('click', () => this.connectSyncFolder('personal'))
    }
    if (this.connectOrchestraBtn) {
      this.connectOrchestraBtn.addEventListener('click', () => this.connectSyncFolder('orchestra'))
    }
    if (this.syncAllBtn) {
      this.syncAllBtn.addEventListener('click', () => this.renderCommunityHub())
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

    // Floating Layer Shelf Listeners
    if (this.layerToggleBtn) {
      this.layerToggleBtn.addEventListener('click', () => {
        this.layerShelf.classList.toggle('active')
      })
    }
    if (this.closeLayerShelfBtn) {
      this.closeLayerShelfBtn.addEventListener('click', () => {
        this.layerShelf.classList.remove('active')
      })
    }

    // iPad: tap outside layer-shelf to close it
    document.addEventListener('touchstart', (e) => {
      if (this.layerShelf &&
        this.layerShelf.classList.contains('active') &&
        !this.layerShelf.contains(e.target) &&
        !this.layerToggleBtn.contains(e.target)) {
        this.layerShelf.classList.remove('active')
      }
    }, { passive: true })

    // Keyboard shortcut for toggle visibility (Shift+V)
    document.addEventListener('keydown', (e) => {
      if (e.shiftKey && e.key === 'V') {
        if (this.layerShelf) this.layerShelf.classList.toggle('active')
      }
    })

    if (this.closeQuickLoadBtn) {
      this.closeQuickLoadBtn.addEventListener('click', () => this.toggleQuickLoadModal(false))
    }
    if (this.openNewSoloBtn) {
      this.openNewSoloBtn.addEventListener('click', async () => {
        this.toggleQuickLoadModal(false)
        await this.openSoloPDF()
      })
    }

    if (this.openFileBtn) {
      this.openFileBtn.addEventListener('click', () => this.openSoloPDF())
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

    if (this.zoomInBtn) {
      this.zoomInBtn.addEventListener('click', () => this.changeZoom(0.1))
    }
    if (this.zoomOutBtn) {
      this.zoomOutBtn.addEventListener('click', () => this.changeZoom(-0.1))
    }
    if (this.btnFitWidth) {
      this.btnFitWidth.addEventListener('click', () => this.fitToWidth())
    }
    if (this.btnFitHeight) {
      this.btnFitHeight.addEventListener('click', () => this.fitToHeight())
    }

    if (this.closeShortcutsBtn) {
      this.closeShortcutsBtn.addEventListener('click', () => this.toggleShortcuts(false))
    }

    if (this.closeSidebarBtn) {
      this.closeSidebarBtn.addEventListener('click', () => {
        this.sidebar.classList.remove('open')
        this.isSidebarLocked = false
        if (this.lockSidebarBtn) this.lockSidebarBtn.classList.remove('locked')
        this.updateLayoutState()
      })
    }

    if (this.resetLayersStandardBtn) {
      this.resetLayersStandardBtn.addEventListener('click', () => this.resetLayers())
    }
    if (this.resetLayersSidebarBtn) {
      this.resetLayersSidebarBtn.addEventListener('click', () => this.resetLayers())
    }

    if (this.welcomeAddProfileBtn) {
      this.welcomeAddProfileBtn.addEventListener('click', () => this.addNewProfile())
    }

    if (this.welcomeChangeIdentityBtn) {
      this.welcomeChangeIdentityBtn.addEventListener('click', () => {
        if (this.identitySelectionView) {
          this.identitySelectionView.classList.remove('hidden')
          this.showSetupStage(1)
        }
        if (this.welcomeInitialView) this.welcomeInitialView.classList.add('hidden')
      })
    }


    if (this.startMissionBtn) {
      this.startMissionBtn.addEventListener('click', () => this.startNewMission())
    }
    if (this.backToMissionsBtn) {
      this.backToMissionsBtn.addEventListener('click', () => {
        if (this.identitySelectionView) this.identitySelectionView.classList.add('hidden')
        if (this.missionSelectionView) this.missionSelectionView.classList.remove('hidden')
      })
    }
    if (this.openExistingMissionBtn) {
      this.openExistingMissionBtn.addEventListener('click', () => {
        if (!this.recentMissionsContainer) return
        const isOpen = !this.recentMissionsContainer.classList.contains('hidden')
        if (isOpen) {
          this.recentMissionsContainer.classList.add('hidden')
        } else {
          this.recentMissionsContainer.classList.remove('hidden')
          this.renderRecentMissions()
        }
      })
    }
    if (this.openSoloAltBtn) {
      this.openSoloAltBtn.addEventListener('click', async () => {
        const hasHistory = this.recentSoloScores && this.recentSoloScores.length > 0
        if (!hasHistory) {
          // No history — go straight to file picker
          await this.openSoloPDF()
          return
        }
        // Toggle the recent-scores panel
        if (!this.welcomeSoloPanel) return
        const isOpen = !this.welcomeSoloPanel.classList.contains('hidden')
        if (isOpen) {
          this.welcomeSoloPanel.classList.add('hidden')
        } else {
          this.welcomeSoloPanel.classList.remove('hidden')
          this.renderWelcomeSoloPanel()
        }
      })
    }
    if (this.demoPDFBtn) {
      this.demoPDFBtn.addEventListener('click', () => this.loadDemoPDF())
    }
    if (this.exitMissionBtn) {
      this.exitMissionBtn.addEventListener('click', () => this.exitMission())
    }

    // Mission Setup Card Listeners
    if (this.setupCardScore) {
      this.setupCardScore.onclick = () => this.selectMissionFolder()
    }
    if (this.setupCardShared) {
      this.setupCardShared.onclick = () => this.selectOrchestraFolder()
    }

    // Step Navigation (Three Stages)
    document.querySelectorAll('.setup-back-btn').forEach(btn => {
      btn.onclick = () => {
        const target = parseInt(btn.getAttribute('data-to'))
        this.showSetupStage(target)
      }
    })

    // Navigation (Jump) Actions
    if (this.btnJumpHead) this.btnJumpHead.onclick = () => this.goToHead()
    if (this.btnJumpEnd) this.btnJumpEnd.onclick = () => this.goToEnd()
    if (this.btnRulerToggle) this.btnRulerToggle.addEventListener('click', () => this.toggleRuler())
    if (this.btnFullscreen) this.btnFullscreen.addEventListener('click', () => this.toggleFullscreen())
    document.addEventListener('fullscreenchange', () => this._onFullscreenChange())

    // Quick Mode Actions
    if (this.btnModeSelect) {
      this.btnModeSelect.onclick = () => {
        this.activeStampType = this.activeStampType === 'select' ? 'view' : 'select'
        this.updateActiveTools()
      }
    }
    if (this.btnModeEraser) {
      this.btnModeEraser.onclick = () => {
        this.activeStampType = this.activeStampType === 'eraser' ? 'view' : 'eraser'
        this.updateActiveTools()
      }
    }
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
        this.activeToolsContainer.classList.toggle('expanded')
        this.updateActiveTools()
      })
    }

    if (this.finalStartMissionBtn) {
      this.finalStartMissionBtn.onclick = () => this.completeMissionSetup()
    }

    // Generic Setup Stage Navigation (Back/Next)
    document.querySelectorAll('.setup-back-btn').forEach(btn => {
      btn.onclick = () => {
        const to = parseInt(btn.dataset.to)
        this.showSetupStage(to)
      }
    })

    if (this.jumpOffsetInput) {
      this.jumpOffsetInput.addEventListener('input', (e) => {
        const cm = parseFloat(e.target.value)
        if (this.jumpOffsetValue) this.jumpOffsetValue.textContent = `${cm.toFixed(1)}cm`
        this.jumpOffsetPx = cm * 37.8
        this.updateJumpLinePosition()
        localStorage.setItem('scoreflow_jump_offset', cm)
        this.updateRulerMarks()
      })
    }

    if (this.monkeyEnabledInput) {
      this.monkeyEnabledInput.addEventListener('change', (e) => {
        this.monkeyEnabled = e.target.checked
        localStorage.setItem('scoreflow_monkey_enabled', this.monkeyEnabled)
        if (!this.monkeyEnabled) {
          const existing = document.querySelector('.ruler-monkey')
          if (existing) existing.remove()
        }
      })
    }

    if (this.jumpSpeedInput) {
      this.jumpSpeedInput.addEventListener('input', (e) => {
        this.jumpSpeed = parseInt(e.target.value)
        if (this.jumpSpeedValue) this.jumpSpeedValue.textContent = `${this.jumpSpeed}ms`
        localStorage.setItem('scoreflow_jump_speed', this.jumpSpeed)
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

      // Stamp palette shortcuts — two-level navigation
      const paletteOpen = this.activeToolsContainer?.classList.contains('expanded')
      if (paletteOpen) {
        const inSingleGroup = this.activeCategories.length === 1

        if (inSingleGroup) {
          // ── Level 2: numbers select tools, letters still switch/back groups ──
          const toolIndex = parseInt(e.key) - 1
          if (!isNaN(toolIndex) && toolIndex >= 0) {
            const group = this.toolsets.find(g => g.name === this.activeCategories[0])
            if (group?.tools[toolIndex]) {
              e.preventDefault()
              this.activeStampType = group.tools[toolIndex].id
              this.lastUsedToolPerCategory[group.name] = group.tools[toolIndex].id
              this.updateActiveTools()
              return
            }
          }
          // Letters: switch group or back to level 1
          const groupByLetter = this.toolsets.find(g => g.letter === e.key.toUpperCase())
          if (groupByLetter) {
            e.preventDefault()
            this.selectGroup(groupByLetter.name)
            return
          }
        } else {
          // ── Level 1: numbers AND letters select group ──
          const groupByKey = this.toolsets.find(g => g.num === e.key || g.letter === e.key.toUpperCase())
          if (groupByKey) {
            e.preventDefault()
            this.selectGroup(groupByKey.name)
            return
          }
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
      if (e.key === '=' || e.key === '+') {
        this.changeZoom(0.1)
      }
      if (e.key === '-') {
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

    try {
      const reader = new FileReader()
      reader.onerror = (err) => {
        console.error('FileReader error:', err)
        alert('Error reading the file.')
      }

      reader.onload = async (event) => {
        const buffer = event.target.result
        try {
          await this.addToRecentSoloScores(file.name)
          await this.loadPDF(new Uint8Array(buffer))
          this.activeScoreName = file.name
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

  async openSoloPDF() {
    if ('showOpenFilePicker' in window) {
      try {
        const [handle] = await window.showOpenFilePicker({
          types: [{ description: 'PDF Files', accept: { 'application/pdf': ['.pdf'] } }],
          multiple: false
        })
        const file = await handle.getFile()
        const buffer = await file.arrayBuffer()
        await this.addToRecentSoloScores(file.name, handle)
        await this.loadPDF(new Uint8Array(buffer))
        this.activeScoreName = file.name
        this.saveToStorage()
        this.renderLibrary()
      } catch (e) {
        if (e.name !== 'AbortError') console.error('Failed to open PDF:', e)
      }
    } else {
      if (this.uploader) this.uploader.click()
    }
  }

  async getFingerprint(buffer) {
    // crypto.subtle requires HTTPS — fallback to simple hash for HTTP (local dev / iPad)
    if (window.isSecureContext && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    }
    // Fallback: fast non-cryptographic hash (djb2) for HTTP environments
    const bytes = new Uint8Array(buffer)
    let hash = 5381
    // Sample every 64 bytes for speed on large PDFs
    for (let i = 0; i < bytes.length; i += 64) {
      hash = ((hash << 5) + hash) ^ bytes[i]
      hash = hash >>> 0 // keep as unsigned 32-bit
    }
    return 'fallback_' + hash.toString(16) + '_' + bytes.length
  }

  async loadDemoPDF() {
    const base = import.meta.env.BASE_URL || '/SheetMusic_Viewer/'
    const url = base.replace(/\/$/, '') + '/demo/demo.pdf'
    if (this.demoPDFBtn) {
      this.demoPDFBtn.disabled = true
      this.demoPDFBtn.textContent = 'Loading…'
    }
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = await res.arrayBuffer()
      await this.loadPDF(new Uint8Array(buffer))
      this.activeScoreName = 'Demo Score'
    } catch (err) {
      console.error('Demo PDF load failed:', err)
      alert('Could not load demo score. Please try uploading your own PDF.')
    } finally {
      if (this.demoPDFBtn) {
        this.demoPDFBtn.disabled = false
        this.demoPDFBtn.textContent = '▶ Try Demo Score'
      }
    }
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
    this.updateJumpLinePosition()
    this.updateRulerPosition()
    this.updateRulerClip()
    this.updateRulerMarks()
    this.showMainUI()
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
    this.viewer.style.paddingLeft = '0'
    this.updateZoomDisplay()
    if (this.pdf) await this.renderPDF()
    this.updateRulerPosition()
    this.computeNextTarget()
    this.updateRulerMarks()
  }

  async fitToWidth() {
    if (!this.pdf) return
    const page = await this.pdf.getPage(1)
    const naturalWidth = page.getViewport({ scale: 1 }).width
    const rulerW = this.rulerVisible ? (parseInt(getComputedStyle(document.getElementById('jump-ruler')).width) || 28) : 0
    // Shift centering right by rulerW so the gray gap ends up on the left (behind ruler), not the right
    this.viewer.style.paddingLeft = rulerW > 0 ? `${rulerW}px` : '0'
    const availW = this.viewer.clientWidth - rulerW - 8 // 8px breathing room
    this.scale = Math.min(Math.max(0.5, availW / naturalWidth), 4)
    this.updateZoomDisplay()
    await this.renderPDF()
    this.updateRulerPosition()
    this.computeNextTarget()
    this.updateRulerMarks()
  }

  async fitToHeight() {
    if (!this.pdf) return
    this.viewer.style.paddingLeft = '0'
    const page = await this.pdf.getPage(1)
    const naturalHeight = page.getViewport({ scale: 1 }).height
    const availH = this.viewer.clientHeight - 16 // 16px breathing room
    this.scale = Math.min(Math.max(0.5, availH / naturalHeight), 4)
    this.updateZoomDisplay()
    await this.renderPDF()
    this.updateRulerPosition()
    this.computeNextTarget()
    this.updateRulerMarks()
  }

  updateZoomDisplay() {
    if (this.zoomLevelDisplay) {
      this.zoomLevelDisplay.textContent = `${Math.round(this.scale * 100)}%`
    }
  }

  async renderPDF() {
    // Hide welcome screen but keep it in the DOM (needed when Exit Mission restores it)
    const welcomeScreen = this.container.querySelector('.welcome-screen')
    if (welcomeScreen) welcomeScreen.classList.add('hidden')

    // Remove only page elements — preserve welcome-screen DOM node
    this.container.querySelectorAll('.page-container').forEach(el => el.remove())
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

      // After page 1 is fully rendered: show UI immediately (ruler, toolbar)
      // Remaining pages continue rendering in the background
      if (i === 1) {
        this.updateJumpLinePosition()
        this.updateRulerPosition()
        this.updateRulerClip()
        this.updateRulerMarks()
        this.showMainUI()
      }
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
    let isPanning = false
    this.hoveredStamp = null
    this.selectHoveredStamp = null // Separate hover state for Select mode

    // Offset so the stamp lands above-left of cursor/finger, not under it
    const STAMP_OFFSET = 62
    const FREEHAND_TYPES = ['pen', 'highlighter', 'line', 'eraser', 'select', 'view']

    // Normalized position stored at ghost-render time — used for stamp placement so both
    // always reference the same overlay rect snapshot (avoids scroll-drift between events).
    let ghostNormPos = null

    const showStampGhost = (clientX, clientY) => {
      const toolType = this.activeStampType
      if (FREEHAND_TYPES.includes(toolType)) { hideStampGhost(); return }

      // Canvas size is 3× the stamp draw size — large enough to contain any symbol type
      const stampSize = 18 * (this.scale / 1.5)
      const canvasSize = Math.round(stampSize * 3)

      let ghost = wrapper.querySelector('.stamp-ghost')
      if (!ghost || ghost.dataset.tool !== toolType || ghost.dataset.scaleKey !== String(this.scale)) {
        if (ghost) ghost.remove()
        ghost = document.createElement('div')
        ghost.className = 'stamp-ghost'
        ghost.dataset.tool = toolType
        ghost.dataset.scaleKey = String(this.scale)
        ghost.style.width = canvasSize + 'px'
        ghost.style.height = canvasSize + 'px'

        const tool = this.toolsets.flatMap(g => g.tools).find(t => t.id === toolType)
        const useCanvasPreview = tool?.draw?.type !== 'special'  // input-text needs user text → use icon fallback

        if (useCanvasPreview) {
          const group = this.toolsets.find(g => g.tools.some(t => t.id === toolType))
          const layer = group ? this.layers.find(l => l.type === group.type) : null
          const color = layer?.color || '#6366f1'
          const gc = document.createElement('canvas')
          gc.width = canvasSize
          gc.height = canvasSize
          gc.style.width = canvasSize + 'px'
          gc.style.height = canvasSize + 'px'
          const fakeStamp = { type: toolType, x: 0.5, y: 0.5, data: null, layerId: layer?.id || 'draw', sourceId: 'self' }
          this.drawStampOnCanvas(gc.getContext('2d'), gc, fakeStamp, color, false, false, false, true)
          ghost.appendChild(gc)
        } else {
          // Fallback for input-text: show icon at stamp size
          if (tool) ghost.innerHTML = this.getIcon(tool, Math.round(stampSize))
        }
        wrapper.appendChild(ghost)
      }
      const rect = overlay.getBoundingClientRect()
      const gx = clientX - rect.left - STAMP_OFFSET
      const gy = clientY - rect.top  - STAMP_OFFSET
      ghost.style.left = gx + 'px'
      ghost.style.top  = gy + 'px'
      // Store normalized position using the SAME rect snapshot — stamp placement reads this directly
      ghostNormPos = { x: Math.max(0, gx / rect.width), y: Math.max(0, gy / rect.height) }
    }
    const hideStampGhost = () => {
      const ghost = wrapper.querySelector('.stamp-ghost')
      if (ghost) ghost.remove()
    }

    const getPos = (e) => {
      const rect = overlay.getBoundingClientRect()
      const clientX = e.clientX || (e.touches && e.touches[0].clientX)
      const clientY = e.clientY || (e.touches && e.touches[0].clientY)
      return {
        x: (clientX - rect.left) / rect.width,
        y: (clientY - rect.top) / rect.height
      }
    }
    // Returns position offset upper-left of cursor/finger so the stamp doesn't hide under it.
    // If _normPos is pre-set (e.g. from ghostNormPos), use it directly to avoid a second getBCR call.
    const getStampPos = (e) => {
      if (e._normPos) return e._normPos
      const rect = overlay.getBoundingClientRect()
      const clientX = (e.clientX ?? e.touches?.[0]?.clientX) - STAMP_OFFSET
      const clientY = (e.clientY ?? e.touches?.[0]?.clientY) - STAMP_OFFSET
      return {
        x: Math.max(0, (clientX - rect.left) / rect.width),
        y: Math.max(0, (clientY - rect.top) / rect.height)
      }
    }

    const startAction = (e) => {
      const pos = getPos(e)
      const toolType = this.activeStampType

      // View mode: drag-to-pan (mouse only; touch uses native scroll)
      if (toolType === 'view') {
        if (e.type !== 'touchstart') {
          isPanning = true
          const startX = e.clientX, startY = e.clientY
          const startScrollTop = this.viewer.scrollTop
          const startScrollLeft = this.viewer.scrollLeft
          overlay.style.cursor = 'grabbing'
          // Disable smooth-scroll during drag so scrollTop updates are instant
          this.viewer.style.scrollBehavior = 'auto'
          e.preventDefault()
          const doPan = (ev) => {
            if (!isPanning) return
            this.viewer.scrollTop = startScrollTop - (ev.clientY - startY)
            this.viewer.scrollLeft = startScrollLeft - (ev.clientX - startX)
          }
          const stopPan = () => {
            isPanning = false
            overlay.style.cursor = ''
            this.viewer.style.scrollBehavior = ''
            window.removeEventListener('mousemove', doPan)
            window.removeEventListener('mouseup', stopPan)
          }
          window.addEventListener('mousemove', doPan)
          window.addEventListener('mouseup', stopPan)
        }
        return
      }

      // Allow multi-touch gestures (like 2-finger scroll/zoom) to pass through to the browser
      if (e.type === 'touchstart' && e.touches && e.touches.length > 1) {
        return // Let browser handle 2-finger scroll
      }

      if (e.type === 'touchstart') e.preventDefault()
      hideStampGhost()
      isInteracting = true

      const isFreehand = ['pen', 'highlighter', 'line'].includes(toolType)

      if (toolType === 'select') {
        // Use the hover-highlighted stamp as the drag target.
        // The blue hover glow already shows the user which object they're about to grab,
        // so no picker menu needed — just confirm the target on mousedown.
        const target = this.selectHoveredStamp
          || this.findClosestStamp(pageNum, pos.x, pos.y, true)

        if (!target) {
          isInteracting = false
        } else {
          isMovingExisting = true
          activeObject = target
          this.lastFocusedStamp = activeObject
          this._dragLastPos = pos   // initialise delta tracking
          this.selectHoveredStamp = null // clear highlight while dragging
          this.redrawStamps(pageNum)
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
        // Gather ALL nearby stamps within threshold, sorted by distance
        const nearby = this.findNearbyStamps(pageNum, pos.x, pos.y)
        if (nearby.length === 1) {
          // Only 1 nearby — delete directly
          this.eraseStampTarget(nearby[0])
        } else if (nearby.length > 1) {
          // Multiple nearby — show picker menu so user chooses exactly which one
          const clientX = e.clientX || (e.touches && e.touches[0].clientX)
          const clientY = e.clientY || (e.touches && e.touches[0].clientY)
          this.showEraseMenu(nearby, clientX, clientY)
        }
        isInteracting = false
      } else {
        // Precise Placement for Stamps — use ghost offset position
        const sPos = getStampPos(e)
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
          x: sPos.x,
          y: sPos.y,
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
          // Use mouse delta (pos - lastPos) to avoid compounding drift
          const dx = pos.x - (this._dragLastPos?.x ?? pos.x)
          const dy = pos.y - (this._dragLastPos?.y ?? pos.y)
          activeObject.points = activeObject.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
        } else {
          activeObject.x = pos.x
          activeObject.y = pos.y
        }
        this._dragLastPos = pos
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
        // Preview new stamp movement — follow ghost offset position
        const sPos = getStampPos(e)
        activeObject.x = sPos.x
        activeObject.y = sPos.y
        const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
        const ctx = canvas.getContext('2d')
        this.redrawStamps(pageNum)
        const layer = this.layers.find(l => l.id === activeObject.layerId)
        this.drawStampOnCanvas(ctx, canvas, activeObject, layer ? layer.color : '#000000', true)
      }
    }

    const hoverAction = (e) => {
      // ── Eraser hover ──
      if (this.activeStampType === 'eraser' && !isInteracting) {
        const pos = getPos(e)
        const found = this.findClosestStamp(pageNum, pos.x, pos.y)
        if (found !== this.hoveredStamp) {
          this.hoveredStamp = found
          this.redrawStamps(pageNum)
          const oldChip = wrapper.querySelector('.erase-hover-chip')
          if (oldChip) oldChip.remove()
          if (found) {
            const canvas = wrapper.querySelector('.pdf-canvas')
            if (canvas) {
              const chipX = found.x != null ? found.x * canvas.offsetWidth : (found.points?.[0]?.x ?? 0) * canvas.offsetWidth
              const chipY = found.y != null ? found.y * canvas.offsetHeight : (found.points?.[0]?.y ?? 0) * canvas.offsetHeight
              const chip = document.createElement('div')
              chip.className = 'erase-hover-chip'
              chip.textContent = '🗑 Delete'
              chip.style.left = `${chipX}px`
              chip.style.top = `${chipY}px`
              wrapper.appendChild(chip)
            }
          }
        }
      }

      // ── Select hover ──
      if (this.activeStampType === 'select' && !isInteracting) {
        const pos = getPos(e)
        const found = this.findClosestStamp(pageNum, pos.x, pos.y, true)
        if (found !== this.selectHoveredStamp) {
          this.selectHoveredStamp = found
          this.redrawStamps(pageNum)
        }
      }
    }

    const endAction = async (e) => {
      if (isInteracting && activeObject) {
        if (!isMovingExisting) {
          if (activeObject.type === 'text' || activeObject.type === 'tempo-text') {
            // Delay adding to stamps until we have the multi-line data
            this.spawnTextEditor(wrapper, pageNum, activeObject)
          } else if (activeObject.type === 'measure') {
            const measureObj = activeObject
            isInteracting = false
            activeObject = null
            let defVal = 1
            if (this.lastMeasureNum) {
              defVal = parseInt(this.lastMeasureNum) + (this.measureStep || 4)
            }
            const data = await this.promptMeasureNumber(defVal)
            if (data) {
              this.lastMeasureNum = String(data)
              measureObj.data = String(data)
              const existingMeasure = this.stamps.find(s => s.type === 'measure' && s.page === pageNum)
              if (existingMeasure) measureObj.x = existingMeasure.x
              this.stamps.push(measureObj)
              this.updateRulerMarks()
              this.saveToStorage()
              this.redrawStamps(pageNum)
            }
            return
          } else {
            this.stamps.push(activeObject)
          }
        }

        if (activeObject.type === 'anchor') {
          this.updateRulerMarks()
        } else if (activeObject.type === 'measure') {
          this.updateRulerMarks()
        }

        this.saveToStorage()
        this.redrawStamps(pageNum)

        // Green flash + haptic on placement (not for move or erase)
        if (!isMovingExisting) {
          const pageEl = this.container.querySelector(`.page-container[data-page="${pageNum}"]`)
          if (pageEl) {
            pageEl.classList.remove('stamp-placed-flash')
            void pageEl.offsetWidth // force reflow to restart animation
            pageEl.classList.add('stamp-placed-flash')
          }
          if (navigator.vibrate) navigator.vibrate(30)
        }
      }
      isInteracting = false
      isMovingExisting = false
      activeObject = null
      this._dragLastPos = null
      hideStampGhost()
    }

    overlay.addEventListener('mousedown', startAction)
    overlay.addEventListener('mousemove', (e) => {
      moveAction(e)
      hoverAction(e)
      if (!isInteracting) showStampGhost(e.clientX, e.clientY)
    })
    overlay.addEventListener('mouseleave', () => {
      let needsRedraw = false
      if (this.hoveredStamp) {
        this.hoveredStamp = null
        needsRedraw = true
      }
      if (this.selectHoveredStamp) {
        this.selectHoveredStamp = null
        needsRedraw = true
      }
      if (needsRedraw) this.redrawStamps(pageNum)
      const chip = wrapper.querySelector('.erase-hover-chip')
      if (chip) chip.remove()
      hideStampGhost()
    })
    window.addEventListener('mouseup', endAction)

    // Touch stamp placement: show ghost while finger is held, place on lift
    // Store raw coords (not the event) — touch lists become stale after the handler returns
    let pendingTouchCoords = null // { clientX, clientY }
    const isStampTool = () => !FREEHAND_TYPES.includes(this.activeStampType)

    overlay.addEventListener('touchstart', (e) => {
      if (e.touches?.length > 1) return
      if (isStampTool()) {
        e.preventDefault()
        pendingTouchCoords = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
        showStampGhost(pendingTouchCoords.clientX, pendingTouchCoords.clientY)
      } else {
        startAction(e)
      }
    }, { passive: false })
    overlay.addEventListener('touchmove', (e) => {
      if (pendingTouchCoords && e.touches?.length === 1) {
        e.preventDefault()
        pendingTouchCoords = { clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }
        showStampGhost(pendingTouchCoords.clientX, pendingTouchCoords.clientY)
      } else {
        moveAction(e)
      }
    }, { passive: false })
    overlay.addEventListener('touchend', (e) => {
      if (pendingTouchCoords) {
        const normPos = ghostNormPos          // snapshot taken at the same rect as the ghost render
        hideStampGhost()
        pendingTouchCoords = null
        ghostNormPos = null
        // Pass the pre-computed position so getStampPos doesn't call getBCR again
        const fakeEvt = { _normPos: normPos, clientX: 0, clientY: 0, preventDefault: () => {} }
        startAction(fakeEvt)
        endAction(e)
      } else {
        endAction(e)
      }
    })

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

  async addStamp(page, type, x, y) {
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
    } else if (type === 'measure') {
      let defVal = 1
      if (this.lastMeasureNum) {
        defVal = parseInt(this.lastMeasureNum) + (this.measureStep || 4)
      }
      data = await this.promptMeasureNumber(defVal)
      if (!data) return
      this.lastMeasureNum = String(data)
      data = String(data)
      const existingMeasure = this.stamps.find(s => s.type === 'measure' && s.page === page)
      if (existingMeasure) x = existingMeasure.x
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

    if (type === 'anchor') {
      this.updateRulerMarks()
    } else if (type === 'measure') {
      this.updateRulerMarks()
    }

    this.saveToStorage()
    this.updateLayerVisibility()
    this.redrawStamps(page)
  }

  // --- ERASER HELPERS ---

  // Get a human-readable label for a stamp type
  getStampLabel(stamp) {
    if (stamp.points) {
      const typeMap = { pen: 'Pen Stroke', highlighter: 'Highlight', line: 'Line' }
      return typeMap[stamp.type] || 'Drawing'
    }
    // Look up in toolsets
    for (const set of this.toolsets) {
      const tool = set.tools.find(t => t.id === stamp.type)
      if (tool) return tool.label
    }
    return stamp.type || 'Object'
  }

  // Get an emoji icon for a stamp type
  getStampIcon(stamp) {
    if (stamp.type === 'pen') return '✏️'
    if (stamp.type === 'highlighter') return '🖊'
    if (stamp.type === 'line') return '—'
    if (stamp.type === 'anchor') return '⚓'
    if (stamp.type === 'text' || stamp.type === 'tempo-text') return 'T'
    if (['down-bow', 'up-bow'].includes(stamp.type)) return '🎻'
    if (stamp.type === 'accent') return '>'
    if (stamp.type === 'staccato') return '·'
    if (stamp.type === 'fermata') return '𝄐'
    return '♩'
  }

  // Return all stamps near (x,y) within threshold, sorted closest first
  // allSources=true: include stamps from all sources (used by Select tool)
  findNearbyStamps(page, x, y, allSources = false) {
    const threshold = 0.06
    const results = []

    this.stamps.forEach(s => {
      if (s.page !== page) return
      if (!allSources && s.sourceId !== this.activeSourceId) return

      let dist
      if (s.points && s.points.length > 0) {
        dist = Math.min(...s.points.map(p =>
          Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2))
        ))
      } else {
        dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2))
      }

      if (dist < threshold) results.push({ stamp: s, dist })
    })

    return results.sort((a, b) => a.dist - b.dist).map(r => r.stamp)
  }

  // Find the single CLOSEST stamp to (x,y) on a page, within a max threshold
  findClosestStamp(page, x, y, allSources = false) {
    return this.findNearbyStamps(page, x, y, allSources)[0] || null
  }

  showBatchEraseDialog() {
    // Build list of layers that actually have stamps
    const layersWithStamps = this.layers.filter(l =>
      this.stamps.some(s => s.layerId === l.id)
    )
    if (layersWithStamps.length === 0) {
      this.showDialog({ title: 'Nothing to Clear', message: 'No annotations found on this score.', icon: 'ℹ️', type: 'info' })
      return
    }

    const dialog = document.createElement('div')
    dialog.className = 'batch-erase-dialog'
    dialog.innerHTML = `
      <div class="batch-erase-content">
        <div class="batch-erase-header">
          <span class="batch-erase-icon">🗑️</span>
          <span class="batch-erase-title">Clear Annotations by Category</span>
        </div>
        <p class="batch-erase-desc">Select which categories to permanently delete:</p>
        <div class="batch-erase-list" id="batch-erase-list"></div>
        <div class="batch-erase-footer">
          <button class="batch-erase-select-all">Select All</button>
          <div style="flex:1"></div>
          <button class="batch-erase-cancel">Cancel</button>
          <button class="batch-erase-confirm" disabled>Delete Selected</button>
        </div>
      </div>
    `
    document.body.appendChild(dialog)

    const list = dialog.querySelector('#batch-erase-list')
    const confirmBtn = dialog.querySelector('.batch-erase-confirm')
    const cancelBtn = dialog.querySelector('.batch-erase-cancel')
    const selectAllBtn = dialog.querySelector('.batch-erase-select-all')

    const checkboxes = []

    layersWithStamps.forEach(layer => {
      const count = this.stamps.filter(s => s.layerId === layer.id).length
      const isLayout = layer.type === 'layout'
      const row = document.createElement('label')
      row.className = 'batch-erase-row'
      const cb = document.createElement('input')
      cb.type = 'checkbox'
      cb.value = layer.id
      cb.addEventListener('change', () => {
        confirmBtn.disabled = !checkboxes.some(c => c.checked)
        selectAllBtn.textContent = checkboxes.every(c => c.checked) ? 'Deselect All' : 'Select All'
        if (isLayout) row.classList.toggle('batch-erase-row--warning', cb.checked)
      })
      checkboxes.push(cb)
      const dot = document.createElement('span')
      dot.className = 'batch-erase-dot'
      dot.style.background = layer.color
      row.appendChild(cb)
      row.appendChild(dot)
      const nameSpan = document.createElement('span')
      nameSpan.textContent = `${layer.name}  (${count})`
      row.appendChild(nameSpan)
      if (isLayout) {
        const warn = document.createElement('span')
        warn.className = 'batch-erase-layout-warn'
        warn.textContent = '⚠️ Navigation markers'
        row.appendChild(warn)
      }
      list.appendChild(row)
    })

    selectAllBtn.addEventListener('click', () => {
      const allChecked = checkboxes.every(c => c.checked)
      checkboxes.forEach(c => { c.checked = !allChecked })
      confirmBtn.disabled = allChecked
      selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All'
    })

    cancelBtn.addEventListener('click', () => dialog.remove())
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.remove() })

    const doDelete = (selectedIds) => {
      const before = this.stamps.length
      this.stamps = this.stamps.filter(s => !selectedIds.has(s.layerId))
      const deleted = before - this.stamps.length
      dialog.remove()
      this.saveToStorage()
      const allPages = [...Array(this.pdf?.numPages || 0)].map((_, i) => i + 1)
      allPages.forEach(p => this.redrawStamps(p))
      this.updateRulerMarks()
      this.showDialog({ title: 'Done', message: `Deleted ${deleted} annotation${deleted !== 1 ? 's' : ''}.`, icon: '✅', type: 'info' })
    }

    confirmBtn.addEventListener('click', async () => {
      const selectedIds = new Set(checkboxes.filter(c => c.checked).map(c => c.value))

      // Special warning if Layout layer (anchors / measure markers) is selected
      const layoutLayer = this.layers.find(l => l.type === 'layout')
      if (layoutLayer && selectedIds.has(layoutLayer.id)) {
        const layoutCount = this.stamps.filter(s => s.layerId === layoutLayer.id).length
        const confirmed = await this.showDialog({
          title: '⚠️ Delete Layout Markers?',
          message: `You are about to delete ${layoutCount} Layout marker${layoutCount !== 1 ? 's' : ''} (Anchors & Measure numbers).\n\nThese control score navigation and page flow. This cannot be undone.`,
          icon: '⚠️',
          type: 'confirm',
          confirmText: 'Yes, Delete Layout Too'
        })
        if (!confirmed) return  // user cancelled — leave dialog open
      }

      doDelete(selectedIds)
    })
  }

  // Erase exactly one specific stamp object
  eraseStampTarget(stamp) {
    const page = stamp.page
    const idx = this.stamps.indexOf(stamp)
    if (idx === -1) return

    this.stamps.splice(idx, 1)
    console.log(`Eraser: Removed 1 stamp (type: ${stamp.type}) from source: ${this.activeSourceId}`)

    if (stamp.type === 'anchor') {
      this.updateRulerMarks()
    }

    // Clear hover state
    this.hoveredStamp = null
    this.closeEraseMenu()
    const wrapper = document.querySelector(`.page-container[data-page="${page}"]`)
    if (wrapper) {
      const chip = wrapper.querySelector('.erase-hover-chip')
      if (chip) chip.remove()
    }
    this.saveToStorage()
    this.redrawStamps(page)
  }

  // Show a context menu listing nearby stamps to pick from
  showEraseMenu(stamps, screenX, screenY) {
    this.closeEraseMenu() // Remove any existing menu

    const menu = document.createElement('div')
    menu.className = 'erase-context-menu'
    menu.id = 'erase-context-menu'

    // Header
    const header = document.createElement('div')
    header.className = 'erase-menu-header'
    header.textContent = `${stamps.length} Nearby Objects — Pick one to delete`
    menu.appendChild(header)

    // One row per stamp
    stamps.forEach((stamp, idx) => {
      const item = document.createElement('button')
      item.className = 'erase-menu-item'

      const iconEl = document.createElement('span')
      iconEl.className = 'erase-item-icon'
      iconEl.textContent = this.getStampIcon(stamp)

      const label = document.createElement('span')
      label.className = 'erase-item-label'
      label.textContent = this.getStampLabel(stamp)

      const badge = document.createElement('span')
      badge.className = 'erase-item-badge'
      badge.textContent = `Pg ${stamp.page}`

      item.appendChild(iconEl)
      item.appendChild(label)
      item.appendChild(badge)

      // Hover: highlight this stamp on canvas
      item.addEventListener('mouseenter', () => {
        this.hoveredStamp = stamp
        this.redrawStamps(stamp.page)
      })
      item.addEventListener('mouseleave', () => {
        this.hoveredStamp = null
        this.redrawStamps(stamp.page)
      })

      // Click: delete this specific stamp
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        this.eraseStampTarget(stamp)
      })

      menu.appendChild(item)
    })

    // Cancel footer
    const cancel = document.createElement('div')
    cancel.className = 'erase-menu-cancel'
    cancel.textContent = 'Esc to cancel'
    menu.appendChild(cancel)

    // Position menu near cursor, keeping it inside viewport
    document.body.appendChild(menu)
    const rect = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = screenX + 12
    let top = screenY + 12
    if (left + rect.width > vw - 8) left = screenX - rect.width - 12
    if (top + rect.height > vh - 8) top = screenY - rect.height - 12
    menu.style.left = `${Math.max(8, left)}px`
    menu.style.top = `${Math.max(8, top)}px`

    // Close on outside click or Escape
    this._eraseMenuDismiss = (e) => {
      if (!menu.contains(e.target)) this.closeEraseMenu()
    }
    this._eraseMenuEsc = (e) => {
      if (e.key === 'Escape') this.closeEraseMenu()
    }
    setTimeout(() => {
      document.addEventListener('mousedown', this._eraseMenuDismiss)
      document.addEventListener('keydown', this._eraseMenuEsc)
    }, 0)
  }

  async promptMeasureNumber(defVal) {
    return new Promise(resolve => {
      const dialog = document.getElementById('measure-dialog')
      const display = document.getElementById('measure-display')
      const stepDisplay = document.getElementById('measure-step-display')
      const btnDec = document.getElementById('measure-step-minus')
      const btnInc = document.getElementById('measure-step-plus')
      const btnCancel = document.getElementById('measure-cancel')

      if (!dialog || !display) {
        resolve(prompt('Enter measure number:', defVal))
        return
      }

      this.measureStep = this.measureStep || 4
      const defClamped = Math.min(999, Math.max(1, defVal))
      stepDisplay.textContent = this.measureStep

      // typed = '' means "use auto-calc (placeholder)", otherwise user's keypad input
      let typed = ''
      const showDisplay = () => {
        display.textContent = typed || String(defClamped)
        display.style.opacity = typed ? '1' : '0.45'
      }
      showDisplay()

      const getValue = () => typed ? parseInt(typed) : defClamped

      const updateStep = (delta) => {
        let newStep = this.measureStep + delta
        if (newStep < 1) newStep = 1
        if (newStep > 999) newStep = 999
        this.measureStep = newStep
        stepDisplay.textContent = this.measureStep
      }

      const confirm = () => {
        cleanup()
        resolve(getValue())
      }

      const onKeyDown = (e) => {
        if (e.key === 'Enter') {
          // iOS fires a synthetic Enter keydown after tapping a button — ignore it
          if (e.target?.classList.contains('keypad-btn')) return
          e.preventDefault(); e.stopPropagation(); confirm(); return
        }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(); resolve(null); return }
        e.stopPropagation() // block global shortcuts (sidebar, eraser, etc.) while dialog is open
      }
      document.addEventListener('keydown', onKeyDown)

      const cleanup = () => {
        dialog.classList.remove('active')
        document.removeEventListener('keydown', onKeyDown)
        dialog.querySelectorAll('.keypad-btn').forEach(btn => { btn.onclick = null })
        if (btnDec) btnDec.onclick = null
        if (btnInc) btnInc.onclick = null
        if (btnCancel) btnCancel.onclick = null
      }

      dialog.querySelectorAll('.keypad-btn').forEach(btn => {
        btn.onclick = () => {
          const key = btn.dataset.key
          if (key === 'confirm') { confirm(); return }
          if (key === 'back') {
            typed = typed.slice(0, -1)
          } else {
            if (typed === '' && key === '0') return // 不允許以 0 開頭
            const next = typed + key
            if (next.length <= 3) typed = next
          }
          showDisplay()
        }
      })

      if (btnDec) btnDec.onclick = () => updateStep(-1)
      if (btnInc) btnInc.onclick = () => updateStep(1)
      if (btnCancel) btnCancel.onclick = () => { cleanup(); resolve(null) }

      dialog.classList.add('active')
      // Briefly highlight the confirm button so users know where to tap
      const confirmBtn = dialog.querySelector('[data-key="confirm"]')
      if (confirmBtn) {
        setTimeout(() => {
          confirmBtn.classList.add('confirm-btn-pulse')
          setTimeout(() => confirmBtn.classList.remove('confirm-btn-pulse'), 800)
        }, 100)
      }
    })
  }

  closeEraseMenu() {
    const existing = document.getElementById('erase-context-menu')
    if (existing) existing.remove()
    if (this._eraseMenuDismiss) {
      document.removeEventListener('mousedown', this._eraseMenuDismiss)
      this._eraseMenuDismiss = null
    }
    if (this._eraseMenuEsc) {
      document.removeEventListener('keydown', this._eraseMenuEsc)
      this._eraseMenuEsc = null
    }
    // Clear any hover from menu navigation
    if (this.hoveredStamp) {
      const page = this.hoveredStamp.page
      this.hoveredStamp = null
      this.redrawStamps(page)
    }
  }

  // Legacy alias kept for safety
  eraseStamp(page, x, y) {
    const target = this.findClosestStamp(page, x, y)
    if (target) this.eraseStampTarget(target)
  }

  // ── Select context menu (Multi-object picker with blue highlight) ──
  showSelectMenu(stamps, screenX, screenY, onSelect) {
    this.closeSelectMenu()

    const menu = document.createElement('div')
    menu.className = 'erase-context-menu select-context-menu'
    menu.id = 'select-context-menu'

    // Header
    const header = document.createElement('div')
    header.className = 'erase-menu-header'
    header.textContent = `${stamps.length} Nearby Objects — Pick one to move`
    menu.appendChild(header)

    stamps.forEach(stamp => {
      const item = document.createElement('button')
      item.className = 'erase-menu-item'

      const iconEl = document.createElement('span')
      iconEl.className = 'erase-item-icon'
      iconEl.textContent = this.getStampIcon(stamp)

      const label = document.createElement('span')
      label.className = 'erase-item-label'
      label.textContent = this.getStampLabel(stamp)

      const badge = document.createElement('span')
      badge.className = 'erase-item-badge'
      badge.textContent = `Pg ${stamp.page}`

      item.appendChild(iconEl)
      item.appendChild(label)
      item.appendChild(badge)

      // Hover: show blue glow on canvas
      item.addEventListener('mouseenter', () => {
        this.selectHoveredStamp = stamp
        this.redrawStamps(stamp.page)
      })
      item.addEventListener('mouseleave', () => {
        this.selectHoveredStamp = null
        this.redrawStamps(stamp.page)
      })

      // Click: select this object
      item.addEventListener('click', (e) => {
        e.stopPropagation()
        this.selectHoveredStamp = null
        this.closeSelectMenu()
        if (onSelect) onSelect(stamp)
      })

      menu.appendChild(item)
    })

    const cancel = document.createElement('div')
    cancel.className = 'erase-menu-cancel'
    cancel.textContent = 'Esc to cancel'
    menu.appendChild(cancel)

    document.body.appendChild(menu)
    const rect = menu.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    let left = screenX + 12, top = screenY + 12
    if (left + rect.width > vw - 8) left = screenX - rect.width - 12
    if (top + rect.height > vh - 8) top = screenY - rect.height - 12
    menu.style.left = `${Math.max(8, left)}px`
    menu.style.top = `${Math.max(8, top)}px`

    this._selectMenuDismiss = (e) => {
      if (!menu.contains(e.target)) this.closeSelectMenu()
    }
    this._selectMenuEsc = (e) => {
      if (e.key === 'Escape') this.closeSelectMenu()
    }
    setTimeout(() => {
      document.addEventListener('mousedown', this._selectMenuDismiss)
      document.addEventListener('keydown', this._selectMenuEsc)
    }, 0)
  }

  closeSelectMenu() {
    const existing = document.getElementById('select-context-menu')
    if (existing) existing.remove()
    if (this._selectMenuDismiss) {
      document.removeEventListener('mousedown', this._selectMenuDismiss)
      this._selectMenuDismiss = null
    }
    if (this._selectMenuEsc) {
      document.removeEventListener('keydown', this._selectMenuEsc)
      this._selectMenuEsc = null
    }
    if (this.selectHoveredStamp) {
      const page = this.selectHoveredStamp.page
      this.selectHoveredStamp = null
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

        const isHovered = stamp === this.hoveredStamp           // red (eraser)
        const isSelectHovered = stamp === this.selectHoveredStamp // blue (select)

        if (stamp.points) {
          this.drawPathOnCanvas(ctx, canvas, stamp, isForeign, isHovered, isSelectHovered)
        } else {
          this.drawStampOnCanvas(ctx, canvas, stamp, layer.color, isForeign, isHovered, isSelectHovered)
        }
      })
      ctx.restore()
    })
  }

  drawPathOnCanvas(ctx, canvas, path, isForeign = false, isHovered = false, isSelectHovered = false) {
    if (!path.points || path.points.length < 2) return

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (isHovered) {
      ctx.shadowBlur = 10
      ctx.shadowColor = '#ef4444'
    } else if (isSelectHovered) {
      ctx.shadowBlur = 12
      ctx.shadowColor = '#6366f1'
    }

    if (isForeign) {
      ctx.setLineDash([8 * (this.scale / 1.5), 6 * (this.scale / 1.5)])
    }

    if (path.type === 'highlighter') {
      ctx.strokeStyle = isHovered ? '#ef4444' : (isForeign ? '#e5e7ebAA' : '#fde04788')
      ctx.lineWidth = 14 * (this.scale / 1.5)
    } else {
      ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
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

  drawStampOnCanvas(ctx, canvas, stamp, color, isForeign = false, isHovered = false, isSelectHovered = false, isPreview = false) {
    const x = stamp.x * canvas.width
    const y = stamp.y * canvas.height
    const size = 18 * (this.scale / 1.5)

    ctx.save()

    if (isHovered) {
      ctx.shadowBlur = 15
      ctx.shadowColor = '#ef4444'
    } else if (isSelectHovered) {
      ctx.shadowBlur = 15
      ctx.shadowColor = '#6366f1'
    }

    if (isForeign) {
      ctx.setLineDash([4, 3])
      ctx.globalAlpha *= 0.7
    }

    ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : color
    ctx.fillStyle = isHovered ? '#ef444433' : isSelectHovered ? '#6366f133' : `${color}33`
    ctx.lineWidth = 1.8 * (this.scale / 1.5)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // Data-Driven Rendering: Find tool metadata
    let toolDef = null
    for (const set of this.toolsets) {
      const tool = set.tools.find(t => t.id === stamp.type)
      if (tool) {
        toolDef = tool
        break
      }
    }

    if (toolDef && toolDef.draw) {
      const d = toolDef.draw
      ctx.beginPath()

      switch (d.type) {
        case 'text':
          ctx.font = `${d.font || ''} ${d.size * (this.scale / 1.5)}px ${d.fontFace || 'Outfit'}`
          ctx.fillStyle = color
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(d.content, x, y)
          break

        case 'shape':
          if (d.shape === 'circle') {
            ctx.arc(x, y, size * (d.radius || 1), 0, Math.PI * 2)
            if (d.fill) { ctx.fillStyle = color; ctx.fill() }
            ctx.stroke()
          }
          break

        case 'path':
          // Relative path rendering (-1 to 1 space)
          const pParts = d.data.split(' ')
          ctx.save()
          ctx.translate(x, y)
          ctx.scale(size, size)
          // Adjust line width to be consistent despite scaling
          ctx.lineWidth = (2.5 * (this.scale / 1.5)) / size
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'

          for (let i = 0; i < pParts.length; i++) {
            const cmd = pParts[i]
            if (cmd === 'M') ctx.moveTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]))
            else if (cmd === 'L') ctx.lineTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]))
            // ...
            else if (cmd === 'C') ctx.bezierCurveTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]))
          }
          ctx.stroke()
          ctx.restore()
          break

        case 'special':
          if (d.variant === 'input-text') {
            ctx.font = `bold ${22 * (this.scale / 1.5)}px Outfit`
            ctx.fillStyle = color
            const lines = (stamp.data || '').split('\n')
            const lineHeight = 26 * (this.scale / 1.5)
            lines.forEach((line, i) => {
              ctx.fillText(line, x, y + (i * lineHeight))
            })
          } else if (d.variant === 'measure') {
            const s = this.scale / 1.5
            const bw = 22 * s, bh = 18 * s
            const bx = x - bw / 2, by = y - bh / 2
            // Outline-only box (no fill)
            ctx.strokeStyle = isHovered ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)'
            ctx.lineWidth = 0.8
            ctx.beginPath()
            ctx.roundRect(bx, by, bw, bh, 3)
            ctx.stroke()
            // Light text
            ctx.font = `500 ${13 * s}px Outfit`
            ctx.fillStyle = isHovered ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.35)'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(stamp.data || '#', x, y)
          }
          break

        case 'complex':
          // Legacy support for complex visual logic
          if (d.variant === 'thumb') {
            // 直立橢圓 (ellipse: cx=x, cy=y-size*0.3, rx=size*0.35, ry=size*0.6)
            ctx.beginPath()
            ctx.ellipse(x, y - size * 0.3, size * 0.35, size * 0.6, 0, 0, Math.PI * 2)
            ctx.stroke()
            // 瘦短直棒，緊黏橢圓底部
            ctx.beginPath()
            ctx.moveTo(x, y + size * 0.3)
            ctx.lineTo(x, y + size * 0.6)
            ctx.stroke()
          } else if (d.variant === 'fermata') {
            const fSize = size * 0.45
            ctx.arc(x, y, fSize, Math.PI, 0); ctx.stroke()
            ctx.beginPath(); ctx.arc(x, y - fSize * 0.3, fSize * 0.15, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
          } else if (d.variant === 'anchor') {
            const isNextTarget = isPreview || stamp === this.nextTargetAnchor
            const aColor = isNextTarget ? color : '#94a3b8'
            if (!isNextTarget) ctx.globalAlpha *= 0.35
            ctx.fillStyle = aColor
            ctx.strokeStyle = aColor
            // 圓點 (頂部)
            ctx.beginPath()
            ctx.arc(x, y - size * 1.1, size * 0.18, 0, Math.PI * 2)
            ctx.fill()
            // 直棒
            ctx.beginPath()
            ctx.lineWidth = size * 0.12
            ctx.moveTo(x, y - size * 0.9)
            ctx.lineTo(x, y + size * 0.3)
            ctx.stroke()
            // 橫桿
            ctx.beginPath()
            ctx.moveTo(x - size * 0.6, y)
            ctx.lineTo(x + size * 0.6, y)
            ctx.stroke()
            // 弧形 (底部)
            ctx.beginPath()
            ctx.arc(x, y, size * 0.6, 0, Math.PI, false)
            ctx.stroke()
            ctx.lineWidth = 1.8 * (this.scale / 1.5)
          }
          break
      }
    } else {
      // Fallback for tools without draw metadata (e.g. circle index which uses type name directly)
      if (stamp.type === 'circle') {
        ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    ctx.restore()
  }

  updateActiveTools(forceShowDropdown = false) {
    this.activeToolsContainer.innerHTML = ""

    // Check if expanded or collapsed
    const isExpanded = this.activeToolsContainer.classList.contains("expanded")

    // Always sync the active tool to the viewer so CSS cursors & overlay work
    if (this.viewer) {
      this.viewer.dataset.activeTool = this.activeStampType
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
    // Collapse is handled in initDraggable dragEnd (only if no drag occurred)

    // 2a. Category Selection Ribbon (Persistent Pills - forScore Style)
    const ribbon = document.createElement("div")
    ribbon.className = "category-ribbon"

    this.toolsets.forEach(group => {
      const isActive = this.activeCategories.includes(group.name)
      const displayName = group.displayName || group.name
      const pill = document.createElement("button")
      pill.className = `cat-pill ${isActive ? "active" : ""}`
      pill.dataset.tooltip = `${displayName}: ${group.num} / ${group.letter}`
      pill.innerHTML = `<span class="pill-name">${displayName}</span><span class="pill-shortcut">${group.num} · ${group.letter}</span>`
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

      group.tools.forEach((tool, toolIdx) => {
        const wrapper = document.createElement("div")
        wrapper.className = "stamp-tool-wrapper"

        // Level-2 shortcut badge — hidden for now (TODO: numpad redesign)
        if (false && this.activeCategories.length === 1) {
          const badge = document.createElement("span")
          badge.className = "tool-num-badge"
          badge.textContent = String(toolIdx + 1)
          wrapper.appendChild(badge)
        }

        const btn = document.createElement("button")
        btn.className = `stamp-tool ${this.activeStampType === tool.id ? "active" : ""}`
        btn.title = tool.label
        btn.dataset.tooltip = tool.label
        btn.innerHTML = this.getIcon(tool, 26)
        btn.onclick = (e) => {
          e.stopPropagation()
          if (tool.id === 'erase-all') {
            this.showBatchEraseDialog()
            return
          }
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

    // 3.5 Group Numpad — hidden for now (TODO: redesign)
    // this.activeToolsContainer.appendChild(numpad)

    // 3.6 Resize Handle (Professional Custom Control)
    const resizer = document.createElement("div")
    resizer.className = "resize-handle"
    resizer.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
        <path d="M21 15L15 21M21 9L9 21M21 3L3 21"/>
      </svg>
    `
    this.activeToolsContainer.appendChild(resizer)

    // 4. Viewport Safety Check (Dynamic Height Protection for iPad)
    // Panel grows upward (bottom: 0), so cap when top edge would go off screen
    setTimeout(() => {
      const rect = this.activeToolsContainer.getBoundingClientRect()
      if (rect.top < 20) {
        this.activeToolsContainer.style.maxHeight = (rect.bottom - 20) + "px"
        this.activeToolsContainer.style.overflowY = "auto"
      } else {
        this.activeToolsContainer.style.maxHeight = "none"
        this.activeToolsContainer.style.overflowY = "hidden"
      }
    }, 0)
  }

  selectGroup(groupName) {
    // Same group pressed again → back to level 1 (all groups)
    if (this.activeCategories.length === 1 && this.activeCategories[0] === groupName) {
      this.activeCategories = this.toolsets.map(g => g.name)
      this.updateActiveTools()
      return
    }
    this.activeCategories = [groupName]
    const group = this.toolsets.find(g => g.name === groupName)
    const lastTool = this.lastUsedToolPerCategory[groupName] || group?.tools[0]?.id
    if (lastTool) this.activeStampType = lastTool
    this.updateActiveTools()
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
      this.toolbarWidth = Math.max(300, initialWidth - deltaX)
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

  async addToRecentSoloScores(name, handle = null) {
    if (!this.recentSoloScores) this.recentSoloScores = []
    this.recentSoloScores = this.recentSoloScores.filter(s => s.name !== name)
    this.recentSoloScores.unshift({ name, date: new Date().toLocaleDateString() })
    if (this.recentSoloScores.length > 10) this.recentSoloScores.pop()
    if (handle) {
      try { await db.set(`solo_handle_${name}`, handle) } catch (e) { console.warn('Could not store file handle:', e) }
    }
    this.saveToStorage()
    this.renderInlineRecentScores()
  }

  renderInlineRecentScores() {
    const container = this.recentScoresInline
    if (!container) return
    container.innerHTML = ''

    const scores = (this.recentSoloScores || []).slice(0, 10)

    // Header: label + Clear button
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px'
    header.innerHTML = `<span style="font-size:0.7rem;font-weight:600;color:var(--text-muted);letter-spacing:.04em">RECENT SCORES</span>`
    const clearBtn = document.createElement('button')
    clearBtn.className = 'btn btn-outline btn-smaller'
    clearBtn.style.cssText = 'font-size:0.68rem;padding:2px 8px'
    clearBtn.textContent = 'Clear'
    clearBtn.onclick = () => {
      this.recentSoloScores = []
      this.saveToStorage()
      this.renderInlineRecentScores()
    }
    header.appendChild(clearBtn)
    container.appendChild(header)

    if (scores.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'empty-state'
      empty.style.fontSize = '0.78rem'
      empty.textContent = 'No recent scores.'
      container.appendChild(empty)
      return
    }

    scores.forEach(score => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-app);border:1px solid var(--border);border-radius:8px;margin-bottom:5px;cursor:pointer;transition:border-color .15s'
      row.innerHTML = `
        <span style="font-size:1rem;flex-shrink:0">🎼</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.78rem;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${score.name}</div>
          <div style="font-size:0.66rem;color:var(--text-muted)">${score.date}</div>
        </div>
      `
      row.onmouseenter = () => row.style.borderColor = 'var(--primary)'
      row.onmouseleave = () => row.style.borderColor = 'var(--border)'
      row.onclick = async () => {
        const libraryMatch = this.libraryFiles?.find(f => f.name === score.name)
        if (libraryMatch) {
          try {
            const file = await libraryMatch.getFile()
            const buf = await file.arrayBuffer()
            await this.addToRecentSoloScores(score.name)
            await this.loadPDF(new Uint8Array(buf))
            this.activeScoreName = score.name
            this.saveToStorage()
            // inline list stays visible
            if (!this.isSidebarLocked) { this.sidebar.classList.remove('open'); this.updateLayoutState() }
            return
          } catch (e) { console.warn('Library match failed:', e) }
        }
        const handle = await db.get(`solo_handle_${score.name}`)
        if (handle) {
          try {
            const permission = await handle.requestPermission({ mode: 'read' })
            if (permission === 'granted') {
              const file = await handle.getFile()
              const buf = await file.arrayBuffer()
              await this.addToRecentSoloScores(score.name, handle)
              await this.loadPDF(new Uint8Array(buf))
              this.activeScoreName = score.name
              this.saveToStorage()
              // inline list stays visible
              if (!this.isSidebarLocked) { this.sidebar.classList.remove('open'); this.updateLayoutState() }
              return
            }
          } catch (e) { console.warn('Handle reopen failed:', e) }
        }
        // inline list stays visible
        await this.openSoloPDF()
      }
      container.appendChild(row)
    })
  }

  renderRecentSoloScores() {
    if (!this.recentScoresList) return
    this.recentScoresList.innerHTML = ''

    const scores = this.recentSoloScores || []

    if (scores.length === 0) {
      this.recentScoresList.innerHTML = '<div class="empty-state">No recent solo scores recorded.</div>'
      return
    }

    // Clear History button
    const clearBtn = document.createElement('button')
    clearBtn.className = 'btn btn-outline btn-smaller'
    clearBtn.style.cssText = 'display:block;margin-left:auto;margin-bottom:10px;font-size:0.72rem'
    clearBtn.textContent = 'Clear History'
    clearBtn.onclick = () => {
      this.recentSoloScores = []
      this.saveToStorage()
      this.renderRecentSoloScores()
    }
    this.recentScoresList.appendChild(clearBtn)

    scores.forEach(score => {
      const card = document.createElement('div')
      card.className = 'recent-score-card'
      card.innerHTML = `
        <div class="recent-score-icon">🎼</div>
        <div class="recent-score-info">
          <div class="recent-score-name">${score.name}</div>
          <div class="recent-score-date">Last Opened: ${score.date}</div>
        </div>
      `
      card.onclick = async () => {
        // Try project library first
        const libraryMatch = this.libraryFiles?.find(f => f.name === score.name)
        if (libraryMatch) {
          try {
            const file = await libraryMatch.getFile()
            const buf = await file.arrayBuffer()
            await this.addToRecentSoloScores(score.name)
            await this.loadPDF(new Uint8Array(buf))
            this.activeScoreName = score.name
            this.saveToStorage()
            this.toggleQuickLoadModal(false)
            if (!this.isSidebarLocked) {
              this.sidebar.classList.remove('open')
              this.updateLayoutState()
            }
            return
          } catch (e) { console.warn('Library match failed:', e) }
        }

        // Try stored file handle
        const handle = await db.get(`solo_handle_${score.name}`)
        if (handle) {
          try {
            const permission = await handle.requestPermission({ mode: 'read' })
            if (permission === 'granted') {
              const file = await handle.getFile()
              const buf = await file.arrayBuffer()
              await this.addToRecentSoloScores(score.name, handle)
              await this.loadPDF(new Uint8Array(buf))
              this.activeScoreName = score.name
              this.saveToStorage()
              this.toggleQuickLoadModal(false)
              if (!this.isSidebarLocked) {
                this.sidebar.classList.remove('open')
                this.updateLayoutState()
              }
              return
            }
          } catch (e) { console.warn('Handle reopen failed:', e) }
        }

        // Fallback: open picker
        this.toggleQuickLoadModal(false)
        await this.openSoloPDF()
      }
      this.recentScoresList.appendChild(card)
    })
  }

  initDraggable() {
    let isDragging = false
    let didMove = false
    let startClientX, startClientY, xOffset = 0, yOffset = 0
    const el = this.activeToolsContainer

    // Restore saved panel position
    const savedPos = JSON.parse(localStorage.getItem('scoreflow_stamp_panel_pos') || 'null')
    if (savedPos) {
      xOffset = savedPos.x
      yOffset = savedPos.y
      el.style.transform = `translate3d(${xOffset}px, ${yOffset}px, 0)`
    }

    const getClient = (e) => e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                                       : { x: e.clientX, y: e.clientY }

    const dragStart = (e) => {
      if (!e.target.closest(".drag-handle") && !e.target.closest(".active-tool-fab")) return
      const { x, y } = getClient(e)
      startClientX = x - xOffset
      startClientY = y - yOffset
      isDragging = true
      didMove = false
      if (e.cancelable) e.preventDefault()
    }

    const drag = (e) => {
      if (!isDragging) return
      if (e.cancelable) e.preventDefault()
      const { x, y } = getClient(e)
      const cx = x - startClientX
      const cy = y - startClientY
      if (Math.abs(cx - xOffset) > 3 || Math.abs(cy - yOffset) > 3) didMove = true
      xOffset = cx
      yOffset = cy
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`
    }

    const dragEnd = () => {
      if (!isDragging) return
      isDragging = false
      // Only collapse if the user tapped (didn't drag)
      if (!didMove) {
        el.classList.remove("expanded")
        this.updateActiveTools()
      } else {
        // Persist panel position across sessions
        localStorage.setItem('scoreflow_stamp_panel_pos', JSON.stringify({ x: xOffset, y: yOffset }))
      }
    }

    // Mouse
    el.addEventListener("mousedown", dragStart)
    document.addEventListener("mousemove", drag)
    document.addEventListener("mouseup", dragEnd)

    // Touch (iPad)
    el.addEventListener("touchstart", dragStart, { passive: false })
    document.addEventListener("touchmove", drag, { passive: false })
    document.addEventListener("touchend", dragEnd)
  }

  initDocBarDraggable() {
    let isDragging = false
    let currentX, currentY, initialX, initialY, xOffset = 0, yOffset = 0
    const el = this.docBar
    if (!el) return

    el.addEventListener("mousedown", dragStart)
    document.addEventListener("mousemove", drag)
    document.addEventListener("mouseup", dragEnd)

    // Touch support for iPad — must be non-passive to allow preventDefault
    el.addEventListener("touchstart", (e) => {
      if (!e.target.closest(".doc-drag-handle")) return
      dragStart(e.touches[0])
    }, { passive: false })
    document.addEventListener("touchmove", (e) => {
      if (isDragging) {
        e.preventDefault() // prevent browser scroll while dragging bar
        drag(e.touches[0])
      }
    }, { passive: false })
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

  animatedScrollTo(targetTop, duration) {
    const start = this.viewer.scrollTop
    const change = targetTop - start
    const startTime = performance.now()

    const animateScroll = (currentTime) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Easing: easeInOutQuad
      const ease = progress < 0.5 
        ? 2 * progress * progress 
        : -1 + (4 - 2 * progress) * progress

      this.viewer.scrollTop = start + change * ease

      if (progress < 1) {
        requestAnimationFrame(animateScroll)
      }
    }

    requestAnimationFrame(animateScroll)
  }

  jump(direction) {
    const currentScroll = this.viewer.scrollTop
    const viewportHeight = this.viewer.clientHeight
    const viewportCenter = currentScroll + viewportHeight / 2
    const currentFocusY = currentScroll + this.jumpOffsetPx
    const jumpStep = viewportHeight - 2 * this.jumpOffsetPx

    const resolveAnchors = () => this.stamps
      .filter(s => s.type === 'anchor')
      .map(s => {
        const pageElem = document.querySelector(`.page-container[data-page="${s.page}"]`)
        if (!pageElem) return null
        const canvas = pageElem.querySelector('.pdf-canvas')
        const absoluteY = pageElem.offsetTop + (s.y * canvas.height)
        return { stamp: s, absoluteY }
      })
      .filter(a => a !== null)

    let targetY = null

    if (direction === 1) {
      const maxForwardRange = currentFocusY + jumpStep + 100
      const candidates = resolveAnchors().filter(a => a.absoluteY > currentFocusY + 10 && a.absoluteY < maxForwardRange)

      if (candidates.length > 0) {
        candidates.sort((a, b) => Math.abs(a.absoluteY - viewportCenter) - Math.abs(b.absoluteY - viewportCenter))
        targetY = candidates[0].absoluteY
      } else {
        targetY = currentScroll + viewportHeight - this.jumpOffsetPx
      }
    } else {
      const minBackwardRange = currentScroll - jumpStep - 100
      const behind = resolveAnchors()
        .filter(a => a.absoluteY < currentScroll + 20 && a.absoluteY > minBackwardRange)
        .sort((a, b) => b.absoluteY - a.absoluteY)

      if (behind.length > 0) {
        targetY = behind[0].absoluteY
      } else {
        targetY = Math.max(this.jumpOffsetPx, currentScroll - viewportHeight + 3 * this.jumpOffsetPx)
      }
    }

    if (targetY !== null) {
      if (this.monkeyEnabled) {
        // Correct visual start and end for the monkey
        // startY is the anchor's CURRENT visual top
        // focusLineY is where it will be AFTER the scroll
        const focusLineY = targetY // This is where the anchor will end up relative to doc top
        this.animateMonkey(targetY, focusLineY, direction)
      }

      this.animatedScrollTo(Math.max(0, targetY - this.jumpOffsetPx), this.jumpSpeed)
    }
  }

  animateMonkey(targetDocY, endDocY, direction) {
    const ruler = document.getElementById('jump-ruler')
    if (!ruler || this.rulerVisible === false) return

    // Clear any existing monkey first
    const existing = document.querySelectorAll('.ruler-monkey')
    existing.forEach(m => m.remove())

    const monkey = document.createElement('div')
    monkey.className = 'ruler-monkey'
    monkey.textContent = '🐒'

    const focusLineViewportY = this.jumpOffsetPx
    const getVisualY = (docY) => docY - this.viewer.scrollTop
    
    let startVisualY, endVisualY
    const isForward = direction === 1

    if (isForward) {
      // Forward: Anchor moves from bottom UP to Focus Line
      startVisualY = getVisualY(targetDocY)
      endVisualY = focusLineViewportY
    } else {
      // Backward: Anchor moves from top DOWN to Focus Line
      startVisualY = getVisualY(targetDocY)
      endVisualY = focusLineViewportY
    }

    // Clip to screen
    const clampedStart = Math.min(Math.max(0, startVisualY), window.innerHeight)
    const clampedEnd = Math.min(Math.max(0, endVisualY), window.innerHeight)

    monkey.style.top = `${clampedStart}px`
    ruler.appendChild(monkey)

    // Trigger transition
    requestAnimationFrame(() => {
      monkey.style.transition = `top ${this.jumpSpeed}ms cubic-bezier(0.165, 0.84, 0.44, 1)`
      monkey.style.animation = isForward ? `monkey-climb ${this.jumpSpeed}ms infinite` : `monkey-jump-down ${this.jumpSpeed}ms ease-out`
      
      monkey.offsetHeight // force reflow
      monkey.style.top = `${clampedEnd}px`

      // On finish: change icon
      setTimeout(() => {
        monkey.style.animation = ''
        if (isForward) {
          monkey.textContent = '🍌'
          monkey.classList.add('eating')
        } else {
          monkey.textContent = '🥥'
          monkey.classList.add('holding')
        }
      }, this.jumpSpeed)
    })
  }

  computeNextTarget() {
    if (!this.pdf || !this.viewer) { this.nextTargetAnchor = null; return }

    const currentScroll = this.viewer.scrollTop
    const viewportHeight = this.viewer.clientHeight
    const viewportCenter = currentScroll + viewportHeight / 2
    const currentFocusY = currentScroll + this.jumpOffsetPx
    const jumpStep = viewportHeight - 2 * this.jumpOffsetPx
    const maxForwardRange = currentFocusY + jumpStep + 100

    const candidates = this.stamps
      .filter(s => s.type === 'anchor')
      .map(s => {
        const pageElem = document.querySelector(`.page-container[data-page="${s.page}"]`)
        if (!pageElem) return null
        const canvas = pageElem.querySelector('.pdf-canvas')
        const absoluteY = pageElem.offsetTop + (s.y * canvas.height)
        return { stamp: s, absoluteY }
      })
      .filter(a => a !== null && a.absoluteY > currentFocusY + 10 && a.absoluteY < maxForwardRange)

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

    if (recentSoloData) this.recentSoloScores = JSON.parse(recentSoloData)

    if (sourcesData) this.sources = JSON.parse(sourcesData)
    if (activeSourceData) this.activeSourceId = activeSourceData
    if (fingerprintData) this.pdfFingerprint = fingerprintData
    if (profilesData) this.profiles = JSON.parse(profilesData)
    if (activeProfileData) this.activeProfileId = activeProfileData

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

      // Remove legacy 'fingering' layer (merged into 'bowing')
      this.layers = this.layers.filter(l => l.id !== 'fingering')

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
        // Migrate fingering layer (removed, merged into bowing)
        if (s.layerId === 'fingering') s.layerId = 'bowing'
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
    const coreIds = INITIAL_LAYERS.map(l => l.id)
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

    this.saveToStorage()
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

    // 1. Move custom-layer stamps to 'draw', migrate fingering → bowing
    const standardIds = new Set(INITIAL_LAYERS.map(l => l.id))
    this.stamps.forEach(s => {
      if (s.layerId === 'fingering') s.layerId = 'bowing'
      else if (!standardIds.has(s.layerId)) s.layerId = 'draw'
    })

    // 2. Reset layers array to defaults
    this.layers = [...INITIAL_LAYERS]

    this.activeLayerId = 'draw'
    this.saveToStorage()
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

    this.layers.forEach(layer => {
      if (layer.visible === undefined) layer.visible = true

      const item = document.createElement('div')
      item.className = 'layer-item'

      const eyeIcon = layer.visible
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
        : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`

      const isCore = INITIAL_LAYERS.some(l => l.id === layer.id)

      item.innerHTML = `
        <div class="layer-info">
          <div class="color-dot" style="background:${layer.color}"></div>
          <div class="layer-meta">
            <span class="layer-name">${layer.name}</span>
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

    this.sources.forEach(source => {
      const isActive = this.activeSourceId === source.id
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


  // --- NEW COMMUNITY FEATURES ---

  async verifyPermission(fileHandle, readWrite) {
    const options = {}
    if (readWrite) {
      options.mode = 'readwrite'
    }
    // Check if permission was already granted.
    if ((await fileHandle.queryPermission(options)) === 'granted') {
      return true
    }
    // Request permission.
    if ((await fileHandle.requestPermission(options)) === 'granted') {
      return true
    }
    return false
  }

  async connectSyncFolder(type) {
    try {
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      })

      const targetId = this.pendingMissionHandle ? this.pendingMissionProfileId : this.activeProfileId
      if (!targetId) {
        alert('Please select a profile first!')
        return
      }

      // Persistent Storage for this specific profile
      await db.set(`profile_${targetId}_${type}_handle`, handle)

      if (type === 'personal') {
        this.personalSyncFolder = handle
      } else {
        this.orchestraSyncFolder = handle
      }

      this.updateSyncUI()
      this.showDialog({
        title: 'Folder Linked',
        message: `✅ ${type === 'personal' ? 'Personal' : 'Orchestra'} folder linked: "${handle.name}".`,
        icon: '🔗'
      })
      await this.renderCommunityHub()
    } catch (err) {
      console.warn('Folder connection cancelled:', err)
    }
  }

  async publishWork(target) {
    const activeProfile = this.profiles.find(p => p.id === this.activeProfileId)
    const folder = target === 'personal' ? this.personalSyncFolder : this.orchestraSyncFolder

    if (!folder) {
      alert(`Please link a ${target === 'personal' ? 'Personal' : 'Orchestra'} folder first!`)
      return
    }

    const data = {
      id: 'pub_' + Date.now(),
      author: activeProfile.name,
      section: activeProfile.section,
      orchestra: activeProfile.orchestra,
      timestamp: new Date().toLocaleTimeString(),
      layers: this.layers,
      stamps: this.stamps,
      sources: this.sources,
      fingerprint: this.pdfFingerprint,
      workspaceType: target // Mark the origin
    }

    try {
      // CRITICAL: Verify write permission
      const hasPermission = await this.verifyPermission(folder, true)
      if (!hasPermission) throw new Error('Permission denied.')

      const fileName = `sf_${target}_${activeProfile.name.replace(/\s/g, '_')}_${Date.now()}.json`
      const fileHandle = await folder.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(JSON.stringify(data, null, 2))
      await writable.close()

      // Flag for Library Sync Indicators
      if (this.pdfFingerprint) {
        localStorage.setItem(`scoreflow_published_${target.charAt(0)}_${this.pdfFingerprint}`, 'true')
      }

      alert(`🚀 Successfully saved to ${target === 'personal' ? 'Private Backup' : 'Orchestra Workspace'}!`)
      await this.renderCommunityHub()
      this.renderLibrary()
    } catch (err) {
      console.error('Publishing error:', err)
      alert(`❌ Publishing failed: ${err.message}`)
    }
  }

  async renderCommunityHub() {
    if (!this.sharedList) return
    this.sharedList.innerHTML = '<div class="hub-loading">Scanning workspaces...</div>'

    const communityData = []
    const scanFolder = async (folder, typeLabel) => {
      if (!folder) return
      try {
        const hasPermission = await this.verifyPermission(folder, false)
        if (!hasPermission) return

        for await (const [name, handle] of folder.entries()) {
          if (name.endsWith('.json') && (name.startsWith('sf_personal_') || name.startsWith('sf_orchestra_') || name.startsWith('sf_shared_'))) {
            const file = await handle.getFile()
            const text = await file.text()
            try {
              const data = JSON.parse(text)
              if (data.fingerprint === this.pdfFingerprint && data.stamps && data.stamps.length > 0) {
                data.location = typeLabel // Add origin label
                communityData.push(data)
              }
            } catch (e) { console.warn('Corrupt JSON:', name) }
          }
        }
      } catch (err) { console.error(`Scan error in ${typeLabel}:`, err) }
    }

    // Scan both potential sources
    await scanFolder(this.personalSyncFolder, 'Personal Workspace')
    await scanFolder(this.orchestraSyncFolder, 'Orchestra')

    // Sort by timestamp (newest first)
    communityData.sort((a, b) => {
      const timeA = new Date(a.id.split('_')[1] || 0)
      const timeB = new Date(b.id.split('_')[1] || 0)
      return b - a
    })

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
             <div class="workspace-badge ${work.location === 'Personal Workspace' ? 'personal' : 'orchestra'}">
               ${work.location === 'Personal Workspace' ? '🔒 Private' : '👥 Team'}
             </div>
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
    // Use the sender's original style name if available, otherwise fallback
    const originalStyleName = work.sources && work.sources[0] ? work.sources[0].name : "Shared Markings"

    // 1. Create a new source with contributor tracking
    const newSource = {
      id: newSourceId,
      name: originalStyleName,
      author: work.author,      // Persistent Contributor tracking
      section: work.section,    // Role identification
      visible: true,
      opacity: 0.7,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16)
    }
    this.sources.push(newSource)

    // 2. Clone and link the stamps to the new source
    const importedStamps = (work.stamps || [])
      .filter(s => s && s.page)
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
    alert(`${work.author}'s interpretation ("${originalStyleName}") imported!`)
  }

  // --- MEMBER PROFILE MANAGEMENT ---

  toggleProfileModal(show) {
    if (this.profileModal) {
      this.profileModal.classList.toggle('active', show)
      if (show) this.renderProfileList()
    }
  }

  async renderActiveProfile() {
    const active = this.profiles.find(p => p.id === this.activeProfileId) || this.profiles[0]
    if (!active) return

    if (this.profileDisplayName) this.profileDisplayName.textContent = active.name
    if (this.profileDisplayOrchestra) this.profileDisplayOrchestra.textContent = active.orchestra
    if (this.profileAvatarInitial) this.profileAvatarInitial.textContent = active.initial || active.name.charAt(0)
    if (this.welcomeIdentityName) this.welcomeIdentityName.textContent = `Welcome, ${active.name}`

    // Update Section Hub title dynamically
    const statusEl = document.querySelector('.hub-status')
    if (statusEl) statusEl.textContent = `Section: ${active.section}`

    // Auto-recover Cloud Folders for this profile
    const pHandle = await db.get(`profile_${active.id}_personal_handle`)
    const oHandle = await db.get(`profile_${active.id}_orchestra_handle`)
    this.personalSyncFolder = pHandle || null
    this.orchestraSyncFolder = oHandle || null
    this.updateSyncUI()

    this.renderWelcomeProfiles()
  }

  updateSyncUI() {
    // 1. Sidebar Status (Existing)
    if (this.personalStatus) {
      if (this.personalSyncFolder) {
        this.personalStatus.innerHTML = `✅ Linked: <strong style="color:var(--primary)">${this.personalSyncFolder.name}</strong>`
      } else {
        this.personalStatus.textContent = 'No personal folder linked.'
      }
    }
    if (this.orchestraStatus) {
      if (this.orchestraSyncFolder) {
        this.orchestraStatus.innerHTML = `✅ Linked: <strong style="color:var(--primary)">${this.orchestraSyncFolder.name}</strong>`
      } else {
        this.orchestraStatus.textContent = 'No group folder linked.'
      }
    }

    // 2. Setup Wizard Status (Card-based)
    if (this.setupStatusScore) {
      if (this.pendingMissionHandle) {
        this.setupStatusScore.textContent = this.pendingMissionHandle.name
        if (this.setupCardScore) this.setupCardScore.classList.add('active')
      } else {
        this.setupStatusScore.textContent = 'Required'
        if (this.setupCardScore) this.setupCardScore.classList.remove('active')
      }
    }
    if (this.setupStatusShared) {
      if (this.pendingOrchestraHandle) {
        this.setupStatusShared.textContent = this.pendingOrchestraHandle.name
        if (this.setupCardShared) this.setupCardShared.classList.add('active')
      } else {
        this.setupStatusShared.textContent = 'Optional'
        if (this.setupCardShared) this.setupCardShared.classList.remove('active')
      }
    }
  }

  async renderWelcomeProfiles() {
    if (!this.welcomeProfileList) return
    this.welcomeProfileList.innerHTML = ''

    const isInWizard = !this.identitySelectionView.classList.contains('hidden')

    this.profiles.forEach(p => {
      const isActive = p.id === (isInWizard ? this.pendingMissionProfileId : this.activeProfileId)
      const card = document.createElement('div')
      card.className = `identity-card ${isActive ? 'active' : ''}`
      card.innerHTML = `
        <div class="identity-avatar">${p.initial || p.name.charAt(0)}</div>
        <div class="identity-name">${p.name}</div>
        <div class="identity-role">${p.section}</div>
      `
      card.onclick = async () => {
        // MISSION SETUP FLOW
        if (isInWizard) {
          this.pendingMissionProfileId = p.id

          // Check if this profile ALREADY has cloud folders linked in DB
          const pHandle = await db.get(`profile_${p.id}_personal_handle`)
          const oHandle = await db.get(`profile_${p.id}_orchestra_handle`)

          // Pre-fill the wizard handles if they exist
          this.pendingMissionHandle = pHandle || null
          this.pendingOrchestraHandle = oHandle || null

          this.updateSyncUI()
          this.validateMissionStart()
          this.renderWelcomeProfiles()

          // Transition to Page 2 (Scanned Scores)
          this.showSetupStage(2)
        } else {
          // Normal Identity Change
          this.activeProfileId = p.id
          this.saveToStorage()
          this.renderActiveProfile()

          if (this.identitySelectionView) this.identitySelectionView.classList.add('hidden')
          if (this.welcomeInitialView) this.welcomeInitialView.classList.remove('hidden')
        }
      }
      this.welcomeProfileList.appendChild(card)
    })
  }

  showSetupStage(n) {
    const stages = [this.setupStage1, this.setupStage2, this.setupStage3]
    stages.forEach((stage, i) => {
      if (!stage) return
      if (i + 1 === n) {
        stage.classList.remove('hidden')
      } else {
        stage.classList.add('hidden')
      }
    })
  }

  async checkInitialView() {
    // 1. If we have a PDF already loaded, hide welcome entirely
    if (this.pdf) {
      this.hideWelcome()
      return
    }

    // 2. Clear stage variables
    this.pendingMissionHandle = null

    // 3. Show Mission Hub (Stage 1)
    const screen = document.querySelector('.welcome-screen')
    if (screen) screen.classList.remove('hidden')

    if (this.missionSelectionView) {
      this.missionSelectionView.classList.remove('hidden')
      if (this.identitySelectionView) this.identitySelectionView.classList.add('hidden')
      if (this.welcomeInitialView) this.welcomeInitialView.classList.add('hidden')
      if (this.projectRepertoireView) this.projectRepertoireView.classList.add('hidden')
      if (this.recentMissionsContainer) this.recentMissionsContainer.classList.add('hidden')
      if (this.welcomeSoloPanel) this.welcomeSoloPanel.classList.add('hidden')
    }
  }

  async renderRecentMissions() {
    if (!this.recentMissionsContainer) return
    this.recentMissionsContainer.innerHTML = ''

    const storedMissions = await db.get('scoreflow_missions') || []

    if (storedMissions.length === 0) {
      this.recentMissionsContainer.innerHTML = '<div class="empty-state text-center p-10 opacity-70">No recent missions started yet.</div>'
      return
    }

    storedMissions.forEach(mission => {
      const card = document.createElement('div')
      card.className = 'mission-card'
      card.innerHTML = `
        <div class="mission-card-icon">📂</div>
        <div class="mission-card-info">
          <div class="mission-card-name">${mission.name}</div>
          <div class="mission-card-role">${mission.profileName || 'No Role Assigned'}</div>
        </div>
      `
      card.onclick = async () => {
        try {
          const permission = await mission.handle.requestPermission({ mode: 'read' })
          if (permission === 'granted') {
            this.libraryFolderHandle = mission.handle
            this.activeProfileId = mission.profileId
            this.saveToStorage()
            this.libraryFiles = []
            await this.scanLibrary(this.libraryFolderHandle)
            this.renderLibrary()
            // Don't hide welcome yet, show the repertoire to pick a score
            this.showProjectRepertoire()
            this.renderActiveProfile()
          }
        } catch (e) {
          console.warn('Mission opening failed:', e)
        }
      }
      this.recentMissionsContainer.appendChild(card)
    })
  }

  renderWelcomeSoloPanel() {
    const panel = this.welcomeSoloPanel
    if (!panel) return
    panel.innerHTML = ''

    const scores = this.recentSoloScores || []

    // Header row
    const header = document.createElement('div')
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px'
    header.innerHTML = `<span style="font-size:0.8rem;font-weight:600;color:var(--text-muted)">RECENT SCORES</span>`
    const btnGroup = document.createElement('div')
    btnGroup.style.cssText = 'display:flex;gap:6px'
    const clearBtn = document.createElement('button')
    clearBtn.className = 'btn btn-outline btn-smaller'
    clearBtn.textContent = 'Clear'
    clearBtn.onclick = () => {
      this.recentSoloScores = []
      this.saveToStorage()
      this.welcomeSoloPanel.classList.add('hidden')
    }
    const browseBtn = document.createElement('button')
    browseBtn.className = 'btn btn-primary btn-smaller'
    browseBtn.textContent = '+ Open Score…'
    browseBtn.onclick = () => this.openSoloPDF()
    btnGroup.appendChild(clearBtn)
    btnGroup.appendChild(browseBtn)
    header.appendChild(btnGroup)
    panel.appendChild(header)

    // Score list
    scores.forEach(score => {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg-app);border:1px solid var(--border);border-radius:10px;margin-bottom:8px;cursor:pointer'
      row.innerHTML = `
        <span style="font-size:1.2rem">🎼</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:0.85rem;font-weight:600;color:var(--text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${score.name}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">${score.date}</div>
        </div>
        <span style="font-size:0.72rem;color:var(--text-muted)">Re-open →</span>
      `
      row.onmouseenter = () => row.style.borderColor = 'var(--primary)'
      row.onmouseleave = () => row.style.borderColor = 'var(--border)'
      row.onclick = async () => {
        const handle = await db.get(`solo_handle_${score.name}`)
        if (handle) {
          try {
            const permission = await handle.requestPermission({ mode: 'read' })
            if (permission === 'granted') {
              const file = await handle.getFile()
              const buffer = await file.arrayBuffer()
              await this.loadPDF(new Uint8Array(buffer))
              this.activeScoreName = score.name
              await this.addToRecentSoloScores(score.name, handle)
              this.saveToStorage()
              this.renderLibrary()
              return
            }
          } catch (e) {
            console.warn('Failed to reopen from handle:', e)
          }
        }
        // No handle or permission denied — open picker
        await this.openSoloPDF()
      }
      panel.appendChild(row)
    })
  }

  async startNewMission() {
    // Show Setup Screen First (Mental Workflow: Who am I? Where are we?)
    this.pendingMissionHandle = null
    this.pendingMissionProfileId = null

    if (this.missionSelectionView) this.missionSelectionView.classList.add('hidden')
    if (this.identitySelectionView) {
      this.identitySelectionView.classList.remove('hidden')
      this.showSetupStage(1)
      const title = document.getElementById('setup-mission-title')
      if (title) title.textContent = `Setup Performance Mission`
    }

    if (this.setupScoreStatus) {
      this.setupScoreStatus.innerHTML = '<span style="color:var(--text-muted)">Project Repertoire Folder Not Selected</span>'
    }

    if (this.finalStartMissionBtn) this.finalStartMissionBtn.disabled = true
    this.renderWelcomeProfiles()
  }

  async selectMissionFolder() {
    try {
      const handle = await window.showDirectoryPicker()
      this.pendingMissionHandle = handle

      if (this.setupCardScore) this.setupCardScore.classList.add('active')
      if (this.setupStatusScore) {
        this.setupStatusScore.textContent = handle.name
      }

      const title = document.getElementById('setup-mission-title')
      if (title) title.textContent = `Mission: ${handle.name}`

      // Re-validate if we can start
      this.validateMissionStart()

      // ADVANCE to Stage 3 (Optional Shared Sync)
      this.showSetupStage(3)
    } catch (e) {
      console.warn('Mission folder selection cancelled:', e)
    }
  }

  async selectOrchestraFolder() {
    try {
      const handle = await window.showDirectoryPicker()
      this.pendingOrchestraHandle = handle

      if (this.setupCardShared) this.setupCardShared.classList.add('active')
      if (this.setupStatusShared) {
        this.setupStatusShared.textContent = handle.name
      }

      this.validateMissionStart()
    } catch (e) {
      console.warn('Orchestra folder selection cancelled:', e)
    }
  }

  validateMissionStart() {
    const hasRole = this.pendingMissionProfileId !== null
    const hasFolder = this.pendingMissionHandle !== null
    if (this.finalStartMissionBtn) {
      this.finalStartMissionBtn.disabled = !(hasRole && hasFolder)
    }
  }

  async completeMissionSetup(profile) {
    if (!profile) {
      profile = this.profiles.find(p => p.id === this.pendingMissionProfileId)
    }

    if (!profile || !this.pendingMissionHandle) {
      console.error('Mission setup failed: Missing profile or folder handle.')
      return
    }

    const mission = {
      id: 'mission_' + Date.now(),
      name: this.pendingMissionHandle.name,
      handle: this.pendingMissionHandle,
      profileId: profile.id,
      profileName: profile.name,
      timestamp: Date.now()
    }

    let missions = await db.get('scoreflow_missions') || []
    missions = missions.filter(m => m.name !== mission.name)
    missions.unshift(mission)
    missions = missions.slice(0, 5)
    await db.set('scoreflow_missions', missions)

    // Set active folders
    this.libraryFolderHandle = this.pendingMissionHandle
    this.personalSyncFolder = this.pendingMissionHandle
    this.orchestraSyncFolder = this.pendingOrchestraHandle || null
    this.activeProfileId = profile.id

    // Persist links for this profile
    await db.set(`profile_${profile.id}_personal_handle`, this.pendingMissionHandle)
    if (this.pendingOrchestraHandle) {
      await db.set(`profile_${profile.id}_orchestra_handle`, this.pendingOrchestraHandle)
    }

    this.saveToStorage()

    this.libraryFiles = []
    await this.scanLibrary(this.libraryFolderHandle)
    this.renderLibrary()

    // Clear wizard state
    this.pendingMissionHandle = null
    this.pendingOrchestraHandle = null
    this.pendingMissionProfileId = null

    this.showProjectRepertoire()
    this.renderActiveProfile()
  }

  async exitMission() {
    const confirmed = await this.showDialog({
      title: 'Exit Mission',
      message: 'Are you sure you want to end this performance mission and return to the hub? Your local markings are saved automatically.',
      icon: '🚪',
      type: 'confirm',
      confirmText: 'Exit Mission'
    })

    if (!confirmed) return

    this.pdf = null
    this.libraryFiles = []
    this.libraryFolderHandle = null
    this.activeScoreName = null

    if (this.container) this.container.querySelectorAll('.page-container').forEach(el => el.remove())
    if (this.layerShelf) this.layerShelf.classList.remove('active')
    if (this.sidebar) this.sidebar.classList.remove('open')
    if (this.isSidebarLocked) {
      this.isSidebarLocked = false
      if (this.lockSidebarBtn) this.lockSidebarBtn.classList.remove('locked')
    }
    if (this.activeToolsContainer) this.activeToolsContainer.classList.remove('expanded')

    // Hide all main-UI elements that showMainUI() revealed
    ;['sidebar-trigger', 'floating-doc-bar', 'jump-ruler', 'layer-toggle-fab'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.classList.add('hidden')
    })

    this.checkInitialView()
  }

  hideWelcome() {
    const screen = document.querySelector('.welcome-screen')
    if (screen) screen.classList.add('hidden')
  }

  showMainUI() {
    // Reveal toolbars once a score is loaded
    ;['sidebar-trigger', 'floating-doc-bar', 'layer-toggle-fab'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.classList.remove('hidden')
    })
    // Ruler respects the saved toggle state
    const ruler = document.getElementById('jump-ruler')
    if (ruler) {
      if (this.rulerVisible) {
        ruler.classList.remove('hidden')
        ruler.style.display = 'block'
      } else {
        ruler.classList.add('hidden')
        ruler.style.display = ''
      }
    }
    if (this.btnRulerToggle) this.btnRulerToggle.classList.toggle('active', this.rulerVisible)
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
    // iOS Safari doesn't support Fullscreen API properly — it shows a
    // swipe-down gesture bar that blocks all touch input at the top.
    // True fullscreen on iOS requires PWA standalone mode (Add to Home Screen).
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true

    if (isIOS && !isStandalone) {
      this.showDialog({
        title: 'Full Screen on iPad',
        message: 'Tap Share (□↑) → Add to Home Screen. ScoreFlow will open without the browser bar — true full screen.',
        icon: '📱',
        type: 'info',
        confirmText: 'Got it',
        actions: [{ label: 'Got it', primary: true }]
      })
      return
    }

    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  _onFullscreenChange() {
    const isFs = !!document.fullscreenElement
    if (this.btnFullscreen) this.btnFullscreen.classList.toggle('active', isFs)
    const enterIcon = document.getElementById('icon-fullscreen-enter')
    const exitIcon = document.getElementById('icon-fullscreen-exit')
    if (enterIcon) enterIcon.style.display = isFs ? 'none' : ''
    if (exitIcon) exitIcon.style.display = isFs ? '' : 'none'
  }

  showProjectRepertoire() {
    // Hide all possible prior welcome views
    if (this.welcomeInitialView) this.welcomeInitialView.classList.add('hidden')
    if (this.missionSelectionView) this.missionSelectionView.classList.add('hidden')
    if (this.identitySelectionView) this.identitySelectionView.classList.add('hidden')

    if (this.projectRepertoireView) this.projectRepertoireView.classList.remove('hidden')
    if (this.projectNameDisplay) this.projectNameDisplay.textContent = `Project: ${this.libraryFolderHandle.name}`
    this.renderProjectRepertoire()
  }

  async resetToSystemDefault() {
    const confirmed = await this.showDialog({
      title: 'Factory Reset?',
      message: '🚨 WARNING: This will permanently DELETE all Profiles, Missions, Interpretation Styles, and Cloud Workspaces. This action cannot be undone.',
      icon: '🔥',
      type: 'confirm',
      confirmText: 'Reset Systems Now',
      cancelText: 'Keep My Data'
    })

    if (confirmed) {
      // PROMPT VERIFICATION: Explicitly ask the user to type RESET
      // This gives the user feedback that the logic is active and requires deliberate action
      const verify = prompt('To confirm factory reset, please type "RESET" in the box below:', '')

      if (verify === 'RESET') {
        // 1. Clear Storage
        localStorage.clear()
        sessionStorage.clear()

        // 2. Clear IndexedDB (True Clean Slate)
        try {
          // IMPORTANT: Close active connection first to unblock deletion
          db.closeDB()

          const deleteRequest = indexedDB.deleteDatabase('ScoreFlowStorage')
          deleteRequest.onsuccess = () => {
            alert('App System has been factory reset. All data is now gone. Reloading...')
            window.location.reload()
          }
          deleteRequest.onerror = () => window.location.reload()
          deleteRequest.onblocked = () => {
            console.warn('DB delete blocked, reloading anyway.')
            window.location.reload()
          }

          // Fallback timer if DB deletion hangs
          setTimeout(() => window.location.reload(), 1500)
        } catch (e) {
          window.location.reload()
        }
      } else {
        alert('Reset cancelled. Verification text did not match.')
      }
    }
  }

  async selectLibraryFolder() {
    try {
      this.libraryFolderHandle = await window.showDirectoryPicker()
      await db.set('last_library_handle', this.libraryFolderHandle)
      this.libraryFiles = []
      await this.scanLibrary(this.libraryFolderHandle)
      this.renderLibrary()

      this.showProjectRepertoire()

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
          this.hideWelcome() // Now we can hide the wizard!

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
      const fingerprint = this.scoreFingerprintMap[fileHandle.name]

      // Check for annotation presence across 3 storage tiers:
      const hasLocal = fingerprint && localStorage.getItem(`scoreflow_stamps_${fingerprint}`)

      // We show P and O badges if the folders are linked AND we have recorded a publication for this fingerprint.
      const hasPersonal = this.personalSyncFolder && fingerprint && localStorage.getItem(`scoreflow_published_p_${fingerprint}`)
      const hasOrchestra = this.orchestraSyncFolder && fingerprint && localStorage.getItem(`scoreflow_published_o_${fingerprint}`)

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
        <div class="score-badges">
          ${hasLocal ? '<span class="score-badge-mini local" title="Local Annotations (Current)">L</span>' : ''}
          ${hasPersonal ? '<span class="score-badge-mini personal" title="Private Cloud Workspace">P</span>' : ''}
          ${hasOrchestra ? '<span class="score-badge-mini orchestra" title="Orchestra Shared Workspace">O</span>' : ''}
        </div>
        <div class="score-actions">
          <button class="btn-score-action btn-clear-score" title="Clear All Annotations">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
        ${isActive ? '<div class="active-indicator-dot"></div>' : ''}
      `

      const openBtn = item.querySelector('.score-name')
      item.onclick = async (e) => {
        if (e.target.closest('.score-actions')) return
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
        }
      }

      item.querySelector('.btn-clear-score').onclick = (e) => {
        e.stopPropagation()
        this.clearScoreAnnotations(fileHandle.name)
      }

      this.libraryList.appendChild(item)
    })
  }

  async clearScoreAnnotations(scoreName) {
    const fingerprint = this.scoreFingerprintMap[scoreName]
    if (!fingerprint) {
      this.showDialog({ title: 'No Data', message: 'No annotations found for this score.', icon: '❓' })
      return
    }

    const confirmed = await this.systemDialog ? await this.showDialog({
      title: 'Clear Score?',
      message: `🛑 PERMANENT ACTION: This will delete ALL local markings for "${scoreName.replace(/\.pdf$/i, '')}". Are you sure?`,
      icon: '🗑️',
      type: 'confirm',
      confirmText: 'Delete Forever'
    }) : confirm(`Clear all markings for ${scoreName}?`)

    if (!confirmed) return

    localStorage.removeItem(`scoreflow_stamps_${fingerprint}`)

    if (this.activeScoreName === scoreName) {
      this.stamps = []
      if (this.pdf) await this.renderPDF()
    }

    this.renderLibrary()
    this.showDialog({ title: 'Cleared', message: 'All local annotations removed.', icon: '✅' })
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
    // Same pattern as showBatchEraseDialog — simple fixed overlay, no CSS transitions
    const IS = 'padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg-app);color:var(--text-main);font-size:0.9rem;width:100%;box-sizing:border-box;margin-bottom:8px'
    const dialog = document.createElement('div')
    dialog.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center'
    dialog.innerHTML = `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:20px;padding:28px;width:90vw;max-width:360px;box-shadow:0 8px 32px rgba(0,0,0,0.3)">
        <div style="font-size:1.1rem;font-weight:700;color:var(--text-main);margin-bottom:18px">🎭 Create New Identity</div>
        <input class="_pf-name" style="${IS}" placeholder="Display Name" value="Guest Musician" />
        <input class="_pf-orch" style="${IS}" placeholder="Orchestra / Ensemble" value="Standard Orchestra" />
        <input class="_pf-sect" style="${IS}margin-bottom:16px" placeholder="Section / Role (e.g. First Violins)" value="Section" />
        <div style="display:flex;gap:8px">
          <button class="_pf-cancel btn btn-outline" style="flex:1">Cancel</button>
          <button class="_pf-ok btn btn-primary" style="flex:1">Create</button>
        </div>
      </div>
    `
    document.body.appendChild(dialog)

    const nameEl = dialog.querySelector('._pf-name')
    nameEl.focus(); nameEl.select()

    const cleanup = () => { if (dialog.parentNode) document.body.removeChild(dialog) }

    dialog.querySelector('._pf-cancel').onclick = cleanup

    dialog.querySelector('._pf-ok').onclick = () => {
      const name = nameEl.value.trim()
      const orch = dialog.querySelector('._pf-orch').value.trim()
      const section = dialog.querySelector('._pf-sect').value.trim()
      if (!name) { nameEl.focus(); return }
      cleanup()

      const id = 'p_' + Date.now()
      this.profiles.push({ id, name, orchestra: orch || 'Standard Orchestra', section: section || 'Section', initial: name.charAt(0) })
      this.activeProfileId = id
      this.saveToStorage()
      this.renderActiveProfile()
      this.renderProfileList()
      this.renderWelcomeProfiles()

      // If in wizard, move to Stage 2
      if (this.identitySelectionView && !this.identitySelectionView.classList.contains('hidden')) {
        this.showSetupStage(2)
      }
    }

    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') dialog.querySelector('._pf-ok').click()
      if (e.key === 'Escape') cleanup()
    })
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

  updateLayoutState() {
    const app = document.getElementById('app')
    if (!app) return
    const isOpen = this.sidebar.classList.contains('open')
    app.classList.toggle('is-sidebar-active', isOpen)
  }
  // --- NAVIGATION ACTIONS ---
  goToHead() {
    this.currentPageNum = 1
    this.viewer.scrollTo({ top: 0, behavior: 'smooth' })
  }

  goToEnd() {
    if (!this.pdf) return
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
}

new ScoreFlow()