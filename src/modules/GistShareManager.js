const GIST_FILENAME = 'scoreflow_share.json'
const TOKEN_KEY = 'scoreflow_github_token'

export class GistShareManager {
    constructor(app) {
        this.app = app
        this._token = localStorage.getItem(TOKEN_KEY) || null
    }

    // ── Called on app startup ──────────────────────────────────────────────
    init() {
        const params = new URLSearchParams(location.search)
        const shareId = params.get('share')
        if (shareId) {
            // Remove param from URL without reload
            const clean = location.pathname + location.search.replace(/[?&]share=[^&]*/g, '').replace(/^&/, '?')
            history.replaceState(null, '', clean || location.pathname)
            this._receiveShare(shareId)
        }
    }

    // ── Public: trigger share flow ─────────────────────────────────────────
    async share() {
        console.log('[GistShare] share() called')
        if (!this.app.viewerManager.pdf) {
            this.app.showMessage('請先開啟一份樂譜。', 'info')
            return
        }

        // 1. Cloak export dialog (if any cloaked stamps exist)
        const cloakDefs = [
            { id: 'black', label: '黑色斗篷' },
            { id: 'red',   label: '紅色斗篷' },
            { id: 'blue',  label: '藍色斗篷' },
        ]
        const hasCloaked = this.app.stamps.some(s => s.hiddenGroup)
        let includeCloaks = { black: true, red: true, blue: true }
        if (hasCloaked) {
            const result = await this.app.showDialog({
                title: '分享斗篷標籤',
                message: '選擇要包含在分享中的斗篷標籤：',
                icon: '👻',
                type: 'cloak-export',
                cloakDefs,
                defaultInclude: includeCloaks,
            })
            if (result === 'cancel') return
            if (result && typeof result === 'object') includeCloaks = result
        }

        // 2. Build share payload — exclude auto-generated system stamps and internal settings
        const stamps = this.app.stamps.filter(s =>
            s.type !== 'system' && s.type !== 'settings' &&
            (!s.hiddenGroup || includeCloaks[s.hiddenGroup])
        )
        const shareData = {
            version: '1.0',
            type: 'scoreflow_share',
            author: this.app.profileManager?.data?.userName || 'Guest',
            pdfFingerprint: this.app.pdfFingerprint,
            metadata: this.app.scoreDetailManager?.getExportMetadata?.() || {},
            layers: this.app.layers,
            stamps,
            createdAt: Date.now(),
        }

        // 3. Upload — prefer Google Drive if connected, else fall back to GitHub Gist
        const btn = document.getElementById('btn-gist-share')
        if (btn) btn.disabled = true

        try {
            const drive = this.app.driveSyncManager
            const hasDrive = drive?.isEnabled && drive?.accessToken
            let url

            if (hasDrive) {
                this.app.showMessage('正在上傳到 Google Drive...', 'system')
                const fileId = await this._uploadToDrive(shareData)
                url = `${location.origin}${location.pathname}?share=gdrive_${fileId}`
            } else {
                console.log('[GistShare] ensureAuth — token exists:', !!this._token)
                this.app.showMessage('正在連接 GitHub...', 'system')
                try {
                    await this._ensureAuth()
                } catch (e) {
                    console.error('[GistShare] _ensureAuth failed:', e)
                    if (e.message === 'cancelled') return
                    this.app.showMessage('GitHub 授權失敗：' + e.message, 'error')
                    return
                }
                this.app.showMessage('正在上傳分享連結...', 'system')
                const gistId = await this._uploadGist(shareData)
                url = `${location.origin}${location.pathname}?share=${gistId}`
            }

            // Copy to clipboard
            let copied = false
            try { await navigator.clipboard.writeText(url); copied = true } catch {}

            // showDialog runs synchronously up to its return — dialog is already active
            // when the Promise is returned, so we can inject the URL input immediately after.
            const dialogPromise = this.app.showDialog({
                title: copied ? '分享連結已複製！' : '分享連結已建立',
                message: '傳給朋友後，他們點開連結即可看到你的標記。\n（對方需要自備同份 PDF）',
                icon: '✅',
                type: 'alert',
            })
            // Inject copyable URL field into the dialog message area
            const urlField = document.createElement('input')
            urlField.type = 'text'
            urlField.value = url
            urlField.readOnly = true
            urlField.style.cssText = 'width:100%;margin-top:12px;font-family:monospace;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:var(--bg-secondary);color:var(--text-main);cursor:text;'
            urlField.addEventListener('focus', () => urlField.select())
            urlField.addEventListener('click', () => urlField.select())
            this.app.dialogMessage?.appendChild(urlField)
            setTimeout(() => { urlField.focus(); urlField.select() }, 50)
            await dialogPromise
        } catch (e) {
            this.app.showMessage('上傳失敗：' + (e.message || '未知錯誤'), 'error')
        } finally {
            if (btn) btn.disabled = false
        }
    }

