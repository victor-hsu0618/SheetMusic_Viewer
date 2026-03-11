import { AnnotationRenderer } from './AnnotationRenderer.js';
import { InteractionManager } from './InteractionManager.js';

/**
 * AnnotationManager orchestrates the logic for creating, rendering, and managing annotations (stamps, paths).
 * It delegates rendering to AnnotationRenderer and event management to InteractionManager.
 */
export class AnnotationManager {
    constructor(app) {
        this.app = app;
        this.renderer = new AnnotationRenderer(app);
        this.interaction = new InteractionManager(app);
    }

    // --- RENDERER PROXIES ---
    redrawStamps(page) { this.renderer.redrawStamps(page); }
    drawPathOnCanvas(ctx, canvas, path, isForeign, isHovered, isSelectHovered) {
        this.renderer.drawPathOnCanvas(ctx, canvas, path, isForeign, isHovered, isSelectHovered);
    }
    drawStampOnCanvas(ctx, canvas, stamp, color, isForeign, isHovered, isSelectHovered, fingerPos) {
        this.renderer.drawStampOnCanvas(ctx, canvas, stamp, color, isForeign, isHovered, isSelectHovered, fingerPos);
    }
    redrawAllAnnotationLayers() { this.renderer.redrawAllAnnotationLayers(); }

    // --- INTERACTION PROXIES ---
    createCaptureOverlay(wrapper, pageNum, width, height) {
        this.interaction.createCaptureOverlay(wrapper, pageNum, width, height);
    }

    // --- CORE LOGIC METHODS ---

    /**
     * Check if the current active tool is a "stamp" tool (not a selection/edit tool).
     */
    isStampTool() {
        return !['view', 'select', 'eraser', 'pen', 'highlighter', 'line', 'recycle-bin'].includes(this.app.activeStampType);
    }

    /**
     * Get a user-friendly label for a stamp/annotation.
     */
    getStampLabel(stamp) {
        if (stamp.points) {
            const typeMap = { pen: 'Pen Stroke', highlighter: 'Highlight', line: 'Line' }
            return typeMap[stamp.type] || 'Drawing'
        }
        for (const set of this.app.toolsets) {
            const tool = set.tools.find(t => t.id === stamp.type)
            if (tool) return tool.label
        }
        return stamp.type || 'Object'
    }

    /**
     * Get an emoji icon for a specific annotation type.
     */
    getStampIcon(stamp) {
        const typeMap = {
            'pen': '✏️',
            'highlighter': '🖊',
            'line': '—',
            'anchor': '⚓',
            'text': 'T',
            'tempo-text': 'T',
            'accent': '>',
            'staccato': '·',
            'fermata': '𝄐'
        };
        if (typeMap[stamp.type]) return typeMap[stamp.type];
        if (['down-bow', 'up-bow'].includes(stamp.type)) return '🎻';
        return '♩';
    }

