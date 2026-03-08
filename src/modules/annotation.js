import * as db from '../db.js'

export class AnnotationManager {
    constructor(app) {
        this.app = app
        this.activeStampType = 'view'
        this.hoveredStamp = null
        this.selectHoveredStamp = null
    }

    isStampTool() {
        return !['view', 'select', 'eraser', 'pen', 'highlighter', 'line', 'recycle-bin'].includes(this.app.activeStampType)
    }

    async addStamp(page, type, x, y) {
        if (type === 'eraser') {
            this.eraseStamp(page, x, y)
            return
        }

        // Auto-Target Layer based on toolset metadata
        let targetLayerId = 'draw' // Default

        const group = this.app.toolsets.find(g => g.tools.some(t => t.id === type))
        if (group) {
            // Map category type to layer ID if exists
            const layer = this.app.layers.find(l => l.type === group.type)
            if (layer) targetLayerId = layer.id
        }

        const layer = this.app.layers.find(l => l.id === targetLayerId)
        if (layer) layer.visible = true

        let data = null
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
            page,
            layerId: targetLayerId,
            sourceId: this.app.activeSourceId, // Associated with active Persona
            type,
            x,
            y,
            data
        })

        if (type === 'anchor') {
            this.app.updateRulerMarks()
        } else if (type === 'measure') {
            this.app.updateRulerMarks()
        }

        this.app.saveToStorage()
        this.app.updateLayerVisibility()
        this.redrawStamps(page)
    }

    // --- ERASER HELPERS ---

    // Get a human-readable label for a stamp type
    getStampLabel(stamp) {
        if (stamp.points) {
            const typeMap = { pen: 'Pen Stroke', highlighter: 'Highlight', line: 'Line' }
            return typeMap[stamp.type] || 'Drawing'
        }
        // Look up in toolsets
        for (const set of this.app.toolsets) {
            const tool = set.tools.find(t => t.id === stamp.type)
            if (tool) return tool.label
        }
        return stamp.type || 'Object'
    }

    // Get an emoji icon for a stamp type
    getStampIcon(stamp) {
        if (stamp.type === 'pen') return '✏️'
        if (stamp.type === 'highlighter') return '🖊'
        if (stamp.type === 'line') return '—'
        if (stamp.type === 'anchor') return '⚓'
        if (stamp.type === 'text' || stamp.type === 'tempo-text') return 'T'
        if (['down-bow', 'up-bow'].includes(stamp.type)) return '🎻'
        if (stamp.type === 'accent') return '>'
        if (stamp.type === 'staccato') return '·'
        if (stamp.type === 'fermata') return '𝄐'
        return '♩'
    }

    // Return all stamps near (x,y) within threshold, sorted closest first
    // allSources=true: include stamps from all sources (used by Select tool)
    findNearbyStamps(page, x, y, allSources = false) {
        const threshold = 0.06
        const results = []

        this.app.stamps.forEach(s => {
            if (s.page !== page) return
            if (!allSources && s.sourceId !== this.app.activeSourceId) return

            let dist
            if (s.points && s.points.length > 0) {
                dist = Math.min(...s.points.map(p =>
                    Math.sqrt(Math.pow(p.x - x, 2) + Math.pow(p.y - y, 2))
                ))
            } else {
                dist = Math.sqrt(Math.pow(s.x - x, 2) + Math.pow(s.y - y, 2))
            }

            if (dist < threshold) results.push({ stamp: s, dist })
        })

        return results.sort((a, b) => a.dist - b.dist).map(r => r.stamp)
    }

    // Find the single CLOSEST stamp to (x,y) on a page, within a max threshold
    findClosestStamp(page, x, y, allSources = false) {
        return this.findNearbyStamps(page, x, y, allSources)[0] || null
    }

    // Erase exactly one specific stamp object
    eraseStampTarget(stamp) {
        const page = stamp.page
        const idx = this.app.stamps.indexOf(stamp)
        if (idx === -1) return

        this.app.stamps.splice(idx, 1)
        console.log(`Eraser: Removed 1 stamp (type: ${stamp.type}) from source: ${this.app.activeSourceId}`)

        if (stamp.type === 'anchor') {
            this.app.updateRulerMarks()
        }

        // Clear hover state
        this.hoveredStamp = null
        this.closeEraseMenu()
        const wrapper = document.querySelector(`.page-container[data-page="${page}"]`)
        if (wrapper) {
            const chip = wrapper.querySelector('.erase-hover-chip')
            if (chip) chip.remove()
        }
        this.app.saveToStorage()
        this.redrawStamps(page)
    }

    // Show a context menu listing nearby stamps to pick from
    showEraseMenu(stamps, screenX, screenY) {
        this.closeEraseMenu() // Remove any existing menu

        const menu = document.createElement('div')
        menu.className = 'erase-context-menu'
        menu.id = 'erase-context-menu'

        // Header
        const header = document.createElement('div')
        header.className = 'erase-menu-header'
        header.textContent = `${stamps.length} Nearby Objects — Pick one to delete`
        menu.appendChild(header)

        // One row per stamp
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

            // Hover: highlight this stamp on canvas
            item.addEventListener('mouseenter', () => {
                this.hoveredStamp = stamp
                this.redrawStamps(stamp.page)
            })
            item.addEventListener('mouseleave', () => {
                this.hoveredStamp = null
                this.redrawStamps(stamp.page)
            })

            // Click: delete this specific stamp
            item.addEventListener('click', (e) => {
                e.stopPropagation()
                this.eraseStampTarget(stamp)
            })

            menu.appendChild(item)
        })

        // Cancel footer
        const cancel = document.createElement('div')
        cancel.className = 'erase-menu-cancel'
        cancel.textContent = 'Esc to cancel'
        menu.appendChild(cancel)

        // Position menu near cursor, keeping it inside viewport
        document.body.appendChild(menu)
        const rect = menu.getBoundingClientRect()
        const vw = window.innerWidth
        const vh = window.innerHeight
        let left = screenX + 12
        let top = screenY + 12
        if (left + rect.width > vw - 8) left = screenX - rect.width - 12
        if (top + rect.height > vh - 8) top = screenY - rect.height - 12
        menu.style.left = `${Math.max(8, left)}px`
        menu.style.top = `${Math.max(8, top)}px`

        // Close on outside click or Escape
        this._eraseMenuDismiss = (e) => {
            if (!menu.contains(e.target)) this.closeEraseMenu()
        }
        this._eraseMenuEsc = (e) => {
            if (e.key === 'Escape') this.closeEraseMenu()
        }
        setTimeout(() => {
            document.addEventListener('mousedown', this._eraseMenuDismiss)
            document.addEventListener('keydown', this._eraseMenuEsc)
        }, 0)
    }

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

            // typed = '' means "use auto-calc (placeholder)", otherwise user's keypad input
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
                    // iOS fires a synthetic Enter keydown after tapping a button — ignore it
                    if (e.target?.classList.contains('keypad-btn')) return
                    e.preventDefault(); e.stopPropagation(); confirm(); return
                }
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cleanup(); resolve(null); return }
                e.stopPropagation() // block global shortcuts (sidebar, eraser, etc.) while dialog is open
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
                        if (typed === '' && key === '0') return // 不允許以 0 開頭
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

    closeEraseMenu() {
        const existing = document.getElementById('erase-context-menu')
        if (existing) existing.remove()
        if (this._eraseMenuDismiss) {
            document.removeEventListener('mousedown', this._eraseMenuDismiss)
            this._eraseMenuDismiss = null
        }
        if (this._eraseMenuEsc) {
            document.removeEventListener('keydown', this._eraseMenuEsc)
            this._eraseMenuEsc = null
        }
        // Clear any hover from menu navigation
        if (this.hoveredStamp) {
            const page = this.hoveredStamp.page
            this.hoveredStamp = null
            this.redrawStamps(page)
        }
    }

    // ── Select context menu (Multi-object picker with blue highlight) ──
    showSelectMenu(stamps, screenX, screenY, onSelect) {
        this.closeSelectMenu()

        const menu = document.createElement('div')
        menu.className = 'erase-context-menu select-context-menu'
        menu.id = 'select-context-menu'

        // Header
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

            // Hover: show blue glow on canvas
            item.addEventListener('mouseenter', () => {
                this.selectHoveredStamp = stamp
                this.redrawStamps(stamp.page)
            })
            item.addEventListener('mouseleave', () => {
                this.selectHoveredStamp = null
                this.redrawStamps(stamp.page)
            })

            // Click: select this object
            item.addEventListener('click', (e) => {
                e.stopPropagation()
                this.selectHoveredStamp = null
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

        this._selectMenuDismiss = (e) => {
            if (!menu.contains(e.target)) this.closeSelectMenu()
        }
        this._selectMenuEsc = (e) => {
            if (e.key === 'Escape') this.closeSelectMenu()
        }
        setTimeout(() => {
            document.addEventListener('mousedown', this._selectMenuDismiss)
            document.addEventListener('keydown', this._selectMenuEsc)
        }, 0)
    }

    closeSelectMenu() {
        const existing = document.getElementById('select-context-menu')
        if (existing) existing.remove()
        if (this._selectMenuDismiss) {
            document.removeEventListener('mousedown', this._selectMenuDismiss)
            this._selectMenuDismiss = null
        }
        if (this._selectMenuEsc) {
            document.removeEventListener('keydown', this._selectMenuEsc)
            this._selectMenuEsc = null
        }
        if (this.selectHoveredStamp) {
            const page = this.selectHoveredStamp.page
            this.selectHoveredStamp = null
            this.redrawStamps(page)
        }
    }

    redrawAllAnnotationLayers() {
        if (!this.app.pdf) return
        for (let i = 1; i <= this.app.pdf.numPages; i++) {
            this.redrawStamps(i)
        }
    }

    redrawStamps(page) {
        const wrapper = document.querySelector(`.page-container[data-page="${page}"]`)
        if (!wrapper) return

        // We draw ALL visible sources onto the virtual canvas
        const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)

        this.app.sources.forEach(source => {
            if (!source.visible) return

            ctx.save()
            ctx.globalAlpha = source.opacity || 1
            const isForeign = source.id !== 'self'

            const sourceStamps = this.app.stamps.filter(s => s.page === page && s.sourceId === source.id)
            sourceStamps.forEach(stamp => {
                const layer = this.app.layers.find(l => l.id === stamp.layerId)
                if (!layer || !layer.visible) return

                const isHovered = stamp === this.hoveredStamp           // red (eraser)
                const isSelectHovered = stamp === this.selectHoveredStamp // blue (select)

                if (stamp.points) {
                    this.drawPathOnCanvas(ctx, canvas, stamp, isForeign, isHovered, isSelectHovered)
                } else {
                    this.drawStampOnCanvas(ctx, canvas, stamp, layer.color, isForeign, isHovered, isSelectHovered)
                }
            })
            ctx.restore()
        })
    }

    drawPathOnCanvas(ctx, canvas, path, isForeign = false, isHovered = false, isSelectHovered = false) {
        if (!path.points || path.points.length < 2) return

        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        if (isHovered) {
            ctx.shadowBlur = 10
            ctx.shadowColor = '#ef4444'
        } else if (isSelectHovered) {
            ctx.shadowBlur = 12
            ctx.shadowColor = '#6366f1'
        } else if (this.app.activeStampType === 'select' && !isForeign) {
            ctx.shadowBlur = 8
            ctx.shadowColor = '#6366f188' // Subtle interactive glow
        }

        if (isForeign) {
            ctx.setLineDash([8 * (this.app.scale / 1.5), 6 * (this.app.scale / 1.5)])
        }

        if (path.type === 'highlighter') {
            ctx.strokeStyle = isHovered ? '#ef4444' : (isForeign ? '#e5e7ebAA' : '#fde04788')
            ctx.lineWidth = 14 * (this.app.scale / 1.5)
        } else {
            ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : (path.color || '#ff4757')
            ctx.lineWidth = (path.type === 'line' ? 2 : 3) * (this.app.scale / 1.5)
        }

        ctx.beginPath()
        const startX = path.points[0].x * canvas.width
        const startY = path.points[0].y * canvas.height
        ctx.moveTo(startX, startY)

        for (let i = 1; i < path.points.length; i++) {
            const px = path.points[i].x * canvas.width
            const py = path.points[i].y * canvas.height
            ctx.lineTo(px, py)
        }
        ctx.stroke()
        ctx.restore()
    }

    drawStampOnCanvas(ctx, canvas, stamp, color, isForeign = false, isHovered = false, isSelectHovered = false) {
        const x = stamp.x * canvas.width
        const y = stamp.y * canvas.height
        const size = 18 * (this.app.scale / 1.5)

        ctx.save()

        if (isHovered) {
            ctx.shadowBlur = 15
            ctx.shadowColor = '#ef4444'
        } else if (isSelectHovered) {
            ctx.shadowBlur = 15
            ctx.shadowColor = '#6366f1'
        } else if (this.app.activeStampType === 'select' && !isForeign) {
            ctx.shadowBlur = 12
            ctx.shadowColor = '#6366f166' // Subtle interactive glow
        }

        if (isForeign) {
            ctx.setLineDash([4, 3])
            ctx.globalAlpha *= 0.7
        }

        ctx.strokeStyle = isHovered ? '#ef4444' : isSelectHovered ? '#6366f1' : color
        ctx.fillStyle = isHovered ? '#ef444433' : isSelectHovered ? '#6366f133' : `${color}33`
        ctx.lineWidth = 1.8 * (this.app.scale / 1.5)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // Data-Driven Rendering: Find tool metadata
        let toolDef = null
        for (const set of this.app.toolsets) {
            const tool = set.tools.find(t => t.id === stamp.type)
            if (tool) {
                toolDef = tool
                break
            }
        }

        if (toolDef && toolDef.draw) {
            const d = toolDef.draw
            ctx.beginPath()

            switch (d.type) {
                case 'text':
                    ctx.font = `${d.font || ''} ${d.size * (this.app.scale / 1.5)}px ${d.fontFace || 'Outfit'}`
                    ctx.fillStyle = color
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(d.content, x, y)
                    break

                case 'shape':
                    if (d.shape === 'circle') {
                        ctx.arc(x, y, size * (d.radius || 1), 0, Math.PI * 2)
                        if (d.fill) { ctx.fillStyle = color; ctx.fill() }
                        ctx.stroke()
                    }
                    break

                case 'path':
                    // Relative path rendering (-1 to 1 space)
                    const pParts = d.data.split(' ')
                    ctx.save()
                    ctx.translate(x, y)
                    ctx.scale(size, size)
                    // Adjust line width to be consistent despite scaling
                    ctx.lineWidth = (2.5 * (this.app.scale / 1.5)) / size
                    ctx.lineCap = 'round'
                    ctx.lineJoin = 'round'

                    for (let i = 0; i < pParts.length; i++) {
                        const cmd = pParts[i]
                        if (cmd === 'M') ctx.moveTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]))
                        else if (cmd === 'L') ctx.lineTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]))
                        else if (cmd === 'C') ctx.bezierCurveTo(parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]), parseFloat(pParts[++i]))
                    }
                    ctx.stroke()
                    ctx.restore()
                    break

                case 'special':
                    if (d.variant === 'input-text') {
                        ctx.font = `bold ${22 * (this.app.scale / 1.5)}px Outfit`
                        ctx.fillStyle = color
                        const lines = (stamp.data || '').split('\n')
                        const lineHeight = 26 * (this.app.scale / 1.5)
                        lines.forEach((line, i) => {
                            ctx.fillText(line, x, y + (i * lineHeight))
                        })
                    } else if (d.variant === 'measure') {
                        const s = this.app.scale / 1.5
                        const bw = 22 * s, bh = 18 * s
                        const bx = x - bw / 2, by = y - bh / 2
                        // Outline-only box (no fill)
                        ctx.strokeStyle = isHovered ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.25)'
                        ctx.lineWidth = 0.8
                        ctx.beginPath()
                        ctx.roundRect(bx, by, bw, bh, 3)
                        ctx.stroke()
                        // Light text
                        ctx.font = `500 ${13 * s}px Outfit`
                        ctx.fillStyle = isHovered ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.35)'
                        ctx.textAlign = 'center'
                        ctx.textBaseline = 'middle'
                        ctx.fillText(stamp.data || '#', x, y)
                    }
                    break

                case 'complex':
                    // Legacy support for complex visual logic
                    if (d.variant === 'thumb') {
                        // 直立橢圓 (ellipse: cx=x, cy=y-size*0.3, rx=size*0.35, ry=size*0.6)
                        ctx.beginPath()
                        ctx.ellipse(x, y - size * 0.3, size * 0.35, size * 0.6, 0, 0, Math.PI * 2)
                        ctx.stroke()
                        // 瘦短直棒，緊黏橢圓底部
                        ctx.beginPath()
                        ctx.moveTo(x, y + size * 0.3)
                        ctx.lineTo(x, y + size * 0.6)
                        ctx.stroke()
                    } else if (d.variant === 'fermata') {
                        const fSize = size * 0.45
                        ctx.arc(x, y, fSize, Math.PI, 0); ctx.stroke()
                        ctx.beginPath(); ctx.arc(x, y - fSize * 0.3, fSize * 0.15, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
                    } else if (d.variant === 'anchor') {
                        const isNextTarget = stamp === this.app.nextTargetAnchor
                        const aColor = isNextTarget ? color : '#94a3b8'
                        if (!isNextTarget) ctx.globalAlpha *= 0.35
                        ctx.fillStyle = aColor
                        ctx.strokeStyle = aColor
                        // 圓點 (頂部)
                        ctx.beginPath()
                        ctx.arc(x, y - size * 1.1, size * 0.18, 0, Math.PI * 2)
                        ctx.fill()
                        // 直棒
                        ctx.beginPath()
                        ctx.lineWidth = size * 0.12
                        ctx.moveTo(x, y - size * 0.9)
                        ctx.lineTo(x, y + size * 0.3)
                        ctx.stroke()
                        // 橫桿
                        ctx.beginPath()
                        ctx.moveTo(x - size * 0.6, y)
                        ctx.lineTo(x + size * 0.6, y)
                        ctx.stroke()
                        // 弧形 (底部)
                        ctx.beginPath()
                        ctx.arc(x, y, size * 0.6, 0, Math.PI, false)
                        ctx.stroke()
                        ctx.lineWidth = 1.8 * (this.app.scale / 1.5)
                    }
                    break
            }
        } else {
            // Fallback for tools without draw metadata (e.g. circle index which uses type name directly)
            if (stamp.type === 'circle') {
                ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            }
        }

        ctx.restore()
    }

    createCaptureOverlay(wrapper, pageNum, width, height) {
        const overlay = document.createElement('div')
        overlay.className = 'capture-overlay'
        overlay.dataset.page = pageNum
        overlay.style.width = `${width}px`
        overlay.style.height = `${height}px`

        let isInteracting = false
        let activeObject = null // Can be a new path or an existing stamp being moved
        let isMovingExisting = false
        let isPanning = false
        this.hoveredStamp = null
        this.selectHoveredStamp = null // Separate hover state for Select mode

        const getPos = (e) => {
            const rect = overlay.getBoundingClientRect()
            const clientX = e.clientX || (e.touches && e.touches[0].clientX)
            const clientY = e.clientY || (e.touches && e.touches[0].clientY)
            return {
                x: (clientX - rect.left) / rect.width,
                y: (clientY - rect.top) / rect.height
            }
        }

        // Dynamic stamp preview offset: default upper-left; flips near right/bottom viewport edges
        const STAMP_OFFSET_X_PX = 15
        const STAMP_OFFSET_Y_PX = 30
        const EDGE_THRESHOLD_X = 0.15  // flip X when cursor within 15% of RIGHT edge
        const EDGE_THRESHOLD_Y = 0.12  // flip Y when cursor within 12% of BOTTOM edge
        const getStampPreviewPos = (pos) => {
            const rect = overlay.getBoundingClientRect()
            // X: binary flip near right page edge (small offset, jump is tiny)
            const nearRight = pos.x > 1 - EDGE_THRESHOLD_X
            const dx = (nearRight ? 1 : -1) * STAMP_OFFSET_X_PX / rect.width
            // Y: smooth lerp near viewport bottom — no binary jump
            const cursorScreenY = rect.top + pos.y * rect.height
            const distFromBottom = window.innerHeight - cursorScreenY
            const TRANSITION_PX = STAMP_OFFSET_Y_PX * 4  // lerp zone height
            let dyPx
            if (distFromBottom >= TRANSITION_PX) {
                dyPx = -STAMP_OFFSET_Y_PX          // normal: above cursor
            } else if (distFromBottom <= 0) {
                dyPx = STAMP_OFFSET_Y_PX           // past viewport bottom: below cursor
            } else {
                // Smooth interpolation: -offset → +offset over the transition zone
                const t = 1 - distFromBottom / TRANSITION_PX
                dyPx = -STAMP_OFFSET_Y_PX + t * STAMP_OFFSET_Y_PX * 2
            }
            return {
                x: Math.max(0.01, Math.min(0.99, pos.x + dx)),
                y: Math.max(0.01, Math.min(0.99, pos.y + dyPx / rect.height))
            }
        }

        const drawLeaderLine = (ctx, canvas, cursorPos, previewPos) => {
            const scale = this.app.scale / 1.5
            ctx.save()
            ctx.setLineDash([5 * scale, 4 * scale])
            ctx.strokeStyle = 'rgba(80, 80, 80, 0.4)'
            ctx.lineWidth = 1.2 * scale
            ctx.beginPath()
            ctx.moveTo(cursorPos.x * canvas.width, cursorPos.y * canvas.height)
            ctx.lineTo(previewPos.x * canvas.width, previewPos.y * canvas.height)
            ctx.stroke()
            ctx.restore()
        }

        const startAction = (e) => {
            const pos = getPos(e)
            const toolType = this.app.activeStampType

            // View mode: drag-to-pan (mouse only; touch uses native scroll)
            if (toolType === 'view') {
                if (e.type !== 'touchstart') {
                    isPanning = true
                    const startX = e.clientX, startY = e.clientY
                    const startScrollTop = this.app.viewer.scrollTop
                    const startScrollLeft = this.app.viewer.scrollLeft
                    overlay.style.cursor = 'grabbing'
                    e.preventDefault()
                    // Disable smooth scroll during drag so scrollTop changes are instant
                    this.app.viewer.style.scrollBehavior = 'auto'
                    const doPan = (ev) => {
                        if (!isPanning) return
                        this.app.viewer.scrollTop = startScrollTop - (ev.clientY - startY)
                        this.app.viewer.scrollLeft = startScrollLeft - (ev.clientX - startX)
                    }
                    const stopPan = () => {
                        isPanning = false
                        overlay.style.cursor = ''
                        this.app.viewer.style.scrollBehavior = ''
                        window.removeEventListener('mousemove', doPan)
                        window.removeEventListener('mouseup', stopPan)
                    }
                    window.addEventListener('mousemove', doPan)
                    window.addEventListener('mouseup', stopPan)
                }
                return
            }

            // Allow multi-touch gestures (like 2-finger scroll/zoom) to pass through to the browser
            if (e.type === 'touchstart' && e.touches && e.touches.length > 1) {
                return // Let browser handle 2-finger scroll
            }

            if (e.type === 'touchstart') e.preventDefault()
            isInteracting = true

            const isFreehand = ['pen', 'highlighter', 'line'].includes(toolType)

            if (toolType === 'select' || toolType === 'recycle-bin') {
                const target = this.selectHoveredStamp
                    || this.findClosestStamp(pageNum, pos.x, pos.y, true)

                if (!target) {
                    isInteracting = false
                } else {
                    if (toolType === 'recycle-bin') {
                        // RECYCLE ACTION: Move from stamps to recycleItems
                        this.app.stamps = this.app.stamps.filter(s => s !== target)

                        // Find additional metadata for UI preview if possible
                        let toolDef = null
                        for (const set of this.app.toolsets) {
                            const tool = set.tools.find(t => t.id === target.type)
                            if (tool) { toolDef = tool; break }
                        }

                        this.app.recycleItems.push({
                            ...target,
                            label: toolDef ? toolDef.label : target.type,
                            icon: toolDef ? toolDef.icon : ''
                        })

                        this.app.saveToStorage()
                        this.redrawStamps(pageNum)
                        this.app.updateActiveTools()
                        isInteracting = false // Action complete
                    } else {
                        // NORMAL SELECT: Start Move
                        isMovingExisting = true
                        activeObject = target
                        this.app.lastFocusedStamp = activeObject
                        this._dragLastPos = pos
                        this.selectHoveredStamp = null
                        this.redrawStamps(pageNum)
                    }
                }
            } else if (isFreehand) {
                activeObject = {
                    type: toolType,
                    page: pageNum,
                    layerId: 'draw',
                    sourceId: this.app.activeSourceId, // Link to current Persona
                    points: [pos],
                    color: this.app.layers.find(l => l.id === 'draw').color
                }
            } else if (toolType === 'eraser') {
                // Gather ALL nearby stamps within threshold, sorted by distance
                const nearby = this.findNearbyStamps(pageNum, pos.x, pos.y)
                if (nearby.length === 1) {
                    // Only 1 nearby — delete directly
                    this.eraseStampTarget(nearby[0])
                } else if (nearby.length > 1) {
                    // Multiple nearby — show picker menu so user chooses exactly which one
                    const clientX = e.clientX || (e.touches && e.touches[0].clientX)
                    const clientY = e.clientY || (e.touches && e.touches[0].clientY)
                    this.showEraseMenu(nearby, clientX, clientY)
                }
                isInteracting = false
            } else {
                // Precise Placement for Stamps
                let targetLayerId = 'draw'
                const group = this.app.toolsets.find(g => g.tools.some(t => t.id === toolType))
                if (group) {
                    const layer = this.app.layers.find(l => l.type === group.type)
                    if (layer) targetLayerId = layer.id
                }

                const previewPos = getStampPreviewPos(pos)
                activeObject = {
                    page: pageNum,
                    layerId: targetLayerId,
                    sourceId: this.app.activeSourceId, // Link to current Persona
                    type: toolType,
                    x: previewPos.x,
                    y: previewPos.y,
                    data: null
                }
                this.app.lastFocusedStamp = activeObject
            }
        }

        const moveAction = (e) => {
            if (!isInteracting || !activeObject) return
            const pos = getPos(e)

            if (isMovingExisting) {
                if (activeObject.points) {
                    // Use mouse delta (pos - lastPos) to avoid compounding drift
                    const dx = pos.x - (this._dragLastPos?.x ?? pos.x)
                    const dy = pos.y - (this._dragLastPos?.y ?? pos.y)
                    activeObject.points = activeObject.points.map(p => ({ x: p.x + dx, y: p.y + dy }))
                } else {
                    activeObject.x = pos.x
                    activeObject.y = pos.y
                }
                this._dragLastPos = pos
                this.redrawStamps(pageNum)
            } else if (activeObject.points) {
                if (this.app.activeStampType === 'line') {
                    activeObject.points[1] = pos
                } else {
                    activeObject.points.push(pos)
                }
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
                if (canvas) this.drawPathOnCanvas(canvas.getContext('2d'), canvas, activeObject)
            } else {
                // Preview new stamp — follow offset position, not raw cursor
                const previewPos = getStampPreviewPos(pos)
                activeObject.x = previewPos.x
                activeObject.y = previewPos.y
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
                const ctx = canvas.getContext('2d')
                this.redrawStamps(pageNum)
                const layer = this.app.layers.find(l => l.id === activeObject.layerId)
                this.drawStampOnCanvas(ctx, canvas, activeObject, layer ? layer.color : '#000000', true)
                if (!e.touches) drawLeaderLine(ctx, canvas, pos, previewPos)
            }
        }

        const hoverAction = (e) => {
            // ── Eraser hover ──
            if (this.app.activeStampType === 'eraser' && !isInteracting) {
                const pos = getPos(e)
                const found = this.findClosestStamp(pageNum, pos.x, pos.y)
                if (found !== this.hoveredStamp) {
                    this.hoveredStamp = found
                    this.redrawStamps(pageNum)
                    const oldChip = wrapper.querySelector('.erase-hover-chip')
                    if (oldChip) oldChip.remove()
                    if (found) {
                        const canvas = wrapper.querySelector('.pdf-canvas')
                        if (canvas) {
                            const chipX = found.x != null ? found.x * canvas.offsetWidth : (found.points?.[0]?.x ?? 0) * canvas.offsetWidth
                            const chipY = found.y != null ? found.y * canvas.offsetHeight : (found.points?.[0]?.y ?? 0) * canvas.offsetHeight
                            const chip = document.createElement('div')
                            chip.className = 'erase-hover-chip'
                            chip.textContent = '🗑 Delete'
                            chip.style.left = `${chipX}px`
                            chip.style.top = `${chipY}px`
                            wrapper.appendChild(chip)
                        }
                    }
                }
            }

            // ── Select / Recycle Bin hover ──
            if ((this.app.activeStampType === 'select' || this.app.activeStampType === 'recycle-bin') && !isInteracting) {
                const pos = getPos(e)
                const found = this.findClosestStamp(pageNum, pos.x, pos.y, true)
                if (found !== this.selectHoveredStamp) {
                    this.selectHoveredStamp = found
                    this.redrawStamps(pageNum)
                }
            }

            // ── Stamp tool hover preview (ghost + leader line) ──
            if (this.isStampTool() && !isInteracting) {
                const pos = getPos(e)
                const previewPos = getStampPreviewPos(pos)
                const canvas = wrapper.querySelector('.annotation-layer.virtual-canvas')
                if (canvas) {
                    this.redrawStamps(pageNum)
                    const ctx = canvas.getContext('2d')
                    const group = this.app.toolsets.find(g => g.tools.some(t => t.id === this.app.activeStampType))
                    const layer = group ? this.app.layers.find(l => l.type === group.type) : null
                    const color = layer ? layer.color : '#6366f1'
                    this.drawStampOnCanvas(ctx, canvas, { type: this.app.activeStampType, x: previewPos.x, y: previewPos.y, page: pageNum }, color, true)
                    if (!e.touches) drawLeaderLine(ctx, canvas, pos, previewPos)
                }
            }
        }

        const endAction = async (e) => {
            if (isInteracting && activeObject) {
                if (!isMovingExisting) {
                    if (activeObject.type === 'text' || activeObject.type === 'tempo-text') {
                        // Delay adding to stamps until we have the multi-line data
                        this.spawnTextEditor(wrapper, pageNum, activeObject)
                    } else if (activeObject.type === 'measure') {
                        const measureObj = activeObject
                        isInteracting = false
                        activeObject = null
                        let defVal = 1
                        if (this.app.lastMeasureNum) {
                            defVal = parseInt(this.app.lastMeasureNum) + (this.app.measureStep || 4)
                        }
                        const data = await this.promptMeasureNumber(defVal)
                        if (data) {
                            this.app.lastMeasureNum = String(data)
                            measureObj.data = String(data)
                            const existingMeasure = this.app.stamps.find(s => s.type === 'measure' && s.page === pageNum)
                            if (existingMeasure) measureObj.x = existingMeasure.x
                            this.app.stamps.push(measureObj)
                            this.app.updateRulerMarks()
                            this.app.saveToStorage()
                            this.redrawStamps(pageNum)
                        }
                        return
                    } else {
                        this.app.stamps.push(activeObject)
                    }
                }

                if (activeObject.type === 'anchor') {
                    this.app.updateRulerMarks()
                } else if (activeObject.type === 'measure') {
                    this.app.updateRulerMarks()
                }

                this.app.saveToStorage()
                this.redrawStamps(pageNum)
            }
            isInteracting = false
            isMovingExisting = false
            activeObject = null
            this._dragLastPos = null
        }

        overlay.addEventListener('mousedown', startAction)
        overlay.addEventListener('mousemove', (e) => {
            moveAction(e)
            hoverAction(e)
        })
        overlay.addEventListener('mouseleave', () => {
            let needsRedraw = false
            if (this.hoveredStamp) { this.hoveredStamp = null; needsRedraw = true }
            if (this.selectHoveredStamp) { this.selectHoveredStamp = null; needsRedraw = true }
            if (needsRedraw || this.isStampTool()) this.redrawStamps(pageNum)
            const chip = wrapper.querySelector('.erase-hover-chip')
            if (chip) chip.remove()
        })
        window.addEventListener('mouseup', endAction)

        overlay.addEventListener('touchstart', startAction, { passive: false })
        overlay.addEventListener('touchmove', moveAction, { passive: false })
        overlay.addEventListener('touchend', endAction)

        wrapper.appendChild(overlay)
    }

    drawPageEndAnchor(page, width, height) {
        const pageWrapper = document.querySelector(`.page-container[data-page="${page}"]`)
        if (!pageWrapper) return  // Guard: DOM may not be ready yet (async race)
        const activeCanvas = pageWrapper.querySelector(`.annotation-layer[data-layer-id="${this.app.activeLayerId}"]`)
        if (activeCanvas) {
            const ctx = activeCanvas.getContext('2d')
            this.drawStampOnCanvas(ctx, activeCanvas, { type: 'anchor', x: 0.05, y: 1.0, isDefault: true }, '#3b82f6')
        }
    }

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

        // Set focus after a tiny delay to ensure it's in the DOM
        setTimeout(() => {
            editor.focus()
            // Adjust initial height
            editor.style.height = 'auto'
            editor.style.height = editor.scrollHeight + 'px'
        }, 10)

        const finalize = () => {
            if (editor.value.trim()) {
                stamp.data = editor.value
                this.app.stamps.push(stamp)
                this.app.saveToStorage()
                this.redrawStamps(pageNum)
            }
            editor.remove()
        }

        // Single click outside or Esc will cancel/finalize depending on logic
        // Blur usually happens when clicking elsewhere
        editor.onblur = (e) => {
            // Only finalize if we actually typed something
            if (editor.value.trim()) finalize()
            else editor.remove()
        }

        editor.onkeydown = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                finalize()
            }
            if (e.key === 'Escape') {
                editor.remove()
            }
            e.stopPropagation() // Prevent global shortcuts while typing
        }

        // Auto-resize horizontally and vertically
        editor.oninput = () => {
            editor.style.height = 'auto'
            editor.style.height = editor.scrollHeight + 'px'
        }
    }

    showEraseAllModal() {
        if (!this.app.eraseAllModal) return

        // Build category → stamps map using toolset groups
        const categoryMap = new Map() // name → { icon, stamps[] }

        const categoryMeta = {
            'Pens': { icon: '✏️' },
            'Bow/Fingering': { icon: '🎻' },
            'Articulation': { icon: '🎵' },
            'Tempo': { icon: '♩' },
            'Dynamic': { icon: 'f' },
            'Anchor': { icon: '⚓' },
        }

        // Initialise all known categories (even if count is 0)
        for (const [name, meta] of Object.entries(categoryMeta)) {
            categoryMap.set(name, { icon: meta.icon, stamps: [] })
        }

        // Bucket each stamp by its toolset group
        for (const stamp of this.app.stamps) {
            const group = this.app.toolsets.find(g => g.tools.some(t => t.id === stamp.type))
            if (!group || group.type === 'edit') continue
            if (!categoryMap.has(group.name)) {
                categoryMap.set(group.name, { icon: '📌', stamps: [] })
            }
            categoryMap.get(group.name).stamps.push(stamp)
        }

        // Render list
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

        // "All Annotations" row
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

        // Close on Escape
        this._eraseAllEsc = (e) => { if (e.key === 'Escape') this.closeEraseAllModal() }
        document.addEventListener('keydown', this._eraseAllEsc)
    }

    closeEraseAllModal() {
        if (this.app.eraseAllModal) this.app.eraseAllModal.classList.remove('active')
        if (this._eraseAllEsc) {
            document.removeEventListener('keydown', this._eraseAllEsc)
            this._eraseAllEsc = null
        }
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

        console.log(`Erase All: Removed ${removed} stamps from category "${categoryName}"`)

        // Update ruler if anchors were among the removed
        this.app.updateRulerMarks()
        this.app.computeNextTarget()

        // Redraw all rendered pages
        document.querySelectorAll('.page-container[data-page]').forEach(wrapper => {
            const page = parseInt(wrapper.dataset.page)
            this.redrawStamps(page)
        })
        this.app.saveToStorage()
    }

    // Legacy alias kept for safety
    eraseStamp(page, x, y) {
        const target = this.findClosestStamp(page, x, y)
        if (target) this.eraseStampTarget(target)
    }
}
