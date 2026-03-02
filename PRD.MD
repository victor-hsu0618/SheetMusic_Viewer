# ScoreFlow PRD (Product Requirement Document)

## 專案概述 (Project Overview)
ScoreFlow 是一款專為專業樂手設計的高階樂譜閱讀器 (SheetMusic Viewer)，支援 macOS 與 iOS 平台。其核心設計目標是提供極致流暢的連續閱讀體驗，並具備專業級的圖層標記與場景跳轉功能。

## 核心功能 (Core Features)

### 1. 連續捲動檢視器 (Continuous Scroll Viewer)
- **瀏覽模式**：採用垂直連續捲動 (Vertical Continuous Scroll)，取代傳統的一頁一頁跳轉。
- **PDF 渲染**：整合 PDF.js，支援高解析度樂譜預覽。
- **流暢度優化**：針對觸控 (Touch) 與滑鼠滾動進行平滑化處理。
- **全離線支援**：具備 PWA (Progressive Web App) 技術，可在無網路環境（如音樂廳）下正常運作。

### 2. 多圖層標記系統 (Layered Stamping System)
- **多圖層管理**：使用者可建立多個標記圖層（例如：演奏、練習、教學、分析）。
- **圖層控制**：支援圖層顯示/隱藏、獨立刪除。
- **標記工具**：
    - **Circle**: 圓圈標記。
    - **Square**: 方框標記。
    - **Check**: 勾選標記。
    - **Text**: 自定義文字說明。
- **數據持久化**：所有圖層與標記數據均儲存於瀏覽器本地 (localStorage)，讀取樂譜後自動還原。

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

### 4. UI/UX 軟體美學
- **設計風格**：採用現代簡約風，包含毛玻璃效果 (Glassmorphism) 與高級配色。
- **回應式佈局**：自動適應 Desktop 與 iPad/iPhone 螢幕大小。
- **即時縮放**：支援快速縮放 (Zoom)，並在縮放後自動重新對齊所有向量標記。

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
