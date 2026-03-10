# 修復 iPad PDF 異常關閉 (Crash) 問題實施計畫 (已確認)

## 核心問題診斷

目前的 `ViewerManager.js` 在執行 `loadPDF`、`changeZoom` 或使用者點擊 **「Fit to Width」** 時，會觸發 `renderPDF()`。
該函式會採取同步迴圈：
1. 清除所有舊頁面。
2. 針對 PDF 的**每一頁**建立 Canvas。
3. 立即呼叫 `page.render()` 進行繪製。

**崩潰原因：** 當點擊 「Fit to Width」 時，縮放倍率通常會提高，Canvas 的記憶體佔用隨之增加。在 iPad 上，一次性分配數十個高解析度 Canvas 的緩衝區會瞬間耗盡 JavaScript 堆疊或分頁記憶體，導致瀏覽器直接崩潰並顯示「此網頁發生問題，已重新載入」。

## 提議變更：分段渲染與虛擬容器

我們將優化 `renderPDF`，使其從「全量同步渲染」轉為「非同步按需渲染」。

### 1. [ViewerManager](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/ViewerManager.js) 修改

-   **改寫 `renderPDF`**：
    -   不再於迴圈中 `await page.render`。
    -   僅建立 `.page-container` 佔位容器，並根據當前 `scale` 預設容器高度，確保捲動條長度正確。
-   **引入監視機制 (`IntersectionObserver`)**：
    -   為每個容器標記 `data-rendered="false"`。
    -   當容器進入可視區域 (或接近時) 才動態觸發該頁面的實體渲染。
-   **縮放處理 (Zoom/Fit to Width)**：
    -   縮放時，僅更新容器尺寸並清除舊 Canvas。
    -   只有「當前看得到」的頁面會立即重新渲染，其餘頁面待捲動到時再處理。

### 2. [main.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/main.js) 修改

-   確保標記圖層 (Annotation Layers) 也能隨頁面按需建立，避免開發中的邏輯斷層。

---

## 驗證計畫

### 手動驗證流程 (iPad)
1.  載入一份多頁 PDF。
2.  **關鍵測試**：點擊 「Fit to Width」。
    -   *預期結果*：當前頁面流暢放大，無閃退。
3.  快速向下捲動。
    -   *預期結果*：新頁面在進入視窗時出現加載動畫或短暫延遲後顯示，整體保持穩定。

---
*此計畫已獲使用者確認，開始執行。*
