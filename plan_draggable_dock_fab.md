# 實作計畫：全螢幕可拖曳之 Docking Bar 控制球 (Debug Style)

將 Docking Bar 的控制入口從固定按鈕升級為可自由拖曳、具備除錯工具質感的懸浮球 (FAB)，用以控制底欄的「收合/展開 (縮放/收納)」。

## 預期改動範圍

| 功能模組 | 原本設計狀態 | 預計修改後的設計狀態 |
| :--- | :--- | :--- |
| **Docking Bar 元件** | 底部導航條缺少縮放工具（因之前被錯誤移除）。 | **還原組件**。將 Fit Width, Fit Height, Zoom +/- 重新載入底欄，對齊專業閱譜需求。 |
| **控制入口 (FAB)** | `sf-dock-fab` 位置固定在底欄上方，不可移動，視覺較普通。 | **Debug 控制球**。獨立於底欄，支持手指/滑鼠全螢幕拖曳、自動靠邊磁吸、位置記憶。 |
| **收合邏輯** | 點擊固定按鈕執行 toggle。 | 點擊「可移動懸浮球」執行 toggle，球體隨導航條狀態動態變換 Icon（向上/下箭頭）。 |

---

## 實作步驟

### 1. [REVERT] 還原底欄功能與清理
- 刪除 `src/modules/ZoomFABManager.js` 與 `src/styles/zoom-fab.css`。
- 修改 `src/main.js` 移除上述模組的註冊。
- 修改 `src/modules/DockingBarManager.js`，將 `_fitw`, `_fith`, `_zoomin`, `_zoomout` 重新加入按鈕清單。

### 2. [CORE] 實作 `DockingBarManager` 拖曳引擎
- **增加 pointer 事件**：在 `_createFab()` 中加入 `pointerdown`, `pointermove`, `pointerup` 監聽。
- **座標計算**：使用 `requestAnimationFrame` 進行平滑位移。支持 iPad 觸控手指偏移校正。
- **邊界保護 (Clamping)**：確保懸浮球不會被拖出視窗範圍或被 Safari 工具列遮擋。
- **磁吸物理 (Snapping)**：放手後球體自動滑向距離距離最近的左/右邊緣（仿效 iOS AssistiveTouch）。
- **持久化**：將座標（x, y 比率）儲存至 `localStorage`，確保重新載入後位置不變。

### 3. [STYLE] [dock-bar.css](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/styles/dock-bar.css)
- **視覺重塑**：將 `sf-dock-fab` 調整為較大的、圓潤的、深色毛玻璃質感的球體。
- **狀態動畫**：加入拖曳時的輕微縮放感 (`transform: scale(1.1)`) 以及收合/展開時的姿態變換。

---

## 使用者確認事項 (User Review Required)

> [!IMPORTANT]
> **磁吸行為**：您偏好讓懸浮球「自由停在螢幕任何位置」，還是「放手後自動吸附到最近的左/右邊緣」？
> **預設位置**：初次載入時，建議放在右下角（Docking Bar 正上方，距離底部 85px）。

## 驗證計畫

### 手動驗證重點
1. **拖曳流領度**：在 iPad 上長按並快速移動，檢查是否有 Layout Thrashing。
2. **位置記憶**：拖曳到新位置後，重新整理頁面，檢查球體是否停留在該處。
3. **功能連動**：在球體位於螢幕中間時點擊，檢查底部的 Docking Bar 是否能正確執行「縮放 (展開/收合)」動作。
