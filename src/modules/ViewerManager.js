import * as db from '../db.js'
import * as pdfjsLib from 'pdfjs-dist'

export class ViewerManager {
    constructor(app) {
        this.app = app
        this.pdf = null
        this.pages = []
        this.scale = 1.5
        this.pdfFingerprint = null
        this.activeScoreName = null
    }

    init() {
        if (this.app.uploader) {
            this.app.uploader.addEventListener('change', (e) => this.handleUpload(e))
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
                    await db.set(`recent_buf_${file.name}`, buffer.slice(0))
                    await this.loadPDF(new Uint8Array(buffer), file.name)
                    this.app.addToRecentSoloScores(file.name)
                    this.app.saveToStorage()
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
            e.target.value = ''
        }
    }

    openPdfFilePicker() {
        if (window.showOpenFilePicker) {
            // We use an internal async function to handle the async file access on desktop
            (async () => {
                try {
                    const [handle] = await window.showOpenFilePicker({
                        types: [{ description: 'PDF Files', accept: { 'application/pdf': ['.pdf'] } }],
                        multiple: false,
                    })
                    const file = await handle.getFile()
                    const buf = await file.arrayBuffer()
                    await db.set(`recent_buf_${file.name}`, buf.slice(0))
                    await this.loadPDF(new Uint8Array(buf), file.name)
                    await db.set(`recent_handle_${file.name}`, handle)
                    this.app.addToRecentSoloScores(file.name)
                    this.app.saveToStorage()
                } catch (e) {
                    if (e.name !== 'AbortError') console.error('openPdfFilePicker:', e)
                }
            })()
        } else {
            if (this.app.uploader) this.app.uploader.click()
        }
    }

