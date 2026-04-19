# 小節數標記工具 (Measure Numberer) 實作計畫

## 1. 概述 (Overview)
本工具是一個獨立的網頁應用程式（位於 `public/tools/`），旨在讓使用者能快速在 PDF 樂譜上標記小節數，並導出內嵌小節數的新 PDF。設計風格將與 ScoreFlow PWA 保持高度一致。

## 2. 核心功能 (Core Features)
*   **PDF 載入與預覽**：支援拖放與檔案選取，使用 `pdf.js` 渲染。
*   **自動系統偵測 (System Detection)**：引用 `BarlineStaffDetector.js` 自動定位譜表位置。
*   **智慧標記 (Smart Mark)**：
    *   **Smart Snap**：自動吸附至偵測到的 System 左上角。
    *   **Auto-increment**：點擊後數字自動按設定步進值增加。
*   **專業數字鍵盤 (Keypad)**：複刻 ScoreFlow 的 3x4 玻璃質感鍵盤。
*   **PDF 注入與導出**：使用 `pdf-lib` 將文字直接寫入 PDF 原始圖層。

## 3. UI/UX 設計 (UI Design)
*   **色彩與材質**：Midnight Suite (午夜藍), Glassmorphism (毛玻璃), 珍珠白按鈕。
*   **佈局**：
    *   **左側 Sidebar**：控制參數、數字鍵盤、自動遞增設定。
    *   **中央 Canvas**：互動式 PDF 預覽區域。
    *   **頂部導航**：檔案資訊與「導出 PDF」主按鈕。

## 4. 技術實作 (Technical Implementation)

### A. 依賴項 (Dependencies)
*   `pdf.js` (CDN): 用於瀏覽器渲染。
*   `pdf-lib` (CDN): 用於 PDF 修改與導出。
*   `BarlineStaffDetector.js` (Local): 跨工具共用的偵測引擎。
*   `shared-styles.css` (Local): 全域樣式。
*   `theme-manager.js` (Local): 主題控制。

### B. 核心邏輯
1.  **坐標轉換 (Coordinate Mapping)**：
    *   `Screen Pixel` -> `Canvas Pixel` -> `Normalized (0-1)` -> `PDF Points (72 DPI)`。
2.  **偵測整合**：
    *   載入頁面後調用 `BarlineStaffDetector.detectSystems()`。
    *   將偵測到的 `top` 座標作為「智慧吸附」的建議 y 值。
3.  **注入邏輯**：
    *   使用 `pdf-lib` 的 `drawText` 在指定坐標寫入數字。
    *   支援自定義字體大小 (預設 10-12pt) 與顏色 (預設純黑或深藍)。

## 5. 檔案清單 (File Manifest)
*   **新增**: `public/tools/measure-numberer.html` (主程式與所有邏輯)。
*   **修改**: `public/tools/index.html` (在 Developer Hub 增加工具入口卡片)。

## 6. 預期效果對比
| 特性 | 原本設計 (PWA) | 本工具實作 (Measure Numberer) |
| :--- | :--- | :--- |
| **存儲** | IndexedDB (標記數據) | 直接寫入 PDF 文件 |
| **渲染** | Web Canvas Overlay | PDF Native Layer |
| **用途** | 演奏時即時參考 | 預處理、列印用 |
| **偵測** | 僅偵測不干預 | 主動導引吸附位置 |

---
*計畫生成日期: 2026-04-19*  
*實作者: ScoreFlow Gemini CLI*
