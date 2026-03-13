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
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke="${strokeColor}" stroke-width="1.3" fill="none">${tool.icon}</svg>`
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
        el.addEventListener("mouseup", handleMouseUp)
        el.addEventListener("touchend", handleMouseUp)
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
                if (!isInteractive && el.style.overflowY !== 'auto') {
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
            
            this.app.redrawAllAnnotationLayers();
        }

        // Sync Doc Bar
        if (this.app.btnModeHand) this.app.btnModeHand.classList.toggle('active', this.app.activeStampType === 'view')
        if (this.app.btnModeEraser) this.app.btnModeEraser.classList.toggle('active', this.app.activeStampType === 'eraser')

        const activeTool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === this.app.activeStampType)
        if (this.app.btnStampPalette) {
            this.app.btnStampPalette.classList.toggle('active', isExpanded || !!activeTool)
            if (!this._stampBtnDefault) this._stampBtnDefault = this.app.btnStampPalette.innerHTML
            this.app.btnStampPalette.innerHTML = activeTool
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

        // 1. Permanently Pinned PAN VIEW & SELECT tools
        const viewTool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === 'view')
        const selectTool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === 'select')

        if (viewTool) {
            const btn = document.createElement("button")
            btn.className = `recent-tool-btn pinned ${this.app.activeStampType === 'view' ? "active" : ""}`
            btn.innerHTML = this.getIcon(viewTool, 22)
            btn.title = "Pan View (Space/H)"
            btn.onclick = (e) => {
                e.stopPropagation()
                this.app.activeStampType = 'view'
                this.updateActiveTools()
            }
            recentRibbon.appendChild(btn)
        }

        if (selectTool) {
            const btn = document.createElement("button")
            btn.className = `recent-tool-btn pinned ${this.app.activeStampType === 'select' ? "active" : ""}`
            btn.innerHTML = this.getIcon(selectTool, 22)
            btn.title = "Select (V)"
            btn.onclick = (e) => {
                e.stopPropagation()
                this.app.activeStampType = 'select'
                this.updateActiveTools()
            }
            recentRibbon.appendChild(btn)
        }

        // 2. Dynamically tracked recent tools (excluding view and select)
        this.app.recentTools.forEach(toolId => {
            if (toolId === 'view' || toolId === 'select') return // Skip since they are pinned
            const tool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === toolId)
            if (!tool) return
            const btn = document.createElement("button")
            btn.className = `recent-tool-btn ${this.app.activeStampType === toolId ? "active" : ""}`
            btn.innerHTML = this.getIcon(tool, 22)
            btn.onclick = (e) => {
                e.stopPropagation()
                this.app.activeStampType = toolId
                this.updateActiveTools()
            }
            recentRibbon.appendChild(btn)
        })

        header.appendChild(handle)
        header.appendChild(recentRibbon)
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
        // 3. Category & Control Ribbon (Now at the BOTTOM - Hide if in Settings/Recycle Bin)
        if (this.app.activeStampType !== "settings" && this.app.activeStampType !== "recycle-bin") {
            const ribbon = document.createElement("div")
            ribbon.className = "category-ribbon"
            this.app.toolsets.forEach(group => {
                const isActive = this.app.activeCategories.includes(group.name)
                const pill = document.createElement("button")
                pill.className = `cat-pill ${isActive ? "active" : ""}`
                pill.textContent = group.name
                pill.onclick = (e) => {
                    e.stopPropagation()
                    if (isActive) {
                        // Don't allow deselecting if it's the only one
                        if (this.app.activeCategories.length > 1) {
                            this.app.activeCategories = this.app.activeCategories.filter(c => c !== group.name)
                        }
                    } else {
                        // Limit to 2 categories: Remove oldest (first) and add new one
                        if (this.app.activeCategories.length >= 2) {
                            this.app.activeCategories.shift()
                        }
                        this.app.activeCategories.push(group.name)
                    }
                    this.app.saveToStorage()
                    this.updateActiveTools()
                }
                ribbon.appendChild(pill)
            })

            // Settings Tab Button
            const settingsBtn = document.createElement("button")
            const isSettings = this.app.activeStampType === "settings"
            settingsBtn.className = `cat-pill cat-settings ${isSettings ? "active" : ""}`
            settingsBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
            settingsBtn.title = "Stamp Settings"
            settingsBtn.onclick = (e) => {
                e.stopPropagation()
                this.app.activeStampType = "settings"
                this.updateActiveTools()
            }
            ribbon.appendChild(settingsBtn)
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
            { name: 'Red', value: '#ff4757' },
            { name: 'Blue', value: '#3b82f6' },
            { name: 'Green', value: '#10b981' },
            { name: 'Orange', value: '#f59e0b' },
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
        closeBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="icon-mr-6">
                <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            Back to Tools
        `
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
                row.classList.add('text-cloud-row')

                // 1. Render Default Tools (f, p, rit, etc.)
                group.tools.forEach(tool => {
                    const pill = document.createElement("button")
                    pill.className = `text-tool-pill ${this.app.activeStampType === tool.id ? "active" : ""}`
                    pill.textContent = tool.label
                    pill.style.color = rowColor // 使用動態顏色
                    pill.onclick = (e) => {
                        e.stopPropagation()
                        this.app.activeStampType = tool.id
                        this.app.lastUsedToolPerCategory[catName] = tool.id
                        this.updateActiveTools()
                    }
                    row.appendChild(pill)
                })

                // 2. Render User Custom Library
                this.app.userTextLibrary.forEach((text, idx) => {
                    const pill = document.createElement("button")
                    const isSelected = this.app.activeStampType === `custom-text-${idx}`
                    pill.className = `text-tool-pill user-custom ${isSelected ? "active" : ""}`
                    pill.innerHTML = `${text}<span class="delete-text">&times;</span>`

                    pill.onclick = (e) => {
                        e.stopPropagation()
                        if (e.target.classList.contains('delete-text')) {
                            this.app.userTextLibrary.splice(idx, 1)
                            this.app.saveToStorage()
                            this.updateActiveTools()
                            return
                        }
                        // Create a temporary tool object for this custom text
                        this.app.activeStampType = `custom-text-${idx}`
                        this.app._activeCustomText = text // Internal ref for renderer
                        this.updateActiveTools()
                    }
                    pill.style.color = rowColor // 使用動態顏色
                    row.appendChild(pill)
                })

                // 3. Render "Add New" Input
                const addWrapper = document.createElement("div")
                addWrapper.className = "add-text-wrapper"
                addWrapper.innerHTML = `
                    <input type="text" placeholder="Add term..." class="add-text-input" />
                    <button class="add-text-btn">+</button>
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

                        // Select the term (either existing or newly added)
                        const idx = this.app.userTextLibrary.indexOf(val)
                        this.app.activeStampType = `custom-text-${idx}`
                        this.app._activeCustomText = val

                        input.value = ''
                        this.updateActiveTools()
                    }
                }

                btn.onclick = (e) => { e.stopPropagation(); commit() }
                input.onkeydown = (e) => { if (e.key === 'Enter') { e.stopPropagation(); commit() } }
                input.onclick = (e) => e.stopPropagation()

                row.appendChild(addWrapper)
            } else {
                // NORMAL TOOL GRID RENDERING
                group.tools.forEach(tool => {
                    const wrapper = document.createElement("div")
                    wrapper.className = "stamp-tool-wrapper"
                    const btn = document.createElement("button")
                    btn.className = `stamp-tool ${this.app.activeStampType === tool.id ? "active" : ""}`
                    btn.title = tool.label
                    btn.dataset.tooltip = tool.label
                    btn.innerHTML = this.getIcon(tool, 28, rowColor)
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

                        // Update Recent Tools History
                        if (tool.id !== 'view' && tool.id !== 'select' && tool.id !== 'eraser') {
                            this.app.recentTools = [tool.id, ...this.app.recentTools.filter(id => id !== tool.id)].slice(0, 5)
                        }

                        this.updateActiveTools()
                    }
                    wrapper.appendChild(btn)
                    row.appendChild(wrapper)
                })
            }
            container.appendChild(row)
        })
        this.app.activeToolsContainer.appendChild(container)
    }

    renderSettingsPanel() {
        const panel = document.createElement("div")
        panel.className = "palette-settings-panel"
        panel.innerHTML = `
            <div class="settings-header">
                <h3>Stamp Settings</h3>
            </div>
            <div class="settings-content">
                <div class="setting-item">
                    <div class="setting-label">
                        <span>Score Scale (Current)</span>
                        <span class="setting-value" id="val-score-scale">${(this.app.scoreStampScale || 1.0).toFixed(1)}x</span>
                    </div>
                    <div class="slider-control-row">
                        <button class="slider-adjust-btn" id="btn-scale-minus">−</button>
                        <input type="range" class="setting-slider" id="slider-score-scale" min="0.5" max="3.0" step="0.1" value="${this.app.scoreStampScale || 1.0}" />
                        <button class="slider-adjust-btn" id="btn-scale-plus">+</button>
                    </div>
                    <p class="setting-hint">Applies only to this specific score.</p>
                </div>

                <div class="setting-item">
                    <div class="setting-label">
                        <span>Default Font Size</span>
                        <span class="setting-value" id="val-font-size">${this.app.defaultFontSize}px</span>
                    </div>
                    <div class="slider-control-row">
                        <button class="slider-adjust-btn" id="btn-font-minus">−</button>
                        <input type="range" class="setting-slider" id="slider-font-size" min="16" max="32" step="1" value="${this.app.defaultFontSize}" />
                        <button class="slider-adjust-btn" id="btn-font-plus">+</button>
                    </div>
                    <p class="setting-hint">Adjustment for dynamic markings and text.</p>
                </div>

                <div class="setting-divider"></div>

                <div class="setting-item">
                    <div class="setting-label flex-space-between">
                        <span>Notation Categories</span>
                        <div class="flex-row-center gap-10">
                            <button id="btn-erase-all-mini" class="btn-text-danger" title="Erase by Category">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                Erase
                            </button>
                            <button id="btn-reset-layers-mini" class="btn-text-primary" title="Reset to Defaults">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path></svg>
                                Reset
                            </button>
                        </div>
                    </div>
                    <div id="settings-layer-list" class="layer-list-mini mt-10"></div>
                </div>

                <button class="btn btn-primary btn-full mt-20" id="btn-settings-back">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="icon-mr-6">
                        <polyline points="15 18 9 12 15 6"></polyline>
                    </svg>
                    Back to Tools
                </button>
            </div>
        `

        const sliderScore = panel.querySelector('#slider-score-scale')
        const valScore = panel.querySelector('#val-score-scale')
        const sliderFont = panel.querySelector('#slider-font-size')
        const valFont = panel.querySelector('#val-font-size')
        const btnBack = panel.querySelector('#btn-settings-back')
        const btnResetLayers = panel.querySelector('#btn-reset-layers-mini')
        const btnEraseAll = panel.querySelector('#btn-erase-all-mini')

        // Micromanagement Buttons
        const btnScaleMinus = panel.querySelector('#btn-scale-minus')
        const btnScalePlus = panel.querySelector('#btn-scale-plus')
        const btnFontMinus = panel.querySelector('#btn-font-minus')
        const btnFontPlus = panel.querySelector('#btn-font-plus')

        const updateScore = (val) => {
            const num = Math.max(0.5, Math.min(3.0, parseFloat(val)))
            sliderScore.value = num
            valScore.textContent = `${num.toFixed(1)}x`
            this.app.updateScoreStampScale(num)
        }

        const updateFont = (val) => {
            const num = Math.max(16, Math.min(32, parseInt(val)))
            sliderFont.value = num
            valFont.textContent = `${num}px`
            this.app.defaultFontSize = num
            this.app.saveToStorage()

            // Also update any active floating text editor
            document.querySelectorAll('.floating-text-editor').forEach(el => {
                el.style.fontSize = `${num}px`
            })
            this.app.redrawAllAnnotationLayers()
        }

        sliderScore.oninput = (e) => updateScore(e.target.value)
        sliderFont.oninput = (e) => updateFont(e.target.value)

        btnScaleMinus.onclick = (e) => { e.stopPropagation(); updateScore(parseFloat(sliderScore.value) - 0.1) }
        btnScalePlus.onclick = (e) => { e.stopPropagation(); updateScore(parseFloat(sliderScore.value) + 0.1) }
        btnFontMinus.onclick = (e) => { e.stopPropagation(); updateFont(parseInt(sliderFont.value) - 1) }
        btnFontPlus.onclick = (e) => { e.stopPropagation(); updateFont(parseInt(sliderFont.value) + 1) }

        btnResetLayers.addEventListener('click', (e) => {
            e.stopPropagation()
            this.app.layerManager.resetLayers()
        })
        btnResetLayers.addEventListener('touchstart', (e) => {
            e.stopPropagation()
        }, { passive: true })

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
        }

        this.app.activeToolsContainer.appendChild(panel)

        // Render the layer list into the new container
        this.app.externalLayerList = panel.querySelector('#settings-layer-list')
        if (this.app.layerManager) this.app.layerManager.renderLayerUI()
    }
}
