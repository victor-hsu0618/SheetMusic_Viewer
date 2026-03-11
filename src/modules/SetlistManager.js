import * as db from '../db.js'

export class SetlistManager {
    constructor(app) {
        this.app = app
        this.setlists = [] // Array of { id, title, dateCreated, scores: [fingerprints] }
        this.isLoaded = false
        this.activeSetlistId = null // ID of the setlist currently being performed
        this.currentScoreIndex = -1 // Index in the active setlist
    }

    async init() {
        this.grid = document.getElementById('setlist-grid')
        this.detailView = document.getElementById('setlist-detail-view')
        this.detailList = document.getElementById('setlist-detail-list')
        this.detailTitle = document.getElementById('setlist-detail-title')
        this.btnBack = document.getElementById('btn-setlist-back')

        if (this.btnBack) {
            this.btnBack.addEventListener('click', () => this.closeDetailView())
        }

        const stored = await db.get('score_setlists')
        this.setlists = stored || []
        this.isLoaded = true
        console.log(`[SetlistManager] Loaded ${this.setlists.length} setlists.`)
    }

    async save() {
        await db.set('score_setlists', this.setlists)
    }

    async createSetlist(title) {
        const newList = {
            id: 'setlist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            title: title || '未命名歌單 (Untitled)',
            dateCreated: Date.now(),
            updatedAt: Date.now(),
            scores: [] // Array of fingerprints
        }
        this.setlists.push(newList)
        await this.save()
        return newList
    }

    async deleteSetlist(id) {
        this.setlists = this.setlists.filter(list => list.id !== id)
        if (this.activeSetlistId === id) this.exitPerformanceMode()
        await this.save()
    }

    async renameSetlist(id, newTitle) {
        const list = this.getSetlist(id)
        if (list) {
            list.title = newTitle
            list.updatedAt = Date.now()
            await this.save()
        }
    }

    getSetlist(id) {
        return this.setlists.find(list => list.id === id)
    }

    async addScore(setId, fingerprint) {
        const list = this.getSetlist(setId)
        if (!list) return false

        // Prevent duplicates in the same setlist? 
        if (list.scores.includes(fingerprint)) {
            return false // Already added
        }

        list.scores.push(fingerprint)
        list.updatedAt = Date.now()
        await this.save()
        return true
    }

    async removeScore(setId, fingerprint) {
        const list = this.getSetlist(setId)
        if (!list) return
        list.scores = list.scores.filter(item => {
            const fp = typeof item === 'object' ? item.fingerprint : item
            return fp !== fingerprint
        })
        list.updatedAt = Date.now()
        await this.save()
    }

    async markScoreAsDeletedAll(fingerprint, title) {
        let changed = false
        this.setlists.forEach(list => {
            let listChanged = false
            list.scores = list.scores.map(item => {
                const fp = typeof item === 'object' ? item.fingerprint : item
                if (fp === fingerprint && typeof item === 'string') {
                    changed = true
                    listChanged = true
                    return { fingerprint, title, status: 'deleted' }
                }
                return item
            })
            if (listChanged) list.updatedAt = Date.now()
        })
        if (changed) await this.save()
    }

    async reorderScore(setId, oldIndex, newIndex) {
        const list = this.getSetlist(setId)
        if (!list) return

        if (newIndex >= list.scores.length) {
            let k = newIndex - list.scores.length + 1
            while (k--) {
                list.scores.push(undefined)
            }
        }
        list.scores.splice(newIndex, 0, list.scores.splice(oldIndex, 1)[0])
        list.updatedAt = Date.now()
        await this.save()
    }

    // --- Performance Mode (Phase 3 Prep) ---
    async enterPerformanceMode(setId, startIndex = 0) {
        const list = this.getSetlist(setId)
        if (!list || list.scores.length === 0) return

        this.activeSetlistId = setId
        this.currentScoreIndex = startIndex

        // Ensure UI updates to show next/prev buttons
        document.body.classList.add('performance-mode-active')

        await this.app.scoreManager.loadScore(list.scores[this.currentScoreIndex])
    }

