/**
 * TransitionManager handles the visual page turning effects 
 * for horizontal reading mode.
 */
export class TransitionManager {
    constructor(app) {
        this.app = app;
        // Default style from localStorage or 'none'
        const savedStyle = localStorage.getItem('scoreflow_transition_style') || 'none';
        this.currentStyle = savedStyle;
        this._isAnimating = false;
        this._finishTimeout = null;
    }

    setStyle(style) {
        this.currentStyle = style;
        localStorage.setItem('scoreflow_transition_style', style);
        console.log(`[TransitionManager] Style set to: ${style}`);
    }

    /**
     * Executes the transition effect.
     * @param {number} fromPage The page we are leaving
     * @param {number} toPage The page we are going to
     * @param {Function} scrollFn The function that does the actual scrolling (JumpManager callback)
     */
    async performTransition(fromPage, toPage, scrollFn) {
        if (this.currentStyle === 'none' || this._isAnimating || this.app.readingMode !== 'horizontal') {
            return scrollFn();
        }

        const viewer = this.app.viewer;
        const containers = Array.from(this.app.container.querySelectorAll('.page-container:not(.is-stale)'));
        const fromEl = containers.find(el => parseInt(el.dataset.page) === fromPage);
        const toEl = containers.find(el => parseInt(el.dataset.page) === toPage);

        if (!fromEl || !toEl) return scrollFn();

        this._isAnimating = true;
        const duration = this.currentStyle === 'slide' ? 600 : 500;
        const direction = toPage > fromPage ? 'next' : 'prev';

        // 1. Prepare for Animation
        viewer.style.scrollSnapType = 'none'; // Temporarily disable snap
        fromEl.classList.add('is-transitioning');
        toEl.classList.add('is-transitioning');

        // 2. Apply classes based on style
        if (this.currentStyle === 'slide') {
            const slideClass = direction === 'next' ? 'slide-next-out' : 'slide-prev-out';
            fromEl.classList.add(slideClass);
        } else if (this.currentStyle === 'flip') {
            const flipClass = direction === 'next' ? 'flip-forward-out' : 'flip-backward-out';
            fromEl.classList.add(flipClass);
        }

        // 3. Perform the actual data jump / scroll
        // Wrap in requestAnimationFrame to ensure CSS classes are applied before movement
        requestAnimationFrame(() => {
            scrollFn(); // This updates JumpManager.currentPage and does scrollTo
            
            // 4. Cleanup after animation duration
            if (this._finishTimeout) clearTimeout(this._finishTimeout);
            this._finishTimeout = setTimeout(() => {
                this.finalize(fromEl, toEl);
            }, duration);
        });

        return true;
    }

    finalize(fromEl, toEl) {
        // Remove all transition classes
        const classesToRemove = [
            'is-transitioning', 'slide-next-out', 'slide-next-in',
            'flip-forward-out', 'flip-backward-out'
        ];
        
        if (fromEl) fromEl.classList.remove(...classesToRemove);
        if (toEl) toEl.classList.remove(...classesToRemove);

        // Restore snap
        if (this.app.viewer) {
            this.app.viewer.style.scrollSnapType = 'x mandatory';
        }
        
        this._isAnimating = false;
        this._finishTimeout = null;
        console.log('[TransitionManager] Transition finalized.');
    }
}
