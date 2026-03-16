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
        this.initStampSizes()
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
        // Edit Scrollbar
        const editScrollbarToggle = document.getElementById('settings-edit-scrollbar')
        if (editScrollbarToggle) {
            const stored = localStorage.getItem('scoreflow_edit_scrollbar')
            const enabled = stored === null ? true : stored === 'true'
            editScrollbarToggle.checked = enabled
            document.body.classList.toggle('edit-scrollbar-hidden', !enabled)

            editScrollbarToggle.addEventListener('change', (e) => {
                localStorage.setItem('scoreflow_edit_scrollbar', e.target.checked)
                document.body.classList.toggle('edit-scrollbar-hidden', !e.target.checked)
            })
        }

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

        // Reload App
        const reloadAppBtn = document.getElementById('btn-reload-app')
        if (reloadAppBtn) {
            reloadAppBtn.addEventListener('click', () => location.reload())
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

        // Cloud Log viewer button
        const loadLogBtn = document.getElementById('btn-load-cloud-log')
        if (loadLogBtn) {
            loadLogBtn.addEventListener('click', async () => {
                const viewer = document.getElementById('cloud-log-viewer')
                const entries = document.getElementById('cloud-log-entries')
                if (!viewer || !entries) return

                loadLogBtn.textContent = '載入中...'
                loadLogBtn.disabled = true

                const log = this.app.driveSyncManager?.log
                const data = log ? await log.fetchAll() : null

                loadLogBtn.textContent = '載入雲端歷史紀錄'
                loadLogBtn.disabled = false

                if (!data) {
                    entries.innerHTML = '<div style="color:#ef4444;padding:4px">無法讀取 (未連接或發生錯誤)</div>'
                    viewer.classList.remove('hidden')
                    return
                }
                if (data.length === 0) {
                    entries.innerHTML = '<div style="opacity:0.5;padding:4px">尚無紀錄</div>'
                    viewer.classList.remove('hidden')
                    return
                }

                const actionIcon = { push: '↑', pull: '↓', signin: '🔑', signout: '🔒', scan: '🔍', pdf_upload: '📤', pdf_download: '📥' }
                const now = Date.now()
                const fmt = ts => {
                    const diff = now - ts
                    if (diff < 60000) return `${Math.floor(diff/1000)}s ago`
                    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`
                    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
                    return new Date(ts).toLocaleDateString()
                }
                entries.innerHTML = data.map(e => {
                    const icon = actionIcon[e.action] || '•'
                    const color = e.action === 'push' ? '#6ee7b7' : e.action === 'pull' ? '#93c5fd' : e.action.startsWith('sign') ? '#fde68a' : '#d1d5db'
                    return `<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.06);color:${color}">`
                        + `<span style="opacity:0.45;margin-right:6px">${fmt(e.ts)}</span>`
                        + `<span style="margin-right:4px">${icon}</span>`
                        + `<span style="opacity:0.7;margin-right:4px">${e.user}@${e.device}</span>`
                        + `<span>${e.detail || ''}</span>`
                        + `</div>`
                }).join('')

                viewer.classList.remove('hidden')
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

    initStampSizes() {
        const container = document.getElementById('settings-pane-stamps')
        if (!container) return

        const STAMP_CATEGORIES = ['B.Fingering', 'Articulation', 'Text', 'Others']
        const STAMP_TYPES = ['text', 'path', 'shape', 'complex']
        const overrides = this.app.stampSizeOverrides || {}

        // Build a toolId → tool map for quick lookup during event wiring
        const toolMap = {}
        STAMP_CATEGORIES.forEach(catName => {
            this.app.toolsets?.find(g => g.name === catName)?.tools
                .filter(t => t.draw && STAMP_TYPES.includes(t.draw.type))
                .forEach(t => { toolMap[t.id] = t })
        })

        let html = `<div class="stamp-cal-header">
            <span>Preview at default zoom (1.5×)</span>
            <button id="btn-reset-all-stamp-sizes" class="btn-reset-all">Reset All</button>
        </div>`

        STAMP_CATEGORIES.forEach(catName => {
            const group = this.app.toolsets?.find(g => g.name === catName)
            if (!group) return
            const tools = group.tools.filter(t => t.draw && STAMP_TYPES.includes(t.draw.type))
            if (!tools.length) return

            html += `<div class="tab-section-label">${catName}</div><div class="stamp-cal-list">`
            tools.forEach(tool => {
                const defaultSize = tool.draw.size ?? 24
                const currentSize = overrides[tool.id] ?? defaultSize
                const isOverridden = tool.id in overrides
                html += `
                <div class="stamp-cal-row" data-tool-id="${tool.id}" data-default="${defaultSize}">
                    <div class="stamp-cal-preview">
                        <canvas class="stamp-preview-canvas" width="64" height="36"></canvas>
                    </div>
                    <div class="stamp-cal-label">${tool.label}</div>
                    <div class="stamp-cal-controls">
                        <button class="stamp-cal-btn minus" aria-label="Decrease">−</button>
                        <input type="number" class="stamp-cal-input" value="${currentSize}" min="6" max="80" step="1">
                        <button class="stamp-cal-btn plus" aria-label="Increase">+</button>
                        <button class="stamp-cal-reset ${isOverridden ? '' : 'invisible'}" title="Reset to default (${defaultSize})">↺</button>
                    </div>
                </div>`
            })
            html += `</div>`
        })

        container.innerHTML = html

        // Initial preview render for all rows
        container.querySelectorAll('.stamp-cal-row').forEach(row => {
            const toolId = row.dataset.toolId
            const tool = toolMap[toolId]
            const currentSize = overrides[toolId] ?? (tool?.draw?.size ?? 24)
            const canvas = row.querySelector('.stamp-preview-canvas')
            if (tool && canvas) this._renderStampPreview(canvas, tool, currentSize)
        })

        // Wire events
        container.querySelectorAll('.stamp-cal-row').forEach(row => {
            const toolId = row.dataset.toolId
            const tool = toolMap[toolId]
            const defaultSize = parseInt(row.dataset.default)
            const input = row.querySelector('.stamp-cal-input')
            const resetBtn = row.querySelector('.stamp-cal-reset')
            const canvas = row.querySelector('.stamp-preview-canvas')

            const apply = (val) => {
                val = Math.max(6, Math.min(80, Math.round(val)))
                if (isNaN(val)) return
                input.value = val
                if (val === defaultSize) {
                    delete this.app.stampSizeOverrides[toolId]
                    resetBtn.classList.add('invisible')
                } else {
                    this.app.stampSizeOverrides[toolId] = val
                    resetBtn.classList.remove('invisible')
                }
                if (tool && canvas) this._renderStampPreview(canvas, tool, val)
                this.app.saveToStorage()
                this._triggerAnnotationRerender()
            }

            row.querySelector('.stamp-cal-btn.minus').addEventListener('click', () => apply(parseInt(input.value) - 1))
            row.querySelector('.stamp-cal-btn.plus').addEventListener('click', () => apply(parseInt(input.value) + 1))
            input.addEventListener('change', () => apply(parseInt(input.value)))
            resetBtn.addEventListener('click', () => apply(defaultSize))
        })

        // Reset All button
        const resetAllBtn = container.querySelector('#btn-reset-all-stamp-sizes')
        if (resetAllBtn) {
            resetAllBtn.addEventListener('click', () => {
                this.app.stampSizeOverrides = {}
                this.app.saveToStorage()
                this._triggerAnnotationRerender()
                this.initStampSizes()
            })
        }
    }

    _renderStampPreview(canvas, tool, size) {
        const dpr = window.devicePixelRatio || 1
        const W = 64
        const H = 36
        canvas.width = W * dpr
        canvas.height = H * dpr
        canvas.style.width = W + 'px'
        canvas.style.height = H + 'px'

        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, W, H)

        const d = tool.draw
        if (!d) return

        // Use the panel's computed text color for theming
        const color = getComputedStyle(this.panel).color || '#6366f1'
        const x = W / 2
        const y = H / 2

        ctx.fillStyle = color
        ctx.strokeStyle = color

        switch (d.type) {
            case 'text': {
                const font = d.font || ''
                const face = d.fontFace || 'Outfit'
                ctx.font = `${font} ${size}px ${face}`
                ctx.textAlign = 'center'
                ctx.textBaseline = 'middle'
                ctx.fillText(d.content || '', x, y)
                break
            }
            case 'path': {
                ctx.save()
                ctx.translate(x, y)
                ctx.scale(size, size)
                ctx.lineWidth = (d.strokeWidth || 2.5) / size
                ctx.strokeStyle = color
                ctx.lineCap = 'round'
                try {
                    const p = new Path2D(d.data)
                    ctx.stroke(p)
                    if (d.fill !== 'none') { ctx.fillStyle = color; ctx.fill(p) }
                } catch (e) { /* ignore malformed path */ }
                ctx.restore()
                break
            }
            case 'shape': {
                if (d.shape === 'circle') {
                    const r = d.radius * size
                    ctx.beginPath()
                    ctx.arc(x, y, r, 0, Math.PI * 2)
                    if (d.fill) { ctx.fill() }
                    else { ctx.lineWidth = 1.2; ctx.stroke() }
                }
                break
            }
            case 'complex': {
                if (d.variant === 'fermata') {
                    const fs = size * 0.45
                    ctx.beginPath(); ctx.lineWidth = 1.5
                    ctx.arc(x, y, fs, Math.PI, 0); ctx.stroke()
                    ctx.beginPath()
                    ctx.arc(x, y - fs * 0.3, fs * 0.15, 0, Math.PI * 2)
                    ctx.fill()
                } else if (d.variant === 'thumb') {
                    ctx.lineWidth = 0.9
                    ctx.beginPath()
                    ctx.ellipse(x, y - size * 0.15, size * 0.12, size * 0.28, 0, 0, Math.PI * 2)
                    ctx.stroke()
                    ctx.beginPath()
                    ctx.moveTo(x, y + size * 0.13)
                    ctx.lineTo(x, y + size * 0.38)
                    ctx.stroke()
                } else if (d.variant === 'anchor') {
                    const s = size * 0.65
                    // 圓點
                    ctx.beginPath()
                    ctx.arc(x, y - s * 1.1, s * 0.18, 0, Math.PI * 2)
                    ctx.fill()
                    // 直棒
                    ctx.lineWidth = s * 0.15
                    ctx.beginPath()
                    ctx.moveTo(x, y - s * 0.9)
                    ctx.lineTo(x, y + s * 0.3)
                    ctx.stroke()
                    // 橫桿
                    ctx.beginPath()
                    ctx.moveTo(x - s * 0.6, y)
                    ctx.lineTo(x + s * 0.6, y)
                    ctx.stroke()
                    // 弧形
                    ctx.beginPath()
                    ctx.arc(x, y, s * 0.6, 0, Math.PI, false)
                    ctx.stroke()
                }
                break
            }
        }
    }

    _triggerAnnotationRerender() {
        try {
            const am = this.app.annotationManager
            if (!am) return
            if (am.renderAllPages) { am.renderAllPages(); return }
            if (am.renderers) {
                Object.values(am.renderers).forEach(r => r?.renderAnnotations?.() || r?.render?.())
            }
        } catch (e) { /* silent */ }
    }
}
