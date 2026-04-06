# 🎼 ScoreFlow v3.0
> **The Ultimate Musical Performance Hub.**
> 一款為專業樂手、指揮與大師設計的高階樂譜閱讀與協作平台。

ScoreFlow 重新定義了數位閱譜體驗，將傳統的 PDF 閱讀器轉化為具備「多重演奏詮釋比對」、「樂團協作同步」以及「Performance Project 專案管理」功能的專業音樂工作站。

---

## 🔥 核心超級特點 (Super Features)

### 🚀 1. 演奏專案管理 (Performance Project)
*   **Folder-Based 樂譜庫 (Score Library)**：選取本地資料夾，自動掃描所有 PDF 樂譜，建立即時存取的曲目列表。
*   **主畫面專案啟動器 (Welcome Screen Launchpad)**：
    *   **Open Solo Score**：快速加載單一 PDF，適合臨時練習。
    *   **Open Performance Project**：連結整個資料夾，主畫面直接呈現精美的曲目卡片選擇牆。
*   **Session Recovery (自動恢復上次工作)**：重新開啟專案時，系統自動尋找並打開上次演奏的樂譜，零摩擦恢復工作。
*   **Recent Scores 快速存取**：側邊欄「🕒 Recent Scores」彈出式選單，快速切換近期開啟的獨奏曲目。

### 🎼 2. 樂譜庫精品選單 (Elegant Score Library)
*   **精品選單 UI**：側邊欄的樂譜列表採用左側紫色強調線設計，類似 Spotify / Apple Music 的精品音樂 App 風格。
*   **即時搜尋過濾**：在曲目列表右上方的搜尋框，可即時過濾符合的樂譜。
*   **一鍵開啟**：點擊任何曲目即時載入，無需任何多餘步驟。
*   **正在演奏指示燈**：當前演奏曲目顯示呼吸燈動畫的紫色點（active indicator），一目了然。
*   **Menu Lock 鎖定**：鎖定側邊欄後，切換曲目不會再強制關閉選單，支援多曲目對比工作流。

### 🔖 3. 每譜獨立標記保存 (Per-Score Annotation Isolation)
*   **SHA-256 指紋辨識**：每份 PDF 有唯一的加密指紋，標記與 PDF 嚴格綁定。
*   **切換即自動儲存切換**：從 Beethoven 換到 Mahler，前者的所有標記自動儲存；再切回時完整恢復，標記絕不混用。
*   **首次開啟空白畫布**：第一次開啟任何一份新樂譜，都是清白的空白畫布，不帶入其他譜的內容。

### 🤝 4. 樂團協作 (Ensemble Flow & Collaboration)
*   **Share Notes to Section**：一鍵分享練習標記至聲部/樂團。
*   **Fetch from Orchestra**：從樂團/指揮端抓取標記，疊加對比。
*   **Interpretation Styles (演奏風格)**：同時載入多位大師的詮釋方式，以 Ghosting 透明疊加模式對比。

### 📐 5. 極致流暢的閱讀體驗 (Performance Ready)
*   **PDF Continuous Mode**：垂直連續捲動，捨棄傳統翻頁的斷裂感。
*   **Horizontal Scroll Mode**：水平捲動模式，頁面間隔對稱 12px，頁碼顯示在每頁右上角。
*   **Smart Anchor Jump**：以視覺基準線為判斷依據的戰略式樂句跳轉，完全由演奏者自主控制。
*   **可拖曳縮放柱**：左側浮動縮放工具列可任意拖曳至螢幕任何位置，不遮擋樂譜。
*   **精細縮放控制**：5% 漸進式縮放增量，提供更精準的放大縮小體驗。

