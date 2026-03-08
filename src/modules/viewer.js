import * as pdfjsLib from 'pdfjs-dist'
import * as db from '../db.js'

export class ViewerManager {
    constructor(app) {
        this.app = app
        this.pdf = null
        this.pages = []
        this.scale = 1.5
        this.activeScoreName = null
        this.pdfFingerprint = null
    }

    updateZoomDisplay() {
        if (this.app.zoomLevelDisplay) {
            this.app.zoomLevelDisplay.textContent = `${Math.round(this.scale * 100)}%`
        }
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
        const availW = this.app.viewer.clientWidth - rulerW - 8
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
        const availH = this.app.viewer.clientHeight - 16
        this.scale = Math.min(Math.max(0.5, availH / naturalHeight), 4)
        this.updateZoomDisplay()
        await this.renderPDF()
        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
    }

    async getFingerprint(buffer) {
        if (window.isSecureContext && crypto.subtle) {
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
            const hashArray = Array.from(new Uint8Array(hashBuffer))
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
        }
        const bytes = new Uint8Array(buffer)
        let hash = 5381
        for (let i = 0; i < bytes.length; i += 64) {
            hash = ((hash << 5) + hash) ^ bytes[i]
            hash = hash >>> 0
        }
        return 'fallback_' + hash.toString(16) + '_' + bytes.length
    }

    async loadPDF(data) {
        if (this.pdfFingerprint) {
            this.app.saveToStorage()
        }
        const newFingerprint = await this.getFingerprint(data.buffer || data)
        this.pdfFingerprint = newFingerprint
        this.app.pdfFingerprint = newFingerprint

        const savedStamps = localStorage.getItem(`scoreflow_stamps_${newFingerprint}`)
        this.app.stamps = savedStamps ? JSON.parse(savedStamps) : []
        this.app.jumpHistory = []

        const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/')
        const pdfjsDir = new URL('pdfjs/', baseUrl).href

        const loadingTask = pdfjsLib.getDocument({
            data: data,
            cMapUrl: new URL('pdfjs/cmaps/', baseUrl).href,
            cMapPacked: true,
            standardFontDataUrl: new URL('pdfjs/standard_fonts/', baseUrl).href,
            jbig2WasmUrl: new URL('pdfjs/jbig2.wasm', baseUrl).href,
            wasmUrl: pdfjsDir,
            isEvalSupported: false,
            stopAtErrors: false
        })

        this.pdf = await loadingTask.promise
        this.app.pdf = this.pdf
        console.log(`PDF loaded. Pages: ${this.pdf.numPages}, Fingerprint: ${newFingerprint.slice(0, 8)}...`)

        this.app.showMainUI()
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
        if (isTouch) {
            setTimeout(async () => {
                await this.fitToWidth()
                this.app.updateJumpLinePosition()
                this.app.updateRulerClip()
            }, 60)
        } else {
            await this.fitToHeight()
            this.app.updateJumpLinePosition()
            this.app.updateRulerClip()
        }
    }

    async renderPDF() {
        const welcomeScreen = document.querySelector('.welcome-screen')
        if (welcomeScreen) welcomeScreen.classList.add('hidden')

        this.app.container.querySelectorAll('.page-container').forEach(el => el.remove())
        this.pages = []

        for (let i = 1; i <= this.pdf.numPages; i++) {
            const page = await this.pdf.getPage(i)
            const pageWrapper = this.app.createPageElement(i)
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

            if (i === 1) {
                this.app.showMainUI()
                this.app.updateJumpLinePosition()
                this.app.updateRulerPosition()
                this.app.updateRulerClip()
                this.app.computeNextTarget()
                this.app.updateRulerMarks()
            }
        }
        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
    }

    async handleUpload(e) {
        const file = e.target.files[0]
        if (!file) return

        const loaderId = 'ipad-upload-loader'
        let loader = document.getElementById(loaderId)
        if (!loader) {
            loader = document.createElement('div')
            loader.id = loaderId
            loader.style = 'position:fixed;top:0;left:0;width:100%;height:100vh;background:rgba(0,0,0,0.8);color:white;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:99999;font-family:Outfit,sans-serif;'
            document.body.appendChild(loader)
        }
        loader.innerHTML = `
      <div style="border:4px solid rgba(255,255,255,0.2);border-top:4px solid #3b82f6;border-radius:50%;width:50px;height:50px;animation:spin 1s linear infinite;margin-bottom:20px;"></div>
      <style>@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}</style>
      <h2 style="font-weight:400;margin:0;text-align:center;padding:0 20px;">Opening ${file.name}...</h2>
    `
        loader.style.display = 'flex'

        const cleanup = () => { if (loader) loader.style.display = 'none' }

        try {
            const reader = new FileReader()
            reader.onerror = cleanup
            reader.onload = async (event) => {
                const buffer = event.target.result
                try {
                    await db.set(`recent_buf_${file.name}`, buffer.slice(0))
                    await this.loadPDF(new Uint8Array(buffer))
                    this.activeScoreName = file.name
                    this.app.activeScoreName = file.name
                    this.app.addToRecentSoloScores(file.name)
                    this.app.saveToStorage()
                    this.app.renderLibrary()
                } catch (err) {
                    console.error(err)
                } finally {
                    cleanup()
                }
            }
            reader.readAsArrayBuffer(file)
        } catch (err) {
            cleanup()
        } finally {
            e.target.value = ''
        }
    }

    async closeFile() {
        this.pdf = null
        this.app.pdf = null
        this.activeScoreName = null
        this.app.activeScoreName = null

        if (this.app.container) this.app.container.querySelectorAll('.page-container').forEach(el => el.remove())
        if (this.app.layerShelf) this.app.layerShelf.classList.remove('active')
        if (this.app.activeToolsContainer) this.app.activeToolsContainer.classList.remove('expanded')

        this.app.showMainUI()
    }
}
