# ScoreFlow PRD (Product Requirement Document)

## 專案概述 (Project Overview)

ScoreFlow 是一款專為專業樂手設計的高階樂譜閱讀器 (SheetMusic Viewer)，支援 macOS 與 iOS 平台。其核心設計目標是提供極致流暢的連續閱讀體驗，並具備專業級的圖層標記與場景跳轉功能。

## 核心功能 (Core Features)

### 1. 連續捲動檢視器 (Continuous Scroll Viewer)

- **瀏覽模式**：採用垂直連續捲動 (Vertical Continuous Scroll)，取代傳統的一頁一頁跳轉。
- **PDF 渲染**：整合 PDF.js，支援高解析度樂譜預覽。
- **流暢度與記憶體優化 (2026.03.10 更新)**：
  - **延遲渲染 (Lazy Rendering)**：採用 `IntersectionObserver` 技術，僅在頁面進入可視區域時才進行繪製。
  - **分段載入**：初步僅建立佔位容器以計算正確捲動高度，大幅降低 iPad 等行動裝置的一次性記憶體負擔 (解決 OOM Crash)。
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

- **連續小節數標記 (Continuous Measure Tool)**：
  - **極速智慧輸入**：專為樂手快速標記段落小節而生。點擊畫面即喚出專屬自訂輸入面板 (Custom UI Modal)，支援設定「自動遞增跨度 (Auto-increment Step)」（預設為 4。最低 1，上限 999）。
  - **一鍵連續遞增**：設定跨度後，系統會記憶偏好，後續只要「點擊 -> 敲擊 Enter」即可自動完成等差遞增的小節標註，無需重複輸入。
  - **尺規雙向綁定 (Ruler Docked)**：輸入的小節數字會自動對齊貼齊樂譜最左側邊界 (`x: 0.05`)，並同步在左側垂直尺規上繪製顯眼的琥珀橘色 (`#f59e0b`) 標記。捲動樂譜時，尺規上的小節號碼會隨之連動，提供最直覺的全局定位參考。
  - **獨立視覺導航**：純視覺輔助設計，小節標記不具備 Anchor 屬性，絕不會干擾翻頁踏板與樂句跳躍 (Anchor Jump) 的既有邏輯。

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
- **中心化設定管理 (Centralized Settings) - *2026.03.10 更新***：
  - **側邊欄整合**：為了簡化工具列並集中管理，所有全域應用程式設定（如：全域圖章縮放比例、導航線顯示、翻頁模式）均整合至側邊欄「Settings」分頁。
  - **圖層管理整合 (Notation Categories) - *2026.03.10 更新***：原本獨立的「Notation Settings」浮動面板面板已移除，其內部的圖層控制功能已完全整合至「Stamp Panel (印章工具箱)」的設定子頁面中。使用者現在可以更集中地在同一面板中管理圖章大小與圖層可見性。
  - **樂譜專屬設定**：針對特定樂譜的比例修正 (Score Scale) 亦同步移至側邊欄，確保圖章工具箱面板 (Stamp Palette) 保持極致簡潔，僅專注於符號選擇。

### 4.1 iPad 手勢效能優化 (iPad Gesture Performance Optimization) - *2026.03.08 更新*

為了提供演奏時最直覺的操控，針對 iPad 觸控進行了專屬手勢映射：

- **智慧點擊跳轉 (Contextual Tapping)**：
  - **觸發條件**：僅在 **View (Hand) 模式** 下啟用，避免繪圖時誤觸。
  - **區域計算基準**：所有比例（35% / 40% / 60%）皆以**當前 PDF 頁面的顯示寬度與高度**為準，而非整個螢幕。
  - **頂部區域 (Top 35%)**：執行 `jump(-1)`。點擊時顯示**「向上」**方向動畫提示。
  - **下方左側 (Bottom Left 40%)**：執行 `jump(-1)`。點擊時顯示**「向左」**方向動畫提示。
  - **下方右側 (Bottom Right 60%)**：執行 `jump(1)`。點擊時顯示**「向右」**方向動畫提示。
  - **視覺分割導引 (Divider UI)**：在成功觸發換頁時，於 PDF 頁面交界處動態顯示 **T 字型** 的微光分界線，持續約 **0.5 秒** 後消失。贈
  - **視覺提示 (Visual Feedback)**：根據點擊區域顯示對應的「上/左/右」指示動畫。
- **水平滑動導航 (Horizontal Swipe)**：
  - **向左滑動 (Swipe Left)**：執行 `jump(1)`（下一頁），符合電子書閱讀慣例。
  - **向右滑動 (Swipe Right)**：執行 `jump(-1)`（上一頁）。
- **進階印章呼喚 (Two-Finger Palette Toggle)**：
  - **雙指點兩下 (Two-finger Double Tap)**：在螢幕任何位置雙指快速點擊兩下，即可切換 **Stamp Palette (印章工具箱)** 的顯隱。
  - **設計目的**：解決單指操作時可能產生的繪圖/功能衝突，提供演奏家極速換工具的手段。
- **衝突預防機制**：
  - 手勢系統會自動避開 Doc Bar、側邊欄及浮動工具箱區域，確保 UI 互動優先。

### 5. 樂譜詳情與身份管理 (Score Detail & Identity Management) - *2026.03.08 更新*