### 🎭 6. 專業級註記系統 (Professional Annotations)
*   **Notation Groups (專業圖層)**：分為 Pens、Fingering、Bowing、Dynamic、Articulation、Tempo、Anchor 圖層。
*   **連續小節數工具 (Continuous Measure Tool)**：內建智慧遞增面板，使用者可自訂遞增跨度(Step)，連續點擊即可極速標記全曲小節號碼。號碼會精準綁定於左側垂直尺規 (Ruler) 上，作為強大的視覺導航輔助，且不干擾樂譜翻頁翻轉邏輯。
*   **圖形工具 (Shape Tools)**：矩形、圓形、弧線、括號等幾何形狀，可用於標註和視覺強調。
*   **Smart Palette (物件優先工具列)**：記憶各類別上次使用物件，切換時零點擊。
*   **Import / Export JSON**：匯出所有標記為 JSON，支援跨裝置、跨演奏者交換。

---

## 📚 技術文檔 (Technical Documentation)

完整的系統設計文檔供開發者參考：

| 文檔 | 內容 | 用途 |
|---|---|---|
| **CLAUDE.md** | 技術概覽與核心指令 | AI 開發助手參考 |
| **GEMINI.md** | 架構與模組分解 | AI 開發助手參考 |
| **GESTURE_SYSTEM_DESIGN.md** | 手勢系統完整設計 | 了解 5 大手勢類型、平台適應、事件流程 |
| **SHAPES_TOOL_DESIGN.md** | 圖形工具系統 | 圖形渲染、工具集管理、設計實現 |

---

## 👆 手勢系統 (Gesture System)

ScoreFlow 支援多平台統一的手勢交互：

| 手勢 | 功能 | 平台 |
|---|---|---|
| 🤏 **Pinch Zoom** | 雙指捏合縮放，焦點保留 | iPad / Android |
| ⬅️ **Swipe Navigation** | 左右滑動翻頁（基於速度/距離） | All |
| 🎯 **Zone Tap** | 點擊螢幕 9 個區域快速導航 | All |
| 🔄 **Wheel Zoom** | 鼠標滾輪縮放（含平台阻尼） | macOS / Windows |
| 📊 **Bottom Sheet** | 浮動面板拖曳（Docking Bar） | Touch Devices |

詳細設計見 [`GESTURE_SYSTEM_DESIGN.md`](./GESTURE_SYSTEM_DESIGN.md)。

---

## 🛠️ 開發與安裝 (Development & Installation)

```bash
# 安裝依賴
npm install

# 開啟開發模式 (含 LAN 存取)
npm run dev -- --host

# 打包正式版本
npm run build

# 預覽正式版本 (含 LAN 存取)
npm run preview -- --host
```

## 🚀 部署建議 (Deployment)
1.  **GitHub Pages / Vercel / Netlify**：將 `dist/` 資料夾部署至靜態平台。
2.  **區域網路 iPad 存取**：執行 `npm run preview -- --host`，iPad 開啟相同 Wi-Fi 下的網址即可存取。
3.  **PWA 安裝**：瀏覽器選擇「加入主畫面」，即可像原生 App 一樣使用，支援離線模式。

---

## 🌐 平台相容性
| 平台 | 狀態 |
|---|---|
| 💻 macOS / Windows (Chrome, Edge) | ✅ 完整支援 |
| 📱 iPadOS (Safari) | ✅ 完整支援 (含 Apple Pencil) |
| 🤖 Android | ✅ 支援 |
| 📴 離線模式 | ✅ PWA Service Worker |

---

## 🎹 專業術語
*   **Performance Project**：以資料夾為基礎的演奏專案，包含整個演奏季的所有樂譜。
*   **Score Fingerprint**：PDF 的 SHA-256 唯一指紋，確保標記與版本精準對應。
*   **Smart Anchor Jump**：以視覺基準線為參考的使用者自主跳轉機制。
*   **Interpretation Style**：同一譜面上疊加不同演奏詮釋的功能模式。

---
*ScoreFlow v3.0 — Developed with ❤️ for Musicians & Conductors.*
*最後更新：2026-04-06*