    // ── Receive share link ─────────────────────────────────────────────────
    async _receiveShare(gistId) {
        this.app.showMessage('正在載入分享連結...', 'system')
        let shareData
        try {
            if (gistId.startsWith('gdrive_')) {
                shareData = await this._downloadFromDrive(gistId.slice(7))
            } else {
                shareData = await this._downloadGist(gistId)
            }
        } catch (e) {
            this.app.showMessage('無法取得分享資料：' + (e.message || '連結可能已失效'), 'error')
            return
        }

        if (shareData.type !== 'scoreflow_share') {
            this.app.showMessage('無效的分享格式。', 'error')
            return
        }

        const fp = shareData.pdfFingerprint
        const scoreName = shareData.metadata?.name || '未知樂譜'
        const author = shareData.author || '未知'

        // Wait for score registry to finish loading (it loads async from IndexedDB at startup)
        for (let i = 0; i < 30 && !this.app.scoreManager?.isLoaded; i++) {
            await new Promise(r => setTimeout(r, 100))
        }

        // Check if PDF already in local registry
        const existing = this.app.scoreManager?.findByFingerprint(fp)

        const annotCount = shareData.stamps?.filter(s => s.type !== 'system' && s.type !== 'settings').length ?? 0
        const newSourceName = `${scoreName} (${author})`

        if (existing) {
            // Ask: overwrite or merge as new interpretation?
            const choice = await this.app.showDialog({
                title: '收到標記分享',
                message: `來自：${author}\n樂譜：${scoreName}\n包含 ${annotCount} 個標記\n\n新增詮釋風格 → 儲存為「${newSourceName}」\n覆蓋目前標記 → 取代此份樂譜的所有標記`,
                icon: '📥',
                type: 'actions',
                actions: [
                    { id: 'merge',     label: '新增詮釋風格', class: 'btn-primary' },
                    { id: 'overwrite', label: '覆蓋目前標記', class: 'btn-outline text-danger' },
                    { id: 'cancel',    label: '取消',         class: 'btn-ghost' },
                ],
            })
            if (choice === 'cancel') return
            await this._applyShareData(shareData, fp, existing, choice === 'overwrite')
        } else {
            // Prompt for PDF upload
            const confirmed = await this.app.showDialog({
                title: '收到標記分享',
                message: `來自：${author}\n樂譜：${scoreName}\n包含 ${annotCount} 個標記\n\n你的裝置尚未有此樂譜，請選擇對應的 PDF 檔案。`,
                icon: '📥',
                type: 'actions',
                actions: [
                    { id: 'select', label: '選擇 PDF', class: 'btn-primary' },
                    { id: 'cancel', label: '取消', class: 'btn-ghost' },
                ],
            })
            if (confirmed !== 'select') return

            // Set pending share data — the existing handleUpload listener will call loadPDF
            // which triggers onPdfLoaded → _applyShareData automatically
            this._pendingShareData = shareData
            const input = document.querySelector('.native-file-input[accept="application/pdf"]')
            if (input) {
                // Clear pending share if user dismisses file picker without selecting
                input.addEventListener('change', (e) => {
                    if (!e.target.files?.[0]) this._pendingShareData = null
                }, { once: true })
                input.click()
            }
        }
    }

    // Called by ViewerManager after PDF is fingerprinted & loaded
    onPdfLoaded(fingerprint) {
        if (!this._pendingShareData) return
        const shareData = this._pendingShareData
        this._pendingShareData = null
        if (shareData.pdfFingerprint !== fingerprint) {
            this.app.showMessage('PDF 版本可能不符，仍套用標記。', 'info')
        }
        this._applyShareData(shareData, fingerprint)
    }

    async _applyShareData(shareData, fingerprint, registryEntry = null, overwrite = false) {
        // Load the score only if it isn't already the active PDF
        if (registryEntry) {
            const targetFp = registryEntry.fingerprint ?? registryEntry
            if (this.app.pdfFingerprint !== targetFp) {
                await this.app.scoreManager.loadScore(targetFp)
            }
        }

        // Exclude internal-only stamp types from import
        const stamps = (shareData.stamps || []).filter(s => s.type !== 'system' && s.type !== 'settings')

        if (overwrite) {
            this.app.stamps = stamps
            this.app.layers = shareData.layers || this.app.layers
            this.app.saveToStorage()
            this.app.showMessage(`已覆蓋標記（${stamps.length} 個）`, 'success')
        } else {
            const newSourceId = `share_${Date.now()}`
            const sourceName = `${shareData.metadata?.name || 'Shared'} (${shareData.author || 'Guest'})`
            this.app.sources.push({
                id: newSourceId,
                name: sourceName,
                visible: true,
                opacity: 0.85,
                color: '#06b6d4',
                author: shareData.author,
            })
            const remapped = stamps.map(s => ({ ...s, sourceId: newSourceId }))
            this.app.stamps.push(...remapped)
            this.app.saveToStorage()
            this.app.renderSourceUI?.()
            this.app.showMessage(`已新增 ${shareData.author} 的詮釋風格（${remapped.length} 個標記）`, 'success')
        }

        // Delay redraw to let the IntersectionObserver render page canvases first
        setTimeout(() => { this.app.redrawAllAnnotationLayers?.() }, 300)
    }

