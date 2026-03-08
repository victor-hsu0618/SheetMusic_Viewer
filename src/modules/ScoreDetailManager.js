import * as db from '../db.js'

export class ScoreDetailManager {
    constructor(app) {
        this.app = app
        this.currentInfo = {
            name: '',
            composer: '',
            lastEdit: null,
            lastAuthor: null
        }
    }

    init() {
        // UI Elements
        this.scoreNameInput = document.getElementById('score-name-input')
        this.scoreComposerInput = document.getElementById('score-composer-input')
        this.scoreFilenameDisplay = document.getElementById('score-filename-display')
        this.scoreFingerprintDisplay = document.getElementById('score-fingerprint-display')

        // Stats Elements
        this.statsTotalCount = document.getElementById('stats-total-count')
        this.statsLastEdit = document.getElementById('stats-last-edit')
        this.statsAuthor = document.getElementById('stats-author')

        this.initEventListeners()
    }

    refreshStats() {
        if (!this.app.pdfFingerprint) return;

        const stamps = this.app.stamps || [];
        const count = stamps.length;

        let lastTime = 'Never';
        if (this.currentInfo.lastEdit) {
            const date = new Date(this.currentInfo.lastEdit);
            lastTime = date.toLocaleString([], {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            });
        }

        // Display results
        if (this.statsTotalCount) this.statsTotalCount.textContent = count;
        if (this.statsLastEdit) this.statsLastEdit.textContent = lastTime;
        if (this.statsAuthor) {
            this.statsAuthor.textContent = this.currentInfo.lastAuthor || 'Guest';
        }

        console.log('[ScoreDetailManager] Data statistics refreshed.');
    }

    onModification() {
        if (!this.app.pdfFingerprint) return;

        this.currentInfo.lastEdit = Date.now();
        this.currentInfo.lastAuthor = this.app.profileManager?.data?.userName || 'Guest';

        this.save(this.app.pdfFingerprint);

        // If the Detail tab is currently active, refresh UI immediately
        const activeTab = document.querySelector('.sidebar-tab.active');
        if (activeTab && activeTab.dataset.tab === 'orchestra') {
            this.refreshStats();
        }
    }

    initEventListeners() {
        if (this.scoreNameInput) {
            this.scoreNameInput.addEventListener('input', () => this.handleInputChange())
        }
        if (this.scoreComposerInput) {
            this.scoreComposerInput.addEventListener('input', () => this.handleInputChange())
        }
    }

    handleInputChange() {
        if (!this.app.pdfFingerprint) return

        this.currentInfo.name = this.scoreNameInput.value.trim()
        this.currentInfo.composer = this.scoreComposerInput.value.trim()

        // Save to storage
        this.save(this.app.pdfFingerprint)
    }

    async load(fingerprint) {
        if (!fingerprint) return

        const detailData = localStorage.getItem(`scoreflow_detail_${fingerprint}`)
        if (detailData) {
            try {
                const info = JSON.parse(detailData)
                this.currentInfo = {
                    name: info.name || '',
                    composer: info.composer || '',
                    lastEdit: info.lastEdit || null,
                    lastAuthor: info.lastAuthor || null
                }
            } catch (err) {
                console.error('[ScoreDetailManager] Failed to parse score detail data:', err)
                this.currentInfo = { name: '', composer: '' }
            }
        } else {
            // New score defaults
            this.currentInfo = {
                name: this.app.activeScoreName ? this.app.activeScoreName.replace(/\.pdf$/i, '') : '',
                composer: ''
            }
        }

        this.render(fingerprint)
    }

    save(fingerprint) {
        if (!fingerprint) return
        localStorage.setItem(`scoreflow_detail_${fingerprint}`, JSON.stringify(this.currentInfo))
    }

    render(fingerprint) {
        if (!this.scoreNameInput || !this.scoreComposerInput) return

        // Update inputs
        this.scoreNameInput.value = this.currentInfo.name || ''
        this.scoreComposerInput.value = this.currentInfo.composer || ''

        // Update meta displays
        if (this.scoreFilenameDisplay) {
            this.scoreFilenameDisplay.textContent = this.app.activeScoreName || 'Unknown File'
        }
        if (this.scoreFingerprintDisplay) {
            this.scoreFingerprintDisplay.textContent = fingerprint ? (fingerprint.slice(0, 16) + '...') : 'Unknown'
        }
    }

    getExportMetadata() {
        return {
            name: this.currentInfo.name,
            composer: this.currentInfo.composer
        }
    }

    getExportFilename(isGlobal, userName) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const datestr = `${year}-${month}-${day}`;

        // Robust sanitization (removes only problematic system characters)
        const clean = (s) => {
            if (!s) return '';
            // Trim and replace spaces/dots/problematic chars with underscores
            return s.trim()
                .replace(/[\/\?<>\\:\*\|":]/g, '_') // Windows/Linux illegal chars
                .replace(/\s+/g, '_')               // Spaces to underscores
                .replace(/\.+/g, '_')               // Dots to underscores (prevent double extensions)
                .replace(/_+/g, '_')                // Clean duplicate underscores
                .replace(/^_|_$/g, '');             // Trim underscores from ends
        }

        const safeUserName = clean(userName) || 'Guest';

        if (isGlobal) {
            return `ScoreFlow_Backup_${safeUserName}_${datestr}.json`;
        }

        // Try to get a meaningful score name
        let scoreBase = (this.currentInfo.name || '').trim();
        if (!scoreBase || scoreBase.toLowerCase() === 'untitled') {
            scoreBase = this.app.activeScoreName ? this.app.activeScoreName.replace(/\.[^/.]+$/, "") : 'Untitled';
        }

        const scoreName = clean(scoreBase) || 'Untitled';
        const composer = clean(this.currentInfo.composer) || 'Unknown';

        const finalFilename = `${scoreName}_${composer}_${safeUserName}_${datestr}.json`;
        console.log('[ScoreDetailManager] Final filename generated:', finalFilename);
        return finalFilename;
    }
}
