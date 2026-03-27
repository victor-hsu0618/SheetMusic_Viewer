import * as db from '../db.js'

export class CollaborationManager {
  constructor(app) {
    this.app = app
    this.profiles = [
      { id: 'p1', name: 'Default Musician', orchestra: 'Standard Orchestra', section: 'Section', initial: 'D' }
    ]
    this.activeProfileId = 'p1'
  }

  async renderActiveProfile() {
    const active = this.profiles.find(p => p.id === this.activeProfileId) || this.profiles[0]
    if (!active) return

    if (this.app.profileDisplayName) this.app.profileDisplayName.textContent = active.name
    if (this.app.profileDisplayOrchestra) this.app.profileDisplayOrchestra.textContent = active.orchestra
    if (this.app.profileAvatarInitial) this.app.profileAvatarInitial.textContent = active.initial || active.name.charAt(0)
    if (this.app.welcomeIdentityName) this.app.welcomeIdentityName.textContent = `Welcome, ${active.name}`
  }

  renderSourceUI(customSources = null, customStamps = null, targetFingerprint = null) {
    if (!this.app.sourceList) return
    this.app.sourceList.innerHTML = ''
    
    const sourcesToRender = customSources || this.app.sources
    const stampsToUse = customStamps || this.app.stamps
    const isActiveScore = !targetFingerprint || targetFingerprint === this.app.pdfFingerprint
    const activeId = isActiveScore ? this.app.activeSourceId : null

    sourcesToRender.forEach(source => {
      const isActive = activeId === source.id
      const item = document.createElement('div')
      item.className = `source-item ${isActive ? 'active' : ''}`

      const contributorBadge = source.author
        ? `<div class="source-contributor">
             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>
             ${source.author} • ${source.section}
           </div>`
        : '';

      const stampCount = stampsToUse.filter(s => s.sourceId === source.id && !s.deleted).length;

      let statusSvg = '';
      if (!source.visible) {
        statusSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${source.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.6;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
      } else if (isActive) {
        statusSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="${source.color}"><circle cx="12" cy="12" r="10" /></svg>`;
      } else {
        statusSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${source.color}" stroke-width="4"><circle cx="12" cy="12" r="8" /></svg>`;
      }

      item.innerHTML = `
        <div class="source-header">
          <div class="source-info">
            <button class="toggle-vis" title="Toggle Visibility" style="background:transparent; border:none; padding:0; cursor:pointer; display:flex; margin-right: 2px; flex-shrink: 0; outline: none;">
              ${statusSvg}
            </button>
            <div class="source-meta-box">
              <div class="style-name-row" style="display:flex; justify-content:space-between; align-items:center;">
                <span class="source-name">${source.name}</span>
                <span class="stamp-count-mini" style="font-size:0.65rem; color:var(--text-muted); font-weight:700;">${stampCount} marks</span>
              </div>
              ${contributorBadge}
            </div>
          </div>
          <div class="source-controls">
            <button class="rename-src btn-sm-icon" title="Rename Style">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${sourcesToRender.length > 1 ? `
              <button class="delete-src btn-sm-icon danger" title="Remove Style">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            ` : ''}
          </div>
        </div>

        <div class="source-opacity-box">
          <label for="source-opacity-slider-${source.id}">Opacity</label>
          <input id="source-opacity-slider-${source.id}" type="range" class="source-opacity-slider modern-slider" min="0" max="1" step="0.1" value="${source.opacity}">
        </div>
      `;

      item.onclick = (e) => {
        if (e.target.closest('.source-controls') || e.target.closest('.source-opacity-box') || e.target.closest('.source-actions') || e.target.closest('.toggle-vis')) return
        if (isActiveScore) {
          this.app.activeSourceId = source.id
          this.app.saveToStorage()
          this.renderSourceUI()
        }
      }

      item.querySelector('.toggle-vis').onclick = (e) => {
        e.stopPropagation()
        source.visible = !source.visible
        source.updatedAt = Date.now()
        
        if (isActiveScore) {
          this.app.saveToStorage()
          if (this.app.pdf) {
            for (let i = 1; i <= this.app.pdf.numPages; i++) this.app.redrawStamps(i)
          }
        } else {
          db.set(`sources_${targetFingerprint}`, sourcesToRender)
        }
        this.renderSourceUI(customSources, customStamps, targetFingerprint)
      }

      item.querySelector('.rename-src').onclick = (e) => {
        e.stopPropagation()
        const newName = prompt('Rename Interpretation Style:', source.name)
        if (newName) {
          source.name = newName
          source.updatedAt = Date.now()
          if (isActiveScore) {
            this.app.saveToStorage()
          } else {
            db.set(`sources_${targetFingerprint}`, sourcesToRender)
          }
          this.renderSourceUI(customSources, customStamps, targetFingerprint)
        }
      }

      const delBtn = item.querySelector('.delete-src')
      if (delBtn) {
        delBtn.onclick = (e) => {
          e.stopPropagation()
          if (confirm(`Remove "${source.name}" and all its annotations?`)) {
            const filteredStamps = stampsToUse.filter(s => s.sourceId !== source.id)
            const filteredSources = sourcesToRender.filter(s => s.id !== source.id)
            
            if (isActiveScore) {
              this.app.stamps = filteredStamps
              this.app.sources = filteredSources
              if (this.app.activeSourceId === source.id) this.app.activeSourceId = this.app.sources[0].id
              this.app.saveToStorage()
              location.reload()
            } else {
              db.set(`stamps_${targetFingerprint}`, filteredStamps)
              db.set(`sources_${targetFingerprint}`, filteredSources)
              this.renderSourceUI(filteredSources, filteredStamps, targetFingerprint)
            }
          }
        }
      }

      item.querySelector('.source-opacity-slider').oninput = (e) => {
        source.opacity = parseFloat(e.target.value)
        if (isActiveScore && this.app.pdf) {
          for (let i = 1; i <= this.app.pdf.numPages; i++) this.app.redrawStamps(i)
        }
      }
      item.querySelector('.source-opacity-slider').onchange = () => {
        if (isActiveScore) {
          this.app.saveToStorage()
        } else {
          db.set(`sources_${targetFingerprint}`, sourcesToRender)
        }
      }

      this.app.sourceList.appendChild(item)
    })
  }

  addSource() {
    const name = prompt('Interpretation Style (e.g., Conductor, Soloist, Principal):')
    if (!name) return
    const id = 'src_' + Date.now()
    this.app.sources.push({
      id, name, visible: true, opacity: 1,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
      updatedAt: Date.now()
    })
    this.app.activeSourceId = id
    this.app.saveToStorage()
    this.renderSourceUI()
  }
}
