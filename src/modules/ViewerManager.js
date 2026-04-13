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
        this.isFitToWidth  = false
        this.isApplyingZoom = false  // blocks touch gestures during zoom/re-render
        this.latestLoadingId = 0 // Race condition protection
        this._loadingPdf = false // True while any loadPDF is actively in progress
        this.baseNaturalWidth = 0 // Reference width for uniform rendering
        this._staleContainers = [] // Buffer for double-buffering (flash-free zoom)
        this.pdfMetadata = null // Technical info (pages, dimensions, producer)
    }

    init() {
        // Initialize PDF.js Worker using Vite base URL for GitHub Pages compatibility
        const base = import.meta.env.BASE_URL || '/'
        pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdfjs/pdf.worker.min.mjs';
        console.log('[ViewerManager] PDF.js Worker initialized at:', pdfjsLib.GlobalWorkerOptions.workerSrc);

        // Initialize rendering queue
        this._renderQueue = []
        this._activeRenderCount = 0
        this._maxActiveRenders = 2 // Keep low on iPad to avoid memory pressure

        // Bitmap cache: stores rendered page bitmaps for instant re-render
        this._bitmapCache = {}

        // Initialize IntersectionObserver for Lazy Rendering and Virtualization (Memory Cleanup)
        // 1200px rootMargin ensures pages start rendering ~1 full page before becoming visible,
        // eliminating white-flash on scroll and jump navigation.
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const pageNum = parseInt(entry.target.dataset.page)
                if (entry.isIntersecting) {
                    if (entry.target.dataset.rendered === 'false') {
                        this.enqueueRender(pageNum, entry.target)
                    }
                } else {
                    // OFF-SCREEN VIRTUALIZATION:
                    // Only unrender pages well outside the rootMargin to avoid thrashing.
                    const rect = entry.boundingClientRect;
                    const vh = window.innerHeight;
                    if (entry.target.dataset.rendered === 'true' && (rect.bottom < -4000 || rect.top > vh + 4000)) {
                        this.unrenderPage(pageNum, entry.target);
                    }
                }
            })
        }, {
            rootMargin: '2000px 0px',
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
            const buffer = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (event) => resolve(event.target.result);
                reader.onerror = (err) => reject(err);
                reader.readAsArrayBuffer(file);
            });

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

    async loadPDF(data, filename = null, expectedFp = null) {
        const loadingId = ++this.latestLoadingId;
        this._loadingPdf = true;
        console.log(`[ViewerManager] loadPDF started (id: ${loadingId}) for: ${filename || 'unknown'}`);

        // --- ATOMIC TRANSITION: Clear stale state immediately ---
        // If we know the target FP (switching from library), set it early so UI can update.
        // If it's a new upload, clear it so we don't show previous score info while hashing.
        this.pdf = null;
        this.pdfFingerprint = expectedFp || null;
        this.app.pdfFingerprint = expectedFp || null;
        this.app.stamps = []; // Clear stale annotations immediately
        
        if (filename) this.activeScoreName = filename;
        this.isFitToHeight = false;
        this.isFitToWidth  = false;
        this._pageMetrics = {};

        // Update UI to "Loading" or new Title immediately
        this.updateFloatingTitle();
        this.app.clearHistory(); // Isolated history per score
        if (this.app.scoreDetailManager && expectedFp) {
            this.app.scoreDetailManager.load(expectedFp);
        }

        // Only save current session data if we had a valid fingerprint before clearing
        // (This usually happens before calling loadPDF in the caller, but here is a safety)
        // Note: this.pdf was just cleared, but we mean "was there a pdf before"
        // In practice, ScoreManager handles the "Save before switch" logic.
        
        // --- End Atomic Transition ---

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

        // 2. Resolve Fingerprint
        let newFingerprint;
        if (expectedFp) {
            newFingerprint = expectedFp;
            console.log(`[ViewerManager] Fast-loading from library via expected fingerprint: ${expectedFp.slice(0, 8)}`);
        } else {
            console.log(`[ViewerManager] Calculating fingerprint...`);
            newFingerprint = await this.getFingerprint(uint8Data);
        }

        if (loadingId !== this.latestLoadingId) return;
        this.pdfFingerprint = newFingerprint;
        this.app.pdfFingerprint = newFingerprint;
        // Always persist the resolved fingerprint immediately — ensures restart restores correctly
        // even when no user interaction follows (e.g. boot restore with filename=null)
        localStorage.setItem('scoreflow_current_fingerprint', newFingerprint);

        // --- START PDF PARSING ---
        // Use absolute root paths for PDF.js assets (Compatible with both PWA and Capacitor root)
        console.log(`[ViewerManager] getDocument started with data size: ${uint8Data.length}`);
        
        const _base = import.meta.env.BASE_URL || '/'
        const loadingTask = pdfjsLib.getDocument({
            data: uint8Data,
            cMapUrl: _base + 'pdfjs/cmaps/',
            cMapPacked: true,
            standardFontDataUrl: _base + 'pdfjs/standard_fonts/',
            jbig2WasmUrl: _base + 'pdfjs/wasm/jbig2.wasm',
            wasmUrl: _base + 'pdfjs/wasm/',
            isEvalSupported: false,
            stopAtErrors: false,
            disableAutoFetch: true,
            disableStream: true,
            // Cap PDF.js internal OffscreenCanvas for image processing (e.g. high-DPI scanned PDFs).
            // Without this, PDF.js probes the browser and may create canvases > 67M px limit,
            // causing "Canvas area exceeds the maximum limit" errors.
            // 9M pixels × 4 bytes (RGBA) = 37,748,736 — matches our render canvas cap.
            canvasMaxAreaInBytes: 37748736,
        });
        
        // Add a timeout logger
        const timeout = setTimeout(() => {
            if (this._loadingPdf && loadingId === this.latestLoadingId) {
                console.warn('[ViewerManager] PDF Parsing is taking too long (>10s). Potential hang in PDF.js worker.');
            }
        }, 10000);

        if (loadingId !== this.latestLoadingId) return;
        // Proceed to Load DB Metadata & Stamps
        const dataPromise = (async () => {
            await Promise.all([
                this.app.persistenceManager.loadFromStorage(newFingerprint),
                this.loadStamps(newFingerprint)
            ]);
            
            this.app.renderSourceUI?.();
            this.app.renderLayerUI?.();
            this.app.btnScoreDetailToggle?.removeAttribute('disabled')
            this.app.jumpManager?.loadBookmarks()
            this.app.jumpHistory = []

            if (this.app.updateScoreDetailUI) {
                this.app.updateScoreDetailUI(newFingerprint);
            }

            // ✅ RACE CONDITION FIX: 在 loadStamps 完成後才啟動雲端雙向同步。
            // 舊邏輯：syncAnnotationsOnLoad 與 loadStamps 並行，後者可能在前者寫入 IDB 前讀到空資料
            // 並在完成時以空陣列覆寫 app.stamps，導致 annotation 消失。
            // 新邏輯：loadStamps 完成後 syncAnnotationsOnLoad 以 fire-and-forget 啟動，
            // 確保不會覆寫已正確設置的 app.stamps。
            if (this.app.supabaseManager?.user && loadingId === this.latestLoadingId) {
                this.app.supabaseManager.syncAnnotationsOnLoad(newFingerprint);
            }
        })();

        // 4. Background Storage Sync (PDF buffer upload + Realtime)
        if (this.app.supabaseManager?.user) {
            // Defer buffer copy to avoid blocking the main thread before PDF parsing completes
            const capturedData = uint8Data;
            (async () => {
                try {
                    await Promise.resolve(); // yield so PDF parsing can start
                    const uploadCopy = capturedData.slice(0);
                    const exists = await this.app.supabaseManager.checkPDFExists(newFingerprint);
                    if (!exists) {
                        await this.app.supabaseManager.uploadPDFBuffer(newFingerprint, uploadCopy);
                    }
                } catch (err) { console.error('[ViewerManager] BG Sync Error:', err); }
            })();
            
            // Supabase Realtime subscription for live changes during this session
            // (訂閱可立即建立，不需等 stamps 載入完成)
            this.app.supabaseManager.subscribeToAnnotations(newFingerprint);

            // NOTE: syncAnnotationsOnLoad 已移至 dataPromise 內（在 loadStamps 之後），
            // 不在此處呼叫，以避免與 loadStamps 產生 Race Condition。
        }

        // --- SAFE CACHE: Persist buffer to IndexedDB (fire-and-forget — must not block PDF load) ---
        // handleUpload already writes recent_buf_${filename}, so only write score_buf here.
        ;(async () => {
            try {
                if (filename) await db.set(`recent_buf_${filename}`, uint8Data);
                if (newFingerprint && !expectedFp) await db.set(`score_buf_${newFingerprint}`, uint8Data);
            } catch (err) { console.warn('[ViewerManager] Storage cache failed:', err); }
        })();

        // Final Wait: Ensure BOTH PDF parsing and Data loads are done
        try {
            const [pdf] = await Promise.all([loadingTask.promise, dataPromise]);
            clearTimeout(timeout);
            if (loadingId !== this.latestLoadingId) return;
            this.pdf = pdf;
            console.log(`[ViewerManager] Parallel Load Success. Pages: ${this.pdf.numPages}`);
            if (loadingId !== this.latestLoadingId) {
                console.log(`[ViewerManager] loadPDF id ${loadingId} superseded by ${this.latestLoadingId}. Skipping render.`);
                return;
            }
            this.pdf = pdf;
            console.log(`[ViewerManager] PDF.js success. Pages: ${this.pdf.numPages}`);

            // --- Technical Metadata Extraction ---
            try {
                const meta = await pdf.getMetadata();
                const page = await pdf.getPage(1);
                const vp = page.getViewport({ scale: 1.0 });
                this.pdfMetadata = {
                    pages: pdf.numPages,
                    widthPts: vp.width,
                    heightPts: vp.height,
                    producer: meta.info?.Producer || meta.info?.Creator || 'Unknown',
                    version: meta.info?.PDFFormatVersion || 'Unknown'
                };
            } catch (mErr) {
                console.warn('[ViewerManager] Metadata extraction failed:', mErr);
            }


        } catch (err) {
            clearTimeout(timeout);
            if (loadingId !== this.latestLoadingId) return;
            this._loadingPdf = false;
            console.error('[ViewerManager] PDF.js failed to load document:', err);
            // Non-blocking error indication (PWA standard)
            if (err.name === 'InvalidPDFException') {
                throw new Error('InvalidPDFException: 樂譜檔案格式損毀或無效 (Invalid PDF structure)');
            }
            throw err;
        }

        this.showMainUI()
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0)
        
        // Initial render: Honor reading mode first, then fall back to platform defaults
        if (this.app.readingMode === 'horizontal') {
            await this.fitToHeight(true)
        } else if (isTouch) {
            await this.fitToWidth(true)
        } else {
            await this.fitToHeight(true)
        }

        this.app.updateJumpLinePosition()
        this.app.updateRulerClip()
        this.updateFloatingTitle()
        this._loadingPdf = false;
    }

    /**
     * Load stamps (annotations) for a specific fingerprint from IndexedDB.
     */
    async loadStamps(fingerprint) {
        if (!fingerprint) return;
        const rawStamps = (await db.get(`stamps_${fingerprint}`)) || []
        const now = Date.now()
        
        // CRITICAL FIX: Ensure 'self' source always exists (for backward compatibility with old stamps)
        // If sources don't include 'self' but stamps do, add 'self' back to sources
        const hasSelfSource = this.app.sources.some(s => s.id === 'self');
        if (!hasSelfSource && rawStamps.some(s => s.sourceId === 'self')) {
            console.warn(`[ViewerManager] Restoring 'self' source — found stamps with sourceId:'self' but 'self' was removed from sources`);
            this.app.sources.unshift({ id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' });
        }
        
        console.log(`[ViewerManager] loadStamps: Available Sources:`, this.app.sources.map(s => `${s.name}(${s.id})`));
        
        this.app.stamps = rawStamps.filter(s => !s.deleted).map(s => {
            const sNew = { ...s };
            
            // Layer ID Migration (Legacy cleanup)
            if (sNew.layerId === 'performance') sNew.layerId = 'text'
            if (sNew.layerId === 'other' || sNew.layerId === 'anchor' || sNew.layerId === 'layout') sNew.layerId = 'others'
            
            // Healing: Try to recover type if it's generic 'system' or missing
            if (sNew.type === 'system' || !sNew.type) {
                if (sNew.points && sNew.points.length > 0) {
                    sNew.type = 'pen';
                    if (!sNew.layerId || sNew.layerId === 'others' || sNew.layerId === 'performance') sNew.layerId = 'draw';
                } else if (sNew.data && (sNew.layerId === 'text' || sNew.layerId === 'performance' || sNew.layerId === 'others')) {
                    sNew.type = 'text';
                    if (!sNew.layerId || sNew.layerId === 'others' || sNew.layerId === 'performance') sNew.layerId = 'text';
                } else if (sNew.draw && sNew.draw.type === 'text') {
                    sNew.type = 'text';
                    if (!sNew.layerId || sNew.layerId === 'others' || sNew.layerId === 'performance') sNew.layerId = 'text';
                } else if (sNew.draw && sNew.type !== 'anchor' && sNew.type !== 'measure') {
                    sNew.type = 'stamp';
                } else if (sNew.type === 'anchor' || sNew.type === 'measure') {
                    sNew.layerId = 'others';
                }
            }

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

            // Ensure x and y exist (default to 0) to prevent undefined logs/NaN
            if (sNew.x === undefined && !sNew.points) sNew.x = 0;
            if (sNew.y === undefined && !sNew.points) sNew.y = 0;

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
                x: first.x !== undefined ? first.x : 'N/A',
                y: first.y !== undefined ? first.y : 'N/A'
            });
        }
    }
    async updateFloatingTitle() {
        const fp = this.pdfFingerprint;
        const watermark = document.getElementById('sf-score-title-watermark');
        
        if (!fp) {
            let loadingName = "";
            if (this.activeScoreName) {
                loadingName = "Loading " + this.activeScoreName.replace(/\.pdf$/i, '') + "..."
                if (watermark) watermark.textContent = loadingName;
            } else {
                if (watermark) watermark.textContent = '';
            }
            this.app.dockingBarManager?.updateScoreName(loadingName.replace(/^⏳\s*/, ''));
            return;
        }

        let displayName = "";
        if (this.app.scoreDetailManager) {
            const meta = await this.app.scoreDetailManager.getMetadata(fp);
            displayName = meta?.name || "";
        }
        
        if (!displayName) {
            displayName = this.activeScoreName ? this.activeScoreName.replace(/\.pdf$/i, '') : "Opening Score...";
        }

        if (!this.pdf) displayName = "⏳ " + displayName;

        if (watermark) watermark.textContent = displayName;
        this.app.dockingBarManager?.updateScoreName(displayName.replace(/^⏳\s*/, ''));
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

        // --- DOUBLE BUFFERING (Seamless Zoom) ---
        // 先清掉上一批 stale（防止連續縮放時 DOM 無限累積）
        this.cleanupStale()

        // Instead of immediate removal, mark current containers as stale.
        // We only do this for Zoom/Resize (isInitialLoad === false).
        const existingPages = Array.from(this.app.container.querySelectorAll('.page-container:not(.is-stale)'))

        if (!isInitialLoad && existingPages.length > 0) {
            existingPages.forEach(el => {
                const staleTop = el.offsetTop
                el.classList.add('is-stale')
                el.removeAttribute('data-page') // Remove so jumps don't target stale containers
                el.style.pointerEvents = 'none' 
                el.style.zIndex = '1'
                el.style.position = 'absolute'
                el.style.top = `${staleTop}px`
                el.style.left = '0'
                el.style.right = '0'
                el.style.width = '100%'
                if (this.observer) this.observer.unobserve(el) // Release from observer immediately
                
                // If a ratio is provided, lock the visual scale on the stale page
                // so it doesn't jump when the viewer's container transform is reset.
                if (window.currentGestureRatio && window.currentGestureRatio !== 1) {
                    el.style.transform = `scale(${window.currentGestureRatio})`
                    el.style.transformOrigin = 'top center'
                }

                this._staleContainers.push(el)
            })
            // Safety timeout: remove stale containers if render callback doesn't fire
            setTimeout(() => this.cleanupStale(), 1500)
        } else {
            // Hard clear for new file uploads or initial load
            existingPages.forEach(el => {
                if (this.observer) this.observer.unobserve(el)
                el.remove()
            })
        }
        
        this.pages = []
        this._pageViewports = {}
        this._pageCache = {}      // Cache for PDFPageProxy objects
        this._bitmapCache = {}    // Cache for rendered page bitmaps (cleared on zoom change)
        this._usePersistedCache = isInitialLoad // Use IndexedDB cache only on initial/re-open (not zoom)

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
        const fragment = document.createDocumentFragment()
        const containers = pageIndices.map(i => {
            const pageWrapper = this.createPageElement(i)
            pageWrapper.dataset.rendered = 'false'
            
            // Temporary estimate until probed or rendered
            pageWrapper.style.minHeight = `${firstViewport.height}px`
            if (this.app.readingMode !== 'horizontal') {
                pageWrapper.style.width = `${firstViewport.width}px`
            }
            pageWrapper.style.zIndex = '2'
            pageWrapper.style.opacity = isInitialLoad ? '1' : '0'
            pageWrapper.style.transition = 'opacity 0.15s ease-out'
            
            fragment.appendChild(pageWrapper)
            this.observer.observe(pageWrapper)
            return pageWrapper
        })
        this.app.container.appendChild(fragment)

        // 3. New Physical Probe: Scan all pages for real dimensions (Lightweight)
        // This ensures JumpManager always has accurate metrics even for unrendered pages.
        this.probeAllPageHeights().then(() => {
            requestAnimationFrame(() => {
                this.updatePageMetrics()
                // Sync scrollbar if in horizontal mode after metrics are ready
                if (this.app.readingMode === 'horizontal') {
                    this.app.standaloneScrollbarManager?.init();
                }
                this.app.updateRulerPosition()
                this.app.updateRulerClip()
                this.app.computeNextTarget()
                this.app.updateRulerMarks()
            })
        });

        // Initial UI updates for first page
        this.showMainUI()
        this.app.updateJumpLinePosition()
        this.app.updateRulerPosition()
        this.app.updateRulerClip()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()

        // Ensure scroll restoration ONLY on initial file load
        if (isInitialLoad && this.app.viewer) {
            const savedScroll = this.app.scoreDetailManager?.currentInfo?.lastScrollTop || 0;
            this.app.viewer.scrollTop = savedScroll;
            this.app.viewer.scrollLeft = 0;
            console.log(`[ViewerManager] Initial load: Restored scroll to ${savedScroll}`);
        }

        if (this.app.inputManager) this.app.inputManager.updateDividerPositions()

        // Pre-warm in-memory bitmap cache from IndexedDB so next-page jumps are instant
        if (isInitialLoad && this.pdfFingerprint && typeof createImageBitmap === 'function') {
            // Estimate which page the user will see first based on saved scroll
            const savedScroll = this.app.scoreDetailManager?.currentInfo?.lastScrollTop || 0
            const estPageHeight = firstViewport.height + 8 // 8px gap estimate
            const centerPage = Math.max(1, Math.floor(savedScroll / estPageHeight) + 1)
            this._prewarmBitmapCache(centerPage)
        }

        console.log(`[ViewerManager] renderPDF layout initiated for ${numPages} pages.`);
    }

    /**
     * Probes all page viewports immediately after container creation.
     * This creates 100% accurate layout metrics without waiting for full rendering.
     */
    async probeAllPageHeights() {
        if (!this.pdf) return;
        const numPages = this.pdf.numPages;
        const probePromises = [];

        console.log(`[ViewerManager] Probing ${numPages} page viewports...`);
        for (let i = 1; i <= numPages; i++) {
            // Already have page 1 from renderPDF
            if (i === 1) continue;

            probePromises.push((async () => {
                try {
                    let page = this._pageCache[i];
                    if (!page) {
                        page = await this.pdf.getPage(i);
                        this._pageCache[i] = page;
                    }
                    
                    const naturalViewport = page.getViewport({ scale: 1.0 });
                    const targetWidth = this.baseNaturalWidth * this.scale;
                    const specificScale = targetWidth / naturalViewport.width;
                    const viewport = page.getViewport({ scale: specificScale });

                    this._pageViewports[i] = viewport;
                    const wrapper = document.querySelector(`.page-container:not(.is-stale)[data-page="${i}"]`);
                    if (wrapper) {
                        wrapper.style.minHeight = `${viewport.height}px`;
                        if (this.app.readingMode !== 'horizontal') {
                            wrapper.style.width = `${viewport.width}px`;
                        }
                    }
                } catch (err) {
                    console.warn(`[ViewerManager] Probing page ${i} failed:`, err);
                }
            })());
        }

        await Promise.all(probePromises);
        console.log(`[ViewerManager] All ${numPages} viewports probed.`);
    }

    /**
     * Priority render request (e.g., from a Jump action)
     */
    async ensurePageRendered(pageNum) {
        if (!this.pdf) return
        const wrapper = document.querySelector(`.page-container:not(.is-stale)[data-page="${pageNum}"]`)
        if (wrapper && wrapper.dataset.rendered === 'false') {
            // Bypass queue for high priority — render target page immediately
            await this.renderPage(pageNum, wrapper)
        }
        // Pre-render the next 2 pages so they're ready before the user scrolls to them
        for (let i = 1; i <= 2; i++) {
            const nextWrapper = document.querySelector(`.page-container:not(.is-stale)[data-page="${pageNum + i}"]`)
            if (nextWrapper && nextWrapper.dataset.rendered === 'false') {
                this.enqueueRender(pageNum + i, nextWrapper)
            }
        }

        // Slide the bitmap prewarm window to keep nearby pages in memory
        if (this.pdfFingerprint && typeof createImageBitmap === 'function') {
            this._prewarmBitmapCache(pageNum)
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

            const cached = this._bitmapCache[pageNum]
            if (cached) {
                const context = canvas.getContext('2d', { alpha: false })
                if (context) {
                    canvas.width = cached.width
                    canvas.height = cached.height
                    canvas.style.width = ''
                    canvas.style.height = ''
                    context.drawImage(cached, 0, 0)
                    // Restore annotation layers
                    const vp = this._pageViewports[pageNum]
                    if (vp) {
                        // FIX: Use the actual scale of the cached bitmap instead of hardcoded 1.0
                        const cachedScale = cached.width / vp.width;
                        this.app.createAnnotationLayers(wrapper, pageNum, vp.width, vp.height, cachedScale)
                        this.app.createCaptureOverlay(wrapper, pageNum, vp.width, vp.height)
                        this.app.redrawStamps(pageNum)
                    }
                    wrapper.dataset.rendered = 'true'
                    return
                }
            }

            const context = canvas.getContext('2d', { alpha: false })
            // iOS limits simultaneous canvas contexts; getContext returns null when exceeded
            if (!context) {
                const retries = (parseInt(wrapper.dataset.ctxRetries) || 0) + 1
                if (retries > 5) {
                    console.warn(`[ViewerManager] Page ${pageNum}: gave up after ${retries} context retries`)
                    return
                }
                wrapper.dataset.ctxRetries = retries
                console.warn(`[ViewerManager] No 2D context for page ${pageNum}, retry ${retries}/5`)
                wrapper.dataset.rendering = 'false'
                setTimeout(() => this.enqueueRender(pageNum, wrapper), 1000)
                return
            }
            wrapper.dataset.ctxRetries = '0' // reset on success
            
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

            // --- iPad Canvas Memory Optimization (Capping & Safety) ---
            // Safari/iOS has strict individual (67M px) and cumulative canvas limits.
            // 9M pixels (3000x3000) is plenty for iPad sharpness and much safer for total memory.
            const MAX_AREA = 9437184; 
            const currentArea = viewport.width * viewport.height;
            let renderScale = 1.0;
            
            if (currentArea > MAX_AREA && currentArea > 0) {
                renderScale = Math.sqrt(MAX_AREA / currentArea);
                console.warn(`[ViewerManager] Page ${pageNum} is massive (${Math.floor(viewport.width)}x${Math.floor(viewport.height)}). Capping to 9M pixels (Scale: ${renderScale.toFixed(2)}x)`);
            } else if (currentArea <= 0) {
                console.error(`[ViewerManager] Invalid viewport area for page ${pageNum}: ${currentArea}. Aborting.`);
                wrapper.dataset.rendering = 'false';
                return;
            }

            canvas.width = Math.floor(viewport.width * renderScale)
            canvas.height = Math.floor(viewport.height * renderScale)

            // If we are downscaling, use CSS to stretch it back to the visual size
            if (renderScale < 1.0) {
                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;
            } else {
                canvas.style.width = '';
                canvas.style.height = '';
            }

            // --- Persistent Bitmap Cache (instant display for previously-rendered pages) ---
            if (this._usePersistedCache && this.pdfFingerprint && typeof createImageBitmap === 'function') {
                const cacheKey = `page_render_${this.pdfFingerprint}_p${pageNum}`
                try {
                    const cachedBlob = await db.get(cacheKey)
                    if (cachedBlob instanceof Blob) {
                        const cachedBitmap = await createImageBitmap(cachedBlob)
                        context.drawImage(cachedBitmap, 0, 0, canvas.width, canvas.height)
                        cachedBitmap.close()

                        this.app.createAnnotationLayers(wrapper, pageNum, viewport.width, viewport.height, renderScale)
                        this.app.createCaptureOverlay(wrapper, pageNum, viewport.width, viewport.height)
                        this.app.redrawStamps(pageNum)
                        wrapper.dataset.rendered = 'true'
                        wrapper.style.opacity = '1'

                        if (this._staleContainers.length > 0) {
                            const rect = wrapper.getBoundingClientRect()
                            if (rect.top < window.innerHeight && rect.bottom > 0) {
                                this.cleanupStale()
                            }
                        }

                        if (canvas.width > 0 && canvas.height > 0) {
                            createImageBitmap(canvas).then(bm => {
                                this._bitmapCache[pageNum] = bm
                            }).catch(() => {})
                        }

                        // Re-render at full quality off-screen, then swap
                        this._rerenderOffScreen(page, pageNum, wrapper, canvas, specificScale, renderScale, viewport, cacheKey)
                        return
                    }
                } catch (e) { /* persistent cache miss — fall through to normal render */ }
            }

            const renderTask = page.render({
                canvasContext: context,
                viewport: page.getViewport({ scale: specificScale * renderScale }),
                intent: 'display'
            })

            try {
                await renderTask.promise
            } catch (renderErr) {
                // If PDF.js render fails with a Type error (common on iPad memory limit),
                // or any other fatal error, try ONE retry with a forced 0.5x downscale.
                if (renderErr?.name === 'RenderingCancelledException') return;
                
                console.error(`[ViewerManager] Page ${pageNum} render FAILED. Attempting recovery with 0.5x scale...`, renderErr);
                
                // Clear and shrink the canvas for retry
                const fallbackScale = renderScale * 0.5;
                canvas.width = Math.floor(viewport.width * fallbackScale);
                canvas.height = Math.floor(viewport.height * fallbackScale);
                
                const retryTask = page.render({
                    canvasContext: context,
                    viewport: page.getViewport({ scale: specificScale * fallbackScale }),
                    intent: 'display'
                });
                await retryTask.promise;
                console.log(`[ViewerManager] Page ${pageNum} rendered via fallback (Resolution: ${canvas.width}x${canvas.height})`);
            }

            this.app.createAnnotationLayers(wrapper, pageNum, viewport.width, viewport.height, renderScale)
            this.app.createCaptureOverlay(wrapper, pageNum, viewport.width, viewport.height)
            this.app.redrawStamps(pageNum)
            wrapper.dataset.rendered = 'true'
            wrapper.style.opacity = '1' // NEW: Make page visible once fully ready

            // --- DOUBLE BUFFERING CLEANUP ---
            // Once the first new page is rendered, we can safely remove the stale "buffer" pages.
            // We use a small delay or check if it's visible to ensure the user actually sees content.
            if (this._staleContainers.length > 0) {
                // If it's a visible page, cleanup immediately to show the clear version
                const rect = wrapper.getBoundingClientRect()
                if (rect.top < window.innerHeight && rect.bottom > 0) {
                    this.cleanupStale()
                }
            }

            // Save bitmap for instant re-render (skip if createImageBitmap unavailable)
            if (typeof createImageBitmap === 'function' && canvas.width > 0 && canvas.height > 0) {
                createImageBitmap(canvas).then(bm => {
                    this._bitmapCache[pageNum] = bm
                }).catch(() => {})
            }

            // Save to persistent bitmap cache for instant display on re-open (fire-and-forget)
            if (this.pdfFingerprint && canvas.width > 0 && canvas.height > 0) {
                const cacheKey = `page_render_${this.pdfFingerprint}_p${pageNum}`
                canvas.toBlob(blob => {
                    if (blob) db.set(cacheKey, blob).catch(() => {})
                }, 'image/jpeg', 0.85)
            }

            // If this page scrolled off-screen while rendering, unrender it now.
            // (IntersectionObserver won't re-fire since the intersection didn't change after render.)
            const rect = wrapper.getBoundingClientRect()
            const vh = window.innerHeight
            if (rect.bottom < -1200 || rect.top > vh + 1200) {
                this.unrenderPage(pageNum, wrapper)
            }
        } catch (err) {
            // PDF.js throws a plain object when a render is cancelled (e.g. zoom change mid-flight)
            if (err?.name === 'RenderingCancelledException') return
            console.error(`[ViewerManager] Lazy render failed for page ${pageNum}:`, err)
            // Draw a visible error indicator so the user doesn't see a silent white page.
            // Common cause: ultra-high-DPI scanned PDFs (e.g. 1200 DPI) exceed iOS memory limits.
            try {
                const errCanvas = wrapper.querySelector('.pdf-canvas')
                if (errCanvas && errCanvas.width > 0 && errCanvas.height > 0) {
                    const ectx = errCanvas.getContext('2d')
                    if (ectx) {
                        ectx.fillStyle = '#f8f8f8'
                        ectx.fillRect(0, 0, errCanvas.width, errCanvas.height)
                        ectx.fillStyle = '#999'
                        ectx.font = `${Math.floor(errCanvas.width * 0.03)}px sans-serif`
                        ectx.textAlign = 'center'
                        ectx.fillText(`⚠ 第 ${pageNum} 頁圖片解析度過高`, errCanvas.width / 2, errCanvas.height * 0.48)
                        ectx.fillText(`無法在此裝置上顯示`, errCanvas.width / 2, errCanvas.height * 0.52)
                    }
                }
            } catch (_) { /* ignore drawing errors */ }
            wrapper.dataset.rendered = 'true'
            wrapper.style.opacity = '1'
        } finally {
            wrapper.dataset.rendering = 'false'
        }
    }

    /**
     * Pre-warm in-memory _bitmapCache from IndexedDB persistent cache.
     * Only loads a window of up to PREWARM_WINDOW pages centered on centerPage,
     * and evicts entries outside that window to cap memory usage.
     */
    async _prewarmBitmapCache(centerPage) {
        const PREWARM_WINDOW = 10
        const fp = this.pdfFingerprint
        if (!fp || !this.pdf) return
        const numPages = this.pdf.numPages

        const half = Math.floor(PREWARM_WINDOW / 2)
        let lo = Math.max(1, centerPage - half)
        let hi = Math.min(numPages, lo + PREWARM_WINDOW - 1)
        lo = Math.max(1, hi - PREWARM_WINDOW + 1) // re-adjust if hi was clamped

        // Evict pages outside the new window to free memory
        for (const key of Object.keys(this._bitmapCache)) {
            const p = parseInt(key, 10)
            if (p < lo || p > hi) {
                this._bitmapCache[p]?.close?.()
                delete this._bitmapCache[p]
            }
        }

        // Load missing pages within the window
        const prefix = `page_render_${fp}_p`
        for (let p = lo; p <= hi; p++) {
            if (this.pdfFingerprint !== fp) return
            if (this._bitmapCache[p]) continue

            try {
                const blob = await db.get(`${prefix}${p}`)
                if (!(blob instanceof Blob)) continue
                if (this.pdfFingerprint !== fp) return
                const bm = await createImageBitmap(blob)
                if (this.pdfFingerprint !== fp) { bm.close(); return }
                this._bitmapCache[p] = bm
            } catch (e) { /* skip failed entries */ }
        }
    }

    /**
     * Background off-screen re-render after a persistent cache hit.
     * Renders PDF.js to a temporary canvas, then swaps onto the visible canvas.
     */
    async _rerenderOffScreen(page, pageNum, wrapper, canvas, specificScale, renderScale, viewport, cacheKey) {
        try {
            const offCanvas = document.createElement('canvas')
            offCanvas.width = canvas.width
            offCanvas.height = canvas.height
            const offCtx = offCanvas.getContext('2d', { alpha: false })
            if (!offCtx) return

            const renderTask = page.render({
                canvasContext: offCtx,
                viewport: page.getViewport({ scale: specificScale * renderScale }),
                intent: 'display'
            })
            await renderTask.promise

            // Only swap if page is still rendered and in the DOM
            if (wrapper.dataset.rendered !== 'true' || !wrapper.isConnected) return

            const mainCtx = canvas.getContext('2d', { alpha: false })
            if (mainCtx) {
                mainCtx.drawImage(offCanvas, 0, 0)
            }

            // Update in-memory bitmap cache with full-quality render
            if (typeof createImageBitmap === 'function' && canvas.width > 0 && canvas.height > 0) {
                createImageBitmap(canvas).then(bm => {
                    this._bitmapCache[pageNum] = bm
                }).catch(() => {})
            }

            // Update persistent cache with full-quality render
            canvas.toBlob(blob => {
                if (blob) db.set(cacheKey, blob).catch(() => {})
            }, 'image/jpeg', 0.85)
        } catch (err) {
            if (err?.name === 'RenderingCancelledException') return
            console.warn(`[ViewerManager] Off-screen re-render failed for page ${pageNum}:`, err)
        }
    }

    /**
     * Clear page canvases to free up memory on mobile devices.
     */
    unrenderPage(pageNum, wrapper) {
        if (wrapper.dataset.rendered === 'false') return;
        
        console.log(`[ViewerManager] Virtualization: Unrendering page ${pageNum} to save memory.`);
        
        const pdfCanvas = wrapper.querySelector('.pdf-canvas');
        if (pdfCanvas) {
            pdfCanvas.width = 0;
            pdfCanvas.height = 0;
        }
        
        const annCanvas = wrapper.querySelector('.annotation-layer');
        if (annCanvas) {
            annCanvas.width = 0;
            annCanvas.height = 0;
        }

        const overlay = wrapper.querySelector('.capture-overlay');
        if (overlay) overlay.remove();

        wrapper.dataset.rendered = 'false';
    }

    /**
     * Completely remove stale containers used for double-buffering.
     */
    cleanupStale() {
        if (this._staleContainers.length === 0) return
        console.log(`[ViewerManager] Cleanup: Removing ${this._staleContainers.length} stale containers.`)
        this._staleContainers.forEach(el => {
            if (this.observer) this.observer.unobserve(el)
            el.remove()
        })
        this._staleContainers = []
    }

    /**
     * Efficiently capture all page offsets and heights to avoid continuous getBoundingClientRect/offsetTop calls.
     * Call this after renderPDF, resize, or zoom change.
     */
    updatePageMetrics() {
        if (!this.app.container) return
        this._pageMetrics = {}
        const isHorizontal = this.app.readingMode === 'horizontal'
        const containers = this.app.container.querySelectorAll('.page-container:not(.is-stale)')
        
        // Sync width to container in horizontal mode BEFORE reading metrics
        if (isHorizontal) {
            const availWidth = this.app.viewer.clientWidth
            containers.forEach(el => {
                el.style.width = availWidth + 'px'
                el.style.flex = `0 0 ${availWidth}px`
            })
        } else {
            // Restore for vertical mode
            containers.forEach(el => {
                el.style.width = ''
                el.style.flex = ''
            })
        }

        let zeroCount = 0;
        let horizontalReady = true;
        
        containers.forEach(el => {
            const pageNum = parseInt(el.dataset.page)
            if (!isNaN(pageNum)) {
                const top = el.offsetTop;
                const left = el.offsetLeft;
                
                // Detection: In horizontal mode, if page 2+ is at left:0, layout isn't ready
                if (isHorizontal && pageNum > 1 && left === 0) {
                    horizontalReady = false;
                }
                
                if (top === 0 && left === 0 && pageNum > 1) zeroCount++;
                
                this._pageMetrics[pageNum] = {
                    top: top,
                    left: left,
                    height: el.clientHeight,
                    width: el.clientWidth
                }
            }
        })

        // If horizontal layout isn't ready, retry once after a short delay
        if (isHorizontal && !horizontalReady && !this._retryingMetrics) {
            this._retryingMetrics = true;
            console.log('[ViewerManager] Horizontal layout not ready, retrying metrics in 50ms...');
            setTimeout(() => {
                this._retryingMetrics = false;
                this.updatePageMetrics();
            }, 50);
            return;
        }
        
        if (zeroCount > 0) {
            console.warn(`[ViewerManager] Detected ${zeroCount} suspicious zero offsets. Layout might be unstable.`);
        }
        this.updateHorizontalPanState()
    }

    updateHorizontalPanState() {
        if (this.app.readingMode === 'horizontal') return
        
        const viewer = this.app.viewer
        if (!viewer) return

        viewer.classList.remove('can-pan-x')
        viewer.style.overflowX = 'hidden'
        if (viewer.scrollLeft !== 0) {
            viewer.scrollLeft = 0
        }
    }

    createPageElement(pageNum) {
        const div = document.createElement('div')
        div.className = 'page-container'
        div.dataset.page = pageNum
        // Ensure centering for both vertical and horizontal modes
        div.style.display = 'flex'
        div.style.justifyContent = 'center'
        div.style.position = 'relative'

        // Content wrapper to anchor annotation layers correctly
        const wrapper = document.createElement('div')
        wrapper.className = 'page-content-wrapper'
        wrapper.dataset.page = pageNum
        wrapper.style.position = 'relative'
        wrapper.style.display = 'block'
        wrapper.innerHTML = `<canvas class="pdf-canvas"></canvas>`
        
        div.appendChild(wrapper)
        return div
    }

    createAnnotationLayers(container, pageNum, width, height, renderScale = 1.0) {
        // Use the inner wrapper if it exists (for alignment), fallback to container
        const wrapper = container.querySelector('.page-content-wrapper') || container;
        
        // Find or create annotation layer
        let canvas = wrapper.querySelector('.annotation-layer')
        if (!canvas) {
            canvas = document.createElement('canvas')
            canvas.dataset.page = pageNum
            wrapper.appendChild(canvas)
        }
        // Always ensure the correct classes are present for the renderer to find it
        canvas.className = 'annotation-layer virtual-canvas'
        
        // --- Safety Cap: Enforce max area even for annotation layers ---
        const MAX_AREA = 9437184; 
        const currentArea = width * renderScale * height * renderScale;
        if (currentArea > MAX_AREA && currentArea > 0) {
            const safetyScale = Math.sqrt(MAX_AREA / (width * height));
            if (safetyScale < renderScale) {
                console.warn(`[ViewerManager] Annotation Layer for page ${pageNum} area too large. Capping scale ${renderScale.toFixed(2)} -> ${safetyScale.toFixed(2)}`);
                renderScale = safetyScale;
            }
        }

        canvas.width = Math.floor(width * renderScale)
        canvas.height = Math.floor(height * renderScale)
        
        if (renderScale < 1.0) {
            canvas.style.width = `${width}px`
            canvas.style.height = `${height}px`
        } else {
            canvas.style.width = ''
            canvas.style.height = ''
        }
    }

    async changeZoom(delta, ratio = 1) {
        // Store ratio globally or pass through to renderPDF for double-buffering lock
        window.currentGestureRatio = ratio 
        
        const focalPoint = this._captureFocalPoint()
        this.scale = Math.min(Math.max(0.2, this.scale + delta), 4)
        this.isFitToHeight = false
        this.isFitToWidth  = false
        this.updateZoomDisplay()

        if (this.pdf) {
            await this.renderPDF(false) // Not initial load
            this._restoreFocalPoint(focalPoint)
        }
        
        window.currentGestureRatio = 1 // Reset for next time
        this.app.updateRulerPosition()
        this.app.computeNextTarget()
        this.app.updateRulerMarks()
    }

    async fitToWidth(isInitialLoad = false) {
        if (!this.pdf) return
        const focalPoint = isInitialLoad ? null : this._captureFocalPoint()

        const page = await this.pdf.getPage(1)
        const naturalWidth = page.getViewport({ scale: 1 }).width

        // Subtract padding from doc bar (left) and edit strip (right)
        const style = window.getComputedStyle(this.app.viewer)
        const padLeft  = parseFloat(style.paddingLeft)  || 0
        const padRight = parseFloat(style.paddingRight) || 0
        const availW = this.app.viewer.clientWidth - padLeft - padRight
        this.scale = Math.min(Math.max(0.2, availW / naturalWidth), 4)
        this.isFitToHeight = false
        this.isFitToWidth  = true
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

        const _s = window.getComputedStyle(this.app.viewer)
        const _pad = (parseFloat(_s.paddingTop) || 0) + (parseFloat(_s.paddingBottom) || 0)
        const availH = this.app.viewer.clientHeight - _pad
        this.scale = Math.min(Math.max(0.2, availH / naturalHeight), 4)
        this.isFitToHeight = true
        this.isFitToWidth  = false
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

    /** Re-apply fit-to-width or fit-to-height if currently in that mode. */
    reapplyFit() {
        if (this.isFitToWidth)  this.fitToWidth()
        else if (this.isFitToHeight) this.fitToHeight()
    }

    updateZoomDisplay() {
        if (this.app.zoomLevelDisplay) {
            this.app.zoomLevelDisplay.textContent = `${Math.round(this.scale * 100)}%`
        }
        this.app.editSubBarManager?.updateZoom()
        this.app.viewPanelManager?.updateZoomDisplay()
    }

    showMainUI() {
        // Reveal toolbars once a score is loaded
        ;['floating-doc-bar'].forEach(id => {
            document.getElementById(id)?.classList.remove('hidden')
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

            ;['floating-doc-bar', 'jump-ruler'].forEach(id => {
                document.getElementById(id)?.classList.add('hidden')
            })

        this.checkInitialView()
        this.updateFloatingTitle();
    }
}
