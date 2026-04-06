# Shapes Tool 設計重點說明

## 概述
**Shapes** 工具集是 ScoreFlow 中用於在樂譜上繪製音樂符號的核心功能，包括：
- **Lines**: Slur（圓滑線）、Line（直線）
- **Brackets**: [ ]（方括號）、{ }（花括號）
- **Geometry**: Rect（矩形）、Circle（圓形）

---

## 🔴 2026-04-06 Critical Bugs Report

### Bug #1: TOOLSET 結構不同步（致命設計缺陷）

#### 問題描述
- `toolset-inspector.html` 中定義了 "Shapes" TOOLSET（第 1294 行）
- 但 `src/constants.js` 中完全沒有 "Shapes" TOOLSET
- 導致 EditSubBarManager 無法找到 Shapes 工具，stamp panel 無法加載它們

#### 根本原因
**架構設計缺陷**：存在兩套獨立的工具定義系統
- `src/constants.js` - 應用的真實來源
- `public/tools/toolset-inspector.html` - 診斷工具的定義

這兩套定義不同步，導致工具配置混亂。

#### 影響範圍
- ✗ Rect 和 Circle 在 stamp panel 中無法顯示（以為沒有或被隱藏）
- ✗ 代碼邏輯流程崩潰：
  ```javascript
  // EditSubBarManager.js:363
  const group = TOOLSETS.find(g => g.name === 'Shapes')  // 返回 undefined!
  flatItems = group ? group.tools.map(...) : []           // 結果: []
  ```
- ✗ 用戶體驗完全破壞

#### 修復方案
在 `src/constants.js` 中創建新的 "Shapes" TOOLSET：
```javascript
{
    name: 'Shapes',
    type: 'draw',
    tools: [
        { id: 'line', label: 'Line', ... },
        { id: 'slur', label: 'Slur', ... },
        { id: 'bracket-left', label: '[', ... },
        { id: 'bracket-right', label: ']', ... },
        { id: 'curly-left', label: '{', ... },
        { id: 'curly-right', label: '}', ... },
        { id: 'rect-shape', label: 'Rect', ... },
        { id: 'circle-shape', label: 'Circle', ... },
    ]
}
```

---

### Bug #2: 缺少 Canvas 繪製命令（致命渲染缺陷）

#### 問題描述
所有 Shapes 工具在 `AnnotationRenderer.js` 中都**缺少 `ctx.stroke()` 調用**

受影響工具：
1. **slur** - 第 230-262 行：創建 Bezier 曲線但不繪製
2. **bracket-left/bracket-right** - 第 279-304 行：繪製括號端點但不繪製
3. **curly-left/curly-right** - 第 263-278 行：繪製 Bezier 花括號但不繪製
4. **rect-shape** - 第 305-308 行：定義矩形但不繪製
5. **circle-shape** - 第 309-316 行：定義橢圓但不繪製

#### 根本原因
**不完整的代碼實現**：開發者創建了 Canvas path 和幾何形狀，但忘記調用 `ctx.stroke()` 來實際繪製

典型的錯誤模式：
```javascript
// ❌ 錯誤：缺少 ctx.stroke()
if (path.type === 'rect-shape' && path.points.length >= 2) {
    const p2 = path.points[path.points.length - 1]
    ctx.beginPath()
    ctx.rect(startX, startY, p2.x * canvas.width - startX, p2.y * canvas.height - startY)
    // ← 忘記了！ ctx.stroke()
}

// ✅ 正確：完整的繪製流程
if (path.type === 'rect-shape' && path.points.length >= 2) {
    const p2 = path.points[path.points.length - 1]
    ctx.beginPath()
    ctx.rect(startX, startY, p2.x * canvas.width - startX, p2.y * canvas.height - startY)
    ctx.stroke()  // ← 必須有！
}
```

#### 影響範圍
- ✗ 所有 Shapes 工具完全無法在 PDF 上顯示
- ✗ 用戶能在 UI 中看到工具按鈕，但繪製毫無反應
- ✗ 調試非常困難：沒有 JavaScript 錯誤，只是視覺上什麼都沒發生

#### 技術詳解：Canvas 繪製三步驟

ScoreFlow 使用 HTML5 Canvas 渲染。每個工具的完整繪製流程需要三個步驟：

1. **準備路徑 (Path Definition)**
   ```javascript
   ctx.beginPath()
   ctx.moveTo(x1, y1)
   ctx.lineTo(x2, y2)          // 或 ctx.rect(), ctx.ellipse(), 等
   ```

2. **應用樣式 (Style Setup)**
   ```javascript
   ctx.strokeStyle = color
   ctx.lineWidth = thickness
   ctx.setLineDash(pattern)    // if dashed
   ```

3. **執行繪製 (Execute Rendering)** ← **這步被遺漏了！**
   ```javascript
   ctx.stroke()                // 必須有，否則路徑不會顯示
   // 或 ctx.fill() for filled shapes
   ```

Shapes 工具缺少第 3 步，導致路徑被定義但從不被渲染到螢幕上。

#### 修復方案
為每個工具添加 `ctx.stroke()`：

```javascript
// Slur
if (path.type === 'slur' && path.points.length >= 2) {
    ...
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.quadraticCurveTo(cx, cy, x2, y2)
    ctx.stroke()  // ← 添加
}

// Brackets
} else if ((path.type === 'bracket-left' || path.type === 'bracket-right') && ...) {
    ...
    ctx.beginPath()
    ctx.moveTo(x1 + px, y1 + py)
    ctx.lineTo(...)
    ctx.stroke()  // ← 添加
}

// 類似為所有其他工具添加...
```

