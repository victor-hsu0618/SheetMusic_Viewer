import * as db from '../db.js';

/**
 * DriveFileManager handles all Google Drive file/folder CRUD operations:
 * folder creation, file upload/download, and PDF management.
 * Uses this.sync (DriveSyncManager) to access shared state and cross-manager methods.
 */
export class DriveFileManager {
    constructor(sync) {
        this.sync = sync;
    }

    shortHash(fp) {
        return fp.slice(0, 8);
    }

    /**
     * Returns a filesystem-safe version of the score title for file naming.
     */
    safeTitle(title) {
        if (!title || title.trim() === '' || title === 'Unknown') return '';
        const safe = title.replace(/[/\\?*:|"<>]/g, '_').trim().slice(0, 100);
        return safe ? safe + '_' : '';
    }

    async findOrCreateSubfolder(name, parentId) {
        const response = await this.sync.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false&fields=files(id,name)`
        );
        const data = await response.json();
        if (data.files && data.files.length > 0) return data.files[0].id;

        const createResp = await this.sync.gdriveFetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
        });
        const folder = await createResp.json();
        return folder.id;
    }

    async findOrCreateSyncFolder() {
        // Promise lock: prevents concurrent calls from creating duplicate subfolders.
        if (this._folderSetupPromise) return this._folderSetupPromise;
        this._folderSetupPromise = this._doFindOrCreateSyncFolder().finally(() => {
            this._folderSetupPromise = null;
        });
        return this._folderSetupPromise;
    }

    async _doFindOrCreateSyncFolder() {
        const folderName = 'ScoreFlow_Sync';
        const t0 = Date.now();

        // Fast path: restore folder IDs cached from last session
        const cached = this._loadCachedFolderIds();
        if (cached) {
            this.sync.pdfsFolderId = cached.pdfs;
            this.sync.annotationsFolderId = cached.annotations;
            console.log(`[DriveSync] 📁 Folder IDs restored from cache (${Date.now() - t0}ms)`);
            return cached.root;
        }

        console.log('[DriveSync] 📁 Searching for ScoreFlow_Sync root folder...');
        const t1 = Date.now();
        const response = await this.sync.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`
        );
        const data = await response.json();
        console.log(`[DriveSync] 📁 Root folder search: ${Date.now() - t1}ms, found=${data.files?.length > 0}`);

        let rootId;
        if (data.files && data.files.length > 0) {
            rootId = data.files[0].id;
        } else {
            console.log('[DriveSync] 📁 Creating ScoreFlow_Sync root folder...');
            const t2 = Date.now();
            const createResp = await this.sync.gdriveFetch('https://www.googleapis.com/drive/v3/files', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
            });
            const folder = await createResp.json();
            rootId = folder.id;
            console.log(`[DriveSync] 📁 Root folder created in ${Date.now() - t2}ms`);
        }

        // Resolve v3/ version subfolder first
        const v3Id = await this.findOrCreateSubfolder('v3', rootId);
        console.log(`[DriveSync] 📁 v3 subfolder ready`);

        // Resolve pdfs + annotations inside v3/ in parallel
        console.log('[DriveSync] 📁 Resolving pdfs + annotations subfolders in parallel...');
        const t3 = Date.now();
        const [pdfsFolderId, annotationsFolderId] = await Promise.all([
            this.findOrCreateSubfolder('pdfs', v3Id),
            this.findOrCreateSubfolder('annotations', v3Id)
        ]);
        console.log(`[DriveSync] 📁 Subfolders ready in ${Date.now() - t3}ms`);
        this.sync.pdfsFolderId = pdfsFolderId;
        this.sync.annotationsFolderId = annotationsFolderId;

        this._saveCachedFolderIds(v3Id, pdfsFolderId, annotationsFolderId);
        console.log(`[DriveSync] 📁 Total folder setup: ${Date.now() - t0}ms`);
        return v3Id;
    }

