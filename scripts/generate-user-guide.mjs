/**
 * Generates public/assets/ScoreFlow_UserGuide.pdf from inline HTML.
 * Run: node scripts/generate-user-guide.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '../public/assets/ScoreFlow_UserGuide.pdf');

const HTML = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif;
    font-size: 13px;
    color: #1a1a2e;
    background: #fff;
    padding: 0;
  }

  /* ── Cover ── */
  .cover {
    width: 100%;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
    color: #fff;
    page-break-after: always;
    text-align: center;
    gap: 16px;
  }
  .cover-logo {
    width: 72px; height: 72px;
    background: #6366f1;
    border-radius: 20px;
    display: flex; align-items: center; justify-content: center;
    font-size: 36px;
    margin-bottom: 8px;
  }
  .cover h1 { font-size: 40px; font-weight: 800; letter-spacing: -1px; }
  .cover h2 { font-size: 18px; font-weight: 400; opacity: 0.7; margin-top: 4px; }
  .cover .version {
    margin-top: 32px;
    font-size: 12px;
    opacity: 0.45;
    letter-spacing: 2px;
    text-transform: uppercase;
  }

  /* ── Pages ── */
  .page {
    padding: 52px 60px;
    min-height: 100vh;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }

  /* ── Section Header ── */
  .section-num {
    font-size: 11px;
    font-weight: 700;
    color: #6366f1;
    letter-spacing: 3px;
    text-transform: uppercase;
    margin-bottom: 8px;
  }
  h2.section-title {
    font-size: 28px;
    font-weight: 800;
    color: #1a1a2e;
    margin-bottom: 6px;
    letter-spacing: -0.5px;
  }
  .section-subtitle {
    font-size: 14px;
    color: #64748b;
    margin-bottom: 32px;
    line-height: 1.6;
  }
  .divider {
    height: 3px;
    background: linear-gradient(90deg, #6366f1, transparent);
    border-radius: 2px;
    margin-bottom: 32px;
    width: 60px;
  }

  /* ── Feature cards ── */
  .feature-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }
  .card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 18px 20px;
  }
  .card-icon { font-size: 24px; margin-bottom: 8px; }
  .card h3 { font-size: 14px; font-weight: 700; margin-bottom: 4px; color: #1e293b; }
  .card p  { font-size: 12px; color: #64748b; line-height: 1.6; }

  /* ── Shortcut table ── */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    margin-bottom: 24px;
  }
  thead tr { background: #6366f1; color: #fff; }
  thead th { padding: 9px 14px; text-align: left; font-weight: 600; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody td { padding: 8px 14px; border-bottom: 1px solid #e2e8f0; color: #334155; }
  tbody td:first-child { font-weight: 600; font-family: monospace; background: #f1f5f9; }

  /* ── Steps ── */
  .step-list { list-style: none; }
  .step-list li {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    margin-bottom: 20px;
  }
  .step-num {
    width: 28px; height: 28px; flex-shrink: 0;
    background: #6366f1;
    color: #fff;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; font-weight: 700;
  }
  .step-content h4 { font-size: 13px; font-weight: 700; margin-bottom: 3px; }
  .step-content p  { font-size: 12px; color: #64748b; line-height: 1.6; }

  /* ── Tips ── */
  .tip {
    background: #eef2ff;
    border-left: 3px solid #6366f1;
    border-radius: 0 8px 8px 0;
    padding: 12px 16px;
    margin-bottom: 14px;
  }
  .tip strong { color: #4338ca; font-size: 12px; }
  .tip p { font-size: 12px; color: #3730a3; margin-top: 2px; line-height: 1.5; }

  /* ── Settings table ── */
  .settings-table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  .settings-table th {
    background: #1e293b; color: #fff;
    padding: 8px 12px; text-align: left; font-weight: 600;
  }
  .settings-table td { padding: 8px 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .settings-table td:first-child { font-weight: 600; white-space: nowrap; color: #1e293b; }
  .settings-table td:nth-child(2) { color: #94a3b8; font-size: 11px; }
  .settings-table td:last-child { color: #475569; line-height: 1.5; }
  .settings-table tr:nth-child(even) td { background: #f8fafc; }

  /* ── Footer ── */
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    font-size: 11px;
    color: #94a3b8;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

<!-- ═══════════════════════════════════════════
     COVER
════════════════════════════════════════════ -->
<div class="cover">
  <div class="cover-logo">🎵</div>
  <h1>ScoreFlow</h1>
  <h2>Elite Sheet Music Viewer</h2>
  <p style="opacity:0.55; font-size:14px; margin-top:8px;">專業樂手的數位樂譜工作站</p>
  <div class="version">User Guide · v2.3</div>
</div>

<!-- ═══════════════════════════════════════════
     PAGE 1 — 快速入門
════════════════════════════════════════════ -->
<div class="page">
  <div class="section-num">Section 01</div>
  <h2 class="section-title">快速入門</h2>
  <p class="section-subtitle">三步驟讓你立刻開始使用 ScoreFlow。</p>
  <div class="divider"></div>

  <ul class="step-list">
    <li>
      <div class="step-num">1</div>
      <div class="step-content">
        <h4>匯入樂譜 PDF</h4>
        <p>點擊畫面中央的「+ Score」按鈕，或直接將 PDF 檔案拖曳至視窗，即可匯入。系統會自動計算樂譜的 SHA-256 指紋，確保標記與正確版本綁定。</p>
      </div>
    </li>
    <li>
      <div class="step-num">2</div>
      <div class="step-content">
        <h4>選擇標記工具</h4>
        <p>點擊畫面底部的 Doc Bar，展開工具列。選擇 Stamp Palette（T 鍵）即可開啟完整的音樂標記工具箱，包含弓法、指法、表情、速度等類別。</p>
      </div>
    </li>
    <li>
      <div class="step-num">3</div>
      <div class="step-content">
        <h4>設定翻頁跳點（Anchor）</h4>
        <p>按下 <strong>A</strong> 鍵切換至 Anchor 模式，在需要換頁的位置點擊放置跳點。之後按下 <strong>Space</strong> 或右鍵頭即可精準跳至下一個 Anchor。</p>
      </div>
    </li>
    <li>
      <div class="step-num">4</div>
      <div class="step-content">
        <h4>演奏模式</h4>
        <p>按下 <strong>V</strong> 鍵進入 View 模式（手形游標），此時所有工具關閉，只保留翻頁導航，防止演奏時誤觸標記。</p>
      </div>
    </li>
  </ul>

  <div class="tip">
    <strong>💡 提示</strong>
    <p>ScoreFlow 為 PWA 應用，支援完全離線使用。安裝到 iPad 主畫面後，即使在沒有 WiFi 的音樂廳也能正常運作。</p>
  </div>

  <div class="footer">
    <span>ScoreFlow User Guide</span>
    <span>第 1 頁</span>
  </div>
</div>

<!-- ═══════════════════════════════════════════
     PAGE 2 — Doc Bar 工具列
════════════════════════════════════════════ -->
<div class="page">
  <div class="section-num">Section 02</div>
  <h2 class="section-title">Doc Bar 工具列</h2>
  <p class="section-subtitle">Doc Bar 是懸浮在畫面底部的核心控制中心，包含所有常用操作。</p>
  <div class="divider"></div>

  <div class="feature-grid">
    <div class="card">
      <div class="card-icon">📚</div>
      <h3>Score Library</h3>
      <p>管理所有匯入的樂譜。支援搜尋、排序（最近/標題/作曲家）、批次操作，以及 Setlist 演出清單管理。</p>
    </div>
    <div class="card">
      <div class="card-icon">📄</div>
      <h3>Score Info</h3>
      <p>查看當前樂譜的詳細資訊：曲名、作曲家、樂手身分、雲端同步狀態、標記統計，以及媒體連結。</p>
    </div>
    <div class="card">
      <div class="card-icon">⚙️</div>
      <h3>Global Settings</h3>
      <p>調整系統全域設定：Anchor Offset、Jump Speed、Stamp Size、Idle Lock、翻譜器模式等。</p>
    </div>
    <div class="card">
      <div class="card-icon">🎯</div>
      <h3>Go To (Jump Panel)</h3>
      <p>直接跳至指定頁碼。鍵盤輸入頁號後按 GO 或 Enter 即可跳轉；也可管理書籤與小節標記。</p>
    </div>
    <div class="card">
      <div class="card-icon">👁️</div>
      <h3>View Inspector</h3>
      <p>快速切換圖層（Performance / Fingering / Bowing / Personal）的顯示與隱藏，以及縮放控制。</p>
    </div>
    <div class="card">
      <div class="card-icon">✏️</div>
      <h3>Stamp Palette (T)</h3>
      <p>完整的音樂標記工具箱。包含 8 大類別的符號，支援顏色調整、尺寸微調。</p>
    </div>
  </div>

  <div class="tip">
    <strong>💡 提示</strong>
    <p>Doc Bar 可以收合（點擊左側 grip）節省空間。收合後只顯示最常用的快速操作。長按 grip 可拖曳改變位置。</p>
  </div>

  <div class="footer">
    <span>ScoreFlow User Guide</span>
    <span>第 2 頁</span>
  </div>
</div>

<!-- ═══════════════════════════════════════════
     PAGE 3 — 鍵盤快捷鍵
════════════════════════════════════════════ -->
<div class="page">
  <div class="section-num">Section 03</div>
  <h2 class="section-title">鍵盤快捷鍵</h2>
  <p class="section-subtitle">熟練快捷鍵，讓演奏時的操作流暢如第二天性。</p>
  <div class="divider"></div>

  <table>
    <thead>
      <tr><th>按鍵</th><th>功能</th><th>說明</th></tr>
    </thead>
    <tbody>
      <tr><td>Space</td><td>Jump Forward</td><td>跳至下一個 Anchor（或自動計算的換頁點）</td></tr>
      <tr><td>← / →</td><td>Jump Prev / Next</td><td>向前 / 向後跳一個 Anchor</td></tr>
      <tr><td>Home / End</td><td>Jump to Head / End</td><td>跳至樂譜第一頁 / 最後一頁</td></tr>
      <tr><td>R</td><td>Toggle Ruler</td><td>顯示 / 隱藏左側 Jump Ruler（顯示 Anchor 位置）</td></tr>
      <tr><td>V</td><td>View Mode</td><td>切換為 Pan 模式（演奏模式）</td></tr>
      <tr><td>E</td><td>Eraser Mode</td><td>切換為橡皮擦，點擊標記即可刪除</td></tr>
      <tr><td>A</td><td>Anchor Mode</td><td>切換為 Anchor 放置模式</td></tr>
      <tr><td>T</td><td>Stamp Palette</td><td>開啟 / 關閉 Stamp 工具箱</td></tr>
      <tr><td>G</td><td>Go To Page</td><td>開啟頁碼輸入面板</td></tr>
      <tr><td>W</td><td>Fit to Width</td><td>縮放至頁面寬度填滿視窗</td></tr>
      <tr><td>F</td><td>Fit to Height</td><td>縮放至頁面高度填滿視窗</td></tr>
      <tr><td>+ / =</td><td>Zoom In</td><td>放大</td></tr>
      <tr><td>−</td><td>Zoom Out</td><td>縮小</td></tr>
      <tr><td>S</td><td>Toggle Sidebar</td><td>開啟 / 關閉側邊欄</td></tr>
      <tr><td>H / ?</td><td>Shortcuts Help</td><td>顯示快捷鍵說明</td></tr>
      <tr><td>Esc</td><td>Close Panels</td><td>關閉所有浮動面板，回到 View 模式</td></tr>
      <tr><td>Delete / ⌫</td><td>Delete Stamp</td><td>刪除已選取的標記符號</td></tr>
    </tbody>
  </table>

  <div class="tip">
    <strong>💡 iPad 手勢</strong>
    <p>點擊頁面<strong>上方 35%</strong>區域：向上翻頁。點擊<strong>左下 40%</strong>：向左翻頁。點擊<strong>右下 60%</strong>：向右翻頁。雙指雙擊任意位置可快速呼叫 Stamp Palette。</p>
  </div>

  <div class="footer">
    <span>ScoreFlow User Guide</span>
    <span>第 3 頁</span>
  </div>
</div>

<!-- ═══════════════════════════════════════════
     PAGE 4 — 標記系統（Annotation System）
════════════════════════════════════════════ -->
<div class="page">
  <div class="section-num">Section 04</div>
  <h2 class="section-title">標記系統</h2>
  <p class="section-subtitle">專為職業樂手設計的分層標記架構，清晰管理不同類型的演奏標記。</p>
  <div class="divider"></div>

  <div class="feature-grid" style="grid-template-columns: 1fr 1fr 1fr 1fr; gap:12px; margin-bottom:24px;">
    <div class="card" style="border-top: 3px solid #6366f1;">
      <div class="card-icon">🎭</div>
      <h3>Performance</h3>
      <p style="font-size:11px;">速度、力度、表情記號等演奏詮釋標記。</p>
    </div>
    <div class="card" style="border-top: 3px solid #10b981;">
      <div class="card-icon">🖐️</div>
      <h3>Fingering</h3>
      <p style="font-size:11px;">指法數字、把位、半把位等指法標記。</p>
    </div>
    <div class="card" style="border-top: 3px solid #f59e0b;">
      <div class="card-icon">🏹</div>
      <h3>Bowing</h3>
      <p style="font-size:11px;">弓法記號、上弓、下弓、連弓標記。</p>
    </div>
    <div class="card" style="border-top: 3px solid #ec4899;">
      <div class="card-icon">📝</div>
      <h3>Personal</h3>
      <p style="font-size:11px;">個人筆記、提醒、自訂文字標記。</p>
    </div>
  </div>

  <ul class="step-list">
    <li>
      <div class="step-num">①</div>
      <div class="step-content">
        <h4>放置標記</h4>
        <p>在 Stamp Palette 選取工具後，點擊樂譜任意位置即可放置。觸控裝置有自動偏移補償，標記會出現在手指上方，不被遮擋。</p>
      </div>
    </li>
    <li>
      <div class="step-num">②</div>
      <div class="step-content">
        <h4>選取與移動</h4>
        <p>按 <strong>V</strong> 進入 Select 模式後，點擊標記可選取，拖曳可移動位置。按 Delete/Backspace 可刪除已選取的標記。</p>
      </div>
    </li>
    <li>
      <div class="step-num">③</div>
      <div class="step-content">
        <h4>圖層管理</h4>
        <p>View Inspector 中可單獨切換各圖層的顯示。例如：排練時只顯示 Performance 圖層；練習指法時開啟 Fingering 圖層。</p>
      </div>
    </li>
    <li>
      <div class="step-num">④</div>
      <div class="step-content">
        <h4>匯出備份</h4>
        <p>Score Info → System 分頁可匯出 <code>.json</code> 標記備份檔，或匯入他人分享的標記。備份包含所有圖層的完整標記數據。</p>
      </div>
    </li>
  </ul>

  <div class="footer">
    <span>ScoreFlow User Guide</span>
    <span>第 4 頁</span>
  </div>
</div>

<!-- ═══════════════════════════════════════════
     PAGE 5 — 系統設定參考
════════════════════════════════════════════ -->
<div class="page">
  <div class="section-num">Section 05</div>
  <h2 class="section-title">系統設定參考</h2>
  <p class="section-subtitle">Global Settings → System Settings 分頁的所有控制項說明。</p>
  <div class="divider"></div>

  <table class="settings-table">
    <thead>
      <tr><th>控制項</th><th>類型 / 範圍</th><th>功能說明</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>Show Measure Numbers</td>
        <td>開關</td>
        <td>在樂譜左側顯示小節編號標記，方便排練時快速定位。</td>
      </tr>
      <tr>
        <td>顯示導航觸發區提示線</td>
        <td>開關</td>
        <td>在畫面上顯示 Jump 目標基準線，方便確認翻頁停靠位置。</td>
      </tr>
      <tr>
        <td>Stamp Size</td>
        <td>滑桿 0.5×–3.0×</td>
        <td>所有標記符號的整體縮放倍率。個別符號可在 Stamp Sizes 分頁微調。</td>
      </tr>
      <tr>
        <td>Anchor Offset</td>
        <td>滑桿 0–800px</td>
        <td>Jump 停靠後，Anchor 距畫面頂端的距離。數值越大，停靠位置越低。</td>
      </tr>
      <tr>
        <td>Jump Speed</td>
        <td>滑桿 50–1000ms</td>
        <td>翻頁捲動動畫時長。演奏時建議 150–300ms；偏好即時跳轉可設為 50ms。</td>
      </tr>
      <tr>
        <td>Idle Lock</td>
        <td>滑桿 1–30s</td>
        <td>滑鼠靜止多久後自動鎖定互動，防止演奏時誤觸標記。觸控裝置不受影響。</td>
      </tr>
      <tr>
        <td>Touch Offset</td>
        <td>滑桿 0–200px</td>
        <td>觸控點擊時標記符號相對手指的垂直偏移量，避免手指遮擋落點。</td>
      </tr>
      <tr>
        <td>Mouse Offset</td>
        <td>滑桿 0–200px</td>
        <td>滑鼠點擊時標記符號相對游標的垂直偏移量。</td>
      </tr>
      <tr>
        <td>Toolbar Grip Position</td>
        <td>Left / Right</td>
        <td>Doc Bar 的拖曳把手位置。慣用右手建議 Left，慣用左手建議 Right。</td>
      </tr>
      <tr>
        <td>Page Turner Mode</td>
        <td>下拉選單</td>
        <td>外接踏板或翻譜器對應模式：Default（Space/方向鍵）、PageUp/Down、Arrow Keys。</td>
      </tr>
    </tbody>
  </table>

  <div class="tip" style="margin-top:20px;">
    <strong>💡 雲端同步</strong>
    <p>Settings → Cloud &amp; Account 可連結 Google Drive，自動同步所有樂譜的 PDF 與標記。即使換了設備，所有標記都能從雲端恢復。</p>
  </div>

  <div class="footer">
    <span>ScoreFlow User Guide</span>
    <span>第 5 頁</span>
  </div>
</div>

</body>
</html>`;

async function main() {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.setContent(HTML, { waitUntil: 'networkidle' });
    await page.pdf({
        path: OUT,
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
    });
    await browser.close();
    console.log(`✅  User Guide generated → ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
