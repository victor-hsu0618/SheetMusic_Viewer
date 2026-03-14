import * as db from '../db.js'
import { INITIAL_LAYERS } from '../constants.js'

export class PersistenceManager {
    constructor(app) {
        this.app = app
    }

    saveToStorage() {
        if (this.app.pdfFingerprint) {
            localStorage.setItem(`scoreflow_stamps_${this.app.pdfFingerprint}`, JSON.stringify(this.app.stamps))
            if (this.app.scoreDetailManager) {
                this.app.scoreDetailManager.save(this.app.pdfFingerprint)
            }
            if (this.app.scoreManager) {
                this.app.scoreManager.updateSyncStatus(this.app.pdfFingerprint, false);
            }
        }
        localStorage.setItem('scoreflow_stamps', JSON.stringify(this.app.stamps))
        localStorage.setItem('scoreflow_current_fingerprint', this.app.pdfFingerprint || '')
        localStorage.setItem('scoreflow_sources', JSON.stringify(this.app.sources))
        localStorage.setItem('scoreflow_active_source', this.app.activeSourceId)
        localStorage.setItem('scoreflow_recent_solo_scores', JSON.stringify(this.app.recentSoloScores || []))
        localStorage.setItem('scoreflow_active_categories', JSON.stringify(this.app.activeCategories))
        localStorage.setItem('scoreflow_layers', JSON.stringify(this.app.layers))
        localStorage.setItem('scoreflow_active_color', this.app.activeColor)
        localStorage.setItem('scoreflow_default_font_size', this.app.defaultFontSize)
        localStorage.setItem('scoreflow_user_text_library', JSON.stringify(this.app.userTextLibrary))
        localStorage.setItem('scoreflow_stamp_size_multiplier', this.app.stampSizeMultiplier)
        localStorage.setItem('scoreflow_stamp_offset_touch_y', this.app.stampOffsetTouchY)
        localStorage.setItem('scoreflow_stamp_offset_mouse_y', this.app.stampOffsetMouseY)
        localStorage.setItem('scoreflow_pointer_idle_timeout_ms', this.app.pointerIdleTimeoutMs || 8000)

        const turnerMode = document.getElementById('turner-mode-select') ? document.getElementById('turner-mode-select').value : 'default';
        localStorage.setItem('scoreflow_turner_mode', turnerMode)

        if (this.app.activeScoreName) {
            localStorage.setItem('scoreflow_last_opened_score', this.app.activeScoreName)
            if (this.app.pdfFingerprint) {
                const map = JSON.parse(localStorage.getItem('scoreflow_fingerprint_map') || '{}')
                map[this.app.activeScoreName] = this.app.pdfFingerprint
                localStorage.setItem('scoreflow_fingerprint_map', JSON.stringify(map))
            }
        }
    }

    loadFromStorage() {
        const layersData = localStorage.getItem('scoreflow_layers')
        const stampsData = localStorage.getItem('scoreflow_stamps')
        const sourcesData = localStorage.getItem('scoreflow_sources')
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
        const stampSizeMultiplierData = localStorage.getItem('scoreflow_stamp_size_multiplier')

        if (recentSoloData) this.app.recentSoloScores = JSON.parse(recentSoloData)

        if (sourcesData) {
            this.app.sources = JSON.parse(sourcesData)
            if (this.app.sources.length === 0) {
                this.app.sources = [{ id: 'self', name: 'Primary Interpretation', visible: true, opacity: 1, color: '#6366f1' }]
            }
        }
        if (activeSourceData) this.app.activeSourceId = activeSourceData
        if (fingerprintData) this.app.pdfFingerprint = fingerprintData
        if (activeCategoriesData) {
            const parsed = JSON.parse(activeCategoriesData)
            this.app.activeCategories = Array.isArray(parsed) && parsed.length > 0 ? [parsed[0]] : ['Pens']
        }
        if (docBarCollapsedStr === 'true' && this.app.docBar) {
            this.app.docBar.classList.add('collapsed')
        } else if (docBarCollapsedStr === 'false' && this.app.docBar) {
            this.app.docBar.classList.remove('collapsed')
        }
        if (rulerVisibleData !== null) this.app.rulerVisible = JSON.parse(rulerVisibleData)
        if (userTextLibraryData) {
            this.app.userTextLibrary = JSON.parse(userTextLibraryData)
        }
        if (activeColorData) this.app.activeColor = activeColorData
        if (defaultFontSizeData) {
            this.app.defaultFontSize = parseInt(defaultFontSizeData)
            const slider = document.getElementById('slider-font-size')
            const value = document.getElementById('val-font-size')
            if (slider) slider.value = this.app.defaultFontSize
            if (value) value.textContent = `${this.app.defaultFontSize}px`
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

        const offsetMouseData = localStorage.getItem('scoreflow_stamp_offset_mouse_y')
        if (offsetMouseData !== null) {
            this.app.stampOffsetMouseY = parseInt(offsetMouseData)
            const input = document.getElementById('settings-offset-mouse')
            const value = document.getElementById('settings-offset-mouse-value')
            if (input) input.value = this.app.stampOffsetMouseY
            if (value) value.textContent = `${this.app.stampOffsetMouseY}px`
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
                if (l.id === 'performance') {
                    l.id = 'text'; 
                    l.name = 'Text';
                }
                if (l.id === 'layout' && l.name !== 'Others') {
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

        if (stampsData) {
            let parsedStamps = JSON.parse(stampsData)
            if (fingerprintData) {
                const scoreStamps = localStorage.getItem(`scoreflow_stamps_${fingerprintData}`)
                if (scoreStamps) parsedStamps = JSON.parse(scoreStamps)
            }
            this.app.stamps = parsedStamps
            this.app.stamps.forEach(s => {
                // Migrate stamp layer IDs too
                if (s.layerId === 'performance') s.layerId = 'text';
                if (s.layerId === 'other' || s.layerId === 'anchor') s.layerId = 'layout';

                if (!this.app.layers.find(l => l.id === s.layerId)) {
                    s.layerId = 'draw'
                }
                if (!s.sourceId) {
                    s.sourceId = this.app.activeSourceId
                }
            })
        }

        // Load score details for the current fingerprint
        if (fingerprintData && this.app.scoreDetailManager) {
            this.app.scoreDetailManager.load(fingerprintData)
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
