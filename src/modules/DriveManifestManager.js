/**
 * DriveManifestManager handles the cloud manifest (cloud_manifest_v3.json):
 * loading, saving, updating entries, scanning remote files, and index reset.
 * Uses this.sync (DriveSyncManager) to access shared state and cross-manager methods.
 */
export class DriveManifestManager {
    constructor(sync) {
        this.sync = sync;
    }

    async loadManifest() {
        if (!this.sync.folderId) return;
        try {
            const fileName = this.sync.MANIFEST_NAME;
            console.log('[DriveSync] 🗂 Searching for manifest file...');
            const t0 = Date.now();
            const fileId = await this.sync.findFileByName(fileName);
            console.log(`[DriveSync] 🗂 Manifest search: ${Date.now() - t0}ms, found=${!!fileId}`);
            if (fileId) {
                this.sync.manifestFileId = fileId;
                console.log('[DriveSync] 🗂 Downloading manifest...');
                const t1 = Date.now();
                this.sync.manifest = await this.sync.getFileContent(fileId);
                console.log(`[DriveSync] 🗂 Manifest downloaded: ${Date.now() - t1}ms, ${Object.keys(this.sync.manifest).length} entries`);
                return true;
            }
        } catch (err) {
            console.warn('[DriveSync] Failed to load manifest:', err);
        }
        return false;
    }

    async saveManifest() {
        if (!this.sync.folderId || this.sync.isManifestSaving) return;
        this.sync.isManifestSaving = true;
        try {
            const fileName = this.sync.MANIFEST_NAME;

            if (!this.sync.manifestFileId) {
                this.sync.manifestFileId = await this.sync.findFileByName(fileName);
            }

            if (this.sync.manifestFileId) {
                // Read-merge-write: re-fetch cloud version and merge by `updated` timestamp
                // to avoid overwriting concurrent changes from another device.
                let merged = { ...this.sync.manifest };
                try {
                    const cloud = await this.sync.getFileContent(this.sync.manifestFileId);
                    if (cloud && typeof cloud === 'object') {
                        for (const [fp, cloudEntry] of Object.entries(cloud)) {
                            const local = merged[fp];
                            if (!local || (cloudEntry.updated || 0) > (local.updated || 0)) {
                                merged[fp] = cloudEntry;
                            }
                        }
                        this.sync.manifest = merged;
                    }
                } catch (e) {
                    console.warn('[DriveSync] Manifest re-read failed, writing local version:', e.message);
                }
                await this.sync.updateFile(this.sync.manifestFileId, merged);
            } else {
                await this.sync.createFile(fileName, this.sync.manifest);
                this.sync.manifestFileId = await this.sync.findFileByName(fileName);
            }
        } catch (err) {
            console.error('[DriveSync] Failed to save manifest:', err);
        } finally {
            this.sync.isManifestSaving = false;
        }
    }

    async updateManifestEntry(fingerprint, data) {
        if (!this.sync.manifest) this.sync.manifest = {};

        const previouslyDeleted = this.sync.manifest[fingerprint]?.deleted;

        this.sync.manifest[fingerprint] = {
            ...this.sync.manifest[fingerprint],
            ...data,
            deleted: false,
            updated: Date.now()
        };

        if (previouslyDeleted) {
            console.log(`[DriveSync] Resurrecting tombstoned entry: ${fingerprint.slice(0, 8)}`);
        }

        // --- Proactive Name Update ---
        // If manifest doesn't have a name, OR we want to force it to match Registry
        if (this.sync.app.scoreManager) {
            const score = this.sync.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            const localName = score?.title;
            const isGeneric = !localName || localName === 'Unknown' || localName.startsWith('score_buf_') || localName.startsWith('Recovered (');
            
            if (score && !isGeneric) {
                const safeLocalName = this.sync.safeTitle(localName).replace(/_$/, '');
                // Update if manifest name is missing, generic, or if we want to sync a name change
                if (!this.sync.manifest[fingerprint].name || this.sync.manifest[fingerprint].name === 'Unknown' || this.sync.manifest[fingerprint].name.startsWith('sync_')) {
                    this.sync.manifest[fingerprint].name = safeLocalName;
                }
            }
        }

        await this.saveManifest();
    }

