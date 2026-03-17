import * as db from '../db.js'
import * as pdfjsLib from 'pdfjs-dist'
import { computeFingerprint } from '../fingerprint.js'

export class ViewerManager {
    constructor(app) {
        this.app = app
        this.pdf = null
        this.pages = []
        this.scale = 1.5
        this.pdfFingerprint = null
        this.activeScoreName = null
        this.observer = null
        this._pageViewports = {} // Cache viewports for placeholder sizing
        this._pageMetrics = {}   // Cache offsetTop and clientHeight to avoid layout thrashing
        this.isFitToHeight = false
        this.isApplyingZoom = false  // blocks touch gestures during zoom/re-render
        this.latestLoadingId = 0 // Race condition protection
        this.baseNaturalWidth = 0 // Reference width for uniform rendering
    }

    init() {
        // Redundant listener removed. Listeners are now attached in main.js initElements.
        // Initialize IntersectionObserver for Lazy Rendering
        this._renderQueue = []
        this._activeRenderCount = 0
        this._maxActiveRenders = 2 // Limit simultaneous renders to prevent UI lag

        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const pageNum = parseInt(entry.target.dataset.page)
                    if (entry.target.dataset.rendered === 'false') {
                        this.enqueueRender(pageNum, entry.target)
                    }
                }
            })
        }, {
            rootMargin: '1000px 0px', // More aggressive pre-rendering (1000px)
            threshold: 0.01
        })

        // Track scroll position for persistence
        if (this.app.viewer) {
            let scrollTimer;
            this.app.viewer.addEventListener('scroll', () => {
                clearTimeout(scrollTimer);
                scrollTimer = setTimeout(async () => {
                    if (this.pdfFingerprint && this.app.scoreDetailManager) {
                        this.app.scoreDetailManager.currentInfo.lastScrollTop = this.app.viewer.scrollTop;
                        // Silent save (don't mark as unsynced for just scroll)
                        await this.app.scoreDetailManager.save(this.pdfFingerprint);
                    }
                }, 1000); // Debounce save to every 1 second
            }, { passive: true });
        }
    }

    async handleUpload(e) {
        const file = e.target.files[0]
        if (!file) return

        if (this.app.showMessage) {
            this.app.showMessage(`正在讀取檔案: ${file.name}...`, 'system')
        }

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
                if (!buffer || buffer.byteLength === 0) {
                    console.error('[ViewerManager] Empty buffer from FileReader');
                    cleanup();
                    alert('讀取文件失敗：數據長度為 0。');
                    return;
                }
                try {
                    // Pass a slice to db.set to avoid detaching the main buffer
                    await db.set(`recent_buf_${file.name}`, buffer.slice(0))
                    // Ensure we pass a clean Uint8Array to loadPDF
                    await this.loadPDF(new Uint8Array(buffer), file.name)
                } catch (pdfErr) {
                    console.error('[ViewerManager] handleUpload failed:', pdfErr)
                    let msg = pdfErr.message || pdfErr.toString()
                    if (msg.includes('InvalidPDFException')) {
                        alert(`解析 PDF 失敗：此檔案似乎不是有效的 PDF 或已損毀。\n(${file.name})`)
                    } else {
                        alert(`無法開啟樂譜：${msg}`)
                    }
                } finally {
                    cleanup()
                }
            }
            reader.readAsArrayBuffer(file)
        } catch (err) {
            console.error('General upload error:', err)
            cleanup()
        } finally {
            // Only clear if this is the transient uploader (not the one in Score Library)
            // Actually, we should only clear it once all listeners have had a chance.
            // For now, let's just make sure we don't clear it IF it's likely to be used by ScoreManager.
            if (!e.target.closest('.btn-import-wrapper')) {
                e.target.value = ''
            }
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
        return computeFingerprint(buffer);
    }

    async loadPDF(data, filename = null) {
        const loadingId = ++this.latestLoadingId;
        console.log(`[ViewerManager] loadPDF started (id: ${loadingId}) for: ${filename || 'unknown'}`);

        if (filename) this.activeScoreName = filename;
        this.isFitToHeight = false;
        this._pageMetrics = {};

        // Only save current session data if a PDF was actually active.
        // This prevents wiping out IndexedDB data if we have a fingerprint but haven't loaded stamps yet (e.g., after refresh).
        if (this.pdf && this.pdfFingerprint) {
            await this.app.saveToStorage()
        }

        if (filename) {
            this.app.addToRecentSoloScores(filename)
            await this.app.saveToStorage()
        }

        let uint8Data;
        if (data instanceof Uint8Array) {
            uint8Data = data;
        } else if (data instanceof ArrayBuffer) {
            uint8Data = new Uint8Array(data);
        } else if (data instanceof Blob) {
            uint8Data = new Uint8Array(await data.arrayBuffer());
        } else {
            console.error('[ViewerManager] Unsupported data type for loadPDF:', typeof data);
            throw new Error('Unsupported data type');
        }

        if (loadingId !== this.latestLoadingId) return;

        const newFingerprint = await this.getFingerprint(uint8Data)

        if (loadingId !== this.latestLoadingId) return;

        console.log(`[ViewerManager] Fingerprint: ${newFingerprint.slice(0, 8)}...`);
        this.pdfFingerprint = newFingerprint
        this.app.btnScoreDetailToggle?.removeAttribute('disabled')
        this.app.jumpManager?.loadBookmarks()

        await this.loadStamps(newFingerprint);
        this.app.jumpHistory = []

        // Notify GistShareManager in case a share link is pending PDF upload
        this.app.gistShareManager?.onPdfLoaded(newFingerprint)

        if (this.app.updateScoreDetailUI) {
            this.app.updateScoreDetailUI(newFingerprint)
        }

        const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/')
        const loadingTask = pdfjsLib.getDocument({
            data: uint8Data,
            cMapUrl: new URL('pdfjs/cmaps/', baseUrl).href,
            cMapPacked: true,
            standardFontDataUrl: new URL('pdfjs/standard_fonts/', baseUrl).href,
            jbig2WasmUrl: new URL('pdfjs/wasm/jbig2.wasm', baseUrl).href,
            wasmUrl: new URL('pdfjs/wasm/', baseUrl).href,
            isEvalSupported: false,
            stopAtErrors: false
        })

        try {
            const pdf = await loadingTask.promise;
            if (loadingId !== this.latestLoadingId) {
                console.log(`[ViewerManager] loadPDF id ${loadingId} superseded by ${this.latestLoadingId}. Skipping render.`);
                return;
            }
            this.pdf = pdf;
            console.log(`[ViewerManager] PDF.js success. Pages: ${this.pdf.numPages}`);

            // Auto-detect system stamps in background if none exist
            const hasSystems = this.app.stamps.some(s => s.type === 'system' && !s.deleted)
            if (!hasSystems && this.app.staffDetector) {
                this.app.staffDetector.autoDetect(this.pdf, (page, total) => {
                    this.app.showToast?.(`正在分析樂譜結構... ${page} / ${total}`)
                })
            }
        } catch (err) {
            if (loadingId !== this.latestLoadingId) return;
            console.error('[ViewerManager] PDF.js failed to load document:', err);
            if (err.name === 'InvalidPDFException') {
                throw new Error('InvalidPDFException: 樂譜檔案格式損毀或無效 (Invalid PDF structure)');
            }
            throw err;
        }

        this.showMainUI()
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
        
        // Initial render: Pass true to enable scroll restoration from DB
        if (isTouch) {
            await this.fitToWidth(true)
        } else {
            await this.fitToHeight(true)
        }

        this.app.updateJumpLinePosition()
        this.app.updateRulerClip()
        this.updateFloatingTitle()
    }

    /**
     * Load stamps (annotations) for a specific fingerprint from IndexedDB.
     */
    async loadStamps(fingerprint) {
        if (!fingerprint) return;
        const rawStamps = (await db.get(`stamps_${fingerprint}`)) || []
        const now = Date.now()
        
        console.log(`[ViewerManager] loadStamps: Available Sources:`, this.app.sources.map(s => `${s.name}(${s.id})`));
        
        this.app.stamps = rawStamps.filter(s => !s.deleted).map(s => {
            const sNew = { ...s };
            
            // Layer ID Migration (Legacy cleanup)
            if (sNew.layerId === 'performance') sNew.layerId = 'text'
            if (sNew.layerId === 'other' || sNew.layerId === 'anchor' || sNew.layerId === 'layout') sNew.layerId = 'others'
            if (!this.app.layers.find(l => l.id === sNew.layerId)) sNew.layerId = 'draw'

            // Aggressive Source ID Healing: 
            // If the sourceId is missing OR doesn't exist in our known sources, it will be hidden.
            // We heal it to the active interpretation so it becomes visible.
            const sourceExists = this.app.sources.some(src => src.id === sNew.sourceId);
            if (!sNew.sourceId || !sourceExists || sNew.sourceId === 'p1') {
                const oldId = sNew.sourceId;
                sNew.sourceId = this.app.activeSourceId;
                if (oldId && oldId !== sNew.sourceId) {
                    console.log(`[ViewerManager] Healing stamp ${sNew.id}: source ${oldId} -> ${sNew.sourceId}`);
                }
            }
            
            if (!sNew.id) sNew.id = `stamp-${now}-${Math.random().toString(36).slice(2, 9)}`;
            if (!sNew.createdAt) sNew.createdAt = now;
            if (!sNew.updatedAt) sNew.updatedAt = now;
            
            return sNew;
        })
        
        console.log(`[ViewerManager] loadStamps: Parsed ${this.app.stamps.length} stamps for ${fingerprint.slice(0, 8)}`);
        if (this.app.stamps.length > 0) {
            const first = this.app.stamps[0];
            console.log(`[ViewerManager] First stamp:`, {
                id: first.id,
                type: first.type,
                page: first.page,
                sourceId: first.sourceId,
                layerId: first.layerId,
                x: first.x,
                y: first.y
            });
        }
    }

    async updateFloatingTitle() {
        if (!this.app.floatingScoreTitle) return;
        
        if (!this.pdf || !this.pdfFingerprint) {
            this.app.floatingScoreTitle.classList.remove('active');
            return;
        }

        let displayName = "";
        if (this.app.scoreDetailManager) {
            const meta = await this.app.scoreDetailManager.getMetadata(this.pdfFingerprint);
            displayName = meta?.name || "";
        }
        
        if (!displayName) {
            displayName = this.activeScoreName ? this.activeScoreName.replace(/\.pdf$/i, '') : "Untitled";
        }

        this.app.floatingScoreTitle.textContent = displayName;
        this.app.floatingScoreTitle.classList.add('active');
    }


    /**
     * Captures the current focal point (page and relative offset) to preserve view during zoom.
     */
    _captureFocalPoint() {
        if (!this.app.viewer || !this.pdf) return null
        const scrollTop = this.app.viewer.scrollTop
        const viewportH = this.app.viewer.clientHeight
        const focalY = scrollTop + (viewportH / 3) // Focal point is top 1/3 of screen

        const metrics = this._pageMetrics
        let targetPage = 1
        let offsetRatio = 0

        // Find which page contains the focal point
        for (const pageNum in metrics) {
            const m = metrics[pageNum]
            if (focalY >= m.top && focalY <= m.top + m.height) {
                targetPage = parseInt(pageNum)
                offsetRatio = (focalY - m.top) / m.height
                break
            }
        }
        return { page: targetPage, ratio: offsetRatio }
    }

    /**
     * Restores the focal point after a scale change.
     */
    _restoreFocalPoint(focalPoint) {
        if (!focalPoint || !this.app.viewer) return
        this.updatePageMetrics() // Ensure latest metrics are used
        const m = this._pageMetrics[focalPoint.page]
        if (!m) return

        const viewportH = this.app.viewer.clientHeight
        const newFocalY = m.top + (focalPoint.ratio * m.height)
        const newScrollTop = Math.max(0, newFocalY - (viewportH / 3))

        this.app.viewer.scrollTop = newScrollTop
        console.log(`[ViewerManager] Restored focal point to page ${focalPoint.page} at ${Math.round(focalPoint.ratio * 100)}%`)
    }

    async renderPDF(isInitialLoad = false) {
        console.log(`[ViewerManager] renderPDF started. PDF defined: ${!!this.pdf}`);
        if (!this.pdf) return

        // Hide welcome screen and remove only PDF pages
        const welcomeScreen = document.querySelector('.welcome-screen')
        if (welcomeScreen) welcomeScreen.classList.add('hidden')

        // 0. Safety Check for Observer
        if (!this.observer) {
            console.warn('[ViewerManager] Observer not initialized, calling init()...')
            this.init()
        }

        this.app.container.querySelectorAll('.page-container').forEach(el => {
            if (this.observer) this.observer.unobserve(el)
            el.remove()
        })
        this.pages = []
        this._pageViewports = {}
        this._pageCache = {} // Cache for PDFPageProxy objects

        const numPages = this.pdf.numPages
        const pageIndices = Array.from({ length: numPages }, (_, i) => i + 1)

        // 1. Get ONLY the first page to determine typical layout/scale
        const firstPage = await this.pdf.getPage(1)
        const firstNaturalViewport = firstPage.getViewport({ scale: 1.0 })
        this.baseNaturalWidth = firstNaturalViewport.width

        const firstViewport = firstPage.getViewport({ scale: this.scale })
        const aspect = firstViewport.width / firstViewport.height
        this._pageCache[1] = firstPage
        this._pageViewports[1] = firstViewport

        // 2. Create Page Containers immediately with estimated sizes
        const containers = pageIndices.map(i => {
            const pageWrapper = this.createPageElement(i)
            pageWrapper.dataset.rendered = 'false'
            
            // Initial estimation based on first page (most scores have uniform page sizes)
            pageWrapper.style.minHeight = `${firstViewport.height}px`
            pageWrapper.style.width = `${firstViewport.width}px`
            
            this.app.container.appendChild(pageWrapper)
            this.observer.observe(pageWrapper)
            return pageWrapper
        })

        // Initial UI updates for first page
        this.showMainUI()
        this.app.updateJumpLinePosition()
        this.app.updateRulerPosition()
        this.app.updateRulerClip()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()

        // 3. Update cached metrics once after initial layout
        this.updatePageMetrics()

        // Ensure scroll restoration ONLY on initial file load
        if (isInitialLoad && this.app.viewer) {
            const savedScroll = this.app.scoreDetailManager?.currentInfo?.lastScrollTop || 0;
            this.app.viewer.scrollTop = savedScroll;
            this.app.viewer.scrollLeft = 0;
            console.log(`[ViewerManager] Initial load: Restored scroll to ${savedScroll}`);
        }

        if (this.app.inputManager) this.app.inputManager.updateDividerPositions()
        console.log(`[ViewerManager] renderPDF layout completed for ${numPages} pages.`);
    }

    /**
     * Priority render request (e.g., from a Jump action)
     */
    async ensurePageRendered(pageNum) {
        if (!this.pdf) return
        const wrapper = document.querySelector(`.page-container[data-page="${pageNum}"]`)
        if (wrapper && wrapper.dataset.rendered === 'false') {
            console.log(`[ViewerManager] High priority render for page ${pageNum}`)
            // Bypass queue for high priority jumps
            await this.renderPage(pageNum, wrapper)
        }
    }

    /**
     * Managed queue for background rendering
     */
    enqueueRender(pageNum, wrapper) {
        if (this._renderQueue.some(item => item.pageNum === pageNum)) return
        this._renderQueue.push({ pageNum, wrapper })
        this.processQueue()
    }

    async processQueue() {
        if (this._activeRenderCount >= this._maxActiveRenders || this._renderQueue.length === 0) return

        const { pageNum, wrapper } = this._renderQueue.shift()
        this._activeRenderCount++

        try {
            await this.renderPage(pageNum, wrapper)
        } finally {
            this._activeRenderCount--
            this.processQueue()
        }
    }

    /**
     * The actual rendering logic called by IntersectionObserver
     */
    async renderPage(pageNum, wrapper) {
        if (!this.pdf || wrapper.dataset.rendered === 'true') return
        
        // Prevent multiple simultaneous render calls for the same page
        if (wrapper.dataset.rendering === 'true') return
        wrapper.dataset.rendering = 'true'

        try {
            // Use cache or fetch page
            let page = this._pageCache[pageNum]
            if (!page) {
                page = await this.pdf.getPage(pageNum)
                this._pageCache[pageNum] = page
            }

            // Guard: wrapper may have been removed from DOM while awaiting
            if (!wrapper.isConnected) return

            const canvas = wrapper.querySelector('.pdf-canvas')
            if (!canvas) return

            const context = canvas.getContext('2d', { alpha: false })
            // iOS limits simultaneous canvas contexts; getContext returns null when exceeded
            if (!context) {
                console.warn(`[ViewerManager] No 2D context for page ${pageNum}, will retry`)
                wrapper.dataset.rendering = 'false'
                setTimeout(() => this.enqueueRender(pageNum, wrapper), 1000)
                return
            }
            
            // Calculate specific scale to match baseNaturalWidth * global scale
            const naturalViewport = page.getViewport({ scale: 1.0 })
            const targetWidth = this.baseNaturalWidth * this.scale
            const specificScale = targetWidth / naturalViewport.width
            const viewport = page.getViewport({ scale: specificScale })

            // Page scale calculation for annotations
            this.app.pageScales[pageNum] = naturalViewport.width / 595.0

            // Update viewport cache and wrapper size in case it differs from the first page
            this._pageViewports[pageNum] = viewport
            wrapper.style.minHeight = `${viewport.height}px`
            wrapper.style.width = `${viewport.width}px`

            canvas.height = viewport.height
            canvas.width = viewport.width

            const renderTask = page.render({ 
                canvasContext: context, 
                viewport,
                intent: 'display'
            })

            await renderTask.promise

            // Attach annotation layers once the real canvas is ready
            this.app.createAnnotationLayers(wrapper, pageNum, viewport.width, viewport.height)
            this.app.createCaptureOverlay(wrapper, pageNum, viewport.width, viewport.height)
            this.app.redrawStamps(pageNum)

            wrapper.dataset.rendered = 'true'
            console.log(`[ViewerManager] Page ${pageNum} rendered lazily.`)
        } catch (err) {
            // PDF.js throws a plain object when a render is cancelled (e.g. zoom change mid-flight)
            if (err?.name === 'RenderingCancelledException') return
            console.error(`[ViewerManager] Lazy render failed for page ${pageNum}:`, err)
        } finally {
            wrapper.dataset.rendering = 'false'
        }
    }

    /**
     * Efficiently capture all page offsets and heights to avoid continuous getBoundingClientRect/offsetTop calls.
     * Call this after renderPDF, resize, or zoom change.
     */
    updatePageMetrics() {
        if (!this.app.container) return
        this._pageMetrics = {}
        const containers = this.app.container.querySelectorAll('.page-container')
        containers.forEach(el => {
            const pageNum = parseInt(el.dataset.page)
            if (pageNum) {
                this._pageMetrics[pageNum] = {
                    top: el.offsetTop,
                    height: el.clientHeight
                }
            }
        })
        console.log(`[ViewerManager] Cached metrics for ${Object.keys(this._pageMetrics).length} pages.`)
    }

    createPageElement(pageNum) {
        const div = document.createElement('div')
        div.className = 'page-container'
        div.dataset.page = pageNum
        // Ensure centering and full width availability for Fit to Width
        div.style.display = 'flex'
        div.style.justifyContent = 'center'
        div.style.width = '100%'

        div.innerHTML = `<canvas class="pdf-canvas"></canvas>`
        return div
    }

    createAnnotationLayers(wrapper, pageNum, width, height) {
        // Find or create annotation layer
        let canvas = wrapper.querySelector('.annotation-layer')
        if (!canvas) {
            canvas = document.createElement('canvas')
            canvas.className = 'annotation-layer virtual-canvas'
            canvas.dataset.page = pageNum
            wrapper.appendChild(canvas)
        }
        canvas.width = width
        canvas.height = height
    }

    async changeZoom(delta) {
        const focalPoint = this._captureFocalPoint()
        this.scale = Math.min(Math.max(0.2, this.scale + delta), 4)
        this.isFitToHeight = false
        this.updateZoomDisplay()

        if (this.pdf) {
            await this.renderPDF(false) // Not initial load
            this._restoreFocalPoint(focalPoint)
        }
        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
    }

    async fitToWidth(isInitialLoad = false) {
        if (!this.pdf) return
        const focalPoint = isInitialLoad ? null : this._captureFocalPoint()

        const page = await this.pdf.getPage(1)
        const naturalWidth = page.getViewport({ scale: 1 }).width

        // Use full viewer width — the ruler is an overlay on the PDF left margin,
        // not a layout element, so it doesn't reduce available content width.
        const availW = this.app.viewer.clientWidth
        this.scale = Math.min(Math.max(0.2, availW / naturalWidth), 4)
        this.isFitToHeight = false
        this.updateZoomDisplay()

        await this.renderPDF(isInitialLoad)
        
        if (!isInitialLoad) {
            this._restoreFocalPoint(focalPoint)
        }

        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
    }

    async fitToHeight(isInitialLoad = false) {
        if (!this.pdf) return

        // Capture current page BEFORE re-render (scale-independent)
        let targetPage = 1
        if (!isInitialLoad) {
            const scrollTop = this.app.viewer.scrollTop
            for (const [num, m] of Object.entries(this._pageMetrics)) {
                if (scrollTop >= m.top && scrollTop < m.top + m.height) {
                    targetPage = parseInt(num)
                    break
                }
            }
        }

        const page = await this.pdf.getPage(1)
        const naturalHeight = page.getViewport({ scale: 1 }).height

        const availH = this.app.viewer.clientHeight
        this.scale = Math.min(Math.max(0.2, availH / naturalHeight), 4)
        this.isFitToHeight = true
        this.updateZoomDisplay()

        // Block touch gestures during the re-render window (prevents iOS ghost-tap jumps)
        this.isApplyingZoom = true
        await this.renderPDF(isInitialLoad)

        if (!isInitialLoad) {
            this.updatePageMetrics()
            const m = this._pageMetrics[targetPage]
            if (m) {
                // Briefly disable overflow to stop any iOS momentum scroll, then snap to page top
                this.app.viewer.style.overflowY = 'hidden'
                this.app.viewer.scrollTop = m.top
                requestAnimationFrame(() => {
                    this.app.viewer.style.overflowY = ''
                })
            }
        }

        setTimeout(() => { this.isApplyingZoom = false }, 800)

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
        // Ruler respects the saved toggle state — delegate to rulerManager to avoid duplication
        this.app.updateRulerPosition()
        if (this.app.btnRulerToggle) this.app.btnRulerToggle.classList.toggle('active', this.app.rulerVisible)

        // Stamp palette starts collapsed — user opens via button or double-tap
        if (this.app.toolManager) {
            this.app.toolManager.toggleStampPalette(null, null, false)
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
        }
    }

    async closeFile() {
        this.activeScoreName = null
        this.pdf = null

        if (this.app.container) {
            this.app.container.querySelectorAll('.page-container').forEach(el => {
                if (this.observer) this.observer.unobserve(el)
                el.remove()
            })
        }
        if (this.app.layerShelf) this.app.layerShelf.classList.remove('active')
        if (this.app.sidebar) this.app.sidebar.classList.remove('open')
        if (this.app.activeToolsContainer) this.app.activeToolsContainer.classList.remove('expanded')

            ;['floating-doc-bar', 'jump-ruler', 'layer-toggle-fab'].forEach(id => {
                const el = document.getElementById(id)
                if (el) el.classList.add('hidden')
            })

        this.checkInitialView()
        
        // --- ADDED: Immediately trigger sync when entering workspace ---
        if (this.app.driveSyncManager && this.app.driveSyncManager.isEnabled) {
            console.log('[ViewerManager] Triggering DriveSync on PDF load');
            this.app.driveSyncManager.sync();
        }
        this.updateFloatingTitle();
    }
}
