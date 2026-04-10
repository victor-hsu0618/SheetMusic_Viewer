# AI 開發與溝通規範 (rule.md)

這份文件旨在統整與規範 AI 助理與開發者之間的溝通要點與程式碼協作原則，以保持 `ScoreFlow` 專案的高品質與高效率。

## 一、 溝通語言與風格 (Communication Style)

1. **統一使用繁體中文 (Traditional Chinese)**
   - 所有溝通、解釋、註解建議、及 `PRD.MD` / `GEMINI.md` 等文件更新，均必須使用繁體中文。若涉及專有名詞，可適度加上英文備註（例：`快取 (Cache)`）。
2. **精確的錯誤分析 (Precise Debugging)**
   - 解釋問題時，應點出「根本原因」與「修復機制」。例如：說明問題是因為「CSS 平滑滾動帶來的延遲」或「無限累加預期座標超出邊界」，而非單純說「修好了一個 bug」。
3. **主動告知潛在副作用 (Proactive Warning)**
   - 若某項改動具有潛在副作用（如調整了全域事件監聽，可能影響其他捷徑），必須在溝通時主動提醒開發者進行測試。

## 二、 程式碼架構與開發準則 (Architecture & Coding Standards)

1. **嚴守模組化與單一職責 (Manager Pattern)**
   - 延續專案既有的高度解耦設計。新功能或介面修復應落在對應的 `XxxManager.js` (如 `InputManager`, `RulerManager`, `SettingsPanelManager`)，絕對避免在 `main.js` 寫入肥大的邏輯。
2. **效能優先 (Performance First)**
   - **避免 Layout Thrashing**：在捲動 (Scroll) 等高頻率事件中，嚴禁用 `getBoundingClientRect` 或 `querySelector`。必須使用預先建立好的快取變數（如 `ViewerManager._pageMetrics`）。
   - **客製化動畫控制**：如果原生 CSS 功能（如 `scroll-behavior: smooth`）無法滿足精細控制與調速需求，應果斷改用 `requestAnimationFrame` 自建引擎。
3. **模組化設計與程式碼重用 (Modularity & Reuse)**
   - 所有設計必須優先模組化，相似或相同的邏輯應抽象為可重用的函式、工具方法或共用元件，**絕對禁止複製貼上同一邏輯到多個地方**。
   - 在動手建立新功能前，必須先評估是否能擴充或重用既有模組（例：`showDialog` 而非各自寫彈窗）。
   - 新增功能時，若發現既有共用工具（如 `db.js`、`DocActionManager` 中的 API）已能滿足需求，應直接整合而非另立新實作。
4. **無損的完整程式碼 (No Placeholders)**
   - 回傳或覆寫程式碼時，必須給予可以直接執行的完整邏輯，**不准**使用 `// 餘下代碼不變` 等虛擬佔位符，以免因取代工具 (Replace Tool) 出錯而損壞專案。
4. **狀態追蹤與邊界防呆 (Boundary Fallbacks)**
   - 對於任何與座標、次數或翻頁相關的邏輯，實作時都應該主動考慮「最大與最小邊界 (Clamping)」。不允許變數進入無限大或無法預測的深淵。

## 三、 UI/UX 軟體美學要求 (UI/UX Aesthetics)

1. **一致的設計語彙**
   - 保持原有的「Glassmorphism (毛玻璃)」、「Calculator Style (模塊化計算機面板)」以及「Semi-transparent Modals」風格。
2. **高階互動體驗**
   - 動畫與過場應追求俐落 (Snappy) 而非遲緩的線性過渡。介面呼叫必須快速且具備熱鍵 (Hotkeys) 支援。
3. **無障礙操作**
   - 注重 iPad 觸控手勢的寬容度（如長按時手指微量滑動不應立即取消事件的防抖動機制），以及滑鼠模式下的點擊體驗區隔。

## 四、 開發工作流 (Workflow Integration)

1. **漸進式實作 (Incremental Implementation)**
   - 當功能過於複雜時，先完成「核心邏輯引擎」，再拉入「全域設定滑桿」與「事件綁定」，分階段驗證。
2. **規格同步更新 (Sync PRD)**
   - 每當完成一項重大架構改動（如：引入自製 Smooth Scroll Engine），必須即時更新或提示更新 `PRD.MD` 及 `GEMINI.md`，保持工程實作與產品規格的 100% 一致。

### 五、 指令與實作計畫流程 (Commands & Implementation Plan Flow)

為了確保開發過程中的每一步都在您掌控之中，我們將遵循以下嚴格的專案開發與確認流程：

1. **實作計畫 (Implementation Plan)**
   - 實作計畫必須統一使用**繁體中文**撰寫，並**直接存檔在專案根目錄資料夾中**，以方便隨時翻閱與追蹤歷史。
   - **獨立命名規範**：不應覆寫同一個檔案。針對每一項重大新功能或改動，應產生專屬的計畫說明檔（例如：`plan_zoom_fab.md`, `plan_horizontal_transitions.md`）。
   - 在計畫中修改設計時，必須清楚對比並列出「**原本的設計狀態**」與「**預計修改後的設計狀態**」，讓預期改動的範圍一目了然。
2. **通關密語執行流程 (Keyword Gates)**
   - 所有開發動作必須一律在 `git` 的 **`main` branch** 上進行。
   - 只有在您說出 **"engage"** 後，我才能正式開始修改程式碼執行開發。
   - 只有在您測試完畢並說出 **"commit"** 後，我才能將程式碼 commit 進入版本控制系統。
   - 只有在您說出 **"上 tag"** 後，我才能為該版本打上 Git Tag。
   - 只有在您說出 **"deploy"** 後，我才能開始執行打包與部署相關動作。
3. **規格強制同步 (Mandatory PRD Sync)**
   - 當設計與修改確認完畢後，若有任何設計變更，**絕對必須**更新 `PRD.MD`，維持文件與程式碼的第一手同步。

## 六、 資源與檔案查找 (Resource & File Discovery)

1. **截圖查找路徑 (Screenshot Discovery)**
   - 若開發者提及截圖或需要查看介面表現，AI 助理應優先前往 `/Users/victor_hsu/Downloads/` 路徑查找最新相關圖片。
