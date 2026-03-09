import * as db from '../db.js'

export class CollaborationManager {
  constructor(app) {
    this.app = app
    this.profiles = [
      { id: 'p1', name: 'Guest Musician', orchestra: 'Standard Orchestra', section: 'Section', initial: 'G' }
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

  renderSourceUI() {
    if (!this.app.sourceList) return
    this.app.sourceList.innerHTML = ''
    this.app.sources.forEach(source => {
      const isActive = this.app.activeSourceId === source.id
      const item = document.createElement('div')
      item.className = `source-item ${isActive ? 'active' : ''}`

      const contributorBadge = source.author
        ? `<div class="source-contributor">
             <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/></svg>
             ${source.author} • ${source.section}
           </div>`
        : '';

      const stampCount = this.app.stamps.filter(s => s.sourceId === source.id).length;

      item.innerHTML = `
        <div class="source-header">
          <div class="source-info">
            <div class="source-dot" style="background: ${source.color}"></div>
            <div class="source-meta-box">
              <div class="style-name-row" style="display:flex; justify-content:space-between; align-items:center;">
                <span class="source-name">${source.name}</span>
                <span class="stamp-count-mini" style="font-size:0.65rem; color:var(--text-muted); font-weight:700;">${stampCount} marks</span>
              </div>
              ${contributorBadge}
            </div>
            ${isActive ? '<span class="active-source-badge">Active</span>' : ''}
          </div>
          <div class="source-controls">
            <button class="btn-sm-icon toggle-vis" title="Toggle Visibility">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${source.visible
          ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
          : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'}
              </svg>
            </button>
            <button class="btn-sm-icon rename-src" title="Rename Style">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            ${this.app.sources.length > 1 ? `
              <button class="btn-sm-icon danger delete-src" title="Remove Style">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="source-actions">
          <label><input type="checkbox" class="source-compare-toggle" ${source.visible ? 'checked' : ''}> Compare</label>
        </div>
        <div class="source-opacity-box">
          <label for="source-opacity-slider-${source.id}">Opacity</label>
          <input id="source-opacity-slider-${source.id}" type="range" class="source-opacity-slider modern-slider" min="0" max="1" step="0.1" value="${source.opacity}">
        </div>
      `;

      item.onclick = (e) => {
        if (e.target.closest('.source-controls') || e.target.closest('.source-opacity-box') || e.target.closest('.source-actions')) return
        this.app.activeSourceId = source.id
        this.app.saveToStorage()
        this.renderSourceUI()
      }

      item.querySelector('.toggle-vis').onclick = (e) => {
        e.stopPropagation()
        source.visible = !source.visible
        source.updatedAt = Date.now()
        this.app.saveToStorage()
        this.renderSourceUI()
        if (this.app.pdf) {
          for (let i = 1; i <= this.app.pdf.numPages; i++) this.app.redrawStamps(i)
        }
      }

      item.querySelector('.rename-src').onclick = (e) => {
        e.stopPropagation()
        const newName = prompt('Rename Interpretation Style:', source.name)
        if (newName) {
          source.name = newName
          source.updatedAt = Date.now()
          this.app.saveToStorage()
          this.renderSourceUI()
        }
      }

      const delBtn = item.querySelector('.delete-src')
      if (delBtn) {
        delBtn.onclick = (e) => {
          e.stopPropagation()
          if (confirm(`Remove "${source.name}" and all its annotations?`)) {
            this.app.stamps = this.app.stamps.filter(s => s.sourceId !== source.id)
            this.app.sources = this.app.sources.filter(s => s.id !== source.id)
            if (this.app.activeSourceId === source.id) this.app.activeSourceId = this.app.sources[0].id
            // The instruction implies adding 'updatedAt' to new layers.
            // As there's no 'addLayer' function or 'this.app.layers' array in this context,
            // and the 'addSource' already includes 'updatedAt',
            // this insertion point for 'this.app.layers.push' is incorrect.
            // Assuming the instruction meant to add 'updatedAt' to a new layer object
            // if such a concept were introduced, but not here.
            // The provided code snippet for insertion is syntactically incorrect here.
            // I will proceed by *not* inserting the malformed snippet,
            // as the 'addSource' function already has 'updatedAt'.
            // If 'layers' is a new concept, it needs a proper function to add them.
            this.app.saveToStorage()
            location.reload()
          }
        }
      }

      item.querySelector('.source-opacity-slider').oninput = (e) => {
        source.opacity = parseFloat(e.target.value)
        if (this.app.pdf) {
          for (let i = 1; i <= this.app.pdf.numPages; i++) this.app.redrawStamps(i)
        }
      }
      item.querySelector('.source-opacity-slider').onchange = () => this.app.saveToStorage()

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
