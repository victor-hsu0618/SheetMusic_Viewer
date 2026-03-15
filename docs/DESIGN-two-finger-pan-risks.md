# 設計風險評估：Stamp 模式兩指捲動（Two-Finger Pan in Stamp Mode）

**狀態：** ⚠️ 實驗性 — 已實作，預設 **OFF**，可在 Stamp Settings → More → 兩指捲動 開啟
**日期：** 2026-03-15
**作者：** Victor / Claude

---

## 1. 功能概述

在任何 Stamp 工具（Pen、Bowing、Fingering、Select 等）啟用時，使用者可以用**兩根手指**拖曳捲動 PDF，而不需要切換到 View（手形）模式。

### 實作方式

- `capture-overlay` 的 `pointerdown` handler 在 `isInteracting` 判斷之前，先追蹤所有 touch pointerId
- 偵測到第二根手指時：取消任何進行中的 stamp 互動，啟動 JS-based scroll（同 View 模式的單指 pan 機制）
- 兩指移動時：計算兩指重心位移，直接寫入 `viewer.scrollTop / scrollLeft`
- 兩指結束後：400ms cooldown，期間 preview 不顯示、stamp 不貼上

### 修改的檔案

- `src/modules/annotation/InteractionManager.js`（核心，未 commit）

---

## 2. 已知風險清單

### 🔴 高風險

#### R-01：`activePointers` 是 per-overlay 的局部變數

每個頁面的 `createCaptureOverlay()` 呼叫會建立一個獨立的 `activePointers` Map。

**問題：** 若兩根手指分別落在不同頁面（不同 overlay），每個 overlay 的 `activePointers.size` 各為 1，永遠不會達到 2，兩指捲動**完全不觸發**。

```
Page 3 overlay: activePointers = { ptr1 }  ← size 1, 沒有觸發
Page 4 overlay: activePointers = { ptr2 }  ← size 1, 沒有觸發
```

**情境：** 樂譜縮放較小時（Fit to Width），一個頁面可能比 viewport 短，兩指容易跨頁。

**建議修正方向：** 將 `isTwoFingerPanning`、`activePointers` 等狀態提升至 app 層級（`this.app` 屬性），讓所有 overlay 共享。

---

#### R-02：cooldown 是 per-overlay，不跨頁面生效

`panCooldown` 旗標只存在於觸發兩指 pan 的那個 overlay 的閉包中。其他頁面的 overlay 在兩指 pan 結束後**立即恢復正常**，可能在使用者手指尚未離開螢幕時就允許 stamp 貼上。

**情境：** 使用者捲動到頁面邊界，一根手指抬起時剛好碰到相鄰頁面的 overlay → 那個 overlay 沒有 cooldown → 誤觸貼上。

---

#### R-03：第一根手指 pointerdown 到第二根手指 pointerdown 之間的時間窗口

兩指不可能同時接觸螢幕。在：
```
第一指 pointerdown → 啟動 stamp 互動（isInteracting = true）
                    ↑ 這段時間 ↑
第二指 pointerdown → 偵測到兩指，取消 stamp 互動
```
這個短暫窗口中：

- 如果使用者習慣慢慢放下第二指（> 100ms），第一指已經開始 stamp 互動
- 取消時會清掉 `activeObject` 並呼叫 `redrawStamps`，但**部分筆觸工具**（pen、highlighter）可能已將初始點加入路徑
- 實際測試：路徑類工具（pen）在只有一個點時取消，畫面上不可見、也不會儲存——**目前看起來安全**，但未完整驗證

---

### 🟡 中風險

#### R-04：Grace Period 物件在兩指 pan 後的狀態不明

若使用者剛放完一個 stamp（進入 grace period，graceObject 存在），這時使用兩指捲動：

- 我們呼叫 `InteractionUI.showTrash(false, wrapper)` 取消 trash 顯示
- 但 `graceObject` 仍存在，`graceTimer` 仍在倒數（1800ms）
- Cooldown 結束後，使用者若立即再碰 → `startAction` 可能觸發 grace period 重抓邏輯
- **預期行為不明**，需要實機測試

---

#### R-05：無視覺回饋表示「現在是捲動模式」

兩指捲動啟動時，畫面上沒有任何視覺指示（工具圖示不變、cursor 不變）。

- 使用者無法判斷「捲動成功」還是「即將貼上 stamp」
- 先前已試過在兩指時顯示 stamp preview → 使用者感到危險（這正是此文件的起因）
- **尚未實作替代的視覺回饋**

---

#### R-06：與 iOS Safari 的歷史 touch bug 潛在衝突

本專案過去有多個 iOS touch 問題（見 `FA-CA_iOS-Touch-Overlay-2026-03.md`、`FA-CA_iOS-Double-Jump-2026-03.md`）：

- iOS 會在 `touchend` 後合成 `click`（ghost tap）
- `touch-action: none` + Pointer Events 在 iOS 的行為有許多已知怪異之處
- 新的 `window.addEventListener('pointermove', doTwoFingerPan)` 是否會與現有 iOS 修補衝突，**尚未在實機上驗證**

---

#### R-07：`e.touches` 在 window-level Pointer Events 的可靠性

`hoverAction` 使用 `e.touches?.length >= 2` 判斷多指。