    _loadCachedFolderIds() {
        try {
            const raw = localStorage.getItem('scoreflow_drive_folder_ids_v3');
            if (!raw) return null;
            const { root, pdfs, annotations, savedAt } = JSON.parse(raw);
            // Cache valid for 7 days — folders almost never change
            if (root && pdfs && annotations && (Date.now() - savedAt) < 7 * 24 * 3600 * 1000) {
                return { root, pdfs, annotations };
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    _saveCachedFolderIds(root, pdfs, annotations) {
        try {
            localStorage.setItem('scoreflow_drive_folder_ids_v3', JSON.stringify({ root, pdfs, annotations, savedAt: Date.now() }));
        } catch (e) { /* ignore */ }
    }

    /**
     * Finds a file in the correct subfolder by fingerprint short hash.
     */
    async findSyncFile(fingerprint, type = 'sync') {
        if (!this.sync.folderId) return null;

        if (type !== 'pdf' && type !== 'sync') {
            return this.findFileByName(fingerprint);
        }

        const hash = this.shortHash(fingerprint);
        const parentId = type === 'pdf'
            ? (this.sync.pdfsFolderId || this.sync.folderId)
            : (this.sync.annotationsFolderId || this.sync.folderId);

        const response = await this.sync.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name contains '${hash}' and '${parentId}' in parents and trashed=false&fields=files(id,name)&orderBy=createdTime desc`
        );
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    }

    /**
     * Finds a file by its exact name in the sync folder.
     */
    async findFileByName(fileName) {
        if (!this.sync.folderId) return null;
        const response = await this.sync.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name = '${fileName}' and '${this.sync.folderId}' in parents and trashed=false&fields=files(id,name)`
        );
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    }

    async createFile(name, content, parentId = null) {
        if (!this.sync.folderId) return;
        const metadata = {
            name: name,
            parents: [parentId || this.sync.folderId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));

        const resp = await this.sync.gdriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
            method: 'POST',
            body: form
        });
        const data = await resp.json();
        return data.id || null;
    }

