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
    drawStampOnCanvas(ctx, canvas, stamp, color, isForeign, isHovered, isSelectHovered) {
        this.renderer.drawStampOnCanvas(ctx, canvas, stamp, color, isForeign, isHovered, isSelectHovered);
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
        const threshold = 0.06
        const results = []
        this.app.stamps.forEach(s => {
            if (s.page !== page) return
            if (!allSources && s.sourceId !== this.app.activeSourceId) return
            let dist
            if (s.points && s.points.length > 0) {
                dist = Math.min(...s.points.map(p => Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2))))
            } else {
                dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2))
            }
            if (dist < threshold) results.push({ stamp: s, dist })
        })
        return results.sort((a, b) => a.dist - b.dist).map(r => r.stamp)
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
        if (stamp.type === 'anchor') this.app.updateRulerMarks()
        this.app.hoveredStamp = null
        this.closeEraseMenu()
        const wrapper = document.querySelector(`.page-container[data-page="${page}"]`)
        if (wrapper) {
            const chip = wrapper.querySelector('.erase-hover-chip')
            if (chip) chip.remove()
        }
        this.app.saveToStorage(true)
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
     * Show the "Erase All" UI with category buckets.
     */
    showEraseAllModal() {
        if (!this.app.eraseAllModal) return
        const categoryMap = new Map()
        const categoryMeta = {
            'Pens': { icon: '✏️' },
            'Bow/Fingering': { icon: '🎻' },
            'Articulation': { icon: '🎵' },
            'Tempo': { icon: '♩' },
            'Dynamic': { icon: 'f' },
            'Anchor': { icon: '⚓' },
        }
        for (const [name, meta] of Object.entries(categoryMeta)) {
            categoryMap.set(name, { icon: meta.icon, stamps: [] })
        }
        for (const stamp of this.app.stamps) {
            const group = this.app.toolsets.find(g => g.tools.some(t => t.id === stamp.type))
            if (!group || group.type === 'edit') continue
            if (!categoryMap.has(group.name)) categoryMap.set(group.name, { icon: '📌', stamps: [] })
            categoryMap.get(group.name).stamps.push(stamp)
        }
        const list = document.getElementById('erase-all-category-list')
        list.innerHTML = ''
        let hasAny = false
        for (const [name, { icon, stamps }] of categoryMap.entries()) {
            if (stamps.length === 0) continue
            hasAny = true
            const row = document.createElement('button')
            row.className = 'erase-all-cat-row'
            const iconEl = document.createElement('span')
            iconEl.className = 'erase-all-cat-icon'
            iconEl.textContent = icon
            const nameEl = document.createElement('span')
            nameEl.className = 'erase-all-cat-name'
            nameEl.textContent = name
            const countEl = document.createElement('span')
            countEl.className = 'erase-all-cat-count'
            countEl.textContent = stamps.length
            row.appendChild(iconEl)
            row.appendChild(nameEl)
            row.appendChild(countEl)
            row.addEventListener('click', () => this._confirmEraseCategory(name, stamps.length))
            list.appendChild(row)
        }
        const total = this.app.stamps.length
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
            allRow.addEventListener('click', () => this._confirmEraseCategory('__all__', total))
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

    async _confirmEraseCategory(categoryName, count) {
        this.closeEraseAllModal()
        const label = categoryName === '__all__' ? 'all annotations' : `all "${categoryName}" annotations`
        const confirmed = await this.app.showDialog({
            title: 'Erase All',
            message: `Delete ${label} (${count} item${count !== 1 ? 's' : ''})? This cannot be undone.`,
            icon: '🗑️',
            type: 'confirm',
            confirmText: 'Delete',
            cancelText: 'Cancel',
        })
        if (!confirmed) return
        this.eraseAllByCategory(categoryName)
    }

    eraseAllByCategory(categoryName) {
        let removed
        if (categoryName === '__all__') {
            removed = this.app.stamps.length
            this.app.stamps = []
        } else {
            const before = this.app.stamps.length
            this.app.stamps = this.app.stamps.filter(stamp => {
                const group = this.app.toolsets.find(g => g.tools.some(t => t.id === stamp.type))
                return group?.name !== categoryName
            })
            removed = before - this.app.stamps.length
        }
        if (removed === 0) return
        this.app.updateRulerMarks()
        this.app.computeNextTarget()
        document.querySelectorAll('.page-container[data-page]').forEach(wrapper => {
            const page = parseInt(wrapper.dataset.page)
            this.redrawStamps(page)
        })
        this.app.saveToStorage(true)
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
            if (editor.value.trim()) {
                stamp.data = editor.value
                this.app.stamps.push(stamp)
                this.app.saveToStorage(true)
                this.redrawStamps(pageNum)
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
            const defClamped = Math.min(999, Math.max(1, defVal))
            stepDisplay.textContent = this.app.measureStep

            let typed = ''
            const showDisplay = () => {
                display.textContent = typed || String(defClamped)
                display.style.opacity = typed ? '1' : '0.45'
            }
            showDisplay()

            const getValue = () => typed ? parseInt(typed) : defClamped

            const updateStep = (delta) => {
                let newStep = this.app.measureStep + delta
                if (newStep < 1) newStep = 1
                if (newStep > 999) newStep = 999
                this.app.measureStep = newStep
                stepDisplay.textContent = this.app.measureStep
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

            if (btnDec) btnDec.onclick = () => updateStep(-1)
            if (btnInc) btnInc.onclick = () => updateStep(1)
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
            data = prompt('Enter text:')
            if (!data) return
        } else if (type === 'measure') {
            let defVal = 1
            if (this.app.lastMeasureNum) {
                defVal = parseInt(this.app.lastMeasureNum) + (this.app.measureStep || 4)
            }
            data = await this.promptMeasureNumber(defVal)
            if (!data) return
            this.app.lastMeasureNum = String(data)
            data = String(data)
            const existingMeasure = this.app.stamps.find(s => s.type === 'measure' && s.page === page)
            if (existingMeasure) x = existingMeasure.x
        }

        this.app.stamps.push({
            id: 'stamp-' + Date.now(),
            page,
            layerId: targetLayerId,
            sourceId: this.app.activeSourceId,
            type,
            x,
            y,
            data,
            draw
        })

        if (type === 'anchor' || type === 'measure') {
            this.app.updateRulerMarks()
        }

        this.app.saveToStorage(true)
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