---

## 🎯 為什麼這麼嚴重？

### 1. **用戶信任破裂**
- 工具在 UI 中可見，但完全無法使用
- 用戶會以為是自己操作錯誤
- 第一印象毀掉了

### 2. **隱蔽性強，難以調試**
- 沒有 JavaScript 錯誤或警告
- 沒有控制台訊息
- 只是... 什麼都沒發生
- 開發者可能花數小時才找到根本原因

### 3. **影響範圍廣**
- 涉及 8 個工具（近 1/3 的 Shapes 功能）
- 從 UI 到 Canvas 的完整堆棧失效
- 多個代碼層的同時失效（constants + renderer）

### 4. **架構層級的問題**
- 不只是實現 bug，而是設計缺陷
- TOOLSET 定義不同步表示架構未經深思熟慮

---

## 📋 修復清單

| 問題 | 位置 | 修復方式 | 提交 |
|------|------|--------|------|
| TOOLSET 不同步 | src/constants.js | 創建 Shapes TOOLSET | 484c80f |
| Rect/Circle 無繪製 | AnnotationRenderer.js:309-318 | 添加 ctx.stroke() | 64c4b0c |
| Slur 無繪製 | AnnotationRenderer.js:263 | 添加 ctx.stroke() | 4ca5828 |
| Brackets 無繪製 | AnnotationRenderer.js:307 | 添加 ctx.stroke() | 4ca5828 |
| Curly braces 無繪製 | AnnotationRenderer.js:280 | 添加 ctx.stroke() | 4ca5828 |
| Line 無 draw 配置 | src/constants.js | 添加 draw 配置 | 4ca5828 |

---

## 🛠️ 設計改進建議

### 1. **統一工具定義系統**
```
建議改為單一來源：
- ❌ 現狀：constants.js + toolset-inspector.html 重複
- ✅ 改進：只在 src/constants.js 定義，toolset-inspector.html 從中讀取
```

### 2. **Canvas 繪製模板檢查清單**
創建標準化的繪製流程檢查清單，防止遺漏 `ctx.stroke()`：

```
[ ] Path Definition (beginPath + shape commands)
[ ] Style Setup (strokeStyle, lineWidth, etc.)
[ ] Rendering Execution (ctx.stroke() or ctx.fill())
[ ] Path Reset (globalAlpha, lineWidth)
```

### 3. **自動化測試**
```javascript
// 添加單元測試驗證每個工具都能被繪製
test('rect-shape renders to canvas', () => {
    const renderer = new AnnotationRenderer(mockApp)
    const stamp = { type: 'rect-shape', points: [{x:0.1, y:0.1}, {x:0.5, y:0.5}] }
    
    // 應該不拋出錯誤，且能看到視覺輸出
    renderer.drawPathOnCanvas(ctx, canvas, stamp)
    expect(ctx.stroke).toHaveBeenCalled()  // ← 強制檢查
})
```

### 4. **代碼檢查 (Code Review) 強化**
特別審查涉及 Canvas 操作的代碼：
- ✓ 檢查 `ctx.beginPath()` 必配 `ctx.stroke()`
- ✓ 檢查 lineWidth 和 strokeStyle 是否被設置
- ✓ 檢查是否有視覺輸出測試

### 5. **開發文檔**
在 `CLAUDE.md` / `GEMINI.md` 中添加 Canvas 繪製流程文檔

---

## 📝 Canvas 繪製規範

所有 Shapes 工具必須遵循此模式：

```javascript
// 通用模板
if (path.type === 'my-shape' && path.points.length >= 2) {
    // 1. Setup
    const p1 = path.points[0]
    const p2 = path.points[path.points.length - 1]
    const x1 = p1.x * canvas.width
    const y1 = p1.y * canvas.height
    const x2 = p2.x * canvas.width
    const y2 = p2.y * canvas.height
    
    // 2. Path Definition
    ctx.beginPath()
    // ... shape-specific drawing commands ...
    
    // 3. CRITICAL: Render!
    ctx.stroke()
    
    // 4. Cleanup (if needed)
    ctx.globalAlpha = oldAlpha
}
```

---

## ✅ 驗證清單

在下一次發布前，確保：

- [ ] 所有 Shapes 工具在 UI 中可見
- [ ] 所有 Shapes 工具能在 PDF 上繪製（視覺測試）
- [ ] 不存在兩套工具定義系統
- [ ] 每個 Canvas 操作都有對應的 render 調用
- [ ] 在 iPad 和 desktop 上都測試過
- [ ] 沒有 JavaScript 控制台錯誤

---

## 📖 相關文件

- **constants.js** - 工具定義的單一來源
- **AnnotationRenderer.js** - Canvas 繪製邏輯
- **InteractionManager.js** - 用戶交互和事件處理
- **EditSubBarManager.js** - UI toolbar 管理

---

## 總結

| 方面 | 狀態 |
|------|------|
| **Shapes 工具功能** | ✅ 已修復 |
| **TOOLSET 結構** | ✅ 已修復 |
| **Canvas 繪製** | ✅ 已修復 |
| **架構改進** | 🔄 待規劃 |
| **自動化測試** | 🔄 建議實施 |
| **開發文檔** | 🔄 建議補充 |

**關鍵教訓**：看似簡單的工具實現背後涉及多層系統的協作。缺少任何一環（TOOLSET 定義、UI 加載、Canvas 繪製），整個功能都會崩潰。未來應建立更嚴格的集成測試和開發規範。

---

*文檔生成日期: 2026-04-06*  
*相關提交: 484c80f, 64c4b0c, 4ca5828*
