import * as db from '../db.js'

export class SidebarManager {
    constructor(app) {
        this.app = app
    }

    initSidebarResizable() {
        if (!this.app.sidebarResizer) return
        let isResizing = false
        this.app.sidebarResizer.addEventListener('mousedown', (e) => {
            isResizing = true
            document.body.style.cursor = 'col-resize'
            e.preventDefault()
        })
        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return
            const newWidth = window.innerWidth - e.clientX
            if (newWidth > 150 && newWidth < 600) {
                this.app.sidebar.style.width = `${newWidth}px`
            }
        })
        window.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false
                document.body.style.cursor = ''
            }
        })
    }

    initTabs() {
        const tabs = document.querySelectorAll('.sidebar-tab')
        const panels = document.querySelectorAll('.tab-panel')

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const targetPanel = tab.dataset.tab

                // Update tabs
                tabs.forEach(t => t.classList.remove('active'))
                tab.classList.add('active')

                // Update panels
                panels.forEach(p => {
                    if (p.dataset.panel === targetPanel) {
                        p.classList.add('active')
                    } else {
                        p.classList.remove('active')
                    }
                })

                // Optional: trigger refresh for specific tabs
                if (targetPanel === 'score-detail' && this.app.scoreDetailManager) {
                    this.app.scoreDetailManager.refreshStats()
                }
            })
        })
    }

    renderRecentSoloScores() {
        if (!this.app.recentScoresList) return
        this.app.recentScoresList.innerHTML = ''
        if (!this.app.recentSoloScores || this.app.recentSoloScores.length === 0) {
            this.app.recentScoresList.innerHTML = '<div class="empty-state">No recent solo scores recorded.</div>'
            return
        }
        this.app.recentSoloScores.forEach(score => {
            const card = document.createElement('div')
            card.className = 'recent-score-card'
            card.innerHTML = `
        <div class="recent-score-icon">🎼</div>
        <div class="recent-score-info">
          <div class="recent-score-name">${score.name}</div>
          <div class="recent-score-date">Last Opened: ${score.date}</div>
        </div>
      `
            card.addEventListener('click', (e) => {
                e.stopPropagation()
                this.app.openRecentScore(score.name)
            })
            this.app.recentScoresList.appendChild(card)
        })
    }

    renderWelcomeRecentScores() {
        if (!this.app.welcomeRecentList) return
        this.app.welcomeRecentList.innerHTML = ''
        if (!this.app.recentSoloScores || this.app.recentSoloScores.length === 0) {
            this.app.welcomeRecentList.innerHTML = '<div class="empty-state">No recent scores yet.</div>'
            return
        }
        this.app.recentSoloScores.forEach(score => {
            const item = document.createElement('div')
            item.className = 'sidebar-recent-item'
            item.title = score.name
            item.innerHTML = `
        <span class="sidebar-recent-icon">🎼</span>
        <span class="sidebar-recent-name">${score.name.replace(/\.pdf$/i, '')}</span>
        <span class="sidebar-recent-date">${score.date}</span>
      `
            item.addEventListener('click', (e) => {
                e.stopPropagation()
                this.app.openRecentScore(score.name)
            })
            this.app.welcomeRecentList.appendChild(item)
        })
    }

    renderSidebarRecentScores() {
        if (!this.app.sidebarRecentList) return
        this.app.sidebarRecentList.innerHTML = ''
        if (!this.app.recentSoloScores || this.app.recentSoloScores.length === 0) {
            this.app.sidebarRecentList.innerHTML = '<div class="empty-state">No recent scores yet.</div>'
            return
        }
        this.app.recentSoloScores.forEach(score => {
            const item = document.createElement('div')
            item.className = 'sidebar-recent-item'
            item.title = score.name
            item.innerHTML = `
        <span class="sidebar-recent-icon">🎼</span>
        <span class="sidebar-recent-name">${score.name.replace(/\.pdf$/i, '')}</span>
        <span class="sidebar-recent-date">${score.date}</span>
      `
            item.onclick = () => this.app.openRecentScore(score.name)
            this.app.sidebarRecentList.appendChild(item)
        })
    }

    initSettings() {
        const navDividerToggle = document.getElementById('settings-show-nav-dividers')
        if (navDividerToggle) {
            // Load state from localStorage
            const showNavDividers = localStorage.getItem('scoreflow_show_nav_dividers') === 'true'
            navDividerToggle.checked = showNavDividers
            if (showNavDividers) document.body.classList.add('show-nav-dividers')

            navDividerToggle.addEventListener('change', (e) => {
                const checked = e.target.checked
                localStorage.setItem('scoreflow_show_nav_dividers', checked)
                if (checked) {
                    document.body.classList.add('show-nav-dividers')
                } else {
                    document.body.classList.remove('show-nav-dividers')
                }
            })
        }
    }
}
