# ScoreFlow PRD (Product Requirement Document)

## 專案概述 (Project Overview)
ScoreFlow 是一款專為專業樂手設計的高階樂譜閱讀器 (SheetMusic Viewer)，支援 macOS 與 iOS 平台。其核心設計目標是提供極致流暢的連續閱讀體驗，並具備專業級的圖層標記與場景跳轉功能。

## 核心功能 (Core Features)

### 1. 連續捲動檢視器 (Continuous Scroll Viewer)
- **瀏覽模式**：採用垂直連續捲動 (Vertical Continuous Scroll)，取代傳統的一頁一頁跳轉。
- **PDF 渲染**：整合 PDF.js，支援高解析度樂譜預覽。
- **流暢度優化**：針對觸控 (Touch) 與滑鼠滾動進行平滑化處理。
- **全離線支援**：具備 PWA (Progressive Web App) 技術，可在無網路環境（如音樂廳）下正常運作。

### 2. 專業分層註記 (Structured Layered Annotations)
- **預設專業圖層 (Layer Presets)**：系統自動建立 Performance (表現)、Fingering (指法)、Bowing (弓法)、Personal (重點) 四大專業圖層。
- **智慧工具切換 (Dynamic Toolsets)**：側邊欄工具會根據「當前選中圖層」切換專屬符號：
    - **Performance & Personal**: 圓圈、文字、重音 (> )、斷奏 (.)、強弱 (f, p)。
    - **Bowing (弓法)**: 專屬弦樂符號 (ㄇ 下弓, V 上弓)。
    - **Fingering & Strings (指法/弦號)**: 指法數字 (0-4)、拇指位符號、弦號 (I-IV)。
- **圖層關聯隱藏**：註記與圖層深度綁定，隱藏圖層時所有專屬符號同步隱藏，支援專業分譜分享。
- **數據持久化**：所有圖層及標記數據自動儲存於瀏覽器 localStorage，下次開啟時自動還原。
- **專案交換與備份 (Project Exchange & JSON v1.3)**：
    - **匯出 (Export)**：一鍵打包所有註解、圖層、演奏人格及樂譜指紋為單一 `.json` 檔案。
    - **匯入 (Import)**：支援智慧合併 (Merge) 或 全量覆蓋 (Overwrite) 模式。

### 2.1 標記操作進化 (Annotation Workflow Evolution) - *2026.03.03 更新*
- **物件放置預覽 (Press-to-Preview)**：
    - 點選工具後，在樂譜上「按住滑鼠/觸控筆」可進入幽靈預覽狀態，隨意拖拉至精準對位後「放開」即定格。
- **修正模式 (Correction Mode)**：
    - **Select 工具**：首度引入「選擇箭頭」，可事後點選、搬移畫面上任何已存在的標記（包含手寫筆觸）。
    - **快速刪除熱鍵**：在選擇模式下，按下 `Delete` 或 `Backspace` 即可移除目前焦點物件。
- **類別狀態記憶 (Category Memory)**：
    - 切換不同選單類別（如 Pens 換到 Fingering）時，系統會自動選回到該類別「上次最後使用」的物件，減少重複點擊。
- **多重演奏風格引擎 (Multi-Style Interpretation Engine)**：
    - **數位疊加 (Digital Overlay)**：支援同時載入多個來源（如：自我研究、指揮詮釋、首席風格）。
    - **對比與透明度 (Compare & Ghosting)**：各個風格具備獨立的顯隱開關與透明度滑條 (Opacity)，實現「詮釋比對」讀譜流。
    - **來源歸屬**：新標記自動路由至當前 Active Style，確保資料結構清晰不混亂。

### 3. 智慧錨點跳轉與基準線 (Smart Anchor & Jump System)
- **Anchor 標記**：特殊的旗幟工具，用於標記樂譜中關鍵的跳轉點。
- **視覺基準線 (Jump Target Line)**：
    - 畫面上顯示一條水平虛線作為跳轉基準。
    - **位置自定義 (Offset)**：使用者可在設定中以公分 (cm) 為單位調整基準線高度（預設為 1.0cm）。
- **精準跳轉**：
    - 點擊按鈕或按下 `空白鍵`/`方向鍵`，軟體會以**視覺基準線**為判斷依據，自動尋找線條下方的下一個 Anchor 並將其對齊到基準線上。
    - 解決「跳轉後視線找不到位置」以及「重複跳轉同一位置」的問題。
- **動態視窗錨點 (Dynamic Viewport Jump)**：
    - 當前方沒有手動或分頁錨點時，系統會自動在當前視窗底部產生一個**黃色半透明**的動態基準點。
    - 確保在連續捲動時，即便沒有預設標記，也能透過跳轉鍵流暢地向下推進樂譜，不會卡住。
- **戰略式樂句跳轉 (Strategic Phrase Jump)**：
    - **跳轉時機自定義 (User-Triggered Alignment)**：不同於傳統 App 在「換頁邊界」強制跳轉，ScoreFlow 允許樂手在「樂句空隙（休息、呼吸點）」主動啟動跳轉。
    - **預置下一段 (Phrase Foresight)**：樂手可以在演奏 A 句末尾的長音或休息時按下跳轉，讓 B 句提前對齊到視覺基準線，確保進入激烈演奏段落時，視譜區域已經完全就緒，杜絕「來不及換頁」的演奏風險。