    /**
     * Find all annotations near a normalized coordinate (x, y).
     */
    findNearbyStamps(page, x, y, allSources = false) {
        // More precise threshold: 0.04 instead of 0.06
        const threshold = 0.04
        const results = []
        
        // Use all visible sources if allSources is true
        const activeSourceIds = allSources 
            ? this.app.sources.filter(s => s.visible).map(s => s.id)
            : [this.app.activeSourceId]

        this.app.stamps.forEach(s => {
            if (s.page !== page || s.deleted) return
            if (!activeSourceIds.includes(s.sourceId)) return
            
            let dist
            if (s.points && s.points.length > 0) {
                // Improved Path distance: Check all segments (line-point distance)
                dist = this._minDistanceToPath(x, y, s.points)
            } else {
                // Stamp distance: simple Euclidean
                dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2))
            }
            
            if (dist < threshold) results.push({ stamp: s, dist })
        })
        return results.sort((a, b) => a.dist - b.dist).map(r => r.stamp)
    }

    /**
     * Calculate minimum distance from a point to a path (series of segments).
     */
    _minDistanceToPath(px, py, points) {
        if (points.length === 0) return Infinity
        if (points.length === 1) return Math.sqrt(Math.pow(points[0].x - px, 2) + Math.pow(points[0].y - py, 2))
        
        let minDist = Infinity
        for (let i = 0; i < points.length - 1; i++) {
            const d = this._distToSegment(px, py, points[i], points[i+1])
            if (d < minDist) minDist = d
        }
        return minDist
    }

    /**
     * Distance from point P to line segment AB.
     */
    _distToSegment(px, py, a, b) {
        const l2 = Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2)
        if (l2 === 0) return Math.sqrt(Math.pow(a.x - px, 2) + Math.pow(a.y - py, 2))
        let t = ((px - a.x) * (b.x - a.x) + (py - a.y) * (b.y - a.y)) / l2
        t = Math.max(0, Math.min(1, t))
        return Math.sqrt(Math.pow(px - (a.x + t * (b.x - a.x)), 2) + Math.pow(py - (a.y + t * (b.y - a.y)), 2))
    }

    /**
     * Find the single closest annotation.
     */
    findClosestStamp(page, x, y, allSources = false) {
        return this.findNearbyStamps(page, x, y, allSources)[0] || null
    }

    /**
     * Erase a specific annotation object.
     */
    eraseStampTarget(stamp) {
        const page = stamp.page
        const idx = this.app.stamps.indexOf(stamp)
        if (idx === -1) return
        this.app.stamps.splice(idx, 1)
        if (stamp.type === 'anchor' || stamp.type === 'measure') this.app.updateRulerMarks()
        this.app.hoveredStamp = null
        this.closeEraseMenu()
        const wrapper = document.querySelector(`.page-container[data-page="${page}"]`)
        if (wrapper) {
            const chip = wrapper.querySelector('.erase-hover-chip')
            if (chip) chip.remove()
        }
        stamp.deleted = true
        stamp.updatedAt = Date.now()
        this.app.saveToStorage(true)
        if (this.app.onAnnotationChanged) this.app.onAnnotationChanged()
        this.redrawStamps(page)
    }

    /**
     * Show context menu for choosing an object to erase when multiple are nearby.
     */
    showEraseMenu(stamps, screenX, screenY) {
        this.closeEraseMenu()
        const menu = document.createElement('div')
        menu.className = 'erase-context-menu'
        menu.id = 'erase-context-menu'
        const header = document.createElement('div')
        header.className = 'erase-menu-header'
        header.textContent = `${stamps.length} Nearby Objects — Pick one to delete`
        menu.appendChild(header)
        stamps.forEach((stamp, idx) => {
            const item = document.createElement('button')
            item.className = 'erase-menu-item'
            const iconEl = document.createElement('span')
            iconEl.className = 'erase-item-icon'
            iconEl.textContent = this.getStampIcon(stamp)
            const label = document.createElement('span')
            label.className = 'erase-item-label'
            label.textContent = this.getStampLabel(stamp)
            const badge = document.createElement('span')
            badge.className = 'erase-item-badge'
            badge.textContent = `Pg ${stamp.page}`
            item.appendChild(iconEl)
            item.appendChild(label)
            item.appendChild(badge)
            item.addEventListener('mouseenter', () => {
                this.app.hoveredStamp = stamp
                this.redrawStamps(stamp.page)
            })
            item.addEventListener('mouseleave', () => {
                this.app.hoveredStamp = null
                this.redrawStamps(stamp.page)
            })
            item.addEventListener('click', (e) => {
                e.stopPropagation()
                this.eraseStampTarget(stamp)
            })
            menu.appendChild(item)
        })
        const cancel = document.createElement('div')
        cancel.className = 'erase-menu-cancel'
        cancel.textContent = 'Esc to cancel'
        menu.appendChild(cancel)
        document.body.appendChild(menu)
        const rect = menu.getBoundingClientRect()
        const vw = window.innerWidth, vh = window.innerHeight
        let left = screenX + 12, top = screenY + 12
        if (left + rect.width > vw - 8) left = screenX - rect.width - 12
        if (top + rect.height > vh - 8) top = screenY - rect.height - 12
        menu.style.left = `${Math.max(8, left)}px`
        menu.style.top = `${Math.max(8, top)}px`
        this.app._eraseMenuDismiss = (e) => { if (!menu.contains(e.target)) this.closeEraseMenu() }
        this.app._eraseMenuEsc = (e) => { if (e.key === 'Escape') this.closeEraseMenu() }
        setTimeout(() => {
            document.addEventListener('mousedown', this.app._eraseMenuDismiss)
            document.addEventListener('keydown', this.app._eraseMenuEsc)
        }, 0)
    }

    closeEraseMenu() {
        const existing = document.getElementById('erase-context-menu')
        if (existing) existing.remove()
        if (this.app._eraseMenuDismiss) {
            document.removeEventListener('mousedown', this.app._eraseMenuDismiss)
            this.app._eraseMenuDismiss = null
        }
        if (this.app._eraseMenuEsc) {
            document.removeEventListener('keydown', this.app._eraseMenuEsc)
            this.app._eraseMenuEsc = null
        }
        if (this.app.hoveredStamp) {
            const page = this.app.hoveredStamp.page
            this.app.hoveredStamp = null
            this.redrawStamps(page)
        }
    }

    /**
     * Show the "Erase All" UI with category buckets strictly matching TOOLSETS/Stamp Panel categories.
     */
    showEraseAllModal() {
        if (!this.app.eraseAllModal) return
        const categoryMap = new Map()
        
        // 1. Map each tool ID to its Toolset Group Name for instant lookup
        const toolToGroup = {}
        const groupMeta = {} // color and order
        
        this.app.toolsets.forEach(group => {
            if (group.type === 'edit') return // Skip edit tools like eraser/select
            
            // Find corresponding layer color
            const layer = this.app.layers.find(l => l.type === group.type || l.id === group.type)
            groupMeta[group.name] = { 
                color: layer ? layer.color : '#cbd5e1',
                order: this.app.toolsets.indexOf(group)
            }
            
            group.tools.forEach(t => {
                toolToGroup[t.id] = group.name
            })
        })

        // 2. Sort existing stamps into buckets
        this.app.stamps.forEach(stamp => {
            if (stamp.deleted) return
            
            let groupName = toolToGroup[stamp.type]

            // --- Robust Mapping for leftovers ---
            if (!groupName) {
                if (stamp.type.startsWith('custom-text-') || stamp.type.startsWith('text-')) {
                    groupName = 'Text'
                } else if (['anchor', 'music-anchor', 'measure'].includes(stamp.type)) {
                    groupName = 'Other (Layout)'
                } else if (['pen', 'highlighter', 'line'].includes(stamp.type)) {
                    groupName = 'Pens'
                } else if (stamp.layerId === 'articulation') {
                    groupName = 'Articulation'
                } else if (stamp.layerId === 'fingering') {
                    groupName = 'Bow/Fingering'
                } else {
                    groupName = 'Pens' // Absolute fallback
                }
            }

            if (!categoryMap.has(groupName)) {
                categoryMap.set(groupName, [])
            }
            categoryMap.get(groupName).push(stamp)
        })

        const list = document.getElementById('erase-all-category-list')
        list.innerHTML = ''
        let hasAny = false
        
        // 3. Render rows matching Toolset Names and order
        const sortedGroups = Array.from(categoryMap.keys()).sort((a, b) => {
            const orderA = groupMeta[a]?.order ?? 99
            const orderB = groupMeta[b]?.order ?? 99
            return orderA - orderB
        })

        sortedGroups.forEach(groupName => {
            const stamps = categoryMap.get(groupName)
            if (stamps.length === 0) return
            
            hasAny = true
            const row = document.createElement('button')
            row.className = 'erase-all-cat-row'
            
            const iconEl = document.createElement('span')
            iconEl.className = 'erase-all-cat-icon'
            iconEl.style.display = 'inline-block'
            iconEl.style.width = '12px'
            iconEl.style.height = '12px'
            iconEl.style.borderRadius = '2px' // Boxy for toolset distinction
            iconEl.style.backgroundColor = groupMeta[groupName]?.color || '#cbd5e1'
            iconEl.style.marginRight = '12px'
            
            const nameEl = document.createElement('span')
            nameEl.className = 'erase-all-cat-name'
            nameEl.textContent = groupName
            
            const countEl = document.createElement('span')
            countEl.className = 'erase-all-cat-count'
            countEl.textContent = stamps.length
            
            row.appendChild(iconEl)
            row.appendChild(nameEl)
            row.appendChild(countEl)
            
            row.addEventListener('click', () => {
                this._confirmEraseSpecificStamps(groupName, stamps)
            })
            list.appendChild(row)
        })

        const activeStamps = this.app.stamps.filter(s => !s.deleted)
        const total = activeStamps.length

        if (total > 0) {
            const allRow = document.createElement('button')
            allRow.className = 'erase-all-cat-row cat-all'
            const iconEl = document.createElement('span')
            iconEl.className = 'erase-all-cat-icon'
            iconEl.textContent = '🗑️'
            const nameEl = document.createElement('span')
            nameEl.className = 'erase-all-cat-name'
            nameEl.textContent = 'All Annotations'
            const countEl = document.createElement('span')
            countEl.className = 'erase-all-cat-count'
            countEl.textContent = total
            allRow.appendChild(iconEl)
            allRow.appendChild(nameEl)
            allRow.appendChild(countEl)
            allRow.addEventListener('click', () => {
                this._confirmEraseSpecificStamps('all annotations', activeStamps)
            })
            list.appendChild(allRow)
        }

        if (!hasAny && total === 0) {
            const empty = document.createElement('p')
            empty.style.cssText = 'text-align:center;opacity:0.5;font-size:13px;padding:16px 0'
            empty.textContent = 'No annotations on this score.'
            list.appendChild(empty)
        }

        this.app.eraseAllModal.classList.add('active')
        this.app._eraseAllEsc = (e) => { if (e.key === 'Escape') this.closeEraseAllModal() }
        document.addEventListener('keydown', this.app._eraseAllEsc)
    }

    async _confirmEraseSpecificStamps(displayName, stampsToErase) {
        this.closeEraseAllModal()
        const count = stampsToErase.length
        const label = displayName.includes('all') ? displayName : `all "${displayName}" annotations`
        
        const confirmed = await this.app.showDialog({
            title: 'Erase All',
            message: `Delete ${label} (${count} item${count !== 1 ? 's' : ''})? This cannot be undone.`,
            icon: '🗑️',
            type: 'confirm',
            confirmText: 'Delete',
            cancelText: 'Cancel',
        })
        
        if (!confirmed) return
        
        stampsToErase.forEach(s => {
            s.deleted = true
            s.updatedAt = Date.now()
        })
        
        this.app.updateRulerMarks()
        this.app.computeNextTarget()
        document.querySelectorAll('.page-container[data-page]').forEach(wrapper => {
            const page = parseInt(wrapper.dataset.page)
            this.redrawStamps(page)
        })
        this.app.saveToStorage(true)
        if (this.app.onAnnotationChanged) this.app.onAnnotationChanged()
    }

    eraseAllByLayer(layerId) {
        // Keeping this for backward compatibility if called from elsewhere, 
        // but the main UI now uses _confirmEraseSpecificStamps for better accuracy.
        let removed = 0
        if (layerId === '__all__') {
            this.app.stamps.forEach(s => {
                if (!s.deleted) {
                    s.deleted = true
                    s.updatedAt = Date.now()
                    removed++
                }
            })
        } else {
            this.app.stamps.forEach(s => {
                if (!s.deleted && s.layerId === layerId) {
                    s.deleted = true
                    s.updatedAt = Date.now()
                    removed++
                }
            })
        }
        if (removed === 0) return
        this.app.updateRulerMarks()
        this.app.computeNextTarget()
        document.querySelectorAll('.page-container[data-page]').forEach(wrapper => {
            const page = parseInt(wrapper.dataset.page)
            this.redrawStamps(page)
        })
        this.app.saveToStorage(true)
        if (this.app.onAnnotationChanged) this.app.onAnnotationChanged()
    }

    closeEraseAllModal() {
        if (this.app.eraseAllModal) this.app.eraseAllModal.classList.remove('active')
        if (this.app._eraseAllEsc) {
            document.removeEventListener('keydown', this.app._eraseAllEsc)
            this.app._eraseAllEsc = null
        }
        if (this.app.hoveredStamp) {
            const page = this.app.hoveredStamp.page
            this.app.hoveredStamp = null
            this.redrawStamps(page)
        }
    }

    /**
     * Show context menu for choosing an object to select/move.
     */
    showSelectMenu(stamps, screenX, screenY, onSelect) {
        this.closeSelectMenu()
        const menu = document.createElement('div')
        menu.className = 'erase-context-menu select-context-menu'
        menu.id = 'select-context-menu'
        const header = document.createElement('div')
        header.className = 'erase-menu-header'
        header.textContent = `${stamps.length} Nearby Objects — Pick one to move`
        menu.appendChild(header)
        stamps.forEach(stamp => {
            const item = document.createElement('button')
            item.className = 'erase-menu-item'
            const iconEl = document.createElement('span')
            iconEl.className = 'erase-item-icon'
            iconEl.textContent = this.getStampIcon(stamp)
            const label = document.createElement('span')
            label.className = 'erase-item-label'
            label.textContent = this.getStampLabel(stamp)
            const badge = document.createElement('span')
            badge.className = 'erase-item-badge'
            badge.textContent = `Pg ${stamp.page}`
            item.appendChild(iconEl)
            item.appendChild(label)
            item.appendChild(badge)
            item.addEventListener('mouseenter', () => {
                this.app.selectHoveredStamp = stamp
                this.redrawStamps(stamp.page)
            })
            item.addEventListener('mouseleave', () => {
                this.app.selectHoveredStamp = null
                this.redrawStamps(stamp.page)
            })
            item.addEventListener('click', (e) => {
                e.stopPropagation()
                this.app.selectHoveredStamp = null
                this.closeSelectMenu()
                if (onSelect) onSelect(stamp)
            })
            menu.appendChild(item)
        })
        const cancel = document.createElement('div')
        cancel.className = 'erase-menu-cancel'
        cancel.textContent = 'Esc to cancel'
        menu.appendChild(cancel)
        document.body.appendChild(menu)
        const rect = menu.getBoundingClientRect()
        const vw = window.innerWidth, vh = window.innerHeight
        let left = screenX + 12, top = screenY + 12
        if (left + rect.width > vw - 8) left = screenX - rect.width - 12
        if (top + rect.height > vh - 8) top = screenY - rect.height - 12
        menu.style.left = `${Math.max(8, left)}px`
        menu.style.top = `${Math.max(8, top)}px`
        this.app._selectMenuDismiss = (e) => { if (!menu.contains(e.target)) this.closeSelectMenu() }
        this.app._selectMenuEsc = (e) => { if (e.key === 'Escape') this.closeSelectMenu() }
        setTimeout(() => {
            document.addEventListener('mousedown', this.app._selectMenuDismiss)
            document.addEventListener('keydown', this.app._selectMenuEsc)
        }, 0)
    }

    closeSelectMenu() {
        const existing = document.getElementById('select-context-menu')
        if (existing) existing.remove()
        if (this.app._selectMenuDismiss) {
            document.removeEventListener('mousedown', this.app._selectMenuDismiss)
            this.app._selectMenuDismiss = null
        }
        if (this.app._selectMenuEsc) {
            document.removeEventListener('keydown', this.app._selectMenuEsc)
            this.app._selectMenuEsc = null
        }
        if (this.app.selectHoveredStamp) {
            const page = this.app.selectHoveredStamp.page
            this.app.selectHoveredStamp = null
            this.redrawStamps(page)
        }
    }

    /**
     * Spawn the floating text editor for text/tempo-text annotations.
     */
    spawnTextEditor(wrapper, pageNum, stamp) {
        const overlay = wrapper.querySelector('.capture-overlay')
        if (!overlay) return
        const editor = document.createElement('textarea')
        editor.className = 'floating-text-editor'
        editor.placeholder = 'Type here...'
        editor.style.left = (stamp.x * 100) + '%'
        editor.style.top = (stamp.y * 100) + '%'
        const layer = this.app.layers.find(l => l.id === stamp.layerId)
        editor.style.color = layer ? layer.color : '#ff4757'
        overlay.appendChild(editor)
        setTimeout(() => {
            editor.focus()
            editor.style.height = 'auto'
            editor.style.height = editor.scrollHeight + 'px'
        }, 10)
        const finalize = () => {
            const val = editor.value.trim()
            if (val) {
                stamp.data = val
                // Auto-save to library if it's new
                if (!this.app.userTextLibrary.includes(val)) {
                    this.app.userTextLibrary.push(val)
                    if (this.app.profileManager?.data) this.app.profileManager.data.updatedAt = Date.now()
                }
                this.app.stamps.push(stamp)
                this.app.saveToStorage(true)
                this.redrawStamps(pageNum)
                if (this.app.toolManager) this.app.toolManager.updateActiveTools()
            }
            editor.remove()
        }
        editor.onblur = () => { if (editor.value.trim()) finalize(); else editor.remove(); }
        editor.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finalize(); }
            if (e.key === 'Escape') { editor.remove(); }
            e.stopPropagation();
        }
        editor.oninput = () => {
            editor.style.height = 'auto';
            editor.style.height = editor.scrollHeight + 'px';
        }
    }

    /**
     * Show the measure number keypad dialog.
     */
    async promptMeasureNumber(defVal) {
        return new Promise(resolve => {
            const dialog = document.getElementById('measure-dialog')
            const display = document.getElementById('measure-display')
            const stepDisplay = document.getElementById('measure-step-display')
            const btnDec = document.getElementById('measure-step-minus')
            const btnInc = document.getElementById('measure-step-plus')
            const btnCancel = document.getElementById('measure-cancel')

            if (!dialog || !display) {
                resolve(prompt('Enter measure number:', defVal))
                return
            }

            this.app.measureStep = this.app.measureStep || 4
            const lastVal = parseInt(this.app.lastMeasureNum || 0)

            // "Current" anticipated value based on last + increment
            let currentDefVal = Math.min(999, Math.max(1, lastVal + this.app.measureStep))
            stepDisplay.textContent = this.app.measureStep

            let typed = ''
            const showDisplay = () => {
                // If user typed something, show it directly; otherwise show the computed "Current" val
                display.textContent = typed || String(currentDefVal)
                display.style.opacity = typed ? '1' : '0.45'
                stepDisplay.textContent = this.app.measureStep
            }
            showDisplay()

            const getValue = () => typed ? parseInt(typed) : currentDefVal

            const updateIncrement = (delta) => {
                // Adjustment logic: Update the increment AND the resulting "Current" value
                let newStep = this.app.measureStep + delta
                if (newStep < -100) newStep = -100 // Allow some back-counting if needed
                if (newStep > 999) newStep = 999
                this.app.measureStep = newStep

                // Recalculate what we are placing "This Time"
                currentDefVal = Math.min(999, Math.max(1, lastVal + this.app.measureStep))
                showDisplay()
            }

            const confirm = () => {
                cleanup()
                resolve(getValue())
            }

            const onKeyDown = (e) => {
                if (e.key === 'Enter') {
                    if (e.target?.classList.contains('keypad-btn')) return
                    e.preventDefault(); e.stopPropagation(); confirm(); return
                }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(); resolve(null); return }
                e.stopPropagation()
            }
            document.addEventListener('keydown', onKeyDown)

            const cleanup = () => {
                dialog.classList.remove('active')
                document.removeEventListener('keydown', onKeyDown)
                dialog.querySelectorAll('.keypad-btn').forEach(btn => { btn.onclick = null })
                if (btnDec) btnDec.onclick = null
                if (btnInc) btnInc.onclick = null
                if (btnCancel) btnCancel.onclick = null
            }

            dialog.querySelectorAll('.keypad-btn').forEach(btn => {
                btn.onclick = () => {
                    const key = btn.dataset.key
                    if (key === 'confirm') { confirm(); return }
                    if (key === 'back') {
                        typed = typed.slice(0, -1)
                    } else {
                        if (typed === '' && key === '0') return
                        const next = typed + key
                        if (next.length <= 3) typed = next
                    }
                    showDisplay()
                }
            })

            if (btnDec) btnDec.onclick = () => updateIncrement(-1)
            if (btnInc) btnInc.onclick = () => updateIncrement(1)
            if (btnCancel) btnCancel.onclick = () => { cleanup(); resolve(null) }

            dialog.classList.add('active')
        })
    }

    /**
     * Update layer visibility, save state, and redraw all stamps.
     */
    updateLayerVisibility() {
        this.app.saveToStorage()
        if (this.app.pdf) {
            for (let i = 1; i <= this.app.pdf.numPages; i++) {
                this.redrawStamps(i)
            }
        }
    }

    /**
     * Helper to add a stamp programmatically.
     */
    async addStamp(page, type, x, y) {
        if (type === 'eraser') {
            const target = this.findClosestStamp(page, x, y)
            if (target) this.eraseStampTarget(target)
            return
        }

        let targetLayerId = 'draw'

        const group = this.app.toolsets.find(g => g.tools.some(t => t.id === type))
        if (group) {
            const layer = this.app.layers.find(l => l.type === group.type)
            if (layer) targetLayerId = layer.id
        }

        const layer = this.app.layers.find(l => l.id === targetLayerId)
        if (layer) layer.visible = true

        let data = null
        let draw = group?.tools.find(t => t.id === type)?.draw

        // SPECIAL: Handle User Custom Text Library
        if (type.startsWith('custom-text-') && this.app._activeCustomText) {
            draw = {
                type: 'text',
                content: this.app._activeCustomText,
                font: 'italic 300',
                size: 22,
                fontFace: 'serif'
            }
        }

        if (type === 'text' || type === 'tempo-text') {
            const inputText = prompt('Enter text:')
            if (!inputText || !inputText.trim()) return
            data = inputText.trim()
            // Auto-save to library
            if (!this.app.userTextLibrary.includes(data)) {
                this.app.userTextLibrary.push(data)
                if (this.app.profileManager?.data) this.app.profileManager.data.updatedAt = Date.now()
            }
        } else if (type === 'measure') {
            let defVal = 1
            if (this.app.lastMeasureNum) {
                defVal = parseInt(this.app.lastMeasureNum) + (this.app.measureStep || 4)
            }
            const measureInput = await this.promptMeasureNumber(defVal)
            if (!measureInput) return
            this.app.lastMeasureNum = String(measureInput)
            data = String(measureInput)
            const existingMeasure = this.app.stamps.find(s => s.type === 'measure' && s.page === page)
            if (existingMeasure) x = existingMeasure.x
        }

        const now = Date.now();
        this.app.stamps.push({
            id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `stamp-${now}-${Math.random().toString(36).slice(2, 9)}`,
            page,
            layerId: targetLayerId,
            sourceId: this.app.activeSourceId,
            type,
            x,
            y,
            data,
            draw,
            createdAt: now,
            updatedAt: now
        })

        if (type === 'anchor' || type === 'measure') {
            this.app.updateRulerMarks()
        }

        this.app.saveToStorage(true)
        if (this.app.onAnnotationChanged) this.app.onAnnotationChanged()
        this.updateLayerVisibility()
        this.redrawStamps(page)
    }

    /**
     * Draw a default anchor at the bottom of a page to ensure continuous flow.
     */
    drawPageEndAnchor(page) {
        const pageWrapper = document.querySelector(`.page-container[data-page="${page}"]`)
        if (!pageWrapper) return
        const activeCanvas = pageWrapper.querySelector(`.annotation-layer[data-layer-id="${this.app.activeLayerId}"]`)
        if (activeCanvas) {
            const ctx = activeCanvas.getContext('2d')
            this.renderer.drawStampOnCanvas(ctx, activeCanvas, { type: 'anchor', x: 0.05, y: 1.0, isDefault: true }, '#3b82f6')
        }
    }

    /**
     * Merge anchors that are too close together to prevent redundant jump targets.
     */
    cleanupAnchors(page) {
        const anchors = this.app.stamps.filter(s => s.page === page && s.type === 'anchor')
        if (anchors.length <= 1) return false

        anchors.sort((a, b) => a.y - b.y)

        let stampsToRemove = []
        let currentCluster = []

        anchors.forEach(stamp => {
            if (currentCluster.length === 0) {
                currentCluster.push(stamp)
            } else {
                if (stamp.y - currentCluster[0].y <= 0.333) {
                    currentCluster.push(stamp)
                } else {
                    const winner = currentCluster.reduce((max, cur) => cur.y > max.y ? cur : max)
                    currentCluster.forEach(s => { if (s !== winner) stampsToRemove.push(s) })
                    currentCluster = [stamp]
                }
            }
        })

        if (currentCluster.length > 0) {
            const winner = currentCluster.reduce((max, cur) => cur.y > max.y ? cur : max)
            currentCluster.forEach(s => { if (s !== winner) stampsToRemove.push(s) })
        }

        if (stampsToRemove.length > 0) {
            this.app.stamps = this.app.stamps.filter(s => !stampsToRemove.includes(s))
            return true
        }
        return false
    }
}
