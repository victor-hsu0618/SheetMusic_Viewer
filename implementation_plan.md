# 修復馬克筆與螢光筆的透明度表現

使用者反映「馬克筆感覺沒有透明度」。經查程式碼，發現兩個主要原因：
1. **渲染器邏輯錯誤**：`AnnotationRenderer.js` 中存在重複呼叫 `ctx.stroke()` 的 Bug，導致路徑被繪製兩次，透明度疊加後變得過於飽和。
2. **工具實作差異**：
   - `highlighter` (螢光筆) 雖然有 `99` (約 60%) 的透明度後綴，但受雙重繪製影響顯得不夠透明。
   - `marker-pen` (馬克筆) 目前完全沒有定義透明度，為 100% 不透明。

## 預計修改內容

### 1. [AnnotationRenderer.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/annotation/AnnotationRenderer.js)

#### [MODIFY] 修復雙重繪製 Bug
- 將第 418 行的 `ctx.stroke()` 移入第 406 行的 `if (path === this.app._lastGraceObject)` 區塊內。
- 這樣只有在需要繪製「Grace Ring (選中提示圈)」時才會執行該額外的繪製動作，避免主體路徑被重複繪製。

#### [MODIFY] 為馬克筆 (`marker-pen`) 增加透明度
- 在繪製 `marker-pen` 時，為顏色加上 `BF` (約 75% 不透明度) 的後綴，使其視覺上更符合真實馬克筆的疊印質感。

#### [MODIFY] 最佳化螢光筆 (`highlighter`) 透明度
- 考慮到雙重繪製修復後，原本的 `99` (60%) 可能會顯得較淡，保持現狀並觀察效果。

## 原本的設計狀態 VS 預計修改後的設計狀態

| 項目 | 原本狀態 | 修改後狀態 |
| :--- | :--- | :--- |
| **繪製次數** | 主體路徑被繪製 2 次 (邏輯冗餘) | 主體路徑僅繪製 1 次 |
| **馬克筆 (Marker)** | 100% 實心顏色 | 約 75% 透明度 (`#RRGGBBBF`) |
| **螢光筆 (Highlighter)** | 約 84% 疊加透明度 (受 Bug 影響) | 淨 60% 透明度 + Multiply 混合模式 |

## 驗證計畫

### 自動測試
- 執行 `npm run test:e2e` 確保渲染器沒有崩潰。

### 手動驗證
1. 使用「馬克筆」在一張深色圖片或音符上塗抹，應能看到底下的內容。
2. 使用「螢光筆」塗抹，透明感應明顯增強，且 `multiply` 效果應更加清晰（與底部文字融合）。
3. 切換選中狀態，確認 `Grace Ring` 依然正確顯示。
