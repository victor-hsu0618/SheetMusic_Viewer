# 實作計畫：縮放獨立浮動艙 (Zoom FAB)

將縮放控制從 `Docking Bar` 抽離，轉換為一個獨立的高級浮動組件，仿效 `vConsole` / `Eruda` 等除錯工具的設計風格，提升操作直覺性並優化底部空間。

## 預期改動範圍

| 功能模組 | 原本設計狀態 | 預計修改後的設計狀態 |
| :--- | :--- | :--- |
| **Docking Bar** | 包含 Fit W, Fit H, Zoom+, Zoom- 四個原生按鈕。 | **淨化完成**。移除上述按鈕，讓底欄更專注於工具切換。 |
| **Zoom 控制介面** | 分散的靜態按鈕，且不顯示目前精確比例。 | **獨立浮動球 (Zoom FAB)**。常駐顯示百分比（如 `100%`），點擊展開膠囊選單。 |
| **視覺風格** | 依附於底欄的主題樣式。 | **Glassmorphism (毛玻璃)**。獨立懸浮，具備呼吸燈感，支援自適應主題色。 |

---

## 實作步驟

### 1. [NEW] [ZoomFABManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/ZoomFABManager.js)
建立核心邏輯引擎：
- **初始化**：在畫面右下角建立浮動按鈕（FAB）。
- **數據同步**：監聽 `ViewerManager` 的縮放動作，即時更新按鈕上的 `%` 文字。
- **菜單邏輯**：實作展開/收合動畫逻辑，管理 Fit W / Fit H / 進階縮放的回調。

### 2. [NEW] [zoom-fab.css](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/styles/zoom-fab.css)
設計專業視覺效果：
- **FAB 容器**：圓角膠囊形狀，背景模糊 (`backdrop-filter`)。
- **展開動畫**：使用 `cubic-bezier` 呈現俐落的彈開感。
- **主題連動**：使用 `var(--primary)` 作為數據顯示的顏色。

### 3. [MODIFY] [DockingBarManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/DockingBarManager.js)
- **按鈕移除**：刪除 `_buildPages` 中關於 `_fitw`, `_fith`, `_zoomin`, `_zoomout` 的定義。
- **佈局調整**：重新排列其餘按鈕，確保間距平衡。

### 4. [MODIFY] [main.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/main.js)
- **匯入與註冊**：新增 `ZoomFABManager` 的匯入與執行實例化。

---

## 使用者確認事項 (User Review Required)

> [!IMPORTANT]
> **預設位置**：我計畫將其放在畫面**右下方**（略高於 Standalone Scrollbar 的位置）。
> **展開方向**：點擊後選項將向 **上方** 或 **左方** 扇形展開。您偏好哪種方式？

## 驗證計畫

### 手動驗證重點
1. **數據即時性**：使用兩指撥動 (Pinch Zoom) 時，檢查 FAB 上的百分比是否同步更新。
2. **層級檢查**：確保 FAB 不會被 `Settings Panel` 或是 `Jump Panel` 遮擋（Z-Index 調校）。
3. **主題切換**：在 Dark / Light / Midnight 模式下，檢查百分比文字的對比度。
