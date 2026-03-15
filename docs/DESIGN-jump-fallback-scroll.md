# 設計文件：Jump 無 Anchor 時的捲動對齊行為
**狀態：** 草稿 — 待審閱
**日期：** 2026-03-15
**元件：** `src/modules/ruler.js` — `jump()` 無 Anchor 的 fallback 路徑

---

## 1. 背景

ScoreFlow 透過空白鍵 / 方向鍵（或 iPad 觸控區）逐段瀏覽樂譜。主要導航機制為 **Anchor（錨點）系統** — 使用者在樂譜中有意義的位置放置錨點標記，按下 Jump 後畫面會捲動至**跳躍線**下方最近的錨點。

當沒有錨點（或當前位置下方 / 上方已無錨點）時，系統會退回至**固定距離捲動**的 fallback 邏輯。本文件探討此 fallback 行為的設計。

---

## 2. 跳躍線（`jumpOffsetPx`）

跳躍線是一條水平虛線，顯示在距離**視窗頂部**可設定距離的位置，儲存於 `RulerManager.jumpOffsetPx`（預設值：40px）。使用者可上下拖曳調整位置。

其用途：**定義閱讀焦點**。跳躍線標記音樂家視線停留的位置。所有導航應尊重此焦點 — 新內容應落在跳躍線上，而不是消失在跳躍線上方。

```
┌─────────────────────────────┐  ← 視窗頂部（scrollTop = S）
│                             │
│ - - - - - - - - - - - - -  │  ← 跳躍線，位於 S + jumpOffsetPx（40px）
│                             │
│   （樂譜內容）               │
│                             │
│                             │
└─────────────────────────────┘  ← 視窗底部，位於 S + viewportHeight
```

---

## 3. 導航模式

### 模式 A — Fit to Height（`isFitToHeight = true`）

每頁縮放至**一頁 = 一個視窗**的大小。捲動以頁為單位：Jump 前進 = 跳至下一頁頂部。此模式中跳躍線不用於定位 — 頁面固定從視窗頂部開始。

### 模式 B — Fit to Width / 自訂縮放（`isFitToHeight = false`）

頁面縮放至填滿視窗寬度（或使用者自訂縮放比例）。頁面高度超過視窗，導航為連續捲動：視窗依固定距離垂直移動，**跳躍線為閱讀焦點**。

此模式為專業使用的主要模式，亦為本文件討論的對象。

---

## 4. Jump 路徑（模式 B）

### 路徑 1 — 有 Anchor

`computeNextTarget()` 找出跳躍線下方最近的錨點，`scrollToNextTarget()` 捲動至該錨點落在跳躍線上的位置：

```
targetScroll = anchor.absoluteY - jumpOffsetPx
```

跳躍線是著陸點。✓

### 路徑 2 — 無 Anchor（當前 fallback）

```js
// ruler.js 第 318–319 行
const viewportHeight = this.app.viewer.clientHeight
const targetScroll = effectiveScroll + viewportHeight   // ← 現行實作
```

捲動距離恰好等於一個視窗高度。原本在**螢幕底部**的內容會成為新視窗的**最頂部**（新 scrollTop 的起點）。跳躍線被完全忽略。

---

## 5. 問題

在路徑 2 中，跳躍線未被納入考量。前進跳躍後：

```
跳躍前：                        跳躍後（現行）：
┌─────────────────┐             ┌─────────────────┐
│                 │             │ ← 原底部         │  ← 視窗頂部
│ - - - - - - -  │ 跳躍線      │                 │
│                 │             │ - - - - - - -   │  跳躍線（被忽略）
│                 │             │                 │
│                 │             │                 │
│ ← 原底部         │             │                 │
└─────────────────┘             └─────────────────┘
```

原螢幕底部落在視窗最頂部 — **在跳躍線上方 40px**。音樂家必須越過跳躍線往上找到上次閱讀位置，破壞閱讀連續性。

---

## 6. 期望行為

**「將螢幕底部對齊跳躍線。」**

無錨點時前進跳躍後，原本在視窗底部的內容應落在**跳躍線**的位置：

