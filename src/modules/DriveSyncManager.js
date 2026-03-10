/**
 * DriveSyncManager handles all interactions with Google Drive API.
 * It follows a "clean module" design and can be enabled/disabled at runtime.
 */
export class DriveSyncManager {
    constructor(app) {
        this.app = app;
        this.clientId = '481081864196-tsbrivsjhdtkp4rn9ffgkg19g2sh5r3a.apps.googleusercontent.com';
        this.scopes = 'https://www.googleapis.com/auth/drive.file';
        this.tokenClient = null;
        this.accessToken = null;
        this.folderId = null;
        this.isEnabled = false;
        this.isSyncing = false;
        this.lastSyncTime = 0;
        this.lastProfileSyncTime = 0;
        this.syncInterval = 30000; // 30 seconds polling
        this.syncTimer = null;
        this.hasScanned = false;
        this.cloudStats = {
            totalSyncedScores: 0
        };
    }

    /**
     * Initialize Google Identity Services.
     */
    init() {
        if (typeof google === 'undefined') {
            console.warn('[DriveSync] Google Identity Services not loaded yet.');
            return;
        }

        this.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.clientId,
            scope: this.scopes,
            callback: async (response) => {
                if (response.error !== undefined) {
                    this.isEnabled = false;
                    localStorage.setItem('scoreflow_drive_sync_enabled', 'false');
                    throw (response);
                }
                this.accessToken = response.access_token;
                this.isEnabled = true;
                localStorage.setItem('scoreflow_drive_sync_enabled', 'true');

                // Store hint for better silent sign-in chances
                if (response.login_hint) {
                    localStorage.setItem('scoreflow_drive_user_hint', response.login_hint);
                }

                console.log('[DriveSync] Access token acquired.');
                this.addLog('已取得存取權限', 'success');

                // Ensure folder exists
                try {
                    this.folderId = await this.findOrCreateSyncFolder();
                } catch (err) {
                    console.error('[DriveSync] Init check failed:', err);
                }

                this.refreshUI(); // Refresh UI to show sync status
                this.startAutoSync();

                // One-time scan for library sync status
                this.scanRemoteSyncFiles();
            },
        });

        // Restore state from local storage - DO NOT trigger popup on load
        if (localStorage.getItem('scoreflow_drive_sync_enabled') === 'true') {
            console.log('[DriveSync] Sync was previously enabled. Waiting for user interaction or auto-sync.');
            this.isEnabled = true;
            this.startAutoSync();
        }
        this.refreshUI();
    }

    /**
     * Unified fetch wrapper for Google Drive API with automatic 401 retry.
     */
    async gdriveFetch(url, options = {}) {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${this.accessToken}`;

        let response = await fetch(url, options);

        // Handle Token Expiry (401 Unauthorized)
        if (response.status === 401) {
            console.warn('[DriveSync] Token expired (401), attempting silent refresh...');

            return new Promise((resolve, reject) => {
                // Prepare a listener for the next token update
                const originalCallback = this.tokenClient.callback;
                this.tokenClient.callback = async (resp) => {
                    // Restore original callback
                    this.tokenClient.callback = originalCallback;

                    if (resp.error) {
                        this.isEnabled = false;
                        this.accessToken = null;
                        this.refreshUI();
                        reject(new Error('Silent refresh failed'));
                        return;
                    }

                    this.accessToken = resp.access_token;
                    this.isEnabled = true;
                    this.refreshUI();

                    // Call original callback as well to trigger folder check/sync
                    await originalCallback(resp);

                    // Retry the original request
                    try {
                        options.headers['Authorization'] = `Bearer ${this.accessToken}`;
                        const retryResponse = await fetch(url, options);
                        resolve(retryResponse);
                    } catch (retryErr) {
                        reject(retryErr);
                    }
                };

                // Trigger silent request
                this.tokenClient.requestAccessToken({ prompt: '' });
            });
        }

        return response;
    }

    /**
     * Update UI elements based on sync state.
     */
    refreshUI() {
        const badge = document.getElementById('drive-sync-status-badge');
        const btnSignIn = document.getElementById('btn-drive-signin');
        const btnSignOut = document.getElementById('btn-drive-signout');
        const infoBox = document.getElementById('drive-sync-info');

        if (badge) {
            if (this.isEnabled && this.accessToken) {
                badge.textContent = '已連線';
                badge.className = 'badge badge-success';
                if (infoBox) infoBox.classList.remove('hidden');
            } else {
                badge.textContent = '已中斷';
                badge.className = 'badge badge-error';
                if (infoBox) infoBox.classList.add('hidden');
            }
        }

        if (btnSignIn && btnSignOut) {
            btnSignIn.classList.toggle('hidden', !!(this.isEnabled && this.accessToken));
            btnSignOut.classList.toggle('hidden', !(this.isEnabled && this.accessToken));
        }

        if (this.lastSyncTime > 0) {
            const timeEl = document.getElementById('drive-last-sync-time');
            if (timeEl) {
                const date = new Date(this.lastSyncTime);
                timeEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
        }

        // Update Cloud Stats UI
        this.updateCloudStatsUI();
    }

    /**
     * Update the elements in the Cloud Stats section.
     */
    updateCloudStatsUI() {
        const statsAnnos = document.getElementById('cloud-stats-total-annotations');
        const statsPdfs = document.getElementById('cloud-stats-total-pdfs');
        const folderEl = document.getElementById('cloud-stats-folder-status');

        if (statsAnnos) {
            if (this.isEnabled && this.accessToken) {
                statsAnnos.textContent = this.cloudStats?.totalAnnotations ?? '...';
            } else {
                statsAnnos.textContent = '-';
            }
        }

        if (statsPdfs) {
            if (this.isEnabled && this.accessToken) {
                statsPdfs.textContent = this.cloudStats?.totalPDFs ?? '...';
            } else {
                statsPdfs.textContent = '-';
            }
        }

        if (folderEl) {
            if (this.isEnabled && this.accessToken) {
                folderEl.textContent = this.folderId ? '已對接' : '初始化中...';
                folderEl.className = 'stats-value-mini text-success';
                folderEl.style.color = '#10b981';
            } else {
                folderEl.textContent = '未連結';
                folderEl.className = 'stats-value-mini';
                folderEl.style.color = 'inherit';
            }
        }
    }

    /**
     * Re-scans the cloud folder specifically to update statistics.
     */
    async refreshCloudStats() {
        if (!this.isEnabled || !this.accessToken) return;
        await this.scanRemoteSyncFiles();
        this.updateCloudStatsUI();
    }

    /**
     * Add a message to the UI sync log.
     */
    addLog(msg, type = 'info') {
        const logContainer = document.getElementById('drive-sync-log');
        if (!logContainer) return;

        const entry = document.createElement('div');
        entry.className = `log-entry ${type}`;
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        entry.textContent = `[${time}] ${msg}`;

        logContainer.prepend(entry);

        // Keep last 30 entries
        while (logContainer.children.length > 30) {
            logContainer.lastChild.remove();
        }
    }

    /**
     * Request access token.
     */
    signIn(isSilent = false) {
        if (!this.tokenClient) {
            this.addLog('正在嘗試重新初始化 Google 服務...', 'system');
            this.init();
        }
        if (!this.tokenClient) {
            this.addLog('Google 授權組件尚未就緒，請稍後再試', 'error');
            return;
        }

        try {
            this.addLog(isSilent ? '正在背景連線...' : '正在請求授權...', 'system');

            // Safari Popup Handling: ensure call is triggered from user interaction
            const options = isSilent ? {
                prompt: '',
                hint: localStorage.getItem('scoreflow_drive_user_hint') || ''
            } : { prompt: 'select_account' };

            this.tokenClient.requestAccessToken(options);
        } catch (err) {
            console.error('[DriveSync] Sign-in request failed:', err);
            if (isSilent) {
                this.addLog('背景連線被瀏覽器攔截，請手動點擊「連接」', 'warn');
            } else {
                this.addLog('請求失敗: ' + (err.message || '未知錯誤'), 'error');
            }
        }
    }

    signOut() {
        this.addLog('已斷開 Google Drive 連線', 'warn');
        if (this.accessToken) {
            google.accounts.oauth2.revoke(this.accessToken, () => {
                console.log('[DriveSync] Token revoked.');
            });
        }
        this.accessToken = null;
        this.folderId = null;
        this.isEnabled = false;
        this.stopAutoSync();
        localStorage.setItem('scoreflow_drive_sync_enabled', 'false');
        this.refreshUI();
    }

    startAutoSync() {
        this.stopAutoSync();
        this.syncTimer = setInterval(() => this.sync(), this.syncInterval);
        this.sync(); // Immediate first sync
    }

    stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    async sync() {
        if (!this.isEnabled || !this.accessToken || !this.app.pdfFingerprint || this.isSyncing) return;

        this.isSyncing = true;
        this.addLog('同步中: 正在檢查雲端...', 'system');
        console.log('[DriveSync] Syncing started (Pull-then-Push)...');

        try {
            if (!this.folderId) {
                this.folderId = await this.findOrCreateSyncFolder();
            }
            if (!this.folderId) throw new Error('Could not resolve sync folder');

            // Trigger library scan if not done yet
            if (!this.hasScanned) {
                this.hasScanned = true;
                this.scanRemoteSyncFiles();
            }

            // 0. Sync Profile first (it's global)
            await this.syncProfile();

            // 1. ALWAYS PULL FIRST to merge remote changes
            const remoteVersion = await this.pull();

            // 2. ONLY PUSH if we are up to date or have local changes
            // Implicitly, pull() updates this.lastSyncTime
            await this.push(remoteVersion);

        } catch (err) {
            console.error('[DriveSync] Sync failed:', err);
            this.addLog('同步失敗: ' + (err.message || '網路異常'), 'error');
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Push local changes to Drive.
     * @param {number} remoteVersion - The version currently on drive to prevent overwriting.
     */
    async push(remoteVersion = 0) {
        if (!this.folderId) return;
        const fingerprint = this.app.pdfFingerprint;

        // Optimistic Locking: If remote is newer than what we just pulled (race condition), skip push
        if (remoteVersion > (this.lastSyncTime || 0)) {
            console.warn('[DriveSync] Push skipped: Remote is newer than local lastSyncTime.');
            return;
        }

        const stampsCount = this.app.stamps.length;
        const bookmarksCount = this.app.jumpManager?.bookmarks?.length || 0;
        const sourcesCount = this.app.sources?.length || 0;

        const data = {
            stamps: this.app.stamps,
            bookmarks: this.app.jumpManager?.bookmarks || [],
            sources: this.app.sources || [],
            layers: this.app.layers || [],
            scoreDetail: this.app.scoreDetailManager?.currentInfo || null,
            version: Date.now(),
            fingerprint: fingerprint
        };

        // Build human-readable filename: [ScoreTitle]_sync_[fingerprint].json
        const scoreEntry = this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint);
        const prefix = this.safeTitle(scoreEntry?.title);
        const fileName = `${prefix}sync_${fingerprint}.json`;
        const fileId = await this.findSyncFile(fingerprint, 'sync');

        if (fileId) {
            await this.updateFile(fileId, data);
        } else {
            await this.createFile(fileName, data);
        }

        const logMsg = `已上傳: ${stampsCount} 劃記, ${bookmarksCount} 書籤, ${sourcesCount} 詮釋`;
        this.addLog(logMsg, 'success');
        this.lastSyncTime = data.version;

        // Update Library UI
        this.app.scoreManager?.updateSyncStatus(fingerprint, true);
    }

    /**
     * Pull changes from Drive.
     * @returns {number} The version of the remote file.
     */
    async pull() {
        if (!this.folderId) return 0;
        const fingerprint = this.app.pdfFingerprint;
        const fileId = await this.findSyncFile(fingerprint, 'sync');

        if (!fileId) {
            this.addLog('雲端尚無同步檔案', 'system');
            return 0;
        }

        try {
            const remoteData = await this.getFileContent(fileId);
            if (!remoteData) return 0;

            const remoteVer = remoteData.version || 0;

            if (remoteVer <= (this.lastSyncTime || 0)) {
                this.addLog('雲端資料已是最新', 'system');
                return remoteVer;
            }

            console.log('[DriveSync] Remote changes found, merging...');
            let hasChanges = false;
            let changesDetail = [];

            // 1. Sync Stamps
            if (Array.isArray(remoteData.stamps)) {
                const localMap = new Map();
                this.app.stamps.forEach(s => { if (s.id) localMap.set(s.id, s); });

                let newStamps = 0;
                let updatedStamps = 0;
                const remoteCount = remoteData.stamps.length;

                remoteData.stamps.forEach(remoteS => {
                    if (!remoteS.id) return;
                    const localS = localMap.get(remoteS.id);
                    if (!localS) {
                        this.app.stamps.push(remoteS);
                        hasChanges = true;
                        newStamps++;
                    } else if (remoteS.updatedAt > (localS.updatedAt || 0)) {
                        Object.assign(localS, remoteS);
                        hasChanges = true;
                        updatedStamps++;
                    }
                });

                if (newStamps > 0 || updatedStamps > 0) {
                    changesDetail.push(`劃記(收${remoteCount}/增${newStamps}/更${updatedStamps})`);
                }
            }

            // 2. Sync Bookmarks (LWW)
            if (Array.isArray(remoteData.bookmarks)) {
                const localMap = new Map();
                this.app.jumpManager.bookmarks.forEach(bm => { if (bm.id) localMap.set(bm.id, bm); });

                let bmMadeChanges = false;
                remoteData.bookmarks.forEach(remoteBm => {
                    if (!remoteBm.id) return;
                    const localBm = localMap.get(remoteBm.id);
                    if (!localBm) {
                        this.app.jumpManager.bookmarks.push(remoteBm);
                        bmMadeChanges = true;
                    } else if ((remoteBm.updatedAt || 0) > (localBm.updatedAt || 0)) {
                        Object.assign(localBm, remoteBm);
                        bmMadeChanges = true;
                    }
                });

                if (bmMadeChanges) {
                    this.app.jumpManager.renderBookmarks();
                    hasChanges = true;
                    changesDetail.push(`${remoteData.bookmarks.length} 書籤`);
                }
            }

            // 3. Sync Sources (LWW)
            if (Array.isArray(remoteData.sources)) {
                const localMap = new Map();
                this.app.sources.forEach(src => { if (src.id) localMap.set(src.id, src); });

                let srcMadeChanges = false;
                remoteData.sources.forEach(remoteSrc => {
                    if (!remoteSrc.id) return;
                    const localSrc = localMap.get(remoteSrc.id);
                    if (!localSrc) {
                        this.app.sources.push(remoteSrc);
                        srcMadeChanges = true;
                    } else if ((remoteSrc.updatedAt || 0) > (localSrc.updatedAt || 0)) {
                        Object.assign(localSrc, remoteSrc);
                        srcMadeChanges = true;
                    }
                });

                if (srcMadeChanges) {
                    this.app.collaborationManager?.renderSourceUI();
                    hasChanges = true;
                    changesDetail.push(`${remoteData.sources.length} 詮釋`);
                }
            }

            // 4. Sync Layers (LWW)
            if (Array.isArray(remoteData.layers)) {
                const localMap = new Map();
                this.app.layers.forEach(l => { if (l.id) localMap.set(l.id, l); });

                let layerMadeChanges = false;
                remoteData.layers.forEach(remoteL => {
                    if (!remoteL.id) return;
                    const localL = localMap.get(remoteL.id);
                    if (!localL) {
                        this.app.layers.push(remoteL);
                        layerMadeChanges = true;
                    } else if ((remoteL.updatedAt || 0) > (localL.updatedAt || 0)) {
                        Object.assign(localL, remoteL);
                        layerMadeChanges = true;
                    }
                });

                if (layerMadeChanges) {
                    this.app.layerManager?.renderLayerUI();
                    hasChanges = true;
                }
            }

            // 5. Sync Score Detail
            if (remoteData.scoreDetail) {
                const localInfo = this.app.scoreDetailManager?.currentInfo;
                if (localInfo && (remoteData.scoreDetail.lastEdit > (localInfo.lastEdit || 0))) {
                    this.app.scoreDetailManager.currentInfo = remoteData.scoreDetail;
                    this.app.scoreDetailManager.render(fingerprint);
                    hasChanges = true;
                    changesDetail.push(`作品資訊`);
                }
            }

            if (hasChanges) {
                const detail = changesDetail.length > 0 ? `: ${changesDetail.join(', ')}` : '';
                this.addLog(`已同步遠端更新${detail}`, 'info');
                this.app.saveToStorage(false);
                this.app.redrawAllAnnotationLayers();
            } else {
                this.addLog('雲端版本較新但內容無實質衝突', 'system');
            }

            this.lastSyncTime = remoteVer;
            this.app.scoreManager?.updateSyncStatus(fingerprint, true);
            return remoteVer;
        } catch (err) {
            console.error('[DriveSync] Pull failed:', err);
            return 0;
        }
    }

    // --- DRIVE API HELPERS ---

    /**
     * Sync Global User Profile.
     */
    async syncProfile() {
        if (!this.folderId) return;
        const fileName = 'user_profile_sync.json';
        const fileId = await this.findSyncFile(fileName);
        const localData = this.app.profileManager?.data;
        if (!localData) return;

        try {
            if (fileId) {
                const remoteData = await this.getFileContent(fileId);
                let shouldPush = false;

                if (remoteData && remoteData.version > (this.lastProfileSyncTime || 0)) {
                    // LWW Merge: Only merge if remote updatedAt is strictly greater than local
                    const remoteProfile = remoteData.profile;
                    if (remoteProfile && (remoteProfile.updatedAt || 0) > (localData.updatedAt || 0)) {
                        console.log('[DriveSync] Merging newer remote profile over local...');
                        Object.assign(this.app.profileManager.data, remoteProfile);

                        // Merge Custom Text Library (Set Union)
                        if (Array.isArray(remoteData.userTextLibrary)) {
                            const localSet = new Set(this.app.userTextLibrary);
                            let hasNewText = false;
                            remoteData.userTextLibrary.forEach(text => {
                                if (!localSet.has(text)) {
                                    this.app.userTextLibrary.push(text);
                                    localSet.add(text);
                                    hasNewText = true;
                                }
                            });
                            if (hasNewText) {
                                this.app.saveToStorage();
                                if (this.app.toolManager) this.app.toolManager.updateActiveTools();
                            }
                        }

                        this.app.profileManager.save();
                        this.app.profileManager.render();
                        this.addLog('已更新個人檔案與術語庫 (雲端較新)', 'info');
                    } else if (remoteProfile && (localData.updatedAt || 0) > (remoteProfile.updatedAt || 0)) {
                        // Local is newer, we should push
                        shouldPush = true;
                    }
                } else {
                    // Check if local changed since last sync
                    if (localData.updatedAt > (this.lastProfileSyncTime || 0)) {
                        shouldPush = true;
                    }
                }

                if (shouldPush || !this.lastProfileSyncTime) {
                    const payload = {
                        profile: localData,
                        userTextLibrary: this.app.userTextLibrary,
                        version: Date.now()
                    };
                    await this.updateFile(fileId, payload);
                    this.lastProfileSyncTime = payload.version;
                    console.log('[DriveSync] Local profile pushed (Newer).');
                }
            } else {
                // First time upload
                const payload = {
                    profile: localData,
                    userTextLibrary: this.app.userTextLibrary,
                    version: Date.now()
                };
                await this.createFile(fileName, payload);
                this.lastProfileSyncTime = payload.version;
                console.log('[DriveSync] Profile uploaded for the first time.');
            }
        } catch (err) {
            console.error('[DriveSync] Profile sync failed:', err);
        }
    }

    async findOrCreateSyncFolder() {
        const folderName = 'ScoreFlow_Sync';
        // Search
        const response = await this.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false&fields=files(id,name)`
        );
        const data = await response.json();
        if (data.files && data.files.length > 0) return data.files[0].id;

        // Create
        const createResp = await this.gdriveFetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder'
            })
        });
        const folder = await createResp.json();
        return folder.id;
    }

    /**
     * Returns a filesystem-safe version of the score title for file naming.
     */
    safeTitle(title) {
        if (!title || title.trim() === '' || title === 'Unknown') return '';
        // Remove characters that are invalid in Google Drive filenames
        const safe = title.replace(/[/\\?*:|"<>]/g, '_').trim().slice(0, 40);
        return safe ? safe + '_' : '';
    }

    /**
     * Finds a file in the sync folder by fingerprint (partial name match).
     * Supports both old format (sync_FP.json) and new format (Title_sync_FP.json).
     */
    async findSyncFile(fingerprint, type = 'sync') {
        if (!this.folderId) return null;
        // Search by fingerprint and type keyword for backward compatibility
        const keyword = type === 'pdf' ? `pdf_${fingerprint}` : `sync_${fingerprint}`;
        const response = await this.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name contains '${keyword}' and '${this.folderId}' in parents and trashed=false&fields=files(id,name)&orderBy=createdTime desc`
        );
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    }

    async createFile(name, content) {
        if (!this.folderId) return;
        const metadata = {
            name: name,
            parents: [this.folderId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([JSON.stringify(content)], { type: 'application/json' }));

        await this.gdriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            body: form
        });
    }

    async updateFile(fileId, content) {
        await this.gdriveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(content)
        });
    }

    async getFileContent(fileId) {
        const response = await this.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
        return await response.json();
    }

    /**
     * Scans the sync folder for files matching the fingerprint pattern
     * and updates the ScoreManager registry.
     */
    async scanRemoteSyncFiles() {
        if (!this.folderId || !this.app.scoreManager) return;

        try {
            this.addLog('正在掃描雲端備份...', 'system');

            // Fetch all sync_*.json and pdf_*.pdf files in the sync folder
            const response = await this.gdriveFetch(
                `https://www.googleapis.com/drive/v3/files?q='${this.folderId}' in parents and (name contains 'sync_' or name contains 'pdf_') and trashed=false&fields=files(id,name)`
            );
            const data = await response.json();

            if (data.files && data.files.length > 0) {
                const remoteJSONMap = new Map();
                let pdfCount = 0;

                data.files.forEach(f => {
                    // Support both formats:
                    //   Old: sync_{fp}.json
                    //   New: {Title}_sync_{fp}.json
                    const syncMatch = f.name.match(/(?:^|_)sync_([^_].+)\.json$/);
                    if (syncMatch) {
                        remoteJSONMap.set(syncMatch[1], f.id);
                        // Support both: pdf_{fp}.pdf  OR  {Title}_pdf_{fp}.pdf
                    } else if (f.name.match(/(?:^|_)pdf_[^_].+\.pdf$/)) {
                        pdfCount++;
                    }
                });

                // Update Cloud Stats
                this.cloudStats.totalAnnotations = remoteJSONMap.size;
                this.cloudStats.totalPDFs = pdfCount;
                this.updateCloudStatsUI();

                let registryChanged = false;
                let foundCount = 0;
                let newCloudOnlyCount = 0;

                for (const score of this.app.scoreManager.registry) {
                    const isSynced = remoteJSONMap.has(score.fingerprint);
                    if (score.isSynced !== isSynced) {
                        score.isSynced = isSynced;
                        registryChanged = true;
                        foundCount++;
                    }
                    if (score.isCloudOnly && isSynced && !score.title.includes('讀取中')) {
                        // Already exists as cloud-only and fetched
                    }
                }

                // Add placeholder for cloud-only scores
                for (const [fp, fileId] of remoteJSONMap.entries()) {
                    const exists = this.app.scoreManager.registry.find(s => s.fingerprint === fp);
                    if (!exists) {
                        console.log(`[DriveSync] Found cloud-only score: ${fp}`);
                        const placeholder = {
                            fingerprint: fp,
                            title: '雲端備份 (讀取中...)',
                            fileName: '', // Empty fileName denotes it's not downloaded
                            composer: 'Unknown',
                            thumbnail: null,
                            dateImported: Date.now(),
                            lastAccessed: Date.now(),
                            tags: [],
                            isSynced: true,
                            isCloudOnly: true
                        };
                        this.app.scoreManager.registry.push(placeholder);
                        registryChanged = true;
                        newCloudOnlyCount++;

                        // Async fetch the real title
                        this.fetchCloudScoreDetails(fileId, fp);
                    }
                }

                if (registryChanged) {
                    await this.app.scoreManager.saveRegistry();
                    this.app.scoreManager.render();
                    if (newCloudOnlyCount > 0) {
                        this.addLog(`掃描完成: 發現 ${newCloudOnlyCount} 份未下載的雲端樂譜`, 'success');
                    } else if (foundCount > 0) {
                        this.addLog(`掃描完成: 已更新 ${foundCount} 筆雲端同步狀態`, 'success');
                    } else {
                        this.addLog(`掃描完成: 發現 ${remoteJSONMap.size} 個 JSON 備份 / ${pdfCount} 個 PDF`, 'success');
                    }
                } else {
                    this.addLog('掃描完成: 本地資料庫與雲端同步', 'info');
                }
            } else {
                this.addLog('掃描完成: 雲端尚無備份', 'info');
            }
        } catch (err) {
            console.error('[DriveSync] Scan failed:', err);
            this.addLog('雲端掃描失敗', 'error');
        }
    }

    async fetchCloudScoreDetails(fileId, fingerprint) {
        try {
            const data = await this.getFileContent(fileId);
            const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            if (score && score.isCloudOnly) {
                let changed = false;
                if (data && data.scoreDetail && data.scoreDetail.name) {
                    score.title = data.scoreDetail.name;
                    score.composer = data.scoreDetail.composer || 'Unknown';
                    // We can also make a fake filename based on the title
                    score.fileName = data.scoreDetail.name + '.pdf';
                    changed = true;
                } else if (data && data.score && data.score.title) {
                    score.title = data.score.title;
                    score.composer = data.score.composer || 'Unknown';
                    score.fileName = data.score.title + '.pdf';
                    changed = true;
                }

                if (changed) {
                    await this.app.scoreManager.saveRegistry();
                    this.app.scoreManager.render();
                }
            }
        } catch (err) {
            console.error(`[DriveSync] Failed to fetch details for ${fingerprint}:`, err);
        }
    }

    /**
     * Upload a PDF file to Google Drive.
     */
    async uploadPDF(fingerprint, buffer, originalFileName) {
        if (!this.folderId) return;

        const fileId = await this.findSyncFile(fingerprint, 'pdf');

        if (fileId) {
            console.log(`[DriveSync] PDF for ${fingerprint} already exists on Drive.`);
            return;
        }

        // Build human-readable filename: [ScoreTitle]_pdf_[fingerprint].pdf
        const scoreEntry = this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint);
        const prefix = this.safeTitle(scoreEntry?.title || originalFileName?.replace(/\.pdf$/i, ''));
        const fileName = `${prefix}pdf_${fingerprint}.pdf`;

        console.log(`[DriveSync] Uploading PDF ${fileName} to Drive...`);
        this.addLog(`備份二進位樂譜檔案: ${originalFileName}...`, 'system');

        const metadata = {
            name: fileName,
            parents: [this.folderId]
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([buffer], { type: 'application/pdf' }));

        try {
            await this.gdriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                body: form
            });
            this.addLog(`樂譜檔案 ${originalFileName} 備份成功`, 'success');

            // Update Library UI to show the synced status
            if (this.app.scoreManager) {
                this.app.scoreManager.updateSyncStatus(fingerprint, true);
            }
        } catch (err) {
            console.error('[DriveSync] PDF upload failed:', err);
            this.addLog(`樂譜二進位檔案備份失敗`, 'error');
        }
    }

    /**
     * Download a PDF file from Google Drive.
     */
    async downloadPDF(fingerprint) {
        if (!this.folderId) throw new Error('Google Drive 尚未連線');

        const fileId = await this.findSyncFile(fingerprint, 'pdf');

        if (!fileId) {
            throw new Error(`雲端找不到該樂譜的 PDF 檔案 (fingerprint: ${fingerprint})`);
        }

        console.log(`[DriveSync] Downloading PDF for ${fingerprint} (ID: ${fileId})...`);
        this.addLog(`開始從雲端下載樂譜...`, 'system');
        const response = await this.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);

        if (!response.ok) {
            throw new Error(`下載失敗: HTTP ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        if (!buffer || buffer.byteLength === 0) {
            throw new Error('下載的 PDF 檔案為空');
        }

        this.addLog(`樂譜下載完成`, 'success');
        return buffer;
    }
}
