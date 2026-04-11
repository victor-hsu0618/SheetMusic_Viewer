import * as db from '../db.js'
import { INITIAL_LAYERS } from '../constants.js'

export class PersistenceManager {
    constructor(app) {
        this.app = app
    }

    async saveToStorage() {
        if (this.app.pdfFingerprint) {
            await db.set(`stamps_${this.app.pdfFingerprint}`, this.app.stamps)
            if (this.app.scoreDetailManager) {
                await this.app.scoreDetailManager.save(this.app.pdfFingerprint)
            }
            if (this.app.scoreManager) {
                await this.app.scoreManager.updateSyncStatus(this.app.pdfFingerprint, false);
                
                // [New] Update the lastAnnotationUpdate timestamp in registry
                if (this.app.stamps && Array.isArray(this.app.stamps) && this.app.stamps.length > 0) {
                    const latest = Math.max(...this.app.stamps.map(s => Number(s.updatedAt) || 0));
                    if (latest > 0) {
                        this.app.scoreManager.updateLastAnnotationUpdate(this.app.pdfFingerprint, latest);
                    }
                }
            }
            // Per-score isolation for Interpretations and Layers
            await db.set(`sources_${this.app.pdfFingerprint}`, this.app.sources)
            await db.set(`layers_${this.app.pdfFingerprint}`, this.app.layers)
        }
        if (this.app.pdfFingerprint) {
            localStorage.setItem('scoreflow_current_fingerprint', this.app.pdfFingerprint)
        }
        localStorage.setItem('scoreflow_sources', JSON.stringify(this.app.sources))
        localStorage.setItem('scoreflow_active_source', this.app.activeSourceId)
        localStorage.setItem('scoreflow_recent_solo_scores', JSON.stringify(this.app.recentSoloScores || []))
        localStorage.setItem('scoreflow_active_categories', JSON.stringify(this.app.activeCategories))
        localStorage.setItem('scoreflow_layers', JSON.stringify(this.app.layers))
        localStorage.setItem('scoreflow_active_color', this.app.activeColor)
        localStorage.setItem('scoreflow_default_font_size', this.app.defaultFontSize)
        localStorage.setItem('scoreflow_user_text_library', JSON.stringify(this.app.getUserTextEntries()))
        localStorage.setItem('scoreflow_stamp_size_multiplier', this.app.stampSizeMultiplier)
        localStorage.setItem('scoreflow_stamp_size_overrides', JSON.stringify(this.app.stampSizeOverrides || {}))
        localStorage.setItem('scoreflow_tool_presets', JSON.stringify(this.app.toolPresets || {}))
        localStorage.setItem('scoreflow_tool_colors', JSON.stringify(this.app.toolColors || {}))
        localStorage.setItem('scoreflow_stamp_offset_touch_y', this.app.stampOffsetTouchY)
        localStorage.setItem('scoreflow_stamp_offset_touch_x', this.app.stampOffsetTouchX)
        localStorage.setItem('scoreflow_stamp_offset_mouse_y', this.app.stampOffsetMouseY)
        localStorage.setItem('scoreflow_stamp_offset_mouse_x', this.app.stampOffsetMouseX)
        localStorage.setItem('scoreflow_pointer_idle_timeout_ms', this.app.pointerIdleTimeoutMs || 8000)

        localStorage.setItem('scoreflow_reading_mode', this.app.readingMode || 'vertical')
        const turnerMode = document.getElementById('turner-mode-select') ? document.getElementById('turner-mode-select').value : 'default';
        localStorage.setItem('scoreflow_turner_mode', turnerMode)

        if (this.app.activeScoreName) {
            localStorage.setItem('scoreflow_last_opened_score', this.app.activeScoreName)
            if (this.app.pdfFingerprint) {
                localStorage.setItem('scoreflow_current_fingerprint', this.app.pdfFingerprint)
                const map = JSON.parse(localStorage.getItem('scoreflow_fingerprint_map') || '{}')
                map[this.app.activeScoreName] = this.app.pdfFingerprint
                localStorage.setItem('scoreflow_fingerprint_map', JSON.stringify(map))
            }
        }
    }

