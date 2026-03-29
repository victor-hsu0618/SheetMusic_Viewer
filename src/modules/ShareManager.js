export class ShareManager {
    constructor(app) {
        this.app = app;
    }

    async sharePDF() {
        if (!this.app.viewerManager.pdf) {
            this.app.showMessage('請先開啟一份樂譜。', 'info');
            return;
        }
        if (!this.app.supabaseManager?.client) {
            this.app.showMessage('需要登入才能分享。', 'info');
            return;
        }

        const btn = document.getElementById('btn-gist-share');
        if (btn) btn.disabled = true;

        try {
            // 1. Generate annotated PDF blob (reuses existing export logic)
            this.app.showMessage('正在生成分享 PDF...', 'system');
            const blob = await this.app.pdfExportManager.exportFlattenedPDF({ returnBlob: true });
            if (!blob) return; // cancelled or failed (error already shown)

            // 2. Upload to Supabase Storage 'shared-pdfs' bucket
            this.app.showMessage('正在上傳...', 'system');
            const title = this.app.scoreDetailManager?.currentInfo?.name || 'Score';
            // Supabase Storage keys must be ASCII-safe: strip non-ASCII, collapse separators
            const safeTitle = title
                .replace(/[^\x20-\x7E]/g, '')   // remove non-ASCII (CJK, etc.)
                .replace(/[^a-zA-Z0-9\-_. ]/g, '_') // replace special chars
                .replace(/\s+/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '')
                .slice(0, 40) || 'Score';
            const shareId = crypto.randomUUID?.() || `${Date.now()}`;
            const filename = `${safeTitle}_${shareId.slice(0, 8)}.pdf`;

            const url = await this.app.supabaseManager.uploadSharedPdf(blob, filename);
            if (!url) {
                this.app.showMessage('上傳失敗，請確認 Supabase shared-pdfs bucket 已建立且設為 public。', 'error');
                return;
            }

            // 3. Copy URL to clipboard
            let copied = false;
            try { await navigator.clipboard.writeText(url); copied = true; } catch {}

            // 4. Show result dialog
            const dialogPromise = this.app.showDialog({
                title: copied ? '分享連結已複製！' : '分享連結已建立',
                message: '收件人直接點開連結即可在瀏覽器查看含標記的樂譜，無需安裝任何 App 或 PDF。',
                icon: '✅',
                type: 'alert',
            });
            const urlField = document.createElement('input');
            urlField.type = 'text';
            urlField.value = url;
            urlField.readOnly = true;
            urlField.style.cssText = 'width:100%;margin-top:12px;font-family:monospace;font-size:11px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-main);cursor:text;';
            urlField.addEventListener('focus', () => urlField.select());
            urlField.addEventListener('click', () => urlField.select());
            this.app.dialogMessage?.appendChild(urlField);
            setTimeout(() => { urlField.focus(); urlField.select(); }, 50);
            await dialogPromise;

        } catch (e) {
            this.app.showMessage('分享失敗：' + (e.message || '未知錯誤'), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }
}