    /**
     * Delete a score entry from the cloud manifest (tombstone).
     */
    async deleteManifestEntry(fingerprint, title = null) {
        if (!this.sync.manifest) this.sync.manifest = {};

        this.sync.manifest[fingerprint] = {
            ...this.sync.manifest[fingerprint],
            deleted: true,
            deletedAt: Date.now(),
            updated: Date.now(),
            syncId: null,
            pdfId: null,
            filename: null,
            pdfFilename: null,
            ...(title && { name: title }),
        };

        await this.saveManifest();
        console.log(`[DriveSync] Entry ${fingerprint.slice(0, 8)} tombstoned (title: ${title || 'unknown'}).`);
    }

    /**
     * Scans the sync folder for files and updates the ScoreManager registry.
     */
    async scanRemoteSyncFiles() {
        if (!this.sync.folderId || !this.sync.app.scoreManager) return;

        const scanStart = Date.now();
        console.log(`[DriveSync] 🗂 scanRemoteSyncFiles() started at ${new Date().toLocaleTimeString()}`);

        try {
            this.sync.addLog('正在載入雲端清單...', 'system');

            const t1 = Date.now();
            let hasManifest = await this.loadManifest();
            console.log(`[DriveSync] 🗂 loadManifest: ${Date.now() - t1}ms, found=${hasManifest}`);
            if (!this.sync.manifest) this.sync.manifest = {};

            if (!hasManifest) {
                this.sync.addLog('未找到雲端索引，將在首次上傳時建立。', 'system');
            }

            let pdfCount = 0;
            let syncCount = 0;

            Object.values(this.sync.manifest).forEach(entry => {
                if (entry.syncId && !entry.deleted) syncCount++;
                if (entry.pdfId && !entry.deleted) pdfCount++;
            });

            this.sync.addLog(`清單載入完成，共 ${syncCount} 份備份`, 'system');
            this.sync.cloudStats.totalAnnotations = syncCount;
            this.sync.cloudStats.totalPDFs = pdfCount;
            this.sync.updateCloudStatsUI();

            // Backfill filename/pdfFilename for existing entries that predate this field.
            // Run ALL lookups in parallel to avoid O(N) sequential API calls.
            const backfillTasks = [];
            for (const [fp, entry] of Object.entries(this.sync.manifest)) {
                if (entry.deleted) continue;
                if (entry.syncId && !entry.filename) {
                    const hash = this.sync.shortHash(fp);
                    const annotParent = this.sync.annotationsFolderId || this.sync.folderId;
                    backfillTasks.push(
                        this.sync.gdriveFetch(
                            `https://www.googleapis.com/drive/v3/files?q=name contains '${hash}' and '${annotParent}' in parents and trashed=false&fields=files(id,name)&orderBy=createdTime asc`
                        ).then(r => r.json()).then(data => {
                            if (data.files?.length > 0) entry.filename = data.files[0].name;
                        }).catch(() => {})
                    );
                }
                if (entry.pdfId && !entry.pdfFilename) {
                    const hash = this.sync.shortHash(fp);
                    const pdfParent = this.sync.pdfsFolderId || this.sync.folderId;
                    backfillTasks.push(
                        this.sync.gdriveFetch(
                            `https://www.googleapis.com/drive/v3/files?q=name contains '${hash}' and '${pdfParent}' in parents and trashed=false&fields=files(id,name)&orderBy=createdTime asc`
                        ).then(r => r.json()).then(data => {
                            if (data.files?.length > 0) entry.pdfFilename = data.files[0].name;
                        }).catch(() => {})
                    );
                }
            }
            if (backfillTasks.length > 0) {
                this.sync.addLog(`正在補全 ${backfillTasks.length} 個雲端檔名...`, 'system');
                console.log(`[DriveSync] 🔍 Backfilling ${backfillTasks.length} filename(s) in parallel...`);
                const bfStart = Date.now();
                await Promise.all(backfillTasks);
                console.log(`[DriveSync] 🔍 Backfill done in ${Date.now() - bfStart}ms`);
                await this.saveManifest();
                this.sync.addLog('檔名補全完成', 'system');
            }

            let registryChanged = false;
            let foundCount = 0;
            let newCloudOnlyCount = 0;

            // Remove tombstoned entries from registry
            const tombstonedFps = new Set(
                Object.entries(this.sync.manifest)
                    .filter(([, e]) => e.deleted)
                    .map(([fp]) => fp)
            );
            if (tombstonedFps.size > 0) {
                const before = this.sync.app.scoreManager.registry.length;
                this.sync.app.scoreManager.registry = this.sync.app.scoreManager.registry.filter(s => {
                    if (tombstonedFps.has(s.fingerprint)) {
                        console.log(`[DriveSync] Removing tombstoned score from registry: ${s.title || s.fingerprint.slice(0, 8)}`);
                        return false;
                    }
                    return true;
                });
                if (this.sync.app.scoreManager.registry.length < before) registryChanged = true;
            }

            // Mark local registry based on manifest
            for (const score of this.sync.app.scoreManager.registry) {
                const entry = this.sync.manifest[score.fingerprint];
                if (!entry) continue;

                const isSynced = !!entry.syncId;
                const isPdfAvailable = !!entry.pdfId;

                let changed = false;
                if (score.isSynced !== isSynced) { score.isSynced = isSynced; changed = true; }
                if (score.isPdfAvailable !== isPdfAvailable) { score.isPdfAvailable = isPdfAvailable; changed = true; }

                const isGeneric = (score.title === 'Unknown' || score.title.startsWith('score_buf_') || score.title.startsWith('Recovered ('));
                if (entry.name && entry.name !== 'Unknown' && isGeneric) {
                    await this.sync.app.scoreManager.updateMetadata(score.fingerprint, { title: entry.name }, true);
                    registryChanged = true;
                }

                if (changed) { registryChanged = true; foundCount++; }
            }

            // NOTE: Drive is backup-only. We do NOT restore scores from Drive manifest
            // back into the local registry — that is Supabase's responsibility.
            // Re-adding placeholders from Drive would resurrect deleted scores.

            if (registryChanged) {
                await this.sync.app.scoreManager.saveRegistry();
                this.sync.app.scoreManager.render();
            }

            console.log(`[DriveSync] 🗂 scanRemoteSyncFiles() done in ${Date.now() - scanStart}ms — ${syncCount} sync files, ${pdfCount} PDFs, ${newCloudOnlyCount} new cloud-only`);
            this.sync.addLog(`掃描完成: 索引中共有 ${syncCount} 份備份`, 'success');

        } catch (err) {
            console.error('[DriveSync] Manifest sync failed:', err);
            this.sync.addLog('雲端索引同步失敗', 'error');
        }
    }

