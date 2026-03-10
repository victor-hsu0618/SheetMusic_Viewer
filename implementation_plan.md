# 將 Notation Settings 移至 Stamp Panel

此計畫旨在透過將「Notation Settings」（圖層管理）從獨立的浮動面板（由 doc bar 觸發）移至「Stamp Panel」內的設定視圖，來集中管理與標記相關的設定。

## 變更摘要

### [核心/UI]

#### [修改] [index.html](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/index.html)
- 從 `#floating-doc-bar` 中移除 `layer-toggle-fab` 按鈕。
- 移除 `#layer-shelf` 容器。
- 確保 `#active-tools-container` 能夠容納新的圖層列表設定。

#### [修改] [src/modules/tools.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/tools.js)
- 更新 `renderSettingsPanel()` 以包含「Notation Categories」區段。
- 此區段將託管原本在 layer shelf 中的圖層列表。
- 在此設定視圖中新增「Add New Category」按鈕。

#### [修改] [src/modules/LayerManager.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/LayerManager.js)
- 更新 `renderLayerUI()` 以渲染到 Stamp Settings 面板內的新容器中。
- 移除對 `layerShelf` 和 `layerToggleBtn` 的引用。
- 更新事件監聽器以在 Stamp Panel 上下文中運作。

#### [修改] [src/modules/docbar.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/docbar.js)
- 移除 `layerShelf` 和 `layerToggleBtn` 的初始化邏輯。

#### [修改] [src/modules/InputManager.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/InputManager.js)
- 移除原本用於開啟圖層面板的 `Shift+V` 快捷鍵邏輯。

#### [修改] [index.html](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/index.html)
- 在快捷鍵說明清單中移除 `Shift+V` (Notation Layers) 的項目。

## 驗證計畫

### 自動化測試
- 執行現有的 e2e 測試，確保工具切換或 PDF 渲染沒有退化。
```bash
npm run test:e2e
```

### 手動驗證
1. 打開 Stamp Palette (T)。
2. 點擊底部的「設定」圖示（齒輪）。
3. 確認「Notation Categories」已列出。
4. 測試切換類別的可見性（眼睛圖示）。
5. 測試新增新類別。
6. 測試刪除自定義類別。
7. 確認 Doc Bar 不再包含「Notation Settings」按鈕。
8. 確認 `Shift+V` 會開啟 Stamp Settings 面板。
