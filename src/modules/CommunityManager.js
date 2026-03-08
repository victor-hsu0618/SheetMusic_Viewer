import * as db from '../db.js'

export class CommunityManager {
    constructor(app) {
        this.app = app
        this.profiles = [
            { id: 'p1', name: 'Guest Musician', orchestra: 'Standard Orchestra', section: 'Section', initial: 'G' }
        ]
        this.activeProfileId = 'p1'
        this.personalSyncFolder = null
        this.orchestraSyncFolder = null
    }

    init() {
        this.app.publishPersonalBtn = document.getElementById('publish-personal-btn')
        this.app.publishOrchestraBtn = document.getElementById('publish-orchestra-btn')
        this.app.connectPersonalBtn = document.getElementById('connect-personal-btn')
        this.app.connectOrchestraBtn = document.getElementById('connect-orchestra-btn')
        this.app.syncAllBtn = document.getElementById('sync-all-btn')

        this.app.personalStatus = document.getElementById('personal-status')
        this.app.orchestraStatus = document.getElementById('orchestra-status')

        this.app.profileModal = document.getElementById('profile-modal')
        this.app.editProfileBtn = document.getElementById('edit-profile-btn')
        this.app.closeProfileBtn = document.getElementById('close-profile-modal')
        this.app.profileList = document.getElementById('profile-list')
        this.app.addNewProfileBtn = document.getElementById('add-new-profile-btn')
        this.app.profileDisplayName = document.getElementById('display-name')
        this.app.profileDisplayOrchestra = document.getElementById('display-orchestra')
        this.app.profileAvatarInitial = document.getElementById('profile-avatar-initial')
        this.app.sharedList = document.getElementById('shared-list')

        this.initEventListeners()
    }

    initEventListeners() {
        if (this.app.publishPersonalBtn) {
            this.app.publishPersonalBtn.addEventListener('click', () => this.publishWork('personal'))
        }
        if (this.app.publishOrchestraBtn) {
            this.app.publishOrchestraBtn.addEventListener('click', () => this.publishWork('orchestra'))
        }
        if (this.app.connectPersonalBtn) {
            this.app.connectPersonalBtn.addEventListener('click', () => this.connectSyncFolder('personal'))
        }
        if (this.app.connectOrchestraBtn) {
            this.app.connectOrchestraBtn.addEventListener('click', () => this.connectSyncFolder('orchestra'))
        }
        if (this.app.syncAllBtn) {
            this.app.syncAllBtn.addEventListener('click', () => this.renderCommunityHub())
        }

        if (this.app.editProfileBtn) {
            this.app.editProfileBtn.addEventListener('click', () => this.toggleProfileModal(true))
        }

        if (this.app.closeProfileBtn) {
            this.app.closeProfileBtn.addEventListener('click', () => this.toggleProfileModal(false))
        }

        if (this.app.addNewProfileBtn) {
            this.app.addNewProfileBtn.addEventListener('click', () => this.addNewProfile())
        }
    }

    async verifyPermission(fileHandle, readWrite) {
        const options = {}
        if (readWrite) {
            options.mode = 'readwrite'
        }
        // Check if permission was already granted.
        if ((await fileHandle.queryPermission(options)) === 'granted') {
            return true
        }
        // Request permission.
        if ((await fileHandle.requestPermission(options)) === 'granted') {
            return true
        }
        return false
    }

    async connectSyncFolder(type) {
        try {
            const handle = await window.showDirectoryPicker({
                mode: 'readwrite'
            })

            const targetId = this.activeProfileId
            if (!targetId) {
                alert('Please select a profile first!')
                return
            }

            // Persistent Storage for this specific profile
            await db.set(`profile_${targetId}_${type}_handle`, handle)

            if (type === 'personal') {
                this.personalSyncFolder = handle
            } else {
                this.orchestraSyncFolder = handle
            }

            this.updateSyncUI()
            this.app.showDialog({
                title: 'Folder Linked',
                message: `✅ ${type === 'personal' ? 'Personal' : 'Orchestra'} folder linked: "${handle.name}".`,
                icon: '🔗'
            })
            await this.renderCommunityHub()
        } catch (err) {
            console.warn('Folder connection cancelled:', err)
        }
    }