- 這在 overlay 上的 `pointermove` 是可靠的（iOS 的 Pointer Events 帶有 `touches` 屬性）
- 但 `window.addEventListener('pointermove', doTwoFingerPan)` 是 window-level handler，`e` 是 `PointerEvent`，不保證有 `e.touches`
- 目前 `doTwoFingerPan` 改用 `activePointers` Map 追蹤，不依賴 `e.touches` → **暫時安全**，但 R-01 的 per-overlay 問題仍存在

---

### 🟢 已處理的風險

| 已處理 | 解法 |
|---|---|
| 兩指時顯示 stamp preview | `hoverAction` 偵測 `e.touches.length >= 2` → 立即 return，隱藏 virtualPointer |
| 兩指時第一指已建立 preview | 進入兩指 pan 時呼叫 `redrawStamps(pageNum)` 清除 virtual canvas |
| Pan 結束後誤觸貼上 | 400ms `panCooldown`，期間 `startAction` 直接 return |
| Pan 結束後仍顯示 preview | `panCooldown` 期間 `hoverAction` 也返回，virtualPointer 隱藏 |
| View 模式與兩指 pan 衝突 | 加了 `toolType !== 'view'` 判斷，View 模式不走兩指 pan 路徑 |

---

## 3. 測試清單（上線前必做）

### 基本功能

- [ ] Stamp 模式（選任一 Bowing/Fingering 工具）→ 兩指同頁捲動，能否順暢滾動？
- [ ] 兩指捲動結束後等待 400ms → 能正常貼 stamp？
- [ ] 兩指捲動結束後立即點 → stamp 是否被攔截？
- [ ] View 模式單指 pan → 是否不受影響？

### 邊界情況

- [ ] 兩指**跨頁面**（一指在 page 3，一指在 page 4）→ 是否觸發捲動或靜默失敗？（R-01）
- [ ] 兩指捲動結束後，手指停留在螢幕上 → 只有觸發 pan 的 overlay 有 cooldown，其他頁面是否誤觸？（R-02）
- [ ] Grace period 活躍時使用兩指捲動 → 結束後 grace object 行為是否正常？（R-04）
- [ ] 快速多次兩指捲動（連續操作）→ `activePointers` Map 是否正確歸零？

### iOS 專項

- [ ] iPad Safari 實機測試（非模擬器）
- [ ] 兩指捲動後是否觸發 iOS ghost tap？（R-06）
- [ ] `e.touches` 在 `hoverAction` 的 `pointermove` 中確實有值？

---

## 4. 建議的修正方向（按優先順序）

### P1：將兩指狀態提升至 app 層級（解決 R-01、R-02）

```js
// 在 main.js 或 InteractionManager constructor 中初始化：
this.app.twoFingerPanState = {
    active: false,
    cooldown: false,
    scrollStart: { top: 0, left: 0 },
    centroidStart: { x: 0, y: 0 },
    pointers: new Map(), // 全域 pointerId 追蹤
}
```

所有 overlay 共享同一個狀態，任何 overlay 偵測到兩指都能觸發全域捲動，cooldown 也對所有 overlay 生效。

### P2：加入兩指捲動的視覺回饋（解決 R-05）

可在 viewer 上方顯示一個短暫的半透明「捲動中」提示，或在兩指 pan 時將 overlay 的 cursor 改為 `grab`：

```js
// 進入兩指 pan 時：
document.querySelectorAll('.capture-overlay').forEach(el => {
    el.style.cursor = 'grabbing';
});
// 結束時恢復
```

### P3：加入 `visibilitychange` 清理（解決潛在的事件監聽器洩漏）

```js
document.addEventListener('visibilitychange', () => {
    if (document.hidden && isTwoFingerPanning) {
        // 強制結束兩指 pan，清除所有 window-level listeners
        isTwoFingerPanning = false;
        activePointers.clear();
        window.removeEventListener('pointermove', doTwoFingerPan);
        window.removeEventListener('pointerup', stopTwoFingerPan);
        window.removeEventListener('pointercancel', stopTwoFingerPan);
    }
});
```

---

## 5. 決策記錄

| 問題 | 現況決策 |
|---|---|
| 要不要上線？ | **暫緩** — 等 R-01（跨頁問題）確認後再決定 |
| Cooldown 時間 400ms 是否合適？ | 待實機測試調整，目前是估計值 |
| 是否需要視覺回饋？ | 使用者反映「很危險」，建議 P2 先做再上線 |
| 替代方案？ | 考慮改為：長按（long press）切換到臨時 View 模式，比兩指偵測更直觀、更安全 |

---

## 6. 替代方案評估

| 方案 | 優點 | 缺點 |
|---|---|---|
| **兩指 pan（當前實作）** | 符合 iOS 使用習慣 | 跨頁問題、誤觸風險、實作複雜 |
| **長按切換暫時 View 模式** | 直觀、不怕誤觸、與標準 App 一致 | 需要長按偵測，在 pen 工具上容易誤判 |
| **搖晃手勢切換** | 明確意圖 | 不直覺，iOS 裝置上可靠性差 |
| **不實作（維持現狀）** | 零風險 | 使用者必須切換工具才能捲動，流暢度差 |
