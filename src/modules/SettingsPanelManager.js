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
            // Only enable draggable on Desktop if not in "Shelf" design
            // For now, user wants "Fixed Stacked Shelf" as the standard
            // this.initDraggable() 
        }

        const closeBtn = document.getElementById('btn-close-settings')
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggle(false))
        }

        this.resizeHandle = this.panel?.querySelector('.panel-resize-handle')
        this.initSettings()
        // this.initResizable() // REQ: Disable resize function
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
        // Do nothing inline for "Stacked Shelf" pattern
        // Let CSS handle centering (left: 50%, transform: translate(-50%, ...))
    }

    toggle(force = null) {
        if (!this.panel) return
        this.isVisible = force !== null ? force : !this.isVisible

        if (this.isVisible) {
            this.app.uiManager.closeAllActivePanels('SettingsPanelManager')
            // Must add active class FIRST so dimensions (offsetWidth) are available
            this.panel.classList.add('active')

            // Bring to front among panels (above library overlay 5000)
            document.querySelectorAll('.jump-sub-panel').forEach(p => p.style.zIndex = '11500')
            this.panel.style.zIndex = '11501'

            // Reset style to let CSS values take over
            this.panel.style.left = ''
            this.panel.style.top = ''
            this.panel.style.bottom = ''
            this.panel.style.transform = ''
            
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
            const stored = localStorage.getItem('scoreflow_show_nav_dividers')
            const showNavDividers = (stored === null) ? true : (stored === 'true')
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
                this.updateSliderGradient(stampSizeInput)
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
                this.updateSliderGradient(jumpOffsetInput)
                this.app.saveToStorage()
            })
        }

        // Jump Speed
        const jumpSpeedInput = document.getElementById('settings-jump-speed')
        const jumpSpeedValue = document.getElementById('settings-jump-speed-value')
        if (jumpSpeedInput) {
            const currentSpeed = this.app.rulerManager ? this.app.rulerManager.jumpDurationMs : 300
            jumpSpeedInput.value = currentSpeed
            if (jumpSpeedValue) jumpSpeedValue.textContent = `${currentSpeed}ms`

            jumpSpeedInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value)
                if (this.app.rulerManager) {
                    this.app.rulerManager.jumpDurationMs = val
                }
                if (jumpSpeedValue) jumpSpeedValue.textContent = `${val}ms`
                this.updateSliderGradient(jumpSpeedInput)
                localStorage.setItem('scoreflow_jump_speed_ms', val)
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

        // Initialize adjustment buttons for ALL sliders in this panel
        this.panel.querySelectorAll('.slider-adj-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const targetId = btn.dataset.target
                const slider = document.getElementById(targetId)
                if (!slider) return

                const isPlus = btn.classList.contains('plus')
                const step = parseFloat(slider.step) || 1
                const min = parseFloat(slider.min) || 0
                const max = parseFloat(slider.max) || 100
                let val = parseFloat(slider.value)

                if (isPlus) {
                    val = Math.min(max, val + step)
                } else {
                    val = Math.max(min, val - step)
                }

                slider.value = val
                slider.dispatchEvent(new Event('input'))
            })
        })

        // Initialize individual Reset buttons
        this.panel.querySelectorAll('.btn-reset-mini').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.reset
                if (type === 'stamp-size') {
                    const slider = document.getElementById('settings-stamp-size')
                    if (slider) { slider.value = 1.0; slider.dispatchEvent(new Event('input')) }
                } else if (type === 'jump-offset') {
                    const slider = document.getElementById('settings-jump-offset')
                    if (slider) { slider.value = 40; slider.dispatchEvent(new Event('input')) }
                } else if (type === 'jump-speed') {
                    const slider = document.getElementById('settings-jump-speed')
                    if (slider) { slider.value = 300; slider.dispatchEvent(new Event('input')) }
                } else if (type === 'offset-touch') {
                    const slider = document.getElementById('settings-offset-touch')
                    if (slider) { slider.value = 65; slider.dispatchEvent(new Event('input')) }
                } else if (type === 'offset-mouse') {
                    const slider = document.getElementById('settings-offset-mouse')
                    if (slider) { slider.value = 25; slider.dispatchEvent(new Event('input')) }
                } else if (type === 'pointer-idle') {
                    const slider = document.getElementById('settings-pointer-idle')
                    if (slider) { slider.value = 8; slider.dispatchEvent(new Event('input')) }
                }
            })
        })

        // Interaction Offset - Touch
        const offsetTouchInput = document.getElementById('settings-offset-touch')
        const offsetTouchValue = document.getElementById('settings-offset-touch-value')
        if (offsetTouchInput) {
            offsetTouchInput.value = this.app.stampOffsetTouchY || 65
            if (offsetTouchValue) offsetTouchValue.textContent = `${offsetTouchInput.value}px`
            offsetTouchInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value)
                this.app.stampOffsetTouchY = val
                if (offsetTouchValue) offsetTouchValue.textContent = `${val}px`
                this.updateSliderGradient(offsetTouchInput)
                this.app.saveToStorage()
            })
        }

        // Interaction Offset - Mouse
        const offsetMouseInput = document.getElementById('settings-offset-mouse')
        const offsetMouseValue = document.getElementById('settings-offset-mouse-value')
        if (offsetMouseInput) {
            offsetMouseInput.value = this.app.stampOffsetMouseY || 25
            if (offsetMouseValue) offsetMouseValue.textContent = `${offsetMouseInput.value}px`
            offsetMouseInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value)
                this.app.stampOffsetMouseY = val
                if (offsetMouseValue) offsetMouseValue.textContent = `${val}px`
                this.updateSliderGradient(offsetMouseInput)
                this.app.saveToStorage()
            })
        }

        // Pointer Idle Lock Time
        const pointerIdleInput = document.getElementById('settings-pointer-idle')
        const pointerIdleValue = document.getElementById('settings-pointer-idle-value')
        if (pointerIdleInput) {
            pointerIdleInput.value = Math.round((this.app.pointerIdleTimeoutMs || 8000) / 1000)
            if (pointerIdleValue) pointerIdleValue.textContent = `${pointerIdleInput.value}s`
            
            pointerIdleInput.addEventListener('input', (e) => {
                const valSec = parseInt(e.target.value)
                this.app.pointerIdleTimeoutMs = valSec * 1000
                if (pointerIdleValue) pointerIdleValue.textContent = `${valSec}s`
                this.updateSliderGradient(pointerIdleInput)
                this.app.saveToStorage()
            })
        }

        // Initialize all gradients
        this.panel.querySelectorAll('input[type="range"].setting-slider').forEach(input => {
            this.updateSliderGradient(input)
        })
    }

    updateSliderGradient(input) {
        if (!input) return
        const min = parseFloat(input.min) || 0
        const max = parseFloat(input.max) || 100
        const val = parseFloat(input.value)
        const percentage = ((val - min) / (max - min)) * 100
        input.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, rgba(0,0,0,0.1) ${percentage}%)`
    }
}
