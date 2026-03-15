# 設計文件：五線譜行偵測與 System Stamp
**狀態：** 草稿 — 待審閱
**日期：** 2026-03-15
**作者：** Victor / Claude

---

## 1. 背景與動機

### 現有問題

ScoreFlow 的 Jump 導航依賴使用者手動放置 **Anchor Stamp** 作為跳躍目標。當使用者沒有放置任何 Anchor 時，系統退回固定捲動一個 viewport 高度，與樂譜的實際行結構完全無關，體驗很差。

### 目標

透過自動偵測每一行樂譜（System）的位置，讓 Jump 在無 Anchor 時也能精準跳到「下一行樂譜的頂部」，符合音樂家翻譜的自然習慣。

### 延伸價值

偵測到的 System 位置資料不只用於 Jump，未來可服務多個功能（見 Phase 2）。

---

## 2. 核心概念：System Stamp

### 設計決策

不另建獨立資料結構，而是將偵測結果存成一種新的 **Stamp 類型**（`type: 'system'`），與現有的 Anchor、Measure 等 Stamp 共用同一套儲存、渲染、匯出機制。

### 優點

- **架構統一** — 沿用現有 Stamp 儲存、IndexedDB key、JSON 匯出，無需另外開發
- **可手動修正** — 偵測錯誤時，使用者可拖移、刪除、手動新增 System Stamp
- **Ruler 整合** — 直接在現有 Ruler 上顯示，不需要新的 UI 元件
- **未來擴充** — 同一筆資料未來可服務小節號對齊等功能

### Stamp 資料結構

```js
// Phase 1（現在實作）
{
  type: 'system',
  page: 1,
  y: 0.08,          // System 頂部 Y / 頁面高度（ratio）
  yBottom: 0.24,    // System 底部 Y / 頁面高度（ratio）
  lineCount: 10,    // 偵測到的線條數（5 = 單 staff，10 = 鋼琴大譜表）
  auto: true,       // true = 自動偵測產生；false = 使用者手動放置
  deleted: false
}

// Phase 2（未來擴充，偵測水平範圍）
{
  ...以上全部,
  xLeft: 0.04,      // 樂譜左緣（第一條小節線）/ 頁面寬度（ratio）
  xRight: 0.96,     // 樂譜右緣 / 頁面寬度（ratio）
}
```

> **為什麼用 ratio？** 與縮放比例無關。使用時再乘以 `_pageMetrics[page].height` 換算為絕對像素。

---

## 3. 偵測演算法（Canvas 像素分析）

### 3.1 方案選擇

| 方案 | 原理 | 適用 | 選用？ |
|---|---|---|---|
| A — Canvas 像素分析 | 讀取渲染後的 canvas 像素，找深色水平線 | 向量 PDF + 掃描版 | ✅ |
| B — PDF operator 解析 | 解析 PDF 內容流的繪圖指令 | 向量 PDF 限定 | ✗（不支援掃描版）|

選用方案 A，因為需要同時支援大量掃描版 A4 PDF。

### 3.2 偵測流程

```
渲染頁面到 canvas（固定 scale=1.5，速度優先）
  ↓
取樣背景亮度 → 計算自適應深色門檻
  ↓
逐行掃描像素 → 計算每行深色像素比率（rowDensity）
  ↓
找出超過密度門檻的候選行（candidate rows）
  ↓
合併連續候選行 → 線段（segments）
  ↓
過濾過厚線段（文字、樑線）
  ↓
依間距分群 → Systems
  ↓
換算為 ratio → 存入 System Stamp
```

### 3.3 自適應深色門檻（掃描版關鍵）

掃描版 A4 紙張背景常有泛黃、陰影，固定門檻會誤判。改用自適應：

```js
// 取頁面六個邊緣區塊（各 20×20px）的平均亮度，估算背景色
function sampleBackgroundLuminance(imageData, width, height) { ... }

darkThreshold = backgroundLuminance × 0.75
// 向量 PDF：背景 255 → 門檻 191
// 掃描泛黃：背景 210 → 門檻 158（避免把紙張算成深色）
```

### 3.4 偵測參數（預設值）

| 參數 | 預設值 | 說明 |
|---|---|---|
| 偵測用 scale | 1.5 | 固定低解析度，速度優先 |
| 行密度門檻 | 0.30 | 超過 30% 深色像素視為線條 |
| 最大線條厚度 | 8px | 超過視為文字或樑線，排除 |
| System 間距門檻 | 25px | 間距超過此值視為不同行 |
| 左右邊距排除 | 8% | 忽略頁面兩側（避免 brace、頁碼干擾）|
| 取樣步長 | 2px | 每 2px 取樣一次（速度與精準度平衡）|

---

## 4. 偵測時機與快取

### 4.1 自動偵測（背景執行）

PDF 載入後：

```
1. 查詢 cache（IndexedDB）是否已有此 PDF 的 System Stamp
2. 有 cache → 直接載入，略過偵測
3. 無 cache → 顯示 toast「正在分析樂譜結構... 第 X / N 頁」
              逐頁偵測（非同步，不阻塞 UI）
              完成 → 儲存 cache，toast 消失
```

### 4.2 手動偵測工具

考量掃描版 PDF 偵測可能耗時較長，在 **Stamp Tool → Settings** 新增「System Detection」區塊：

