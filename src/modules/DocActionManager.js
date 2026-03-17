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
            { id: 'blue',  label: '藍色斗篷' },
        ]
        const hasCloaked = this.app.stamps.some(s => s.hiddenGroup)
        let includeCloaks = { black: true, red: true, blue: true }
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

        const now = Date.now()
        const exportStamps = this.app.stamps
            .filter(s => !s.hiddenGroup || includeCloaks[s.hiddenGroup])
            .map(s => {
                const sNew = { ...s };
                if (!sNew.id) sNew.id = `stamp-${now}-${Math.random().toString(36).slice(2, 9)}`;
                if (!sNew.createdAt) sNew.createdAt = now;
                if (!sNew.updatedAt) sNew.updatedAt = now;
                return sNew;
            });

        const exportData = {
            version: '3.0',
            exportType: isGlobal ? 'global_backup' : 'single_score',
            author: userName,
            timestamp: now,
            pdfFingerprint: this.app.pdfFingerprint || null,
            pdfFileName: this.app.activeScoreName || null,
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
            let data = JSON.parse(text)

            // Perform Sanitization & Normalization on ALL imports
            console.log(`[DocAction] Normalizing import data (current version: ${data.version || '1.0'})...`);
            data = this.migrateLegacyData(data);

            // Basic validation after migration
            if (!data.stamps || !data.sources || !Array.isArray(data.stamps)) {
                console.error('[DocAction] Validation failed:', { hasStamps: !!data.stamps, hasSources: !!data.sources, isStampsArray: Array.isArray(data.stamps) });
                alert('Invalid ScoreFlow data file format.')
                return
            }

            // 1. Fingerprint check for Single Score imports
            if (data.exportType !== 'global_backup' && data.pdfFingerprint && this.app.pdfFingerprint && data.pdfFingerprint !== this.app.pdfFingerprint) {
                const proceed = await this.showDialog({
                    title: 'Fingerprint Mismatch (樂譜不符)',
                    message: `This data was created for "${data.pdfFileName || 'a different score'}". Importing it into the current PDF may result in misaligned markings. Continue?`,
                    type: 'confirm',
                    icon: '⚠️'
                })
                if (!proceed) return
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
                await this.importAsNewPersona(data)
            } else if (confirmed === 'overwrite') {
                await this.overwriteProject(data)
            }
        } catch (err) {
            console.error('[DocAction] Import Error:', err)
            alert(`Failed to import: ${err.message || 'Unknown error. Check console for details.'}`)
        } finally {
            if (e.target) e.target.value = ''
        }
    }

    async importAsNewPersona(data) {
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
        await this.app.saveToStorage()
        
        // UI Refresh instead of reload
        this.app.renderSourceUI()
        this.app.redrawAllAnnotationLayers()
        if (this.app.updateRulerMarks) this.app.updateRulerMarks()
        this.app.showMessage(`Imported data as "${newSourceName}"`, 'success')
    }

    async overwriteProject(data) {
        this.app.sources = data.sources || this.app.sources
        this.app.layers = data.layers || this.app.layers
        this.app.stamps = data.stamps || []
        
        // Update Metadata
        if (data.metadata && this.app.scoreDetailManager) {
            const m = data.metadata;
            const target = this.app.scoreDetailManager.currentInfo;
            target.name = m.name || m.title || target.name;
            target.composer = m.composer || target.composer;
        }

        await this.app.saveToStorage()
        
        // UI Refresh instead of reload
        this.app.renderSourceUI()
        this.app.renderLayerUI()
        this.app.redrawAllAnnotationLayers()
        if (this.app.updateRulerMarks) this.app.updateRulerMarks()
        this.app.showMessage('Project overwritten successfully', 'success')
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
                        c.id === 'black' ? '#374151' : c.id === 'red' ? '#dc2626' : '#2563eb'}`
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

    migrateLegacyData(data) {
        console.log('[DocAction] Migrating & Healing data:', {
            hasStamps: !!data.stamps,
            version: data.version,
            sourceCount: data.sources?.length || 0
        });

        const migrated = {
            version: '3.0',
            exportType: data.exportType || 'single_score',
            author: data.author || 'Guest',
            timestamp: Date.now(),
            pdfFingerprint: data.pdfFingerprint || null,
            pdfFileName: data.pdfFileName || null,
            metadata: data.metadata || {},
            sources: data.sources || [
                { id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' }
            ],
            layers: data.layers || [],
            stamps: []
        };

        const primarySourceId = (migrated.sources && migrated.sources[0]?.id) || 'self';
        const rawStamps = data.stamps || data.annotations || data.marks || [];
        
        // 1. Repair & Normalize
        const repaired = rawStamps.map(s => {
            const sNew = { ...s };
            
            // FIX: Ensure sourceId exists in the current project, otherwise map to primary
            if (!sNew.sourceId || !migrated.sources.some(src => src.id === sNew.sourceId)) {
                sNew.sourceId = primarySourceId;
            }

            if (sNew.layerId === 'performance') sNew.layerId = 'text';
            if (sNew.layerId === 'other' || sNew.layerId === 'layout') sNew.layerId = 'others';
            if (typeof sNew.page === 'string') sNew.page = parseInt(sNew.page, 10);
            
            // ENSURE: id, createdAt, updatedAt exist for Cloud Merge stability
            const now = Date.now();
            if (!sNew.id) {
                // If it's a legacy system stamp or something from very old SF
                sNew.id = `stamp-${now}-${Math.random().toString(36).slice(2, 9)}`;
            }
            if (!sNew.createdAt) sNew.createdAt = now;
            if (!sNew.updatedAt) sNew.updatedAt = now;

            // Critical Fix: Type-to-Layer mapping and Draw logic for system items
            if (sNew.type === 'anchor' || sNew.type === 'measure' || sNew.type === 'measure-free') {
                sNew.layerId = 'others';
                // Ensure draw variant is present for measures to prevent rendering failures
                if (sNew.type.startsWith('measure') && (!sNew.draw || sNew.draw.variant !== 'measure')) {
                    sNew.draw = { type: 'special', variant: 'measure' };
                }
            } else if (sNew.type === 'system' || !sNew.type) {
                // HEAL: If it's labeled as 'system' but has points, it's a pen mark
                if (sNew.points) {
                    sNew.type = 'pen';
                    if (!sNew.layerId || sNew.layerId === 'performance') sNew.layerId = 'draw';
                } else if (sNew.data && sNew.layerId === 'text') {
                    sNew.type = 'text';
                }
            }
            return sNew;
        });

        // 2. Intelligent Deduplication (Consolidate overlapping measures)
        const uniqueStamps = [];
        repaired.forEach(s => {
            if (s.deleted) return;

            const isDuplicate = uniqueStamps.some(existing => {
                if (existing.type !== s.type || existing.page !== s.page) return false;
                
                // For measures, if the data (label) is the same, deduplicate more aggressively
                if ((s.type === 'measure' || s.type === 'measure-free') && s.data === existing.data) {
                    const dx = Math.abs((existing.x || 0) - (s.x || 0));
                    const dy = Math.abs((existing.y || 0) - (s.y || 0));
                    return dx < 0.01 && dy < 0.01; // 1% tolerance for same-number measures
                }

                // For other types, require very close proximity
                const dx = Math.abs((existing.x || 0) - (s.x || 0));
                const dy = Math.abs((existing.y || 0) - (s.y || 0));
                return dx < 0.005 && dy < 0.005; 
            });

            if (!isDuplicate) uniqueStamps.push(s);
        });

        migrated.stamps = uniqueStamps;

        // 3. Migrate & Normalize Layers
        if (migrated.layers.length === 0) {
            migrated.layers = JSON.parse(JSON.stringify(this.app.layers)); 
        }
        
        migrated.layers.forEach(l => {
            // Normalize legacy IDs to modern standards
            if (l.id === 'other' || l.id === 'layout' || l.type === 'layout') {
                l.id = 'others';
                l.type = 'others';
            }
            if (l.id === 'performance') l.id = 'text';

            if (l.id === 'text' && l.name !== 'Text') l.name = 'Text';
            if (l.id === 'others' && l.name !== 'Others') l.name = 'Others';

            if (l.name === 'Bow/Fingering' || l.name === 'Fingering' || l.name === 'F.Fingering') {
                l.name = 'B.Fingering';
                if (l.color === '#ff4757' || l.color === '#3b82f6') l.color = '#be123c';
            }
            if (l.id === 'draw' && l.name !== 'Pens') l.name = 'Pens';
            if (l.id === 'draw' && (l.color === '#ff4757' || l.color === '#3b82f6')) l.color = '#1d4ed8';
        });

        // Final safety: Ensure others layer exists in the layers array
        if (!migrated.layers.some(l => l.id === 'others')) {
            migrated.layers.push({ id: 'others', name: 'Others', color: '#94a3b8', visible: true, type: 'others' });
        }
        if (!migrated.layers.some(l => l.id === 'text')) {
             migrated.layers.push({ id: 'text', name: 'Text', color: '#b45309', visible: true, type: 'text' });
        }

        console.log(`[DocAction] Migration complete. Deduplicated ${rawStamps.length - uniqueStamps.length} stamps.`);
        return migrated;
    }
}
