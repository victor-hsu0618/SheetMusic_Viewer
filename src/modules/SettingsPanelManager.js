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

        this.panel.querySelectorAll('.settings-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.panel.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'))
                this.panel.querySelectorAll('.settings-pane').forEach(p => p.classList.remove('active'))
                btn.classList.add('active')
                const pane = document.getElementById('settings-pane-' + btn.dataset.tab)
                if (pane) pane.classList.add('active')
            })
        })

        this.initSettings()
        this._initAccountSettings()
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
            this._refreshAccountUI()
            this.app.activeStampType = 'view'
            this.app.toolManager?.updateActiveTools()
        } else {
            this.panel.classList.remove('active')
        }
    }

    _initAccountSettings() {
        this._bindLocalBackup()
        this._bindSupabaseAuth()
        this._updateOnlineStatus()
        window.addEventListener('online',  () => this._updateOnlineStatus())
        window.addEventListener('offline', () => this._updateOnlineStatus())
    }

    _refreshAccountUI() {
        this.app.profileManager?.render()
        this._updateSupabaseUI()
        this._updateOnlineStatus()
    }

    _updateOnlineStatus() {
        const badge = document.getElementById('cloud-sync-status')
        if (!badge) return
        const online = navigator.onLine
        badge.textContent = online ? 'Online' : 'Offline'
        badge.classList.toggle('online', online)
        badge.classList.toggle('offline', !online)
    }

    _updateSupabaseUI() {
        const mgr = this.app.supabaseManager
        const loggedOutEl = document.getElementById('supabase-auth-logged-out')
        const loggedInEl  = document.getElementById('supabase-auth-logged-in')
        if (!mgr || !loggedOutEl || !loggedInEl) return

        if (mgr.user) {
            loggedOutEl.classList.add('hidden')
            loggedInEl.classList.remove('hidden')
            const emailEl    = document.getElementById('supabase-user-email')
            const initialsEl = document.getElementById('supabase-user-initials')
            if (emailEl)    emailEl.textContent    = mgr.user.email
            if (initialsEl) initialsEl.textContent = mgr.user.email.slice(0, 1).toUpperCase()
        } else {
            loggedOutEl.classList.remove('hidden')
            loggedInEl.classList.add('hidden')
        }
    }

    _bindLocalBackup() {
        document.getElementById('btn-export-backup')
            ?.addEventListener('click', () => this.app.localBackupManager?.exportBackup())

        const importInput = document.getElementById('input-import-backup')
        if (importInput) {
            importInput.addEventListener('change', (e) => {
                const file = e.target.files?.[0]
                if (file) {
                    this.app.localBackupManager?.importBackup(file)
                    e.target.value = ''
                }
            })
        }
    }

    _bindSupabaseAuth() {
        const loginBtn    = document.getElementById('btn-supabase-login')
        const logoutBtn   = document.getElementById('btn-supabase-logout')
        const resyncBtn   = document.getElementById('btn-supabase-force-resync-all')
        const registerBtn = document.getElementById('btn-supabase-register')

        if (registerBtn) {
            registerBtn.addEventListener('click', async () => {
                const email    = document.getElementById('supabase-register-email')?.value?.trim()
                const password = document.getElementById('supabase-register-password')?.value
                const code     = document.getElementById('supabase-invite-code')?.value?.trim()
                const msgEl    = document.getElementById('register-message')

                const setMsg = (text, color = '#ef4444') => { if (msgEl) { msgEl.textContent = text; msgEl.style.color = color } }

                if (!email || !password) return setMsg('Please enter email and password.')
                if (password.length < 6) return setMsg('Password must be at least 6 characters.')
                if (!code) return setMsg('Please enter invite code.')

                const INVITE_CODE = await this.app.supabaseManager.getInviteCode()
                if (!INVITE_CODE || code !== INVITE_CODE) return setMsg('Invalid invite code.')

                registerBtn.disabled = true
                registerBtn.textContent = 'Creating account...'
                const { error } = await this.app.supabaseManager.signUp(email, password)
                registerBtn.disabled = false
                registerBtn.textContent = 'Create Account'

                if (error) {
                    setMsg('Error: ' + error.message)
                } else {
                    setMsg('Account created! You are now signed in.', 'var(--success)')
                    this._updateSupabaseUI()
                }
            })
        }

        if (loginBtn) {
            loginBtn.addEventListener('click', async () => {
                const email    = document.getElementById('supabase-email')?.value
                const password = document.getElementById('supabase-password')?.value
                if (!email || !password) return alert('Please enter email and password')
                loginBtn.disabled  = true
                loginBtn.textContent = 'Signing in...'
                const { error } = await this.app.supabaseManager.signIn(email, password)
                loginBtn.disabled  = false
                loginBtn.textContent = 'Sign In to Cloud'
                if (error) alert('Login failed: ' + error.message)
                else this._updateSupabaseUI()
            })
        }

        if (logoutBtn) {
            logoutBtn.addEventListener('click', async () => {
                await this.app.supabaseManager?.signOut()
                this._updateSupabaseUI()
            })
        }

        if (resyncBtn) {
            resyncBtn.addEventListener('click', async () => {
                const confirmed = await this.app.showDialog({
                    title: '☢️ CRITICAL: Global Cloud Resync?',
                    message: 'This will DELETE ALL local markings and metadata for ALL scores and rebuild them from the cloud. Continue?',
                    type: 'confirm',
                    icon: '☢️'
                })
                if (!confirmed) return
                this.app.showMessage('Full Resync in progress...', 'system')
                const success = await this.app.supabaseManager.forceFullCloudResync()
                if (success) {
                    this.app.showMessage('Global Resync Complete! Reloading...', 'success')
                    setTimeout(() => location.reload(), 1500)
                } else {
                    this.app.showMessage('Resync failed.', 'error')
                }
            })
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

        // Category Default Colors
        const CAT_COLOR_KEYS = [
            { id: 'cat-color-draw',        key: 'draw' },
            { id: 'cat-color-shapes',      key: 'shapes' },
            { id: 'cat-color-fingering',   key: 'fingering' },
            { id: 'cat-color-articulation',key: 'articulation' },
            { id: 'cat-color-text',        key: 'text' },
            { id: 'cat-color-others',      key: 'others' },
        ]
        CAT_COLOR_KEYS.forEach(({ id, key }) => {
            const input = document.getElementById(id)
            if (!input) return
            input.value = this.app.categoryDefaultColors?.[key] || input.value
            input.addEventListener('input', (e) => {
                if (!this.app.categoryDefaultColors) return
                this.app.categoryDefaultColors[key] = e.target.value
                localStorage.setItem('sf-category-default-colors', JSON.stringify(this.app.categoryDefaultColors))
            })
        })

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

        // Jump Ruler toggle
        const rulerChk = document.getElementById('settings-ruler-visible')
        if (rulerChk) {
            rulerChk.checked = this.app.rulerManager?.rulerVisible ?? true
            rulerChk.addEventListener('change', e => {
                if (e.target.checked !== this.app.rulerManager?.rulerVisible)
                    this.app.rulerManager?.toggleRuler()
            })
        }

        // 頁面重疊 (System Jump Overlap)
        const overlapVal = document.getElementById('settings-overlap-val')
        const updateOverlap = (n) => {
            n = Math.max(1, Math.min(8, n))
            this.app.systemJumpOverlap = n
            localStorage.setItem('scoreflow_system_jump_overlap', n)
            if (overlapVal) overlapVal.textContent = n
        }
        if (overlapVal) overlapVal.textContent = this.app.systemJumpOverlap ?? 1
        document.getElementById('settings-overlap-minus')
            ?.addEventListener('click', () => updateOverlap((this.app.systemJumpOverlap ?? 1) - 1))
        document.getElementById('settings-overlap-plus')
            ?.addEventListener('click', () => updateOverlap((this.app.systemJumpOverlap ?? 1) + 1))

        // System Detection
        const sysChk = document.getElementById('settings-show-systems')
        const sysStatus = document.getElementById('settings-system-status')
        const refreshSysStatus = () => {
            const count = this.app.stamps?.filter(s => s.type === 'system' && !s.deleted).length ?? 0
            if (sysStatus) sysStatus.textContent = count > 0 ? `已偵測 ${count} 個 System` : '尚未偵測'
        }
        if (sysChk) {
            sysChk.checked = this.app.showSystemStamps ?? false
            sysChk.addEventListener('change', e => {
                this.app.showSystemStamps = e.target.checked
                localStorage.setItem('scoreflow_show_systems', e.target.checked)
                this.app.updateRulerMarks?.()
            })
        }
        refreshSysStatus()
        const syncSysChk = document.getElementById('settings-sync-system-stamps')
        if (syncSysChk) {
            syncSysChk.checked = localStorage.getItem('scoreflow_sync_system_stamps') === 'true'
            syncSysChk.addEventListener('change', e => {
                localStorage.setItem('scoreflow_sync_system_stamps', e.target.checked)
            })
        }
        document.getElementById('settings-detect-systems')?.addEventListener('click', async () => {
            if (sysStatus) sysStatus.textContent = '偵測中...'
            this.app.stamps = this.app.stamps?.filter(s => !(s.type === 'system' && s.auto)) ?? []
            await this.app.staffDetector?.autoDetect(this.app.viewerManager?.pdf, (p, total) => {
                if (sysStatus) sysStatus.textContent = `偵測中... ${p} / ${total}`
            })
            refreshSysStatus()
        })
        document.getElementById('settings-clear-systems')?.addEventListener('click', () => {
            this.app.stamps = this.app.stamps?.filter(s => s.type !== 'system') ?? []
            this.app.saveToStorage?.(true)
            this.app.updateRulerMarks?.()
            refreshSysStatus()
        })

        // 兩指捲動
        const twoFingerChk = document.getElementById('settings-two-finger-pan')
        if (twoFingerChk) {
            twoFingerChk.checked = this.app.twoFingerPanEnabled ?? false
            twoFingerChk.addEventListener('change', e => {
                this.app.twoFingerPanEnabled = e.target.checked
                localStorage.setItem('scoreflow_two_finger_pan', e.target.checked)
            })
        }

        // Doc Bar Hide
        const docBarHideChk = document.getElementById('settings-doc-bar-hide')
        if (docBarHideChk) {
            docBarHideChk.checked = localStorage.getItem('scoreflow_doc_bar_hide') === 'true'
            docBarHideChk.addEventListener('change', e => {
                localStorage.setItem('scoreflow_doc_bar_hide', e.target.checked)
                this.app.docBarStripManager?.toggleCollapse(e.target.checked)
            })
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
