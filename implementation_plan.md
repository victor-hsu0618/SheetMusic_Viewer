# Setlist Phase 1 實作計畫 (Implementation Plan)

## 專案目標 (Project Goal)
在 `ScoreFlow` 中建立「演出曲目清單 (Setlist)」系統的第一階段。
讓使用者能建立多個獨立的音樂會歌單，並且支援從 Library 批次加入、從書庫搜尋加入、或是**「邊看譜邊加入」**。

---

## 修改前後狀態對比 (State Comparison)

### 1. 核心資料管理層
- **原本的設計狀態**：
  應用程式僅有 `ScoreManager.js`，將所有 `score_registry` (樂譜索引) 儲存於單一的層級。無群組化及排序儲存功能。
- **預計修改後的設計狀態**：
  新增一個核心基礎設施 **`src/modules/SetlistManager.js`**。
  - 在 `db.js` 添加 `setlists` 資料儲存區。
  - `SetlistManager` 專責處理清單的 CRUD（建立、重新命名、刪除）以及將樂譜的 `fingerprint` 寫入特定清單陣列中。

### 2. UI 佈局 (Library 內)
- **原本的設計狀態**：
  打開書庫 (Library overlay) 後，頂部只有 Search 搜尋列與右上角的關閉按鈕，中間是所有的樂譜縮圖 Grid。
- **預計修改後的設計狀態**：
  1. 在 Library 頂部建立 **「Library (書庫)」** 與 **「Setlists (歌單)」** 的 Tab 標籤切換。
  2. 新增一個新的 Grid / List 視圖專門顯示目前所有的 Setlist 專案（如「2026 巡迴演出」）。
  3. 當在書庫點擊 `Select (選擇模式)` 並勾選多份樂譜時，底部的 Action Bar 新增一個 **「+ 加入歌單」** 的功能按鈕。

### 3. UI 佈局 (閱讀模式中)
- **原本的設計狀態**：
  在使用者打開某份 PDF 進入閱讀狀態時，只能加標籤印章或是修改 Score Info。無法將其歸類。
- **預計修改後的設計狀態**：
  在 **Score Detail (樂譜詳情面板)** 的 General 或 System 分頁中，新增一個 **「加入 Setlist」** 按鈕或下拉選項。讓樂手在使用樂譜時，能隨時點擊將其加入對應的歌單中，不需要跳出樂譜回到書庫。

---

## 接下來的工作項目 (Phase 1 Tasks)

1. [ ] 建立 `src/modules/SetlistManager.js`。
2. [ ] 在 `src/main.js` 中將 `SetlistManager` 註冊。
3. [ ] 修改 `src/styles/score-manager.css` 增加 Tab 切換樣式。
4. [ ] 實作在 Library 介面切換檢視「樂譜」或「歌單」的綁定邏輯。

---
**請檢視此計畫，若您同意這個 Phase 1 的底層與 UI 建立方向，請回覆 "engage"，我將開始動手實作程式碼！**

---

# Setlist Phase 1.5 UI 升級與排序實作 (UI Polish & Sorting)

## 專案目標 (Project Goal)
優化 Setlist 建立的互動體驗，並加入拖曳排序功能，提升對使用者的友善度。

## 修改前後狀態對比 (State Comparison)

### 1. 建立歌單對話框 UI
- **原本的設計狀態**：
  在使用者點擊「Create Custom Setlist」或「⊕ Create New Setlist」時，會呼叫原生的 `prompt()` 視窗。視覺太過簡陋且不符合 ScoreFlow 的 Glassmorphism UI 風格。
- **預計修改後的設計狀態**：
  在 `DocActionManager.js` 內的 `showDialog` API 擴充 `type: 'input'` 功能（或是共用現有的模態框處理邏輯），讓系統內建的漂亮對話框支援輸入文字。原本呼叫 `prompt()` 的地方將改用 `app.showDialog({ type: 'input' })`。

### 2. 歌單內曲目拖曳排序 (Drag and Drop)
- **原本的設計狀態**：
  在歌單詳細面版 (`setlist-detail-list`) 內，純粹將資料列出，最前方的拖曳 Handle 圖示 (`☰`) 僅為裝飾，完全無法拖拉改變曲目先後。
- **預計修改後的設計狀態**：
  為每一個樂譜 Row 加入 HTML5 Drag and Drop (DND) API 綁定。
  - 將 Row 設為 `draggable="true"`。
  - 綁定 `dragstart`、`dragover`、`dragleave`、`drop` 等事件以實作視覺回饋。
  - 當拖放完成時，呼叫 `SetlistManager.reorderScore(setId, oldIndex, newIndex)` 重新排序並刷新畫面。

---

## 接下來的工作項目 (Phase 1.5 Tasks)

1. [x] 擴充 `DocActionManager.js` 的 `showDialog`，加入文字輸入功能 (`type: 'input'`)。
2. [x] 在 HTML 中擴增對應的 `div` input 結構至 system_dialog。
3. [x] 將 `SetlistManager.js` 裡的 `prompt()` 更換為美觀的對話框 API。
4. [x] 在 `SetlistManager.renderDetailList()` 中掛載 Drag & Drop 事件處理，實作拖曳介面並呼叫 `reorderScore`。

---
---
**請檢視此計畫，若您同意這個 Phase 1.5 的優化方向，請回覆 "engage"，我將開始實作拖曳排序與對話框！**

---

# Setlist Phase 2: Performance Mode & Navigation (演奏模式實作)

## 專案目標 (Project Goal)
實作「演奏模式 (Performance Mode)」，讓使用者在歌單中能無縫切換樂譜，並在 Doc Bar 提供直覺的導航控制。

## 修改前後狀態對比 (State Comparison)

### 1. 啟動演奏 (Starting Performance)
- **原本的設計狀態**：
  雖然 `SetlistManager` 有 `enterPerformanceMode` 方法，但 UI 上沒有入口。
- **預計修改後的設計狀態**：
  在 Setlist Detail 面板上方新增一個顯眼的 **「▶ Start Performance」** 按鈕。

### 2. 演奏控制列 (Performance Controls)
- **原本的設計狀態**：
  `DocBar` 在閱讀任何樂譜時都顯示相同的工具。
- **預計修改後的設計狀態**：
  當 `performance-mode-active` 類別被加入 `body` 時，`DocBar` 會顯示：
  - **[Prev]** 與 **[Next]** 旋鈕/按鈕。
  - 顯示當前進度（如 `2 / 5`）。
  - 當處於第一首或最後一首時，對應按鈕自動變灰 (disabled)。

### 3. 自動載入邏輯
- **原本的設計狀態**：
  必須手動回 Library 開啟下一份 PDF。
- **預計修改後的設計狀態**：
  點擊 Next 時，`SetlistManager` 自動呼叫 `scoreManager.loadScore` 載入下一份樂譜，並自動跳轉至開頭。

---

## 接下來的工作項目 (Phase 2 Tasks)

1. [ ] 在 `index.html` 的 `setlist-detail-view` 中加入 「Start Performance」按鈕。
2. [ ] 在 `index.html` 的 `floating-doc-bar` 中加入 `performance-controls` 容器（含 Prev, Progress, Next）。
3. [ ] 修改 `score-manager.css` 處理 `performance-controls` 的顯隱邏輯。
4. [ ] 實作 `SetlistManager.nextScore()` 與 `SetlistManager.prevScore()` 指令。
5. [ ] 綁定 UI 事件與 `SetlistManager` 的控制逻辑。

---
**請檢視此計畫，若您同意這個 Phase 2 的演奏模式方向，請回覆 "engage"！**
