/**
 * DriveManifestManager handles the cloud manifest (cloud_manifest_v2.json):
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
            const fileId = await this.sync.findFileByName(fileName);
            if (fileId) {
                this.sync.manifestFileId = fileId;
                this.sync.manifest = await this.sync.getFileContent(fileId);
                console.log('[DriveSync] Manifest loaded:', Object.keys(this.sync.manifest).length, 'entries');
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
            const content = this.sync.manifest;

            if (!this.sync.manifestFileId) {
                this.sync.manifestFileId = await this.sync.findFileByName(fileName);
            }

            if (this.sync.manifestFileId) {
                await this.sync.updateFile(this.sync.manifestFileId, content);
            } else {
                await this.sync.createFile(fileName, content);
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

        try {
            this.sync.addLog('正在同步雲端清單...', 'system');

            let hasManifest = await this.loadManifest();
            if (!this.sync.manifest) this.sync.manifest = {};

            if (!hasManifest) {
                this.sync.addLog('未找到雲端索引，將在首次上傳時建立。', 'system');
            }

            let pdfCount = 0;
            let syncCount = 0;

            Object.values(this.sync.manifest).forEach(entry => {
                if (entry.syncId) syncCount++;
                if (entry.pdfId) pdfCount++;
            });

            this.sync.cloudStats.totalAnnotations = syncCount;
            this.sync.cloudStats.totalPDFs = pdfCount;
            this.sync.updateCloudStatsUI();

            // Backfill filename/pdfFilename for existing entries that predate this field
            let manifestDirty = false;
            for (const [fp, entry] of Object.entries(this.sync.manifest)) {
                if (entry.deleted) continue;
                if (entry.syncId && !entry.filename) {
                    try {
                        const hash = this.sync.shortHash(fp);
                        const annotParent = this.sync.annotationsFolderId || this.sync.folderId;
                        const resp = await this.sync.gdriveFetch(
                            `https://www.googleapis.com/drive/v3/files?q=name contains '${hash}' and '${annotParent}' in parents and trashed=false&fields=files(id,name)&orderBy=createdTime asc`
                        );
                        const data = await resp.json();
                        if (data.files?.length > 0) {
                            entry.filename = data.files[0].name;
                            manifestDirty = true;
                        }
                    } catch (_) {}
                }
                if (entry.pdfId && !entry.pdfFilename) {
                    try {
                        const hash = this.sync.shortHash(fp);
                        const pdfParent = this.sync.pdfsFolderId || this.sync.folderId;
                        const resp = await this.sync.gdriveFetch(
                            `https://www.googleapis.com/drive/v3/files?q=name contains '${hash}' and '${pdfParent}' in parents and trashed=false&fields=files(id,name)&orderBy=createdTime asc`
                        );
                        const data = await resp.json();
                        if (data.files?.length > 0) {
                            entry.pdfFilename = data.files[0].name;
                            manifestDirty = true;
                        }
                    } catch (_) {}
                }
            }
            if (manifestDirty) await this.saveManifest();

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

            // Add cloud-only placeholders for manifest entries not yet in local registry
            for (const [fp, entry] of Object.entries(this.sync.manifest)) {
                if (entry.deleted) continue;
                if (!entry.syncId && !entry.pdfId) continue;
                if (!entry.syncId && !entry.name) continue;

                const exists = this.sync.app.scoreManager.registry.find(s => s.fingerprint === fp);
                if (!exists) {
                    const fallbackTitle = entry.name || `雲端 PDF (${fp.slice(0, 8)})`;

                    const placeholder = {
                        fingerprint: fp,
                        title: fallbackTitle,
                        fileName: '',
                        composer: 'Unknown',
                        thumbnail: null,
                        dateImported: entry.updated || Date.now(),
                        lastAccessed: 0,
                        tags: [],
                        isSynced: false,
                        isCloudOnly: true,
                        isPdfAvailable: !!entry.pdfId
                    };
                    this.sync.app.scoreManager.registry.push(placeholder);
                    registryChanged = true;
                    newCloudOnlyCount++;

                    if (entry.syncId && !entry.name) {
                        this.fetchCloudScoreDetails(entry.syncId, fp);
                    }
                }
            }

            if (registryChanged) {
                await this.sync.app.scoreManager.saveRegistry();
                this.sync.app.scoreManager.render();
            }

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
                    score.fileName = data.scoreDetail.name + '.pdf';
                    changed = true;
                } else if (data && data.score && data.score.title) {
                    score.title = data.score.title;
                    score.composer = data.score.composer || 'Unknown';
                    score.fileName = data.score.title + '.pdf';
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

    async healManifestNames() {
        if (!this.sync.folderId) return;
        this.sync.addLog('正在啟動雲端名稱修復流程...', 'warn');
        
        try {
            const pdfsId = this.sync.pdfsFolderId;
            const annotsId = this.sync.annotationsFolderId;
            if (!pdfsId && !annotsId) throw new Error('雲端目錄結構不完整，無法修復');

            // 1. Scan PDF folder
            const pdfResp = await this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files?q='${pdfsId}' in parents and trashed=false&fields=files(id,name)`);
            const pdfData = await pdfResp.json();
            
            // 2. Scan Annotation folder
            const annResp = await this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files?q='${annotsId}' in parents and trashed=false&fields=files(id,name)`);
            const annData = await annResp.json();

            let repairedCount = 0;
            const allFiles = [...(pdfData.files || []), ...(annData.files || [])];

            for (const file of allFiles) {
                // Extract hash from filename (e.g. MyTitle_abc12345.pdf)
                const match = file.name.match(/^(.*)_([a-f0-9]{8,})\.(pdf|json)$/i);
                if (match) {
                    const realName = match[1].replace(/_/g, ' ').trim();
                    const hash = match[2];
                    
                    // Find entry in manifest starting with this hash
                    const fp = Object.keys(this.sync.manifest).find(k => k.startsWith(hash));
                    if (fp) {
                        const entry = this.sync.manifest[fp];
                        if (entry.name !== realName) {
                            console.log(`[Heal] Correcting ${hash}: "${entry.name}" -> "${realName}"`);
                            entry.name = realName;
                            repairedCount++;
                        }
                    }
                }
            }

            if (repairedCount > 0) {
                await this.saveManifest();
                await this.scanRemoteSyncFiles(); // Refresh local registry
                this.sync.addLog(`修復完成：已更正 ${repairedCount} 份樂譜名稱`, 'success');
            } else {
                this.sync.addLog('未發現需要修復的名稱', 'info');
            }

        } catch (err) {
            console.error('[Heal] Failed:', err);
            this.sync.addLog('修復失敗: ' + err.message, 'error');
        }
    }

    /**
     * Resets the cloud manifest and forces all local scores to re-upload on next sync.
     */
    async resetCloudIndex() {
        if (!this.sync.isEnabled || !this.sync.accessToken) return;

        const confirmed = await this.sync.app.showDialog({
            title: '重置雲端索引',
            message: '這將刪除雲端索引檔，並強制在下次同步時重新上傳所有本地資料。這通常用於修復「Broken Sync」問題。確定要繼續嗎？',
            type: 'confirm',
            icon: '🔄'
        });

        if (!confirmed) return;

        try {
            this.sync.addLog('正在執行雲端索引重置...', 'system');

            if (!this.sync.manifestFileId) {
                this.sync.manifestFileId = await this.sync.findFileByName(this.sync.MANIFEST_NAME);
            }

            if (this.sync.manifestFileId) {
                await this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${this.sync.manifestFileId}`, { method: 'DELETE' });
                this.sync.manifestFileId = null;
            }

            // Preserve deletion tombstones
            const savedTombstones = {};
            for (const [fp, entry] of Object.entries(this.sync.manifest)) {
                if (entry.deleted) savedTombstones[fp] = entry;
            }

            this.sync.manifest = { ...savedTombstones };
            this.sync.hasScanned = false;

            for (const score of this.sync.app.scoreManager.registry) {
                score.isSynced = false;
                delete score.cloudDataPulled;
            }
            await this.sync.app.scoreManager.saveRegistry();

            await this.scanRemoteSyncFiles();

            this.sync.addLog('雲端索引重置完成', 'success');
            if (this.sync.app.showMessage) this.sync.app.showMessage('雲端索引已重置並完成掃描', 'success');
        } catch (err) {
            console.error('[DriveSync] Index reset failed:', err);
            this.sync.addLog('索引重置失敗: ' + err.message, 'error');
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
