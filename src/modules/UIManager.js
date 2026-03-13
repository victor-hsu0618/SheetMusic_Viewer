/**
 * UIManager handles global UI state, transitions, and shared components 
 * like Toast notifications and Modal management.
 */
export class UIManager {
    constructor(app) {
        this.app = app;
        this.toastContainer = document.getElementById('toast-container');
    }

    init() {
        this.initOutsideClickListeners();
    }

    /**
     * Provide non-intrusive UI feedback via toast notifications.
     */
    showMessage(msg, type = 'info') {
        if (!this.toastContainer) {
            this.toastContainer = document.getElementById('toast-container');
        }

        if (!this.toastContainer) {
            console.warn('[UIManager] Toast container not found. Fallback to alert:', msg);
            if (type === 'error') alert(msg);
            return;
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            system: '⚙️'
        };

        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || '🔔'}</div>
            <div class="toast-message">${msg}</div>
        `;
        this.toastContainer.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('active'), 10);

        // Auto-remove
        setTimeout(() => {
            toast.classList.add('removing');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 4000);
    }

    /**
     * Centralized handling of "Click Outside to Close" for various panels.
     */
    initOutsideClickListeners() {
        // Universal touch listener to close active sub-panels on background tap
        document.addEventListener('touchstart', (e) => {
            // Panels to check
            const panels = [
                { id: 'view-control-panel', toggleBtn: 'btn-view-panel-toggle', manager: 'viewPanelManager' },
                { id: 'jump-panel', toggleBtn: 'btn-jump-panel-toggle', manager: 'jumpManager' }
            ];

            panels.forEach(p => {
                const el = document.getElementById(p.id);
                const btn = document.getElementById(p.toggleBtn);
                
                if (el && el.classList.contains('active') && 
                    !el.contains(e.target) && 
                    (!btn || !btn.contains(e.target))) {
                    
                    if (this.app[p.manager] && this.app[p.manager].togglePanel) {
                        this.app[p.manager].togglePanel(false);
                    }
                }
            });
        }, { passive: true });
    }

    /**
     * Close all active drawer panels and floating palettes.
     * Used for mutual exclusivity between Doc Bar panels.
     * @param {string} exceptManagerName - The class name of the manager to skip.
     */
    closeAllActivePanels(exceptManagerName = null) {
        if (this.app.isInteracting) return;
        // List of managers that handle sub-panels
        const managers = [
            { name: 'SettingsPanelManager', method: 'toggle', ref: 'settingsPanelManager' },
            { name: 'JumpManager', method: 'togglePanel', ref: 'jumpManager' },
            { name: 'ViewPanelManager', method: 'togglePanel', ref: 'viewPanelManager' },
            { name: 'ScoreDetailManager', method: 'toggle', ref: 'scoreDetailManager' }
        ];

        managers.forEach(m => {
            if (m.name !== exceptManagerName && this.app[m.ref]) {
                const manager = this.app[m.ref];
                if (manager[m.method]) {
                    manager[m.method](false);
                }
            }
        });

        // Also close stamp palette if open (ToolManager)
        if (exceptManagerName !== 'ToolManager' && this.app.toolManager?.isStampPaletteOpen) {
            this.app.toolManager.toggleStampPalette(null, null, false);
        }
    }
}