    async publishWork(target) {
        const activeProfile = this.profiles.find(p => p.id === this.activeProfileId)
        const folder = target === 'personal' ? this.personalSyncFolder : this.orchestraSyncFolder

        if (!folder) {
            alert(`Please link a ${target === 'personal' ? 'Personal' : 'Orchestra'} folder first!`)
            return
        }

        const data = {
            id: 'pub_' + Date.now(),
            author: activeProfile.name,
            section: activeProfile.section,
            orchestra: activeProfile.orchestra,
            timestamp: new Date().toLocaleTimeString(),
            layers: this.app.layers,
            stamps: this.app.stamps,
            sources: this.app.sources,
            fingerprint: this.app.pdfFingerprint,
            workspaceType: target // Mark the origin
        }

        try {
            // CRITICAL: Verify write permission
            const hasPermission = await this.verifyPermission(folder, true)
            if (!hasPermission) throw new Error('Permission denied.')

            const fileName = `sf_${target}_${activeProfile.name.replace(/\s/g, '_')}_${Date.now()}.json`
            const fileHandle = await folder.getFileHandle(fileName, { create: true })
            const writable = await fileHandle.createWritable()
            await writable.write(JSON.stringify(data, null, 2))
            await writable.close()

            // Flag for Library Sync Indicators
            if (this.app.pdfFingerprint) {
                localStorage.setItem(`scoreflow_published_${target.charAt(0)}_${this.app.pdfFingerprint}`, 'true')
            }

            alert(`🚀 Successfully saved to ${target === 'personal' ? 'Private Backup' : 'Orchestra Workspace'}!`)
            await this.renderCommunityHub()
            this.app.renderLibrary()
        } catch (err) {
            console.error('Publishing error:', err)
            alert(`❌ Publishing failed: ${err.message}`)
        }
    }

    async renderCommunityHub() {
        if (!this.app.sharedList) return
        this.app.sharedList.innerHTML = '<div class="hub-loading">Scanning workspaces...</div>'

        let communityData = []
        const scanFolder = async (folder, typeLabel) => {
            if (!folder) return
            try {
                const hasPermission = await this.verifyPermission(folder, false)
                if (!hasPermission) return

                for await (const [name, handle] of folder.entries()) {
                    if (name.endsWith('.json') && (name.startsWith('sf_personal_') || name.startsWith('sf_orchestra_') || name.startsWith('sf_shared_'))) {
                        const file = await handle.getFile()
                        const text = await file.text()
                        try {
                            const data = JSON.parse(text)
                            if (data.fingerprint === this.app.pdfFingerprint && data.stamps && data.stamps.length > 0) {
                                data.location = typeLabel // Add origin label
                                communityData.push(data)
                            }
                        } catch (e) { console.warn('Corrupt JSON:', name) }
                    }
                }
            } catch (err) { console.error(`Scan error in ${typeLabel}:`, err) }
        }

        // Scan both potential sources
        await scanFolder(this.personalSyncFolder, 'Personal Workspace')
        await scanFolder(this.orchestraSyncFolder, 'Orchestra')

        // Sort by timestamp (newest first)
        communityData.sort((a, b) => {
            const timeA = new Date(a.id.split('_')[1] || 0)
            const timeB = new Date(b.id.split('_')[1] || 0)
            return b - a
        })

        // Initial Mock Data if absolutely empty
        if (communityData.length === 0) {
            communityData = [
                {
                    id: 'mock_1', author: 'Maestro Hsu', section: 'First Violins',
                    timestamp: 'Yesterday', stamps: new Array(14),
                    layers: [], sources: [{ name: 'Conductor' }]
                }
            ]
        }

        this.app.sharedList.innerHTML = ''
        communityData.forEach(work => {
            const card = document.createElement('div')
            card.className = 'shared-card'
            card.innerHTML = `
        <div class="card-top">
           <div class="card-title">
             <div class="workspace-badge ${work.location === 'Personal Workspace' ? 'personal' : 'orchestra'}">
               ${work.location === 'Personal Workspace' ? '🔒 Private' : '👥 Team'}
             </div>
             ${work.author}
           </div>
           <button class="btn-import-ghost" id="grab-${work.id}">Grab</button>
        </div>
        <div class="card-meta">${work.timestamp} • ${work.section}</div>
        <div class="card-tags">
           <span class="tag">${work.stamps ? work.stamps.length : 0} Annotations</span>
           <span class="tag">Studio: ${work.sources ? work.sources[0].name : 'Primary'}</span>
        </div>
      `

            const grabBtn = card.querySelector(`#grab-${work.id}`)
            if (grabBtn) {
                grabBtn.onclick = (e) => {
                    e.stopPropagation()
                    this.importSharedWork(work)
                }
            }

            this.app.sharedList.appendChild(card)
        })
    }