    exitPerformanceMode() {
        this.activeSetlistId = null
        this.currentScoreIndex = -1
        document.body.classList.remove('performance-mode-active')
    }

    render() {
        if (!this.grid) return
        this.grid.innerHTML = ''

        if (this.setlists.length === 0) {
            this.grid.innerHTML = `
                <div class="library-empty">
                    <div style="margin-bottom:15px; font-size: 2rem;">🎵</div>
                    <div>No Setlists found.</div>
                    <button class="btn btn-primary" id="btn-create-first-setlist" style="margin-top: 15px;">Create Custom Setlist</button>
                </div>
            `
            const btn = document.getElementById('btn-create-first-setlist')
            if (btn) btn.onclick = async () => {
                const title = await this.app.showDialog({
                    title: 'New Setlist',
                    message: 'Enter a name for your new Setlist (e.g., 2026 Recital):',
                    type: 'input',
                    icon: '🎵',
                    placeholder: 'Setlist Name'
                })
                if (title) {
                    await this.createSetlist(title)
                    this.render()
                }
            }
            return
        }

        // Add "Create New" Card
        const createCard = document.createElement('div')
        createCard.className = 'score-card'
        createCard.style.justifyContent = 'center'
        createCard.style.borderStyle = 'dashed'
        createCard.style.opacity = '0.7'
        createCard.innerHTML = `<div style="font-size:16px; font-weight: 600;">⊕ Create New Setlist</div>`
        createCard.onclick = async () => {
            const title = await this.app.showDialog({
                title: 'New Setlist',
                message: 'Enter a name for your new Setlist:',
                type: 'input',
                icon: '🎵',
                placeholder: 'Setlist Name'
            })
            if (title) {
                await this.createSetlist(title)
                this.render()
            }
        }
        this.grid.appendChild(createCard)

        // Render existing setlists
        this.setlists.forEach(list => {
            const card = document.createElement('div')
            card.className = 'score-card'

            const dateStr = new Date(list.dateCreated).toLocaleDateString()
            const scoreCount = list.scores.length

            card.innerHTML = `
                <div class="score-thumb" style="background: rgba(99, 102, 241, 0.2); color: var(--primary);">
                    📋
                </div>
                <div class="score-info">
                    <div class="score-meta-row" title="${list.title}">
                        <span class="score-title">${list.title}</span>
                    </div>
                    <div class="score-meta-row" style="margin-top:4px;">
                        <span class="score-composer">${scoreCount} scores</span>
                        <span class="score-meta-separator">·</span>
                        <span class="score-composer">Created ${dateStr}</span>
                    </div>
                </div>
                <button class="btn-icon-mini btn-score-info setlist-delete-btn" title="Delete Setlist" style="color:#ef4444;" data-id="${list.id}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
            `

            card.onclick = (e) => {
                if (e.target.closest('.setlist-delete-btn')) {
                    e.stopPropagation()
                    if (confirm(`Are you sure you want to delete the setlist "${list.title}"?`)) {
                        this.deleteSetlist(list.id)
                        this.render()
                    }
                    return
                }

                // Open Setlist Detail
                this.openDetailView(list.id)
            }

            this.grid.appendChild(card)
        })
    }

    openDetailView(setId) {
        this.activeDetailSetId = setId
        const list = this.getSetlist(setId)
        if (!list) return

        // Hide Library Header and Grids
        document.querySelector('.library-header').style.display = 'none'
        document.getElementById('setlist-grid').classList.add('hidden')
        document.getElementById('library-grid').classList.add('hidden')

        // Show Detail View
        this.detailView.classList.remove('hidden')
        this.detailTitle.textContent = list.title

        this.renderDetailList()
    }

    closeDetailView() {
        this.activeDetailSetId = null
        // Hide Detail View
        this.detailView.classList.add('hidden')

        // Show Library Header and Grids based on active tab
        document.querySelector('.library-header').style.display = 'flex'

        const tabs = document.querySelectorAll('.library-tabs .segment-btn')
        let activeTab = 'scores'
        tabs.forEach(t => { if (t.classList.contains('active')) activeTab = t.dataset.tab })

        document.getElementById('library-grid').classList.toggle('hidden', activeTab !== 'scores')
        document.getElementById('setlist-grid').classList.toggle('hidden', activeTab !== 'setlists')

        if (activeTab === 'setlists') this.render()
    }

