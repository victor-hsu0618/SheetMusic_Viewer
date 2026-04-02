# 原生觸控質感復刻計畫 (Native Touch Feel Reconstruction)

這項計畫旨在修正「觸控啟動延遲」與「動畫過快」的問題，讓 ScoreFlow 的換頁體驗與 iOS 原生相簿對齊。

## ⚠️ 核心挑戰 (Core Challenges)
- **延遲**：JS 監聽器未優化導致 Safari 等待觸控判定。
- **節奏**：原生 `behavior: 'smooth'` 缺乏細節調整空間。

## 擬定改動 (Proposed Changes)

### 1. 靈敏度手術 (`GestureManager.js` & `interaction.js`)
- **Passive Listeners**：將所有 `.addEventListener('touchstart', ...)` 改為使用 `{ passive: true }`，讓瀏覽器不等待 JS 處理即可啟動捲動。
- **清除延遲鎖定**：優化 `GestureManager` 中的手勢判定邏輯，縮小捲動啟動的判斷時間。

### 2. 自建物理捲動引擎 (`JumpManager.js`)
- **行為升級**：棄用原本不可調速的 `viewer.scrollTo({ behavior: 'smooth' })`。
- **導入 RAF 動劃**：實作一個基於 `requestAnimationFrame` 的 `smoothScrollTo` 函式。
- **控制曲線**：使用 **Cubic-Bezier (0.25, 0.1, 0.25, 1)** 曲線，並將基礎換頁時長設定在 **500ms** (比原生快一點、比現狀慢一點，達成擬真感)。
- **物理對位**：確保在動畫結束後，座標依然能精確對準 `100vw` 邊界。

### 3. CSS 穩定化 (`viewer.css`)
- 保留 `touch-action: pan-x`，確保瀏覽器第一優先級處理橫向位移。

## 驗證計畫 (Verification Plan)

### 手動測試 (iPad / Tablet)
- **啟動反應**：輕輕撥動頁面，確認「指尖一動，畫面即動」，無任何死區 (Dead Zone)。
- **動畫節奏**：觀察換頁過程，確認其具備漸進式的減速感（就像相簿一樣），且換頁速度均稱穩定。
- **穩定度**：確認在高頻撥動下，捲動引擎不會發生座標漂移。
