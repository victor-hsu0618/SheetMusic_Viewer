# [實作計畫] 支援「直式換頁」與「橫式換頁」切換模式

目前的 `ScoreFlow` 採用的是傳統的「縱向連續捲動 (Vertical Continuous)」，這在瀏覽長篇樂譜時很方便，但在演奏 (Performance) 時，許多音樂家更偏好「橫式翻頁 (Horizontal Flip)」。這份計畫旨在擴充檢視器功能，讓使用者能根據需求切換閱讀模式。

## 使用者評論與決策 (User Review Required)

> [!IMPORTANT]
> **切換邏輯的副作用**
> 1. **座標映射改變**：當模式切換為「橫向」時，原本基於 `offsetTop` (垂直距離) 的跳轉邏輯需改為 `offsetLeft` (水平距離)。這會影響 `JumpManager` 的所有跳轉方法。
> 2. **Ruler (導航尺) 的適應**：側邊的跳轉導航尺目前的設計是根據縱向高度映射。在橫向模式下，我們需要決定導航尺是否也要改為水平展示，或者維持垂直（作為全譜進度條）。
> 3. **翻頁動畫**：橫式模式通常伴隨「分頁感 (Paging)」，建議引入 `CSS Scroll Snap` 來達成俐落的換頁感。

## 預計修改狀態 (Design Comparison)

| 功能 | 原本狀態 (Vertical) | 預計修改後 (Horizontal) |
| :--- | :--- | :--- |
| **容器排列** | `flex-direction: column` | `flex-direction: row` |
| **捲動軸** | `overflow-y: auto`, `overflow-x: hidden` | `overflow-y: hidden`, `overflow-x: auto` |
| **跳轉參考** | 使用 `target.offsetTop` | 使用 `target.offsetLeft` |
| **翻頁感** | 連續捲動 | 分頁對齊 (`scroll-snap-type: x mandatory`) |

---

## 預計改動範圍

### 1. 核心狀態與設定 (App State) [MODIFY] [main.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/main.js)
- 在全域設定中新增 `readingMode: 'vertical' | 'horizontal'`。
- 持久化儲存此設定至 IndexedDB (透過 `PersistenceManager`)。

### 2. 介面樣式切換 [MODIFY] [viewer.css](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/styles/viewer.css)
- 新增 `.mode-horizontal` 相關樣式，將 `#pdf-viewer` 改為水平布局。
- 針對橫向模式優化 `.page-container` 的寬高佔比，確保一頁佔滿可見區域。

### 3. 跳轉邏輯適應 [MODIFY] [JumpManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/JumpManager.js)
- 修改 `goToPage` 與 `jumpToStamp` 方法。
- 判斷當前模式：若為 `horizontal`，則捲動至 `scrollLeft`。

### 4. 檢視面板更新 [MODIFY] [ViewPanelManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/ViewPanelManager.js)
- 在「檢視面板」新增一個切換按鈕或選單，讓使用者切換 `Reading Mode`。

---

## 開放性問題 (Open Questions)

> [!TIP]
> 1. **單頁 vs 雙頁**：在橫向模式下，若螢幕寬度足夠 (如 iPad 橫向使用)，是否要自動切換為「雙頁並排」模式？
> 2. **翻頁手勢與 Tap Zone**：目前滑動手勢已支援橫向。在橫式模式下，是否需要強化「點擊邊緣翻頁」的視覺回饋？

## 驗證計畫

### 手動測試項目
1. **模式切換**：點擊切換鈕後，樂譜能即時由縱向排列變更為橫向排列。
2. **換頁精準度**：在橫向模式下，點擊「下一頁」應精準對齊到下一張紙的左邊界。
3. **數據持久化**：切換模式後重新整理頁面，應能記住上次的選擇。
