import * as db from '../db.js'

export class ProfileManager {
    constructor(app) {
        this.app = app
        this.data = {
            userName: 'Guest Musician',
            title: 'Principal',
            email: '',
            note: 'Always focus on the beat.',
            updatedAt: 0
        }
    }

    async init() {
        // Elements in Settings Tab
        this.summaryContainer = document.getElementById('user-profile-summary-container')
        this.displayText = document.getElementById('user-profile-display-text')
        this.noteText = document.getElementById('user-profile-note')
        this.editBtn = document.getElementById('edit-user-profile-btn')
        this.avatar = document.getElementById('user-profile-avatar')

        // Sidebar Score Detail Elements
        this.sidebarName = document.getElementById('sidebar-user-name')
        this.sidebarEmail = document.getElementById('sidebar-user-email')
        this.sidebarAvatar = document.getElementById('sidebar-user-avatar')

        // Edit Modal Elements
        this.modal = document.getElementById('user-profile-modal')
        this.closeBtn = document.getElementById('close-user-profile-modal')
        this.saveBtn = document.getElementById('save-user-profile-btn')
        this.cancelBtn = document.getElementById('cancel-user-profile-btn')

        this.inputName = document.getElementById('user-profile-name-input')
        this.inputTitle = document.getElementById('user-profile-title-input')
        this.inputEmail = document.getElementById('user-profile-email-input')
        this.inputNote = document.getElementById('user-profile-note-input')

        await this.load()
        this.initEventListeners()
        this.render()
    }

    initEventListeners() {
        if (this.editBtn) {
            this.editBtn.addEventListener('click', () => this.toggleModal(true))
        }
        if (this.summaryContainer) {
            this.summaryContainer.addEventListener('click', (e) => {
                if (e.target.closest('button')) return
                this.toggleModal(true)
            })
        }
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.toggleModal(false))
        }
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => this.toggleModal(false))
        }
        if (this.saveBtn) {
            this.saveBtn.addEventListener('click', () => this.handleSave())
        }

        // Close on escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal && this.modal.classList.contains('active')) {
                this.toggleModal(false)
            }
        })
    }

    async load() {
        const saved = await db.get('user_profile')
        if (saved) {
            this.data = { ...this.data, ...saved }
        }
    }

    async save() {
        await db.set('user_profile', this.data)
    }

    toggleModal(show) {
        if (!this.modal) return
        this.modal.classList.toggle('active', show)
        if (show) {
            this.inputName.value = this.data.userName
            this.inputTitle.value = this.data.title
            this.inputEmail.value = this.data.email || ''
            this.inputNote.value = this.data.note
            this.inputName.focus()
        }
    }

    async handleSave() {
        const name = this.inputName.value.trim()
        const email = this.inputEmail.value.trim()

        if (!name || !email) {
            alert('User Name and Email are required fields.')
            return
        }

        this.data.userName = name
        this.data.title = this.inputTitle.value.trim() || 'Musician'
        this.data.email = email
        this.data.note = this.inputNote.value.trim()
        this.data.updatedAt = Date.now()

        await this.save()
        this.render()
        this.toggleModal(false)

        // Re-render UI sections affected by name change
        if (this.app.renderSourceUI) this.app.renderSourceUI();
        if (this.app.scoreDetailManager) {
            this.app.scoreDetailManager.refreshStats(); // Update Author in stats
        }
    }

    render() {
        if (this.displayText) {
            this.displayText.textContent = `${this.data.title} / ${this.data.userName}`
        }
        if (this.noteText) {
            this.noteText.textContent = this.data.note || 'No notes added.'
        }
        if (this.avatar) {
            this.avatar.textContent = this.data.userName.charAt(0).toUpperCase()
        }
        if (this.sidebarName) {
            this.sidebarName.textContent = this.data.userName
        }
        if (this.sidebarEmail) {
            this.sidebarEmail.textContent = this.data.email || 'No email provided'
        }
        if (this.sidebarAvatar) {
            this.sidebarAvatar.textContent = this.data.userName.charAt(0).toUpperCase()
        }
    }
}
