# 設計文件：Gist 分享功能
**狀態：** 已實作 v1.0
**日期：** 2026-03-15（更新：2026-03-15）
**作者：** Victor / Claude

---

## 1. 背景與動機

### 現有問題

ScoreFlow 是單機 PWA，標記資料存在本機 IndexedDB，無法直接與他人共享。目前唯一的分享方式是匯出扁平化 PDF，對方只能「看」，無法在自己的裝置上繼續標記。

### 目標

產生一個 URL，傳給朋友後直接打開就能看到完整標記，且對方可以在自己的 ScoreFlow 繼續編輯。

### 為何選擇 GitHub Gist

| 方案 | 優點 | 缺點 |
|---|---|---|
| GitHub Gist | 免費、無後端、API 成熟、匿名讀取 | 分享方需 GitHub 帳號 |
| 自建後端 | 最完整體驗 | 需要開發與維護伺服器 |
| URL Base64 | 零依賴 | URL 過長（PDF 塞不進去） |
| Google Drive | 已有整合 | 需要雙方都有 Google 帳號 |

Gist 方案平衡了實作成本與使用者體驗，分享方一次授權後全自動，**接收方完全不需要任何帳號**。

---

## 2. 核心設計決策

### 只傳標記，不傳 PDF

PDF 檔案通常數 MB，無法寫進 Gist 也不應該。分享內容只包含：
- `pdfFingerprint` — 對應哪份 PDF
- `metadata` — 樂譜名稱、作曲家等（供接收方辨識）
- `layers` + `stamps` — 所有標記資料

接收方自己有同份 PDF 時，用 fingerprint 自動配對；沒有時提示上傳一次，之後存入本機 IndexedDB。

### fingerprint 自動配對

ScoreFlow 已對每份 PDF 計算 SHA-256 fingerprint，存於 `score_registry`。接收方開啟分享連結時：

```
下載 Gist → 取得 pdfFingerprint
     ↓
查本機 score_registry，有此 fingerprint？
     ↓ 有                    ↓ 沒有
直接載入                提示上傳 PDF
                        上傳後存入 IndexedDB
                        下次自動配對
```

---

## 3. 使用者流程

### 3.1 分享方

```
點擊 Doc Bar 分享按鈕
     ↓
未授權 GitHub？
     ↓ 是                                  ↓ 否
顯示輸入框，要求貼上 GitHub PAT          直接進入
（github.com/settings/tokens/new，
 勾選 gist scope）
驗證 token 有效（api.github.com/user）
（一次性，token 存 localStorage）
     ↓
有斗篷標記？
     ↓ 是                        ↓ 否
顯示 cloak-export 對話框        略過
（選擇要包含哪些斗篷群組）
（預設全勾選）
     ↓
上傳 annotations JSON 到 private Gist
（排除 system / settings 內部戳記）
（僅包含選擇的斗篷群組標記）
     ↓
產生分享連結，自動複製到剪貼簿
顯示成功對話框，含可複製的 URL 輸入框
```

### 3.2 接收方（首次，無此 PDF）

```
點開連結
     ↓
ScoreFlow 偵測 ?share=GIST_ID
     ↓
下載 Gist，解析 pdfFingerprint
     ↓
本機無此 PDF → 顯示對話框：
「收到 Victor 的標記
 樂譜：Rachmaninoff Cello Sonata op.19
 請選擇對應的 PDF 檔案」
     ↓
選擇 PDF → 計算 fingerprint → 比對確認
     ↓
載入 PDF + 套上標記
將 PDF 存入本機 IndexedDB（下次免選）
```

### 3.3 接收方（第二次，已有此 PDF）

```
點開連結
     ↓
偵測 ?share=GIST_ID → 下載 Gist
     ↓
本機有此 fingerprint → 顯示對話框：
「收到 Victor 的標記
 樂譜：...  包含 N 個標記
 新增詮釋風格 → 儲存為「樂譜名稱 (Victor)」
 覆蓋目前標記 → 取代所有標記」
     ↓
選擇後套用（merge 或 overwrite）
延遲 300ms 重繪等待 IntersectionObserver 渲染頁面
```

---

## 4. 資料格式

### Gist 檔案名稱

`scoreflow_share.json`

### 內容結構

