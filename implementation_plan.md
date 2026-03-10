# Score Manager (書庫) 與 Global Settings (全域設定) 重構計劃

## 1. 重構構思 (Redesign Concept)

### A. Global Settings: 轉型為「彈出式面板 (Sub-Panel)」
原本占據側邊空間的 `Sidebar` 將被移除，取而代之的是一個與 `View Inspector` 風格一致的 **Pop-Up Sub-Panel**：
- **內容集中**：僅包含全域設定（個人檔案、雲端同步、全域偏好、系統資訊）。
- **觸發方式**：點擊 Doc Bar 的設定圖示或按下 `S` 鍵彈出。

### B. ScoreManager: 中心化「全屏書庫 (Library Overlay)」
- **Library Overlay**：獨立的全屏介面，展示樂譜網格、縮圖、搜尋列。
- **檔案映射邏輯 (重要的技術點)**：
    - **指紋識別 (Identity)**：使用 PDF 內容的 **SHA-256 指紋** 為唯一 ID。
    - **目錄無關 (Path Independent)**：不依賴作業系統的檔案路徑，解決不同機器目錄不同的問題。
    - **跨裝置同步**：
        - **Registry (索引)**：同步至 Google Drive 的 JSON 中。
        - **PDF Binary (內容)**：保留在 Local (IndexedDB 緩存)。
        - **機器間對應**：機器 B 同步到 Registry 後，若本地無該 PDF，會顯示「待連結」。一旦用戶在機器 B 提供檔案，系統確認指紋匹配，即可立即恢復所有雲端劃記。

### C. 交互邏輯變更
- **`Settings Panel` (S)**：開啟/關閉全域設定面板。
- **`Library Overlay` (O)**：開啟「樂譜書庫」。

## 2. 擬動動變更

### [NEW] [ScoreManager.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/ScoreManager.js)
- **Registry & Storage**: 管理 IndexedDB 中的 `score_registry` (索引) 與 `score_buf_[fp]` (內容緩存)。
- **Thumbnail Engine**: 異步生成網格展示用的 Base64 縮圖。

### [MODIFY] [sidebar.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/modules/sidebar.js)
- 改名為 `SettingsPanelManager.js` 並改寫為 Sub-Panel 邏輯。

### [MODIFY] [index.html](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/index.html)
- 移除 `<aside id="sidebar">`，新增 `library-overlay` 與 `settings-panel` 容器。

## 3. 數據結構 (Registry)
```javascript
{
  fingerprint: "sha256...", 
  title: "樂曲標題",
  composer: "作曲家",
  thumbnail: "data:image/webp...", // 加速顯示
  lastAccessed: 1710000000000,
  isMissing: false // 當雲端同步過來但本地無 PDF 時標記
}
```

---
## 使用者回饋與修正
- **評語**: 檔案資訊在哪邊？檔案是 local... 如何維持不同機器間的對應？
- **AI 響應**: 好的！已在計劃中補充：我們使用 **SHA-256 內容指紋** 作為跨機器的唯一關聯碼。只要內容相同，不論目錄名稱為何，系統都能自動識別並掛載雲端上的劃記資訊。PDF 二進位檔則儲存於各機器的本地 IndexedDB 緩存。

---
**請確認上述重構構思是否符合您的方向。若無誤請回覆 "engage" 以開始開發。**
