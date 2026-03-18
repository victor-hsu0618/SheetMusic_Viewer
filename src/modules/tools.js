export class ToolManager {
    constructor(app) {
        this.app = app
        this._stampBtnDefault = null
        this._lastPaletteToggleTime = 0
        this._stampDragMoved = false
        this._isDragging = false
        this._dragStartX = 0
        this._dragStartY = 0
        this._dragInitialLeft = 0
        this._dragInitialTop = 0
        this.isStampPaletteOpen = false
    }

    enableClickToScroll(el) {
        if (!el) return
        let isDown = false
        let startX
        let scrollLeft

        const start = (pageX) => {
            isDown = true
            el.classList.add('dragging')
            startX = pageX - el.offsetLeft
            scrollLeft = el.scrollLeft
            el.style.cursor = 'grabbing'
            el.style.userSelect = 'none'
        }

        const end = () => {
            isDown = false
            el.classList.remove('dragging')
            el.style.cursor = ''
            el.style.userSelect = ''
        }

        const move = (pageX) => {
            if (!isDown) return
            const x = pageX - el.offsetLeft
            const walk = (x - startX) * 2
            el.scrollLeft = scrollLeft - walk
        }

        el.addEventListener('mousedown', (e) => start(e.pageX))
        el.addEventListener('touchstart', (e) => start(e.touches[0].pageX), { passive: true })
        
        el.addEventListener('mouseleave', end)
        el.addEventListener('mouseup', end)
        el.addEventListener('touchend', end)
        
        el.addEventListener('mousemove', (e) => {
            if (isDown) e.preventDefault()
            move(e.pageX)
        })
        el.addEventListener('touchmove', (e) => {
            if (isDown) {
                // Do NOT preventDefault here if we want native scroll to potentially kick in,
                // but since we are doing custom horizontal scroll, we usually prevent it.
                // However, the palette is already preventing it globally.
                move(e.touches[0].pageX)
            }
        }, { passive: true })
    }

    async preloadSvgs() {
        const existingSvgs = [
            'pen', 'highlighter', 'line',
            'select', 'eraser',
            'anchor'
        ]
        const base = import.meta.env.BASE_URL
        const items = this.app.toolsets.flatMap(g =>
            g.tools.filter(t => existingSvgs.includes(t.id)).map(t => ({ id: t.id, path: `${base}assets/icons/${g.type}/${t.id}.svg` }))
        )
        await Promise.allSettled(items.map(async ({ id, path }) => {
            try {
                const r = await fetch(path)
                if (r.ok) this.app._svgCache[id] = await r.text()
            } catch { }
        }))
        this.updateActiveTools()
    }

    getIcon(tool, size = 24, color = null) {
        const strokeColor = color || 'currentColor'
        if (this.app._svgCache?.[tool.id]) {
            // Strip existing width/height and inject the correct size and color
            return this.app._svgCache[tool.id].replace(/<svg\b([^>]*)>/, (_, attrs) => {
                const a = attrs.replace(/\s+width="[^"]*"/, '').replace(/\s+height="[^"]*"/, '')
                return `<svg${a} width="${size}" height="${size}" style="color: ${strokeColor};">`
            })
        }
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke="${strokeColor}" stroke-width="1.3" fill="none" style="color: ${strokeColor};">${tool.icon}</svg>`
    }

    toggleStampPalette(x = null, y = null, force = null) {
        // Debounce to prevent multiple fires from ghost clicks (iPad)
        const now = Date.now()
        if (this._lastPaletteToggleTime && (now - this._lastPaletteToggleTime < 250)) {
            return
        }
        this._lastPaletteToggleTime = now

        const el = this.app.activeToolsContainer
        if (!el) return

        const isExpanding = force !== null ? force : !el.classList.contains('expanded')

        if (isExpanding) {
            this.app.uiManager.closeAllActivePanels('ToolManager')
            this.isStampPaletteOpen = true

            // Smart Positioning if coordinates provided
            if (x !== null && y !== null) {
                // Ensure position is materialized for absolute/fixed positioning
                el._positionMaterialized = true
                el.style.bottom = 'auto'
                el.style.transform = 'none'

                // Estimate dimensions for boundary checks
                const paletteWidth = el.offsetWidth || 300
                const paletteHeight = el.offsetHeight || 160

                // Alignment: Place the drag-handle directly under the finger (剛好不會遮住視線)
                let left = x - 30

                // Alignment: Shallower Y offset to ensure finger stays on the grip and away from tools.
                let top = y - 5

                // Bound checks (Window edges)
                const margin = 12
                if (left < margin) left = margin
                if (left + paletteWidth > window.innerWidth - margin) {
                    left = window.innerWidth - paletteWidth - margin
                }
                if (top < margin) top = margin
                if (top + paletteHeight > window.innerHeight - margin) {
                    top = window.innerHeight - paletteHeight - margin
                }
                top = Math.max(margin, top)

                el.style.left = `${left}px`
                el.style.top = `${top}px`

                // Seamless Drag: Immediately start the dragging state so the palette follows the finger
                this._startExternalDrag(x, y, el)
            } else {
                // Reset to default CSS position if opened via button or no coordinates
                el.style.left = ''
                el.style.top = ''
                el.style.bottom = ''
                el.style.transform = ''
                el._positionMaterialized = false
            }
            // Finally show it
            el.classList.add('expanded')
        } else {
            el.classList.remove('expanded')
            this.isStampPaletteOpen = false

            // Revert to view/navigation mode when palette closes
            this.app.activeStampType = 'view'

            // Sync data-active-tool and reset isInteracting immediately
            const interaction = this.app.annotationManager?.interaction;
            if (interaction) {
                interaction.updateAllOverlaysTouchAction();
            }

            // Deferred cleanup for lingering interaction state
            setTimeout(() => {
                if (this.app.rulerManager) {
                    this.app.rulerManager.stopJump();
                }
                if (interaction) {
                    interaction.updateAllOverlaysTouchAction();
                }
                if (document.activeElement) document.activeElement.blur();
                if (this.app.inputManager) {
                    this.app.inputManager.isLongPressActive = false;
                    if (this.app.inputManager.longPressTimer) {
                        clearTimeout(this.app.inputManager.longPressTimer);
                        this.app.inputManager.lastLongPressAt = 0;
                        this.app.inputManager.longPressTimer = null;
                    }
                }
                this.updateActiveTools();
            }, 50);
        }

        this.updateActiveTools()
    }

    initToolbarResizable() {
        let isResizing = false
        let initialX, initialWidth
        const el = this.app.activeToolsContainer
        if (!el) return

        const handleMouseDown = (e) => {
            const handle = e.target.closest(".resize-handle")
            if (!handle) return
            e.stopPropagation()
            e.preventDefault()
            isResizing = true
            initialX = e.clientX || e.touches[0].clientX
            initialWidth = el.offsetWidth
            el.classList.add("resizing")
        }

        const handleMouseMove = (e) => {
            if (!isResizing) return
            const currentX = (e.clientX || (e.touches && e.touches[0].clientX))
            const deltaX = currentX - initialX
            this.app.toolbarWidth = Math.max(300, initialWidth + deltaX)
            el.style.width = this.app.toolbarWidth + "px"
        }

        const handleMouseUp = () => {
            if (isResizing) {
                isResizing = false
                el.classList.remove("resizing")
                this.updateActiveTools()
            }
        }

        el.addEventListener("mousedown", handleMouseDown)
        el.addEventListener("touchstart", handleMouseDown, { passive: false })
        document.addEventListener("mousemove", handleMouseMove)
        document.addEventListener("touchmove", handleMouseMove, { passive: false })
        document.addEventListener("mouseup", handleMouseUp)
        document.addEventListener("touchend", handleMouseUp)
    }

    _startExternalDrag(clientX, clientY, el) {
        if (!el._positionMaterialized) {
            const rect = el.getBoundingClientRect()
            el.style.left = rect.left + 'px'
            el.style.top = rect.top + 'px'
            el.style.bottom = 'auto'
            el.style.transform = 'none'
            el._positionMaterialized = true
        }

        this._dragStartX = clientX
        this._dragStartY = clientY
        this._dragInitialLeft = parseFloat(el.style.left) || 0
        this._dragInitialTop = parseFloat(el.style.top) || 0
        this._isDragging = true
        this._stampDragMoved = false
    }

    initDraggable() {
        const el = this.app.activeToolsContainer
        if (!el) return

        let touchStartY = 0, touchStartTime = 0

        const dragStart = (clientX, clientY, target) => {
            if (!target.closest(".drag-handle") && !target.closest(".active-tool-fab")) return
            this._startExternalDrag(clientX, clientY, el)
        }

        const drag = (clientX, clientY) => {
            if (!this._isDragging) return
            const dx = clientX - this._dragStartX
            const dy = clientY - this._dragStartY

            // iPad drift protection
            if (!this._stampDragMoved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                this._stampDragMoved = true
            }
            el.style.left = (this._dragInitialLeft + dx) + 'px'
            el.style.top = (this._dragInitialTop + dy) + 'px'
        }

        const dragEnd = () => {
            this._isDragging = false
        }

        el.addEventListener("mousedown", (e) => dragStart(e.clientX, e.clientY, e.target))
        document.addEventListener("mousemove", (e) => {
            if (this._isDragging) {
                e.preventDefault()
                drag(e.clientX, e.clientY)
            }
        })
        document.addEventListener("mouseup", dragEnd)

        el.addEventListener("touchstart", (e) => {
            e.stopPropagation()
            touchStartY = e.touches[0].clientY
            touchStartTime = Date.now()

            if (e.target.closest(".drag-handle")) {
                dragStart(e.touches[0].clientX, e.touches[0].clientY, e.target)
                if (this._isDragging) e.preventDefault()
            }
        }, { passive: false })

        document.addEventListener("touchmove", (e) => {
            if (this._isDragging) {
                e.preventDefault()
                e.stopPropagation()
                drag(e.touches[0].clientX, e.touches[0].clientY)
            } else if (el.contains(e.target)) {
                e.stopPropagation()
                // Do NOT preventDefault if we are touching an input or button
                const isInteractive = e.target.tagName === 'INPUT' || 
                                     e.target.tagName === 'BUTTON' || 
                                     e.target.closest('button')
                const isScrollableRow = e.target.closest('.text-cloud-row, .tools-row, .recent-tools-ribbon, .category-ribbon, .settings-vtab-content')
                if (!isInteractive && !isScrollableRow && el.style.overflowY !== 'auto') {
                    e.preventDefault()
                }
            }
        }, { passive: false })

        document.addEventListener("touchend", (e) => {
            const wasJustDragging = this._isDragging
            if (this._isDragging) dragEnd()

            if (el.contains(e.target) || wasJustDragging) {
                if (this._stampDragMoved) return
                const dy = e.changedTouches[0].clientY - touchStartY
                const dt = Date.now() - touchStartTime
                if (dt < 300 && dy > 60) this.toggleStampPalette()
            }
        })
    }

    updateActiveTools(forceShowDropdown = false) {
        if (!this.app.activeToolsContainer) return
        this.app.activeToolsContainer.innerHTML = ""
        const isExpanded = this.app.activeToolsContainer.classList.contains("expanded")

        if (this.app.viewer) {
            const toolType = this.app.activeStampType;
            // Set on both viewer and body for maximum compatibility with CSS selectors
            this.app.viewer.dataset.activeTool = toolType;
            document.body.dataset.activeTool = toolType;

            // PERFORMANCE FIX: Don't block the main thread with heavy redraws when switching to view mode
            // This is likely what kills the first touch responsiveness on iPad.
            if (toolType !== 'view') {
                this.app.redrawAllAnnotationLayers();
            } else {
                // In view mode, we can afford to wait or skip redraw if nothing changed
                requestAnimationFrame(() => this.app.redrawAllAnnotationLayers());
            }

            // SYNC TOUCH ACTIONS: Ensure overlays are updated to match the NEW active tool immediately
            this.app.annotationManager?.interaction?.updateAllOverlaysTouchAction();
            
            // REFRESH RULER: Ensure measure marks pointer-events are updated for scrolling safety
            this.app?.rulerManager?.updateRulerMarks();
        }
        // Sync Doc Bar
        if (this.app.btnModeHand) this.app.btnModeHand.classList.toggle('active', this.app.activeStampType === 'view')
        if (this.app.btnModeEraser) this.app.btnModeEraser.classList.toggle('active', this.app.activeStampType === 'eraser')

        const activeTool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === this.app.activeStampType)
        if (this.app.btnStampPalette) {
            const isStampSelected = this.app.activeStampType !== 'view' && this.app.activeStampType !== 'eraser'
            this.app.btnStampPalette.classList.toggle('active', isExpanded || (!!activeTool && isStampSelected))
            if (!this._stampBtnDefault) this._stampBtnDefault = this.app.btnStampPalette.innerHTML
            this.app.btnStampPalette.innerHTML = (activeTool && isStampSelected)
                ? this.getIcon(activeTool, 18, this.app.activeColor)
                : this._stampBtnDefault
        }

        if (!isExpanded) {
            this.app.activeToolsContainer.onclick = null
            return
        }

        this.app.activeToolsContainer.style.width = typeof this.app.toolbarWidth === "number" ? `${this.app.toolbarWidth}px` : (this.app.toolbarWidth || "240px")

        // Header
        const header = document.createElement("div")
        header.className = "palette-header"

        const handle = document.createElement("div")
        handle.className = "drag-handle"
        handle.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="5" r="1" fill="currentColor"/><circle cx="15" cy="5" r="1" fill="currentColor"/><circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/><circle cx="9" cy="19" r="1" fill="currentColor"/><circle cx="15" cy="19" r="1" fill="currentColor"/></svg>`
        handle.addEventListener('click', (e) => {
            e.stopPropagation()
            // If we actually moved the palette, don't trigger the toggle (close)
            if (this._stampDragMoved) {
                this._stampDragMoved = false
                return
            }
            this.toggleStampPalette()
        })

        // Handle touch events explicitly for the toggle if click is blocked
        handle.addEventListener('touchend', (e) => {
            if (this._stampDragMoved) return // Drag handled it

            // We only trigger toggle on touchend if no drag occurred
            e.preventDefault()
            e.stopPropagation()
            this.toggleStampPalette()
        }, { passive: false })

        // Recent Tools Ribbon (Next to handle)
        const recentRibbon = document.createElement("div")
        recentRibbon.className = "recent-tools-ribbon"

        // 1. PINNED EDIT CATEGORY TOOLS (View, Select, Copy, Eraser)
        const editGroup = this.app.toolsets.find(g => g.name === 'Edit')
        if (editGroup) {
            editGroup.tools.forEach(tool => {
                const btn = document.createElement("button")
                const isSelected = this.app.activeStampType === tool.id
                btn.className = `recent-tool-btn pinned ${isSelected ? "active" : ""}`
                btn.innerHTML = this.getIcon(tool, 30)
                btn.onclick = (e) => {
                    e.stopPropagation()
                    this.app.activeStampType = tool.id
                    this.updateActiveTools()
                    this.app.annotationManager?.interaction?.updateAllOverlaysTouchAction();
                }
                recentRibbon.appendChild(btn)
            })
        }

        // 2. Dynamically tracked recent tools (excluding pinned ones)
        const pinnedIds = editGroup ? editGroup.tools.map(t => t.id) : []
        this.app.recentTools.forEach(toolId => {
            if (pinnedIds.includes(toolId)) return
            const tool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === toolId)
            if (!tool) return
            const btn = document.createElement("button")
            btn.className = `recent-tool-btn ${this.app.activeStampType === toolId ? "active" : ""}`
            btn.innerHTML = this.getIcon(tool, 22)
            btn.onclick = (e) => {
                e.stopPropagation()
                this.app.activeStampType = toolId
                this.updateActiveTools()
                this.app.annotationManager?.interaction?.updateAllOverlaysTouchAction();
            }
            recentRibbon.appendChild(btn)
        })

        this.enableClickToScroll(recentRibbon)

        header.appendChild(handle)
        if (this.app.activeStampType !== "settings" && this.app.activeStampType !== "recycle-bin") {
            header.appendChild(recentRibbon)

            // Add Settings Icon to the Top Right
            const settingsBtn = document.createElement("button")
            settingsBtn.className = "btn-settings-top-right"
            settingsBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
            settingsBtn.title = "Stamp Settings"
            settingsBtn.onclick = (e) => {
                e.stopPropagation()
                this.app.activeStampType = "settings"
                this.updateActiveTools()
            }
            header.appendChild(settingsBtn)
        }
        this.app.activeToolsContainer.appendChild(header)

        // Grid, Recycle Bin or Settings
        if (this.app.activeStampType === "recycle-bin") {
            this.renderRecycleBin()
        } else if (this.app.activeStampType === "settings") {
            this.renderSettingsPanel()
        } else {
            // Color Picker & Tools Grid: Only show these in normal tool selection mode
            this.renderColorPicker()
            this.renderToolsGrid()
        }
        // 3. Category & Control Ribbon (FILTER OUT 'Edit')
        if (this.app.activeStampType !== "settings" && this.app.activeStampType !== "recycle-bin") {
            const ribbon = document.createElement("div")
            ribbon.className = "category-ribbon"
            this.app.toolsets.forEach(group => {
                // SKIP EDIT CATEGORY (Handled in top ribbon)
                if (group.name === 'Edit') return

                const isActive = this.app.activeCategories.includes(group.name)
                const pill = document.createElement("button")
                pill.className = `cat-pill ${isActive ? "active" : ""}`
                pill.textContent = group.name
                
                pill.onclick = (e) => {
                    e.stopPropagation()
                    // Fixed: Single category selection only - no toggle, no multi-select
                    this.app.activeCategories = [group.name]
                    
                    // Automatically switch active layer to match chosen category
                    const targetLayer = this.app.layers.find(l => l.name === group.name || l.type === group.type);
                    if (targetLayer) {
                        this.app.activeLayerId = targetLayer.id;
                        // Fix "Jumping Color": Sync app.activeColor with the layer's own color when switching
                        this.app.activeColor = targetLayer.color;
                    }
                    
                    this.app.saveToStorage()
                    this.updateActiveTools()
                    
                    // Reset scroll position to help consistency
                    const grid = this.app.activeToolsContainer.querySelector('.active-tools-rows')
                    if (grid) grid.scrollLeft = 0
                }
                ribbon.appendChild(pill)
            })
            this.enableClickToScroll(ribbon)
            this.app.activeToolsContainer.appendChild(ribbon)
        }

        // Resize Handle
        const resizer = document.createElement("div")
        resizer.className = "resize-handle"
        resizer.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 15L15 21M21 9L9 21M21 3L3 21"/></svg>`
        this.app.activeToolsContainer.appendChild(resizer)

        // Safety Offset
        setTimeout(() => {
            const rect = this.app.activeToolsContainer.getBoundingClientRect()
            if (rect.top < 20) {
                this.app.activeToolsContainer.style.maxHeight = (window.innerHeight - 80) + "px"
                this.app.activeToolsContainer.style.overflowY = "auto"
            } else {
                this.app.activeToolsContainer.style.maxHeight = "none"
                this.app.activeToolsContainer.style.overflowY = "hidden"
            }
        }, 0)
    }

    renderColorPicker() {
        const ribbon = document.createElement("div")
        ribbon.className = "color-picker-ribbon"

        const colors = [
            { name: 'Red', value: '#be123c' },
            { name: 'Blue', value: '#1d4ed8' },
            { name: 'Green', value: '#15803d' },
            { name: 'Orange', value: '#b45309' },
            { name: 'Purple', value: '#8b5cf6' },
            { name: 'Black', value: '#2d3436' }
        ]

        colors.forEach(color => {
            const swatch = document.createElement("button")
            const isActive = this.app.activeColor === color.value
            swatch.className = `color-swatch ${isActive ? "active" : ""}`
            swatch.style.backgroundColor = color.value
            swatch.title = color.name
            swatch.onclick = (e) => {
                e.stopPropagation()
                this.app.activeColor = color.value
                
                // Persist to active layer so it doesn't "jump" back when returning to this category
                const layer = this.app.layers.find(l => l.id === this.app.activeLayerId)
                if (layer) {
                    layer.color = color.value
                }
                
                this.updateActiveTools()
            }
            ribbon.appendChild(swatch)
        })

        // --- RESET TO DEFAULT BUTTON ---
        const divider = document.createElement("div")
        divider.style.width = "1px"
        divider.style.height = "16px"
        divider.style.background = "var(--border)"
        divider.style.margin = "0 4px"
        ribbon.appendChild(divider)

        const resetBtn = document.createElement("button")
        resetBtn.className = "color-reset-btn"
        resetBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`
        resetBtn.title = "Reset to Category Color"
        resetBtn.onclick = (e) => {
            e.stopPropagation()
            const layer = this.app.layers.find(l => l.id === this.app.activeLayerId)
            if (layer) {
                this.app.activeColor = layer.color
                this.updateActiveTools()
            }
        }
        ribbon.appendChild(resetBtn)

        this.app.activeToolsContainer.appendChild(ribbon)
    }

    renderRecycleBin() {
        const binContainer = document.createElement("div")
        binContainer.className = "recycle-bin-view"
        binContainer.innerHTML = `<div class="bin-header"><h3>Recycle Bin</h3></div>`

        const closeBtn = document.createElement("button")
        closeBtn.className = "bin-close-btn btn btn-primary btn-full mt-10"
        closeBtn.className = "icon-back-top-right"
        closeBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>`
        closeBtn.title = "Back to Tools"
        closeBtn.onclick = () => { this.app.activeStampType = "view"; this.updateActiveTools() }
        binContainer.appendChild(closeBtn)

        if (this.app.recycleItems.length === 0) {
            const empty = document.createElement("div")
            empty.className = "bin-empty"
            empty.textContent = "Bin is empty."
            binContainer.appendChild(empty)
        } else {
            const binGrid = document.createElement("div")
            binGrid.className = "bin-grid"
            this.app.recycleItems.forEach((item, idx) => {
                const slot = document.createElement("div")
                slot.className = "bin-slot"
                slot.innerHTML = `<div class="bin-item-preview">${this.getIcon({ id: item.type, icon: item.icon || "" }, 30)}</div><span class="bin-item-label">${item.label || item.type}</span>`
                slot.onclick = () => {
                    this.app.activeStampType = item.type
                    this.app.recycleItems.splice(idx, 1)
                    this.updateActiveTools()
                }
                binGrid.appendChild(slot)
            })
            binContainer.appendChild(binGrid)
        }
        this.app.activeToolsContainer.appendChild(binContainer)
    }

    renderToolsGrid() {
        const container = document.createElement("div")
        container.className = "active-tools-rows"

        this.app.activeCategories.forEach((catName, index) => {
            const group = this.app.toolsets.find(g => g.name === catName)
            if (!group) return

            if (index > 0) {
                const divider = document.createElement("div")
                divider.className = "tool-row-divider"
                container.appendChild(divider)
            }

            // --- Determine the display color for this row ---
            // 為每個工具列計算動態顏色。如果是當前活耀類別，使用 app.activeColor；否則使用該類別（圖層）的原始設定顏色。
            const layer = this.app.layers.find(l => l.name === group.name || l.type === group.type)
            const isActiveRow = layer && layer.id === this.app.activeLayerId
            const rowColor = isActiveRow ? this.app.activeColor : (layer ? layer.color : 'currentColor')

            const row = document.createElement("div")
            row.className = "active-tools-row"

            // SPECIAL HANDLING: TEXT CATEGORY
            if (catName === 'Text') {
                const r1 = document.createElement("div")
                r1.className = "tools-row text-cloud-row row-1"
                const r2 = document.createElement("div")
                r2.className = "tools-row text-cloud-row row-2"
                const r3 = document.createElement("div")
                r3.className = "tools-row text-cloud-row row-3"

                // 1. Sort Default Tools into Rows
                group.tools.forEach(tool => {
                    const btn = document.createElement("button")
                    const isSelected = this.app.activeStampType === tool.id
                    btn.className = `text-tool-pill ${isSelected ? "active" : ""}`
                    const hasIcon = tool.icon && tool.icon.includes('<path')
                    btn.innerHTML = hasIcon ? this.getIcon(tool, 20) : (tool.icon || tool.label)
                    btn.style.color = isSelected ? '#ffffff' : rowColor
                    
                    // Apply font styling from tool definition if available
                    if (tool.draw && tool.draw.type === 'text') {
                        const hasCJK = /[\u4e00-\u9fa5]/.test(tool.label || '')
                        if (tool.draw.font) {
                            if (tool.draw.font.includes('italic') && !hasCJK) btn.style.fontStyle = 'italic';
                            else btn.style.fontStyle = 'normal';

                            // Extract numeric weight if present
                            const weightMatch = tool.draw.font.match(/\d+/);
                            if (weightMatch) btn.style.fontWeight = weightMatch[0];
                        }
                        if (tool.draw.fontFace) btn.style.fontFamily = tool.draw.fontFace;
                        if (tool.draw.weight) btn.style.fontWeight = tool.draw.weight;
                        
                        // Scale down CJK labels slightly on buttons too
                        if (hasCJK) btn.style.fontSize = '12px';
                    }
                    
                    btn.onclick = (e) => {
                        e.stopPropagation()
                        this.app.activeStampType = tool.id
                        this.app.lastUsedToolPerCategory[catName] = tool.id
                        this.updateActiveTools()
                        // Immediate sync for touch-action lock
                        this.app.annotationManager?.interaction?.updateAllOverlaysTouchAction();
                    }
                    if (tool.row === 1) {
                        r1.appendChild(btn)
                    } else {
                        r2.appendChild(btn)
                    }
                })

                // 2. Render User Custom Library (Now on Row 3)
                this.app.userTextLibrary.forEach((text, idx) => {
                    const btn = document.createElement("button")
                    const isSelected = this.app.activeStampType === `custom-text-${idx}`
                    btn.className = `text-tool-pill user-custom ${isSelected ? "active" : ""}`
                    btn.style.color = isSelected ? '#ffffff' : rowColor
                    
                    const hasCJK = /[\u4e00-\u9fa5]/.test(text || '')
                    if (hasCJK) {
                        btn.style.fontStyle = 'normal';
                        btn.style.fontSize = '12px';
                    } else {
                        btn.style.fontStyle = 'italic';
                    }

                    btn.innerHTML = `
                        <span class="text-label">${text}</span>
                        <span class="delete-text">&times;</span>
                    `

                    btn.onclick = (e) => {
                        e.stopPropagation()
                        if (e.target.classList.contains('delete-text')) {
                            this.app.userTextLibrary.splice(idx, 1)
                            this.app.saveToStorage()
                            this.updateActiveTools()
                            return
                        }
                        this.app.activeStampType = `custom-text-${idx}`
                        this.app._activeCustomText = text
                        this.updateActiveTools()
                    }
                    r3.appendChild(btn)
                })

                // 3. Render "Add New" Input (Appended to Row 3)
                const addWrapper = document.createElement("div")
                addWrapper.className = "add-text-wrapper"
                addWrapper.innerHTML = `
                    <input type="text" placeholder="New..." class="add-text-input" />
                    <button class="add-text-btn" style="background:${rowColor}">+</button>
                `
                const input = addWrapper.querySelector('input')
                const btn = addWrapper.querySelector('button')

                const commit = () => {
                    const val = input.value.trim()
                    if (val) {
                        if (!this.app.userTextLibrary.includes(val)) {
                            this.app.userTextLibrary.push(val)
                            if (this.app.profileManager?.data) this.app.profileManager.data.updatedAt = Date.now()
                            this.app.saveToStorage()
                        }
                        const idx = this.app.userTextLibrary.indexOf(val)
                        this.app.activeStampType = `custom-text-${idx}`
                        this.app._activeCustomText = val
                        input.value = ''
                        this.updateActiveTools()
                    }
                }
                btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); input.focus() })
                btn.onclick = (e) => { e.stopPropagation(); commit() }
                input.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); commit() } }
                input.onclick = (e) => e.stopPropagation()
                r3.appendChild(addWrapper)
                
                // Append directly to container for cleaner column stacking
                if (r1.children.length > 0) {
                    container.appendChild(r1)
                    this.enableClickToScroll(r1)
                }
                if (r2.children.length > 0) {
                    container.appendChild(r2)
                    this.enableClickToScroll(r2)
                }
                if (r3.children.length > 0) {
                    container.appendChild(r3)
                    this.enableClickToScroll(r3)
                }
            } else {
                // NORMAL TOOL GRID RENDERING: Grouped by Row (Flex Row Layout)
                const r1 = document.createElement("div")
                r1.className = "tools-row"
                const r2 = document.createElement("div")
                r2.className = "tools-row"

                group.tools.forEach(tool => {
                    const btn = document.createElement("button")
                    const isSelected = this.app.activeStampType === tool.id
                    btn.className = `stamp-tool ${isSelected ? "active" : ""}`
                    
                    btn.innerHTML = this.getIcon(tool, 28, isSelected ? '#ffffff' : rowColor)
                    
                    btn.onclick = (e) => {
                        e.stopPropagation()
                        if (tool.id === 'erase-all') {
                            this.app.annotationManager.showEraseAllModal()
                            return
                        }
                        if (tool.id === 'music-anchor') {
                            this.app.playbackManager.toggle()
                            return
                        }
                        this.app.activeStampType = tool.id
                        this.app.lastUsedToolPerCategory[catName] = tool.id

                        if (tool.id !== 'view' && tool.id !== 'select' && tool.id !== 'eraser') {
                            this.app.recentTools = [tool.id, ...this.app.recentTools.filter(id => id !== tool.id)].slice(0, 5)
                        }
                        this.updateActiveTools()
                    }
                    
                    // Distribute to row 1 or 2 based on tool.row property
                    if (tool.row === 1) r1.appendChild(btn)
                    else r2.appendChild(btn)
                })

                if (r1.children.length > 0) row.appendChild(r1)
                if (r2.children.length > 0) row.appendChild(r2)
                container.appendChild(row)
            }
        })
        this.app.activeToolsContainer.appendChild(container)
    }

    renderSettingsPanel() {
        const systemCount = this.app.stamps.filter(s => s.type === 'system' && !s.deleted).length
        const statusText = systemCount > 0 ? `已偵測 ${systemCount} 個 System` : '尚未偵測'

        const panel = document.createElement("div")
        panel.className = "palette-settings-panel"
        panel.innerHTML = `
            <div class="settings-header">
                <h3>Stamp Settings</h3>
                <button class="icon-back-top-right" id="btn-settings-back" title="Back to Tools">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
                </button>
            </div>
            <div class="settings-vtab-layout">
                <nav class="settings-vtab-nav">
                    <button class="settings-vtab-btn" data-tab="display">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg>
                        <span>Size</span>
                    </button>
                    <button class="settings-vtab-btn" data-tab="touch">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 11V6a2 2 0 0 0-2-2 2 2 0 0 0-2 2v0a2 2 0 0 0-2-2 2 2 0 0 0-2 2v3"></path><path d="M14 11a2 2 0 0 1 4 0v2a6 6 0 1 1-12 0V7a2 2 0 0 1 2-2 2 2 0 0 1 2 2v4"></path></svg>
                        <span>Touch</span>
                    </button>
                    <button class="settings-vtab-btn" data-tab="layers">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
                        <span>Categ.</span>
                    </button>
                    <button class="settings-vtab-btn" data-tab="more">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"></path></svg>
                        <span>More</span>
                    </button>
                </nav>
                <div class="settings-vtab-content">

                    <div class="vtab-pane" data-pane="display">
                        <div class="setting-item mb-15">
                            <div class="setting-row-compact">
                                <label class="setting-label">Scale</label>
                                <div class="slider-container">
                                    <button class="slider-adj-btn minus" id="btn-scale-minus">−</button>
                                    <input type="range" class="setting-slider" id="slider-score-scale" min="0.5" max="3.0" step="0.1" value="${this.app.scoreStampScale || 1.0}" />
                                    <button class="slider-adj-btn plus" id="btn-scale-plus">+</button>
                                </div>
                                <span id="val-score-scale" class="badge">${(this.app.scoreStampScale || 1.0).toFixed(1)}x</span>
                                <button class="btn-reset-mini" id="btn-scale-reset">Reset</button>
                            </div>
                            <p class="setting-hint">Applies only to this specific score.</p>
                        </div>
                        <div class="setting-item">
                            <div class="setting-row-compact">
                                <label class="setting-label">Font Size</label>
                                <div class="slider-container">
                                    <button class="slider-adj-btn minus" id="btn-font-minus">−</button>
                                    <input type="range" class="setting-slider" id="slider-font-size" min="16" max="32" step="1" value="${this.app.defaultFontSize}" />
                                    <button class="slider-adj-btn plus" id="btn-font-plus">+</button>
                                </div>
                                <span id="val-font-size" class="badge">${this.app.defaultFontSize}px</span>
                                <button class="btn-reset-mini" id="btn-font-reset">Reset</button>
                            </div>
                            <p class="setting-hint">Markings and text.</p>
                        </div>
                        <div class="setting-item">
                            <div class="setting-row-compact">
                                <label class="setting-label">Cloak Badge</label>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="chk-cloak-badge" ${this.app.showCloakBadge !== false ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <p class="setting-hint">在斗篷標記右上角顯示彩色圓點。</p>
                        </div>
                    </div>

                    <div class="vtab-pane" data-pane="touch">
                        <div class="setting-item mb-15">
                            <div class="setting-row-compact">
                                <label class="setting-label">Offset Y</label>
                                <div class="slider-container">
                                    <button class="slider-adj-btn minus" id="btn-offset-minus">−</button>
                                    <input type="range" class="setting-slider" id="settings-offset-touch" min="0" max="150" step="5" value="${this.app.stampOffsetTouchY}" />
                                    <button class="slider-adj-btn plus" id="btn-offset-plus">+</button>
                                </div>
                                <span id="settings-offset-touch-value" class="badge">${this.app.stampOffsetTouchY}px</span>
                                <button class="btn-reset-mini" id="btn-offset-reset">Reset</button>
                            </div>
                            <p class="setting-hint">Up/Down distance.</p>
                        </div>
                        <div class="setting-item">
                            <div class="setting-row-compact">
                                <label class="setting-label">Offset X</label>
                                <div class="slider-container">
                                    <button class="slider-adj-btn minus" id="btn-offset-x-minus">−</button>
                                    <input type="range" class="setting-slider" id="settings-offset-touch-x" min="-150" max="150" step="5" value="${this.app.stampOffsetTouchX}" />
                                    <button class="slider-adj-btn plus" id="btn-offset-x-plus">+</button>
                                </div>
                                <span id="settings-offset-touch-x-value" class="badge">${this.app.stampOffsetTouchX}px</span>
                                <button class="btn-reset-mini" id="btn-offset-x-reset">Reset</button>
                            </div>
                            <p class="setting-hint">Left/Right distance.</p>
                        </div>
                    </div>

                    <div class="vtab-pane" data-pane="layers">
                        <div class="setting-item">
                            <div class="setting-label flex-space-between">
                                <span>Notation Categories</span>
                                <button id="btn-erase-all-mini" class="btn-text-danger" title="Erase All Objects">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    Erase All
                                </button>
                            </div>
                            <div id="settings-layer-list" class="layer-list-mini mt-10"></div>
                        </div>
                    </div>

                    <div class="vtab-pane" data-pane="more">
                        <div class="setting-item mb-15">
                            <div class="setting-row-compact">
                                <label class="setting-label">頁面重疊</label>
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <button class="slider-adj-btn minus" id="btn-overlap-minus">−</button>
                                    <span id="val-overlap" class="badge" style="min-width:26px;text-align:center">${this.app.systemJumpOverlap ?? 1}</span>
                                    <button class="slider-adj-btn plus" id="btn-overlap-plus">+</button>
                                </div>
                            </div>
                            <p class="setting-hint">Jump 時，以倒數第 N 個 System 為起點。</p>
                        </div>
                        <div class="setting-divider"></div>
                        <div class="setting-item mb-15" style="margin-top:10px">
                            <div class="setting-label flex-space-between">
                                <span>System Detection</span>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="chk-show-systems" ${this.app.showSystemStamps ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <p class="setting-hint">自動偵測五線譜行位置，用於 Jump 導航。</p>
                            <div style="display:flex;gap:8px;margin-top:10px">
                                <button id="btn-detect-systems" class="btn btn-secondary" style="flex:1">Detect</button>
                                <button id="btn-clear-systems" class="btn btn-secondary" style="flex:1;color:#f66">刪除全部</button>
                            </div>
                            <p id="system-detect-status" class="setting-hint" style="margin-top:6px">${statusText}</p>
                        </div>
                        <div class="setting-divider"></div>
                        <div class="setting-item mb-15" style="margin-top:10px">
                            <div class="setting-label" style="margin-bottom:10px">斗篷標籤（Cloak Labels）</div>
                            ${[
                                { id: 'black', label: '黑色斗篷', color: '#374151' },
                                { id: 'red',   label: '紅色斗篷', color: '#dc2626' },
                                { id: 'blue',  label: '藍色斗篷', color: '#2563eb' },
                            ].map(c => `
                            <div class="setting-row-compact" style="margin-bottom:8px">
                                <div style="display:flex;align-items:center;gap:8px">
                                    <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color}"></span>
                                    <span class="setting-label" style="margin:0">${c.label}</span>
                                </div>
                                <label class="toggle-switch">
                                    <input type="checkbox" class="chk-cloak" data-cloak="${c.id}" ${this.app.cloakVisible?.[c.id] !== false ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>`).join('')}
                            <p class="setting-hint">隱藏時，對應斗篷的標記不顯示（資料保留）。</p>
                        </div>
                        <div class="setting-divider"></div>
                        <div class="setting-item mb-15" style="margin-top:10px">
                            <div class="setting-label flex-space-between">
                                <span>兩指捲動（⚠️ 實驗性）</span>
                                <label class="toggle-switch">
                                    <input type="checkbox" id="chk-two-finger-pan" ${this.app.twoFingerPanEnabled ? 'checked' : ''}>
                                    <span class="toggle-slider"></span>
                                </label>
                            </div>
                            <p class="setting-hint">在標記模式下，用兩根手指拖曳捲動 PDF。已知限制：兩指跨頁時可能失效。</p>
                        </div>
                    </div>

                </div>
            </div>
        `

        const sliderScore = panel.querySelector('#slider-score-scale')
        const valScore = panel.querySelector('#val-score-scale')
        const sliderFont = panel.querySelector('#slider-font-size')
        const valFont = panel.querySelector('#val-font-size')
        const btnBack = panel.querySelector('#btn-settings-back')
        const btnEraseAll = panel.querySelector('#btn-erase-all-mini')

        const btnScaleReset = panel.querySelector('#btn-scale-reset')
        const btnFontReset = panel.querySelector('#btn-font-reset')
        const btnOffsetReset = panel.querySelector('#btn-offset-reset')
        const btnOffsetXReset = panel.querySelector('#btn-offset-x-reset')

        const sliderOffset = panel.querySelector('#settings-offset-touch')
        const valOffset = panel.querySelector('#settings-offset-touch-value')
        const sliderOffsetX = panel.querySelector('#settings-offset-touch-x')
        const valOffsetX = panel.querySelector('#settings-offset-touch-x-value')

        const updateScore = (val) => {
            const num = Math.max(0.5, Math.min(3.0, parseFloat(val)))
            sliderScore.value = num
            valScore.textContent = `${num.toFixed(1)}x`
            this.app.updateScoreStampScale(num)
            const percentage = ((num - 0.5) / (3.0 - 0.5)) * 100
            sliderScore.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, rgba(0,0,0,0.1) ${percentage}%)`
        }

        const updateFont = (val) => {
            const num = Math.max(16, Math.min(32, parseInt(val)))
            sliderFont.value = num
            valFont.textContent = `${num}px`
            this.app.defaultFontSize = num
            this.app.saveToStorage()
            const percentage = ((num - 16) / (32 - 16)) * 100
            sliderFont.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, rgba(0,0,0,0.1) ${percentage}%)`
            if (this.app.redrawAllAnnotationLayers) this.app.redrawAllAnnotationLayers()
        }

        const updateOffset = (val) => {
            const num = Math.max(0, Math.min(150, parseInt(val)))
            sliderOffset.value = num
            valOffset.textContent = `${num}px`
            this.app.stampOffsetTouchY = num
            this.app.saveToStorage()
            const percentage = (num / 150) * 100
            sliderOffset.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, rgba(0,0,0,0.1) ${percentage}%)`
        }

        const updateOffsetX = (val) => {
            const num = Math.max(-150, Math.min(150, parseInt(val)))
            sliderOffsetX.value = num
            valOffsetX.textContent = `${num}px`
            this.app.stampOffsetTouchX = num
            this.app.saveToStorage()
            const percentage = ((num + 150) / 300) * 100
            sliderOffsetX.style.background = `linear-gradient(to right, var(--primary) ${percentage}%, rgba(0,0,0,0.1) ${percentage}%)`
        }

        sliderScore.oninput = (e) => updateScore(e.target.value)
        sliderFont.oninput = (e) => updateFont(e.target.value)
        sliderOffset.oninput = (e) => updateOffset(e.target.value)
        sliderOffsetX.oninput = (e) => updateOffsetX(e.target.value)

        btnScaleReset.onclick = () => updateScore(1.0)
        btnFontReset.onclick = () => updateFont(20)
        btnOffsetReset.onclick = () => updateOffset(50)
        btnOffsetXReset.onclick = () => updateOffsetX(-30)

        // General Slider Adjustment Buttons
        panel.querySelectorAll('.slider-adj-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation()
                const isPlus = btn.classList.contains('plus')
                const isScale = btn.id.includes('scale')
                const isFont = btn.id.includes('font')
                const isOffsetX = btn.id.includes('offset-x')
                const slider = isScale ? sliderScore : (isFont ? sliderFont : (isOffsetX ? sliderOffsetX : sliderOffset))
                const step = parseFloat(slider.step) || 1
                const current = parseFloat(slider.value)
                const next = isPlus ? (current + step) : (current - step)
                if (isScale) updateScore(next)
                else if (isFont) updateFont(next)
                else if (isOffsetX) updateOffsetX(next)
                else updateOffset(next)
            }
        })

        btnEraseAll.addEventListener('click', (e) => {
            e.stopPropagation()
            this.app.annotationManager.showEraseAllModal()
        })
        btnEraseAll.addEventListener('touchstart', (e) => {
            e.stopPropagation()
        }, { passive: true })

        btnBack.onclick = (e) => {
            e.stopPropagation()
            this.app.activeStampType = "view"
            this.updateActiveTools()
            this.app.annotationManager?.interaction?.updateAllOverlaysTouchAction();
        }

        // Vertical tab switching
        const vtabBtns = panel.querySelectorAll('.settings-vtab-btn')
        const vtabPanes = panel.querySelectorAll('.vtab-pane')
        const switchTab = (tabId) => {
            this._settingsTab = tabId
            vtabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId))
            vtabPanes.forEach(p => { p.style.display = p.dataset.pane === tabId ? '' : 'none' })
        }
        vtabBtns.forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)))
        switchTab(this._settingsTab || 'display')

        this.app.activeToolsContainer.appendChild(panel)

        // Initial track colors (all panes initialized so sliders work immediately on tab switch)
        updateScore(this.app.scoreStampScale || 1.0)
        updateFont(this.app.defaultFontSize)
        updateOffset(this.app.stampOffsetTouchY)
        updateOffsetX(this.app.stampOffsetTouchX)

        // Render the layer list into the new container
        this.app.externalLayerList = panel.querySelector('#settings-layer-list')
        if (this.app.layerManager) this.app.layerManager.renderLayerUI()

        // Overlap stepper
        const updateOverlap = (val) => {
            const num = Math.max(1, Math.min(8, Math.round(val)))
            this.app.systemJumpOverlap = num
            localStorage.setItem('scoreflow_system_jump_overlap', num)
            panel.querySelector('#val-overlap').textContent = num
        }
        panel.querySelector('#btn-overlap-minus')?.addEventListener('click', () => updateOverlap((this.app.systemJumpOverlap ?? 1) - 1))
        panel.querySelector('#btn-overlap-plus')?.addEventListener('click', () => updateOverlap((this.app.systemJumpOverlap ?? 1) + 1))

        // System Detection events
        panel.querySelector('#chk-show-systems')?.addEventListener('change', e => {
            this.app.showSystemStamps = e.target.checked
            localStorage.setItem('scoreflow_show_systems', e.target.checked)
            this.app.updateRulerMarks()
        })

        panel.querySelector('#btn-detect-systems')?.addEventListener('click', async () => {
            this.app.stamps = this.app.stamps.filter(s => !(s.type === 'system' && s.auto))
            const statusEl = panel.querySelector('#system-detect-status')
            if (statusEl) statusEl.textContent = '偵測中...'
            await this.app.staffDetector?.autoDetect(this.app.viewerManager.pdf, (p, total) => {
                if (statusEl) statusEl.textContent = `偵測中... ${p} / ${total}`
            })
            const count = this.app.stamps.filter(s => s.type === 'system' && !s.deleted).length
            if (statusEl) statusEl.textContent = `已偵測 ${count} 個 System`
        })

        panel.querySelector('#btn-clear-systems')?.addEventListener('click', () => {
            this.app.stamps = this.app.stamps.filter(s => s.type !== 'system')
            this.app.saveToStorage(true)
            this.app.updateRulerMarks()
            this.app.activeStampType = 'settings'
            this.updateActiveTools()
        })

        // Two-finger pan toggle
        panel.querySelector('#chk-two-finger-pan')?.addEventListener('change', e => {
            this.app.twoFingerPanEnabled = e.target.checked
            localStorage.setItem('scoreflow_two_finger_pan', e.target.checked)
        })

        // Cloak Badge toggle
        panel.querySelector('#chk-cloak-badge')?.addEventListener('change', e => {
            this.app.showCloakBadge = e.target.checked
            localStorage.setItem('scoreflow_show_cloak_badge', e.target.checked)
            this.app.redrawAllAnnotationLayers()
        })

        // Cloak Labels toggles
        panel.querySelectorAll('.chk-cloak').forEach(chk => {
            chk.addEventListener('change', e => {
                const cloakId = e.target.dataset.cloak
                this.app.cloakVisible[cloakId] = e.target.checked
                localStorage.setItem(`scoreflow_cloak_visible_${cloakId}`, e.target.checked)
                this.app.redrawAllAnnotationLayers()
            })
        })
    }
}