```json
{
  "version": "1.0",
  "type": "scoreflow_share",
  "author": "Victor Hsu",
  "pdfFingerprint": "a3f8c2d1...",
  "metadata": {
    "name": "Rachmaninoff Cello Sonata op.19",
    "composer": "Rachmaninoff",
    "section": "II. Allegro Scherzando"
  },
  "layers": [ ... ],
  "stamps": [ ... ],
  "createdAt": 1742000000000
}
```

### 分享 URL 格式

```
https://victor.github.io/SheetMusic_Viewer/?share=abc123def456
```

---

## 5. GitHub 授權流程（PAT — Personal Access Token）

> **設計變更記錄：** 原設計為 Device Flow（OAuth），但 GitHub 的 `github.com/login/device/code` 端點不支援瀏覽器 CORS，無法在純前端 PWA 中呼叫。改用 PAT 方案：只需要 `api.github.com`（支援 CORS），且無需後端 redirect。

```
1. 使用者前往：github.com/settings/tokens/new
   → 填寫任意名稱，勾選 gist scope，產生 token

2. ScoreFlow 顯示輸入框，使用者貼上 token

3. 驗證：GET https://api.github.com/user
   → 成功：顯示「已連結帳號：{login}」
   → 失敗：顯示錯誤（HTTP 401）

4. token 存入 localStorage('scoreflow_github_token')
```

**所需 PAT scope：** `gist`（僅建立 / 讀取 Gist，無其他權限）

**Token 儲存：** localStorage，app 重啟後不需重新授權。使用者可在設定中手動登出（清除 token）。Token 過期時（API 回傳 401），自動清除，下次分享時重新要求輸入。

---

## 6. API 呼叫

### 上傳 Gist（分享方）

```
POST https://api.github.com/gists
Authorization: token {access_token}
Content-Type: application/json

{
  "description": "ScoreFlow Share — Rachmaninoff Cello Sonata op.19",
  "public": false,
  "files": {
    "scoreflow_share.json": {
      "content": "{...}"
    }
  }
}
```

回傳 `gist.id` → 組成分享 URL。

### 下載 Gist（接收方，不需授權）

```
GET https://api.github.com/gists/{gist_id}
（無需 Authorization header）
```

Rate limit：未授權 60 req/hr，對一般分享行為綽綽有餘。

---

## 7. UI 設計

### Doc Bar 分享按鈕

- 位置：Doc Bar，縮放群組右側
- 圖示：上傳箭頭 SVG
- 狀態：
  - 正常 → 可點擊
  - 上傳中 → spinner，disabled
  - 無 PDF 載入 → disabled + tooltip「請先開啟樂譜」

### GitHub 授權對話框（PAT 輸入）

```
┌──────────────────────────────────────┐
│ 🔑 連結 GitHub 帳號                   │
│                                      │
│ 需要 GitHub 帳號來儲存分享連結。       │
│                                      │
│ 請前往：                              │
│ github.com/settings/tokens/new       │
│                                      │
│ 名稱任意填，勾選 gist 權限，           │
│ 產生後複製貼入：                       │
│ ┌──────────────────────────────────┐ │
│ │ ghp_xxxxxxxxxxxxxxxxxxxx         │ │
│ └──────────────────────────────────┘ │
│                          [取消]      │
└──────────────────────────────────────┘
```

### 分享成功提示

```
┌──────────────────────────────────────┐
│ ✅ 分享連結已複製！                    │
│                                      │
│ 傳給朋友後，他們點開連結即可看到標記。  │
│ （對方需要自備同份 PDF）               │
│ ┌──────────────────────────────────┐ │
│ │ https://...?share=abc123def456   │ │  ← 可選取複製
│ └──────────────────────────────────┘ │
│                          [關閉]      │
└──────────────────────────────────────┘
```

### 接收方：已有 PDF — 選擇匯入方式

```
┌──────────────────────────────────────┐
│ 📥 收到標記分享                        │
│                                      │
│ 來自：Victor Hsu                      │
│ 樂譜：Rachmaninoff Cello Sonata op.19 │
│ 包含 42 個標記                         │
│                                      │
│ 新增詮釋風格 →                         │
│   儲存為「Rachmaninoff... (Victor)」   │
│ 覆蓋目前標記 →                         │
│   取代此份樂譜的所有標記               │
│                                      │
│ [新增詮釋風格] [覆蓋目前標記] [取消]    │
└──────────────────────────────────────┘
```

