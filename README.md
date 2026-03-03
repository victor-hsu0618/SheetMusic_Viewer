# 🎼 ScoreFlow v2.0
> **The Ultimate Musical Performance Hub.** 
> 一款為專業樂手、指揮與大師設計的高階樂譜閱讀與協作平台。

ScoreFlow 重新定義了數位閱譜體驗，將傳統的 PDF 閱讀器轉化為具備「多重人格比對」與「聲部協作」功能的專業音樂工作站。不論您是在交響樂團、室內樂團還是音樂教學場景，ScoreFlow 都能提供最具深度與流暢的解決方案。

---

## 🔥 核心超級特點 (Super Features)

### 🚀 1. 極致流暢的閱讀體驗 (Performance Ready)
*   **PDF Continuous Mode (連續捲動模式)**：捨棄傳統翻頁的斷裂感，採用垂直連續捲動，讓您的視線始終聚焦在音符上，如同捲軸般的流暢感。
*   **Smart Anchor Jump (戰略式樂句跳轉)**：
    *   **跳轉時機自定義 (User-Triggered Alignment)**：不同於傳統 App 在固定的「頁面邊界」強制翻頁，引發演奏者的換頁焦慮。ScoreFlow 允許樂手在**樂句空隙（如：休止符、長音、呼吸點）**主動啟動跳轉。
    *   **預選下一段 (Phrase Foresight)**：樂手可以在演奏 A 句末尾時，提前將 B 句對齊到視覺基準線 (Jump Target Line)，確保進入激烈段落前，視覺區域已經完美就緒，徹底杜絕「來不及換頁」的表演事故。
*   **Offline Mode Support (全天候離線支援)**：專為音樂廳與地下室琴房設計。一旦開啟過，即具備 PWA 離線作業能力，完全不依賴網路。
*   **Smart Palette (物件優先工具列)**：自動記憶各圖層上次使用的物件，讓您在標記指法、弓法與表情時，點擊次數減少 60%。

### 🎭 2. 專業級註記與多重身分 (Professional Annotations)
*   **Notation Groups (專業圖層) & Sources**：將註記分為 Performance、Fingering、Bowing 等專業圖層，支援一鍵顯隱。
*   **Multi-Persona Comparison (多重演奏人格比對)**：您可以同時疊加「大師註解」、「指揮提示」與「個人研究」。透過 **Ghosting (半透明比對)** 模式，在同一張譜上進行多維度的交叉閱讀。
*   **Digital Score Fingerprinting (樂譜指紋驗證)**：採用 SHA-256 加密技術，確保標記檔案與 PDF 版本（如 Henle vs Barenreiter）精準匹配，防止標記錯位。

### 🤝 3. 雲端協作與社群分享 (Collaboration Hub)
*   **Cloud Sharing Bridge (雲端分享橋接)**：發佈您的標記至聲部空間 (Published Work)。支援對接 Google Drive 或內部伺服器，實現全團弓法同步。
*   **Peer Grabbing (一鍵抓取參考)**：看到團員分享的卡片？一鍵抓取並「疊加」為新的 Persona，即時對比首席的弓法設定。
*   **Multi-User Profile (多重職業身分管理)**：一位音樂家可能參加多個樂團。支援快速切換 Profile（如：TSO 首席 vs. 弦樂四重奏成員），發佈標記時自動帶入正確身分。

### 🌐 4. 全平台跨裝置支援 (Universal Support)
*   **Web PWA 技術**：無需安裝複雜軟體，透過瀏覽器即可獲得原生 App 指令。
*   **相容性**：
    *   💻 **macOS / Windows / Linux** (Chrome, Edge, Safari)
    *   📱 **iOS / iPadOS** (支援 Apple Pencil 精細標記)
    *   🤖 **Android** (支援 S-Pen 與各大安卓平板佈局)

---

## 🛠️ 開發與安裝 (Development & Installation)

```bash
# 安裝依賴
npm install

# 開啟開發模式
npm run dev

# 打包正式版本
npm run build
```

## 🚀 部署建議 (Deployment)
1. **GitHub Pages / Vercel**：適合個人或研究團隊快速部署。
2. **PWA 安裝**：在瀏覽器中選擇「加入主畫面」，即可像原生 App 一樣從桌面啟動，享受全螢幕視野。

---

## 🎹 專業術語說明
*   **Concertmaster Setup**：由首席標定的權威標記基準。
*   **Jump Target Line**：畫面上的視覺定位虛線，確保跳轉後的視線對齊。

---
*Developed with ❤️ for Musicians & Conductors.*
