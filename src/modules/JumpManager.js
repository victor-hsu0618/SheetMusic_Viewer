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

        // Index Section Elements
        this.bookmarkSection = document.getElementById('bookmark-section')
        this.bookmarkList = document.getElementById('bookmark-list')
        this.measureSection = document.getElementById('measure-section')
        this.measureList = document.getElementById('measure-list')

        this.bookmarkOverlay = document.getElementById('bookmark-overlay')
        this.bookmarkInput = document.getElementById('bookmark-label-input')

        this.initEventListeners()
        this.initDraggable()
    }

    initEventListeners() {
        const btnToggle = document.getElementById('btn-jump-panel-toggle')
        if (btnToggle) {
            btnToggle.addEventListener('click', () => this.togglePanel())
        }

        const btnClose = document.getElementById('btn-close-jump-panel')
        if (btnClose) btnClose.onclick = () => this.togglePanel(false)

        // Tab Switching
        const tabBtns = this.panel.querySelectorAll('.index-tab-btn')
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

        // Close on outside click (iPad)
        document.addEventListener('touchstart', (e) => {
            if (this.panel && this.panel.classList.contains('active') &&
                !this.panel.contains(e.target) &&
                !document.getElementById('btn-jump-panel-toggle').contains(e.target)) {
                this.togglePanel(false)
            }
        }, { passive: true })
    }

    switchTab(tabId) {
        // Update Buttons
        this.panel.querySelectorAll('.index-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId)
        })

        // Update Sections
        if (this.bookmarkSection) this.bookmarkSection.classList.toggle('active', tabId === 'bookmarks')
        if (this.measureSection) this.measureSection.classList.toggle('active', tabId === 'measures')

        if (tabId === 'measures') {
            this.renderMeasures()
        }
    }

    async togglePanel(force = null) {
        if (!this.panel) return
        const active = force !== null ? force : !this.panel.classList.contains('active')
        this.panel.classList.toggle('active', active)
        if (active) {
            this.updateDisplay()
            this.displayValue = this.currentPage.toString()
            this.isTyping = false
            this.refreshCalcDisplay()
            await this.loadBookmarks()
            this.renderMeasures() // Pre-load measures
        }
    }

    renderMeasures() {
        if (!this.measureList) return
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
            const item = document.createElement('div')
            item.className = 'bookmark-item'
            item.innerHTML = `
                <div class="bm-info">
                    <span class="bm-page">${m.page}</span>
                    <span class="bm-label">Measure ${m.data}</span>
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
            const absoluteY = metrics.top + (stamp.y * metrics.height)
            this.app.viewer.scrollTo({
                top: Math.max(0, absoluteY - 100),
                behavior: 'smooth'
            })
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
        const pageElem = document.querySelector(`.page-container[data-page="${pageNumber}"]`)
        if (pageElem) {
            // Priority render before or during scroll
            this.app.viewerManager.ensurePageRendered(pageNumber)

            this.app.viewer.scrollTo({
                top: pageElem.offsetTop,
                behavior: 'smooth'
            })
            this.currentPage = pageNumber
            this.updateDisplay()
        }
    }

    prevPage() {
        if (this.currentPage > 1) this.goToPage(this.currentPage - 1)
    }

    nextPage() {
        if (this.currentPage < this.totalPages) this.goToPage(this.currentPage + 1)
    }

    goToHead() {
        this.app.jumpHistory = []
        this.app.viewer.scrollTo({ top: 0, behavior: 'smooth' })
    }

    goToEnd() {
        if (!this.app.pdf) return
        this.app.jumpHistory = []
        this.app.viewer.scrollTo({ top: this.app.viewer.scrollHeight, behavior: 'smooth' })
    }

    updateDisplay() {
        if (!this.app.pdf) {
            this.totalPages = 0
            if (this.display) this.display.textContent = 'No Score'
            return
        }
        this.totalPages = this.app.pdf.numPages

        const scrollTop = this.app.viewer.scrollTop
        const pages = document.querySelectorAll('.page-container')
        let current = 1
        for (let p of pages) {
            if (p.offsetTop <= scrollTop + window.innerHeight / 3) {
                current = parseInt(p.dataset.page)
            } else {
                break
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
        if (this.bookmarks.length === 0) {
            this.bookmarkList.innerHTML = '<div class="empty-state">No bookmarks yet</div>'
            return
        }

        this.bookmarkList.innerHTML = ''
        // Sort by page number
        const sorted = [...this.bookmarks].sort((a, b) => a.page - b.page)

        sorted.forEach(bm => {
            const item = document.createElement('div')
            item.className = 'bookmark-item'
            item.innerHTML = `
                <div class="bm-info">
                    <span class="bm-page">${bm.page}</span>
                    <span class="bm-label">${bm.label}</span>
                </div>
                <button class="bm-delete" title="Delete">&times;</button>
            `
            item.onclick = (e) => {
                if (e.target.classList.contains('bm-delete')) return
                this.goToPage(bm.page)
            }
            item.querySelector('.bm-delete').onclick = (e) => {
                e.stopPropagation()
                this.deleteBookmark(bm.id)
            }
            this.bookmarkList.appendChild(item)
        })
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
