# Repository Guidelines

## 專案結構與模組分工
ScoreFlow 是以 Vite 建置的 Vanilla JavaScript PWA。主要程式碼位於 `src/`，入口為 `src/main.js`，功能邏輯應優先拆分到 `src/modules/` 與 `src/modules/annotation/` 內的 `XxxManager.js`。共用常數與基礎工具放在 `src/constants.js`、`src/db.js`、`src/fingerprint.js`。靜態資源與 PDF.js 檔案在 `public/`，圖示資產在 `assets/`，E2E 與輔助測試腳本在 `tests/`，iOS/Capacitor 相關檔案在 `ios/`，建置輸出為 `dist/`。

## 開發、建置與測試指令
- `npm install`：安裝依賴。
- `npm run dev`：啟動本機開發伺服器。
- `npm run dev -- --host`：開啟區網存取，供 iPad 或其他裝置測試。
- `npm run build`：輸出生產版本到 `dist/`。
- `npm run preview -- --host`：預覽正式建置結果。
- `npm run test:e2e`：執行 `tests/automation-check.js` 的 Playwright E2E 測試。
- `npx playwright install chromium`：首次安裝 Playwright 瀏覽器。

## 程式碼風格與命名慣例
所有溝通、文件與新增註解以繁體中文為主。遵循既有風格：ES Modules、以現有檔案為準的縮排與格式、類別採 `PascalCase`，方法與變數採 `camelCase`，CSS 檔名採 kebab-case，例如 `src/styles/view-panel.css`。新功能不得把大型邏輯直接堆回 `src/main.js`，應優先擴充既有 Manager 或抽成可重用模組。禁止用 `// 其餘不變` 這類佔位寫法，提交內容必須是可直接執行的完整程式碼。

## 效能與實作準則
高頻事件特別是 scroll、drag、resize 路徑，避免直接使用 `getBoundingClientRect()`、重複 `querySelector()` 或其他會造成 layout thrashing 的操作；優先重用快取資料，例如 `ViewerManager` 內的 metrics/state。涉及座標、翻頁、次數遞增的功能必須加入邊界保護與 clamp。若原生 CSS 動畫無法精準控制節奏，優先採用可維護的 `requestAnimationFrame` 實作。

## 測試與驗證
功能修改後至少執行受影響範圍的驗證。自動化流程為先啟動 `npm run dev`，再執行 `npm run test:e2e`。UI 或互動調整需參照 `tests/README.md` 進行手動測試，特別確認 sidebar、annotation、jump、iPad 觸控與 LAN 使用情境。若改動可能帶來副作用，需在說明中明確指出測試重點。

## Commit、PR 與工作流
Commit 延續現有歷史風格，例如 `fix(drag): ...`、`feat(theme): ...`、`Docs: ...`、`Perf: ...`。所有開發作業以 `main` branch 為準；只有在明確收到 `engage` 後才開始實作，收到 `commit` 後才建立 commit，收到 `deploy` 後才進行建置或部署。重大設計或架構調整必須同步更新 `PRD.MD`、`GEMINI.md`，必要時也更新根目錄的 `implementation_plan.md`。PR 應附上變更摘要、影響範圍、測試方式，以及 UI 變更的截圖或錄影。
