import '../styles/dock-bar.css'

/**
 * DockingBarManager
 * ─────────────────
 * Horizontal bottom docking bar — paginated, like the Stamp bar.
 * Page 0: Navigation + utility function entries (no stamp tools inline).
 * Future pages: additional tool groups, added via _pages.
 */
export class DockingBarManager {
    constructor(app) {
        this.app = app
        this.el = null
        this.fab = null
        this._subBarMgr = null
        this._page = 0
        this._pages = null
        this._visible = true

        // Auto-hide settings
        this._autoHideEnabled  = localStorage.getItem('sf_dock_autohide') === 'true'
        this._autoHideDelaySec = parseInt(localStorage.getItem('sf_dock_autohide_sec') || '4', 10)
        this._autoShowEnabled  = localStorage.getItem('sf_dock_autoshow') !== 'false' // default true
        this._hideTimer = null
        this._trigger = null
        this._dragInfo = { active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, moved: false }
        
        // Persisted positions
        this._pos = JSON.parse(localStorage.getItem('sf_dock_fab_pos') || '{"right": 18, "bottom": 85}')
    }

    setSubBarManager(mgr) { this._subBarMgr = mgr }

    init() {
        let el = document.getElementById('sf-dock-bar')
        if (!el) {
            el = document.createElement('div')
            el.id = 'sf-dock-bar'
            document.body.appendChild(el)
        }
        this.el = el
        this._pages = this._buildPages()
        this._createFab()
        this._createTrigger()
        this._createBottomFill()

        document.body.classList.add('sf-dock-bar-visible')
        this.update()
        this._startHideTimer()

        // Reset timer on any interaction with the bar
        this.el.addEventListener('pointerenter', () => this._resetHideTimer())
        this.el.addEventListener('pointermove',  () => this._resetHideTimer())
        this.el.addEventListener('click',        () => this._resetHideTimer())
    }

