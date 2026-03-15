# FA/CA 報告 — iOS 雙重跳頁錯誤
**問題編號：** SCF-2026-002
**日期：** 2026-03-15
**嚴重程度：** 高（主要平台核心導航功能失效）
**平台：** iPad / iOS Safari
**元件：** `src/modules/GestureManager.js`、`src/modules/InputManager.js`

---

## 失效分析（FA）

### 問題現象

在 iPad 上使用 **Fit-to-Height** 模式時，點擊樂譜的左側、右側或上方觸控區域，畫面會跳轉**兩頁**而非一頁。此問題僅在觸控輸入（iPad）時發生，桌機滑鼠操作不受影響。

同次排查中也發現：**Fit-to-Height** 模式並未真正填滿螢幕，底部仍會露出下一頁的部分內容。

---

### 根本原因分析

iOS WebKit 對單次實體點擊會觸發**兩個事件**：

1. `touchend` — 手指離開螢幕時立即觸發的原生觸控事件
2. 合成 `click` — iOS 為向下相容而自動產生的模擬點擊事件

系統中有兩個獨立的監聽器都會呼叫 `handleZoneTap()` → `jump()`：

| 監聽器 | 檔案 | 行號 | 觸發事件 |
|---|---|---|---|
| `initNavigationGestures()` | `GestureManager.js` | 146 | `touchend` |
| `initMouseListeners()` | `InputManager.js` | 280 | `click` |

每次呼叫 `handleZoneTap()` 就會執行一次 `jump()`，因此一次點擊 → 兩次跳頁。

**滑鼠不受影響的原因：** 桌機滑鼠點擊不會觸發 `touchend`，因此只有 `click` 監聽器執行，一次點擊 → 一次跳頁，行為正確。

**在 Fit-to-Height 模式下最明顯的原因：** 一般捲動模式下雙重跳頁較不易察覺，但在 Fit-to-Height 模式中，一頁恰好等於一個視窗高度，兩次跳頁就等於跳過整頁，問題立即顯現。

---

### 排查過程

| 步驟 | 動作 | 結果 |
|---|---|---|
| 1 | 在 `isEventInUI()` 加入 `elementFromPoint` 座標檢查 | 無效——問題不是由觸控事件穿透 UI 層造成 |
| 2 | 在 Fit-to-Height 重新渲染後加入 `isApplyingZoom` 800ms 封鎖 | 減少競態條件干擾，但雙重跳頁問題仍存在 |
| 3 | 在 `jump()` 及所有手勢處理器加入 `console.log` 與呼叫堆疊追蹤 | 找出根本原因 |

**關鍵日誌證據：**
```
[jump] jump(-1) scrollTop=1241 | handleZoneTap@GestureManager.js:167
[jump] jump(-1) scrollTop=1235 | handleZoneTap@GestureManager.js:167 | @InputManager.js:280
```

每次點擊產生兩次連續的 `jump()` 呼叫，且呼叫堆疊不同，確認為雙監聽器同時觸發所致。

---

## 矯正措施（CA）

### 修復一 — Fit-to-Height 填滿全螢幕

**檔案：** `src/modules/ViewerManager.js` — `fitToHeight()`

`availH` 有一個硬編碼的 `-20` 安全邊距，導致縮放比例無法真正填滿視窗，予以移除。

```js
// 修改前
const availH = this.app.viewer.clientHeight - 20

// 修改後
const availH = this.app.viewer.clientHeight
```

---

### 修復二 — Fit-to-Height 重新渲染後鎖定頁面位置

**檔案：** `src/modules/ViewerManager.js` — `fitToHeight()`

重新渲染後，iOS 慣性捲動可能使視窗偏離目標頁面頂部。加入 `overflow:hidden` 技巧以中止慣性捲動，再將 `scrollTop` 對齊目標頁面。

```js
this.app.viewer.style.overflowY = 'hidden'
this.app.viewer.scrollTop = m.top
requestAnimationFrame(() => {
    this.app.viewer.style.overflowY = ''
})
```

同時加入 `isApplyingZoom = true`，在重新渲染後封鎖觸控手勢 800ms，避免重排期間誤觸。

---

### 修復三 — 抑制 touchend 觸控區點擊後的 iOS 合成 click（根本修復）

**檔案：** `src/modules/GestureManager.js`、`src/modules/InputManager.js`

當 `touchend` 已處理觸控區點擊時，設定旗標以抑制後續的合成 `click` 事件：

**GestureManager.js：**
```js
// 觸控區點擊
if (this.app.activeStampType === 'view' && dt < 300 && ...) {
    this.inputManager._suppressNextClick = true   // ← 新增
    this.handleZoneTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY)
}
```

**InputManager.js：**
```js
viewer.addEventListener('click', (e) => {
    if (this._suppressNextClick) {   // ← 新增
        this._suppressNextClick = false
        return
    }
    // ... 原有滑鼠點擊處理邏輯
})
```

桌機滑鼠點擊不受影響——旗標僅在觸控事件中設定，滑鼠事件永遠不會觸發此旗標。

---

### 相關提交記錄

| Hash | 說明 |
|---|---|
| `9ac8a3b` | fix: fit to height fills full screen height |
| `d5fb031` | fix: add elementFromPoint check to isEventInUI for iOS bleed-through |
| `77581a9` | fix: block touch gestures during fit-to-height re-render + snap to page top |
| `cdd482e` | debug: add console logs to trace double-jump root cause |
| `a83bd55` | debug: add timestamps and call stack to gesture + jump logs |
| `c648aeb` | fix(touch): prevent iOS double-jump by suppressing synthetic click after touchend |

---

## 驗證清單

- [ ] 在 iPad 點擊左側觸控區 → 恰好前進 1 頁
- [ ] 在 iPad 點擊右側觸控區 → 恰好前進 1 頁
- [ ] 在 iPad 點擊上方觸控區 → 恰好後退 1 頁
- [ ] 桌機滑鼠點擊導航正常（1 次點擊 = 1 頁）
- [ ] Fit-to-Height 填滿全螢幕，底部無下一頁內容外露
- [ ] 左右滑動翻頁手勢無回歸問題
- [ ] 長按開啟 Stamp Palette 無回歸問題
