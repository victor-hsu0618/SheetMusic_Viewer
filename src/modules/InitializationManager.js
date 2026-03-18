/**
 * InitializationManager handles DOM element selection and 
 * global event listener binding for the ScoreFlow application.
 * Extracted from main.js to comply with 500-line limit.
 */
export class InitializationManager {
    constructor(app) {
        this.app = app
    }

    initElements() {
        const app = this.app
        app.container = document.getElementById('pdf-viewer')
        app.allUploaders = document.querySelectorAll('.native-file-input')
        app.uploader = app.allUploaders[0]

        app.allUploaders.forEach(u => {
            u.addEventListener('change', async (e) => {
                if (e.target.closest('.btn-import-wrapper')) return
                await app.handleUpload(e)
            })
        })

        app.sidebar = document.getElementById('sidebar')
        app.layerList = document.getElementById('layer-shelf-list')
        app.jumpLine = document.getElementById('jump-line')
        app.activeToolsContainer = document.getElementById('active-tools-container')
        app.sourceList = document.getElementById('source-list')

        app.openPdfBtn = document.getElementById('open-pdf-btn')
        app.btnSettingsToggle = document.getElementById('btn-settings-toggle')
        app.btnLibraryToggle = document.getElementById('btn-library-toggle')
        app.btnScoreDetailToggle = document.getElementById('btn-score-detail-toggle')
        app.btnFitWidth = document.getElementById('view-fit-width')
        app.btnFitHeight = document.getElementById('view-fit-height')
        app.shortcutsModal = document.getElementById('shortcuts-modal')
        app.closeShortcutsBtn = document.getElementById('close-shortcuts')
        app.closeSidebarBtn = document.getElementById('close-sidebar')
        app.viewer = document.getElementById('viewer-container')
        app.jumpOffsetInput = document.getElementById('view-jump-offset')
        app.jumpOffsetValue = document.getElementById('view-jump-offset-value')
        app.settingsJumpOffsetInput = document.getElementById('settings-jump-offset')
        app.settingsJumpOffsetValue = document.getElementById('settings-jump-offset-value')
        app.settingsStampSizeInput = document.getElementById('settings-stamp-size')
        app.settingsStampSizeValue = document.getElementById('settings-stamp-size-value')
        app.exportBtn = document.getElementById('export-score-btn')
        app.importBtn = document.getElementById('import-score-btn')
        app.exportPdfBtn = document.getElementById('btn-export-pdf')
        app.importFileInput = document.getElementById('import-score-file')
        app.globalExportBtn = document.getElementById('export-btn')
        app.globalImportBtn = document.getElementById('import-btn')
        app.globalImportFile = document.getElementById('import-file')
        app.addSourceBtn = document.getElementById('add-source-btn')
        app.clearRecentBtn = document.getElementById('clear-recent-btn')
        app.welcomeView = document.getElementById('welcome-view')
        app.btnWelcomeSkip = document.getElementById('btn-welcome-skip')
        app.closeFileBtn = document.getElementById('close-file-btn')
        app.resetLayersBtn = document.getElementById('reset-layers-btn')
        app.resetSystemBtn = document.getElementById('reset-system-btn')
        app.btnRulerToggle = document.getElementById('view-ruler-toggle')
        app.btnFullscreen = document.getElementById('view-fullscreen')
        app.systemDialog = document.getElementById('system-dialog')
        app.eraseAllModal = document.getElementById('erase-all-modal')
        app.dialogTitle = document.getElementById('dialog-title')
        app.dialogMessage = document.getElementById('dialog-message')
        app.dialogIcon = document.getElementById('dialog-icon')
        app.dialogActions = document.getElementById('dialog-actions')
        app.dialogInput = document.getElementById('dialog-input')
        app.closeDialogBtn = document.getElementById('close-dialog')
        app.floatingScoreTitle = document.getElementById('floating-score-title')
        app.btnModeHand = document.getElementById('btn-mode-hand')
        app.btnModeEraser = document.getElementById('btn-mode-eraser')
        app.btnStampPalette = document.getElementById('btn-stamp-palette')

        document.querySelectorAll('.zoom-btn-mini[title]').forEach(btn => {
            btn.dataset.tooltip = btn.title
        })
    }

