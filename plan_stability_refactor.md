# 物理穩定性重構計畫 (Stability Refactor)

這項計畫旨在解決橫向翻頁時的「不穩定感」、「抖動」以及「座標漂移」問題。

## ⚠️ 關鍵診斷 (Diagnosis)
- **衝突點**：`JumpManager` 的 `smooth scroll` 與 `TransitionManager` 的 `opacity/transform transition` 在時間與曲線上不同步。
- **後果**：當多個頁面同時渲染或長距離跳轉時，iPad 渲染引擎會出現座標補償誤差，導致視覺上的彈跳。

## 擬定改動 (Proposed Changes)

### 1. Slide 模式：極簡化回歸原生 (`TransitionManager.js` & `viewer.css`)
- **決策**：在 `Slide` 模式下，**徹底不套用** 任何 CSS `out/in` 類別。
- **邏輯**：
    - `TransitionManager` 僅負責「關閉磁吸」與「恢復磁吸」。
    - 視覺位移 100% 由 `JumpManager` 的 `behavior: 'smooth'` 驅動。
    - 移除 `viewer.css` 中關於 `slide-next-out` 等屬性，減少 GPU 計算負擔。

### 2. Flip 模式：座標守護 (`viewer.css`)
- **決策**：移除 `translateX` 與 `transform-origin`。
- **邏輯**：僅透過 `opacity` 與 `z-index` 的切換來呈現分頁感。這能確保捲動座標在整個特效過程中始終處於正確的物理位置。

### 3. 磁吸恢復機制優化 (`TransitionManager.js`)
- **計畫**：將 `finalize` 的延遲緩衝增加到 800ms，或加入捲動停止偵測。
- **目標**：確保磁吸 (`scroll-snap`) 在捲動 100% 停止後才回復，消除回彈 (Snapback)。

## 驗證計畫 (Verification Plan)

### 手動測試 (iPad / Tablet)
- **快速連續換頁**：瘋狂連點「下一頁」，確認畫面依然穩定對齊，無任何抖動。
- **長距離跳轉**：從第一頁跳到最後一頁，確認動畫優雅結束後，磁吸精準鎖定在最後一頁。
- **模式切換**：在 Slide 與 Flip 間切換，確認兩者皆維持 100% 的座標對位精確度。
