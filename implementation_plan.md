# [Feature] 新增樂譜庫「刪除樂譜」功能

目前 ScoreFlow 的刪除功能隱藏在「Edit (多選編輯) 模式」中。為了提升管理效率，我們將在樂譜庫介面新增直覺式的單一樂譜刪除入口。

## User Review Required

> [!IMPORTANT]
> **資料不可逆性**：刪除樂譜將會移除本地 IndexedDB 內的 PDF 原始檔案、所有 Interpretation Layers (批註)、書籤以及雲端同步紀錄。我們將加入二次確認彈窗以確保安全性。

## Proposed Changes

### 1. 樂譜庫介面優化 (Score Library UI)

#### [MODIFY] [ScoreLibraryUIManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/ScoreLibraryUIManager.js)
*   在 `render()` 函式中的 `score-action-cell` 區域新增一個垃圾桶按鈕 (Trash Icon)。
*   該按鈕僅在非編輯模式下顯示，點擊後觸發 `scoreManager.deleteScore`。

### 2. 樂譜詳情面板優化 (Score Detail UI)

#### [MODIFY] [ScoreDetailUIManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/ScoreDetailUIManager.js)
*   在面板底部的「Danger Zone」區塊新增一個正式的 `Delete Score from Device` 按鈕。
*   綁定對應的事件監聽器。

#### [MODIFY] [ScoreDetailManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/ScoreDetailManager.js)
*   新增 `handleDeleteScore()` 方法。
*   實作二次確認邏輯，確認後呼叫 `app.scoreManager.deleteScore()`。

---

## 預計修改後的設計狀態 (Expected Design State)

| 介面區域 | 原本狀態 | 修改後狀態 |
| :--- | :--- | :--- |
| **樂譜卡片** | 僅有 `...` (More Info) 按鈕 | 新增 `🗑️` 快刪按鈕 |
| **詳情面板** | 僅有 `Reset Markup` 按鈕 | 新增紅色的 `Delete Entire Score` 按鈕 |
| **操作流程** | 進入編輯模式 > 選取 > 刪除 | 直接點擊卡片垃圾桶 > 確認 > 刪除 |

---

## Open Questions

*   **自動跳轉**：如果刪除的是「目前正開啟」的樂譜，系統應該自動載入「最近開啟的其他樂譜」還是回歸到「User Guide」？(目前建議採計 `ScoreManager._autoLoadOnStartup` 的邏輯)

## Verification Plan

### 自動化測試
*   執行 E2E 測試驗證刪除後樂譜是否從 `IndexedDB` 與 `Registry` 中消失。

### 手動驗證
1.  開啟 Library，點擊樂譜卡片上的垃圾桶圖示。
2.  確認彈窗出現，點擊「取消」確認樂譜保留。
3.  再次點擊刪除並選擇「確認」，驗證樂譜卡片立即消失。
4.  開啟 Score Detail 面板，點擊底部的刪除按鈕，執行相同驗證。
5.  刪除當前開啟的樂譜，驗證系統是否自動切換至其他樂譜。
