# 橫向模式功能修復實作計畫 (implementation_plan.md)

使用者回報在橫向模式下點擊與手勢失效。經過診斷，我們確認是核心組件中的捲動鎖定邏輯與 CSS 佈局發生衝突所致。

## 問題診斷 (Diagnostic Findings)

1.  **ViewerManager 捲動鎖定 (核心原因)**：
    *   `ViewerManager.updateHorizontalPanState` 方法在每次重新計算頁面座標 (`updatePageMetrics`) 時，會強制將 `overflowX` 設為 `hidden` 並將 `scrollLeft` 重置為 `0`。
    *   這導致橫向捲動功能被 JS 硬性封鎖，且吸附效果 (Scroll Snap) 會不斷被重置回到第一頁。
2.  **彈出面板 (ViewPanel) ID 遺失/隱藏**：
    *   `ViewPanelManager` 嘗試獲取的 `view-control-panel` 在 `index.html` 中可能因為之前的版本調整而未正確宣告或隱蔽，這可能導致點擊控制按鈕時報錯。
3.  **手勢判定範圍補償**：
    *   `GestureManager.handleZoneTap` 在橫向模式下對「下一頁」的區域判定可能受 `width: 100%` 的頁面容器干擾（若容器過寬，點擊可能落於無效區域）。

## 預計修改狀態對比 (Before vs After)

### 1. 捲動屬性管理
*   **原本狀態**：JS 無視模式，強制將橫向捲動設為 `hidden`。
*   **修改後狀態**：`ViewerManager` 僅在「垂直模式」下鎖定橫向捲動。在「橫向模式」下，將決定權交還給 CSS (`overflow-x: auto`)。

### 2. 佈局容器適配
*   **原本狀態**：`.page-container` 在橫向模式下寬度固定為 `100%` (父容器彈性寬度)，且缺乏明確的 `scroll-snap-align`。
*   **修改後狀態**：修正 `.page-container` 的寬度屬性，並在橫向時強制 `flex-shrink: 0` 防止頁面被壓縮。

### 3. 跳轉邏輯強化
*   **原本狀態**：`JumpManager` 的 `goToPage` 對於橫向捲動的 `top/left` 座標切換不完全。
*   **修改後狀態**：修正跳轉座標，確保在使用微動 (`smooth`) 跳轉時，能與系統 `scroll-snap` 同步。

## 待修改檔案與範圍 (Proposed Changes)

#### [MODIFY] [ViewerManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/ViewerManager.js)
*   **第 1000 行左右**：修改 `updateHorizontalPanState`，加入 `if (this.app.readingMode === 'horizontal') return;` 防護。
*   **第 1013 行**：修改 `createPageElement`，移除行內 `width: 100%`，交由 CSS 控制。

#### [MODIFY] [viewer.css](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/styles/viewer.css)
*   強化 `body.mode-horizontal .viewer-container` 的屬性，強制 `overflow-x: auto !important` 以對抗 JS 殘留影響。

#### [MODIFY] [GestureManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/GestureManager.js)
*   檢查並優化 `handleZoneTap` 的邊界判定座標點。

## 驗證計畫 (Verification Plan)

### 手動測試 (Manual Checks)
1.  **捲動自由度**：開啟橫向模式後，確認可以用手指自由水平滑動，且滑動停止後會正確吸附 (Snap) 到頁面中心。
2.  **跳轉反應**：點擊螢幕左右兩側區域，確認頁面能立即觸發橫向切換。
3.  **模式持久化測試**：切換至橫向模式後重新整理頁面，確認水平換頁功能依然正常運作且不被鎖定。

## 通關密語
本計畫符合開發規範，並直接存檔於專案根目錄。若確認無誤，請說 **"engage"**。