```
Stamp Tool > Settings > System Detection
┌─────────────────────────────────────┐
│  System Detection                   │
│  已偵測：24 個 System（共 3 頁）      │
│  [ Detect ]  [ 刪除全部 ]            │
└─────────────────────────────────────┘
```

- **Detect** — 對目前載入的 PDF 執行全文件偵測，完成後儲存 cache
- **刪除全部** — 清除所有 System Stamp（含自動偵測與手動調整的）

### 4.3 重新偵測條件

| 情況 | 是否重新偵測 |
|---|---|
| 使用者點「重新偵測」 | ✅ 是 |
| 縮放比例改變 | ✗ 否（ratio 格式與縮放無關）|
| 載入相同 PDF（相同 fingerprint）| ✗ 否（使用 cache）|
| 載入不同 PDF | ✅ 是（不同 fingerprint）|

---

## 5. UI：顯示開關

System Stamp 預設**不顯示**，使用者可在設定面板開啟：

```
設定面板
[ ] 顯示樂譜行標記   ← 預設關閉
```

開啟後：
- Canvas 上每個 System 頂部顯示淡色半透明橫條（有別於 Anchor 的顏色）
- Ruler 上顯示對應標記
- 使用者可拖移調整位置、刪除錯誤的 System、手動新增遺漏的 System

---

## 6. Jump 邏輯更新（ruler.js）

### 現行 fallback 優先順序（無 Anchor）

```
Fit to Height → 跳至下一頁頂部
否則         → 捲動一個 viewportHeight（忽略跳躍線）
```

### 新 fallback 優先順序

```
1. Anchor 存在             → 跳至最近 Anchor（現有邏輯，不變）
2. System Stamp 存在       → 跳至下一個 System 頂部，對齊跳躍線  ← 新增
3. Fit to Height 模式      → 跳至下一頁頂部（現有邏輯，不變）
4. 最終 fallback           → 捲動 viewportHeight - jumpOffsetPx  ← 修正
```

### 新 fallback 程式碼（概念）

```js
// 無 Anchor 路徑中，優先查 System Stamp
const systems = this.app.stamps.filter(s => s.type === 'system' && !s.deleted)
const metrics = this.app.viewerManager._pageMetrics

const nextSystem = systems.find(sys => {
    const m = metrics[sys.page]
    if (!m) return false
    const absTop = m.top + sys.y * m.height
    return absTop > effectiveScroll + this.jumpOffsetPx + 2
})

if (nextSystem) {
    const m = metrics[nextSystem.page]
    const absTop = m.top + nextSystem.y * m.height
    this.jumpHistory.push(effectiveScroll)
    this._executeJump(absTop - this.jumpOffsetPx)  // 對齊跳躍線
    return true
}
// 繼續往下走現有 fallback...
```

---

## 7. 新模組：StaffDetector.js

```
src/modules/StaffDetector.js
  ├── detectPage(pdfPage)           → system[] （偵測單頁）
  ├── detectAllPages(pdf, onProgress) → system[] （逐頁偵測，含進度 callback）
  └── params                        （可被設定 UI 覆寫）
```

快取的讀寫沿用現有 `src/db.js`，不另建介面。

---

## 8. 功能路線圖

### Phase 1（本次實作）

- [x] 測試頁驗證演算法（已完成）
- [ ] 建立 `StaffDetector.js` 模組
- [ ] PDF 載入後自動偵測，存為 System Stamp
- [ ] 設定面板：手動偵測工具 + 顯示開關
- [ ] `ruler.js` jump() 新增 System Stamp fallback
- [ ] Ruler 顯示 System 標記

### Phase 2（未來）

| 功能 | 需要的新資料 | 說明 |
|---|---|---|
| 小節號自動對齊 System 左緣 | `xLeft` | 偵測每行第一條小節線的 X 位置 |
| 每行自動放置小節號 | `xLeft` + `y` | 依 System 頂部 + 左緣自動建立 Measure Stamp |
| 水平捲動對齊 | `xLeft` + `xRight` | 超寬譜面的水平導航 |

---

## 9. 影響範圍

| 檔案 | 變更內容 |
|---|---|
| `src/modules/StaffDetector.js` | 新建 |
| `src/modules/ruler.js` | `jump()` 新增 System Stamp fallback；最終 fallback 修正為 `viewportHeight - jumpOffsetPx` |
| `src/main.js` | PDF 載入後呼叫 StaffDetector；`app.stamps` 已相容（直接 filter by type）|
| `index.html` | 設定面板新增手動偵測區塊 + 顯示開關 |
| `src/db.js` | 確認相容（預計無需修改）|
| `src/constants.js` | 新增 `'system'` stamp type 定義 |

---

## 10. 設計決策（已確認）

| # | 問題 | 決策 |
|---|---|---|
| 1 | 鋼琴大譜表跳躍單位 | 整個 System 算一次跳躍，Jump 到高音 staff 頂部（System 頂部） |
| 2 | 手動偵測入口位置 | Stamp Tool → Settings → 新增「System Detection」區塊（含 Detect、刪除） |
| 3 | 偵測失敗頁面 | 跳過不建立 System Stamp，Jump 退回最終 fallback（`viewportHeight - jumpOffsetPx`） |
| 4 | System Stamp 顯示顏色 | 藍色（與 Anchor 同色系） |
