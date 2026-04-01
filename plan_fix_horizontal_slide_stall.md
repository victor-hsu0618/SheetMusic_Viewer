# 修復橫向翻頁卡頓與佈局壓縮計畫 (Fix Horizontal Slide Stall)

這項計畫旨在解決橫向模式下「頁面並排顯示」以及「跳轉至最後一頁時卡在半路」的 Bug。

## ⚠️ 關鍵問題 (Critical Issue)
- **原本狀態**：`ViewerManager` 會將 PDF 頁面的實體像素寬度（如 `800px`）寫入容器的 Inline Style。
- **改動後狀態**：在橫向模式下，強制確保容器寬度為 **`100vw`**，無視 PDF 的原始比例，以確保 `scroll-snap` 能精確對齊。

## 擬定改動 (Proposed Changes)

### 1. 視覺佈局修復 (`src/styles/viewer.css`)
在橫向模式下強化 CSS 宣告，防止 JS 注入的像素寬度破壞 `100vw` 佈局。

#### [MODIFY] [viewer.css](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/styles/viewer.css)
- 為 `body.mode-horizontal .page-container` 加入 `min-width: 100vw !important` 與 `flex: 0 0 100vw !important`。
- 確保 `#pdf-viewer` 的寬度能根據 `100vw` 的倍數正確撐開。

### 2. 渲染邏輯調整 (`src/modules/ViewerManager.js`)
優化寬度注入邏輯，使其具備「閱讀模式感知」。

#### [MODIFY] [ViewerManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/ViewerManager.js)
- 在 `renderPDF` 與 `probeAllPageHeights` 方法中，加入判斷：若為橫向模式，則不寫入像素寬度。
- 確保在進入橫向模式時，系統能正確重置所有頁面容器的彈性狀態。

## 驗證計畫 (Verification Plan)

### 自動化測試
- 執行 `npm run test:e2e` 檢查基本翻頁。

### 手動測試 (iPad / Tablet)
- **最後一頁跳轉**：點擊跳轉至最後一頁，確認頁面能穩定對齊左緣，且畫面中不再出現前一頁的殘影。
- **比例檢查**：確認橫向模式下每一頁都確實佔滿螢幕寬度（100vw），而非並排顯示。