    async updateFile(fileId, content) {
        await this.sync.gdriveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(content, null, 2)
        });
    }

    async renameFile(fileId, newName) {
        console.log(`[DriveSync] Renaming file ${fileId} to ${newName}`);
        const response = await this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName })
        });
        if (!response.ok) throw new Error(`Rename failed: ${response.status}`);
        return await response.json();
    }

    async getFileContent(fileId) {
        const response = await this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        return await response.json();
    }

    /**
     * Upload a PDF file to Google Drive using the Resumable Upload protocol.
     */
    async uploadPDF(fingerprint, buffer, originalFileName) {
        if (!this.sync.folderId) return;

        const scoreEntry = this.sync.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint);
        const prefix = this.safeTitle(scoreEntry?.title || originalFileName?.replace(/\.pdf$/i, ''));
        const fileName = `${prefix}${this.shortHash(fingerprint)}.pdf`;
        const targetParent = this.sync.pdfsFolderId || this.sync.folderId;

        // Check if PDF exists
        const hash = this.shortHash(fingerprint);
        const parentId = targetParent;
        const searchResp = await this.sync.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name contains '${hash}' and '${parentId}' in parents and trashed=false&fields=files(id,name)&orderBy=createdTime desc`
        );
        const searchData = await searchResp.json();
        const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

        if (existingFile) {
            console.log(`[DriveSync] PDF for ${fingerprint} already exists: "${existingFile.name}"`);
            // Rename if necessary to match current title
            if (existingFile.name !== fileName) {
                try {
                    console.log(`[DriveSync] Renaming cloud PDF to match title: "${existingFile.name}" -> "${fileName}"`);
                    await this.renameFile(existingFile.id, fileName);
                } catch (e) {
                    console.warn(`[DriveSync] Failed to rename PDF: ${e.message}`);
                }
            }
            await this.sync.updateManifestEntry(fingerprint, { pdfId: existingFile.id, pdfFilename: fileName });
            return;
        }

        console.log(`[DriveSync] Uploading PDF ${fileName} (Resumable)...`);
        this.sync.addLog(`準備上傳大檔案: ${originalFileName}...`, 'system');

        try {
            const metadata = {
                name: fileName,
                parents: [targetParent],
                mimeType: 'application/pdf'
            };

            const initiateResp = await this.sync.gdriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': 'application/pdf',
                    'X-Upload-Content-Length': buffer.byteLength
                },
                body: JSON.stringify(metadata)
            });

            if (!initiateResp.ok) {
                if (initiateResp.status === 409) {
                    console.warn('[DriveSync] Conflict 409: PDF already exists on Drive. Recovering file ID...');
                    const recoveredId = await this.findSyncFile(fingerprint, 'pdf');
                    if (recoveredId) {
                        const existingPdfFilename = this.sync.manifest[fingerprint]?.pdfFilename;
                        await this.sync.updateManifestEntry(fingerprint, { pdfId: recoveredId, name: prefix, pdfFilename: existingPdfFilename || fileName });
                        this.sync.addLog(`檢測到衝突: PDF 已在雲端，索引已同步。`, 'success');
                        return;
                    }
                }
                const errText = await initiateResp.text();
                throw new Error(`Failed to initiate upload: ${initiateResp.status} ${errText}`);
            }

            const location = initiateResp.headers.get('Location');
            if (!location) throw new Error('No upload location received');

            this.sync.addLog(`正在傳送二進位數據 (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)...`, 'system');

            this.sync.uploadStatus.pdf.active = true;
            this.sync.uploadStatus.pdf.loaded = 0;
            this.sync.uploadStatus.pdf.total = buffer.byteLength;
            this.sync.uploadStatus.pdf.fileName = originalFileName;
            this.sync.updateCloudStatsUI();

            const uploadPromise = new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', location, true);
                xhr.setRequestHeader('Content-Type', 'application/pdf');

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        this.sync.uploadStatus.pdf.loaded = e.loaded;
                        this.sync.uploadStatus.pdf.total = e.total;
                        this.sync.updateCloudStatsUI();
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
                    }
                };

                xhr.timeout = 60000;
                xhr.ontimeout = () => reject(new Error('PDF upload timed out (60s limit).'));
                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.send(buffer);
            });

            await uploadPromise;

            const finalPdfId = await this.findSyncFile(fingerprint, 'pdf');

            const existingPdfFilename = this.sync.manifest[fingerprint]?.pdfFilename;
            await this.sync.updateManifestEntry(fingerprint, {
                pdfId: finalPdfId,
                name: prefix.replace(/_$/, ''),
                pdfFilename: existingPdfFilename || fileName
            });

            this.sync.addLog(`樂譜檔案 ${originalFileName} 備份成功`, 'success');
            if (this.sync.app.showMessage) this.sync.app.showMessage(`雲端備份成功: ${originalFileName}`, 'success');

            this.sync.updateCloudStatsUI();

            if (this.sync.app.scoreManager) {
                this.sync.app.scoreManager.updateSyncStatus(fingerprint, true);
            }
        } catch (err) {
            console.error('[DriveSync] Resumable PDF upload failed:', err);
            this.sync.addLog(`樂譜二進位檔案備份失敗: ${err.message}`, 'error');
            if (this.sync.app.showMessage) this.sync.app.showMessage('雲端備份失敗', 'error');
        } finally {
            this.sync.uploadStatus.pdf.active = false;
            this.sync.updateCloudStatsUI();
        }
    }

    /**
     * Download a PDF file from Google Drive.
     */
    async downloadPDF(fingerprint) {
        if (!this.sync.folderId) throw new Error('Google Drive 尚未連線');

        const fileId = await this.findSyncFile(fingerprint, 'pdf');

        if (!fileId) {
            throw new Error(`雲端找不到該樂譜的 PDF 檔案 (fingerprint: ${fingerprint})`);
        }

        console.log(`[DriveSync] Downloading PDF for ${fingerprint} (ID: ${fileId})...`);
        this.sync.addLog(`開始從雲端下載樂譜...`, 'system');
        const response = await this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);

        if (!response.ok) {
            throw new Error(`下載失敗: HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        if (!buffer || buffer.byteLength === 0) {
            throw new Error('下載的 PDF 檔案為空');
        }

        this.sync.addLog(`樂譜下載完成`, 'success');
        return buffer;
    }

    /**
     * Download a PDF from Drive and cache it in IndexedDB.
     * Shows a toast on completion. Safe to call in background.
     */
    async downloadAndCacheScore(fp) {
        try {
            const buffer = await this.downloadPDF(fp);
            await db.set(`score_buf_${fp}`, buffer);
            const score = this.sync.app.scoreManager?.registry?.find(s => s.fingerprint === fp);
            const title = score?.title || fp.slice(0, 8);
            await this.sync.app.scoreManager?.setStorageMode(fp, score?.storageMode === 'pinned' ? 'pinned' : 'cached');
            if (this.sync.app.showMessage) this.sync.app.showMessage(`已下載: ${title}`, 'success');
            this.sync.app.scoreManager?.render();
        } catch (err) {
            console.warn(`[DriveSync] downloadAndCacheScore failed for ${fp.slice(0, 8)}:`, err.message);
        }
    }

    /**
     * Delete both PDF and Sync JSON files for a specific fingerprint from Drive.
     */
    async deleteSyncFiles(fingerprint, deletePDF = false) {
        if (!this.sync.folderId) return;

        try {
            const syncId = await this.findSyncFile(fingerprint, 'sync');
            if (syncId) {
                this.sync.addLog(`正在刪除雲端同步檔 (${fingerprint.slice(0, 8)})...`, 'system');
                await this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${syncId}`, { method: 'DELETE' });
            }

            if (deletePDF) {
                const pdfId = await this.findSyncFile(fingerprint, 'pdf');
                if (pdfId) {
                    this.sync.addLog(`正在刪除雲端 PDF 檔...`, 'system');
                    await this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${pdfId}`, { method: 'DELETE' });
                }
            }

            await this.sync.deleteManifestEntry(fingerprint);

            this.sync.addLog(`樂譜雲端資料已清除 (${fingerprint.slice(0, 8)})`, 'success');
        } catch (err) {
            console.error('[DriveSync] Delete failed:', err);
            this.sync.addLog('刪除雲端資料失敗: ' + err.message, 'error');
        }
    }

    /**
     * PERMANENTLY DELETES all ScoreFlow files from Google Drive sync folder.
     */
    async purgeAllCloudData() {
        console.log('[DriveSync] purgeAllCloudData triggered');
        if (!this.sync.isEnabled || !this.sync.accessToken) {
            alert('請先連接 Google Drive');
            return;
        }

        const confirmed = await this.sync.app.showDialog({
            title: '永久清理雲端數據？',
            message: '這將刪除雲端目錄中的所有 PDF、劃記及索引檔案。本地書庫不會受損。此操作不可撤銷，確定要重來嗎？',
            type: 'confirm',
            icon: '☢️'
        });

        if (!confirmed) return;

        try {
            this.sync.stopAutoSync();
            this.sync.isSyncing = true;

            this.sync.addLog('正在啟動雲端全量清理 (同步已暫停)...', 'warn');
            if (this.sync.app.showMessage) this.sync.app.showMessage('正在清理雲端數據，請稍候...', 'system');

            const response = await this.sync.gdriveFetch(
                `https://www.googleapis.com/drive/v3/files?q='${this.sync.folderId}' in parents and trashed=false&fields=files(id,name)`
            );
            const data = await response.json();

            if (data.files && data.files.length > 0) {
                this.sync.addLog(`找到 ${data.files.length} 個檔案 (包括舊版索引)，正在逐一刪除...`, 'system');

                const files = data.files;
                for (let i = 0; i < files.length; i += 5) {
                    const batch = files.slice(i, i + 5);
                    await Promise.all(batch.map(f =>
                        this.sync.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE' })
                            .catch(e => console.warn(`Failed to delete ${f.name}:`, e))
                    ));
                }
            }

            const resetTime = Date.now();
            this.sync.manifest = {
                globalResetTime: resetTime,
                generation: 3,
                description: "Cloud was purged. Switched to manifest v3."
            };

            await this.sync.saveManifest();

            localStorage.setItem('scoreflow_last_global_reset', resetTime.toString());

            this.sync.manifestFileId = await this.findFileByName(this.sync.MANIFEST_NAME);

            // Reset subfolder IDs — pdfs/ and annotations/ were deleted above.
            // Next sync will call findOrCreateSyncFolder() and recreate them.
            this.sync.pdfsFolderId = null;
            this.sync.annotationsFolderId = null;
            this.sync.hasScanned = true;
            this.sync.lastSyncTime = resetTime;
            this.sync.lastProfileSyncTime = 0;

            if (this.sync.app.scoreManager?.registry) {
                this.sync.app.scoreManager.registry.forEach(s => {
                    s.isSynced = false;
                    delete s.cloudDataPulled;
                });
                if (typeof this.sync.app.scoreManager.saveRegistry === 'function') {
                    await this.sync.app.scoreManager.saveRegistry();
                }
            }

            this.sync.addLog('雲端數據已完全清空，本地同步標記已重置', 'success');

            this.sync.isSyncing = false;

            if (this.sync.app.showMessage) this.sync.app.showMessage('雲端數據已清空。同步已暫停，您可以重新整理頁面後再開啟同步。', 'success');

            this.sync.refreshUI();
            this.sync.app.scoreManager?.render();

        } catch (err) {
            console.error('[DriveSync] Purge failed:', err);
            this.sync.addLog('全量清理失敗: ' + err.message, 'error');
        }
    }
}