- **數位樂譜指紋驗證 (Score Identity Verification)**：
    - **SHA-256 Fingerprinting**：上傳 PDF 時自動計算唯一的加密指紋，防止不同版本的樂譜標記混用。
    - **版本稽核 (Version Audit)**：匯入標記時自動比對指紋，若 PDF 版本不符（如 Henle vs Barenreiter）會跳出誤導警告。

### 4. UI/UX 軟體美學 (Minimize Interface, Maximize Content)
- **智慧工作區 (Dynamic Workspace)**：
    - **寬螢幕模式 (Split-View)**：在解析度足夠時，側邊欄與樂譜會同時並列顯示，互不遮擋，實現操作與閱讀效率最大化。
    - **小銀幕模式 (Float-View)**：在窄螢幕上，側邊欄採滑入式設計，優先保障樂譜顯示。
- **懸浮工具列 (Smart Palette - Object-First Design)**：
    - **物件尊隨模式**：重新設計為「物件優先」，將 85% 的空間留給音符符號，縮小類別選單。
    - **類別導航器 (Category Navigator)**：採用下拉選單式佈局，極大化減少螢幕空間佔用，同時提升切換效率。
- **專業文字輸入 (Professional Text Editor)**：
    - 整合式 Text Box，支援**多行輸入 (Shift+Enter)** 與自動增高。
    - 具備 `Enter` 確認、`Esc` 取消等專業快捷操作邏輯。
- **YouTube 風格快捷鍵補貼 (? / H)**：
    - 按下 `?` 或 `H` 即時喚出半透明毛玻璃說明的快捷鍵面板，取代在設定選單中翻找手冊。
- **沉浸式設計**：採用毛玻璃效果 (Glassmorphism)，並針對 Safari/iOS 進行 `backdrop-filter` 相容性優化。
- **回應式佈局**：自動適應 Desktop 與 iPad/iPhone 螢幕大小，支援觸控操作。

### 5. 樂團協作與社群空間 (Ensemble Collaboration & Shared Space) - *2026.03.03 新增*
- **聲部共享空間 (Section Shared Space)**：
    - **發佈 (Publishing)**：一鍵分享個人標記至所屬聲部的雲端/本地共享區。
    - **抓取參考 (Peer Grabbing)**：瀏覽同聲部（如一小組）團員的分享卡片，一鍵抓取並「疊加」為新的 Persona 參考。
- **職業身分管理 (Identity & Profile Manager)**：
    - **多重職位切換**：支援建立多個身分（如：TSO 第一小提琴、某室內樂團大提琴手），快速切換所屬團體與聲部。
    - **自動化標籤**：發佈作品時自動帶入當前 Profile 的姓名與團體職稱。
- **雲端同步橋接 (Cloud Sync Bridge)**：
    - **檔案系統連結**：支援對接 Google Drive 或本地同步目錄，實現真正的跨裝置、跨樂手協作。

## 技術架構 (Tech Stack)
- **前端框架**：Vite + Vanilla JS
- **PDF 核心**：PDF.js (本地 Worker 模式)
- **離線技術**：Vite PWA Plugin (Service Workers)
- **標記引擎**：HTML5 Canvas 向量渲染
- **圖示資源管理 (Icon Asset System)**：
    - 支援 `public/assets/icons/` 外部資源載入與 Code-based SVG 自動備援機制，方便美工人員不改 Code 也能全面替換 UI 風格。

## 發佈與打包建議 (Deployment & Packaging)

### 1. PWA 模式 (目前採用)
- **優點**：無需經過 App Store 審核，支援離線，跨設備同步方便。
- **安裝方式**：
    - **iOS**: Safari -> 加入主畫面。
    - **macOS**: Chrome/Edge -> 安裝應用程式。

### 2. 原生封裝 (未來擴充)
- **iOS/iPadOS**: 建議使用 **Capacitor** 封裝為 Xcode 專案，可上架 App Store。
- **macOS**: 建議使用 **Electron** 或 **Tauri**，可支援更多系統層級 API（如 MIDI、檔案系統直接存取）。

## 設備分發指南 (Distribution Guide)

### 1. 區域網路測試 (Local Network)
- **步驟**：
    1. 主機執行 `npm run preview -- --host`。
    2. 其他設備（iPad/Mac）連入相同 Wi-Fi。
    3. 開啟主機顯示的 `Network IP` 網址。
    4. 執行「加入主畫面」完成安裝。

### 2. 靜態部署 (Static Hosting)
- **推薦平台**：GitHub Pages, Vercel, Netlify。
- **流程**：將 `npm run build` 產生的 `dist` 資料夾內容部署至平台即可獲得永久存取網址。

## 專業術語與流程定義 (Professional Terminology)
- **Concertmaster Setup (首席標定)**：由樂團首席（Concertmaster）統一訂定的官方標記（包含弓法與指法）。全團團員通常以此為基準進行同步，確保舞台動作一致與音樂詮釋統一。
- **Performance Interpretation (演奏風格/詮釋)**：針對同一曲目的不同處理方式（如不同指揮的詮釋、不同大師的指法）。
- **Ghosting (幽靈預覽)**：標記物件在正式放置前，以半透明方式跟隨鼠標/筆尖的對位過程。
- **Score Fingerprint (樂譜指紋)**：PDF 內容的唯一數位簽章，用來區分不同出版社或不同修訂時間的相同曲目，確保標記精準對齊。

---
*最後更新日期：2026-03-03*
