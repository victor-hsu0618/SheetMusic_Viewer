# 簡化 Flip 模式動畫計計畫 (Simplify Flip Animation)

這項計畫旨在解決橫向模式下「Flip 特效卡頓」的問題，透過「減法設計」提升閱譜流暢度。

## ⚠️ 關鍵變更 (Key Changes)
- **原本模式 (Laggy)**：使用 `rotateY(100deg)` 進行真實 3D 空間旋轉，對 GPU 壓力極大。
- **改動後模式 (Snappy)**：使用 **2D 平面堆疊 (Stacked Slider)**。下一頁以「疊加載入」的方式快速覆蓋上一頁，不進行旋轉，僅進行位移與輕微不透明度過渡。

## 擬定改動 (Proposed Changes)

### 1. 動畫樣式重構 (`src/styles/viewer.css`)
將 Flip 類別的屬性從 3D 切換為 2D 位移。

#### [MODIFY] [viewer.css](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/styles/viewer.css)
- 移除 `perspective: 1200px` 與 `rotateY`。
- 修改 `flip-forward-out`：改為輕微向左位移並淡出。
- 修改 `flip-next-in` / `flip-prev-in`：改為疊加層級較高的位移覆蓋。
- 確保所有轉換都使用 `translate3d(x, y, 0)` 以保持硬體加速，但減少透視計算。

### 2. 特效邏輯同步 (`src/modules/TransitionManager.js`)
- 調整 Flip 模式的持續時間與 `TransitionEnd` 偵測。
- 確保在 Flip 模式下同樣鎖定 **100% 亮度**，不產生額外的陰影濾鏡。

## 驗證計畫 (Verification Plan)

### 自動化測試
- 無（主要為視覺效能測試）。

### 手動測試 (iPad / Tablet)
- **效能比對**：切換至 Flip 模式，確認翻頁時不再出現掉幀或卡頓現象。
- **疊加質感**：確認頁面切換時具備明顯的「後頁蓋前頁」質感，而非單純的平整滑動。
- **穩定性**：確認長距離 jump 時，Flip 模式能與 JumpManager 完美對位。