### 接收方：尚無 PDF — 提示上傳

```
┌──────────────────────────────────────┐
│ 📥 收到標記分享                        │
│                                      │
│ 來自：Victor Hsu                      │
│ 樂譜：Rachmaninoff Cello Sonata op.19 │
│ 包含 42 個標記                         │
│                                      │
│ 你的裝置尚未有此樂譜，                  │
│ 請選擇對應的 PDF 檔案：                │
│                                      │
│     [選擇 PDF]        [取消]           │
└──────────────────────────────────────┘
```

---

## 8. 模組：GistShareManager.js

```
src/modules/GistShareManager.js
  ├── init()                      啟動時偵測 ?share= URL 參數
  ├── share()                     完整分享流程（授權 → cloak 選擇 → 上傳 → 顯示 URL）
  ├── _receiveShare(gistId)       下載 Gist → 比對 fingerprint → 顯示對話框
  ├── onPdfLoaded(fingerprint)    PDF 載入後套用 pendingShareData（新 PDF 路徑）
  ├── _applyShareData(...)        merge 或 overwrite 套用，延遲重繪
  ├── _ensureAuth()               確保已有 PAT，否則顯示輸入框請使用者貼上
  ├── revokeAuth()                登出（清除 token）
  ├── _uploadGist(data)           POST api.github.com/gists，回傳 gist_id
  └── _downloadGist(gistId)       GET api.github.com/gists/{id}（匿名）
```

---

## 9. 影響範圍

| 檔案 | 變更內容 |
|---|---|
| `src/modules/GistShareManager.js` | 新建 |
| `src/modules/InitializationManager.js` | 啟動時呼叫 `gistShareManager.init()` |
| `src/modules/ScoreManager.js` | 新增 `findByFingerprint(fp)` |
| `src/main.js` | 初始化 GistShareManager |
| `index.html` | Doc Bar 新增分享按鈕 |

---

## 10. 注意事項與限制

| 項目 | 說明 |
|---|---|
| PDF 不含在連結中 | 接收方需自備同份 PDF，第一次需手動選擇 |
| Gist 為 private (unlisted) | 只有知道 ID 的人才能存取，但非加密 |
| 撤銷分享 | 分享方可至 GitHub 手動刪除該 Gist |
| 同份樂譜多次分享 | 每次分享產生新 Gist，舊連結仍有效直到刪除 |
| 離線時 | 上傳與下載均需網路，離線顯示友善錯誤訊息 |
| GitHub API rate limit | 未授權讀取 60 req/hr，不影響正常使用 |

---

## 11. 設計決策記錄

| # | 問題 | 決策 |
|---|---|---|
| 1 | Gist 要 public 還是 private？ | Private（unlisted）— 只有連結才能存取，不公開列出 |
| 2 | Token 存哪裡？ | localStorage — 重啟後免重新授權，使用者可手動登出 |
| 3 | 接收方 fingerprint 不符時怎麼辦？ | 顯示警告「PDF 版本可能不符」但仍允許載入 |
| 4 | 斗篷標籤要不要包含在分享中？ | 有斗篷標記時，分享前顯示 cloak-export dialog（與 JSON Export / PDF Export 相同邏輯），讓使用者選擇哪些群組要包含。預設全勾選。無斗篷標記時略過此步驟。|
| 5 | 分享對象可以編輯還是只能看？ | 接收方匯入後可正常編輯，與自己的標記完全獨立 |
| 6 | 授權方式：Device Flow 或 PAT？ | 改用 PAT — Device Flow 的 `github.com/login/device/code` 不支援 CORS，純前端 PWA 無法呼叫。PAT 只需 `api.github.com`（支援 CORS），且不需後端。 |
| 7 | 第二次接收時要顯示 dialog 嗎？ | 是 — 顯示 merge/overwrite 選擇對話框，避免靜默覆蓋使用者自己的標記 |
| 8 | system / settings 戳記要分享嗎？ | 否 — 這些是自動偵測的系統內部資料，對接收方無意義，且會虛增標記計數（例如誤報 622 個） |
| 9 | Gist JSON 何時清除？ | 不自動清除——Gist 永久存在於分享方的 GitHub 帳號中，分享方可手動前往 github.com/gists 刪除 |
