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

### 4. UI/UX 軟體美學 (Minimize Interface, Maximize Content)
- **智慧工作區 (Dynamic Workspace)**：
    - **寬螢幕模式 (Split-View)**：在解析度足夠時，側邊欄與樂譜會同時並列顯示，互不遮擋，實現操作與閱讀效率最大化。
    - **小銀幕模式 (Float-View)**：在窄螢幕上，側邊欄採滑入式設計，優先保障樂譜顯示。
- **懸浮工具列 (Floating Stamp Bar)**：將最常用的專業標記工具（弓法、指法）獨立為螢幕左側的懸浮工具列，不需開啟側邊欄即可快速標記。
- **沉浸式設計**：採用毛玻璃效果 (Glassmorphism)，確保介面精緻且不干擾讀譜視覺。
- **回應式佈局**：自動適應 Desktop 與 iPad/iPhone 螢幕大小，支援觸控操作。

## 技術架構 (Tech Stack)
- **前端框架**：Vite + Vanilla JS
- **PDF 核心**：PDF.js (本地 Worker 模式)
- **離線技術**：Vite PWA Plugin (Service Workers)
- **標記引擎**：HTML5 Canvas 向量渲染

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

---
*最後更新日期：2026-03-02*
