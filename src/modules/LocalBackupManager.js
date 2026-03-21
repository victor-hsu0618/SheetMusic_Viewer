import JSZip from 'jszip'
import * as db from '../db.js'

/**
 * LocalBackupManager — export / import a full local backup as a ZIP file.
 *
 * ZIP structure:
 *   registry.json              ← full score_registry array
 *   {fp8}_{safeTitle}/
 *     annotations.json         ← stamps array for that score
 *     score.pdf                ← binary PDF buffer (if locally available)
 */
export class LocalBackupManager {
    constructor(app) {
        this.app = app
    }

    // ─── EXPORT ─────────────────────────────────────────────────────────────

    async exportBackup() {
        const registry = this.app.scoreManager?.registry || []
        if (registry.length === 0) {
            this.app.showMessage('沒有任何曲目可備份', 'error')
            return
        }

        this.app.showMessage('正在打包備份...', 'system')

        const zip = new JSZip()

        // 1. registry.json
        zip.file('registry.json', JSON.stringify(registry, null, 2))

        // 2. Per-score folders
        for (const score of registry) {
            const fp = score.fingerprint
            if (!fp) continue

            const safeName = this._safeTitle(score.title || 'Untitled')
            const folder = zip.folder(`${fp.slice(0, 8)}_${safeName}`)

            // annotations.json
            const stamps = (await db.get(`stamps_${fp}`)) || []
            folder.file('annotations.json', JSON.stringify(stamps, null, 2))

            // score.pdf (only if locally buffered)
            const buf = await db.get(`score_buf_${fp}`)
            if (buf) {
                folder.file('score.pdf', buf instanceof Uint8Array ? buf : new Uint8Array(buf))
            }
        }

        // 3. Generate and trigger download
        const blob = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        }, (meta) => {
            if (meta.percent % 20 < 1) {
                this.app.showMessage(`打包中 ${Math.round(meta.percent)}%...`, 'system')
            }
        })

        const date = new Date().toISOString().slice(0, 10)
        this._download(blob, `scoreflow_backup_${date}.zip`)
        this.app.showMessage(`備份完成！共 ${registry.length} 首曲目`, 'success')
    }

    // ─── IMPORT ─────────────────────────────────────────────────────────────

    async importBackup(file) {
        if (!file) return

        this.app.showMessage('正在讀取備份檔...', 'system')

        let zip
        try {
            zip = await JSZip.loadAsync(file)
        } catch (e) {
            this.app.showMessage('無法讀取 ZIP 檔案，請確認格式正確', 'error')
            return
        }

        // 1. registry.json
        const registryFile = zip.file('registry.json')
        if (!registryFile) {
            this.app.showMessage('備份檔缺少 registry.json，無法還原', 'error')
            return
        }

        let importedRegistry
        try {
            importedRegistry = JSON.parse(await registryFile.async('string'))
        } catch (e) {
            this.app.showMessage('registry.json 格式錯誤', 'error')
            return
        }

        const confirmed = await this.app.showDialog({
            title: '匯入本地備份',
            message: `將還原 ${importedRegistry.length} 首曲目的資料。\n現有的同指紋曲目資料將被覆蓋。繼續嗎？`,
            type: 'confirm',
            icon: '📦'
        })
        if (!confirmed) return

        this.app.showMessage('正在還原資料...', 'system')
        let restored = 0, skipped = 0

        // 2. Per-score folders
        for (const score of importedRegistry) {
            const fp = score.fingerprint
            if (!fp) { skipped++; continue }

            const safeName = this._safeTitle(score.title || 'Untitled')
            const prefix = `${fp.slice(0, 8)}_${safeName}/`

            // annotations.json
            const annotFile = zip.file(`${prefix}annotations.json`)
            if (annotFile) {
                try {
                    const stamps = JSON.parse(await annotFile.async('string'))
                    await db.set(`stamps_${fp}`, stamps)
                } catch (e) {
                    console.warn(`[LocalBackup] Failed to restore annotations for ${fp.slice(0,8)}:`, e)
                }
            }

            // score.pdf
            const pdfFile = zip.file(`${prefix}score.pdf`)
            if (pdfFile) {
                try {
                    const buf = await pdfFile.async('arraybuffer')
                    await db.set(`score_buf_${fp}`, buf)
                    score.storageMode = 'cached'
                } catch (e) {
                    console.warn(`[LocalBackup] Failed to restore PDF for ${fp.slice(0,8)}:`, e)
                }
            }

            restored++
        }

        // 3. Merge registry (upsert by fingerprint)
        const current = this.app.scoreManager.registry
        for (const importedScore of importedRegistry) {
            const idx = current.findIndex(s => s.fingerprint === importedScore.fingerprint)
            if (idx === -1) {
                current.push(importedScore)
            } else {
                // Keep whichever was accessed more recently
                if ((importedScore.lastAccessed || 0) > (current[idx].lastAccessed || 0)) {
                    current[idx] = { ...current[idx], ...importedScore }
                }
            }
        }

        await this.app.scoreManager.saveRegistry()
        this.app.scoreManager.render()
        this.app.showMessage(`還原完成！成功 ${restored} 首，跳過 ${skipped} 首`, 'success')
    }

    // ─── HELPERS ────────────────────────────────────────────────────────────

    _safeTitle(title) {
        return title.replace(/[^a-zA-Z0-9\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff_\- ]/g, '').trim().slice(0, 40) || 'Untitled'
    }

    _download(blob, filename) {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(url), 10000)
    }
}
