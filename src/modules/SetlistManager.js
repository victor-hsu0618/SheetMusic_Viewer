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
        if (this.isInitialized) return
        this.isInitialized = true
        
        this.grid = document.getElementById('setlist-grid')
        this.detailView = document.getElementById('setlist-detail-view')
        this.detailList = document.getElementById('setlist-detail-list')
        this.detailTitle = document.getElementById('setlist-detail-title')
        this.btnBack = document.getElementById('btn-setlist-back')
        this.btnAddNew = document.getElementById('btn-setlist-add-score') // This is the old Add Score button
        this.btnCloseDetail = document.getElementById('btn-setlist-close')

        try {
            const stored = await db.get('score_setlists')
            if (stored) {
                this.setlists = stored
                console.log(`[SetlistManager] Local IDB loaded: ${this.setlists.length} setlists.`);
                this.isLoaded = true
            } else {
                console.log('[SetlistManager] Local IDB is empty.');
            }
        } catch (err) {
            console.error('[SetlistManager] IDB Load error:', err);
        }

        if (this.btnBack) {
            this.btnBack.addEventListener('click', () => this.closeDetailView())
        }

        if (this.btnAddScore) {
            this.btnAddScore.onclick = () => {
                if (this.activeDetailSetId) this.showScorePicker(this.activeDetailSetId)
            }
        }

        if (this.btnCloseDetail) {
            this.btnCloseDetail.addEventListener('click', () => {
                this.closeDetailView()
                this.app.toggleLibrary(false)
            })
        }

        const stored = await db.get('score_setlists')
        this.setlists = stored || []
        this.isLoaded = true
        console.log(`[SetlistManager] Loaded ${this.setlists.length} setlists.`)
    }

    async save() {
        await db.set('score_setlists', this.setlists)
        
        // --- NEW: Sync to Supabase ---
        if (this.app.supabaseManager) {
            this.app.supabaseManager.pushSetlists(this.setlists);
        }
    }

    async mergeSetlists(cloudSetlists) {
        if (!cloudSetlists || !Array.isArray(cloudSetlists) || cloudSetlists.length === 0) {
            console.log('[SetlistManager] No cloud setlists to merge.');
            return;
        }
        
        console.log(`[SetlistManager] 🔄 Merging ${cloudSetlists.length} cloud setlists...`);
        let changed = false;
        
        cloudSetlists.forEach(cloudList => {
            const localIdx = this.setlists.findIndex(l => l.id === cloudList.id);
            if (localIdx === -1) {
                this.setlists.push(cloudList);
                changed = true;
            } else {
                // Take the one with the newer updatedAt timestamp
                const cloudUpdate = cloudList.updatedAt || 0;
                const localUpdate = this.setlists[localIdx].updatedAt || 0;
                if (cloudUpdate > localUpdate) {
                    this.setlists[localIdx] = cloudList;
                    changed = true;
                }
            }
        });
        
        if (changed) {
            await db.set('score_setlists', this.setlists);
            if (this.app.scoreManager?.overlay?.classList.contains('active')) {
                this.render();
            }
        }
    }

    async createSetlist(title) {
        console.log('[SetlistManager] createSetlist:', title);
        const newList = {
            id: 'setlist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            title: title || '未命名歌單 (Untitled)',
            dateCreated: Date.now(),
            updatedAt: Date.now(),
            scores: [] // Array of fingerprints
        }
        this.setlists.push(newList)
        await this.save()
        console.log('[SetlistManager] Setlist created, count:', this.setlists.length);
        return newList
    }

    async deleteSetlist(id) {
        const list = this.setlists.find(l => l.id === id)
        if (list) {
            list.deleted = true
            list.updatedAt = Date.now()
        }
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
        return this.setlists.find(list => list.id === id && !list.deleted)
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

        // Auto-pin: ensure the score is always available offline
        await this.app.scoreManager?.setStorageMode(fingerprint, 'pinned')

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

        // If no longer in any setlist, downgrade from pinned to cached
        const stillPinned = this.setlists.some(l =>
            l.scores.some(item => (typeof item === 'object' ? item.fingerprint : item) === fingerprint)
        )
        if (!stillPinned) {
            await this.app.scoreManager?.setStorageMode(fingerprint, 'cached')
        }
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
        console.log('[SetlistManager] Rendering, count:', this.setlists.length);
        if (!this.grid) {
            console.error('[SetlistManager] Grid not found during render');
            return;
        }
        this.grid.innerHTML = '';

        // Update Stats Label & Actions
        const countEl = document.getElementById('library-score-count');
        const actionsArea = document.getElementById('setlist-actions-area');
        const btnCreateMini = document.getElementById('btn-create-setlist-mini');

        const activeSetlists = this.setlists.filter(l => !l.deleted)
        if (countEl) countEl.textContent = `All Setlists (${activeSetlists.length})`;
        if (actionsArea) actionsArea.classList.remove('hidden');

        if (btnCreateMini && !btnCreateMini.onclick) {
            btnCreateMini.onclick = async () => {
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
        }

        if (activeSetlists.length === 0) {
            this.grid.innerHTML = `
                <div class="library-empty">
                    <div style="margin-bottom:15px; font-size: 2rem;">🎵</div>
                    <div>No Setlists found.</div>
                </div>
            `
            return
        }

        // Render existing setlists (skip deleted/tombstoned)
        activeSetlists.forEach(list => {
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

        // Hide header, toolbar, and grids using CSS classes for consistency
        document.querySelector('.library-header')?.classList.add('hidden-important')
        document.querySelector('.library-toolbar')?.classList.add('hidden-important')
        document.getElementById('setlist-grid').classList.add('hidden')
        document.getElementById('library-grid').classList.add('hidden')

        // OPTIMIZATION: Check if current score is already in this setlist
        const currentFp = this.app.pdfFingerprint;
        const alreadyIn = currentFp ? list.scores.includes(currentFp) : true;

        // Reset Add Score button state
        if (this.btnAddNew) {
            if (currentFp && !alreadyIn) {
                this.btnAddNew.innerHTML = '<span style="font-size:1.1em; margin-right:4px;">+</span> Current';
                this.btnAddNew.title = `Add "${this.app.viewerManager?.activeScoreName || 'Current Score'}" to this list`;
                this.btnAddNew.onclick = async () => {
                    const success = await this.addScore(setId, currentFp);
                    if (success) {
                        this.app.showMessage('Score added to setlist', 'success');
                        this.openDetailView(setId); // Refresh view
                    }
                }
            } else {
                this.btnAddNew.innerHTML = '<span style="font-size:1.1em; margin-right:4px;">+</span> Library';
                this.btnAddNew.title = "Add other scores from library";
                this.btnAddNew.onclick = () => this.showScorePicker(setId);
            }
        }

        // Show Detail View
        this.detailView.classList.remove('hidden')
        this.detailTitle.textContent = list.title

        this.renderDetailList()
    }

    closeDetailView() {
        console.log('[SetlistManager] Closing detail view...');
        this.activeDetailSetId = null

        // Hide Detail View
        this.detailView.classList.add('hidden')

        // Reset button for next time
        if (this.btnAddNew) {
            this.btnAddNew.innerHTML = '<span style="font-size:1.1em; margin-right:4px;">+</span> Score';
        }

        // Restore header and toolbar
        document.querySelector('.library-header')?.classList.remove('hidden-important')
        document.querySelector('.library-toolbar')?.classList.remove('hidden-important')

        const tabs = document.querySelectorAll('.library-tabs .segment-btn')
        let activeTab = 'scores'
        tabs.forEach(t => { if (t.classList.contains('active')) activeTab = t.dataset.tab })

        console.log('[SetlistManager] Restoring active tab:', activeTab);
        const libGrid = document.getElementById('library-grid');
        const setGrid = document.getElementById('setlist-grid');
        
        if (libGrid) libGrid.classList.toggle('hidden', activeTab !== 'scores');
        if (setGrid) setGrid.classList.toggle('hidden', activeTab !== 'setlists');

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
                display: flex; align-items: center; padding: 6px 12px;
            background: rgba(255,255,255,0.03); border-radius: 6px;
            margin-bottom: 2px;
            border: 1px solid rgba(255,255,255,0.08);
            transition: transform 0.2s, opacity 0.2s, background 0.15s;
            ${!isDeleted ? 'cursor: pointer;' : ''}
            `
            if (!isDeleted) {
                row.addEventListener('mouseenter', () => { row.style.background = 'rgba(255,255,255,0.1)' })
                row.addEventListener('mouseleave', () => { row.style.background = 'rgba(255,255,255,0.05)' })
            }

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

            row.querySelector('.remove-score-btn').onclick = (e) => {
                e.stopPropagation()
                if (confirm('Remove this score from the setlist?')) {
                    this.removeScore(list.id, fp).then(() => this.renderDetailList())
                }
            }

            if (!isDeleted) {
                row.onclick = (e) => {
                    if (e.target.closest('.remove-score-btn')) return
                    this.app.scoreManager.loadScore(fp)
                }
            }

            this.detailList.appendChild(row)
        })
    }

    showScorePicker(setId) {
        const list = this.getSetlist(setId)
        if (!list) return

        const alreadyIn = new Set(list.scores.map(item => typeof item === 'object' ? item.fingerprint : item))
        const available = (this.app.scoreManager?.registry || [])
            .filter(s => !alreadyIn.has(s.fingerprint) && !s.isCloudOnly)

        // Replace the list area with picker UI (keeps header + Back button visible)
        this.detailList.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-shrink:0;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" style="flex-shrink:0;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="picker-search-input" type="text" placeholder="Search scores…"
                    style="flex:1; background:var(--bg-app); border:1px solid var(--border); border-radius:10px; padding:8px 12px; color:var(--text-main); font-size:14px; font-family:inherit; outline:none;">
            </div>
            <div id="picker-score-list" style="display:flex; flex-direction:column; gap:2px;"></div>
        `

        // Swap Add Score button to "✓ Done" while picker is open
        if (this.btnAddNew) {
            this.btnAddNew.textContent = '✓ Done'
            this.btnAddNew.onclick = () => {
                this.openDetailView(setId) // This will properly reset the button to + Current or + Library
            }
        }

        const searchInput = this.detailList.querySelector('#picker-search-input')
        const scoreList = this.detailList.querySelector('#picker-score-list')

        const renderList = (query = '') => {
            const q = query.toLowerCase()
            const filtered = q
                ? available.filter(s => (s.title || '').toLowerCase().includes(q) || (s.composer || '').toLowerCase().includes(q))
                : available

            scoreList.innerHTML = ''

            if (filtered.length === 0) {
                scoreList.innerHTML = `<div style="text-align:center; padding:40px 0; opacity:0.5; font-style:italic;">${q ? 'No matches.' : 'All scores are already in this setlist.'}</div>`
                return
            }

            filtered.forEach(score => {
                const row = document.createElement('div')
                row.style.cssText = `
                    display:flex; align-items:center; gap:12px; padding:10px 0;
                    border-bottom:1px solid rgba(255,255,255,0.06); cursor:pointer;
                `
                row.innerHTML = `
                    <div style="width:36px; height:46px; border-radius:4px; background:var(--bg-app); border:1px solid var(--border); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0; overflow:hidden;">
                        ${score.thumbnail ? `<img src="${score.thumbnail}" style="width:100%;height:100%;object-fit:cover;">` : '🎼'}
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:14px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${score.title || 'Untitled'}</div>
                        <div style="font-size:12px; opacity:0.6; margin-top:2px;">${score.composer || 'Unknown'}</div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2.5" style="flex-shrink:0;opacity:0.7;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                `
                row.addEventListener('mouseenter', () => { row.style.background = 'rgba(99,102,241,0.08)'; row.style.borderRadius = '8px' })
                row.addEventListener('mouseleave', () => { row.style.background = ''; row.style.borderRadius = '' })

                row.addEventListener('click', async () => {
                    await this.addScore(setId, score.fingerprint)
                    alreadyIn.add(score.fingerprint)
                    const idx = available.findIndex(s => s.fingerprint === score.fingerprint)
                    if (idx !== -1) available.splice(idx, 1)
                    this.renderDetailList()
                    renderList(searchInput.value)
                })

                scoreList.appendChild(row)
            })
        }

        renderList()
        setTimeout(() => searchInput.focus(), 50)

        searchInput.addEventListener('input', () => renderList(searchInput.value))
    }
}
