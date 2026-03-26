# ScoreFlow PRD (Product Requirement Document)

## 專案概述 (Project Overview)

ScoreFlow 是一款專為專業樂手設計的高階樂譜閱讀器 (SheetMusic Viewer)，支援 macOS 與 iOS 平台。其核心設計目標是提供極致流暢的連續閱讀體驗，並具備專業級的圖層標記、智慧跳轉與多重詮釋疊加功能。

## 核心功能 (Core Features)

### 1. 連續捲動檢視器 (Continuous Scroll Viewer)

- **瀏覽模式**：採用垂直連續捲動 (Vertical Continuous Scroll)，取代傳統的一頁一頁跳轉。
- **PDF 渲染**：整合 PDF.js，支援高解析度樂譜預覽。
- **流暢度與記憶體優化**：
  - **延遲渲染 (Lazy Rendering)**：採用 `IntersectionObserver` 技術，僅在頁面進入可視區域時才進行繪製。
  - **動態分段載入**：初步僅建立佔位容器以計算高度，大幅降低行動裝置記憶體負擔。
- **全離線支援**：具備 PWA 技術，可在無網路環境（如音樂廳）下正常運作。

### 2. 專業分層註記 (Structured Layered Annotations)

- **預設專業圖層 (Layer Presets)**：系統自動建立 Performance、Fingering、Bowing、Text、Others 五大專業圖層，各具備獨立顏色與顯示狀態。
- **智慧工具切換 (Dynamic Toolsets)**：側邊欄工具會根據「當前選中圖層」切換專屬符號組。
- **圖層數據隔離**：註記與圖層深度綁定，隱藏圖層時所有專屬符號同步隱藏。
- **專案交換與備份**：
  - **Export to PDF**：將原始 PDF 與所有圖層標記壓平合併。
  - **Export JSON**：打包所有註解、圖層、演奏人格及樂譜指紋。
- **斗篷標籤系統 (Cloak Labels)**：
  - 各標記可標記為「黑 / 紅 / 藍」斗篷之一，用於不同演奏情境（如排練/正式演出）的快速顯隱切換。

### 3. 標記操作流程 (Annotation Workflow)

- **物件放置預覽 (Press-to-Preview / Ghosting)**：
  - **四向對稱收縮**：確保在樂譜邊界仍能 100% 精準對位預覽。
  - **預覽同步**：視覺預覽落點與最終放置位置完全一致。
- **跨頁拖曳 (Cross-Page Dragging)**：標記物件可跨越頁面邊界拖曳，系統自動轉換座標歸屬頁面。
- **編輯工具進化**：
  - **Select**：點選已存在的標記進行搬移，靠近時顯示藍光提示。
  - **Copy**：一鍵複製標記並進入拖曳模式。
  - **Cycle**：點擊已放置標記，在同組群組內輪轉類型（如上/下弓、1-5 指法）。
- **猶豫期系統 (Grace Period)**：
  - 放置物件後 **1800ms** 內可直接重新抓取移動，無需切換工具。
- **智慧垃圾桶 (Smart Trash Bin)**：
  - 拖曳物件時自動出現，位置根據物件座標智慧調整（中心上方 70px 或左側下方 90px）。

### 4. 智慧錨點跳轉 (Smart Anchor & Jump)

- **Anchor 標記**：用於標記樂句起點或跳轉目標。
- **視覺基準線 (Jump Target Line)**：
  - 畫面上顯示水平虛線作為跳轉對齊基準，高度可自定義 (Anchor Offset)。
- **精準跳轉邏輯**：
  - 以基準線為準尋找下一個 Anchor 並對齊。具備「預期抵達位置」追蹤機制，支援快速連按跳轉。
- **YouTube 音樂錨點 (Music Anchor)**：
  - 支援將特定樂句直接連結至 YouTube。點擊即呼喚播放器並跳轉至指定秒數。支持手動貼入 URL 解析 VideoID 與 Timestamp。

## 互動設計規格 (Interaction Design)

### 1. 統一事件處理 (Unified Interaction Manager)
- **多平台適配**：統一整合 Mouse、Pointer、Touch 事件。
- **精密對位 (Zero-Offset logic)**：
  - **Mouse/Pen**：1:1 對位。
  - **Touch**：印章類工具套用垂直偏移（防止手指遮掩），但 **Edit 工具 (Select/Copy/Erase)** 固定採 1:1 對位以保證 UI 互動直覺。

### 2. iPad 專屬手勢 (iPad Gestures)
- **智慧點擊跳轉 (Zone Tap)**：僅在 View 模式啟用。
  - **35% Top / 40% Left**：回跳。
  - **60% Right**：前跳。
- **雙二進位手勢鎖定 (Gesture Locking)**：
  - 雙指觸碰後，若先進行平移則鎖定為 **Pan (捲動)**；若先進行開合則鎖定為 **Zoom (縮放)**。
- **2-Finger Double Tap**：快速切換工具箱 (Stamp Palette) 顯隱。
- **Swipe Navigation**：水平滑動進行頁面跳轉。

## 數據架構與持久化 (Data & Persistence)

### 1. 雙軌存儲機制 (Hybrid Storage)
- **IndexedDB (`ScoreFlowStorage`)**：
  - 存放樂譜大數據：`stamps_[FP]`, `sources_[FP]`, `layers_[FP]`, `score_detail_[FP]`。
  - 依據 **SHA-256 樂譜指紋** 進行嚴格數據隔離。
- **LocalStorage**：
  - 存放全域設定：`turner_mode`, `stamp_size_multiplier`, `idle_timeout`。
  - 存放 UI 現況：`last_opened_score`, `active_category`, `active_source`。
  - 存放指紋快取：`scoreFingerprintMap`。

### 2. 數據模型 (Annotation Model)
```json
{
  "id": "uuid",
  "type": "up-bow",
  "page": 1,
  "x": 0.5, "y": 0.2, // Normalized 0.0 - 1.0
  "layerId": "bowing",
  "data": "youtube|videoId|time|label",
  "createdAt": 1711420000000
}
```

## 軟體架構 (Software Architecture)

### 管理器模式 (Manager Pattern)
- **ScoreFlow (Coordinator)**：核心指揮官。
- **ViewerManager**：負責 PDF.js 渲染與縮放控制。
- **AnnotationManager**：負責標記邏輯、小節自動遞增。
- **InteractionManager**：負責 Pointer 事件與互動狀態機。
- **PersistenceManager**：負責數據同步與快取。
- **GestureManager**：負責複雜手勢解析 (Pinch/Pan/Swipe)。
- **ToolManager**：負責工具欄狀態與最後使用工具記憶。

---
*最後更新日期：2026-03-26 (同步實體設計：數據模型詳解、手勢鎖定、YouTube URL 解析支援)*
