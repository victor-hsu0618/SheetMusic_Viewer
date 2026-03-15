# 實作計畫 — 斗篷標籤（Cloak Labels）

## 功能概述

新增三組「斗篷標籤」，讓使用者將任意 stamp 標記為某個隱藏群組。
每組可在 Settings 獨立顯示 / 隱藏，匯出 JSON 與 Print to PDF 也可選擇是否包含。

---

## 資料模型

```js
// 新增 stamp 欄位（undefined = 無標籤，正常顯示）
stamp.hiddenGroup = undefined | 'black' | 'red' | 'gold'

// App 全域狀態，持久化到 localStorage
app.cloakVisible = { black: true, red: true, gold: true }
```

**斗篷定義常數**（`src/constants.js` 新增）：

```js
export const CLOAK_GROUPS = [
    { id: 'black', label: '黑色斗篷', color: '#374151' },
    { id: 'red',   label: '紅色斗篷', color: '#dc2626' },
    { id: 'gold',  label: '金色斗篷', color: '#d97706' },
]
```

---

## 工具設計

### 位置：Stamp Panel → Others 群組（現有群組，直接加入）

```
Others
├── ... （現有工具）
├── 👻 黑色斗篷
├── 👻 紅色斗篷
└── 👻 金色斗篷
```

**Ghost icon SVG**（三個工具共用，靠群組顏色區分）：

```svg
<path d="M12 3a6 6 0 0 0-6 6v8l1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5V9a6 6 0 0 0-6-6z"
  fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
<circle cx="10" cy="10" r="1" fill="currentColor"/>
<circle cx="14" cy="10" r="1" fill="currentColor"/>
```

### 工具行為（click 邏輯）

| 目前 stamp 狀態 | 點擊結果 |
|---|---|
| 無標籤 | 標記為選定斗篷 |
| 已是相同斗篷 | 移除標籤（回到無標籤） |
| 已是不同斗篷 | 切換為新斗篷 |

- 靠近 stamp 時顯示**藍色陰影**（與 Select / Cycle 完全相同）
- 工具加入 `isSelectionTool` 陣列，使用相同 hit-detection 路徑
- 加入 `CoordMapper.isEditTool` 清單（無 touch 偏移）

---

## 徽章渲染（stamp 右上角小點）

在 `drawStampOnCanvas` 最後，若 `stamp.hiddenGroup` 有值且對應群組為顯示狀態，
在 stamp 右上角繪製一個 **6px 實心圓**，顏色對應斗篷。

```
┌──────┐
│  ♩  ●│  ← 6px 圓，黑 / 紅 / 金
└──────┘
```

- 徽章位置：stamp 渲染框右上角 `(x + size*0.5, y - size*0.5)`
- 即使群組為隱藏模式，若此 stamp 被 Cloak 工具 hover，仍暫時顯示（方便操作）

---

## 可見性過濾（渲染層）

`AnnotationRenderer.redrawStamps()` 新增一行（在 layer visible 判斷之後）：

```js
if (stamp.hiddenGroup && !this.app.cloakVisible[stamp.hiddenGroup]) return;
```

---

## Settings 面板（Stamp Panel → Settings → Cloak Labels）

```
─── Cloak Labels ───────────────────────
  ⬛ 黑色斗篷   [toggle on/off]
  🟥 紅色斗篷   [toggle on/off]
  🟨 金色斗篷   [toggle on/off]
```

- 每個 toggle 對應 `app.cloakVisible.black / red / gold`
- 切換後立即呼叫 `app.redrawAllAnnotationLayers()`
- 持久化到 `localStorage`：
  - `scoreflow_cloak_visible_black`
  - `scoreflow_cloak_visible_red`
  - `scoreflow_cloak_visible_gold`

---

## Export JSON（可選）

匯出對話框新增 Cloak 選項區塊：

```
─── 斗篷標籤匯出 ───────────────────────
  ☑ 包含黑色斗篷標記（預設：勾選）
  ☑ 包含紅色斗篷標記（預設：勾選）
  ☑ 包含金色斗篷標記（預設：勾選）
```

未勾選的群組：匯出時篩除 `hiddenGroup` 符合的 stamps（原始資料不修改）。

---

## Print to PDF（可選）

Print to PDF 流程新增相同三個選項：

```
─── 斗篷標籤列印 ───────────────────────
  ☑ PDF 包含黑色斗篷標記（預設：勾選）
  ☑ PDF 包含紅色斗篷標記（預設：勾選）
  ☑ PDF 包含金色斗篷標記（預設：勾選）
```

實作方式：渲染前臨時覆蓋 `app.cloakVisible`，渲染完畢後還原，不修改資料。

---

## 實作範圍

| 檔案 | 修改說明 |
|---|---|
| `src/constants.js` | 新增 `CLOAK_GROUPS` 常數；在現有 Others toolset 加入 3 個 ghost 工具 |
| `src/modules/annotation/InteractionManager.js` | cloak 工具 hit-detection（加入 isSelectionTool）；click 邏輯（tag / untag / switch） |
| `src/modules/annotation/interaction/CoordMapper.js` | 加入 cloak 工具到 `isEditTool` 與 `noXOffsetTools` |
| `src/modules/annotation/AnnotationRenderer.js` | `redrawStamps` 可見過濾；`drawStampOnCanvas` 右上角徽章小點渲染 |
| `src/modules/tools.js` | Settings 加 Cloak Labels section（3 個 toggle）；Export 對話框加 3 個 cloak 選項 |
| `src/main.js` | 初始化 `cloakVisible`；從 localStorage 載入；Print to PDF 流程加 cloak 選項 |

---

## 驗證計畫

1. **標記測試**：選黑色斗篷工具 → 靠近 stamp 出現藍色陰影 → 點擊後右上角出現黑色小點
2. **切換測試**：再點相同 stamp → 移除標籤（小點消失）
3. **不同斗篷切換**：stamp 已是黑色 → 用紅色斗篷工具點擊 → 徽章變紅
4. **隱藏測試**：Settings 關閉黑色斗篷 → 所有黑色斗篷 stamps 消失，其他不受影響
5. **顯示還原**：重新開啟黑色斗篷 → stamps 重現
6. **Export 測試**：取消勾選黑色 → 匯出 JSON 不含黑色 stamps；重新匯入 → 黑色 stamps 不在
7. **PDF 測試**：取消勾選紅色 → 匯出 PDF 不含紅色 stamps；原始資料不受影響
8. **localStorage 持久化**：重新整理頁面 → cloakVisible 狀態保留
9. **與 Cycle 工具互動**：有斗篷標籤的 stamp 被 Cycle 工具操作後，hiddenGroup 欄位保留
10. **Eraser 測試**：刪除有斗篷標籤的 stamp → hiddenGroup 隨 stamp 消失，無殘留
