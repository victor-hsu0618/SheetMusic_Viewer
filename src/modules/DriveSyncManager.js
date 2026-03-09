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
        if (!this.tokenClient) return;

        try {
            this.addLog(isSilent ? '正在背景連線...' : '正在請求授權...', 'system');

            // For Safari: silent sign-in (prompt: '') often gets blocked on page load.
            // We need to catch this or inform the user.
            if (isSilent) {
                this.tokenClient.requestAccessToken({
                    prompt: '',
                    hint: localStorage.getItem('scoreflow_drive_user_hint') || ''
                });
            } else {
                this.tokenClient.requestAccessToken({ prompt: 'select_account' });
            }
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

        const fileName = `sync_${fingerprint}.json`;
        const fileId = await this.findSyncFile(fileName);

        if (fileId) {
            await this.updateFile(fileId, data);
        } else {
            await this.createFile(fileName, data);
        }

        const logMsg = `已上傳: ${stampsCount} 劃記, ${bookmarksCount} 書籤, ${sourcesCount} 詮釋`;
        this.addLog(logMsg, 'success');
        this.lastSyncTime = data.version;
    }

    /**
     * Pull changes from Drive.
     * @returns {number} The version of the remote file.
     */
    async pull() {
        if (!this.folderId) return 0;
        const fingerprint = this.app.pdfFingerprint;
        const fileName = `sync_${fingerprint}.json`;
        const fileId = await this.findSyncFile(fileName);

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

    async findSyncFile(name) {
        if (!this.folderId) return null;
        const response = await this.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name='${name}' and '${this.folderId}' in parents and trashed=false&fields=files(id,name)`
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
}
