import * as db from '../db.js'

export class LibraryManager {
    constructor(app) {
        this.app = app
    }

    toggleQuickLoadModal(show) {
        if (!this.app.quickLoadModal) return
        if (show ?? !this.app.quickLoadModal.classList.contains('active')) {
            this.app.quickLoadModal.classList.add('active')
            this.renderRecentSoloScores()
        } else {
            this.app.quickLoadModal.classList.remove('active')
        }
    }

    async addToRecentSoloScores(name) {
        let recent = await db.get('recent_solo_scores') || []
        recent = recent.filter(n => n !== name)
        recent.unshift(name)
        recent = recent.slice(0, 10)
        await db.set('recent_solo_scores', recent)
        this.renderRecentSoloScores()
        this.renderWelcomeRecentScores()
        this.renderSidebarRecentScores()
    }

    async renderRecentSoloScores() {
        const container = document.getElementById('recent-scores-list')
        if (!container) return

        const recent = await db.get('recent_solo_scores') || []
        if (recent.length === 0) {
            container.innerHTML = `<div class="empty-recent">No recent scores</div>`
            return
        }

        container.innerHTML = ''
        for (const name of recent) {
            const handle = await db.get(`recent_handle_${name}`)
            if (!handle) continue

            const div = document.createElement('div')
            div.className = 'recent-score-item'
            div.innerHTML = `
                <div class="score-info">
                    <span class="score-name">${name}</span>
                </div>
                <button class="load-btn">Open</button>
            `
            div.querySelector('.load-btn').onclick = () => {
                this.app.openFileHandle(handle)
                this.toggleQuickLoadModal(false)
            }
            container.appendChild(div)
        }
    }

    async renderWelcomeRecentScores() {
        const container = document.getElementById('welcome-recent-scores')
        if (!container) return

        const recent = await db.get('recent_solo_scores') || []
        if (recent.length === 0) {
            container.innerHTML = ''
            return
        }

        container.innerHTML = '<h3 class="welcome-section-title">Continue Reading</h3><div class="welcome-recent-grid"></div>'
        const grid = container.querySelector('.welcome-recent-grid')

        for (const name of recent.slice(0, 4)) {
            const handle = await db.get(`recent_handle_${name}`)
            if (!handle) continue

            const card = document.createElement('div')
            card.className = 'welcome-recent-card'
            card.innerHTML = `
                <div class="recent-card-icon">📄</div>
                <div class="recent-card-info">
                   <div class="recent-card-name">${name}</div>
                </div>
            `
            card.onclick = () => this.app.openFileHandle(handle)
            grid.appendChild(card)
        }
    }

    async renderSidebarRecentScores() {
        const container = document.getElementById('sidebar-recent-list')
        if (!container) return

        const recent = await db.get('recent_solo_scores') || []
        if (recent.length === 0) {
            container.innerHTML = '<div class="sidebar-empty">No recent scores</div>'
            return
        }

        container.innerHTML = ''
        for (const name of recent) {
            const handle = await db.get(`recent_handle_${name}`)
            if (!handle) continue

            const item = document.createElement('div')
            item.className = 'sidebar-recent-item'
            item.innerHTML = `
                <span class="recent-item-icon">📄</span>
                <span class="recent-item-name">${name}</span>
            `
            item.onclick = () => {
                this.app.openFileHandle(handle)
                if (window.innerWidth < 1024) {
                    const closeSidebar = () => {
                        const sidebar = document.getElementById('sidebar')
                        if (sidebar) sidebar.classList.remove('active')
                        const overlay = document.getElementById('sidebar-overlay')
                        if (overlay) overlay.classList.remove('active')
                    }
                    closeSidebar()
                }
            }
            container.appendChild(item)
        }
    }
}
