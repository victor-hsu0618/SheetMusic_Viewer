# 實作計畫 - 修復 iPad 圖章工具問題

用戶回報 iPad 上的圖章工具（Stamp tool）預覽與貼上功能失效。研究顯示有兩個主要原因：

1.  **貼上失敗**：程式碼使用了 `crypto.randomUUID()`，這在非安全環境（例如透過 HTTP 存取區域網路內的測試伺服器）下是無法使用的。這會導致腳本錯誤，進而阻止圖章被儲存。
2.  **預覽失敗**：觸控預覽邏輯僅在 `touchmove` 時觸發。初始的 `touchstart` 沒有渲染預覽，導致單次點擊時沒有預覽效果。

## 待修復組件

### 註解互動管理 (`src/modules/annotation/InteractionManager.js`)

#### [修改] [InteractionManager.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/annotation/InteractionManager.js)

-   **修復 ID 生成**：將 `crypto.randomUUID()` 替換為可在非安全環境正常運行的 fallback 機制（例如結合時間戳與亂數）。
-   **加入初始預覽**：更新 `startAction`，使其在 `touchstart` 時立即觸發預覽重繪。
-   **優化觸控結束**：確保 `endAction` 在沒有移動的情形下也能正確完成放置。

## 驗證計畫

### 手動驗證
-   **測試環境**：驗證程式碼變更：
    1.  驗證在 `crypto.randomUUID` 未定義時不會拋出錯誤。
    2.  在瀏覽器中使用 DevTools 模擬 `touchstart`，確認現在會立即觸發預覽。
    3.  確認即使沒有拖曳，直接點擊也能將圖章加入 `this.app.stamps` 陣列中。

### 自動化測試
-   目前環境下沒有針對觸控圖章功能的現成自動化測試。將依賴手動程式碼檢閱與瀏覽器模擬驗證。

> [!IMPORTANT]
> 此計畫在獲得 "engage" 指令後才會開始開發。
