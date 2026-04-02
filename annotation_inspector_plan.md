# 實作計畫：標記巡檢助手 (Annotation Inspector)

這份計畫旨在建立一個專門的工具，協助使用者在頁面中的大量或微小標記（例如：小藍點、雜亂線條）之間快速跳轉、定位並進行清理。

---

## 📅 狀態對比 (Baseline vs. Target)

| 狀態 | 原本設計 (Current) | 巡檢助手設計 (Proposed) |
| :--- | :--- | :--- |
| **標記定位** | 靠肉眼掃描页面。 | 按下 `Next` 自動飛躍至標記。 |
| **物件選取** | 必須精確點中像素，選取難度高。 | 巡檢中心自動選定，無需點擊。 |
| **視覺提示** | 只有基本的 Hover 陰影，小物件難以辨識。 | 動態雷達雷射環 (Radar Pulse)，極高辨識度。 |
| **操作效率** | 難以一次性巡視所有微小塵埃。 | 提供清單巡迴，確保檢查不遺漏。 |

---

## 一、 核心模組建立 (Core Engine)

### 1. [NEW] [InspectorManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/annotation/InspectorManager.js)
建立獨立的巡檢器邏輯，負責座標過濾與視窗對焦。
- **巡檢緩存**：過濾出當前頁面所有 `deleted: false` 的標記。
- **對焦導航**：使用 `viewer.scrollTo` 配合坐標轉換，確保目標物件出現在畫面正中央。
- **篩選模式**：
  - `MODE_ALL`: 檢查所有標記。
  - `MODE_TINY`: 僅檢查 `lineWidth < 5` 的細小路徑或點。

---

## 二、 視覺引導整合 (Visual Integration)

### 2. [MODIFY] [AnnotationRenderer.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/annotation/AnnotationRenderer.js)
增加追蹤效果：
- 實作 `drawRadarPulse(ctx, x, y)` 方法。
- 當 `InspectorManager.isActive` 且目前的目標為該標記時，在上方額外渲染一個金色且緩慢擴散的脈衝圓圈。

---

## 三、 UI 面板實作 (UI Panel)

### 3. [MODIFY] [EditSubBarManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/EditSubBarManager.js)
增加操作面板：
- 在 **Others Bar** 增加圖示入口。
- 面板功能：
  - `[ < ]` 上一個標記。
  - `[ 跳過所有大的 ]` 切換模式。
  - `[ > ]` 下一個標記。
  - `[ 🗑️ 刪除 ]` 調用 `AnnotationManager.eraseStampTarget`。
  - `[ X ]` 退出巡檢模式。

---

## 四、 驗證計畫 (Verification)

1. **精準度測試**：隨機在畫面上點擊產生幾個極小的「塵埃點」，啟動巡檢器確認是否能一一抓到。
2. **對焦測試**：縮放比例在 200% 時，確認系統是否能正確將物件置中，而非捲動到奇怪的位置。
3. **刪除測試**：在巡檢介面刪除標記後，確保雲端與 IndexDB 同步更新，且不會在切換回普通模式後「復活」。

---

## 五、 開放問題 (Open Questions)

> [!IMPORTANT]
> **1. 靜音模式**：當巡檢器開啟時，是否應暫時關閉手指繪圖功能，以避免在切換導航時誤畫？
> **2. 鎖定過濾**：是否要預設只顯示「非同步標記」或「最近產生的標記」？