    async fetchCloudScoreDetails(fileId, fingerprint) {
        try {
            const data = await this.sync.getFileContent(fileId);
            const score = this.sync.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            if (score && score.isCloudOnly) {
                let changed = false;
                if (data && data.scoreDetail && data.scoreDetail.name) {
                    score.title = data.scoreDetail.name;
                    score.composer = data.scoreDetail.composer || 'Unknown';
                    // fileName is the original upload filename — never derive from title
                    if (data.scoreDetail.fileName) score.fileName = data.scoreDetail.fileName;
                    changed = true;
                } else if (data && data.score && data.score.title) {
                    score.title = data.score.title;
                    score.composer = data.score.composer || 'Unknown';
                    if (data.score.fileName) score.fileName = data.score.fileName;
                    changed = true;
                }

                if (changed) {
                    await this.sync.app.scoreManager.saveRegistry();
                    this.sync.app.scoreManager.render();
                }
            }
        } catch (err) {
            console.error(`[DriveSync] Failed to fetch details for ${fingerprint}:`, err);
        }
    }

    /**
     * Forces all local scores to re-upload on next sync.
     */
    async forcePushAll() {
        if (!this.sync.isEnabled || !this.sync.accessToken) {
            this.sync.addLog('請先連線 Google Drive 才能執行同步', 'error');
            return;
        }

        const confirmed = await this.sync.app.showDialog({
            title: '強制同步所有資料',
            message: `這將把本地書庫中的所有標記資料（包含曲名、作曲家、劃記、書籤及歌單）重新上傳至雲端。如果雲端已存在較新版本，可能會被本地覆蓋。確定要繼續嗎？`,
            type: 'confirm',
            icon: '📤'
        });

        if (!confirmed) return;

        try {
            this.sync.addLog('正在準備強制同步...', 'system');

            if (this.sync.app.scoreManager?.registry) {
                for (const score of this.sync.app.scoreManager.registry) {
                    if (!score.isCloudOnly) score.isSynced = false;
                }
                await this.sync.app.scoreManager.saveRegistry();
            }

            this.sync.lastProfileSyncTime = 0;

            this.sync.addLog('開始全面背景上傳...', 'system');
            this.sync.sync();

            if (this.sync.app.showMessage) {
                this.sync.app.showMessage('已開始全量上傳流程，請查看日誌了解進度', 'success');
            }
        } catch (err) {
            console.error('[DriveSync] Force push failed:', err);
            this.sync.addLog('強制同步啟動失敗: ' + err.message, 'error');
        }
    }
}
