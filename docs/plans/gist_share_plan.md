# Gist Share — 樂譜標記分享功能

## 目標

產生一個 URL，傳給朋友後直接打開就能看到完整標記。
利用 GitHub Gist 作為免費無後端的資料傳輸層。

---

## 使用者流程

### 分享方
1. 點擊 Doc Bar 的「分享」按鈕
2. 若未授權 GitHub → 引導 GitHub OAuth 一次性授權
3. App 把 annotations JSON 上傳到 GitHub Gist（private gist，只有連結才能存取）
4. 產生並複製分享連結：`https://xxx.github.io/SheetMusic_Viewer/?share=GIST_ID`

### 接收方
1. 點開連結 → ScoreFlow 自動開啟
2. App 偵測到 `?share=GIST_ID` → 下載 Gist 取得 annotations + `pdfFingerprint`
3. 查詢本地 IndexedDB：
   - **有此 fingerprint** → 直接載入 PDF + 套上標記，零操作
   - **沒有此 fingerprint** → 顯示對話框「請選擇對應的樂譜 PDF」→ 選完後存入 IndexedDB
4. 第二次收到同份樂譜的任何分享連結 → 直接開啟，免選檔

---

## 技術架構

### GitHub OAuth（分享方需要，一次性）

使用 GitHub OAuth Device Flow（不需要後端 redirect）：
1. 呼叫 `https://github.com/login/device/code` 取得 `device_code` + `user_code`
2. 引導使用者到 `https://github.com/login/device` 輸入 `user_code`
3. 輪詢取得 `access_token`，存入 localStorage

所需 GitHub OAuth App scope：`gist`

### Gist 上傳（分享方）

```js
POST https://api.github.com/gists
Authorization: token {access_token}
{
  "description": "ScoreFlow Share - {score_name}",
  "public": false,
  "files": {
    "scoreflow_share.json": {
      "content": JSON.stringify(shareData)
    }
  }
}
// 回傳 gist.id → 組成分享 URL
```

`shareData` 格式：
```json
{
  "version": "1.0",
  "type": "scoreflow_share",
  "author": "userName",
  "pdfFingerprint": "abc123...",
  "metadata": { "name": "...", "composer": "..." },
  "layers": [...],
  "stamps": [...],
  "createdAt": 1234567890
}
```

### Gist 下載（接收方，不需要授權）

```js
GET https://api.github.com/gists/{gist_id}
// public read — 不需要 token
```

### fingerprint 查詢邏輯

```js
// 啟動時偵測 ?share= 參數
const shareId = new URLSearchParams(location.search).get('share')
if (shareId) {
  const data = await fetchGist(shareId)
  const fp = data.pdfFingerprint
  const hasPdf = await db.get(`recent_buf_${data.metadata.name}`)
               || await checkFingerprintInRegistry(fp)
  if (hasPdf) {
    loadScoreByFingerprint(fp)
    importAnnotations(data)
  } else {
    showDialog('請選擇對應的 PDF：' + data.metadata.name)
    // 選完後 loadPDF → 存入 IndexedDB → importAnnotations
  }
}
```

---

## 需要修改的檔案

| 檔案 | 修改內容 |
|---|---|
| `src/modules/GistShareManager.js` | **新增** — 所有 Gist 邏輯（OAuth、上傳、下載） |
| `src/modules/InitializationManager.js` | 啟動時偵測 `?share=` URL 參數 |
| `src/modules/ScoreManager.js` | 新增 `findByFingerprint()` — 查詢 registry |
| `src/main.js` | 初始化 GistShareManager，加入分享按鈕 |
| `index.html` | Doc Bar 加入分享按鈕 |

---

## UI

### Doc Bar 分享按鈕
- 位置：Doc Bar，縮放區右側
- 圖示：上傳箭頭 SVG
- 點擊流程：
  1. 未授權 → 開啟 GitHub Device Flow 對話框
  2. 已授權 → 直接上傳，完成後顯示「已複製連結」

### 接收對話框（第一次無 PDF）
```
┌──────────────────────────────────────┐
│ 📥 收到標記分享                        │
│ 來自：Victor Hsu                      │
│ 樂譜：Rachmaninoff Cello Sonata op.19 │
│                                      │
│ 你的裝置尚未有此 PDF，                  │
│ 請選擇對應的樂譜檔案：                  │
│                                      │
│        [選擇 PDF]    [取消]            │
└──────────────────────────────────────┘
```

---

## 注意事項

- Gist 是 private（unlisted），只有知道 ID 的人才能存取
- 不包含 PDF 本身，分享資料量極小（純 JSON）
- 接收方不需要 GitHub 帳號
- 若分享方想撤銷，可手動到 GitHub 刪除該 Gist
- GitHub API rate limit：未授權 60 req/hr，已授權 5000 req/hr（下載用 unauthenticated 即可）

---

## 驗證

1. 分享方授權 GitHub → 產生連結 → 複製成功
2. 接收方（無 PDF）→ 提示選檔 → 載入後標記正確套上
3. 接收方（有 PDF）→ 直接開啟，無提示
4. 第二次開啟任何來自同份樂譜的分享連結 → 直接載入
5. 無效 Gist ID → 顯示錯誤訊息
6. 網路離線時 → 顯示友善提示