    importSharedWork(work) {
        if (!confirm(`Import markings from ${work.author} (${work.section}) as a new Interpretation Style?`)) return

        const newSourceId = 'hub_' + Date.now()
        // Use the sender's original style name if available, otherwise fallback
        const originalStyleName = work.sources && work.sources[0] ? work.sources[0].name : "Shared Markings"

        // 1. Create a new source with contributor tracking
        const newSource = {
            id: newSourceId,
            name: originalStyleName,
            author: work.author,      // Persistent Contributor tracking
            section: work.section,    // Role identification
            visible: true,
            opacity: 0.7,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16)
        }
        this.app.sources.push(newSource)

        // 2. Clone and link the stamps to the new source
        const importedStamps = (work.stamps || [])
            .filter(s => s && s.page)
            .map(s => ({ ...s, sourceId: newSourceId }))

        this.app.stamps = this.app.stamps.concat(importedStamps)
        this.app.saveToStorage()

        // 3. Update UI immediately
        this.app.renderSourceUI()
        if (this.app.pdf) {
            for (let i = 1; i <= this.app.pdf.numPages; i++) {
                this.app.redrawStamps(i)
            }
        }
        alert(`${work.author}'s interpretation ("${originalStyleName}") imported!`)
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

        // Auto-recover Cloud Folders for this profile
        const pHandle = await db.get(`profile_${active.id}_personal_handle`)
        const oHandle = await db.get(`profile_${active.id}_orchestra_handle`)
        this.personalSyncFolder = pHandle || null
        this.orchestraSyncFolder = oHandle || null
        this.updateSyncUI()
    }

    updateSyncUI() {
        // 1. Sidebar Status (Existing)
        if (this.app.personalStatus) {
            if (this.personalSyncFolder) {
                this.app.personalStatus.innerHTML = `✅ Linked: <strong style="color:var(--primary)">${this.personalSyncFolder.name}</strong>`
            } else {
                this.app.personalStatus.textContent = 'No personal folder linked.'
            }
        }
        if (this.app.orchestraStatus) {
            if (this.orchestraSyncFolder) {
                this.app.orchestraStatus.innerHTML = `✅ Linked: <strong style="color:var(--primary)">${this.orchestraSyncFolder.name}</strong>`
            } else {
                this.app.orchestraStatus.textContent = 'No group folder linked.'
            }
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
        ${this.profiles.length > 1 ? `
          <button class="btn-remove-profile" title="Remove Profile">
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        ` : ''}
      `

            item.onclick = (e) => {
                if (e.target.closest('.btn-remove-profile')) return
                this.activeProfileId = p.id
                this.app.saveToStorage()
                this.renderActiveProfile()
                this.renderProfileList()
                this.renderCommunityHub() // Refresh community listings for context
            }

            const delBtn = item.querySelector('.btn-remove-profile')
            if (delBtn) {
                delBtn.onclick = (e) => {
                    e.stopPropagation()
                    if (confirm(`Delete the profile for ${p.orchestra}?`)) {
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
        const name = prompt('Enter your display name:', 'Guest Musician')
        if (!name) return
        const orch = prompt('Enter Orchestra or Ensemble name:', 'Standard Orchestra')
        if (!orch) return
        const section = prompt('Enter your Section/Role (e.g. Conductor, Soloist, First Violins):', 'Section')
        if (!section) return

        const id = 'p_' + Date.now()
        this.profiles.push({
            id,
            name,
            orchestra: orch,
            section,
            initial: name.charAt(0)
        })
        this.activeProfileId = id
        this.app.saveToStorage()
        this.renderActiveProfile()
        this.renderProfileList()

        // Move to Stage 2
        const identitySelectionView = document.getElementById('identity-selection-view')
        const welcomeInitialView = document.getElementById('welcome-initial-view')
        if (identitySelectionView) identitySelectionView.classList.add('hidden')
        if (welcomeInitialView) welcomeInitialView.classList.remove('hidden')
    }
}
