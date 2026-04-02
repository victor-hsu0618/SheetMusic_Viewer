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
        const days = Math.floor(mins / (60 * 24)); // Corrected calculation for days

        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    render() {
        if (!this.manager.grid) return;
        this.manager.grid.innerHTML = "";
        this.manager.grid.classList.toggle("selection-mode", this.manager.isSelectionMode);

        if (this.manager.registry.length === 0) {
            this.manager.grid.innerHTML = '<div class="library-empty">Your library is empty. Import a PDF to begin.</div>';
            return;
        }

        // Add Header Row
        const header = document.createElement("div");
        header.className = "library-grid-header";
        header.innerHTML = `
            <div class="header-item col-select">#</div>
            <div class="header-item col-title">Piece Title</div>
            <div class="header-item col-action"></div>
        `;
        this.manager.grid.appendChild(header);

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

            // Simplified icon system for "File Manager" speed (no thumbnails)
            const isCloudOnly = score.isCloudOnly || score.storageMode === 'cloud';
            const thumbContent = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity: 0.6">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                </svg>
            `;

            let storageBadge = '';
            if (score.storageMode === 'pinned') {
                storageBadge = `<div class="cloud-sync-status pinned clickable" title="Pinned offline">📌</div>`;
            } else if (isCloudOnly) {
                storageBadge = `<div class="cloud-sync-status not-synced clickable" title="Cloud only — tap to download">☁️</div>`;
            } else {
                storageBadge = `<div class="cloud-sync-status cached clickable" title="Cached locally — tap to pin">📍</div>`;
            }

            const cellSelect = this.manager.isSelectionMode ? `
                <div class="col-select selection-indicator-cell">
                    <div class="selection-indicator-mini ${this.manager.selectedFingerprints.has(score.fingerprint) ? 'selected' : ''}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                </div>
            ` : `<div class="col-select score-index-badge">#${index + 1}</div>`;

            card.innerHTML = `
                ${cellSelect}
                <div class="col-title score-title-cell">
                    <span class="score-title" title="${displayTitle}">${displayTitle}</span>
                </div>
                <div class="col-action score-action-cell">
                    <div class="score-delete-btn-mini text-danger" title="Delete Score">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </div>
                    <div class="score-info-btn" title="More Actions">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <circle cx="12" cy="12" r="1"></circle>
                            <circle cx="12" cy="5" r="1"></circle>
                            <circle cx="12" cy="19" r="1"></circle>
                        </svg>
                    </div>
                </div>
            `;

            card.querySelector('.score-delete-btn-mini')?.addEventListener('click', async (e) => {
                e.stopPropagation();
                const confirmed = await this.app.showDialog({
                    title: 'Delete Score?',
                    message: `Delete "${displayTitle}" and all its markings from this device?`,
                    type: 'confirm',
                    icon: '🗑️'
                });
                if (confirmed) {
                    await this.manager.deleteScore(score.fingerprint);
                    this.app.showMessage('Score deleted.', 'success');
                }
            });

            card.querySelector('.score-info-btn').onclick = (e) => {
                e.stopPropagation();
                this.app.toggleScoreDetail(score.fingerprint);
            };

            const badgeBtn = card.querySelector('.cloud-sync-status');
            if (badgeBtn) {
                badgeBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const currentMode = score.storageMode || 'cached';
                    let newMode = 'pinned';
                    
                    if (currentMode === 'pinned') newMode = 'cached';
                    else if (currentMode === 'cloud') newMode = 'pinned';

                    await this.manager.setStorageMode(score.fingerprint, newMode);
                    this.render(); // Re-render this list
                };
            }

            card.onclick = () => {
                console.log('[LibraryUI] Card clicked:', score.title, 'SelectionMode:', this.manager.isSelectionMode);
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
