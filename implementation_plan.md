# 修復頁面跳轉與尺規指標顏色問題

此計畫旨在修復 `ScoreFlow` 中頁面跳轉 (Page Jump) 不準確以及尺規指標 (Ruler Pointer) 顏色未正確更新的問題。

## 根本原因分析

1.  **頁面跳轉不準確 (跳到頭尾)**:
    - **原本的設計狀態 (Original State)**: `JumpManager.js` 的 `updateDisplay` 在遍歷 `_pageMetrics` 物件時未經排序。由於 JS 物件 key 的遍歷規則，數字索引（頁碼）的遍歷順序不一定由小到大。
    - **跳轉邏輯 (Jump Logic)**: `goToPage` 直接依賴 DOM 的 `offsetTop`。在頁面縮放或重新渲染期間，DOM 面板數值可能未與 Core Metrics 完全同步。
    - **預計修改後的設計狀態 (Refined State)**: 在計算當前頁碼前對頁碼進行數字排序。`goToPage` 將改為讀取 `ViewerManager._pageMetrics` 以確保數值絕對一致。

2.  **指標未變色**:
    - **原本的設計狀態 (Original State)**: `ruler.js` 的 `nextTargetAnchor` 計算結果在快速捲動時可能被跳過，且尺規上的橘色標記（下一個目標）在 `ruler-next-target` 類別套用時可能因 CSS 權重或顏色變數未正確更新。
    - **預計修改後的設計狀態 (Refined State)**: 加強 `computeNextTarget` 的魯棒性 (Robustness)，並確保 `updateRulerMarks` 在每次 Render 時精確比對當前目標，同時優化 CSS 顯著度。

## 預計修改清單

### [MODIFY] [JumpManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/JumpManager.js)

- 在 `updateDisplay()` 中排序頁碼。
- 修復 `goToPage()` 與 `goToEnd()` 捲動座標計算邏輯。

### [MODIFY] [ruler.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/ruler.js)

- 優化 `computeNextTarget()` 與 `updateRulerMarks()` 的連動邏輯。
- 修復 `nextSystemTarget` 指標的高亮判斷。

### [MODIFY] [ruler.css](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/styles/ruler.css)

- 加強 `.ruler-next-target` 類別的視覺樣式（增加 Shadow 或加強橘色飽和度）。

## 開放性問題 (Open Questions)

- **使用者反饋**: 您提到的「指標也沒有變色」具體是指尺規左邊的橘色標點，還是畫面上那一條橫向的 Jump Beam？（目前計畫同時優化這兩者的反應速度與視覺顯著度）

## 驗證計畫

### 手動驗證
1. 啟動 `npm run dev -- --host`。
2. 使用 iPad 跳轉到中間頁面（例如 P.5），確認是否準確。
3. 觀察跳轉後，尺規左側是否出現明顯的橘色標記指向下一個目標。

### 自動化驗證
- 執行 `npm run test:e2e` 確認基本功能正常。
