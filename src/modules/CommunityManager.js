import * as db from '../db.js'

export class CommunityManager {
    constructor(app) {
        this.app = app
        this.profiles = [
            { id: 'p1', name: 'Guest Musician', orchestra: 'Standard Orchestra', section: 'Section', initial: 'G' }
        ]
        this.activeProfileId = 'p1'
    }

    init() {
        this.app.profileModal = document.getElementById('profile-modal')
        this.app.editProfileBtn = document.getElementById('edit-profile-btn')
        this.app.closeProfileBtn = document.getElementById('close-profile-modal')
        this.app.profileList = document.getElementById('profile-list')
        this.app.addNewProfileBtn = document.getElementById('add-new-profile-btn')
        this.app.profileDisplayName = document.getElementById('display-name')
        this.app.profileDisplayOrchestra = document.getElementById('display-orchestra')
        this.app.profileAvatarInitial = document.getElementById('profile-avatar-initial')

        this.initEventListeners()
    }

    initEventListeners() {
        if (this.app.editProfileBtn) {
            this.app.editProfileBtn.addEventListener('click', () => {
                const active = this.profiles.find(p => p.id === this.activeProfileId)
                if (active) this.editProfile(active.id)
            })
        }

        // Add a long-press or settings link for the modal
        const profileCard = document.getElementById('active-profile-card')
        if (profileCard) {
            profileCard.addEventListener('contextmenu', (e) => {
                e.preventDefault()
                this.toggleProfileModal(true)
            })
        }

        if (this.app.closeProfileBtn) {
            this.app.closeProfileBtn.addEventListener('click', () => this.toggleProfileModal(false))
        }

        if (this.app.addNewProfileBtn) {
            this.app.addNewProfileBtn.addEventListener('click', () => this.addNewProfile())
        }
    }

    toggleProfileModal(show) {
        if (this.app.profileModal) {
            this.app.profileModal.classList.toggle('active', show)
            if (show) this.renderProfileList()
        }
    }

    async renderActiveProfile() {
        const active = this.profiles.find(p => p.id === this.activeProfileId) || this.profiles[0]
        if (!active) return

        if (this.app.profileDisplayName) this.app.profileDisplayName.textContent = active.name
        if (this.app.profileDisplayOrchestra) this.app.profileDisplayOrchestra.textContent = active.orchestra
        if (this.app.profileAvatarInitial) this.app.profileAvatarInitial.textContent = active.initial || active.name.charAt(0)

        const identityName = document.getElementById('welcome-identity-name')
        if (identityName) identityName.textContent = `Welcome, ${active.name}`

        // Sync Sidebar Source Name (Interpretation Styles)
        if (this.app.renderSourceUI) {
            this.app.renderSourceUI()
        }
    }

    renderProfileList() {
        if (!this.app.profileList) return
        this.app.profileList.innerHTML = ''

        this.profiles.forEach(p => {
            const isActive = p.id === this.activeProfileId
            const item = document.createElement('div')
            item.className = `profile-selection-item ${isActive ? 'active' : ''}`
            item.innerHTML = `
        <div class="profile-avatar">${p.initial || p.name.charAt(0)}</div>
        <div class="profile-details">
          <div class="profile-name">${p.name}</div>
          <div class="profile-meta">${p.orchestra} • ${p.section}</div>
        </div>
        ${isActive ? '<div class="active-indicator-dot"></div>' : ''}
        <div class="profile-actions-mini">
          <button class="btn-edit-profile-mini" title="Edit Profile">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${this.profiles.length > 1 ? `
            <button class="btn-remove-profile" title="Remove Profile">
               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          ` : ''}
        </div>
      `

            const editBtn = item.querySelector('.btn-edit-profile-mini')
            if (editBtn) {
                editBtn.onclick = (e) => {
                    e.stopPropagation()
                    this.editProfile(p.id)
                }
            }

            item.onclick = (e) => {
                if (e.target.closest('.btn-remove-profile')) return
                this.activeProfileId = p.id
                this.app.saveToStorage()
                this.renderActiveProfile()
                this.renderProfileList()
            }

            const delBtn = item.querySelector('.btn-remove-profile')
            if (delBtn) {
                delBtn.onclick = (e) => {
                    e.stopPropagation()
                    if (confirm(`Delete the profile for ${p.name}?`)) {
                        this.profiles = this.profiles.filter(prof => prof.id !== p.id)
                        if (this.activeProfileId === p.id) this.activeProfileId = this.profiles[0].id
                        this.app.saveToStorage()
                        this.renderActiveProfile()
                        this.renderProfileList()
                    }
                }
            }

            this.app.profileList.appendChild(item)
        })
    }

    addNewProfile() {
        this.editProfile(null)
    }

    editProfile(profileId) {
        const isNew = !profileId
        const p = isNew ? { name: '', orchestra: '', section: '' } : this.profiles.find(prof => prof.id === profileId)
        if (!p) return

        const newName = prompt('Enter display name:', p.name || 'Guest Musician')
        if (newName === null) return
        const newOrch = prompt('Enter Orchestra/Ensemble:', p.orchestra || 'Standard Orchestra')
        if (newOrch === null) return
        const newSection = prompt('Enter Section/Role:', p.section || 'Section')
        if (newSection === null) return

        if (isNew) {
            const id = 'p_' + Date.now()
            this.profiles.push({
                id,
                name: newName,
                orchestra: newOrch,
                section: newSection,
                initial: newName.charAt(0)
            })
            this.activeProfileId = id
        } else {
            p.name = newName
            p.orchestra = newOrch
            p.section = newSection
            p.initial = newName.charAt(0)
        }

        this.app.saveToStorage()
        this.renderActiveProfile()
        this.renderProfileList()

        if (isNew) {
            const identitySelectionView = document.getElementById('identity-selection-view')
            const welcomeInitialView = document.getElementById('welcome-initial-view')
            if (identitySelectionView) identitySelectionView.classList.add('hidden')
            if (welcomeInitialView) welcomeInitialView.classList.remove('hidden')
        }
    }
}
