import { TOOLSETS } from '../constants.js'

/**
 * EditSubBarManager
 * ──────────────────
 * Manages all sub-bars that fly out from the EditStrip:
 *
 *   'pen'    → PenPickerBar  (horizontal flyout, aligns to trigger btn)
 *   'shapes' → ShapesBar     (wide 2-row grid, draggable Y)
 *   'stamp'  → StampBar      (wide 2-row grid, draggable Y, paginated)
 *   'others' → OthersBar     (slides down from top: colors / line / opacity)
 *
 * All bars are appended to document.body and positioned via fixed CSS.
 * Mutual exclusion: opening one bar closes the others.
 */

const PEN_VARIANTS = [
    { id: 'pen',             label: 'Pen',    stroke: '#e2e8f0', dashed: false, arrow: false },
    { id: 'red-pen',         label: 'Red',    stroke: '#be123c', dashed: false, arrow: false, naturalColor: '#be123c' },
    { id: 'green-pen',       label: 'Green',  stroke: '#15803d', dashed: false, arrow: false, naturalColor: '#15803d' },
    { id: 'blue-pen',        label: 'Blue',   stroke: '#1d4ed8', dashed: false, arrow: false, naturalColor: '#1d4ed8' },
    { id: 'dashed-pen',      label: 'Dashed', stroke: '#e2e8f0', dashed: true,  arrow: false },
    { id: 'arrow-pen',       label: 'Arrow',  stroke: '#e2e8f0', dashed: false, arrow: true  },
]

const HL_VARIANTS = [
    { id: 'highlighter',       label: 'HL',     color: '#fde047', naturalColor: '#fde047' },
    { id: 'highlighter-red',   label: 'H.Red',  color: '#be123c', naturalColor: '#be123c' },
    { id: 'highlighter-blue',  label: 'H.Blue', color: '#1d4ed8', naturalColor: '#1d4ed8' },
    { id: 'highlighter-green', label: 'H.Green',color: '#15803d', naturalColor: '#15803d' },
]

// Tools that carry a "natural" default color — clicking them syncs activeColor
const TOOL_NATURAL_COLORS = Object.fromEntries(
    [...PEN_VARIANTS, ...HL_VARIANTS]
        .filter(t => t.naturalColor)
        .map(t => [t.id, t.naturalColor])
)

const EXTRA_COLORS = [
    '#ef4444','#f97316','#eab308','#22c55e',
    '#3b82f6','#a855f7','#ec4899','#ffffff','#94a3b8','#475569',
]

export class EditSubBarManager {
    constructor(app) {
        this.app = app
        this.activeBar  = null   // 'pen' | 'shapes' | 'stamp' | 'text' | null  (tool bars)
        this.othersOpen = false  // others bar is independent
        this._bars      = {}     // { pen: el, shapes: el, stamp: el, text: el, others: el }
        this._stampPage = 0
        this._stampBarY  = null  // null = auto (near bottom), number = last dragged Y
        this._shapesBarY = null
        this._stampSettingsPanel = null
        this._stampSettingsOpen  = false
        this._stampSettingsTab   = 'display'
    }

    init() {
        // Bars are created lazily on first toggle
    }

    /**
     * Toggle a named sub-bar open/closed.
     * 'others' is independent — stays open while tool bars (pen/shapes/stamp) are open.
     * @param {string} name       - 'pen' | 'shapes' | 'stamp' | 'others'
     * @param {HTMLElement} triggerBtn - the button that triggered the toggle
     */
    toggle(name, triggerBtn) {
        if (name === 'others') {
            this.othersOpen = !this.othersOpen
            if (this.othersOpen) {
                this._openBar('others', triggerBtn)
            } else {
                this._bars.others?.classList.remove('open')
            }
        } else {
            // Tool bars are mutually exclusive with each other
            if (this.activeBar === name) {
                this._closeToolBar(name)
            } else {
                if (this.activeBar) this._closeToolBar(this.activeBar)
                this.activeBar = name
                this._openBar(name, triggerBtn)
            }
        }
    }

    closeToolBars() {
        ['pen', 'shapes', 'stamp', 'text'].forEach(name => {
            if (this._bars[name]) {
                this._bars[name].classList.remove('open')
            }
        })
        this.activeBar = null
        this._closeStampSettings()
    }

    closeAll() {
        this.closeToolBars()
        if (this._bars['others']) {
            this._bars['others'].classList.remove('open')
        }
        this.othersOpen = false
    }

    /** Snapshot current open state — call before hiding */
    snapshotState() {
        return { activeBar: this.activeBar, othersOpen: this.othersOpen }
    }