- **樂譜詳情儀表板 (Score Detail Panel)**：原 Orchestra 面板重構為「Score Detail」，提供四大核心區塊：
  - **1. 樂譜資訊預置 (Score Information)**：支援自定義 **Score Name (曲名)** 與 **Composer (作曲家)**。同時顯示 **FileName (原始檔名)** 與 **SHA-256 Fingerprint (指紋)** 作為鑑定依據。此資訊與 PDF 指紋深度綁定，下次開啟同一份樂譜時會自動搜尋並還原。
  - **2. 演奏者身分 (Active Musician)**：即時同步 User Profile，顯示當前標記者的姓名與聯繫方式。
  - **3. 詮釋風格管理 (Interpretation Styles)**：集中管理自建或匯入的演奏詮釋。
  - **4. 標記交換 (Score Annotation Exchange)**：針對「本樂譜版本」的獨立匯入匯出功能。
- **身分強綁定機制 (Identity-Linked Exchange)**：
  - **智慧金鑰 (Key Identifiers)**：匯出 JSON 檔案強制內嵌 User Name 與 Email。
  - **檔名自動化策略**：匯出標記時，系統自動將檔名優化為 `[ScoreName]_[Composer]_[UserName]_[YYYY-MM-DD].json` 格式，大幅提升檔案管理效率。
  - **歸屬權稽核 (Ownership Audit)**：匯入時系統會根據 Name/Email 進行身分一致性檢查，若來源不符會啟動安全提示，確保標記來源可追溯。
- **職業身分管理 (Identity & Profile Manager)**：
  - **個人檔案設定 (User Profile)**：支援設定 **User Name (姓名, 必填)**、**Title (職稱)**、**User Email (電子郵件, 必填)** 與 **Note (個人備註)** 四大核心欄位。
  - **模組化持久化**：採用獨立 `ProfileManager` 與 `ScoreDetailManager` 模組，所有細節變更即時儲存於 IndexedDB / LocalStorage，確保主程式 `main.js` 維持簡潔與高效。
  - **Settings 整合介面**：在 Settings 頁面頂部開立專屬「User Profile」群組，以 `Title / User Name` 專業格式摘要顯示，點擊可開啟專屬 Modal 進行細節編輯。
  - **自動化歸屬 (未來預留)**：預留標記歸屬欄位，未來在發佈共享標記時自動附加個人職位與姓名標籤。
- **雲端同步橋接 (Cloud Sync Bridge)**：
  - **檔案系統連結**：支援對接 Google Drive 或本地同步目錄，實現真正的跨裝置、跨樂手協作。

## 軟體架構與模組設計 (Software Architecture & Module Design) - *2026.03.08 更新*

為了確保軟體的高可維護性與擴展性，ScoreFlow 採用了高度解耦的 **「管理器模式 (Manager Pattern)」** 重構。核心邏輯從 `main.js` 抽離，分散至具備單一職責的模組中：

### 1. 核心指揮系統 (Core Controller)
- **`ScoreFlow` (Main Class)**：作為整個應用的協調者，僅負責模組初始化與高層級的導航邏輯轉發。

### 2. 功能專屬管理器 (Specialized Managers)
- **`ViewerManager` (閱讀器引擎)**：負責 PDF.js 的協作渲染、縮放 (Zoom)、適配寬高 (Fit-to-Width/Height) 以及檔案開啟邏輯（特別整合了對 iOS 檔案系統的開啟修正）。
- **`AnnotationManager` (標記指揮官)**：集中化管理所有筆觸、符號與文字註釋，處理座標轉換、物件擦除、小節自動遞增邏輯，以及關鍵的錨點自動管理 (`cleanupAnchors`)。
- **`InputManager` (交互中心)**：統一掌管所有輸入事件，包含鍵盤快捷鍵系統 (`keydown`)、iPad 專屬手勢 (Swipe Jump)、滑動監聽及多層級滾動同步。
- **`PersistenceManager` (數據持久化)**：封裝了對 LocalStorage 與 IndexedDB 的存取，實現了註記數據、系統偏好與最近開啟文件的快速緩存。
- **`LayerManager` (圖層管理器)**：掌管 Performance/Fingering 等專業圖層的視覺開關、顏色分配與數據隔離。
- **`SidebarManager` (側邊欄與工作區)**：管理側邊欄的 Tab 切換、響應式佈局狀態（Split-View vs Float-View）及 Workspace 的尺寸計算。
- **`RulerManager` (智慧跳轉與尺規)**：驅動 Smart Jump 邏輯，管理垂直 Jump Ruler 的渲染、下一目標計算 (`computeNextTarget`) 與跳轉歷史紀錄。
- **`DocBarManager` (控制列)**：負責螢幕上方漂浮的 Document Bar 交互、顯示切換及拖拉邏輯。
- **`DocActionManager` (文件行為)**：處理專案 (.json) 的匯入匯出、備份還原模式，以及全局的系統對話框 UI。
- **`CollaborationManager` (協作與風格)**：管理 Interpretation Styles 引擎來源，處理多重詮釋風格的顯隱與流量路由。
- **`ProfileManager` & `ScoreDetailManager`**：專司用戶身份識別與單一樂譜元數據（作品、作曲家）的細節管理。
- **`ToolManager`**：動態工具列狀態機，負責追蹤各圖層「最後使用工具」並實現極速切換。

### 3. 架構優勢
- **單一職責 (Single Responsibility)**：每個 Manager 僅負責一個邏輯領域，極大降低了代碼耦合。
- **極速開發 (Developer Efficiency)**：新增功能只需在對應管理器擴充，不影響主程序穩定性。
- **跨平台一致性**：InputManager 將 macOS 快捷鍵與 iOS 觸控手勢完美統一，提供無縫的跨裝置體驗。

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

*最後更新日期：2026-03-10*
