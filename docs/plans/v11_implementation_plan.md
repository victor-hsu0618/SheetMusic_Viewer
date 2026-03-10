# 實作計畫 - Page Up/Down 觸發範圍修正 (第 11 版)

目標是將導航熱區的計算基準改為「PDF 頁面顯示比例」，並精確設定每個區域的點擊指示箭頭方向。

## 建議變更

### [InputManager]
#### [修改] [InputManager.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/InputManager.js)
- **計算基準修正**：
  - 觸發區域改為以 **PDF 頁面容器 (`.page-container`) 的寬度** 為基準。
- **指示器方向 (Indicator Directions)**：
  - **頂部 35% 區域**：點擊顯示 **「向上箭頭」** (Up)。
  - **下方 65% 之左側 40%**：點擊顯示 **「向左箭頭」** (Left)。
  - **下方 65% 之右側 60%**：點擊顯示 **「向右箭頭」** (Right)。
- **拖曳阻斷 (Mouse Drag Prevention)**：
  - 加強 `InputManager` 的滑鼠監聽，計算 `mousedown` 到 `mouseup` 的總位移。
  - **閾值**：若移動超過 5-10 像素，判定為「拖曳」或「捲動」，**不執行導航跳轉**。
- **視覺效果強化 (動態 T 字型提示線)**：
  - **真正的 T 字型**：修正幾何邏輯，縱向線條將從橫向線條位置 **「向下延伸」**，形成標準的 T 字型，而非交會的十字型。
  - **顯示時機**：**預設為完全隱藏**。不再常駐顯示，解決視覺干擾。
  - **觸發回饋**：僅在點擊且 **「成功觸發換頁行為」** 時，透過 JS 使其顯示 **0.5 秒** 後自動淡出。
  - **比例限制**：維持 T 字型長度佔寬/高的 **1/5**。
  - **設定整合**：Sidebar 設定開關依然有效（若關閉則不進行閃爍回饋）。

### [Sidebar & Settings]
#### [修改] [index.html](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/index.html)
- 維持「顯示導航觸發區提示線」開關。

### [Styles]
#### [修改] [interaction.css](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/styles/interaction.css)
- 更新 `.nav-zone-divider` 樣式，實現更明顯的微光/邊緣發光效果。
- 確保提供 `up`, `left`, `right` 三種點擊指示器動畫樣式。

### [PRD]
#### [修改] [PRD.MD](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/PRD.MD)
- 更新 4.1 章節，對齊「PDF 頁面基準」與「特定箭頭方向」的設計描述。

## 驗證計畫

### 手動驗證
1. **頂部測試**：點擊頂部 35% 區域，確認出現「向上」箭頭。
2. **左部測試**：點擊左下 40% 區域，確認出現「向左」箭頭。
3. **右部測試**：點擊右下 60% 區域，確認出現「向右」箭頭。
4. **比例測試**：縮放 PDF，確認熱區仍精確跟隨 PDF 頁面邊界。
5. **開關測試**：確認提示 UI 可由 Sidebar 正常隱藏。

### 自動化測試
- 目前以手動驗證為主。