    _createFab() {
        let fab = document.getElementById('sf-dock-fab')
        if (!fab) {
            fab = document.createElement('div')
            fab.id = 'sf-dock-fab'
            fab.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
            </svg>`
            document.body.appendChild(fab)
        }
        this.fab = fab
        this._applyFabPosition()
        this._initFabDragging()
        
        fab.addEventListener('click', (e) => {
            if (this._dragInfo.moved) return
            this.toggleVisible()
            this._resetHideTimer()
        })
    }

    _applyFabPosition() {
        if (!this.fab) return
        this.fab.style.left = 'auto'
        this.fab.style.top = 'auto'
        this.fab.style.right = `${this._pos.right}px`
        this.fab.style.bottom = `${this._pos.bottom}px`
    }

    _initFabDragging() {
        const fab = this.fab
        const onMove = (e) => {
            if (!this._dragInfo.active) return
            const dx = e.clientX - this._dragInfo.startX
            const dy = e.clientY - this._dragInfo.startY
            
            if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                this._dragInfo.moved = true
            }

            const x = this._dragInfo.initX + dx
            const y = this._dragInfo.initY + dy
            
            // Constrain within viewport
            const safeX = Math.max(10, Math.min(window.innerWidth - 60, x))
            const safeY = Math.max(20, Math.min(window.innerHeight - 80, y))

            fab.style.right = `${window.innerWidth - safeX - 48}px`
            fab.style.bottom = `${window.innerHeight - safeY - 48}px`
            fab.classList.add('dragging')
        }

        const onUp = (e) => {
            if (!this._activePointerId === e.pointerId) return
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', onUp)
            
            if (this._dragInfo.active) {
                this._dragInfo.active = false
                fab.classList.remove('dragging')
                
                // Snapping logic
                const rect = fab.getBoundingClientRect()
                const centerXPct = (rect.left + rect.width / 2) / window.innerWidth
                const snapRight = centerXPct > 0.5
                
                this._pos.right = snapRight ? 18 : (window.innerWidth - 60)
                this._pos.bottom = window.innerHeight - rect.bottom
                
                fab.style.transition = 'all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)'
                this._applyFabPosition()
                
                localStorage.setItem('sf_dock_fab_pos', JSON.stringify(this._pos))
                
                setTimeout(() => {
                    fab.style.transition = ''
                    this._dragInfo.moved = false
                }, 400)
            }
        }

        fab.addEventListener('pointerdown', (e) => {
            this._activePointerId = e.pointerId
            const rect = fab.getBoundingClientRect()
            this._dragInfo = {
                active: true,
                moved: false,
                startX: e.clientX,
                startY: e.clientY,
                initX: rect.left,
                initY: rect.top
            }
            fab.setPointerCapture(e.pointerId)
            document.addEventListener('pointermove', onMove)
            document.addEventListener('pointerup', onUp)
            e.preventDefault()
        })
    }

    _createBottomFill() {
        let label = document.getElementById('sf-dock-score-name')
        if (!label) {
            label = document.createElement('div')
            label.id = 'sf-dock-score-name'
            document.body.appendChild(label)
        }
    }

    updateScoreName(name) {
        const el = document.getElementById('sf-dock-score-name')
        if (el) el.textContent = name || ''
    }

    _createTrigger() {
        let trigger = document.getElementById('sf-dock-trigger')
        if (!trigger) {
            trigger = document.createElement('div')
            trigger.id = 'sf-dock-trigger'
            document.body.appendChild(trigger)
        }
        this._trigger = trigger
        trigger.addEventListener('pointerenter', () => {
            if (!this._visible && this._autoShowEnabled) this._showBar()
        })
        trigger.addEventListener('touchstart', () => {
            if (!this._visible && this._autoShowEnabled) this._showBar()
        }, { passive: true })
        this._updateTrigger()
    }

    _updateTrigger() {
        if (!this._trigger) return
        // Trigger zone is only active when bar is hidden AND auto-show is on
        this._trigger.style.pointerEvents = (!this._visible && this._autoShowEnabled) ? 'auto' : 'none'
    }

    _showBar() {
        this._visible = true
        this.el.classList.remove('hidden')
        this.fab.classList.remove('bar-hidden')
        document.body.classList.add('sf-dock-bar-visible')
        this._updateTrigger()
        this._startHideTimer()
    }

    _hideBar() {
        this._visible = false
        this.el.classList.add('hidden')
        this.fab.classList.add('bar-hidden')
        document.body.classList.remove('sf-dock-bar-visible')
        this._updateTrigger()
    }

    toggleVisible() {
        if (this._visible) {
            this._hideBar()
        } else {
            this._showBar()
        }
    }

    _startHideTimer() {
        this._clearHideTimer()
        if (!this._autoHideEnabled || !this._visible) return
        this._hideTimer = setTimeout(() => {
            if (this._visible) this._hideBar()
        }, this._autoHideDelaySec * 1000)
    }

    _resetHideTimer() {
        if (!this._autoHideEnabled) return
        this._clearHideTimer()
        this._startHideTimer()
    }

    _clearHideTimer() {
        if (this._hideTimer) {
            clearTimeout(this._hideTimer)
            this._hideTimer = null
        }
    }

    // Called from SettingsPanelManager when settings change
    applyAutoHideSettings({ enabled, delaySec, autoShow }) {
        if (enabled !== undefined)  this._autoHideEnabled  = enabled
        if (delaySec !== undefined) this._autoHideDelaySec = delaySec
        if (autoShow !== undefined) this._autoShowEnabled  = autoShow

        if (!this._autoHideEnabled) {
            this._clearHideTimer()
            if (!this._visible) this._showBar()
        } else {
            this._startHideTimer()
        }
        this._updateTrigger()
    }

    update() {
        if (!this.el) return
        this._render()
    }

    // ── Page definitions ───────────────────────────────────────────────────────

    _buildPages() {
        return [
            {
                label: 'Main',
                buttons: [
                    { id: '_settings', label: '設定',   icon: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`, action: () => this.app.settingsPanelManager?.toggle() },
                    { id: '_library',  label: '圖書庫', icon: `<rect x="3" y="3" width="4" height="15" rx="1.5"/><rect x="10" y="6" width="4" height="12" rx="1.5"/><rect x="17" y="4.5" width="4" height="13.5" rx="1.5"/><rect x="2" y="19" width="20" height="2" rx="1"/>`,                                               action: () => this.app.toggleLibrary?.() },
                    { id: '_jump',     label: '跳轉',   icon: `<polygon points="3 11 22 2 13 21 11 13 3 11"/>`,                                                                                                                                                                                                          action: () => this.app.jumpManager?.togglePanel() },
                    { divider: true },
                    { id: 'view',   label: 'View',   tool: true, icon: `<path d="M5 12.55V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6.55"/><path d="M12 22a2.98 2.98 0 0 0 2.81-2H9.18a3 3 0 0 0 2.82 2z"/><path d="M20 13a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4v-2z"/>` },
                    { id: 'select',       label: 'Select', tool: true, icon: `<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/>` },
                    { id: 'multi-select', label: 'Multi',  tool: true, icon: `<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/><circle cx="19" cy="5" r="3" fill="currentColor"/>` },
                    { id: 'eraser', label: 'Eraser', tool: true, icon: `<path d="M16.5 4.5 L19.5 7.5 L9 18 L4.5 18 L4.5 13.5 Z" fill="none" stroke-linejoin="round"/><line x1="12" y1="7.5" x2="15" y2="10.5"/><line x1="4.5" y1="18" x2="19.5" y2="18" stroke-linecap="round"/>` },
                    { id: 'cycle',  label: 'Cycle',  tool: true, icon: `<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" stroke-linecap="round"/><polyline points="21 3 21 8 16 8" stroke-linecap="round"/>` },
                    { divider: true },
                    { id: '_fitw',    label: 'Fit W', icon: `<path d="M21 12H3M3 12l4-4M3 12l4 4M21 12l-4-4M21 12l-4 4"/>`,                                      action: () => this.app.fitToWidth?.() },
                    { id: '_fith',    label: 'Fit H', icon: `<path d="M12 3v18M12 3L8 7M12 3l4 4M12 21l-4-4M12 21l4-4"/>`,                                       action: () => this.app.fitToHeight?.() },
                    { id: '_zoomin',  label: 'Zoom+', icon: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>`, action: () => this.app.changeZoom?.(0.25) },
                    { id: '_zoomout', label: 'Zoom-', icon: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>`,                                        action: () => this.app.changeZoom?.(-0.25) },
                    { divider: true },
                    { id: 'stamp-palette', label: 'Stamps', stamp: true, icon: `<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>` },
                    { id: '_others', label: 'Others', icon: `<circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/>`, action: (btn) => this._subBarMgr?.toggle('others', btn) },
                ]
            }
            // Future pages can be pushed here (e.g. layer quick-toggles, playback controls…)
        ]
    }

    // ── Rendering ──────────────────────────────────────────────────────────────

    _render() {
        this.el.innerHTML = ''

        const pages = this._pages
        const page  = pages[this._page] || pages[0]
        const multi = pages.length > 1

        const curTool      = this.app.activeStampType
        const stampBarOpen = this._subBarMgr?.activeBar === 'stamp'
        const isCoreAction = ['view','select','eraser','cycle','recycle-bin'].includes(curTool)

        // ── Prev arrow (only shown when multiple pages) ────────────────
        if (multi) this.el.appendChild(this._navArrow('‹', -1, pages.length))

        // ── Tool buttons ───────────────────────────────────────────────
        page.buttons.forEach(cfg => {
            if (cfg.divider) {
                const d = document.createElement('div')
                d.className = 'sf-dock-divider'
                this.el.appendChild(d)
                return
            }

            const btn = document.createElement('div')
            btn.className = 'sf-strip-btn'
            btn.dataset.tool = cfg.id
            btn.title = cfg.label

            if (cfg.stamp) {
                if (!isCoreAction) btn.classList.add('active')
                if (stampBarOpen)  btn.classList.add('open')
            } else if (cfg.tool && curTool === cfg.id && !stampBarOpen) {
                btn.classList.add('active')
            }

            btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="22" height="22">${cfg.icon}</svg>`

            btn.addEventListener('click', () => {
                if (cfg.action) { cfg.action(btn); return }
                if (cfg.stamp)  { this._subBarMgr?.toggle('stamp', btn); this.update(); return }
                if (cfg.tool) {
                    this._subBarMgr?.closeToolBars ? this._subBarMgr.closeToolBars() : this._subBarMgr?.closeAll()
                    const already = this.app.activeStampType === cfg.id && cfg.id !== 'view'
                    const next = already ? 'view' : cfg.id
                    // Clear multi-select when leaving multi-select tool
                    if (this.app.activeStampType === 'multi-select' && next !== 'multi-select') {
                        this.app.annotationManager?.interaction?.clearMultiSelect()
                    }
                    this.app.activeStampType = next
                    this.app.toolManager?.updateActiveTools()
                }
            })

            this.el.appendChild(btn)
        })

        // ── Next arrow + dots ──────────────────────────────────────────
        if (multi) {
            this.el.appendChild(this._navArrow('›', 1, pages.length))
            const dots = document.createElement('div')
            dots.className = 'sf-dock-dots'
            pages.forEach((_, i) => {
                const d = document.createElement('div')
                d.className = 'sf-dock-dot' + (i === this._page ? ' active' : '')
                d.addEventListener('click', () => { this._page = i; this.update() })
                dots.appendChild(d)
            })
            this.el.appendChild(dots)
        }
    }

    _navArrow(label, dir, total) {
        const btn = document.createElement('div')
        btn.className = 'sf-dock-nav-btn'
        btn.textContent = label
        btn.addEventListener('click', () => {
            this._page = (this._page + dir + total) % total
            this.update()
        })
        return btn
    }
}