    // ── GitHub Auth (PAT) ─────────────────────────────────────────────────
    async _ensureAuth() {
        if (this._token) return

        // Ask user to paste a GitHub Personal Access Token (gist scope)
        // GitHub's Device Flow uses github.com/login/* which blocks CORS in browsers.
        // PAT approach works because only api.github.com is needed (which supports CORS).
        const token = await this.app.showDialog({
            title: '連結 GitHub 帳號',
            message: '需要 GitHub 帳號來儲存分享連結。\n\n請前往：\ngithub.com/settings/tokens/new\n\n名稱任意填，勾選 gist 權限，產生後複製貼入：',
            icon: '🔑',
            type: 'input',
            placeholder: 'ghp_xxxxxxxxxxxxxxxxxxxx',
        })
        if (!token) throw new Error('cancelled')
        const trimmed = token.trim()
        if (!trimmed) throw new Error('cancelled')

        // Verify token is valid by checking authenticated user
        const check = await fetch('https://api.github.com/user', {
            headers: { 'Authorization': `token ${trimmed}`, 'Accept': 'application/vnd.github+json' },
        })
        if (!check.ok) throw new Error(`Token 無效（HTTP ${check.status}）`)

        this._token = trimmed
        localStorage.setItem(TOKEN_KEY, trimmed)
        const { login } = await check.json()
        this.app.showMessage(`已連結 GitHub 帳號：${login}`, 'success')
    }

    revokeAuth() {
        this._token = null
        localStorage.removeItem(TOKEN_KEY)
        this.app.showMessage('已登出 GitHub。', 'info')
    }

    // ── Gist API ───────────────────────────────────────────────────────────
    async _uploadGist(data) {
        const res = await fetch('https://api.github.com/gists', {
            method: 'POST',
            headers: {
                'Authorization': `token ${this._token}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                description: `ScoreFlow Share — ${data.metadata?.name || 'Score'}`,
                public: false,
                files: { [GIST_FILENAME]: { content: JSON.stringify(data) } },
            }),
        })
        if (!res.ok) {
            if (res.status === 401) {
                // Token expired — clear and re-auth next time
                this._token = null
                localStorage.removeItem(TOKEN_KEY)
            }
            throw new Error(`GitHub API ${res.status}`)
        }
        const gist = await res.json()
        return gist.id
    }

    // ── Google Drive Share ─────────────────────────────────────────────────
    async _uploadToDrive(shareData) {
        const drive = this.app.driveSyncManager
        if (!drive.folderId) await drive.file.findOrCreateSyncFolder()

        const metadata = { name: `scoreflow_share_${Date.now()}.json`, parents: [drive.folderId] }
        const form = new FormData()
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
        form.append('file', new Blob([JSON.stringify(shareData)], { type: 'application/json' }))

        const res = await drive.gdriveFetch(
            'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
            { method: 'POST', body: form }
        )
        if (!res.ok) throw new Error(`Drive 上傳失敗 (${res.status})`)
        const { id: fileId } = await res.json()

        // Make publicly readable so any Drive-authenticated user can download it
        const permRes = await drive.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}/permissions`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: 'anyone', role: 'reader' }) }
        )
        if (!permRes.ok) throw new Error(`Drive 權限設定失敗 (${permRes.status})`)
        return fileId
    }

    async _downloadFromDrive(fileId) {
        const drive = this.app.driveSyncManager
        if (!drive?.isEnabled || !drive?.accessToken) {
            throw new Error('此分享連結需要登入 Google Drive 才能接收。請先在設定中開啟 Drive 同步。')
        }
        const res = await drive.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
        )
        if (!res.ok) throw new Error(`Drive 下載失敗 (${res.status})`)
        return await res.json()
    }

    async _downloadGist(gistId) {
        const res = await fetch(`https://api.github.com/gists/${gistId}`, {
            headers: { 'Accept': 'application/vnd.github+json' },
        })
        if (!res.ok) throw new Error(`GitHub API ${res.status}`)
        const gist = await res.json()
        const file = gist.files?.[GIST_FILENAME]
        if (!file) throw new Error('找不到分享檔案')
        const content = file.content || (await (await fetch(file.raw_url)).text())
        return JSON.parse(content)
    }
}