    initEventListeners() {
        const app = this.app

        app.btnWelcomeSkip?.addEventListener('click', () => {
            app.viewerManager.hideWelcome()
            app.toggleLibrary(true)
            ;['floating-doc-bar', 'layer-toggle-fab'].forEach(id => {
                document.getElementById(id)?.classList.remove('hidden')
            })
            app.rulerManager?.updateRulerPosition()
        })

        app.openPdfBtn?.addEventListener('click', (e) => {
            if (window.showOpenFilePicker) {
                e.preventDefault()
                app.openPdfFilePicker()
            }
        })

        app.clearRecentBtn?.addEventListener('click', async () => {
            if (!app.recentSoloScores?.length) return
            for (const s of app.recentSoloScores) {
                await db.set(`recent_buf_${s.name}`, undefined)
                await db.set(`recent_handle_${s.name}`, undefined)
            }
            app.recentSoloScores = []
            app.persistenceManager.saveToStorage()
            app.renderSidebarRecentScores()
        })

        app.btnSettingsToggle?.addEventListener('click', () => app.toggleSettings())
        app.btnLibraryToggle?.addEventListener('click', () => app.toggleLibrary())
        app.btnScoreDetailToggle?.addEventListener('click', (e) => {
            e.stopPropagation()
            if (!app.pdfFingerprint) return app.showMessage('Please open a score first.', 'info')
            app.toggleScoreDetail()
        })

        document.getElementById('btn-jump-panel-toggle')?.addEventListener('click', (e) => { e.stopPropagation(); app.jumpManager?.togglePanel() })
        document.getElementById('btn-view-panel-toggle')?.addEventListener('click', (e) => { e.stopPropagation(); app.viewPanelManager?.togglePanel() })

        // Quick tool suite (collapsed doc bar)
        document.getElementById('quick-page-up')?.addEventListener('click', () => app.jump(-1))
        document.getElementById('quick-page-down')?.addEventListener('click', () => app.jump(1))
        document.getElementById('quick-fit-width')?.addEventListener('click', () => app.fitToWidth())
        document.getElementById('quick-fit-height')?.addEventListener('click', () => app.fitToHeight())
        document.getElementById('quick-open-library')?.addEventListener('click', () => app.toggleLibrary())

        document.getElementById('btn-close-library')?.addEventListener('click', () => app.toggleLibrary(false))

        const scoreActionsInput = document.querySelector('#score-actions-area input[type="file"]')
        if (scoreActionsInput) {
            scoreActionsInput.addEventListener('change', async (e) => {
                const file = e.target.files[0]
                if (!file) return
                app.showMessage(`正在讀取檔案: ${file.name}...`, 'system')
                
                try {
                    const buf = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (ev) => resolve(ev.target.result);
                        reader.onerror = (err) => reject(err);
                        reader.readAsArrayBuffer(file);
                    });
                    
                    if (!buf || buf.byteLength === 0) throw new Error('檔案內容為空 (0 bytes)');
                    
                    await app.scoreManager.importScore(file, new Uint8Array(buf))
                } catch (err) {
                    console.error('[InitializationManager] Import failed:', err);
                    alert('Import failed: ' + err.message)
                } finally { e.target.value = '' }
            })
        }

        app.exportBtn?.addEventListener('click', () => app.exportProject())
        app.exportPdfBtn?.addEventListener('click', () => app.pdfExportManager?.exportFlattenedPDF())
        app.importBtn?.addEventListener('click', () => app.importFileInput.click())
        app.importFileInput?.addEventListener('change', (e) => app.handleImport(e))
        app.globalExportBtn?.addEventListener('click', () => app.exportProject(true))
        app.globalImportBtn?.addEventListener('click', () => app.globalImportFile.click())
        app.globalImportFile?.addEventListener('change', (e) => app.handleImport(e))
        app.closeDialogBtn?.addEventListener('click', () => app.systemDialog.classList.remove('active'))
        app.addSourceBtn?.addEventListener('click', () => app.addSource())
        app.resetSystemBtn?.addEventListener('click', () => app.resetToSystemDefault())
        app.settingsStampSizeInput?.addEventListener('input', (e) => app.updateStampSize(e.target.value))
        app.closeFileBtn?.addEventListener('click', () => app.viewerManager.closeFile())
        app.btnFitWidth?.addEventListener('click', () => app.viewerManager.fitToWidth())
        app.btnFitHeight?.addEventListener('click', () => app.viewerManager.fitToHeight())
        app.closeShortcutsBtn?.addEventListener('click', () => app.toggleShortcuts(false))
        app.closeSidebarBtn?.addEventListener('click', () => document.getElementById('sidebar')?.classList.remove('open'))
        app.settingsJumpOffsetInput?.addEventListener('input', (e) => app.updateJumpOffset(parseInt(e.target.value)))
        app.resetLayersBtn?.addEventListener('click', () => app.resetLayers())
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            app.btnFullscreen?.setAttribute('disabled', '')
            app.btnFullscreen?.setAttribute('title', 'PWA 模式已是全螢幕')
        } else {
            app.btnFullscreen?.addEventListener('click', () => app.toggleFullscreen())
        }
        app.btnRulerToggle?.addEventListener('click', () => app.rulerManager?.toggleRuler())

        // Measure number visibility toggle
        const measureVisToggle = document.getElementById('toggle-measure-visibility')
        if (measureVisToggle) {
            // Load saved state
            const saved = localStorage.getItem('hideMeasureNumbers')
            if (saved === 'true') {
                app.hideMeasureNumbers = true
                measureVisToggle.checked = false
            } else {
                app.hideMeasureNumbers = false
                measureVisToggle.checked = true
            }
            measureVisToggle.addEventListener('change', () => {
                app.hideMeasureNumbers = !measureVisToggle.checked
                localStorage.setItem('hideMeasureNumbers', app.hideMeasureNumbers)
                // Redraw all pages to reflect change
                if (app.pdf) {
                    for (let i = 1; i <= app.pdf.numPages; i++) {
                        app.redrawStamps(i)
                    }
                }
            })
        }

        // Doc Bar Toggles & Actions
        document.getElementById('btn-stamp-palette')?.addEventListener('click', () => app.toolManager?.toggleStampPalette())
        document.getElementById('btn-quick-open')?.addEventListener('click', () => app.openPdfFilePicker())
        document.getElementById('btn-mode-eraser')?.addEventListener('click', () => {
            app.activeStampType = app.activeStampType === 'eraser' ? 'view' : 'eraser'
            app.updateActiveTools()
        })

        // View Control Panel Shortcuts
        document.getElementById('view-zoom-in')?.addEventListener('click', () => app.changeZoom(0.1))
        document.getElementById('view-zoom-out')?.addEventListener('click', () => app.changeZoom(-0.1))

        document.getElementById('btn-drive-signin')?.addEventListener('click', (e) => { e.preventDefault(); app.driveSyncManager.signIn() })
        document.getElementById('btn-drive-signout')?.addEventListener('click', (e) => { e.preventDefault(); app.driveSyncManager.signOut() })
        document.getElementById('btn-drive-pause')?.addEventListener('click', (e) => { e.preventDefault(); app.togglePauseSync() })

        document.getElementById('btn-purge-cloud-data')?.addEventListener('click', () => {
            console.log('[InitializationManager] Purge button clicked');
            app.purgeAllCloudData();
        })
        document.getElementById('btn-drive-force-push')?.addEventListener('click', () => app.driveSyncManager.forcePushAll())
        document.getElementById('btn-rebuild-library')?.addEventListener('click', () => app.scoreManager.rebuildLibrary())
        document.getElementById('btn-heal-library')?.addEventListener('click', () => app.scoreManager.healLibrary())
        document.getElementById('btn-gist-share')?.addEventListener('click', () => app.gistShareManager?.share())

        // Activity tracking: record user presence for Drive sync idle detection
        const recordActivity = () => app.driveSyncManager?.recordActivity()
        document.addEventListener('pointerdown', recordActivity, { passive: true, capture: true })
        document.addEventListener('keydown', recordActivity, { passive: true, capture: true })
        document.addEventListener('wheel', recordActivity, { passive: true, capture: true })
    }
}
