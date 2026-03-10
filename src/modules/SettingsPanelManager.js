import * as db from '../db.js'

/**
 * SettingsPanelManager handles the floating "Global Settings" sub-panel.
 * It uses the "Calculator Style" (Draggable, Floating) interaction.
 */
export class SettingsPanelManager {
    constructor(app) {
        this.app = app
        this.panel = null
        this.dragHandle = null
        this.isVisible = false

        // Initial position
        this.posX = 80
        this.posY = 80
    }

    init() {
        this.panel = document.getElementById('settings-panel')
        this.dragHandle = this.panel?.querySelector('.jump-drag-handle')

        if (this.panel && this.dragHandle) {
            this.initDraggable()
        }

        const closeBtn = document.getElementById('btn-close-settings')
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggle(false))
        }

        this.resizeHandle = this.panel?.querySelector('.panel-resize-handle')
        this.initSettings()
        this.initResizable()
        this.initTabs()
    }

    initDraggable() {
        let isDragging = false
        let startX, startY

        const onMouseDown = (e) => {
            if (e.target.closest('button')) return
            isDragging = true
            startX = e.clientX - this.posX
            startY = e.clientY - this.posY
            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
        }

        const onMouseMove = (e) => {
            if (!isDragging) return
            this.posX = e.clientX - startX
            this.posY = e.clientY - startY

            // Constrain to viewport
            this.posX = Math.max(0, Math.min(window.innerWidth - this.panel.offsetWidth, this.posX))
            this.posY = Math.max(0, Math.min(window.innerHeight - this.panel.offsetHeight, this.posY))

            this.updatePosition()
        }

        const onMouseUp = () => {
            isDragging = false
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }

        this.dragHandle.addEventListener('mousedown', onMouseDown)

        // Touch support
        const onTouchStart = (e) => {
            if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return
            isDragging = true
            startX = e.touches[0].clientX - this.posX
            startY = e.touches[0].clientY - this.posY
            document.addEventListener('touchmove', onTouchMove, { passive: false })
            document.addEventListener('touchend', onTouchEnd)
        }
        const onTouchMove = (e) => {
            if (!isDragging) return
            e.preventDefault()
            this.posX = e.touches[0].clientX - startX
            this.posY = e.touches[0].clientY - startY
            this.updatePosition()
        }
        const onTouchEnd = () => {
            isDragging = false
            document.removeEventListener('touchmove', onTouchMove)
            document.removeEventListener('touchend', onTouchEnd)
        }
        this.dragHandle.addEventListener('touchstart', onTouchStart, { passive: false })
    }

    initResizable() {
        if (!this.resizeHandle) return
        let isResizing = false
        let startWidth, startHeight, startX, startY

        const onMouseDown = (e) => {
            isResizing = true
            startWidth = this.panel.offsetWidth
            startHeight = this.panel.offsetHeight
            startX = e.clientX
            startY = e.clientY
            document.addEventListener('mousemove', onMouseMove)
            document.addEventListener('mouseup', onMouseUp)
        }

        const onMouseMove = (e) => {
            if (!isResizing) return
            const newWidth = startWidth + (e.clientX - startX)
            const newHeight = startHeight + (e.clientY - startY)
            if (newWidth > 320) this.panel.style.width = `${newWidth}px`
            if (newHeight > 300) this.panel.style.height = `${newHeight}px`
        }

        const onMouseUp = () => {
            isResizing = false
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
        }

        this.resizeHandle.addEventListener('mousedown', onMouseDown)

        // Touch support
        const onTouchStart = (e) => {
            isResizing = true
            startWidth = this.panel.offsetWidth
            startHeight = this.panel.offsetHeight
            startX = e.touches[0].clientX
            startY = e.touches[0].clientY
            document.addEventListener('touchmove', onTouchMove, { passive: false })
            document.addEventListener('touchend', onTouchEnd)
        }
        const onTouchMove = (e) => {
            if (!isResizing) return
            e.preventDefault()
            const newWidth = startWidth + (e.touches[0].clientX - startX)
            const newHeight = startHeight + (e.touches[0].clientY - startY)
            if (newWidth > 320) this.panel.style.width = `${newWidth}px`
            if (newHeight > 300) this.panel.style.height = `${newHeight}px`
        }
        const onTouchEnd = () => {
            isResizing = false
            document.removeEventListener('touchmove', onTouchMove)
            document.removeEventListener('touchend', onTouchEnd)
        }
        this.resizeHandle.addEventListener('touchstart', onTouchStart, { passive: false })
    }

    initTabs() {
        const tabBtns = this.panel.querySelectorAll('.settings-tabs .segment-btn')
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab
                this.switchTab(tabId)
            })
        })
    }

    switchTab(tabId) {
        const tabBtns = this.panel.querySelectorAll('.settings-tabs .segment-btn')
        const tabPanes = this.panel.querySelectorAll('.settings-tab-pane')

        tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId)
        })

        tabPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `settings-pane-${tabId}`)
        })
    }

    updatePosition() {
        if (!this.panel) return
        this.panel.style.left = `${this.posX}px`
        this.panel.style.top = `${this.posY}px`
        this.panel.style.bottom = 'auto'
        this.panel.style.right = 'auto'
    }

    toggle(force = null) {
        if (!this.panel) return
        this.isVisible = force !== null ? force : !this.isVisible

        if (this.isVisible) {
            // Must add active class FIRST so dimensions (offsetWidth) are available
            this.panel.classList.add('active')

            // Auto-center on first open if still at default position
            if (this.posX === 80 && this.posY === 80) {
                // Dimensons are usually available immediately after adding class in most modern browsers
                const panelWidth = this.panel.offsetWidth || 320
                const panelHeight = this.panel.offsetHeight || 500

                this.posX = Math.max(0, (window.innerWidth - panelWidth) / 2)
                this.posY = Math.max(40, (window.innerHeight - panelHeight) / 2)
            }
            this.updatePosition()
            this.refreshUI()
        } else {
            this.panel.classList.remove('active')
        }
    }

    refreshUI() {
        // Refresh Profile Summary
        if (this.app.profileManager) {
            this.app.profileManager.render()
        }
        // Refresh Drive Status
        if (this.app.driveSyncManager) {
            this.app.driveSyncManager.refreshUI()
        }
    }

    initSettings() {
        // Nav Dividers
        const navDividerToggle = document.getElementById('settings-show-nav-dividers')
        if (navDividerToggle) {
            const showNavDividers = localStorage.getItem('scoreflow_show_nav_dividers') === 'true'
            navDividerToggle.checked = showNavDividers
            if (showNavDividers) document.body.classList.add('show-nav-dividers')

            navDividerToggle.addEventListener('change', (e) => {
                const checked = e.target.checked
                localStorage.setItem('scoreflow_show_nav_dividers', checked)
                document.body.classList.toggle('show-nav-dividers', checked)
            })
        }

        // Stamp Size
        const stampSizeInput = document.getElementById('settings-stamp-size')
        const stampSizeValue = document.getElementById('settings-stamp-size-value')
        if (stampSizeInput) {
            stampSizeInput.value = this.app.stampSizeMultiplier || 1.0
            if (stampSizeValue) stampSizeValue.textContent = `${parseFloat(stampSizeInput.value).toFixed(1)}x`

            stampSizeInput.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value)
                this.app.stampSizeMultiplier = val
                if (stampSizeValue) stampSizeValue.textContent = `${val.toFixed(1)}x`
                this.app.saveToStorage()
            })
        }

        // Jump Offset
        const jumpOffsetInput = document.getElementById('settings-jump-offset')
        const jumpOffsetValue = document.getElementById('settings-jump-offset-value')
        if (jumpOffsetInput) {
            // Convert px to cm if needed? Currently app uses px for this storage?
            // Existing app uses this.app.jumpOffsetPx
            jumpOffsetInput.value = this.app.jumpOffsetPx || 40
            if (jumpOffsetValue) jumpOffsetValue.textContent = `${jumpOffsetInput.value}px`

            jumpOffsetInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value)
                this.app.jumpOffsetPx = val
                if (jumpOffsetValue) jumpOffsetValue.textContent = `${val}px`
                this.app.saveToStorage()
            })
        }

        // Turner Mode
        const turnerSelect = document.getElementById('turner-mode-select')
        if (turnerSelect) {
            const stored = localStorage.getItem('scoreflow_turner_mode')
            if (stored) turnerSelect.value = stored
            turnerSelect.addEventListener('change', () => this.app.saveToStorage())
        }

        // Refresh Cloud Stats button
        const refreshStatsBtn = document.getElementById('btn-refresh-cloud-stats')
        if (refreshStatsBtn) {
            refreshStatsBtn.addEventListener('click', () => {
                if (this.app.driveSyncManager) {
                    this.app.driveSyncManager.refreshCloudStats()
                }
            })
        }

        // Reset Cloud Index button
        const resetCloudBtn = document.getElementById('btn-reset-cloud-index')
        if (resetCloudBtn) {
            resetCloudBtn.addEventListener('click', () => {
                if (this.app.driveSyncManager) {
                    this.app.driveSyncManager.resetCloudIndex()
                }
            })
        }
    }
}
