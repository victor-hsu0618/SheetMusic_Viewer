export class DocActionManager {
    constructor(app) {
        this.app = app
    }

    async exportProject(isGlobal = false) {
        const userName = this.app.profileManager?.data?.userName || 'Guest'
        const filename = this.app.scoreDetailManager.getExportFilename(isGlobal, userName)

        // Cloak export options dialog
        const cloakDefs = [
            { id: 'black', label: '黑色斗篷' },
            { id: 'red',   label: '紅色斗篷' },
            { id: 'gold',  label: '金色斗篷' },
        ]
        const hasCloaked = this.app.stamps.some(s => s.hiddenGroup)
        let includeCloaks = { black: true, red: true, gold: true }
        if (hasCloaked) {
            const result = await this.app.showDialog({
                title: '匯出斗篷標籤',
                message: '選擇要包含在 JSON 中的斗篷標籤：',
                icon: '👻',
                type: 'cloak-export',
                cloakDefs,
                defaultInclude: includeCloaks,
            })
            if (result === 'cancel') return
            if (result && typeof result === 'object') includeCloaks = result
        }

        const exportStamps = this.app.stamps.filter(s =>
            !s.hiddenGroup || includeCloaks[s.hiddenGroup]
        )

        const exportData = {
            version: '2.0',
            exportType: isGlobal ? 'global_backup' : 'single_score',
            author: userName,
            timestamp: Date.now(),
            metadata: this.app.scoreDetailManager.getExportMetadata(),
            sources: this.app.sources,
            layers: this.app.layers,
            stamps: exportStamps
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }



    async handleImport(e) {
        const file = e.target.files[0]
        if (!file) return

        try {
            const text = await file.text()
            const data = JSON.parse(text)

            // Version check or basic validation
            if (!data.stamps || !data.sources) {
                alert('Invalid ScoreFlow data file.')
                return
            }

            const confirmed = await this.app.showDialog({
                title: 'Import Data',
                message: `Importing performance data from ${data.author || 'Unknown'}. How would you like to proceed?`,
                icon: '📥',
                type: 'actions',
                actions: [
                    { id: 'merge', label: 'Merge as New Persona', class: 'btn-primary' },
                    { id: 'overwrite', label: 'Overwrite Current', class: 'btn-outline text-danger' },
                    { id: 'cancel', label: 'Cancel', class: 'btn-ghost' }
                ]
            })

            if (confirmed === 'merge') {
                this.app.importAsNewPersona(data)
            } else if (confirmed === 'overwrite') {
                this.app.overwriteProject(data)
            }
        } catch (err) {
            console.error('Failed to import:', err)
            alert('Failed to parse data file.')
        } finally {
            e.target.value = ''
        }
    }

    importAsNewPersona(data) {
        const newSourceId = `imported_${Date.now()}`
        const newSourceName = `${data.metadata?.name || 'Imported'} (${data.author || 'Guest'})`

        this.app.sources.push({
            id: newSourceId,
            name: newSourceName,
            visible: true,
            opacity: 1,
            color: '#' + Math.floor(Math.random() * 16777215).toString(16),
            author: data.author,
            section: data.metadata?.section || 'Unknown'
        })

        // Add stamps with remapped sourceId
        const remappedStamps = data.stamps.map(s => ({
            ...s,
            sourceId: newSourceId
        }))
        this.app.stamps.push(...remappedStamps)

        this.app.activeSourceId = newSourceId
        this.app.saveToStorage()
        location.reload()
    }

    overwriteProject(data) {
        this.app.sources = data.sources || this.app.sources
        this.app.layers = data.layers || this.app.layers
        this.app.stamps = data.stamps || []
        this.app.saveToStorage()
        location.reload()
    }

    async showDialog({ title, message, icon = 'ℹ️', type = 'alert', actions = [], defaultValue = '', placeholder = '', cloakDefs = [], defaultInclude = {} }) {
        if (!this.app.systemDialog) return

        this.app.dialogTitle.textContent = title
        this.app.dialogMessage.textContent = message
        this.app.dialogIcon.textContent = icon
        this.app.dialogActions.innerHTML = ''

        if (this.app.dialogInput) {
            this.app.dialogInput.value = defaultValue
            this.app.dialogInput.placeholder = placeholder
            this.app.dialogInput.classList.toggle('hidden', type !== 'input')
            // Remove previous listeners if any (simple clone to remove)
            const newInp = this.app.dialogInput.cloneNode(true)
            this.app.dialogInput.parentNode.replaceChild(newInp, this.app.dialogInput)
            this.app.dialogInput = newInp
        }

        return new Promise((resolve) => {
            if (type === 'alert') {
                const btn = document.createElement('button')
                btn.className = 'btn btn-primary'
                btn.textContent = 'OK'
                btn.onclick = () => {
                    this.app.systemDialog.classList.remove('active')
                    resolve(true)
                }
                this.app.dialogActions.appendChild(btn)
            } else if (type === 'confirm') {
                const cancelBtn = document.createElement('button')
                cancelBtn.className = 'btn btn-outline'
                cancelBtn.textContent = 'Cancel'
                cancelBtn.onclick = () => {
                    this.app.systemDialog.classList.remove('active')
                    resolve(false)
                }
                const confirmBtn = document.createElement('button')
                confirmBtn.className = 'btn btn-primary'
                confirmBtn.textContent = 'Confirm'
                confirmBtn.onclick = () => {
                    this.app.systemDialog.classList.remove('active')
                    resolve(true)
                }
                this.app.dialogActions.appendChild(cancelBtn)
                this.app.dialogActions.appendChild(confirmBtn)
            } else if (type === 'actions') {
                actions.forEach(action => {
                    const btn = document.createElement('button')
                    btn.className = `btn ${action.class || ''}`
                    btn.textContent = action.label
                    btn.onclick = () => {
                        this.app.systemDialog.classList.remove('active')
                        resolve(action.id)
                    }
                    this.app.dialogActions.appendChild(btn)
                })
            } else if (type === 'input') {
                const cancelBtn = document.createElement('button')
                cancelBtn.className = 'btn btn-outline'
                cancelBtn.textContent = 'Cancel'
                cancelBtn.onclick = () => {
                    this.app.systemDialog.classList.remove('active')
                    resolve(null)
                }
                const confirmBtn = document.createElement('button')
                confirmBtn.className = 'btn btn-primary'
                confirmBtn.textContent = 'Confirm'
                confirmBtn.onclick = () => {
                    const val = this.app.dialogInput ? this.app.dialogInput.value.trim() : ''
                    this.app.systemDialog.classList.remove('active')
                    resolve(val)
                }
                this.app.dialogActions.appendChild(cancelBtn)
                this.app.dialogActions.appendChild(confirmBtn)

                if (this.app.dialogInput) {
                    this.app.dialogInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            confirmBtn.click()
                        }
                    })
                }
            }

            if (type === 'cloak-export') {
                // Build checkboxes inline in dialogMessage area
                const include = { ...defaultInclude }
                const checkboxContainer = document.createElement('div')
                checkboxContainer.style.cssText = 'margin-top:12px;display:flex;flex-direction:column;gap:8px'
                cloakDefs.forEach(c => {
                    const row = document.createElement('label')
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px'
                    const cb = document.createElement('input')
                    cb.type = 'checkbox'
                    cb.checked = include[c.id] !== false
                    cb.addEventListener('change', () => { include[c.id] = cb.checked })
                    const dot = document.createElement('span')
                    dot.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;background:${
                        c.id === 'black' ? '#374151' : c.id === 'red' ? '#dc2626' : '#d97706'}`
                    const lbl = document.createElement('span')
                    lbl.textContent = c.label
                    row.append(cb, dot, lbl)
                    checkboxContainer.appendChild(row)
                })
                this.app.dialogMessage.appendChild(checkboxContainer)

                const cancelBtn = document.createElement('button')
                cancelBtn.className = 'btn btn-outline'
                cancelBtn.textContent = '取消'
                cancelBtn.onclick = () => { this.app.systemDialog.classList.remove('active'); resolve('cancel') }
                const exportBtn = document.createElement('button')
                exportBtn.className = 'btn btn-primary'
                exportBtn.textContent = '匯出'
                exportBtn.onclick = () => { this.app.systemDialog.classList.remove('active'); resolve(include) }
                this.app.dialogActions.appendChild(cancelBtn)
                this.app.dialogActions.appendChild(exportBtn)
            }

            this.app.systemDialog.classList.add('active')
            if (type === 'input' && this.app.dialogInput) {
                setTimeout(() => this.app.dialogInput.focus(), 100)
            }
        })
    }
}