```
跳躍前：                        跳躍後（期望）：
┌─────────────────┐             ┌─────────────────┐
│                 │             │                 │
│ - - - - - - -  │ 跳躍線      │ - - - - - - -   │  ← 原底部落在此處
│                 │             │                 │
│                 │             │                 │
│                 │             │                 │
│ ← 原底部         │             │                 │
└─────────────────┘             └─────────────────┘
```

### 捲動距離推導

```
目標：newScrollTop + jumpOffsetPx = effectiveScroll + viewportHeight
→     newScrollTop = effectiveScroll + viewportHeight - jumpOffsetPx
→     delta = viewportHeight - jumpOffsetPx
```

後退導航使用相同的 delta（對稱設計）：

```
newScrollTop = effectiveScroll - (viewportHeight - jumpOffsetPx)
```

---

## 7. 建議程式碼修改

**檔案：** `src/modules/ruler.js`

```js
// 前進 fallback（無 anchor、非 Fit to Height）
const viewportHeight = this.app.viewer.clientHeight
const delta = viewportHeight - this.jumpOffsetPx        // ← 修改
const targetScroll = effectiveScroll + delta
this.jumpHistory.push(effectiveScroll)
if (this.jumpHistory.length > 50) this.jumpHistory.shift()
this._executeJump(targetScroll)
```

```js
// 後退 fallback（無歷史記錄、非 Fit to Height）
const viewportHeight = this.app.viewer.clientHeight
const delta = viewportHeight - this.jumpOffsetPx        // ← 修改
const targetScroll = effectiveScroll - delta
this._executeJump(targetScroll)
```

---

## 8. 影響分析

| 情境 | 修改前 | 修改後 | 影響 |
|---|---|---|---|
| 無 anchor，前進跳躍 | 捲動 `viewportHeight` | 捲動 `viewportHeight - jumpOffsetPx` | 跳躍距離略短 |
| 無 anchor，後退跳躍 | 向上捲動 `viewportHeight` | 向上捲動 `viewportHeight - jumpOffsetPx` | 與前進對稱 |
| 有 anchor | 不變（路徑 1） | 不變 | 無影響 |
| Fit to Height 模式 | 不變（頁面對齊） | 不變 | 無影響 |
| 跳躍線位於 0px（頂部） | 捲動 `viewportHeight` | 捲動 `viewportHeight` | 結果相同（退化情形） |
| 跳躍線拖至較低位置（如 200px） | 捲動 `viewportHeight` | 捲動 `viewportHeight - 200` | 跳躍距離明顯縮短 |

### `jumpHistory` 後退相容性

歷史記錄儲存的是跳躍當下的 `effectiveScroll`（絕對位置），而非 delta。後退時直接 pop 並跳回精確的上一個位置，與 delta 計算無關。此修改**不影響**歷史記錄型後退跳躍，那些永遠是精確回到原位。

Delta 修改僅影響 `jumpHistory` **為空**時的後退（首次按後退，或新開 session 後）。

---

## 9. 待審閱問題

1. **跳躍線位於 0 時：** `jumpOffsetPx = 0` 是否為有效狀態？若是，期望行為與現行相同，無回歸問題。若 Ruler 被隱藏（切換 Ruler 顯示），fallback 是否應回退至使用 `viewportHeight`？

2. **歷史記錄後退方向：** 使用者按後退後，系統直接 pop 歷史記錄並跳回確切的 scrollTop，已正確。無需修改。

3. **重疊量是否足夠：** 預設 `jumpOffsetPx = 40` 時，每次跳躍有 40px 的重疊（可看到上一屏的最後 40px）。對於流暢閱讀中的音樂家而言，這樣的上下文銜接是否充足？跳躍線預設值是否需要重新評估？

4. **Fit to Height 無歷史後退：** 目前若 Fit to Height 模式下找不到 `prevPageNum`，程式碼直接 return `false`（第 351 行）。是否應改為 fall through 至 delta-based fallback？

---

## 10. 需修改的檔案

| 檔案 | 修改內容 |
|---|---|
| `src/modules/ruler.js` | 前進與後退無 anchor fallback 的 delta：`viewportHeight` → `viewportHeight - jumpOffsetPx` |

不涉及 CSS、HTML 或其他模組。
