# 遠端除錯控制台 (Console Forwarding) 說明文件

ScoreFlow 內建了遠端除錯系統，可以將遠端設備（如 iPad 或其他電腦）的瀏覽器 Console 日誌轉發到您 Mac 上的中央除錯伺服器。

## 運作原理
本應用在 [src/main.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/main.js) 的最前端注入了一段腳本。該腳本會覆蓋標準的 `console.log`、`console.error`、`console.warn` 和 `console.info` 方法，每當產生日誌時，都會向指定的 Host 和 Port 發送一個 POST 請求。

### 注入的程式碼片段
您可以在 [src/main.js](file:///Users/victor_hsu/MyProgram/SheetMusic_Viewer/src/main.js) 頂部找到以下代碼：

```javascript
/* eslint-disable */
if (process.env.NODE_ENV === 'development') {
    (function() {
        const HOST = '192.168.0.200'; // 您的 Mac 本機 IP
        const PORT = '3001';
        const log = (type, args) => {
            fetch(`http://${HOST}:${PORT}`, {
                method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, msg: Array.from(args) })
            }).catch(() => {});
        };
        ['log', 'error', 'warn', 'info'].forEach(t => {
            const o = console[t];
            console[t] = (...a) => { log(t, a); o.apply(console, a); };
        });
        window.onerror = (m, u, l, c, e) => log('WINDOW_ERROR', { m, u, l, c, stack: e?.stack });
    })();
}
```

## 設定步驟

### 1. 確認您的 Mac IP
確保程式碼中的 `HOST` 變數與您 Mac 的區域網路 IP 地址一致。您可以從 **系統設定 > 網路 > Wi-Fi > 詳細資訊** 中找到。

### 2. 在 Mac 上執行除錯伺服器 (Debug Server)
您可以使用我們預先設定好的系統別名 (Alias) 來快速啟動伺服器，或者手動執行腳本。

#### 使用別名啟動 (推薦)
在您的終端機中輸入：
```bash
debug-on
```
這會執行位於 `/Users/victor_hsu/.gemini/antigravity/scratch/debug_server.js` 的除錯伺服器。

#### 手動啟動
如果您需要手動建立或更換 Port，可以使用以下指令：
```bash
node /Users/victor_hsu/.gemini/antigravity/scratch/debug_server.js
```
(伺服器預設監聽在 `3001` 端口)


### 4. 日誌存放位置 (Log Location)

除了在終端機 (Terminal) 即時顯示之外，除錯伺服器也會將所有收到的轉發內容同步寫入到檔案中：

- **檔案名稱**：`ipad_logs.txt`
- **存放路徑**：該檔案會產生在**您執行 `debug-on` 指令時所在的目錄**下。
    - 如果您在專案根目錄執行，路徑即為：`./ipad_logs.txt`
- **內容格式**：包含時間戳記、日誌類型（LOG/ERROR/WARN）以及具體的訊息內容。

### 5. 如何關閉 (Stop/Disable)

#### 停止 Mac 上的除錯伺服器
在執行 `debug-on` 的終端機視窗中，按下：
**`Ctrl + C`**
這會終止 Node.js 程序並釋放 `3001` 端口。

#### 停用應用程式的紀錄轉發
如果您不想再發送 log 到 Mac，可以：
1. **註釋掉代碼**：在 `src/main.js` 中將該段 `if (process.env.NODE_ENV === 'development') { ... }` 區塊註釋掉。
2. **自動停用**：當您進行 `npm run build` 建立生產版本時，這段代碼會被自動移除（因為 `NODE_ENV` 不再是 `development`），因此不會影響一般使用者或正式環境。

## 疑難排解
- **網路隔離**：確保 Mac 和遠端設備連動在同一個 Wi-Fi 網路下。
- **防火牆阻擋**：確保 Mac 的防火牆沒有擋掉 Port `3001` 的連入請求。
- **環境檢查**：此功能僅在 `process.env.NODE_ENV === 'development'` 時生效。在生產版本（Production Build）中會自動停用。

> [!TIP]
> 此系統對於診斷 iPad 專屬問題（例如觸控手勢或 Apple Pencil 行為）非常有用，因為這類設備通常較難直接開啟網頁檢查器。
