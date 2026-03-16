# Free Text Input Tool

## 目標

在樂譜任意位置點擊，跳出 app 自製輸入框，輸入後在該位置顯示自由文字 stamp。

---

## 現狀分析

- `type === 'text'` 已有處理邏輯（`AnnotationManager.js` line ~832），但使用瀏覽器原生 `prompt()`，體驗差且與 app 風格不符。
- `Text` 類別目前只有固定文字工具（ppp, pp, 指揮, 換頁…），沒有「自由輸入」入口。
- `showDialog({ type: 'input' })` 已存在且有良好 UI，measure number 工具已採用。
- `AnnotationRenderer.js` 已支援 `d.variant === 'input-text'` 渲染多行文字。

---

## 需要修改的檔案

| 檔案 | 修改內容 |
|---|---|
| `src/constants.js` | 在 Text toolset 加入自由文字工具 |
| `src/modules/annotation/AnnotationManager.js` | 改 `prompt()` → `showDialog({ type: 'input' })` |

---

## 實作細節

### Step 1 — constants.js

在 `Text` toolset 的 Row 1 最前面加入：

```js
{ id: 'free-text', label: '文字', row: 1,
  icon: '<text x="12" y="16" font-family="Outfit" font-weight="500" font-size="13" text-anchor="middle" fill="currentColor">T</text>',
  draw: { type: 'special', variant: 'input-text', size: 15 }
},
```

### Step 2 — AnnotationManager.js

將現有的 `prompt()` 改為 app dialog：

```js
// 舊
if (type === 'text' || type === 'tempo-text') {
    const inputText = prompt('Enter text:')
    if (!inputText || !inputText.trim()) return
    data = inputText.trim()
    ...
}

// 新
if (type === 'text' || type === 'tempo-text' || type === 'free-text') {
    const inputText = await this.app.showDialog({
        title: '輸入文字',
        message: '',
        icon: '✏️',
        type: 'input',
        placeholder: '請輸入文字...',
        defaultValue: ''
    })
    if (!inputText || !inputText.trim()) return
    data = inputText.trim()
    if (type !== 'free-text' && !this.app.userTextLibrary.includes(data)) {
        this.app.userTextLibrary.push(data)
    }
}
```

---

## Stamp 顯示

使用現有 `input-text` variant 渲染（`AnnotationRenderer.js` line ~424）：

```js
if (d.variant === 'input-text') {
    ctx.font = `bold ${15 * textScale}px Outfit`
    ctx.fillStyle = color
    const lines = (stamp.data || '').split('\n')
    const lineHeight = 15 * textScale
    lines.forEach((line, i) => {
        ctx.fillText(line, x, y + (i * lineHeight))
    })
}
```

多行支援：使用者輸入 `\n` 換行即可。

---

## 驗證

1. Text 類別出現「文字 T」工具
2. 點擊樂譜 → app 自製輸入框出現（非 browser prompt）
3. 輸入文字後顯示在點擊位置
4. 支援中文、多行
5. 可被 Select/Eraser 工具操作
6. Export JSON 包含 `data` 欄位
7. Export PDF 正確渲染文字
