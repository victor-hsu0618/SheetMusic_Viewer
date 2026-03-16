/**
 * DriveLogManager — persistent sync history log stored in Google Drive.
 * File: ScoreFlow_Sync/v3/sync_log.json
 *
 * Entries are append-only, deduplicated by id, trimmed to MAX_ENTRIES.
 * Multi-device safe: read-merge-write on every flush.
 */
export class DriveLogManager {
    constructor(sync) {
        this.sync = sync
        this.LOG_NAME = 'sync_log.json'
        this.MAX_ENTRIES = 500
        this._fileId = null
        this._pending = []
        this._flushing = false
    }

    // ── Public API ────────────────────────────────────────────

    /**
     * Buffer a log entry. Flushed to Drive at end of sync cycle.
     * action: 'push' | 'pull' | 'signin' | 'signout' | 'scan' | 'pdf_upload' | 'pdf_download'
     * detail: free-form string or object → stored as-is
     */
    record(action, detail = '') {
        const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`
        this._pending.push({
            id,
            ts:     Date.now(),
            user:   this.sync.app?.profileManager?.data?.userName || 'Guest',
            device: this._deviceLabel(),
            action,
            detail: typeof detail === 'object' ? JSON.stringify(detail) : String(detail)
        })
    }

    /**
     * Write buffered entries to Drive. Safe to call concurrently (queues).
     */
    async flush() {
        if (this._pending.length === 0) return
        if (!this.sync.isEnabled || !this.sync.accessToken || !this.sync.folderId) return
        if (this._flushing) return   // one flush at a time

        this._flushing = true
        const toWrite = this._pending.splice(0)   // drain buffer

        try {
            // 1. Resolve file ID
            if (!this._fileId) {
                this._fileId = await this.sync.findFileByName(this.LOG_NAME)
            }

            // 2. Read existing entries
            let existing = []
            if (this._fileId) {
                try {
                    const data = await this.sync.getFileContent(this._fileId)
                    if (data && Array.isArray(data.entries)) existing = data.entries
                } catch (_) { /* treat as empty */ }
            }

            // 3. Merge: dedup by id, sort by ts, trim
            const byId = new Map(existing.map(e => [e.id, e]))
            for (const entry of toWrite) byId.set(entry.id, entry)
            const merged = [...byId.values()].sort((a, b) => a.ts - b.ts)
            if (merged.length > this.MAX_ENTRIES) merged.splice(0, merged.length - this.MAX_ENTRIES)

            // 4. Write
            const payload = { entries: merged, updatedAt: Date.now() }
            if (this._fileId) {
                await this.sync.updateFile(this._fileId, payload)
            } else {
                this._fileId = await this.sync.createFile(this.LOG_NAME, payload, this.sync.folderId)
            }

            console.log(`[DriveLog] Flushed ${toWrite.length} entr${toWrite.length === 1 ? 'y' : 'ies'} (total ${merged.length})`)
        } catch (err) {
            // Re-queue on failure — will retry next sync cycle
            this._pending = [...toWrite, ...this._pending]
            console.warn('[DriveLog] Flush failed (will retry):', err.message)
        } finally {
            this._flushing = false
        }
    }

    /**
     * Fetch all entries from Drive (for the log viewer UI).
     * Returns array sorted newest-first, or null on failure.
     */
    async fetchAll() {
        if (!this.sync.isEnabled || !this.sync.accessToken || !this.sync.folderId) return null
        try {
            if (!this._fileId) {
                this._fileId = await this.sync.findFileByName(this.LOG_NAME)
            }
            if (!this._fileId) return []
            const data = await this.sync.getFileContent(this._fileId)
            const entries = (data?.entries || []).slice().reverse()
            return entries
        } catch (err) {
            console.warn('[DriveLog] fetchAll failed:', err.message)
            return null
        }
    }

    // ── Private ───────────────────────────────────────────────

    _deviceLabel() {
        const ua = navigator.userAgent
        if (/iPad/.test(ua))       return 'iPad'
        if (/iPhone/.test(ua))     return 'iPhone'
        if (/Android/.test(ua))    return 'Android'
        if (/Macintosh/.test(ua))  return 'Mac'
        if (/Windows/.test(ua))    return 'Windows'
        if (/Linux/.test(ua))      return 'Linux'
        return 'Unknown'
    }
}
