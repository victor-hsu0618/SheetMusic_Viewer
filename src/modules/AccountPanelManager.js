/**
 * AccountPanelManager — Account & Sync panel (👤 Doc Bar button).
 * Contains: Musician Profile, Supabase Cloud Sync, Local Backup.
 */
export class AccountPanelManager {
    constructor(app) {
        this.app = app
        this.panel = null
        this.isVisible = false
    }

    init() {
        this.panel = document.getElementById('account-panel')
        if (!this.panel) return

        document.getElementById('btn-close-account')
            ?.addEventListener('click', () => this.toggle(false))

        this._bindLocalBackup()
        this._bindSupabaseAuth()
        this._updateOnlineStatus()
        window.addEventListener('online',  () => this._updateOnlineStatus())
        window.addEventListener('offline', () => this._updateOnlineStatus())
    }

    toggle(force = null) {
        if (!this.panel) return
        const active = force !== null ? force : !this.isVisible
        this.isVisible = active

        const btn = this.app.docBarStripManager?.el?.querySelector('[data-activeId="doc-account"]')
        if (btn) btn.classList.toggle('active', active)

        if (active) {
            this.app.uiManager.closeAllActivePanels('AccountPanelManager')
            this.panel.classList.add('active')
            this._refreshUI()
        } else {
            this.panel.classList.remove('active')
        }
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    _refreshUI() {
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
        const loginBtn  = document.getElementById('btn-supabase-login')
        const logoutBtn = document.getElementById('btn-supabase-logout')
        const resyncBtn = document.getElementById('btn-supabase-force-resync-all')

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
}