    renderDetailList() {
        if (!this.detailList || !this.activeDetailSetId) return
        this.detailList.innerHTML = ''

        const list = this.getSetlist(this.activeDetailSetId)
        if (!list) return

        if (list.scores.length === 0) {
            this.detailList.innerHTML = `
                <div class="library-empty" style="height: 100%;">
                    <div style="margin-bottom:15px; font-size: 2rem;">📭</div>
                    <div>This setlist is empty.</div>
                    <div style="font-size: 0.9em; opacity: 0.7; margin-top: 10px;">Select scores in the Library to add them here.</div>
                </div>
            `
            return
        }

        list.scores.forEach((item, index) => {
            const isGhost = typeof item === 'object'
            const fp = isGhost ? item.fingerprint : item
            const regScore = !isGhost ? this.app.scoreManager.registry.find(s => s.fingerprint === fp) : null

            let title = ''
            let composer = ''
            let isDeleted = false

            if (isGhost) {
                title = item.title || 'Unknown Deleted Score'
                composer = '檔案已刪除 (Deleted)'
                isDeleted = true
            } else {
                title = regScore ? regScore.title : 'Unknown Score'
                composer = regScore ? regScore.composer : ''
                // Fallback: If not found in registry but still a string, it's effectively a ghost we didn't mark yet
                if (!regScore) {
                    isDeleted = true
                    composer = '檔案遺失 (Missing)'
                }
            }

            const row = document.createElement('div')
            row.draggable = true
            row.dataset.index = index
            row.style.cssText = `
                display: flex; align-items: center; padding: 15px; 
                background: rgba(255,255,255,0.05); border-radius: 8px;
                border: 1px solid rgba(255,255,255,0.1);
                transition: transform 0.2s, opacity 0.2s;
            `

            // Drag and drop events
            row.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', index.toString())
                row.style.opacity = '0.5'
            })

            row.addEventListener('dragend', () => {
                row.style.opacity = '1'
            })

            row.addEventListener('dragover', (e) => {
                e.preventDefault() // Necessary to allow dropping
                row.style.borderTop = '2px solid var(--primary)'
            })

            row.addEventListener('dragleave', () => {
                row.style.borderTop = '1px solid rgba(255,255,255,0.1)'
            })

            row.addEventListener('drop', (e) => {
                e.preventDefault()
                row.style.borderTop = '1px solid rgba(255,255,255,0.1)'
                const oldIndex = parseInt(e.dataTransfer.getData('text/plain'))
                const newIndex = index
                if (oldIndex !== newIndex && !isNaN(oldIndex)) {
                    this.reorderScore(list.id, oldIndex, newIndex).then(() => this.renderDetailList())
                }
            })

            row.innerHTML = `
                <div style="margin-right: 15px; cursor: grab; opacity: 0.5; display:flex; align-items:center;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </div>
                <div style="flex-grow: 1;">
                    <div style="font-size: 1.1rem; font-weight: 500; ${isDeleted ? 'color: #ef4444; text-decoration: line-through; opacity: 0.7;' : ''}">
                        ${index + 1}. ${title}
                    </div>
                    <div style="font-size: 0.85rem; opacity: 0.7; margin-top: 4px; ${isDeleted ? 'color: #ef4444;' : ''}">
                        ${isDeleted ? '⚠️ ' : ''}${composer}
                    </div>
                </div>
                <button class="btn btn-ghost-mini remove-score-btn" style="color: #ef4444;" title="Remove from list">✕</button>
            `

            row.querySelector('.remove-score-btn').onclick = () => {
                if (confirm('Remove this score from the setlist?')) {
                    this.removeScore(list.id, fp).then(() => this.renderDetailList())
                }
            }

            this.detailList.appendChild(row)
        })
    }
}
