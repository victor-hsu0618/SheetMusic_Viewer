export class ScoreLibraryUIManager {
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;
    }

    formatRelativeTime(timestamp) {
        if (!timestamp || timestamp === 0) return 'Never';
        const now = Date.now();
        const diff = now - timestamp;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(mins / 60);
        const days = Math.floor(hours / 24);

        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    render() {
        if (!this.manager.grid) return;
        this.manager.grid.innerHTML = "";

        if (this.manager.registry.length === 0) {
            this.manager.grid.innerHTML = '<div class="library-empty">Your library is empty. Import a PDF to begin.</div>';
            return;
        }

        // Sort and Filter
        let sorted = [...this.manager.registry]
            .filter(s => {
                if (this.manager.searchQuery) {
                    const q = this.manager.searchQuery.toLowerCase();
                    return (s.title || "").toLowerCase().includes(q) || 
                           (s.composer || "").toLowerCase().includes(q) ||
                           (s.fileName || "").toLowerCase().includes(q);
                }
                return true;
            })
            .sort((a, b) => {
                if (this.manager.sortMode === "title") return (a.title || "").localeCompare(b.title || "");
                if (this.manager.sortMode === "composer") return (a.composer || "").localeCompare(b.composer || "");
                if (this.manager.sortMode === "imported") return (b.dateImported || 0) - (a.dateImported || 0);
                return (b.lastAccessed || 0) - (a.lastAccessed || 0);
            });

        if (sorted.length === 0 && this.manager.registry.length > 0) {
            this.manager.grid.innerHTML = '<div class="library-empty">No items match current filters.</div>';
            return;
        }

        sorted.forEach((score, index) => {
            const card = document.createElement("div");
            card.className = "score-card";
            if (this.manager.isSelectionMode) {
                card.classList.add("selectable");
                if (this.manager.selectedFingerprints.has(score.fingerprint)) card.classList.add("selected");
            }

            let displayTitle = score.title || score.fileName || "Untitled";
            if (displayTitle.toLowerCase().endsWith(".pdf")) displayTitle = displayTitle.slice(0, -4);

            // Time Relative Info
            let timeInfo = "";
            if (this.manager.sortMode === 'imported') {
                timeInfo = `Imported: ${this.formatRelativeTime(score.dateImported)}`;
            } else {
                timeInfo = `Last opened: ${this.formatRelativeTime(score.lastAccessed)}`;
            }

            const thumbContent = score.isCloudOnly ? '☁️' : (score.thumbnail ? `<img src="${score.thumbnail}">` : '🎼');

            // Add selection indicator if in selection mode
            const selectionIndicator = this.manager.isSelectionMode ? `
                <div class="selection-indicator">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                </div>
            ` : '';

            card.innerHTML = `
                ${selectionIndicator}
                <div class="score-index-badge">#${index + 1}</div>
                <div class="score-thumb">${thumbContent}</div>
                <div class="score-info">
                    <div class="score-meta-row">
                        <span class="score-title">${displayTitle}</span>
                        <span class="score-meta-separator">·</span>
                        <span class="score-composer">${score.composer || "Unknown"}</span>
                    </div>
                    <div class="score-time-info" style="font-size: 11px; opacity: 0.6; margin-top: 4px;">
                        ${timeInfo}
                    </div>
                </div>
                <div class="score-info-btn" title="Score Details">ℹ️</div>
            `;

            card.querySelector('.score-info-btn').onclick = (e) => {
                e.stopPropagation();
                this.app.showScoreDetail(score.fingerprint);
            };

            card.onclick = () => {
                if (this.manager.isSelectionMode) {
                    this.manager.toggleSelectScore(score.fingerprint);
                } else {
                    this.manager.loadScore(score.fingerprint);
                }
            };

            this.manager.grid.appendChild(card);
        });

        // Update count readout
        const countEl = document.getElementById('library-score-count');
        if (countEl) {
            const total = this.manager.registry.length;
            const shown = sorted.length;
            if (this.manager.searchQuery) {
                countEl.textContent = `Found ${shown} of ${total} scores`;
            } else {
                countEl.textContent = `All Scores (${total})`;
            }
        }
    }
}