    async openFileHandle(handle) {
        try {
            // Check for permission if needed
            const options = { mode: 'read' }
            if ((await handle.queryPermission(options)) !== 'granted') {
                if ((await handle.requestPermission(options)) !== 'granted') {
                    throw new Error('Permission denied')
                }
            }
            return await handle.getFile()
        } catch (err) {
            console.error('[ViewerManager] openFileHandle failed:', err)
            return null
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

    async loadPDF(data, filename = null) {
        if (filename) this.activeScoreName = filename;
        // 1. Save current score's stamps before switching
        if (this.pdfFingerprint) {
            this.app.saveToStorage()
        }

        // 2. Compute fingerprint of the new PDF
        const newFingerprint = await this.getFingerprint(data.buffer || data)
        this.pdfFingerprint = newFingerprint

        // 3. Load this score's saved stamps (or start fresh)
        const savedStamps = localStorage.getItem(`scoreflow_stamps_${newFingerprint}`)
        this.app.stamps = savedStamps ? JSON.parse(savedStamps) : []
        this.app.jumpHistory = []

        // 4. Update Score Detail UI
        if (this.app.updateScoreDetailUI) {
            this.app.updateScoreDetailUI(newFingerprint)
        }

        // 5. Load and render the PDF
        const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/')
        const pdfjsDir = new URL('pdfjs/', baseUrl).href

        const loadingTask = pdfjsLib.getDocument({
            data: data,
            cMapUrl: new URL('pdfjs/cmaps/', baseUrl).href,
            cMapPacked: true,
            standardFontDataUrl: new URL('pdfjs/standard_fonts/', baseUrl).href,
            jbig2WasmUrl: new URL('pdfjs/jbig2.wasm', baseUrl).href,
            // Generic wasmUrl MUST be a directory with a trailing slash
            wasmUrl: pdfjsDir,
            isEvalSupported: false,
            stopAtErrors: false
        })

        this.pdf = await loadingTask.promise
        console.log(`PDF loaded successfully. Pages: ${this.pdf.numPages}, Fingerprint: ${newFingerprint.slice(0, 8)}...`)

        // Open with 'Fit to Height' by default on PC, 'Fit to Width' on mobile
        this.showMainUI()
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
        if (isTouch) {
            await this.fitToWidth()
        } else {
            await this.fitToHeight()
        }

        this.app.updateJumpLinePosition()
        this.app.updateRulerClip()
    }

    async renderPDF() {
        // Hide welcome screen and remove only PDF pages — preserve welcome-screen DOM node
        const welcomeScreen = document.querySelector('.welcome-screen')
        if (welcomeScreen) welcomeScreen.classList.add('hidden')

        this.app.container.querySelectorAll('.page-container').forEach(el => el.remove())
        this.pages = []

        for (let i = 1; i <= this.pdf.numPages; i++) {
            const page = await this.pdf.getPage(i)
            const pageWrapper = this.createPageElement(i)
            this.app.container.appendChild(pageWrapper)

            const canvas = pageWrapper.querySelector('.pdf-canvas')
            const context = canvas.getContext('2d')

            const viewport = page.getViewport({ scale: this.scale })
            canvas.height = viewport.height
            canvas.width = viewport.width

            await page.render({ canvasContext: context, viewport }).promise

            this.app.createAnnotationLayers(pageWrapper, i, viewport.width, viewport.height)
            this.app.createCaptureOverlay(pageWrapper, i, viewport.width, viewport.height)
            this.app.redrawStamps(i)

            // After first page: show UI and ruler immediately so user doesn't wait for full PDF
            if (i === 1) {
                this.showMainUI()
                this.app.updateJumpLinePosition()
                this.app.updateRulerPosition()
                this.app.updateRulerClip()
                this.app.computeNextTarget()
                this.app.updateRulerMarks()
            }
        }

        // Final ruler update after all pages are rendered (catches anchors on later pages)
        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
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

    async changeZoom(delta) {
        this.scale = Math.min(Math.max(0.5, this.scale + delta), 4)
        this.updateZoomDisplay()

        if (this.pdf) await this.renderPDF()
        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
    }

    async fitToWidth() {
        if (!this.pdf) return
        const page = await this.pdf.getPage(1)
        const naturalWidth = page.getViewport({ scale: 1 }).width
        const rulerW = this.app.rulerVisible ? (parseInt(getComputedStyle(document.getElementById('jump-ruler')).width) || 28) : 0
        const availW = this.app.viewer.clientWidth - rulerW - 8 // 8px breathing room
        this.scale = Math.min(Math.max(0.5, availW / naturalWidth), 4)
        this.updateZoomDisplay()

        await this.renderPDF()
        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
    }

    async fitToHeight() {
        if (!this.pdf) return
        const page = await this.pdf.getPage(1)
        const naturalHeight = page.getViewport({ scale: 1 }).height
        const availH = this.app.viewer.clientHeight - 16 // 16px breathing room
        this.scale = Math.min(Math.max(0.5, availH / naturalHeight), 4)
        this.updateZoomDisplay()

        await this.renderPDF()
        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
    }

    updateZoomDisplay() {
        if (this.app.zoomLevelDisplay) {
            this.app.zoomLevelDisplay.textContent = `${Math.round(this.scale * 100)}%`
        }
    }



    showMainUI() {
        // Reveal toolbars once a score is loaded
        ;['floating-doc-bar', 'layer-toggle-fab'].forEach(id => {
            const el = document.getElementById(id)
            if (el) el.classList.remove('hidden')
        })
        // Ruler respects the saved toggle state
        const ruler = document.getElementById('jump-ruler')
        if (ruler) {
            if (this.app.rulerVisible) {
                ruler.classList.remove('hidden')
                ruler.style.display = 'block'
            } else {
                ruler.classList.add('hidden')
                ruler.style.display = ''
            }
        }
        if (this.app.btnRulerToggle) this.app.btnRulerToggle.classList.toggle('active', this.app.rulerVisible)

        // Stamp palette starts collapsed — user opens via button or double-tap
        if (this.app.activeToolsContainer) {
            this.app.activeToolsContainer.classList.remove('expanded')
            this.app.updateActiveTools()
        }
    }

    hideWelcome() {
        const screen = document.querySelector('.welcome-screen')
        if (screen) screen.classList.add('hidden')
    }

    async checkInitialView() {
        if (this.pdf) {
            this.hideWelcome()
            return
        }

        const screen = document.querySelector('.welcome-screen')
        if (screen) screen.classList.remove('hidden')

        if (this.app.welcomeView) {
            this.app.welcomeView.classList.remove('hidden')
            this.app.renderWelcomeRecentScores()
        }
    }

    async closeFile() {
        this.activeScoreName = null
        this.pdf = null

        if (this.app.container) this.app.container.querySelectorAll('.page-container').forEach(el => el.remove())
        if (this.app.layerShelf) this.app.layerShelf.classList.remove('active')
        if (this.app.sidebar) this.app.sidebar.classList.remove('open')
        if (this.app.activeToolsContainer) this.app.activeToolsContainer.classList.remove('expanded')

            ;['floating-doc-bar', 'jump-ruler', 'layer-toggle-fab'].forEach(id => {
                const el = document.getElementById(id)
                if (el) el.classList.add('hidden')
            })

        this.checkInitialView()
    }
}
