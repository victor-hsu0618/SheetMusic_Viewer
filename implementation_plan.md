# 圖章工具面板設定與樂譜特定縮放實作計畫

本計畫旨在圖章工具面板（Stamp Palette）中新增一個「面板設定」子分頁，讓使用者能快速調整全域圖章大小比例，並新增「針對目前樂譜」的專屬縮放比例設定，以應對不同出版商樂譜中音符大小差異的問題。

## 已知機制
- **全域比例 (`stampSizeMultiplier`)**：使用者自定義的全域偏好。
- **頁面智慧比例 (`pageScales`)**：系統根據 PDF 原始尺寸（A4/A3 等）自動計算的補償值。
- **目前公式**：`基礎大小 * 頁面比例 * 全域比例 * 縮放等級`。

## 擬議變更

### 1. [ScoreFlow] 核心邏輯 (`src/main.js`)
- 初始化 `this.scoreStampScale = 1.0`。
- 新增 `updateScoreStampScale(val)` 方法，用於更新數值、存檔並重繪註解層。

### 2. [ScoreDetailManager] 樂譜詳細資料管理 (`src/modules/ScoreDetailManager.js`)
- 在 `currentInfo` 結構中新增 `stampScale` 欄位。
- 更新 `load()` 與 `save()` 方法，確保該數值與 PDF Fingerprint 綁定並持久化於 `localStorage`。

### 3. [ToolManager] 圖章面板 UI 優化 (`src/modules/tools.js`)
- **新增分頁**：在 `category-ribbon` 末尾新增一個具有「設定圖示 (Gear Icon)」的切換按鈕。
- **實作設定面板**：
    - 新增 `renderSettingsPanel()` 方法。
    - 面板包含兩個拖桿 (Range Sliders) 及數值顯示：
        1. **全域大小 (Global Scale)**：同步調整 `this.app.stampSizeMultiplier`。
        2. **譜面縮放 (Score Scale)**：調整針對此樂譜的 `this.app.scoreStampScale`。
- **動態更新**：確保調整拖桿時能即時觸發 `redrawAllAnnotationLayers()`。

### 4. [AnnotationRenderer] 渲染引擎更新 (`src/modules/annotation/AnnotationRenderer.js`)
- 更新 `drawStampOnCanvas` 中的 `baseSize` 運算：
    ```javascript
    const scoreMultiplier = this.app.scoreStampScale || 1.0;
    const baseSize = 26 * (this.app.scale / 1.5) * pageFactor * userMultiplier * scoreMultiplier;
    ```
- 確保文字類圖章與圖形類圖章皆套用此新比例。

## 驗證計畫

### 自動化測試
- 目前無直接相關的 E2E 測試，將進行手動驗證。

### 手動驗證流程
1. **面板功能**：點擊圖章面板下方的新分頁圖示，確認設定面板正確開啟。
2. **全域調整**：調整「全域大小」拖桿，確認所有頁面的圖章同步縮放。
3. **特定縮放**：調整「譜面縮放」拖桿，確認僅目前樂譜受影響。
4. **持久化**：
    - 關閉並重新開啟同一份 PDF，確認比例設定被正確讀取。
    - 切換至另一份不同的 PDF，確認「譜面縮放」回到該 PDF 專屬的值（預設 1.0）。

---
**請檢閱此計畫。若確認無誤，請告訴我 "engage"。**