    /** Restore a previously snapshotted state — just re-shows already-positioned bars */
    restoreState(snapshot) {
        if (!snapshot) return
        if (snapshot.activeBar && this._bars[snapshot.activeBar]) {
            this.activeBar = snapshot.activeBar
            requestAnimationFrame(() => this._bars[snapshot.activeBar]?.classList.add('open'))
        }
        if (snapshot.othersOpen && this._bars['others']) {
            this.othersOpen = true
            requestAnimationFrame(() => this._bars['others']?.classList.add('open'))
        }
    }

    _closeToolBar(name) {
        this._bars[name]?.classList.remove('open')
        this.activeBar = null
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    _openBar(name, triggerBtn) {
        let bar = this._bars[name]
        if (!bar) {
            bar = this._buildBarShell(name)
            this._bars[name] = bar
            document.body.appendChild(bar)
        }
        
        // Populate first so offsetHeight is closer to real once we position
        this._populateBar(bar, name)
        this._positionBar(bar, name, triggerBtn)
        
        // Animate open on next frame to ensure the position set above is applied
        requestAnimationFrame(() => bar.classList.add('open'))
    }

    _buildBarShell(name) {
        const bar = document.createElement('div')
        bar.id = 'sf-sub-bar-' + name
        bar.className = 'sf-sub-bar'
            + (name === 'pen'    ? ' sf-pen-bar'    : '')
            + (name === 'text'   ? ' sf-text-bar'   : '')
            + (name === 'others' ? ' sf-others-bar' : '')
            + ((name === 'shapes' || name === 'stamp') ? ' sf-wide-bar' : '')
        return bar
    }

    _positionBar(bar, name, triggerBtn) {
        if (name === 'pen' || name === 'text') {
            // Vertically center on trigger button
            const rect = triggerBtn.getBoundingClientRect()
            bar.style.top = (rect.top + rect.height / 2) + 'px'

        } else if (name === 'shapes' || name === 'stamp') {
            // Use stored Y or default to near bottom
            const stored = name === 'stamp' ? this._stampBarY : this._shapesBarY
            const raw = stored ?? Math.round(window.innerHeight * 0.82)
            
            // Set initial top immediately
            bar.style.top = raw + 'px'

            // Refine top based on actual height to ensure it fits on screen
            // Since we just populated the bar, we try to measure now.
            // If offsetHeight is 0, we'll try one frame later but avoid double jumps.
            const refine = () => {
                const h = bar.offsetHeight || 120
                const halfH = h / 2
                const clamped = Math.max(halfH + 8, Math.min(window.innerHeight - halfH - 8, raw))
                bar.style.top = clamped + 'px'
                if (name === 'stamp')  this._stampBarY  = clamped
                else                   this._shapesBarY = clamped
            }

            if (bar.offsetHeight > 0) refine()
            else requestAnimationFrame(refine)

        } else if (name === 'others') {
            // Slides down from top — no top override needed (CSS handles it)
        }
    }

    _populateBar(bar, name) {
        bar.innerHTML = ''
        if (name === 'pen')    this._buildPenBar(bar)
        if (name === 'shapes') this._buildWideBar(bar, 'shapes')
        if (name === 'stamp')  this._buildWideBar(bar, 'stamp')
        if (name === 'text')   this._buildTextBar(bar)
        if (name === 'others') this._buildOthersBar(bar)
    }

    // ─── Pen Bar ──────────────────────────────────────────────────────────────

    _buildPenBar(bar) {
        const label = (txt) => {
            const l = document.createElement('div')
            l.className = 'sf-pen-label'
            l.textContent = txt
            return l
        }

        bar.appendChild(label('Pen'))

        PEN_VARIANTS.forEach(p => {
            const isActive = this.app.activeStampType === p.id
            const btn = document.createElement('div')
            btn.className = 'sf-pen-cell' + (isActive ? ' active' : '')
            btn.title = p.label
            if (p.arrow) {
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${p.stroke}" stroke-width="2" width="20" height="20">
                    <path d="M3 12h15"/><path d="M14 8l4 4-4 4"/>
                </svg>`
            } else {
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${p.stroke}"
                    stroke-width="${p.dashed ? '2' : '1.8'}" ${p.dashed ? 'stroke-dasharray="4,2"' : ''}
                    width="20" height="20">
                    <path d="M12 19l7-7M19 12l3 3M22 15l-7 7M15 22l-3-3M18 13L16.5 5.5L2 2l3.5 14.5L13 18l5-5"/>
                </svg>`
            }
            btn.addEventListener('click', () => this._selectTool(p.id, bar, 'pen'))
            bar.appendChild(btn)
        })

        const div = document.createElement('div')
        div.className = 'sf-pen-divider'
        bar.appendChild(div)

        bar.appendChild(label('HL'))

        HL_VARIANTS.forEach(h => {
            const isActive = this.app.activeStampType === h.id
            const btn = document.createElement('div')
            btn.className = 'sf-pen-cell' + (isActive ? ' active' : '')
            btn.title = h.label
            btn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20">
                <rect x="2" y="8" width="20" height="8" rx="2" fill="${h.color}" opacity="0.7"/>
            </svg>`
            btn.addEventListener('click', () => this._selectTool(h.id, bar, 'pen'))
            bar.appendChild(btn)
        })
    }

    // ─── Text Bar ─────────────────────────────────────────────────────────────

    _buildTextBar(bar) {
        const lib = this.app.userTextLibrary || []

        // [Aa] Free text button
        const freeBtn = document.createElement('div')
        freeBtn.className = 'sf-pen-cell sf-text-free-btn' + (this.app.activeStampType === 'quick-text' ? ' active' : '')
        freeBtn.title = 'Free Text'
        freeBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <path d="M4 7V4h16v3M12 4v16m-4 0h8"/>
        </svg>`
        freeBtn.addEventListener('click', () => {
            this.app.activeStampType = 'quick-text'
            this.app.toolManager?.updateActiveTools()
            this._populateBar(bar, 'text')
            this.app.editStripManager?.update()
        })
        bar.appendChild(freeBtn)

        if (lib.length > 0) {
            const div = document.createElement('div')
            div.className = 'sf-pen-divider'
            bar.appendChild(div)

            lib.forEach((text, idx) => {
                const isActive = this.app.activeStampType === 'custom-text-' + idx
                    && this.app._activeCustomText === text
                const cell = document.createElement('div')
                cell.className = 'sf-text-cell' + (isActive ? ' active' : '')
                cell.title = text
                const displayText = text.length > 12 ? text.slice(0, 11) + '…' : text
                cell.textContent = displayText
                cell.addEventListener('click', () => {
                    this.app._activeCustomText = text
                    this.app.activeStampType = 'custom-text-' + idx
                    this.app.toolManager?.updateActiveTools()
                    this._populateBar(bar, 'text')
                    this.app.editStripManager?.update()
                })

                // Long-press to delete
                let pressTimer = null
                const startPress = () => { pressTimer = setTimeout(() => this._deleteUserText(idx, bar), 600) }
                const cancelPress = () => { clearTimeout(pressTimer) }
                cell.addEventListener('pointerdown', startPress)
                cell.addEventListener('pointerup', cancelPress)
                cell.addEventListener('pointercancel', cancelPress)

                bar.appendChild(cell)
            })
        }

        // Divider before [+]
        const div2 = document.createElement('div')
        div2.className = 'sf-pen-divider'
        bar.appendChild(div2)

        // [+] Add new text
        const addBtn = document.createElement('div')
        addBtn.className = 'sf-pen-cell sf-text-add-btn'
        addBtn.title = 'Add text to library'
        addBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>`
        addBtn.addEventListener('click', async () => {
            const text = await this.app.showDialog({
                title: 'Add to Text Library',
                message: 'Enter the text to add:',
                type: 'input',
                placeholder: 'e.g. Pizz., dolce, a tempo…',
            })
            if (!text?.trim()) return
            if (!this.app.userTextLibrary) this.app.userTextLibrary = []
            if (!this.app.userTextLibrary.includes(text.trim())) {
                this.app.userTextLibrary.push(text.trim())
                this._saveTextLibrary(bar)
            }
            this._populateBar(bar, 'text')
        })
        bar.appendChild(addBtn)

        // [Edit all] — bulk edit as comma-separated
        const editAllBtn = document.createElement('div')
        editAllBtn.className = 'sf-pen-cell sf-text-edit-all-btn'
        editAllBtn.title = 'Edit all (comma-separated)'
        editAllBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>`
        editAllBtn.addEventListener('click', async () => {
            const current = (this.app.userTextLibrary || []).join(', ')
            const result = await this.app.showDialog({
                title: 'Edit Text Library',
                message: 'Items separated by comma:',
                type: 'input',
                defaultValue: current,
                placeholder: '指揮, 小提, Pizz., dolce…',
            })
            if (result === null || result === undefined) return
            this.app.userTextLibrary = result.split(',').map(s => s.trim()).filter(Boolean)
            this._saveTextLibrary(bar)
            this._populateBar(bar, 'text')
        })
        bar.appendChild(editAllBtn)
    }

    /** Persist userTextLibrary to localStorage + user_content column, then push to Supabase */
    _saveTextLibrary(bar) {
        this.app.saveToStorage?.()
        localStorage.setItem('scoreflow_user_text_library', JSON.stringify(this.app.userTextLibrary || []))
        this.app.supabaseManager?.pushUserContent({ userTextLibrary: this.app.userTextLibrary || [] })
        if (bar) this.app.editStripManager?.update()
    }

    async _deleteUserText(idx, bar) {
        if (!this.app.userTextLibrary) return
        const text = this.app.userTextLibrary[idx]
        const confirmed = await this.app.showDialog({
            title: 'Remove from Library',
            message: `Remove "${text}" from your text library?`,
            type: 'confirm',
        })
        if (!confirmed) return
        this.app.userTextLibrary.splice(idx, 1)
        this._saveTextLibrary(null)
        // Reset tool if it was active
        if (this.app._activeCustomText === text) {
            this.app._activeCustomText = null
            this.app.activeStampType = 'view'
            this.app.toolManager?.updateActiveTools()
            this.app.editStripManager?.update()
        }
        this._populateBar(bar, 'text')
    }

    // ─── Wide Bars (shapes + stamp) ───────────────────────────────────────────

    /** Render the icon HTML for a stamp bar cell */
    _cellIconHTML(item) {
        const icon = item.icon
        const activeColor = (item.id === 'view' || item.id === 'select') ? 'currentColor' : (this.app.activeColor || '#e2e8f0')
        if (!icon) {
            // No icon at all — fall back to textIcon or label
            return `<span class="sf-bar-cell-text" style="color:${activeColor}">${item.textIcon || item.label}</span>`
        }
        if (icon.trim().startsWith('<')) {
            // SVG markup
            return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color:${activeColor}">${icon}</svg>`
        }
        // Plain text (e.g. dynamics: ppp, pp, p, mf, f, ff, fff …)
        return `<span class="sf-bar-cell-dynamic" style="color:${activeColor}">${icon}</span>`
    }

    _buildWideBar(bar, type) {
        const isStamp = type === 'stamp'

        // Collect items
        let flatItems
        if (isStamp) {
            flatItems = this._loadMyPanelItems()
        } else {
            const group = TOOLSETS.find(g => g.name === 'Shapes')
            flatItems = group ? group.tools.map(t => ({ ...t, _group: group })) : []
        }

        // LEFT: nav column
        const navCol = document.createElement('div')
        navCol.className = 'sf-bar-nav'

        if (isStamp) {
            // Stamp bar: color quick select (Red/Blue) + gear settings button
            const colorBtn = (hex, label) => {
                const btn = document.createElement('div')
                btn.className = 'sf-others-color' + (this.app.activeColor === hex ? ' active' : '')
                btn.style.background = hex
                btn.style.width = '22px'
                btn.style.height = '22px'
                btn.title = label
                btn.addEventListener('click', (e) => {
                    e.stopPropagation()
                    this.app.activeColor = hex
                    this.app.toolManager?.updateActiveTools()
                    this._populateBar(bar, 'stamp')
                    this.app.editStripManager?.update()
                })
                return btn
            }
            
            const rBtn = colorBtn('#be123c', 'Red')
            rBtn.style.marginBottom = '2px'
            navCol.appendChild(rBtn)
            
            const bBtn = colorBtn('#1d4ed8', 'Blue')
            bBtn.style.marginBottom = '6px' // Extra gap before the settings gear
            navCol.appendChild(bBtn)

            const settingsBtn = document.createElement('div')
            settingsBtn.className = 'sf-nav-btn sf-nav-settings-btn' + (this._stampSettingsOpen ? ' active' : '')
            settingsBtn.title = 'Stamp Settings'
            settingsBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
            </svg>`
            settingsBtn.addEventListener('click', (e) => {
                e.stopPropagation()
                this._toggleStampSettings(bar, settingsBtn)
            })
            navCol.appendChild(settingsBtn)
        } else {
            // Shapes bar: prev/next pagination
            const prevBtn = this._navBtn('prev')
            const nextBtn = this._navBtn('next')
            navCol.appendChild(prevBtn)
            navCol.appendChild(nextBtn)
            bar._prevBtn = prevBtn
            bar._nextBtn = nextBtn
        }

        bar.appendChild(navCol)
        bar.appendChild(this._barDivider())

        // MIDDLE: content
        const content = document.createElement('div')
        content.className = 'sf-bar-content'
        bar.appendChild(content)

        bar.appendChild(this._barDivider())

        // RIGHT: grip (vertical drag)
        const grip = document.createElement('div')
        grip.className = 'sf-bar-grip'
        grip.innerHTML = '<span></span><span></span><span></span><span></span>'
        grip.title = 'Drag to reposition'
        this._attachGripDrag(grip, bar, type)
        bar.appendChild(grip)

        if (isStamp) {
            // 2-row horizontally scrollable layout — row 1 on top, row 2 on bottom
            const row1Items = flatItems.filter(i => (i.row ?? 1) !== 2)
            const row2Items = flatItems.filter(i => i.row === 2)

            const buildRow = (items) => {
                const rowEl = document.createElement('div')
                rowEl.className = 'sf-stamp-row'
                items.forEach(item => {
                    const isActive = this.app.activeStampType === item.id
                    const cell = document.createElement('div')
                    cell.className = 'sf-bar-cell' + (isActive ? ' active' : '')
                    cell.dataset.id = item.id
                    if (item._group?.color) cell.style.borderColor = item._group.color + '55'
                    cell.innerHTML = this._cellIconHTML(item)
                    cell.title = item.label
                    cell.addEventListener('click', () => this._selectTool(item.id, bar, type))
                    rowEl.appendChild(cell)
                })
                return rowEl
            }

            content.appendChild(buildRow(row1Items))
            if (row2Items.length > 0) content.appendChild(buildRow(row2Items))
        } else {
            // Shapes: paginated grid
            const grid = document.createElement('div')
            grid.className = 'sf-bar-grid'
            content.appendChild(grid)

            const prevBtn = bar._prevBtn
            const nextBtn = bar._nextBtn

            requestAnimationFrame(() => {
                const CELL = 48, GAP = 4
                const cols    = Math.max(1, Math.floor((content.clientWidth + GAP) / (CELL + GAP)))
                const perPage = cols * 2

                const pageCount = Math.max(1, Math.ceil(flatItems.length / perPage))
                const pageItems = flatItems.slice(0, perPage)

                if (prevBtn) prevBtn.classList.add('disabled')
                if (nextBtn) nextBtn.classList.toggle('disabled', pageCount <= 1)

                pageItems.forEach(item => {
                    const isActive = this.app.activeStampType === item.id
                    const cell = document.createElement('div')
                    cell.className = 'sf-bar-cell' + (isActive ? ' active' : '')
                    if (item._group?.color) cell.style.borderColor = item._group.color + '55'
                    cell.dataset.id = item.id
                    cell.innerHTML = this._cellIconHTML(item)
                    cell.title = item.label
                    cell.addEventListener('click', () => this._selectTool(item.id, bar, type))
                    grid.appendChild(cell)
                })
            })
        }
    }

    _attachBarDrag(bar, type) {
        if (bar._dragAttached) return   // avoid duplicate listeners on repopulate
        bar._dragAttached = true

        const getY = () => (type === 'stamp' ? this._stampBarY : this._shapesBarY) ?? (window.innerHeight * 0.82)
        const setY = (y) => {
            // Bar is centered on `top` via translateY(-50%), so clamp using half-height
            const halfH = (bar.offsetHeight || 120) / 2
            const minY = halfH + 8
            const maxY = window.innerHeight - halfH - 8
            const v = Math.max(minY, Math.min(maxY, y))
            if (type === 'stamp') this._stampBarY = v
            else                  this._shapesBarY = v
            bar.style.top = v + 'px'
        }

        bar.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button, input')) return

            const contentEl = bar.querySelector('.sf-bar-content')
            const ds = {
                id:              e.pointerId,
                startX:          e.clientX,
                startY:          e.clientY,
                startBarY:       getY(),
                startScrollLeft: contentEl?.scrollLeft ?? 0,
                contentEl,
                axis:            null,
            }

            const onMove = (ev) => {
                if (ev.pointerId !== ds.id) return
                const dx = ev.clientX - ds.startX
                const dy = ev.clientY - ds.startY

                // Lock axis once we have enough movement.
                // Strongly biased toward vertical: horizontal only when dx ≥ 2.5× dy.
                if (ds.axis === null && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
                    ds.axis = (Math.abs(dx) >= Math.abs(dy) * 2.5) ? 'x' : 'y'
                }

                if (ds.axis === 'y') {
                    ev.preventDefault()
                    setY(ds.startBarY + dy)
                    bar.style.cursor = 'grabbing'
                } else if (ds.axis === 'x' && ds.contentEl) {
                    ev.preventDefault()
                    ds.contentEl.scrollLeft = ds.startScrollLeft - dx
                }
            }

            const onEnd = (ev) => {
                if (ev.pointerId !== ds.id) return
                bar.style.cursor = ''
                window.removeEventListener('pointermove',   onMove)
                window.removeEventListener('pointerup',     onEnd)
                window.removeEventListener('pointercancel', onEnd)
            }

            // Use window-level listeners — more reliable than setPointerCapture on iOS Safari
            window.addEventListener('pointermove',   onMove,  { passive: false })
            window.addEventListener('pointerup',     onEnd)
            window.addEventListener('pointercancel', onEnd)
        })
    }

    _attachGripDrag(grip, bar, type) {
        this._attachBarDrag(bar, type)
    }

    // ─── Others Bar ───────────────────────────────────────────────────────────

    _buildOthersBar(bar) {
        const addLabel = (txt) => {
            const l = document.createElement('div')
            l.className = 'sf-others-label'
            l.textContent = txt
            bar.appendChild(l)
        }
        const addVDivider = () => {
            const d = document.createElement('div')
            d.className = 'sf-others-divider-v'
            bar.appendChild(d)
        }

        // Helper to apply style to active selected object
        const applyToActiveStamp = (key, val) => {
            const stamp = this.app._lastGraceObject;
            if (stamp && !stamp.deleted) {
                if (key === 'size') {
                    stamp.userScale = val;
                } else {
                    stamp[key] = val;
                }
                stamp.updatedAt = Date.now();
                this.app.saveToStorage?.(true);
                this.app.redrawStamps?.(stamp.page);
                if (this.app.supabaseManager) {
                    this.app.supabaseManager.pushAnnotation(stamp, this.app.pdfFingerprint);
                }
            }
        };

        // Color swatches
        addLabel('Color')
        EXTRA_COLORS.forEach(hex => {
            const c = document.createElement('div')
            c.className = 'sf-others-color' + (this.app.activeColor === hex ? ' active' : '')
            c.style.background = hex
            c.title = hex
            c.addEventListener('click', () => {
                this.app.activeColor = hex
                this.app.toolManager?.updateActiveTools()
                applyToActiveStamp('color', hex)
                this._populateBar(bar, 'others')
            })
            bar.appendChild(c)
        })

        addVDivider()

        // Line style
        addLabel('Line')
        ;[['─', 'solid'], ['╌', 'dashed'], ['┄', 'dotted']].forEach(([sym, key]) => {
            const b = document.createElement('div')
            b.className = 'sf-others-style-btn' + ((this.app.activeLineStyle || 'solid') === key ? ' active' : '')
            b.title = key
            b.textContent = sym
            b.addEventListener('click', () => {
                this.app.activeLineStyle = key
                applyToActiveStamp('lineStyle', key)
                this._populateBar(bar, 'others')
            })
            bar.appendChild(b)
        })

        addVDivider()

        // Size preset (maps directly to activeToolPreset / userScale)
        addLabel('Size')
        ;[['S', 0.7], ['M', 1.0], ['L', 1.5]].forEach(([lbl, val]) => {
            const b = document.createElement('div')
            b.className = 'sf-others-style-btn' + (Math.abs((this.app.activeToolPreset || 1.0) - val) < 0.05 ? ' active' : '')
            b.title = lbl
            b.textContent = lbl
            b.addEventListener('click', () => {
                this.app.activeToolPreset = val
                this.app.toolManager?.updateActiveTools()
                applyToActiveStamp('size', val)
                this._populateBar(bar, 'others')
            })
            bar.appendChild(b)
        })
    }

    // ─── Stamp Settings Panel ─────────────────────────────────────────────────

    _toggleStampSettings(stampBar, triggerBtn) {
        if (this._stampSettingsOpen) {
            this._closeStampSettings()
        } else {
            this._openStampSettings(stampBar, triggerBtn)
        }
    }

    _openStampSettings(stampBar, triggerBtn) {
        this._stampSettingsOpen = true
        triggerBtn?.classList.add('active')

        if (!this._stampSettingsPanel) {
            this._stampSettingsPanel = this._buildStampSettingsPanel()
            document.body.appendChild(this._stampSettingsPanel)
        }

        // Wire LayerManager into the layer list container and refresh
        const layerListEl = this._stampSettingsPanel.querySelector('#sf-ss-layer-list')
        if (layerListEl && this.app.layerManager) {
            this.app.externalLayerList = layerListEl
            this.app.layerManager.renderLayerUI()
        }

        // Show first so we can measure actual height, then position above stamp bar
        this._stampSettingsPanel.classList.add('open')
        requestAnimationFrame(() => {
            const barRect   = stampBar.getBoundingClientRect()
            const panelRect = this._stampSettingsPanel.getBoundingClientRect()
            const top = Math.max(8, barRect.top - panelRect.height - 8)
            this._stampSettingsPanel.style.top  = top + 'px'
            this._stampSettingsPanel.style.left = Math.max(8, barRect.left) + 'px'
        })
    }

    _closeStampSettings() {
        this._stampSettingsOpen = false
        this._stampSettingsPanel?.classList.remove('open')
        // Remove active from gear button
        this._bars.stamp?.querySelector('.sf-nav-settings-btn')?.classList.remove('active')
    }

    _buildStampSettingsPanel() {
        const app = this.app
        const panel = document.createElement('div')
        panel.className = 'sf-stamp-settings-panel'

        // ── Tab bar ──
        const tabs = [
            { id: 'display', label: 'Size' },
            { id: 'touch',   label: 'Touch' },
            { id: 'layers',  label: 'Categ.' },
            { id: 'more',    label: 'More' },
        ]
        const tabBar = document.createElement('div')
        tabBar.className = 'sf-ss-tabs'
        tabs.forEach(t => {
            const btn = document.createElement('button')
            btn.className = 'sf-ss-tab' + (this._stampSettingsTab === t.id ? ' active' : '')
            btn.dataset.tab = t.id
            btn.textContent = t.label
            btn.addEventListener('click', () => {
                this._stampSettingsTab = t.id
                panel.querySelectorAll('.sf-ss-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t.id))
                panel.querySelectorAll('.sf-ss-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === t.id))
            })
            tabBar.appendChild(btn)
        })
        panel.appendChild(tabBar)

        // ── Content ──
        const content = document.createElement('div')
        content.className = 'sf-ss-content'

        // Helper: build a slider row
        const sliderRow = (label, id, min, max, step, val, unit, onInput, onReset, resetVal) => {
            const row = document.createElement('div')
            row.className = 'sf-ss-row'
            row.innerHTML = `
                <span class="sf-ss-label">${label}</span>
                <div class="sf-ss-slider-wrap">
                    <button class="sf-ss-adj minus" data-for="${id}">−</button>
                    <input type="range" id="sf-ss-${id}" class="sf-ss-slider" min="${min}" max="${max}" step="${step}" value="${val}">
                    <button class="sf-ss-adj plus" data-for="${id}">+</button>
                </div>
                <span class="sf-ss-badge" id="sf-ss-${id}-val">${val}${unit}</span>
                <button class="sf-ss-reset" data-for="${id}">↺</button>
            `
            const slider = row.querySelector(`#sf-ss-${id}`)
            const badge  = row.querySelector(`#sf-ss-${id}-val`)
            const update = (v) => {
                slider.value = v
                badge.textContent = v + unit
                this._updateSliderGrad(slider)
                onInput(v)
            }
            slider.addEventListener('input', () => update(slider.value))
            row.querySelector('.sf-ss-reset').addEventListener('click', () => update(resetVal))
            row.querySelectorAll('.sf-ss-adj').forEach(b => {
                b.addEventListener('click', () => {
                    const s = parseFloat(step)
                    const newVal = b.classList.contains('minus')
                        ? Math.max(min, parseFloat(slider.value) - s)
                        : Math.min(max, parseFloat(slider.value) + s)
                    update(newVal)
                })
            })
            this._updateSliderGrad(slider)
            return row
        }

        // ── Display pane ──
        const displayPane = document.createElement('div')
        displayPane.className = 'sf-ss-pane' + (this._stampSettingsTab === 'display' ? ' active' : '')
        displayPane.dataset.pane = 'display'
        displayPane.appendChild(sliderRow('Scale', 'scale', 0.5, 3.0, 0.1,
            (app.scoreStampScale || 1.0).toFixed(1), 'x',
            v => app.updateScoreStampScale?.(parseFloat(v)),
            null, 1.0))
        displayPane.appendChild(sliderRow('Font', 'font', 16, 32, 1,
            app.defaultFontSize, 'px',
            v => { app.defaultFontSize = parseInt(v); app.saveToStorage?.(); app.redrawAllAnnotationLayers?.() },
            null, 20))
        // Cloak badge toggle
        const cloakRow = document.createElement('div')
        cloakRow.className = 'sf-ss-row'
        cloakRow.innerHTML = `
            <span class="sf-ss-label">Cloak Badge</span>
            <label class="sf-ss-toggle"><input type="checkbox" id="sf-ss-cloak-badge" ${app.showCloakBadge !== false ? 'checked' : ''}><span class="sf-ss-toggle-track"></span></label>
        `
        cloakRow.querySelector('#sf-ss-cloak-badge').addEventListener('change', e => {
            app.showCloakBadge = e.target.checked
            app.saveToStorage?.()
            app.redrawAllAnnotationLayers?.()
        })
        displayPane.appendChild(cloakRow)
        content.appendChild(displayPane)

        // ── Touch pane ──
        const touchPane = document.createElement('div')
        touchPane.className = 'sf-ss-pane' + (this._stampSettingsTab === 'touch' ? ' active' : '')
        touchPane.dataset.pane = 'touch'
        touchPane.appendChild(sliderRow('Offset Y', 'offset-y', 0, 150, 5,
            app.stampOffsetTouchY, 'px',
            v => { app.stampOffsetTouchY = parseInt(v); app.saveToStorage?.() },
            null, 50))
        touchPane.appendChild(sliderRow('Offset X', 'offset-x', -150, 150, 5,
            app.stampOffsetTouchX, 'px',
            v => { app.stampOffsetTouchX = parseInt(v); app.saveToStorage?.() },
            null, -30))
        content.appendChild(touchPane)

        // ── Layers pane ──
        const layersPane = document.createElement('div')
        layersPane.className = 'sf-ss-pane' + (this._stampSettingsTab === 'layers' ? ' active' : '')
        layersPane.dataset.pane = 'layers'
        const layerHeader = document.createElement('div')
        layerHeader.className = 'sf-ss-row'
        layerHeader.innerHTML = `
            <span class="sf-ss-label">Categories</span>
            <button id="sf-ss-erase-all" class="sf-ss-danger-btn">Erase All</button>
        `
        layerHeader.querySelector('#sf-ss-erase-all').addEventListener('click', () => {
            app.annotationManager?.showEraseAllModal()
        })
        layersPane.appendChild(layerHeader)
        const layerList = document.createElement('div')
        layerList.id = 'sf-ss-layer-list'
        layerList.className = 'layer-list-mini'
        layersPane.appendChild(layerList)
        content.appendChild(layersPane)

        // ── More pane ──
        const morePane = document.createElement('div')
        morePane.className = 'sf-ss-pane' + (this._stampSettingsTab === 'more' ? ' active' : '')
        morePane.dataset.pane = 'more'

        // 斗篷標籤 (Cloak Labels)
        const cloakBlock = document.createElement('div')
        cloakBlock.className = 'sf-ss-block'
        const cloakTitle = document.createElement('span')
        cloakTitle.className = 'sf-ss-label'
        cloakTitle.style.cssText = 'display:block;margin-bottom:10px'
        cloakTitle.textContent = '斗篷標籤'
        cloakBlock.appendChild(cloakTitle)
        ;[
            { id: 'black', label: '黑色斗篷', color: '#374151' },
            { id: 'red',   label: '紅色斗篷', color: '#dc2626' },
            { id: 'blue',  label: '藍色斗篷', color: '#2563eb' },
        ].forEach(c => {
            const item = document.createElement('div')
            item.className = 'sf-ss-row'
            item.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px">
                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color};flex-shrink:0"></span>
                    <span class="sf-ss-label" style="margin:0">${c.label}</span>
                </div>
                <label class="sf-ss-toggle"><input type="checkbox" class="sf-ss-cloak" data-cloak="${c.id}" ${app.cloakVisible?.[c.id] !== false ? 'checked' : ''}><span class="sf-ss-toggle-track"></span></label>
            `
            item.querySelector('.sf-ss-cloak').addEventListener('change', e => {
                if (!app.cloakVisible) app.cloakVisible = {}
                app.cloakVisible[c.id] = e.target.checked
                app.saveToStorage?.()
                app.redrawAllAnnotationLayers?.()
            })
            cloakBlock.appendChild(item)
        })
        morePane.appendChild(cloakBlock)

        content.appendChild(morePane)
        panel.appendChild(content)

        return panel
    }

    _loadMyPanelItems() {
        try {
            const cfg = JSON.parse(localStorage.getItem('scoreflow_panel_config') || '{}')
            const stamps = cfg.stamps
                || JSON.parse(localStorage.getItem('scoreflow_my_panel') || '[]')

            if (!stamps.length) {
                // Fallback: show all non-edit stamps
                return TOOLSETS
                    .filter(g => g.type !== 'edit')
                    .flatMap(g => g.tools.map(t => ({ ...t, _group: g, row: t.row ?? 1 })))
            }

            // Map each {id, category, row} to its tool object
            const result = []
            for (const entry of stamps) {
                const group = TOOLSETS.find(g => g.name === entry.category)
                if (!group) continue
                const tool = group.tools.find(t => t.id === entry.id)
                if (tool) result.push({ ...tool, _group: group, row: entry.row ?? tool.row ?? 1 })
            }
            return result
        } catch {
            return TOOLSETS
                .filter(g => g.type !== 'edit')
                .flatMap(g => g.tools.map(t => ({ ...t, _group: g, row: t.row ?? 1 })))
        }
    }

    _updateSliderGrad(slider) {
        const min = parseFloat(slider.min) || 0
        const max = parseFloat(slider.max) || 100
        const val = parseFloat(slider.value)
        const pct = ((val - min) / (max - min)) * 100
        slider.style.background = `linear-gradient(to right, var(--primary, #6366f1) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    _selectTool(toolId, bar, barType) {
        this.app.activeStampType = toolId
        // Sync activeColor when tool has a natural color (red-pen, highlighter, etc.)
        if (TOOL_NATURAL_COLORS[toolId] !== undefined) {
            this.app.activeColor = TOOL_NATURAL_COLORS[toolId]
        }
        this.app.toolManager?.updateActiveTools()
        // Update active state in-place for all bar types
        this._populateBar(bar, barType)
        // Re-render strip to update active button
        this.app.editStripManager?.update()
    }

    _navBtn(dir) {
        const btn = document.createElement('div')
        btn.className = 'sf-nav-btn disabled'
        const path = dir === 'prev'
            ? '<path d="M15 18l-6-6 6-6"/>'
            : '<path d="M9 18l6-6-6-6"/>'
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14">${path}</svg>`
        return btn
    }

    _barDivider() {
        const d = document.createElement('div')
        d.className = 'sf-bar-divider'
        return d
    }
}