    async loadFromStorage(fingerprint) {
        const activeFp = fingerprint || localStorage.getItem('scoreflow_current_fingerprint')
        
        // 1. Load Sources (Interpretations) - Priority: Per-Score > Global
        let sourcesData = localStorage.getItem('scoreflow_sources')
        if (activeFp) {
            const perScoreSources = await db.get(`sources_${activeFp}`)
            if (perScoreSources) {
                this.app.sources = perScoreSources
                sourcesData = null // skip global load
            }
        }

        if (sourcesData) {
            this.app.sources = JSON.parse(sourcesData)
            if (!this.app.sources || this.app.sources.length === 0) {
                this.app.sources = [{ id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' }]
            }
        }

        // INVARIANT: 'self' source must always exist. Restore silently if missing
        // (can happen if user accidentally deleted it via collaboration UI, or from corrupted storage).
        if (!this.app.sources.some(s => s.id === 'self')) {
            this.app.sources.unshift({ id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' });
        }

        // 2. Load Layers - Priority: Per-Score > Global
        let layersData = localStorage.getItem('scoreflow_layers')
        if (activeFp) {
            const perScoreLayers = await db.get(`layers_${activeFp}`)
            if (perScoreLayers) {
                this.app.layers = perScoreLayers
                layersData = null // skip global load
            }
        }
        if (layersData) {
            this.app.layers = JSON.parse(layersData)
        }
        if (!this.app.layers || this.app.layers.length === 0) {
            this.app.layers = JSON.parse(JSON.stringify(INITIAL_LAYERS))
        }

        const activeSourceData = localStorage.getItem('scoreflow_active_source')
        const fingerprintData = localStorage.getItem('scoreflow_current_fingerprint')
        const recentSoloData = localStorage.getItem('scoreflow_recent_solo_scores')
        const turnerModeData = localStorage.getItem('scoreflow_turner_mode')
        const activeCategoriesData = localStorage.getItem('scoreflow_active_categories')
        const docBarCollapsedStr = localStorage.getItem('scoreflow_doc_bar_collapsed')
        const rulerVisibleData = localStorage.getItem('scoreflow_ruler_visible')
        const userTextLibraryData = localStorage.getItem('scoreflow_user_text_library')
        const activeColorData = localStorage.getItem('scoreflow_active_color')
        const defaultFontSizeData = localStorage.getItem('scoreflow_default_font_size')
        const readingModeData = localStorage.getItem('scoreflow_reading_mode') || 'vertical'
        const stampSizeMultiplierData = localStorage.getItem('scoreflow_stamp_size_multiplier')

        if (recentSoloData) this.app.recentSoloScores = JSON.parse(recentSoloData)

        if (activeSourceData) this.app.activeSourceId = activeSourceData
        
        // CRITICAL: Do NOT overwrite app.pdfFingerprint if we already solved it in activeFp
        if (activeFp) {
            this.app.pdfFingerprint = activeFp
        } else if (fingerprintData) {
            this.app.pdfFingerprint = fingerprintData
        }
        if (activeCategoriesData) {
            const parsed = JSON.parse(activeCategoriesData)
            let activeCatName = Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : 'Pens';
            
            // Migration for active category string
            if (activeCatName === 'Bow/Fingering' || activeCatName === 'Fingering' || activeCatName === 'F.Fingering') activeCatName = 'B.Fingering';
            if (activeCatName === 'Draw Objects') activeCatName = 'Pens';
            
            this.app.activeCategories = [activeCatName];
            
            // SYNC: Ensure activeLayerId is kept in sync with the loaded category
            // (Reusing the already declared activeCatName)
            const group = this.app.toolsets.find(g => g.name === activeCatName);
            if (group) {
                const targetLayer = this.app.layers.find(l => l.name === group.name || l.type === group.type);
                if (targetLayer) {
                    this.app.activeLayerId = targetLayer.id;
                    // If no active color was saved, default to the category's color
                    if (!activeColorData) {
                        this.app.activeColor = targetLayer.color;
                    }
                }
            }
        } else {
            this.app.activeCategories = ['Pens']
            this.app.activeLayerId = 'draw'
        }
        if (docBarCollapsedStr === 'true' && this.app.docBar) {
            this.app.docBar.classList.add('collapsed')
        } else if (docBarCollapsedStr === 'false' && this.app.docBar) {
            this.app.docBar.classList.remove('collapsed')
        }
        if (rulerVisibleData !== null) this.app.rulerVisible = JSON.parse(rulerVisibleData)
        if (userTextLibraryData) {
            this.app.userTextLibrary = this.app.normalizeUserTextLibrary(JSON.parse(userTextLibraryData))
        }
        // One-time migration: prepend built-in presets for users who had an older library
        if (!localStorage.getItem('scoreflow_text_presets_v1')) {
            const PRESETS = ['指揮', '小提', '大提', '管樂', '打擊', '獨奏', '換頁', '換譜', '呼吸']
            PRESETS.forEach(t => {
                if (!this.app.getUserTextEntries().some(entry => entry.text === t)) {
                    this.app.userTextLibrary.unshift(this.app.createUserTextEntry(t))
                }
            })
            this.app.userTextLibrary = this.app.normalizeUserTextLibrary(this.app.userTextLibrary)
            localStorage.setItem('scoreflow_text_presets_v1', '1')
        }
        if (activeColorData) this.app.activeColor = activeColorData
        if (defaultFontSizeData) {
            this.app.defaultFontSize = parseInt(defaultFontSizeData)
            const slider = document.getElementById('slider-font-size')
            const value = document.getElementById('val-font-size')
            if (slider) slider.value = this.app.defaultFontSize
            if (value) value.textContent = `${this.app.defaultFontSize}px`
        }
        const stampSizeOverridesData = localStorage.getItem('scoreflow_stamp_size_overrides')
        this.app.stampSizeOverrides = stampSizeOverridesData ? JSON.parse(stampSizeOverridesData) : {}
        this.app.readingMode = readingModeData
        if (this.app.readingMode === 'horizontal') {
            document.body.classList.add('mode-horizontal')
        } else {
            document.body.classList.remove('mode-horizontal')
        }

        if (stampSizeMultiplierData) {
            this.app.stampSizeMultiplier = parseFloat(stampSizeMultiplierData)
            if (this.app.settingsStampSizeInput) {
                this.app.settingsStampSizeInput.value = this.app.stampSizeMultiplier
                if (this.app.settingsStampSizeValue) {
                    this.app.settingsStampSizeValue.textContent = `${this.app.stampSizeMultiplier.toFixed(1)}x`
                }
            }
        }

        const offsetTouchData = localStorage.getItem('scoreflow_stamp_offset_touch_y')
        if (offsetTouchData !== null) {
            this.app.stampOffsetTouchY = parseInt(offsetTouchData)
            const input = document.getElementById('settings-offset-touch')
            const value = document.getElementById('settings-offset-touch-value')
            if (input) input.value = this.app.stampOffsetTouchY
            if (value) value.textContent = `${this.app.stampOffsetTouchY}px`
        }

        const offsetTouchXData = localStorage.getItem('scoreflow_stamp_offset_touch_x')
        if (offsetTouchXData !== null) {
            this.app.stampOffsetTouchX = parseInt(offsetTouchXData)
            const input = document.getElementById('settings-offset-touch-x')
            const value = document.getElementById('settings-offset-touch-x-value')
            if (input) input.value = this.app.stampOffsetTouchX
            if (value) value.textContent = `${this.app.stampOffsetTouchX}px`
        }

        const offsetMouseData = localStorage.getItem('scoreflow_stamp_offset_mouse_y')
        if (offsetMouseData !== null) {
            this.app.stampOffsetMouseY = parseInt(offsetMouseData)
            const input = document.getElementById('settings-offset-mouse')
            const value = document.getElementById('settings-offset-mouse-value')
            if (input) input.value = this.app.stampOffsetMouseY
            if (value) value.textContent = `${this.app.stampOffsetMouseY}px`
        }

        const offsetMouseXData = localStorage.getItem('scoreflow_stamp_offset_mouse_x')
        if (offsetMouseXData !== null) {
            this.app.stampOffsetMouseX = parseInt(offsetMouseXData)
        }

        const pointerIdleData = localStorage.getItem('scoreflow_pointer_idle_timeout_ms')
        if (pointerIdleData !== null) {
            this.app.pointerIdleTimeoutMs = parseInt(pointerIdleData)
            const input = document.getElementById('settings-pointer-idle')
            const value = document.getElementById('settings-pointer-idle-value')
            if (input) input.value = Math.round(this.app.pointerIdleTimeoutMs / 1000)
            if (value) value.textContent = `${Math.round(this.app.pointerIdleTimeoutMs / 1000)}s`
        } else {
            this.app.pointerIdleTimeoutMs = 8000 // Default 8s
        }

        const turnerSelect = document.getElementById('turner-mode-select')
        if (turnerSelect) {
            if (turnerModeData) turnerSelect.value = turnerModeData
            turnerSelect.addEventListener('change', () => this.saveToStorage())
        }

        const mapData = localStorage.getItem('scoreflow_fingerprint_map')
        this.app.scoreFingerprintMap = mapData ? JSON.parse(mapData) : {}

        // SYNC: Preserve custom layers while respecting core defaults
        if (layersData) {
            let storedLayers = JSON.parse(layersData)
            
            // --- Migration logic for legacy names/IDs ---
            storedLayers.forEach(l => {
                if (l.name === 'Bow/Fingering' || l.name === 'Fingering' || l.name === 'F.Fingering') {
                    l.name = 'B.Fingering';
                    // Force migrate default color (Old Coral Red or Old Blue -> New Crimson)
                    if (l.color === '#ff4757' || l.color === '#3b82f6') l.color = '#be123c';
                }
                if (l.id === 'draw' && l.name !== 'Pens') {
                    l.name = 'Pens';
                }
                if (l.id === 'draw' && l.name === 'Pens') {
                    // Force migrate default color (Old Red or Old Blue -> New Royal Blue)
                    if (l.color === '#ff4757' || l.color === '#3b82f6') l.color = '#1d4ed8';
                }
                if (l.id === 'articulation' && l.color === '#10b981') {
                    l.color = '#15803d'; // Old Green -> New Forest Green
                }
                if (l.id === 'text' && l.color === '#f59e0b') {
                    l.color = '#b45309'; // Old Orange -> New Burnt Orange
                }
                if ((l.id === 'layout' || l.id === 'others') && l.color === '#64748b') {
                    l.color = '#94a3b8'; // Old Slate -> Muted Grey (as requested)
                }
                if (l.id === 'performance') {
                    l.id = 'text'; 
                    l.name = 'Text';
                }
                if (l.id === 'layout') {
                    l.id = 'others';
                    l.name = 'Others';
                }
                if (l.id === 'others' && l.name !== 'Others') {
                    l.name = 'Others';
                }
            });

            this.app.layers = storedLayers
            INITIAL_LAYERS.forEach(coreLayer => {
                if (!this.app.layers.find(l => l.id === coreLayer.id)) {
                    this.app.layers.push({ ...coreLayer })
                }
            })
        }

        // Load score details for the current fingerprint
        if (activeFp && this.app.scoreDetailManager) {
            this.app.scoreDetailManager.load(activeFp)
        }
    }

    addToRecentSoloScores(name) {
        if (!this.app.recentSoloScores) this.app.recentSoloScores = []
        this.app.recentSoloScores = this.app.recentSoloScores.filter(s => s.name !== name)
        this.app.recentSoloScores.unshift({
            name: name,
            date: new Date().toLocaleDateString()
        })
        if (this.app.recentSoloScores.length > 10) this.app.recentSoloScores.pop()

        // 刷新所有相關 UI
        if (this.app.renderRecentSoloScores) this.app.renderRecentSoloScores()
        if (this.app.renderWelcomeRecentScores) this.app.renderWelcomeRecentScores()
        if (this.app.renderSidebarRecentScores) this.app.renderSidebarRecentScores()
    }
}
