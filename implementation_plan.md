# ScoreFlow 綜合修復與優化實作計畫 (Integrated Fixes)

根據 `rule.md` 規定，此計畫存檔於專案根目錄。

## 目前狀態 (Current State)
1.  **標註項同步**: 修復計畫已準備。
2.  **尺寸問題 (NEW)**: 畫筆與螢光筆共用同一套 `PEN_SIZES` 級距。
    - 對於 **R.Pen, G.Pen, B.Pen**，目前的 XL (3.0) 比例導致筆畫過粗 (7.5px)，不符合原子筆的使用直覺。

## 預計修改狀態 (Target State)
1.  **級距分離 (Scale Decoupling)**:
    -   **畫筆 (Pens)**: 級距改為 `0.3 / 0.6 / 1.0 / 1.5 / 2.0`。確保 XL 仍維持在細原子筆與粗簽名筆之間的合理範圍。
    -   **螢光筆 (HL)**: 級距獨立為 `0.5 / 1.0 / 1.5 / 2.0 / 2.5`。
2.  **UI 適配**: 選項視窗會根據當前是筆還是螢光筆，動態顯示對應的選單項目。

## 變更對比 (Change Log)

### [Component] [EditSubBarManager.js](file:///Volumes/PNGPRO500G/MyPrograms/ScoreFlowPWA/src/modules/EditSubBarManager.js)
- **原本**: 單一 `PEN_SIZES` 常數。
- **修改**: 增加 `HL_SIZES` 常數，並在 `_toggleToolOptionsPicker` 中偵測 `toolId` 並切換數據源。

---

## 驗證計畫 (Verification)
1. **畫筆測試**: 選取 R.Pen 並切換至 XL，確認筆劃粗度符合「粗原子筆」而非「大筆刷」。
2. **螢光筆測試**: 選取 HL 並切換至 XL，確認其寬度足以覆蓋譜行，但不過於巨大。
