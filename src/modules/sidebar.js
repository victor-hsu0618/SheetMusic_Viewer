import * as db from '../db.js'

export class SidebarManager {
    constructor(app) {
        this.app = app
        this.libraryFiles = []
        this.libraryFolderHandle = null
        this.recentSoloScores = []
        this.scoreFingerprintMap = {}
    }

    async selectLibraryFolder() {
        try {
            this.libraryFolderHandle = await window.showDirectoryPicker()
            this.app.libraryFolderHandle = this.libraryFolderHandle
            await db.set('last_library_handle', this.libraryFolderHandle)
            this.libraryFiles = []
            await this.app.scanLibrary(this.libraryFolderHandle)
            this.renderLibrary()

            const lastScore = localStorage.getItem('scoreflow_last_opened_score')
            if (lastScore) {
                const found = this.libraryFiles.find(f => f.name === lastScore)
                if (found) {
                    const file = await found.getFile()
                    const arrayBuffer = await file.arrayBuffer()
                    await this.app.viewerManager.loadPDF(new Uint8Array(arrayBuffer))
                    this.app.activeScoreName = found.name
                    this.renderLibrary()
                    this.app.hideWelcome()
                }
            }
        } catch (err) {
            console.warn('Library selection cancelled:', err)
        }
    }

    renderLibrary() {
        if (!this.app.libraryList) return
        this.app.libraryList.innerHTML = ''

        const query = this.app.librarySearchInput ? this.app.librarySearchInput.value.toLowerCase() : ''
        const filteredFiles = this.libraryFiles.filter(f => f.name.toLowerCase().includes(query))

        if (this.libraryFiles.length === 0) return

        if (filteredFiles.length === 0 && query) {
            this.app.libraryList.innerHTML = '<div class="empty-state">No matching scores.</div>'
            return
        }

        filteredFiles.forEach(fileHandle => {
            const isActive = this.app.activeScoreName === fileHandle.name
            const displayName = fileHandle.name.replace(/\.pdf$/i, '')
            const fingerprint = this.app.scoreFingerprintMap[fileHandle.name]

            const hasLocal = fingerprint && localStorage.getItem(`scoreflow_stamps_${fingerprint}`)

            const item = document.createElement('div')
            item.className = `score-item ${isActive ? 'active' : ''}`
            item.innerHTML = `
        <div class="score-item-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="score-name">${displayName}</div>
        <div class="score-badges">
          ${hasLocal ? '<span class="score-badge-mini local" title="Local Annotations">L</span>' : ''}
        </div>
        <div class="score-actions">
          <button class="btn-score-action btn-clear-score" title="Clear All Annotations">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
        ${isActive ? '<div class="active-indicator-dot"></div>' : ''}
      `

            item.onclick = async (e) => {
                if (e.target.closest('.score-actions')) return
                try {
                    const file = await this.app.viewerManager.openFileHandle(fileHandle)
                    if (!file) return
                    const arrayBuffer = await file.arrayBuffer()
                    await this.app.viewerManager.loadPDF(new Uint8Array(arrayBuffer))
                    this.app.activeScoreName = fileHandle.name
                    this.app.saveToStorage()
                    this.renderLibrary()
                    if (!this.app.isSidebarLocked) {
                        this.app.sidebar.classList.remove('open')
                        this.app.updateLayoutState()
                    }
                } catch (err) {
                    console.error('Failed to open score:', fileHandle.name, err)
                }
            }
            item.querySelector('.btn-clear-score').onclick = (e) => {
                e.stopPropagation()
                this.app.clearScoreAnnotations(fileHandle.name)
            }
            this.app.libraryList.appendChild(item)
        })
    }

    renderSidebarRecentScores() {
        if (!this.app.sidebarRecentList) return
        this.app.sidebarRecentList.innerHTML = ''
        if (!this.recentSoloScores || this.recentSoloScores.length === 0) {
            this.app.sidebarRecentList.innerHTML = '<div class="empty-state">No recent scores yet.</div>'
            return
        }
        this.recentSoloScores.forEach(score => {
            const item = document.createElement('div')
            item.className = 'sidebar-recent-item'
            item.title = score.name
            item.innerHTML = `
        <span class="sidebar-recent-icon">🎼</span>
        <span class="sidebar-recent-name">${score.name.replace(/\.pdf$/i, '')}</span>
        <span class="sidebar-recent-date">${score.date}</span>
      `
            item.onclick = async () => {
                const closeSidebar = () => { if (!this.app.isSidebarLocked) { this.app.sidebar.classList.remove('open'); this.app.updateLayoutState() } }

                const storedHandle = await db.get(`recent_handle_${score.name}`)
                if (storedHandle) {
                    const file = await this.app.viewerManager.openFileHandle(storedHandle)
                    if (file) {
                        const buf = await file.arrayBuffer()
                        this.app.activeScoreName = score.name
                        await this.app.viewerManager.loadPDF(new Uint8Array(buf))
                        closeSidebar()
                        return
                    }
                }
                const cachedBuf = await db.get(`recent_buf_${score.name}`)
                if (cachedBuf) {
                    this.app.activeScoreName = score.name
                    await this.app.viewerManager.loadPDF(new Uint8Array(cachedBuf))
                    closeSidebar()
                    return
                }
                const libraryMatch = this.libraryFiles.find(f => f.name === score.name)
                if (libraryMatch) {
                    const file = await this.app.viewerManager.openFileHandle(libraryMatch)
                    if (file) {
                        const buf = await file.arrayBuffer()
                        this.app.activeScoreName = score.name
                        await this.app.viewerManager.loadPDF(new Uint8Array(buf))
                        closeSidebar()
                    }
                    return
                }
                alert(`Cannot reopen "${score.name}".`)
            }
            this.app.sidebarRecentList.appendChild(item)
        })
    }

}
