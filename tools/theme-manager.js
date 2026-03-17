/**
 * ScoreFlow Developer Hub - Modular Theme Manager
 * Standardizes theme switching across diagnostic tools.
 */

class ThemeManager {
    constructor() {
        this.themes = [
            { id: 'default', label: 'Midnight', class: 'dot-midnight' },
            { id: 'midnight-deep', label: 'Deep', class: 'dot-deep' },
            { id: 'stage-high-contrast', label: 'Stage', class: 'dot-stage' }
        ];
        this.currentTheme = localStorage.getItem('scoreflow_hub_theme') || 'default';
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
        this.createSwitcher();
    }

    applyTheme(themeId) {
        if (themeId === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', themeId);
        }
        this.currentTheme = themeId;
        localStorage.setItem('scoreflow_hub_theme', themeId);
        this.updateActiveDot();
    }

    createSwitcher() {
        // Only create if it doesn't exist
        if (document.querySelector('.theme-switcher')) return;

        const container = document.createElement('div');
        container.className = 'theme-switcher';
        container.title = 'Switch Hub Theme';

        this.themes.forEach(theme => {
            const dot = document.createElement('div');
            dot.className = `theme-dot ${theme.class}`;
            dot.dataset.id = theme.id;
            dot.title = theme.label;
            dot.addEventListener('click', () => this.applyTheme(theme.id));
            container.appendChild(dot);
        });

        document.body.appendChild(container);
        this.updateActiveDot();
    }

    updateActiveDot() {
        document.querySelectorAll('.theme-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.id === this.currentTheme);
        });
    }
}

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
    window.hubThemeManager = new ThemeManager();
});
