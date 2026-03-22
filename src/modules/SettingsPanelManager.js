import * as db from '../db.js'

/**
 * SettingsPanelManager — Settings panel (⚙ Doc Bar button).
 * Contains: Theme, Accent Color, Jump Speed, Idle Lock, Turner Mode, Maintenance.
 */
export class SettingsPanelManager {
    constructor(app) {
        this.app = app
        this.panel = null
        this.isVisible = false
    }

    init() {
        this.panel = document.getElementById('settings-panel')
        if (!this.panel) return

        document.getElementById('btn-close-settings')
            ?.addEventListener('click', () => this.toggle(false))

        this.initSettings()
    }

    toggle(force = null) {
        if (!this.panel) return
        const active = force !== null ? force : !this.isVisible
        this.isVisible = active

        const btn = this.app.docBarStripManager?.el?.querySelector('[data-activeId="doc-settings"]')
        if (btn) btn.classList.toggle('active', active)

        if (active) {
            this.app.uiManager.closeAllActivePanels('SettingsPanelManager')
            this.panel.classList.add('active')
        } else {
            this.panel.classList.remove('active')
        }
    }

    initSettings() {
        // Application Theme
        const themeSelect = document.getElementById('settings-app-theme')
        if (themeSelect) {
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'default'
            themeSelect.value = currentTheme
            themeSelect.addEventListener('change', (e) => {
                const themeId = e.target.value
                if (themeId === 'default') {
                    document.documentElement.removeAttribute('data-theme')
                } else {
                    document.documentElement.setAttribute('data-theme', themeId)
                }
                localStorage.setItem('scoreflow_theme', themeId)
            })
        }

        // Accent Color
        const swatches = document.querySelectorAll('.accent-swatch')
        if (swatches.length > 0) {
            const savedColor = localStorage.getItem('scoreflow_accent_color')
            if (savedColor) {
                const activeSwatch = Array.from(swatches).find(s => s.dataset.color === savedColor)
                if (activeSwatch) {
                    swatches.forEach(s => s.classList.remove('active'))
                    activeSwatch.classList.add('active')
                }
            }
            swatches.forEach(swatch => {
                swatch.addEventListener('click', () => {
                    const color = swatch.dataset.color
                    const rgb = swatch.dataset.rgb
                    swatches.forEach(s => s.classList.remove('active'))
                    swatch.classList.add('active')
                    document.documentElement.style.setProperty('--primary', color)
                    document.documentElement.style.setProperty('--primary-rgb', rgb)
                    document.documentElement.style.setProperty('--primary-hover', color)
                    localStorage.setItem('scoreflow_accent_color', color)
                    localStorage.setItem('scoreflow_accent_rgb', rgb)
                })
            })
        }

        // Scroll Offset
        const jumpOffsetInput = document.getElementById('settings-jump-offset')
        const jumpOffsetValue = document.getElementById('settings-jump-offset-value')
        if (jumpOffsetInput) {
            const currentOffset = this.app.rulerManager?.jumpOffsetPx ?? 40
            jumpOffsetInput.value = currentOffset
            if (jumpOffsetValue) jumpOffsetValue.textContent = `${currentOffset}px`
            jumpOffsetInput.addEventListener('input', (e) => {
                const val = parseInt(e.target.value)
                this.app.updateJumpOffset?.(val)
                this.updateSliderGradient(jumpOffsetInput)
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
                if (this.app.rulerManager) this.app.rulerManager.jumpDurationMs = val
                if (jumpSpeedValue) jumpSpeedValue.textContent = `${val}ms`
                this.updateSliderGradient(jumpSpeedInput)
                localStorage.setItem('scoreflow_jump_speed_ms', val)
            })
        }

        // Idle Lock
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

        // Turner Mode
        const turnerSelect = document.getElementById('turner-mode-select')
        if (turnerSelect) {
            const stored = localStorage.getItem('scoreflow_turner_mode')
            if (stored) turnerSelect.value = stored
            turnerSelect.addEventListener('change', () => this.app.saveToStorage())
        }

        // Reload App
        document.getElementById('btn-reload-app')
            ?.addEventListener('click', () => location.reload())

        // Slider adj buttons
        this.panel.querySelectorAll('.slider-adj-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const slider = document.getElementById(btn.dataset.target)
                if (!slider) return
                const isPlus = btn.classList.contains('plus')
                const step = parseFloat(slider.step) || 1
                let val = parseFloat(slider.value)
                val = isPlus
                    ? Math.min(parseFloat(slider.max) || 100, val + step)
                    : Math.max(parseFloat(slider.min) || 0, val - step)
                slider.value = val
                slider.dispatchEvent(new Event('input'))
            })
        })

        // Reset buttons
        this.panel.querySelectorAll('.btn-reset-mini').forEach(btn => {
            btn.addEventListener('click', () => {
                const defaults = { 'jump-offset': 40, 'jump-speed': 300, 'pointer-idle': 8 }
                const ids = { 'jump-offset': 'settings-jump-offset', 'jump-speed': 'settings-jump-speed', 'pointer-idle': 'settings-pointer-idle' }
                const type = btn.dataset.reset
                const slider = document.getElementById(ids[type])
                if (slider) { slider.value = defaults[type]; slider.dispatchEvent(new Event('input')) }
            })
        })

        // Initialize slider gradients
        this.panel.querySelectorAll('input[type="range"].setting-slider').forEach(input => {
            this.updateSliderGradient(input)
        })
    }

    updateSliderGradient(input) {
        if (!input) return
        const min = parseFloat(input.min) || 0
        const max = parseFloat(input.max) || 100
        const val = parseFloat(input.value)
        const pct = ((val - min) / (max - min)) * 100
        input.style.background = `linear-gradient(to right, var(--primary) ${pct}%, rgba(0,0,0,0.1) ${pct}%)`
    }
}
