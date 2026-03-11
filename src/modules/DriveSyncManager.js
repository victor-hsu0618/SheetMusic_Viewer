import * as db from '../db.js';

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
        this.cloudStats = { totalAnnotations: 0, totalPDFs: 0 };
        this.manifest = {}; // fingerprint -> { pdfId, syncId, name, updated }
        this.manifestFileId = null;
        this.uploadStatus = {
            json: { active: false },
            pdf: { active: false, loaded: 0, total: 0, fileName: '' }
        };
        this.isManifestSaving = false;
        this.authTimeout = null;
        this.isAuthenticating = false;
        this.lastSilentAttempt = 0;
        this.silentAttemptCount = 0;
        this.pushDebounceTimer = null;
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
                // Clear any pending auth timeout and status
                this.isAuthenticating = false;
                if (this.authTimeout) {
                    clearTimeout(this.authTimeout);
                    this.authTimeout = null;
                }

                if (response.error !== undefined) {
                    this.silentAttemptCount++;
                    console.error('[DriveSync] Auth error:', response.error);

                    // Silent failures are quite common if session expired, show hint
                    if (response.error === 'immediate_failed') {
                        this.addLog('背景連線過期，請點擊「連接」重新授權', 'warn');
                    } else {
                        this.addLog(`授權發生錯誤: ${response.error}`, 'error');
                    }

                    this.isEnabled = false;
                    localStorage.setItem('scoreflow_drive_sync_enabled', 'false');
                    this.refreshUI();
                    return;
                }

                // Success!
                this.silentAttemptCount = 0;
                this.accessToken = response.access_token;
                this.isEnabled = true;
                localStorage.setItem('scoreflow_drive_sync_enabled', 'true');

                // Persist token for page refreshes (typically valid for 1 hour)
                if (response.expires_in) {
                    const expiry = Date.now() + (response.expires_in * 1000);
                    localStorage.setItem('scoreflow_drive_access_token', response.access_token);
                    localStorage.setItem('scoreflow_drive_token_expiry', expiry.toString());
                }

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

        // Restore state from local storage - Attempt silent reconnect if enabled
        if (localStorage.getItem('scoreflow_drive_sync_enabled') === 'true') {
            const savedToken = localStorage.getItem('scoreflow_drive_access_token');
            const expiryStr = localStorage.getItem('scoreflow_drive_token_expiry');
            const now = Date.now();

            // Use persisted token if it's still valid (with 5 min buffer)
            if (savedToken && expiryStr && (parseInt(expiryStr) > (now + 300000))) {
                console.log('[DriveSync] Restoring persisted access token.');
                this.accessToken = savedToken;
                this.isEnabled = true;

                // Trigger folder check and start sync
                this.findOrCreateSyncFolder().then(id => {
                    this.folderId = id;
                    this.refreshUI();
                    this.startAutoSync();
                }).catch(e => console.error(e));
            } else {
                const hasHint = !!localStorage.getItem('scoreflow_drive_user_hint');
                console.log('[DriveSync] Token expired or missing. Attempting silent reconnect...');
                this.isEnabled = true;
                if (hasHint) {
                    this.signIn(true); // Silent reconnect
                } else {
                    this.startAutoSync(); // At least start timer, it will trigger guard later
                }
            }
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
        const statsPendingJson = document.getElementById('local-stats-pending-json');
        const statsPendingPdf = document.getElementById('local-stats-pending-pdf');
        const statsProgressJson = document.getElementById('local-stats-json-progress');
        const statsProgressPdf = document.getElementById('local-stats-pdf-progress');
        const statsFilenamePdf = document.getElementById('local-stats-pdf-filename');
        const folderEl = document.getElementById('cloud-stats-folder-status');

        const isCloudReady = this.isEnabled && this.accessToken;

        if (statsAnnos) statsAnnos.textContent = isCloudReady ? (this.cloudStats?.totalAnnotations ?? '...') : '-';
        if (statsPdfs) statsPdfs.textContent = isCloudReady ? (this.cloudStats?.totalPDFs ?? '...') : '-';

        if (isCloudReady) {
            const pending = this.calculateLocalPendingSync();
            if (statsPendingJson) statsPendingJson.textContent = pending.json;
            if (statsPendingPdf) statsPendingPdf.textContent = pending.pdf;

            // Update Progress UI
            if (statsProgressJson) {
                statsProgressJson.classList.toggle('hidden', !this.uploadStatus.json.active);
            }
            if (statsProgressPdf) {
                if (this.uploadStatus.pdf.active) {
                    statsProgressPdf.classList.remove('hidden');
                    if (statsFilenamePdf) {
                        statsFilenamePdf.classList.remove('hidden');
                        statsFilenamePdf.textContent = `正在上傳: ${this.uploadStatus.pdf.fileName || '...'}`;
                    }
                    if (this.uploadStatus.pdf.total > 0) {
                        const pct = Math.round((this.uploadStatus.pdf.loaded / this.uploadStatus.pdf.total) * 100);
                        const mbLoaded = (this.uploadStatus.pdf.loaded / 1024 / 1024).toFixed(1);
                        const mbTotal = (this.uploadStatus.pdf.total / 1024 / 1024).toFixed(1);
                        statsProgressPdf.textContent = `${pct}% (${mbLoaded}/${mbTotal}MB)`;
                    } else {
                        statsProgressPdf.textContent = '準備中...';
                    }
                } else {
                    statsProgressPdf.classList.add('hidden');
                    if (statsFilenamePdf) statsFilenamePdf.classList.add('hidden');
                }
            }
        } else {
            if (statsPendingJson) statsPendingJson.textContent = '-';
            if (statsPendingPdf) statsPendingPdf.textContent = '-';
            if (statsProgressJson) statsProgressJson.classList.add('hidden');
            if (statsProgressPdf) statsProgressPdf.classList.add('hidden');
            if (statsFilenamePdf) statsFilenamePdf.classList.add('hidden');
        }

        if (folderEl) {
            if (isCloudReady) {
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
     * Calculate how many local items need to be uploaded.
     */
    calculateLocalPendingSync() {
        if (!this.app.scoreManager) return { json: 0, pdf: 0 };

        let pendingJson = 0;
        let pendingPdf = 0;

        this.app.scoreManager.registry.forEach(score => {
            if (score.isCloudOnly) return; // Not local

            const entry = this.manifest[score.fingerprint];

            // PDF Pending: If no entry in manifest OR no pdfId in entry
            if (!entry || !entry.pdfId) {
                pendingPdf++;
            }

            // JSON Pending: Based on registry status
            // Note: score.isSynced is true only after successful uploadSyncData
            if (!score.isSynced) {
                pendingJson++;
            }
        });

        return { json: pendingJson, pdf: pendingPdf };
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

        // Prevention: don't overlap auth requests
        if (this.isAuthenticating) {
            console.log('[DriveSync] Auth already in progress, skipping.');
            return;
        }

        // Throttling for silent reconnects to avoid loops
        if (isSilent) {
            const now = Date.now();
            // If failed too many times, wait 5 minutes
            if (this.silentAttemptCount >= 3 && (now - this.lastSilentAttempt) < 300000) {
                console.warn('[DriveSync] Too many silent auth failures, cooling down.');
                return;
            }
            this.lastSilentAttempt = now;
        }

        this.isAuthenticating = true;
        try {
            // Only log if not too frequent or if manual
            const shouldLog = !isSilent || this.silentAttemptCount === 0 || (Date.now() - this.lastSilentAttempt > 60000);
            if (shouldLog) {
                this.addLog(isSilent ? '正在背景連線...' : '正在請求授權...', 'system');
            }

            // Clear any existing timeout
            if (this.authTimeout) clearTimeout(this.authTimeout);

            // Set a timeout to notify user if popup doesn't return
            this.authTimeout = setTimeout(() => {
                if (this.authTimeout) {
                    this.addLog(isSilent ? '背景連線超時，請點擊「連接」手動登入' : '授權請求無回應，請檢查是否有彈出式視窗被瀏覽器封鎖', 'warn');
                    this.authTimeout = null;
                    this.isAuthenticating = false;
                    if (isSilent) this.silentAttemptCount++;
                }
            }, 20000); // 20 seconds timeout

            // Safari Popup Handling: ensure call is triggered from user interaction
            const options = isSilent ? {
                prompt: '',
                hint: localStorage.getItem('scoreflow_drive_user_hint') || ''
            } : { prompt: 'select_account' };

            this.tokenClient.requestAccessToken(options);
        } catch (err) {
            this.isAuthenticating = false;
            if (isSilent) this.silentAttemptCount++;

            if (this.authTimeout) {
                clearTimeout(this.authTimeout);
                this.authTimeout = null;
            }
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
        localStorage.removeItem('scoreflow_drive_access_token');
        localStorage.removeItem('scoreflow_drive_token_expiry');
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
        if (!this.isEnabled || this.isSyncing) return;
        this.isSyncing = true; // Guard immediately

        // Sync Guard: If enabled but no token, try a silent reconnect once
        if (!this.accessToken) {
            console.log('[DriveSync] Enabled but no access token. Attempting silent reconnect...');
            this.signIn(true);
            this.isSyncing = false;
            return;
        }

        console.log('[DriveSync] Syncing cycle started...');

        try {
            if (!this.folderId) {
                this.folderId = await this.findOrCreateSyncFolder();
            }
            if (!this.folderId) throw new Error('Could not resolve sync folder');

            // Trigger library scan if not done yet
            if (!this.hasScanned) {
                this.hasScanned = true;
                await this.scanRemoteSyncFiles();
            }

            // 0. Sync Profile first (it's global)
            await this.syncProfile();

            // 1. Sync the active score (Prioritized)
            if (this.app.pdfFingerprint) {
                const fingerprint = this.app.pdfFingerprint;
                const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
                const title = score ? score.title : 'Unknown';
                console.log(`[DriveSync] Prioritizing active score: ${title} (${fingerprint})`);

                const entry = this.manifest[fingerprint];
                const needsPDF = !entry || !entry.pdfId;

                // Sync PDF if missing
                if (needsPDF) {
                    const pdfKey = `score_buf_${fingerprint}`;
                    const pdfData = await db.get(pdfKey);
                    if (pdfData) {
                        await this.uploadPDF(fingerprint, pdfData, title);
                    }
                }

                // Sync JSON/Annotations
                const remoteVersion = await this.pull();
                await this.push(remoteVersion);
            }

            // 2. Perform library-wide batch sync for other scores
            await this.syncBatch();

        } catch (err) {
            console.error('[DriveSync] Sync failed:', err);
            this.addLog('同步異常: ' + (err.message || '網路問題'), 'error');
        } finally {
            this.isSyncing = false;
            this.updateCloudStatsUI();
            this.refreshUI();
        }
    }

    /**
     * Iterates through the entire registry to backup unsynced scores.
     */
    async syncBatch() {
        if (!this.app.scoreManager?.registry) return;

        const pending = this.calculateLocalPendingSync();
        if (pending.json === 0 && pending.pdf === 0) {
            // Quiet heartbeat
            return;
        }

        let workDone = false;
        console.log(`[Sync] Starting batch backup (${pending.json} JSON, ${pending.pdf} PDF remaining)...`);

        // Find items that need sync
        for (const score of this.app.scoreManager.registry) {
            if (score.isCloudOnly) continue;

            // Skip the current active score as it was already handled in sync()
            if (score.fingerprint === this.app.pdfFingerprint) continue;

            const entry = this.manifest[score.fingerprint];
            const needsPDF = !entry || !entry.pdfId;
            const needsJSON = !score.isSynced;

            if (needsPDF || needsJSON) {
                workDone = true;
                console.log(`[Sync] Processing background score: ${score.title || 'Untitled'}`);
                await this.syncScore(score.fingerprint, needsPDF, needsJSON);

                // Yield to main thread briefly between files
                await new Promise(r => setTimeout(r, 500));
            }
        }

        if (workDone) {
            console.log('[Sync] Batch sync completed.');
        }
    }

    /**
     * Synchronizes a specific score (PDF and/or JSON data).
     */
    async syncScore(fingerprint, needsPDF, needsJSON) {
        try {
            const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            if (!score) return;

            // 1. Handle PDF if missing from Drive
            if (needsPDF) {
                const pdfKey = `score_buf_${fingerprint}`;
                const pdfData = await db.get(pdfKey);
                if (pdfData) {
                    console.log(`[Sync] -> ${score.title}: PDF missing on Drive. Starting background upload...`);
                    await this.uploadPDF(fingerprint, pdfData, score.title || 'Unknown');
                } else {
                    // Graceful skip if PDF is missing locally to avoid log spam
                    console.warn(`[Sync] -> ${score.title}: Local PDF buffer (key: ${pdfKey}) not found. Skipping background backup.`);
                }
            }

            // 2. Handle JSON (Annotations) if unsynced
            if (needsJSON) {
                console.log(`[Sync] -> ${score.title}: Pushing annotations...`);

                const data = await this.gatherLocalData(fingerprint);
                const prefix = this.safeTitle(score.title);
                const fileName = `${prefix}sync_${fingerprint}.json`;
                const fileId = await this.findSyncFile(fingerprint, 'sync');

                if (fileId) {
                    await this.updateFile(fileId, data);
                } else {
                    await this.createFile(fileName, data);
                    const newId = await this.findSyncFile(fingerprint, 'sync');
                    if (newId) {
                        await this.updateManifestEntry(fingerprint, { syncId: newId, name: prefix.replace(/_$/, '') });
                    }
                }
                score.isSynced = true;
                console.log(`[Sync] -> ${score.title}: Annotations pushed.`);
            }

            this.updateCloudStatsUI();

        } catch (err) {
            console.error(`[Sync] Failed to sync score ${fingerprint}:`, err);
        }
    }

    /**
     * Robustly gathers all data for a score from various storage locations.
     */
    async gatherLocalData(fp) {
        // 1. Stamps (LocalStorage)
        let stamps = [];
        try {
            const stampsRaw = localStorage.getItem(`scoreflow_stamps_${fp}`);
            stamps = stampsRaw ? JSON.parse(stampsRaw) : [];
        } catch (e) { console.error('Failed to parse stamps for sync', e); }

        // 2. Bookmarks (IndexedDB)
        const bookmarks = await db.get(`bookmarks_${fp}`) || [];

        // 3. Score Detail (LocalStorage)
        let scoreDetail = null;
        try {
            const detailRaw = localStorage.getItem(`scoreflow_detail_${fp}`);
            scoreDetail = detailRaw ? JSON.parse(detailRaw) : null;
        } catch (e) { console.error('Failed to parse detail for sync', e); }

        return {
            stamps: stamps,
            bookmarks: bookmarks,
            sources: this.app.sources || [],
            layers: this.app.layers || [],
            scoreDetail: scoreDetail,
            version: Date.now(),
            fingerprint: fp
        };
    }

    /**
     * Push local changes to Drive.
     * @param {number} remoteVersion - The version currently on drive to prevent overwriting.
     */
    async push(remoteVersion = 0) {
        if (!this.folderId) return;

        this.uploadStatus.json.active = true;
        this.updateCloudStatsUI();

        try {
            const fingerprint = this.app.pdfFingerprint;
            if (!fingerprint) return;

            const score = this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint);
            if (score && score.isSynced && remoteVersion <= (this.lastSyncTime || 0)) {
                // Heartbeat log only in console
                console.log(`[DriveSync] Score ${score.title} is already synced. Skipping push.`);
                return;
            }

            // Show UI log ONLY if we are actually pushing
            this.addLog(`正在同步當前樂譜: ${score.title}`, 'system');

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

            let activeSyncId = fileId;
            if (activeSyncId) {
                await this.updateFile(activeSyncId, data);
            } else {
                await this.createFile(fileName, data);
                activeSyncId = await this.findSyncFile(fingerprint, 'sync');
            }

            // Update Manifest
            await this.updateManifestEntry(fingerprint, {
                syncId: activeSyncId,
                name: prefix.replace(/_$/, '')
            });

            const logMsg = `已上傳: ${stampsCount} 劃記, ${bookmarksCount} 書籤, ${sourcesCount} 詮釋`;
            this.addLog(logMsg, 'success');
            this.lastSyncTime = data.version;

            // Update Library UI
            this.app.scoreManager?.updateSyncStatus(fingerprint, true);
        } catch (err) {
            console.error('[DriveSync] Push failed:', err);
            this.addLog('上傳資料失敗: ' + err.message, 'error');
        } finally {
            this.uploadStatus.json.active = false;
            this.updateCloudStatsUI();
        }
    }

    /**
     * Debounced push for rapid fire changes (like drawing).
     */
    pushDebounce(remoteVersion = 0) {
        if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
        this.pushDebounceTimer = setTimeout(() => {
            this.push(remoteVersion);
        }, 2000); // 2 second delay
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
                    this.app.scoreDetailManager.save(fingerprint); // Persist to local storage
                    this.app.scoreDetailManager.render(fingerprint);

                    // CRITICAL: Sync with Library Registry
                    if (this.app.scoreManager && remoteData.scoreDetail.name) {
                        await this.app.scoreManager.updateMetadata(fingerprint, {
                            title: remoteData.scoreDetail.name,
                            composer: remoteData.scoreDetail.composer || 'Unknown'
                        });
                    }

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
        // Use name = '...' for exact match if possible, but since we have prefix, we use contains or prefix search
        const keyword = type === 'pdf' ? `pdf_${fingerprint}` : `sync_${fingerprint}`;
        const response = await this.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name contains '${keyword}' and '${this.folderId}' in parents and trashed=false&fields=files(id,name)&orderBy=createdTime desc`
        );
        const data = await response.json();
        return data.files && data.files.length > 0 ? data.files[0].id : null;
    }

    /**
     * Finds a file by its exact name in the sync folder.
     */
    async findFileByName(fileName) {
        if (!this.folderId) return null;
        const response = await this.gdriveFetch(
            `https://www.googleapis.com/drive/v3/files?q=name = '${fileName}' and '${this.folderId}' in parents and trashed=false&fields=files(id,name)`
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

    async loadManifest() {
        if (!this.folderId) return;
        try {
            const fileName = 'cloud_manifest.json';
            const fileId = await this.findFileByName(fileName);
            if (fileId) {
                this.manifestFileId = fileId;
                this.manifest = await this.getFileContent(fileId);
                console.log('[DriveSync] Manifest loaded:', Object.keys(this.manifest).length, 'entries');
                return true;
            }
        } catch (err) {
            console.warn('[DriveSync] Failed to load manifest:', err);
        }
        return false;
    }

    async saveManifest() {
        if (!this.folderId || this.isManifestSaving) return;
        this.isManifestSaving = true;
        try {
            const fileName = 'cloud_manifest.json';
            const content = this.manifest;

            // Double check fileId or existence before creating
            if (!this.manifestFileId) {
                this.manifestFileId = await this.findFileByName(fileName);
            }

            if (this.manifestFileId) {
                await this.updateFile(this.manifestFileId, content);
            } else {
                await this.createFile(fileName, content);
                // Re-find to get ID for next time
                this.manifestFileId = await this.findFileByName(fileName);
            }
        } catch (err) {
            console.error('[DriveSync] Failed to save manifest:', err);
        } finally {
            this.isManifestSaving = false;
        }
    }

    async updateManifestEntry(fingerprint, data) {
        if (!this.manifest) this.manifest = {};

        // Merge with existing data to prevent accidental field deletion
        this.manifest[fingerprint] = {
            ...this.manifest[fingerprint],
            ...data,
            updated: Date.now()
        };

        // Safety: If name is still missing but we have it locally in registry, fill it
        if (!this.manifest[fingerprint].name && this.app.scoreManager) {
            const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            if (score && score.title && score.title !== 'Unknown') {
                this.manifest[fingerprint].name = this.safeTitle(score.title).replace(/_$/, '');
            }
        }

        await this.saveManifest();
    }

    /**
     * Delete a score entry from the cloud manifest.
     */
    async deleteManifestEntry(fingerprint) {
        if (!this.manifest || !this.manifest[fingerprint]) return;
        delete this.manifest[fingerprint];
        await this.saveManifest();
        console.log(`[DriveSync] Entry ${fingerprint} deleted from manifest.`);
    }

    /**
     * Delete both PDF and Sync JSON files for a specific fingerprint from Drive.
     */
    async deleteSyncFiles(fingerprint) {
        if (!this.folderId) return;

        try {
            const pdfId = await this.findSyncFile(fingerprint, 'pdf');
            const syncId = await this.findSyncFile(fingerprint, 'sync');

            if (pdfId) {
                await this.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${pdfId}`, { method: 'DELETE' });
                console.log(`[DriveSync] Cloud PDF ${pdfId} deleted.`);
            }
            if (syncId) {
                await this.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${syncId}`, { method: 'DELETE' });
                console.log(`[DriveSync] Cloud Sync JSON ${syncId} deleted.`);
            }
        } catch (err) {
            console.error(`[DriveSync] Failed to delete cloud files for ${fingerprint}:`, err);
        }
    }

    /**
     * Forces a full rebuild of the manifest by deleting the old one and scanning.
     */
    async resetCloudIndex() {
        if (!this.isEnabled || !this.accessToken) return;

        const confirmed = await this.app.showDialog({
            title: '重置雲端索引',
            message: '這將刪除雲端索引檔並重新掃描資料夾中的 PDF 與劃記檔案。這通常用於修復「Broken Sync」問題。確定要繼續嗎？',
            type: 'confirm',
            icon: '🔄'
        });

        if (!confirmed) return;

        try {
            this.addLog('正在執行雲端索引重置...', 'system');

            // Delete manifest file from Drive
            if (!this.manifestFileId) {
                this.manifestFileId = await this.findFileByName('cloud_manifest.json');
            }

            if (this.manifestFileId) {
                await this.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${this.manifestFileId}`, { method: 'DELETE' });
                this.manifestFileId = null;
            }

            // Clear local manifest
            this.manifest = {};
            this.hasScanned = false; // Force re-scan

            // Re-scan
            await this.scanRemoteSyncFiles();

            this.addLog('雲端索引重置完成', 'success');
            if (this.app.showMessage) this.app.showMessage('雲端索引已重置並完成掃描', 'success');
        } catch (err) {
            console.error('[DriveSync] Index reset failed:', err);
            this.addLog('索引重置失敗: ' + err.message, 'error');
        }
    }

    /**
     * Scans the sync folder for files matching the fingerprint pattern
     * and updates the ScoreManager registry.
     */
    async scanRemoteSyncFiles() {
        if (!this.folderId || !this.app.scoreManager) return;

        try {
            this.addLog('正在同步雲端清單...', 'system');

            // 1. Try to load manifest
            let hasManifest = await this.loadManifest();
            if (!this.manifest) this.manifest = {};

            // 2. Scan Drive for files to Rebuild (if no manifest) or Self-Heal (if manifest exists but missing names)
            this.addLog(hasManifest ? '正在掃描雲端檔案並檢查索引完整性...' : '正在重建雲端索引 (首次運行)...', 'system');

            const response = await this.gdriveFetch(
                `https://www.googleapis.com/drive/v3/files?q='${this.folderId}' in parents and (name contains 'sync_' or name contains 'pdf_') and trashed=false&fields=files(id,name)`
            );
            const data = await response.json();

            let manifestChanged = !hasManifest;
            if (data.files) {
                data.files.forEach(f => {
                    const syncMatch = f.name.match(/(?:^|_)sync_([^_].+)\.json$/);
                    const pdfMatch = f.name.match(/(?:^|_)pdf_([^_].+)\.pdf$/);

                    if (syncMatch) {
                        const fp = syncMatch[1];
                        if (!this.manifest[fp]) {
                            this.manifest[fp] = {};
                            manifestChanged = true;
                        }

                        // Self-Heal: Recover syncId if missing
                        if (this.manifest[fp].syncId !== f.id) {
                            this.manifest[fp].syncId = f.id;
                            manifestChanged = true;
                        }

                        // Self-Heal: Recover name from filename if missing or generic
                        if (!this.manifest[fp].name || this.manifest[fp].name === 'Unknown') {
                            const fileNamePart = f.name.split('_sync_')[0];
                            if (fileNamePart && fileNamePart !== 'sync') {
                                this.manifest[fp].name = fileNamePart;
                                manifestChanged = true;
                            }
                        }
                    } else if (pdfMatch) {
                        const fp = pdfMatch[1];
                        if (!this.manifest[fp]) {
                            this.manifest[fp] = {};
                            manifestChanged = true;
                        }

                        // Self-Heal: Recover pdfId if missing
                        if (this.manifest[fp].pdfId !== f.id) {
                            this.manifest[fp].pdfId = f.id;
                            manifestChanged = true;
                        }

                        // Self-Heal: Recover name from filename if missing
                        if (!this.manifest[fp].name || this.manifest[fp].name === 'Unknown') {
                            const fileNamePart = f.name.split('_pdf_')[0];
                            if (fileNamePart && fileNamePart !== 'pdf') {
                                this.manifest[fp].name = fileNamePart;
                                manifestChanged = true;
                            }
                        }
                    }
                });
            }

            if (manifestChanged) {
                console.log('[DriveSync] Manifest healed/updated during scan.');
                await this.saveManifest();
            }

            // 3. Update Library UI based on manifest
            const remoteJSONMap = this.manifest;
            let pdfCount = 0;
            let syncCount = 0;

            Object.values(this.manifest).forEach(entry => {
                if (entry.syncId) syncCount++;
                if (entry.pdfId) pdfCount++;
            });

            this.cloudStats.totalAnnotations = syncCount;
            this.cloudStats.totalPDFs = pdfCount;
            this.updateCloudStatsUI();

            let registryChanged = false;
            let foundCount = 0;
            let newCloudOnlyCount = 0;

            // Mark local registry based on manifest
            for (const score of this.app.scoreManager.registry) {
                const entry = this.manifest[score.fingerprint];
                const isSynced = !!(entry && entry.syncId);
                const isPdfAvailable = !!(entry && entry.pdfId);

                let changed = false;
                if (score.isSynced !== isSynced) {
                    score.isSynced = isSynced;
                    changed = true;
                }
                if (score.isPdfAvailable !== isPdfAvailable) {
                    score.isPdfAvailable = isPdfAvailable;
                    changed = true;
                }

                if (changed) {
                    registryChanged = true;
                    foundCount++;
                }
            }

            // Add cloud-only placeholders for ALL manifest entries not yet in the local registry.
            // Previously this only ran when entry.syncId existed, which caused PDFs uploaded
            // without a corresponding sync JSON to be counted in cloud stats but silently
            // excluded from the library — the source of the data mismatch.
            for (const [fp, entry] of Object.entries(this.manifest)) {
                if (!entry.syncId && !entry.pdfId) continue; // Skip completely empty entries

                // For pdfId-only entries with no name, skip — no meaningful data to show
                if (!entry.syncId && !entry.name) continue;

                const exists = this.app.scoreManager.registry.find(s => s.fingerprint === fp);
                if (!exists) {
                    // Robust fallback title: name > FP prefix
                    const fallbackTitle = entry.name || `雲端 PDF (${fp.slice(0, 8)})`;

                    const placeholder = {
                        fingerprint: fp,
                        title: fallbackTitle,
                        fileName: '',
                        composer: 'Unknown',
                        thumbnail: null,
                        dateImported: 0,     // Sort to bottom — don't displace user's recent scores
                        lastAccessed: 0,     // Sort to bottom
                        tags: [],
                        isSynced: !!entry.syncId,
                        isCloudOnly: true,
                        isPdfAvailable: !!entry.pdfId
                    };
                    this.app.scoreManager.registry.push(placeholder);
                    registryChanged = true;
                    newCloudOnlyCount++;

                    if (entry.syncId && !entry.name) {
                        this.fetchCloudScoreDetails(entry.syncId, fp);
                    }
                }
            }

            if (registryChanged) {
                await this.app.scoreManager.saveRegistry();
                this.app.scoreManager.render();
            }

            this.addLog(`掃描完成: 索引中共有 ${syncCount} 份備份`, 'success');

        } catch (err) {
            console.error('[DriveSync] Manifest sync failed:', err);
            this.addLog('雲端索引同步失敗', 'error');
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
    /**
     * Upload a PDF file to Google Drive using the Resumable Upload protocol.
     * This supports files larger than 5MB and is more robust.
     */
    async uploadPDF(fingerprint, buffer, originalFileName) {
        if (!this.folderId) return;

        const fileId = await this.findSyncFile(fingerprint, 'pdf');
        if (fileId) {
            console.log(`[DriveSync] PDF for ${fingerprint} already exists on Drive. Updating manifest.`);
            if (!this.manifest[fingerprint]) this.manifest[fingerprint] = {};
            this.manifest[fingerprint].pdfId = fileId;
            await this.saveManifest();
            return;
        }

        const scoreEntry = this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint);
        const prefix = this.safeTitle(scoreEntry?.title || originalFileName?.replace(/\.pdf$/i, ''));
        const fileName = `${prefix}pdf_${fingerprint}.pdf`;

        console.log(`[DriveSync] Uploading PDF ${fileName} (Resumable)...`);
        this.addLog(`準備上傳大檔案: ${originalFileName}...`, 'system');

        try {
            // STEP 1: Initiate Resumable Session
            const metadata = {
                name: fileName,
                parents: [this.folderId],
                mimeType: 'application/pdf'
            };

            const initiateResp = await this.gdriveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
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
                        await this.updateManifestEntry(fingerprint, { pdfId: recoveredId, name: prefix });
                        this.addLog(`檢測到衝突: PDF 已在雲端，索引已同步。`, 'success');
                        return;
                    }
                }
                const errText = await initiateResp.text();
                throw new Error(`Failed to initiate upload: ${initiateResp.status} ${errText}`);
            }

            // Get the Session URI from Location header
            const location = initiateResp.headers.get('Location');
            if (!location) throw new Error('No upload location received');

            // STEP 2: Upload the actual data
            this.addLog(`正在傳送二進位數據 (${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB)...`, 'system');

            this.uploadStatus.pdf.active = true;
            this.uploadStatus.pdf.loaded = 0;
            this.uploadStatus.pdf.total = buffer.byteLength;
            this.uploadStatus.pdf.fileName = originalFileName;
            this.updateCloudStatsUI();

            const uploadPromise = new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('PUT', location, true);
                xhr.setRequestHeader('Content-Type', 'application/pdf');

                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        this.uploadStatus.pdf.loaded = e.loaded;
                        this.uploadStatus.pdf.total = e.total;
                        this.updateCloudStatsUI();
                    }
                };

                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        resolve();
                    } else {
                        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`));
                    }
                };

                xhr.timeout = 60000; // 60s timeout for large PDF uploads
                xhr.ontimeout = () => reject(new Error('PDF upload timed out (60s limit).'));
                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.send(buffer);
            });

            await uploadPromise;

            // Update Manifest
            const prefix = this.safeTitle(originalFileName).replace(/_$/, '');
            const finalPdfId = await this.findSyncFile(fingerprint, 'pdf');

            await this.updateManifestEntry(fingerprint, {
                pdfId: finalPdfId,
                name: prefix
            });

            this.addLog(`樂譜檔案 ${originalFileName} 備份成功`, 'success');
            if (this.app.showMessage) this.app.showMessage(`雲端備份成功: ${originalFileName}`, 'success');

            // Update local stats UI immediately so pending count decreases
            this.updateCloudStatsUI();

            // Update Library UI to show the synced status
            if (this.app.scoreManager) {
                this.app.scoreManager.updateSyncStatus(fingerprint, true);
            }
        } catch (err) {
            console.error('[DriveSync] Resumable PDF upload failed:', err);
            this.addLog(`樂譜二進位檔案備份失敗: ${err.message}`, 'error');
            if (this.app.showMessage) this.app.showMessage('雲端備份失敗', 'error');
        } finally {
            this.uploadStatus.pdf.active = false;
            this.updateCloudStatsUI();
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
