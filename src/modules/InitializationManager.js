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

        app.shortcutsModal = document.getElementById('shortcuts-modal')
        app.closeShortcutsBtn = document.getElementById('close-shortcuts')
        app.viewer = document.getElementById('viewer-container')
        app.settingsJumpOffsetInput = document.getElementById('settings-jump-offset')
        app.settingsJumpOffsetValue = document.getElementById('settings-jump-offset-value')
        app.welcomeView = document.getElementById('welcome-view')
        app.btnWelcomeSkip = document.getElementById('btn-welcome-skip')
        app.resetSystemBtn = document.getElementById('reset-system-btn')
        app.resetSystemBtn = document.getElementById('reset-system-btn')
        app.systemDialog = document.getElementById('system-dialog')
        app.eraseAllModal = document.getElementById('erase-all-modal')
        app.dialogTitle = document.getElementById('dialog-title')
        app.dialogMessage = document.getElementById('dialog-message')
        app.dialogIcon = document.getElementById('dialog-icon')
        app.dialogActions = document.getElementById('dialog-actions')
        app.dialogInput = document.getElementById('dialog-input')
        app.closeDialogBtn = document.getElementById('close-dialog')

        document.querySelectorAll('.zoom-btn-mini[title]').forEach(btn => {
            btn.dataset.tooltip = btn.title
        })
    }

    initEventListeners() {
        const app = this.app

        app.btnWelcomeSkip?.addEventListener('click', () => {
            app.viewerManager.hideWelcome()
            app.toggleLibrary(true)
            app.rulerManager?.updateRulerPosition()
        })

        document.getElementById('btn-library-close-main')?.addEventListener('click', () => app.toggleLibrary(false))

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

        app.resetSystemBtn?.addEventListener('click', () => app.resetToSystemDefault())
        app.closeShortcutsBtn?.addEventListener('click', () => app.toggleShortcuts(false))
        app.settingsJumpOffsetInput?.addEventListener('input', (e) => app.updateJumpOffset(parseInt(e.target.value)))


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



        document.getElementById('btn-gist-share')?.addEventListener('click', () => app.gistShareManager?.share())
    }
}
