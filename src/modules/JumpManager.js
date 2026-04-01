import * as db from '../db.js'

export class JumpManager {
    constructor(app) {
        this.app = app
        this.panel = null
        this.displayValue = '1'
        this.totalPages = 0
        this.currentPage = 1
        this.isTyping = false
        this.bookmarks = []
    }

    init() {
        this.panel = document.getElementById('jump-panel')
        this.display = document.getElementById('jump-page-display')
        this.calcValueEl = document.getElementById('calc-value')

        // List Containers
        this.bookmarkList = document.getElementById('bookmark-list')
        this.measureList = document.getElementById('measure-list')

        this.bookmarkOverlay = document.getElementById('bookmark-overlay')
        this.bookmarkInput = document.getElementById('bookmark-label-input')

        this.initEventListeners()
        // Disable draggable for PC to maintain "Stacked Shelf" design
        // this.initDraggable()
    }

    initEventListeners() {

        const btnClose = document.getElementById('btn-close-jump-panel')
        if (btnClose) btnClose.onclick = () => this.togglePanel(false)

        // Tab Switching (Keypad, Bookmarks, Measures)
        const tabBtns = this.panel.querySelectorAll('.jump-tab-btn')
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab
                this.switchTab(tab)
            })
        })

        // Keypad buttons
        document.querySelectorAll('.calc-btn.num-btn').forEach(btn => {
            btn.onclick = () => this.appendDigit(btn.dataset.key)
        })

        const btnClear = document.getElementById('btn-calc-clear')
        if (btnClear) btnClear.onclick = () => this.clearDisplay()

        const btnGo = document.getElementById('btn-calc-go')
        if (btnGo) btnGo.onclick = () => this.handleJump()

        // Nav buttons
        const btnHead = document.getElementById('btn-calc-head')
        if (btnHead) btnHead.onclick = () => this.goToHead()

        const btnEnd = document.getElementById('btn-calc-end')
        if (btnEnd) btnEnd.onclick = () => this.goToEnd()

        const btnPrev = document.getElementById('btn-calc-prev')
        if (btnPrev) btnPrev.onclick = () => this.prevPage()

        const btnNext = document.getElementById('btn-calc-next')
        if (btnNext) btnNext.onclick = () => this.nextPage()

        // Bookmark Actions
        const btnBookmark = document.getElementById('btn-calc-bookmark')
        if (btnBookmark) btnBookmark.onclick = () => this.showBookmarkOverlay()

        const btnSaveBookmark = document.getElementById('btn-bookmark-save')
        if (btnSaveBookmark) btnSaveBookmark.onclick = () => this.saveBookmark()

        const btnCancelBookmark = document.getElementById('btn-bookmark-cancel')
        if (btnCancelBookmark) btnCancelBookmark.onclick = () => this.hideBookmarkOverlay()
    }

    switchTab(tabId) {
        // Update Buttons
        this.panel.querySelectorAll('.jump-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId)
        })

        // Update Panes
        this.panel.querySelectorAll('.jump-tab-pane').forEach(pane => {
            pane.classList.toggle('active', pane.id === `pane-${tabId}`)
        })

        if (tabId === 'measures') {
            this.renderMeasures()
        } else if (tabId === 'bookmarks') {
            this.renderBookmarks()
        }
    }

    async togglePanel(force = null) {
        if (!this.panel) return
        const active = force !== null ? force : !this.panel.classList.contains('active')

        // If clicking same button and panel is open, toggle it off
        if (force === null && !active) {
            this.togglePanel(false)
            return
        }

        if (active) {
            this.app.uiManager.closeAllActivePanels('JumpManager')
            this.app.activeStampType = 'view'
            this.app.toolManager?.updateActiveTools()
        }

        this.panel.classList.toggle('active', active)

        // Sync button visual state
        const btn = document.getElementById('btn-jump-panel-toggle')
        if (btn) btn.classList.toggle('active', active)
        if (active) {
            // Reset position to let CSS fix it as a "Stacked Shelf"
            this.panel.style.top = ''
            this.panel.style.left = ''
            this.panel.style.bottom = ''
            this.panel.style.transform = ''

            this.updateDisplay()
            this.displayValue = this.currentPage.toString()
            this.isTyping = true
            this.refreshCalcDisplay()
            await this.loadBookmarks()
            this.renderMeasures()

            // Default to keypad when opening
            this.switchTab('keypad')
        }
    }

    renderMeasures() {
        if (!this.measureList) return
        // List ONLY measure stamps (and not deleted)
        const measures = this.app.stamps.filter(s => s.type === 'measure' && !s.deleted)

        if (measures.length === 0) {
            this.measureList.innerHTML = '<div class="empty-state">No measures found</div>'
            return
        }

        this.measureList.innerHTML = ''
        // Sort by page and then by Y position
        const sorted = [...measures].sort((a, b) => {
            if (a.page !== b.page) return a.page - b.page
            return a.y - b.y
        })

        sorted.forEach(m => {
            const source = this.app.sources.find(src => src.id === m.sourceId)
            const sourceName = source ? source.name : 'Unknown'
            const isHidden = source ? !source.visible : false

            const item = document.createElement('div')
            item.className = `bookmark-item ${isHidden ? 'opacity-50' : ''}`
            
            item.innerHTML = `
                <div class="bm-info">
                    <span class="bm-page">${m.page}</span>
                    <div class="flex-column">
                        <span class="bm-label">Measure ${m.data}</span>
                        <span class="text-tiny" style="color: ${source?.color || 'inherit'}">
                            ${sourceName} ${isHidden ? '(Hidden)' : ''}
                        </span>
                    </div>
                </div>
                <button class="bm-delete" title="Delete">&times;</button>
            `
            item.onclick = (e) => {
                if (e.target.classList.contains('bm-delete')) return
                this.jumpToStamp(m)
            }
            item.querySelector('.bm-delete').onclick = (e) => {
                e.stopPropagation()
                this.deleteMeasure(m)
            }
            this.measureList.appendChild(item)
        })
    }

    jumpToStamp(stamp) {
        if (!this.app.viewer) return
        this.app.viewerManager.ensurePageRendered(stamp.page)
        const metrics = this.app.viewerManager._pageMetrics[stamp.page]
        if (metrics) {
            const isHorizontal = this.app.readingMode === 'horizontal'
            const targetX = isHorizontal ? metrics.left + (stamp.x * metrics.width) : 0
            const targetY = isHorizontal ? 0 : metrics.top + (stamp.y * metrics.height)
            
            this.app.viewer.scrollTo({
                top: isHorizontal ? 0 : Math.max(0, targetY - 100),
                left: isHorizontal ? Math.max(0, targetX - 100) : 0,
                behavior: 'smooth'
            })
            // iPad Fix: Force reset interaction state after jump to ensure responsiveness
            this.app.inputManager?.forceResetInteractionState();
            this.updateDisplay()
        }
    }

    deleteMeasure(stamp) {
        stamp.deleted = true
        stamp.updatedAt = Date.now()
        this.app.saveToStorage(true)
        this.app.redrawStamps(stamp.page)
        this.renderMeasures()
        this.app.updateRulerMarks()
    }

    appendDigit(digit) {
        if (!this.isTyping) {
            this.displayValue = digit
            this.isTyping = true
        } else {
            if (this.displayValue.length >= 4) return
            this.displayValue += digit
        }
        this.refreshCalcDisplay()
    }

    clearDisplay() {
        this.displayValue = '0'
        this.isTyping = false
        this.refreshCalcDisplay()
    }

    refreshCalcDisplay() {
        if (this.calcValueEl) {
            this.calcValueEl.textContent = this.displayValue
        }
    }

    handleJump() {
        const val = parseInt(this.displayValue)
        if (isNaN(val) || val < 1 || val > this.totalPages) {
            this.panel.classList.add('error')
            setTimeout(() => this.panel.classList.remove('error'), 500)
            return
        }
        this.goToPage(val)
        // No closing as per user request
    }

    async goToPage(pageNumber) {
        if (!this.app.pdf) return
        
        const metrics = this.app.viewerManager?._pageMetrics;
        const targetMetric = metrics ? metrics[pageNumber] : null;
        const fromPage = this.currentPage;
        const isHorizontal = this.app.readingMode === 'horizontal';

        const doRealJump = (targetLeft, targetTop) => {
            const behavior = (isHorizontal && this.app.transitionManager?.currentStyle === 'slide') ? 'smooth' : (isHorizontal ? 'instant' : 'smooth');
            this.app.viewer.scrollTo({
                left: targetLeft,
                top: targetTop,
                behavior: behavior
            });
            this.currentPage = pageNumber;
            this.updateDisplay();
            this.app.inputManager?.forceResetInteractionState();
            return true;
        };

        if (targetMetric) {
            this.app.viewerManager.ensurePageRendered(pageNumber);
            
            if (isHorizontal && this.app.transitionManager) {
                return await this.app.transitionManager.performTransition(
                    fromPage, 
                    pageNumber, 
                    () => doRealJump(targetMetric.left, 0)
                );
            }
            return doRealJump(targetMetric.left, isHorizontal ? 0 : targetMetric.top);
        }

        // Fallback: DOM query (only if metrics aren't ready/cached)
        const pageElem = document.querySelector(`.page-container:not(.is-stale)[data-page="${pageNumber}"]`)
        if (pageElem) {
            this.app.viewerManager.ensurePageRendered(pageNumber);
            if (isHorizontal && this.app.transitionManager) {
                return await this.app.transitionManager.performTransition(
                    fromPage, 
                    pageNumber, 
                    () => doRealJump(pageElem.offsetLeft, 0)
                );
            }
            return doRealJump(pageElem.offsetLeft, isHorizontal ? 0 : pageElem.offsetTop);
        }
        return false;
    }

    prevPage() {
        if (this.currentPage > 1) {
            return this.goToPage(this.currentPage - 1)
        } else {
            const btn = document.getElementById('btn-calc-prev')
            btn?.classList.add('error-flash')
            setTimeout(() => btn?.classList.remove('error-flash'), 500)
            return false
        }
    }

    nextPage() {
        if (this.currentPage < this.totalPages) {
            return this.goToPage(this.currentPage + 1)
        } else {
            const btn = document.getElementById('btn-calc-next')
            btn?.classList.add('error-flash')
            setTimeout(() => btn?.classList.remove('error-flash'), 500)
            return false
        }
    }

    goToHead() {
        this.app.jumpHistory = []
        this.app.viewer.scrollTo({ 
            top: 0, 
            left: 0, 
            behavior: 'smooth' 
        })
        
        // iPad Fix: Force reset interaction state after jump to ensure responsiveness
        this.app.inputManager?.forceResetInteractionState();
    }

    goToEnd() {
        if (!this.app.pdf) return
        this.app.jumpHistory = []
        const isHorizontal = this.app.readingMode === 'horizontal'

        const metrics = this.app.viewerManager?._pageMetrics;
        if (metrics && Object.keys(metrics).length > 0) {
            const lastPage = this.totalPages;
            const m = metrics[lastPage];
            if (m) {
                this.app.viewer.scrollTo({ 
                    top: isHorizontal ? 0 : m.top, 
                    left: isHorizontal ? m.left : 0, 
                    behavior: 'smooth' 
                });
                return;
            }
        }
        
        // Fallback: Total scroll height/width
        this.app.viewer.scrollTo({ 
            top: isHorizontal ? 0 : this.app.viewer.scrollHeight, 
            left: isHorizontal ? this.app.viewer.scrollWidth : 0, 
            behavior: 'smooth' 
        })
    }

    updateDisplay() {
        if (!this.app.pdf) {
            this.totalPages = 0
            if (this.display) this.display.textContent = 'No Score'
            return
        }
        this.totalPages = this.app.pdf.numPages

        // Performance: Use pre-cached _pageMetrics instead of querySelectorAll
        // This avoids Layout Thrashing on every scroll event
        const metrics = this.app.viewerManager?._pageMetrics
        const isHorizontal = this.app.readingMode === 'horizontal'
        const scrollPos = isHorizontal ? this.app.viewer.scrollLeft : this.app.viewer.scrollTop
        const threshold = scrollPos + (isHorizontal ? this.app.viewer.clientWidth / 2 : window.innerHeight / 3)
        let current = 1

        if (metrics && Object.keys(metrics).length > 0) {
            // Fix: Sort numeric keys to ensure we detect the visually leading page correctly
            const sortedPages = Object.keys(metrics).map(Number).sort((a,b) => a - b);
            for (const page of sortedPages) {
                const m = metrics[page];
                const pos = isHorizontal ? m.left : m.top;
                if (pos <= threshold) {
                    current = page;
                } else {
                    break;
                }
            }
        } else {
            // Fallback: DOM query (only when metrics not ready)
            const pages = Array.from(document.querySelectorAll('.page-container:not(.is-stale)'))
                .sort((a,b) => parseInt(a.dataset.page) - parseInt(b.dataset.page));
                
            for (let p of pages) {
                const pos = isHorizontal ? p.offsetLeft : p.offsetTop;
                if (pos <= threshold) {
                    current = parseInt(p.dataset.page)
                } else {
                    break
                }
            }
        }

        this.currentPage = current

        if (this.display) {
            this.display.textContent = `Page ${this.currentPage} of ${this.totalPages}`
        }
        if (!this.isTyping) {
            this.displayValue = this.currentPage.toString()
            this.refreshCalcDisplay()
        }
    }

    // Bookmark Logic
    showBookmarkOverlay() {
        if (!this.app.pdfFingerprint) return
        this.bookmarkOverlay.classList.remove('hidden')
        if (this.bookmarkInput) {
            this.bookmarkInput.value = `Page ${this.currentPage}`
            setTimeout(() => this.bookmarkInput.focus(), 100)
        }
    }

    hideBookmarkOverlay() {
        this.bookmarkOverlay.classList.add('hidden')
    }

    async saveBookmark() {
        if (!this.app.pdfFingerprint) return
        const label = this.bookmarkInput.value.trim() || `Page ${this.currentPage}`
        const bookmark = {
            id: 'bm-' + Date.now(),
            page: this.currentPage,
            label: label,
            updatedAt: Date.now()
        }

        this.bookmarks.push(bookmark)
        await db.set(`bookmarks_${this.app.pdfFingerprint}`, this.bookmarks)
        this.hideBookmarkOverlay()
        this.renderBookmarks()
    }

    async loadBookmarks() {
        if (!this.app.pdfFingerprint) return
        const saved = await db.get(`bookmarks_${this.app.pdfFingerprint}`)
        this.bookmarks = saved || []
        this.renderBookmarks()
    }

    async deleteBookmark(id) {
        this.bookmarks = this.bookmarks.filter(bm => bm.id !== id)
        await db.set(`bookmarks_${this.app.pdfFingerprint}`, this.bookmarks)
        this.renderBookmarks()
    }

    renderBookmarks() {
        if (!this.bookmarkList) return

        // Merge keypad bookmarks (IndexedDB) with page-bookmark stamps
        const stampBookmarks = (this.app.stamps || [])
            .filter(s => s.type === 'page-bookmark' && !s.deleted)
            .map(s => ({ id: s.id, page: s.page, label: s.data || `Page ${s.page}`, isStamp: true, stamp: s }))

        const all = [...this.bookmarks, ...stampBookmarks]

        if (all.length === 0) {
            this.bookmarkList.innerHTML = '<div class="empty-state">No bookmarks yet</div>'
            return
        }

        this.bookmarkList.innerHTML = ''
        const sorted = [...all].sort((a, b) => a.page - b.page)

        sorted.forEach(bm => {
            const item = document.createElement('div')
            item.className = 'bookmark-item'
            const badge = bm.isStamp
                ? `<span style="font-size:0.65rem;opacity:0.55;margin-left:4px">📌</span>`
                : ''
            item.innerHTML = `
                <div class="bm-info">
                    <span class="bm-page">${bm.page}</span>
                    <span class="bm-label">${bm.label}${badge}</span>
                </div>
                <button class="bm-delete" title="Delete">&times;</button>
            `
            item.onclick = (e) => {
                if (e.target.classList.contains('bm-delete')) return
                if (bm.isStamp) this.jumpToStamp(bm.stamp)
                else this.goToPage(bm.page)
            }
            item.querySelector('.bm-delete').onclick = (e) => {
                e.stopPropagation()
                if (bm.isStamp) this.deleteStampBookmark(bm.stamp)
                else this.deleteBookmark(bm.id)
            }
            this.bookmarkList.appendChild(item)
        })
    }

    deleteStampBookmark(stamp) {
        stamp.deleted = true
        stamp.updatedAt = Date.now()
        this.app.saveToStorage(true)
        this.app.redrawStamps(stamp.page)
        this.renderBookmarks()
    }

    initDraggable() {
        let isDragging = false
        let startX, startY, initialX = 0, initialY = 0
        const el = this.panel
        const handle = el.querySelector('.jump-drag-handle')

        const start = (e) => {
            if (e.target.closest('.calc-btn') || e.target.closest('.bookmark-overlay') || e.target.closest('.bookmark-list')) return
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

            const style = window.getComputedStyle(el)
            const matrix = new WebKitCSSMatrix(style.transform)
            initialX = matrix.m41
            initialY = matrix.m42

            startX = clientX
            startY = clientY
            isDragging = true
            el.style.transition = 'none'
        }

        const move = (e) => {
            if (!isDragging) return
            const clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX
            const clientY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY

            const dx = clientX - startX
            const dy = clientY - startY

            el.style.transform = `translate(${initialX + dx}px, ${initialY + dy}px)`
        }

        const end = () => {
            isDragging = false
            el.style.transition = ''
        }

        handle.addEventListener('mousedown', start)
        document.addEventListener('mousemove', move)
        document.addEventListener('mouseup', end)

        handle.addEventListener('touchstart', (e) => {
            start(e)
        }, { passive: false })
        document.addEventListener('touchmove', move, { passive: false })
        document.addEventListener('touchend', end)
    }
}
