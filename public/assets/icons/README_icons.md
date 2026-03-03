# 🎼 ScoreFlow 圖示更換與管理指南 (Icon Management Guide)

這份文件說明了如何管理以及全面替換 ScoreFlow 工具列中的圖示。

## 📍 圖示目錄結構
為了方便美工人員整理，所有的圖示檔案都應該存放在 `public/assets/icons/` 目錄下，並依照工具類型進行分類：

```text
public/assets/icons/
├── edit/          # 編輯類型 (例如: Select, Eraser)
├── draw/          # 繪圖類型 (例如: Pen, Highlighter, Line)
├── fingering/     # 指法類型 (例如: 1, 2, 3, Thumb)
├── articulation/  # 奏法類型 (例如: Accent, Staccato, Fermata)
├── performance/   # 表演/力度類型 (例如: f, p, Tempo)
├── layout/        # 排版類型 (例如: System Break, Page Break)
└── anchor/        # 定位類型 (例如: Anchor)
```

## 🛠️ 如何替換圖示
1. **準備 SVG 檔案**：
   - 請使用 **SVG 格式**。
   - 建議畫板大小為 **24x24**。
   - 建議使用 `stroke` (線條) 為主的設計，線寬建議為 `2`。
   - 請移除內嵌的顏色 (或是設為 `currentColor`)，這樣系統才能自動根據主題變換顏色。

2. **檔案命名**：
   - 檔案名稱必須與 `main.js` 中定義的 `id` 一致。
   - 例如：`select.svg`, `pen.svg`, `f1.svg`。

3. **直接取代**：
   - 您只需要將設計好的新檔案直接覆蓋到對應的資料夾中即可。

## ⚙️ 技術說明 (給工程師)
目前系統已經調整為從外部路徑讀取 SVG。當您更新檔案後，瀏覽器重新整理即可看到新的設計生效。

### 圖示路徑範例：
- 選取工具：`assets/icons/edit/select.svg`
- 鋼琴指法 1：`assets/icons/fingering/f1.svg`

---
*註：若要新增全新的工具類別，請於 `main.js` 的 `this.toolsets` 中定義對應的 `iconPath`。*
