export class ToolManager {
    constructor(app) {
        this.app = app
        this._stampBtnDefault = null
        this._lastPaletteToggleTime = 0
        this._stampDragMoved = false
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

    getIcon(tool, size = 24) {
        if (this.app._svgCache?.[tool.id]) {
            // Strip existing width/height and inject the correct size
            return this.app._svgCache[tool.id].replace(/<svg\b([^>]*)>/, (_, attrs) => {
                const a = attrs.replace(/\s+width="[^"]*"/, '').replace(/\s+height="[^"]*"/, '')
                return `<svg${a} width="${size}" height="${size}">`
            })
        }
        return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" stroke="currentColor" stroke-width="1.3" fill="none">${tool.icon}</svg>`
    }

    toggleStampPalette(x = null, y = null) {
        // Debounce to prevent multiple fires from ghost clicks (iPad)
        const now = Date.now()
        if (this._lastPaletteToggleTime && (now - this._lastPaletteToggleTime < 250)) {
            return
        }
        this._lastPaletteToggleTime = now

        const el = this.app.activeToolsContainer
        if (!el) return

        const isExpanding = !el.classList.contains('expanded')

        if (isExpanding) {
            el.classList.add('expanded')

            // Smart Positioning if coordinates provided
            if (x !== null && y !== null) {
                // Ensure position is materialized for absolute/fixed positioning
                el._positionMaterialized = true
                el.style.bottom = 'auto'
                el.style.transform = 'none'

                // Estimate dimensions (approximate if not yet rendered)
                const paletteWidth = el.offsetWidth || 240
                const paletteHeight = el.offsetHeight || 180
                const margin = 20

                // Horizontal Strategy:
                // Try to appear to the RIGHT of the finger (gap of 40px)
                let left = x + 40

                // Absolute right safety: ensure it never overflows the right edge
                if (left + paletteWidth > window.innerWidth - margin) {
                    // Not enough room on the right, push it back to the left
                    left = window.innerWidth - paletteWidth - margin
                }

                // Absolute left safety
                left = Math.max(margin, left)

                // Vertical Strategy:
                // If tap is in the bottom 1/4 of the screen, show ABOVE finger.
                // Otherwise (top 3/4), show BELOW finger for better visibility.
                const isBottomRegion = y > (window.innerHeight * 0.75)
                const gapY = 60

                let top
                if (isBottomRegion) {
                    // Show ABOVE finger
                    top = y - paletteHeight - gapY
                } else {
                    // Show BELOW finger (Default)
                    top = y + gapY
                }

                // Absolute bottom safety: ensure it never overflows the bottom edge
                if (top + paletteHeight > window.innerHeight - margin) {
                    top = window.innerHeight - paletteHeight - margin
                }

                // Absolute top safety: ensure it never goes above the screen
                top = Math.max(margin, top)

                el.style.left = `${left}px`
                el.style.top = `${top}px`
            } else {
                // Reset to default CSS position if opened via button or no coordinates
                el.style.left = ''
                el.style.top = ''
                el.style.bottom = ''
                el.style.transform = ''
                el._positionMaterialized = false
            }
        } else {
            el.classList.remove('expanded')
            // Reset to view mode on close
            if (!['view', 'select', 'eraser', 'anchor'].includes(this.app.activeStampType)) {
                this.app.activeStampType = 'view'
            }
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

    initDraggable() {
        let isDragging = false
        let startMouseX, startMouseY, startLeft, startTop
        let touchStartY = 0, touchStartX = 0, touchStartTime = 0
        const el = this.app.activeToolsContainer
        if (!el) return

        const dragStart = (clientX, clientY, target) => {
            if (!target.closest(".drag-handle") && !target.closest(".active-tool-fab")) return

            if (!el._positionMaterialized) {
                const rect = el.getBoundingClientRect()
                el.style.left = rect.left + 'px'
                el.style.top = rect.top + 'px'
                el.style.bottom = 'auto'
                el.style.transform = 'none'
                el._positionMaterialized = true
            }

            startMouseX = clientX
            startMouseY = clientY
            startLeft = parseFloat(el.style.left) || 0
            startTop = parseFloat(el.style.top) || 0
            isDragging = true
            this._stampDragMoved = false
        }

        const drag = (clientX, clientY) => {
            if (!isDragging) return
            const dx = clientX - startMouseX
            const dy = clientY - startMouseY
            // Increase threshold to 8px for iPad to distinguish from a tap
            if (!this._stampDragMoved && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
                this._stampDragMoved = true
            }
            el.style.left = (startLeft + dx) + 'px'
            el.style.top = (startTop + dy) + 'px'
        }

        const dragEnd = () => {
            isDragging = false
        }

        el.addEventListener("mousedown", (e) => dragStart(e.clientX, e.clientY, e.target))
        document.addEventListener("mousemove", (e) => { if (isDragging) { e.preventDefault(); drag(e.clientX, e.clientY) } })
        document.addEventListener("mouseup", dragEnd)

        el.addEventListener("touchstart", (e) => {
            e.stopPropagation()

            touchStartY = e.touches[0].clientY
            touchStartX = e.touches[0].clientX
            touchStartTime = Date.now()

            if (e.target.closest(".drag-handle")) {
                dragStart(e.touches[0].clientX, e.touches[0].clientY, e.target)
                if (isDragging) e.preventDefault()
            }
        }, { passive: false })

        document.addEventListener("touchmove", (e) => {
            if (isDragging) {
                e.preventDefault()
                e.stopPropagation()
                drag(e.touches[0].clientX, e.touches[0].clientY)
            } else if (el.contains(e.target)) {
                e.stopPropagation()
                if (el.style.overflowY !== 'auto') e.preventDefault()
            }
        }, { passive: false })

        document.addEventListener("touchend", (e) => {
            const wasJustDragging = isDragging
            if (isDragging) dragEnd()

            if (el.contains(e.target) || wasJustDragging) {
                const dy = e.changedTouches[0].clientY - touchStartY
                const dt = Date.now() - touchStartTime

                // Fast Flick or Large Swipe Downward
                const isFastFlick = dt < 300 && dy > 60
                const isLargeSwipe = dy > 120

                if (isFastFlick || isLargeSwipe) {
                    this.toggleStampPalette()
                }
            }
        })
    }

    updateActiveTools(forceShowDropdown = false) {
        if (!this.app.activeToolsContainer) return
        this.app.activeToolsContainer.innerHTML = ""
        const isExpanded = this.app.activeToolsContainer.classList.contains("expanded")

        if (this.app.viewer) {
            if (this.app.viewer.dataset.activeTool !== this.app.activeStampType) {
                this.app.viewer.dataset.activeTool = this.app.activeStampType
                this.app.redrawAllAnnotationLayers()
            }
        }

        // Sync Doc Bar
        if (this.app.btnModeHand) this.app.btnModeHand.classList.toggle('active', this.app.activeStampType === 'view')
        if (this.app.btnModeEraser) this.app.btnModeEraser.classList.toggle('active', this.app.activeStampType === 'eraser')

        const activeTool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === this.app.activeStampType)
        if (this.app.btnStampPalette) {
            this.app.btnStampPalette.classList.toggle('active', isExpanded || !!activeTool)
            if (!this._stampBtnDefault) this._stampBtnDefault = this.app.btnStampPalette.innerHTML
            this.app.btnStampPalette.innerHTML = activeTool
                ? this.getIcon(activeTool, 18)
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

        // 1. Permanently Pinned SELECT tool
        const selectTool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === 'select')
        if (selectTool) {
            const btn = document.createElement("button")
            btn.className = `recent-tool-btn pinned ${this.app.activeStampType === 'select' ? "active" : ""}`
            btn.innerHTML = this.getIcon(selectTool, 18)
            btn.title = "Select (V)"
            btn.onclick = (e) => {
                e.stopPropagation()
                this.app.activeStampType = 'select'
                this.updateActiveTools()
            }
            recentRibbon.appendChild(btn)
        }

        // 2. Dynamically tracked recent tools (excluding select and view)
        this.app.recentTools.forEach(toolId => {
            if (toolId === 'select') return // Skip since it's pinned
            const tool = this.app.toolsets.flatMap(g => g.tools).find(t => t.id === toolId)
            if (!tool) return
            const btn = document.createElement("button")
            btn.className = `recent-tool-btn ${this.app.activeStampType === toolId ? "active" : ""}`
            btn.innerHTML = this.getIcon(tool, 18)
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

        // Grid or Recycle Bin
        if (this.app.activeStampType === "recycle-bin") {
            this.renderRecycleBin()
        } else {
            this.renderToolsGrid()
        }

        // Category Ribbon (Now at the BOTTOM)
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
        this.app.activeToolsContainer.appendChild(ribbon)

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
                        const newIdx = this.app.userTextLibrary.length
                        this.app.userTextLibrary.push(val)
                        this.app.saveToStorage()

                        // Auto-select the new term
                        this.app.activeStampType = `custom-text-${newIdx}`
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
                    btn.innerHTML = this.getIcon(tool, 22)
                    btn.onclick = (e) => {
                        e.stopPropagation()
                        if (tool.id === 'erase-all') {
                            this.app.annotationManager.showEraseAllModal()
                            return
                        }
                        this.app.activeStampType = tool.id
                        this.app.lastUsedToolPerCategory[catName] = tool.id

                        // Update Recent Tools History
                        if (tool.id !== 'view' && tool.id !== 'select') {
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
}
