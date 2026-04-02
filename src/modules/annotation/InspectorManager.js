/**
 * InspectorManager
 * ──────────────────
 * 標記巡檢助手專用模組。
 * 負責在當前頁面的標記之間進行循環定位、對焦導航以及快速清理。
 */
export class InspectorManager {
    constructor(app) {
        this.app = app;
        this.isActive = false;
        this.currentIndex = -1;
        this.pageStamps = [];
        this.filterMode = 'all'; // 'all' | 'tiny'
        this._panel = null;
        this._radarFrame = null;
        this._pulseAlpha = 0;
        this._pulseRadius = 0;
    }

    /**
     * 開啟巡檢模式
     * 預設針對當前最上方可見頁面開始。
     */
    start() {
        if (this.isActive) return;
        
        // Correctly get the current visible page from JumpManager
        const pageNum = this.app.jumpManager?.currentPage || 1;
        this.refreshStamps(pageNum);
        
        if (this.pageStamps.length === 0) {
            this.app.uiManager?.showMessage(`第 ${pageNum} 頁找不到任何標記可巡檢`, 'info');
            return;
        }

        this.isActive = true;
        this.currentIndex = 0;
        
        // --- 優化：先顯示面板，再執行對焦，避免計算延遲導致沒反應的假象 ---
        this.showPanel();
        
        try {
            this.focusCurrent();
        } catch (err) {
            console.error('[Inspector] Focus failed during start:', err);
        }

        this.app.redrawStamps(pageNum);
    }

    /**
     * 關閉巡檢模式
     */
    stop() {
        this.isActive = false;
        this.hidePanel();
        this.app.redrawAllAnnotationLayers();
        if (this._radarFrame) cancelAnimationFrame(this._radarFrame);
    }

    /**
     * 重新整理當前頁面的標記列表
     */
    refreshStamps(pageNum) {
        const all = this.app.stamps.filter(s => s.page === pageNum && !s.deleted);
        if (this.filterMode === 'tiny') {
            this.pageStamps = all.filter(s => (s.lineWidth || 0) < 6 || (s.points?.length || 0) <= 2);
        } else {
            this.pageStamps = all;
        }
    }

    /**
     * 切換到下一個
     */
    next() {
        if (!this.isActive || this.pageStamps.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.pageStamps.length;
        this.focusCurrent();
    }

    /**
     * 切換到上一個
     */
    prev() {
        if (!this.isActive || this.pageStamps.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.pageStamps.length) % this.pageStamps.length;
        this.focusCurrent();
    }

    /**
     * 刪除當前巡檢到的標記
     */
    async deleteCurrent() {
        const target = this.pageStamps[this.currentIndex];
        if (!target) return;

        const page = target.page;
        await this.app.annotationManager.eraseStampTarget(target);
        
        // 刪除後更新列表並維持位置
        this.refreshStamps(page);
        if (this.pageStamps.length === 0) {
            this.stop();
            return;
        }
        this.currentIndex = Math.min(this.currentIndex, this.pageStamps.length - 1);
        this.focusCurrent();
        this.updatePanelText();
    }

    /**
     * 對焦到當前標記
     */
    focusCurrent() {
        const target = this.pageStamps[this.currentIndex];
        if (!target) return;

        // 向渲染器發送目標通知
        this.app.inspectorTarget = target;
        this.app.redrawStamps(target.page);

        // 控制面板更新
        this.updatePanelText();

        // 自動捲動對焦
        this.scrollToTarget(target);
    }

    /**
     * 執行頁面对齊 (Scroll To)
     */
    scrollToTarget(stamp) {
        const metrics = this.app.viewerManager?._pageMetrics;
        const m = metrics ? metrics[stamp.page] : null;
        if (!m) return;

        // 計算中心點絕對座標
        const targetX = stamp.points ? stamp.points[0].x : stamp.x;
        const targetY = stamp.points ? stamp.points[0].y : stamp.y;

        const absX = m.left + (targetX * m.width);
        const absY = m.top + (targetY * m.height);

        // 平滑對焦到螢幕正中央 (viewport center)
        const vW = window.innerWidth, vH = window.innerHeight;
        this.app.viewer.scrollTo({
            top: absY - (vH / 2),
            left: absX - (vW / 2),
            behavior: 'smooth'
        });
    }

    /**
     * 面板 UI 部分
     */
    showPanel() {
        if (this._panel) {
            this._panel.classList.add('open');
            return;
        }

        const p = document.createElement('div');
        p.className = 'sf-inspector-panel';
        p.innerHTML = `
            <div class="sf-inspector-header">🕵️ 標記巡檢助手</div>
            <div class="sf-inspector-body">
                <div class="sf-inspector-controls">
                    <button id="ins-prev" title="上一個">◀</button>
                    <span id="ins-count">0 / 0</span>
                    <button id="ins-next" title="下一個">▶</button>
                </div>
                <div class="sf-inspector-actions">
                    <button id="ins-delete" class="ins-danger" title="刪除標記">🗑️ 刪除</button>
                    <button id="ins-close" title="退出巡檢">✕</button>
                </div>
            </div>
        `;

        document.body.appendChild(p);
        this._panel = p;

        p.querySelector('#ins-prev').addEventListener('click', () => this.prev());
        p.querySelector('#ins-next').addEventListener('click', () => this.next());
        p.querySelector('#ins-delete').addEventListener('click', () => this.deleteCurrent());
        p.querySelector('#ins-close').addEventListener('click', () => this.stop());

        requestAnimationFrame(() => p.classList.add('open'));
    }

    hidePanel() {
        if (this._panel) this._panel.classList.remove('open');
        this.app.inspectorTarget = null;
    }

    updatePanelText() {
        if (!this._panel) return;
        const countEl = this._panel.querySelector('#ins-count');
        if (countEl) {
            countEl.textContent = `${this.currentIndex + 1} / ${this.pageStamps.length}`;
        }
    }
}
