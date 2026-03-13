# 實作計畫 - 自定義互動位移設定 (Customizable Interaction Offset)

本計畫旨在區分「畫筆工具」與「印章工具」的位移邏輯，並提供使用者在全域設定中調整位移距離。

## 需求細節
1.  **畫筆工具 (Pen, Highlighter, Line)**：
    *   **滑鼠 (PC)**：0px 位移（精準對齊）。
    *   **觸控 (iPad)**：維持位移（預設 65px，可調），避免手指遮擋。
2.  **印章/標註工具 (Bowing, Articulation, Text 等)**：
    *   **滑鼠 (PC)**：小位移（預設 25px，可調），避免被游標擋住。
    *   **觸控 (iPad)**：大位移（預設 65px，可調），避免手指遮擋。
3.  **可設定性**：在「Global Settings」中提供調整滑桿。

## 預計修改內容

### [Component] UI & State

#### [MODIFY] [index.html](file:///Users/victor/MyProgram/SheetMusic_Viewer/index.html)
*   在 `settings-pane-system` 中加入兩個新的設定項：
    *   `Interaction Offset (Touch)`
    *   `Interaction Offset (Mouse)`

#### [MODIFY] [main.js](file:///Users/victor/MyProgram/SheetMusic_Viewer/src/main.js)
*   初始化 `stampOffsetTouchY = 65` 與 `stampOffsetMouseY = 25`。

#### [MODIFY] [PersistenceManager.js](file:///Users/victor/MyProgram/SheetMusic_Viewer/src/modules/PersistenceManager.js)
*   在 `saveToStorage` 與 `loadFromStorage` 中處理這兩個新欄位。

#### [MODIFY] [SettingsPanelManager.js](file:///Users/victor/MyProgram/SheetMusic_Viewer/src/modules/SettingsPanelManager.js)
*   在 `initSettings` 中綁定新滑桿的事件處理。

### [Component] Interaction Logic

#### [MODIFY] [InteractionManager.js](file:///Users/victor/MyProgram/SheetMusic_Viewer/src/modules/annotation/InteractionManager.js)
*   重構 `getStampPreviewPos(pos, isTouch, toolType)`：
    *   判定 `isFreehand = ['pen', 'highlighter', 'line'].includes(toolType)`。
    *   如果 `isTouch`：位移量 = `app.stampOffsetTouchY`。
    *   如果 `!isTouch`：
        *   如果 `isFreehand`：位移量 = 0。
        *   否則：位移量 = `app.stampOffsetMouseY`。

## 驗證計畫

### 手動驗證
1. 啟動 `npm run dev`。
2. 開啟 **Global Settings** -> **System Settings**。
3. 調整 **Mouse Offset** 為 50px，確認印章工具（如 Down Bow）在滑鼠下游標上方明顯處預覽。
4. 選擇 **Pen** 工具，確認滑鼠繪圖時位移依然為 0。
5. 在 iPad 上確認觸控位移正常且可調。
