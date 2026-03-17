import * as db from '../db.js';

/**
 * DriveAuthManager handles Google Identity Services auth, UI updates,
 * logging, and the auto-sync timer.
 * Uses this.sync (DriveSyncManager) to access shared state.
 */
export class DriveAuthManager {
    constructor(sync) {
        this.sync = sync;
    }

    /**
     * Initialize Google Identity Services.
     */
    init() {
        // Restore enabled state early for UI consistency
        if (localStorage.getItem('scoreflow_drive_sync_enabled') === 'true') {
            this.sync.isEnabled = true;
            this.refreshUI();
        }

        if (typeof google === 'undefined') {
            console.warn('[DriveSync] Google Identity Services not loaded yet. Retrying in 500ms...');
            setTimeout(() => this.init(), 500);
            return;
        }

        if (this.sync.tokenClient) {
            console.log('[DriveSync] Token client already initialized.');
            return;
        }

        this.sync.tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: this.sync.clientId,
            scope: this.sync.scopes,
            callback: async (response) => {
                this.sync.isAuthenticating = false;
                if (this.sync.authTimeout) {
                    clearTimeout(this.sync.authTimeout);
                    this.sync.authTimeout = null;
                }

                if (response.error !== undefined) {
                    this.sync.silentAttemptCount++;
                    console.error('[DriveSync] Auth error:', response.error);

                    if (response.error === 'immediate_failed') {
                        this.addLog('背景連線過期，請點擊「連接」重新授權', 'warn');
                        // DO NOT set isEnabled = false here. 
                        // Keep it true so the user can just click "Sign In" again.
                    } else {
                        this.addLog(`授權發生錯誤: ${response.error}`, 'error');
                        // For other errors, we might still want to stay enabled but show a warning
                    }

                    this.sync.accessToken = null;
                    this.refreshUI();
                    return;
                }

                // Success!
                const tokenMs = Date.now() - (this.sync._authStartTime || Date.now());
                this.sync.silentAttemptCount = 0;
                this.sync.accessToken = response.access_token;
                this.sync.isEnabled = true;
                localStorage.setItem('scoreflow_drive_sync_enabled', 'true');

                if (response.expires_in) {
                    const expiry = Date.now() + (response.expires_in * 1000);
                    localStorage.setItem('scoreflow_drive_access_token', response.access_token);
                    localStorage.setItem('scoreflow_drive_token_expiry', expiry.toString());
                    console.log(`[DriveSync] ✅ Token acquired in ${tokenMs}ms, expires in ${Math.round(response.expires_in / 60)} min`);
                } else {
                    console.log(`[DriveSync] ✅ Token acquired in ${tokenMs}ms`);
                }

                if (response.login_hint) {
                    localStorage.setItem('scoreflow_drive_user_hint', response.login_hint);
                }

                this.addLog('已取得存取權限', 'success');

                try {
                    console.log('[DriveSync] 📁 Setting up sync folders...');
                    const folderStart = Date.now();
                    this.sync.folderId = await this.sync.findOrCreateSyncFolder();
                    console.log(`[DriveSync] 📁 Folders ready in ${Date.now() - folderStart}ms — root:${this.sync.folderId?.slice(-6)} pdfs:${this.sync.pdfsFolderId?.slice(-6)} annot:${this.sync.annotationsFolderId?.slice(-6)}`);
                } catch (err) {
                    console.error('[DriveSync] ❌ Folder setup failed:', err);
                }

                this.sync.log.record('signin', `user: ${this.sync.app?.profileManager?.data?.userName || 'Guest'}`);
                this.refreshUI();
                console.log('[DriveSync] 🔄 Starting auto-sync...');
                this.startAutoSync();
            },
        });

        // Restore state — attempt silent reconnect if was previously enabled
        if (localStorage.getItem('scoreflow_drive_sync_enabled') === 'true') {
            const savedToken = localStorage.getItem('scoreflow_drive_access_token');
            const expiryStr = localStorage.getItem('scoreflow_drive_token_expiry');
            const now = Date.now();

            if (savedToken && expiryStr && (parseInt(expiryStr) > (now + 300000))) {
                console.log('[DriveSync] Restoring persisted access token.');
                this.sync.accessToken = savedToken;
                this.sync.isEnabled = true;

                this.sync.findOrCreateSyncFolder().then(id => {
                    this.sync.folderId = id;
                    this.refreshUI();
                    this.startAutoSync();
                }).catch(e => console.error(e));
            } else {
                const hasHint = !!localStorage.getItem('scoreflow_drive_user_hint');
                console.log('[DriveSync] Token expired or missing. Attempting silent reconnect...');
                this.sync.isEnabled = true;
                if (hasHint) {
                    this.signIn(true);
                } else {
                    this.startAutoSync();
                }
            }
        }
        this.refreshUI();
    }

    /**
     * Unified fetch wrapper for Google Drive API with automatic 401 retry.
     */
    async gdriveFetch(url, options = {}) {
        if (!this.sync.accessToken) {
            throw new Error('No access token available');
        }

        options.headers = options.headers || {};
        options.headers['Authorization'] = `Bearer ${this.sync.accessToken}`;

        let response = await fetch(url, options);

        if (response.status === 401) {
            console.warn('[DriveSync] Token expired (401), attempting silent refresh...');
            try {
                await this.signIn(true);
                options.headers['Authorization'] = `Bearer ${this.sync.accessToken}`;
                return await fetch(url, options);
            } catch (err) {
                console.error('[DriveSync] Silent refresh failed during fetch:', err);
                this.sync.isEnabled = false;
                this.sync.accessToken = null;
                this.refreshUI();
                throw err;
            }
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
            if (this.sync.isEnabled && this.sync.accessToken) {
                badge.textContent = this.sync.isPaused ? '同步暫停' : '同步中';
                badge.className = this.sync.isPaused ? 'badge badge-warn' : 'badge badge-success';
                if (infoBox) infoBox.classList.remove('hidden');
            } else if (this.sync.isEnabled && !this.sync.accessToken) {
                // isEnabled but no token = silent reconnect in progress
                badge.textContent = '連線中...';
                badge.className = 'badge badge-warn';
                if (infoBox) infoBox.classList.add('hidden');
            } else {
                badge.textContent = '已中斷';
                badge.className = 'badge badge-error';
                if (infoBox) infoBox.classList.add('hidden');
            }
        }

        const btnPause = document.getElementById('btn-drive-pause');
        if (btnPause) {
            btnPause.classList.toggle('hidden', !(this.sync.isEnabled && this.sync.accessToken));
            btnPause.textContent = this.sync.isPaused ? '恢復自動同步' : '暫停自動同步';
            btnPause.classList.toggle('btn-outline-sm', !this.sync.isPaused);
            btnPause.classList.toggle('btn-primary-sm', this.sync.isPaused);
        }

        if (btnSignIn && btnSignOut) {
            const fullyConnected = !!(this.sync.isEnabled && this.sync.accessToken);
            const reconnecting = this.sync.isEnabled && !this.sync.accessToken;
            btnSignIn.classList.toggle('hidden', fullyConnected || reconnecting);
            btnSignOut.classList.toggle('hidden', !fullyConnected);
        }

        if (this.sync.lastSyncTime > 0) {
            const timeEl = document.getElementById('drive-last-sync-time');
            if (timeEl) {
                const date = new Date(this.sync.lastSyncTime);
                timeEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
        }

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

        const isCloudReady = this.sync.isEnabled && this.sync.accessToken;

        if (statsAnnos) statsAnnos.textContent = isCloudReady ? (this.sync.cloudStats?.totalAnnotations ?? '...') : '-';
        if (statsPdfs) statsPdfs.textContent = isCloudReady ? (this.sync.cloudStats?.totalPDFs ?? '...') : '-';

        if (isCloudReady) {
            const pending = this.calculateLocalPendingSync();
            if (statsPendingJson) statsPendingJson.textContent = pending.json;
            if (statsPendingPdf) statsPendingPdf.textContent = pending.pdf;

            if (statsProgressJson) {
                statsProgressJson.classList.toggle('hidden', !this.sync.uploadStatus.json.active);
            }
            if (statsProgressPdf) {
                if (this.sync.uploadStatus.pdf.active) {
                    statsProgressPdf.classList.remove('hidden');
                    if (statsFilenamePdf) {
                        statsFilenamePdf.classList.remove('hidden');
                        statsFilenamePdf.textContent = `正在上傳: ${this.sync.uploadStatus.pdf.fileName || '...'}`;
                    }
                    if (this.sync.uploadStatus.pdf.total > 0) {
                        const pct = Math.round((this.sync.uploadStatus.pdf.loaded / this.sync.uploadStatus.pdf.total) * 100);
                        const mbLoaded = (this.sync.uploadStatus.pdf.loaded / 1024 / 1024).toFixed(1);
                        const mbTotal = (this.sync.uploadStatus.pdf.total / 1024 / 1024).toFixed(1);
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
                folderEl.textContent = this.sync.folderId ? '已對接' : '初始化中...';
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
        if (!this.sync.app.scoreManager) return { json: 0, pdf: 0 };

        let pendingJson = 0;
        let pendingPdf = 0;

        this.sync.app.scoreManager.registry.forEach(score => {
            if (score.isCloudOnly) return;
            const entry = this.sync.manifest[score.fingerprint];
            if (!entry || !entry.pdfId) pendingPdf++;
            if (!score.isSynced) pendingJson++;
        });

        return { json: pendingJson, pdf: pendingPdf };
    }

    /**
     * Re-scans the cloud folder to update statistics.
     */
    async refreshCloudStats() {
        if (!this.sync.isEnabled || !this.sync.accessToken) return;
        await this.sync.scanRemoteSyncFiles();
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

        while (logContainer.children.length > 30) {
            logContainer.lastChild.remove();
        }
    }

    /**
     * Request access token.
     * @param {boolean} isSilent If true, attempts silent sign-in without prompt.
     */
    async signIn(isSilent = false) {
        if (!this.sync.tokenClient) {
            this.addLog('正在嘗試重新初始化 Google 服務...', 'system');
            this.init();
        }
        if (!this.sync.tokenClient) {
            this.addLog('Google 授權組件尚未就緒，請稍後再試', 'error');
            throw new Error('Google Identity Services not ready');
        }

        if (this.sync.isAuthenticating) {
            console.log('[DriveSync] Auth already in progress, skipping.');
            return;
        }

        if (isSilent) {
            const now = Date.now();
            if (this.sync.silentAttemptCount >= 3 && (now - this.sync.lastSilentAttempt) < 300000) {
                console.warn('[DriveSync] Too many silent auth failures, cooling down.');
                throw new Error('Too many silent auth failures');
            }
            this.sync.lastSilentAttempt = now;
        }

        this.sync.isAuthenticating = true;

        return new Promise((resolve, reject) => {
            const originalCallback = this.sync.tokenClient.callback;
            this.sync.tokenClient.callback = async (response) => {
                this.sync.tokenClient.callback = originalCallback;
                this.sync.isAuthenticating = false;
                if (this.sync.authTimeout) {
                    clearTimeout(this.sync.authTimeout);
                    this.sync.authTimeout = null;
                }

                await originalCallback(response);

                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.access_token);
                }
            };

            this.sync.authTimeout = setTimeout(() => {
                this.sync.tokenClient.callback = originalCallback;
                this.sync.isAuthenticating = false;
                this.sync.authTimeout = null;
                reject(new Error('Auth Timeout'));
            }, 30000);

            try {
                const shouldLog = !isSilent || this.sync.silentAttemptCount === 0 || (Date.now() - this.sync.lastSilentAttempt > 60000);
                if (shouldLog) {
                    this.addLog(isSilent ? '正在背景連線...' : '正在請求授權...', 'system');
                }

                const options = isSilent ? {
                    prompt: '',
                    hint: localStorage.getItem('scoreflow_drive_user_hint') || ''
                } : { prompt: 'select_account' };

                this.sync._authStartTime = Date.now();
                console.log(`[DriveSync] 🔑 requestAccessToken called (${isSilent ? 'silent' : 'interactive'}) at ${new Date().toLocaleTimeString()}`);
                this.sync.tokenClient.requestAccessToken(options);
            } catch (err) {
                this.sync.tokenClient.callback = originalCallback;
                this.sync.isAuthenticating = false;
                if (this.sync.authTimeout) {
                    clearTimeout(this.sync.authTimeout);
                    this.sync.authTimeout = null;
                }
                if (isSilent) this.sync.silentAttemptCount++;
                console.error('[DriveSync] Sign-in request failed:', err);
                reject(err);
            }
        });
    }

    togglePauseSync() {
        this.sync.isPaused = !this.sync.isPaused;
        const msg = this.sync.isPaused ? '自動同步已暫停 (保持連線中)' : '自動同步已恢復';
        this.addLog(msg, this.sync.isPaused ? 'warn' : 'success');
        if (this.sync.app.showMessage) this.sync.app.showMessage(msg, this.sync.isPaused ? 'system' : 'success');
        this.refreshUI();
    }

    signOut() {
        this.addLog('已斷開 Google Drive 連線', 'warn');
        this.sync.log.record('signout', `user: ${this.sync.app?.profileManager?.data?.userName || 'Guest'}`);
        this.sync.log.flush().catch(() => {});
        if (this.sync.accessToken) {
            google.accounts.oauth2.revoke(this.sync.accessToken, () => {
                console.log('[DriveSync] Token revoked.');
            });
        }
        this.sync.accessToken = null;
        this.sync.folderId = null;
        this.sync.isEnabled = false;
        this.stopAutoSync();
        localStorage.setItem('scoreflow_drive_sync_enabled', 'false');
        localStorage.removeItem('scoreflow_drive_access_token');
        localStorage.removeItem('scoreflow_drive_token_expiry');
        localStorage.removeItem('scoreflow_drive_folder_ids_v3');
        this.refreshUI();
    }

    /**
     * Copy current access token to clipboard for LAN debugging.
     */
    async copyTokenToClipboard() {
        if (!this.sync.accessToken) {
            this.addLog('請先連線以取得 Token', 'warn');
            return;
        }
        try {
            await navigator.clipboard.writeText(this.sync.accessToken);
            this.addLog('Token 已拷貝至剪貼簿', 'success');
            if (this.sync.app.showMessage) this.sync.app.showMessage('Token copied!', 'success');
        } catch (err) {
            console.error('Clipboard failed:', err);
            this.addLog('拷貝失敗，請手動複製 console 中的 Token', 'error');
            console.log('[DriveSync] Current Token:', this.sync.accessToken);
        }
    }

    /**
     * Manually apply an access token (for LAN debugging).
     */
    async applyManualToken(token) {
        if (!token || token.trim().length < 20) {
            this.addLog('無效的 Token 格式', 'error');
            return;
        }

        const cleanToken = token.trim();
        this.sync.accessToken = cleanToken;
        this.sync.isEnabled = true;
        
        // Save to local storage with a 1-hour default expiry
        const expiry = Date.now() + (3600 * 1000);
        localStorage.setItem('scoreflow_drive_sync_enabled', 'true');
        localStorage.setItem('scoreflow_drive_access_token', cleanToken);
        localStorage.setItem('scoreflow_drive_token_expiry', expiry.toString());

        this.addLog('手動 Token 已套用', 'success');
        if (this.sync.app.showMessage) this.sync.app.showMessage('Manual token applied!', 'success');

        try {
            this.sync.folderId = await this.sync.findOrCreateSyncFolder();
            this.refreshUI();
            this.startAutoSync();
        } catch (err) {
            console.error('[DriveSync] Folder setup with manual token failed:', err);
            this.addLog('資料夾對接失敗', 'error');
        }
    }

    startAutoSync() {
        this.stopAutoSync();
        this.sync.syncTimer = setInterval(() => this.sync.sync(), this.sync.syncInterval);

        if (!this.sync.isSyncing) {
            this.sync.sync();
        }

        this.prefetchPinnedScores();
    }

    async prefetchPinnedScores() {
        const registry = this.sync.app.scoreManager?.registry;
        if (!registry) return;
        const pinned = registry.filter(s => s.storageMode === 'pinned');
        for (const score of pinned) {
            const hasLocal = await db.get(`score_buf_${score.fingerprint}`);
            if (!hasLocal) {
                await this.sync.downloadAndCacheScore(score.fingerprint);
            }
        }
    }

    stopAutoSync() {
        if (this.sync.syncTimer) {
            clearInterval(this.sync.syncTimer);
            this.sync.syncTimer = null;
        }
    }

    /**
     * Checks if the cloud has been reset by another device.
     */
    async checkGlobalReset() {
        const remoteResetTime = this.sync.manifest?.globalResetTime;
        if (!remoteResetTime) return;

        const localAckReset = parseInt(localStorage.getItem('scoreflow_last_global_reset') || '0');

        if (remoteResetTime > localAckReset) {
            console.warn('[DriveSync] Global Reset Detected! Clearing local sync state...');
            this.addLog('偵測到雲端已由其他設備重置，正在重置本地同步標記...', 'warn');

            if (this.sync.app.scoreManager?.registry) {
                this.sync.app.scoreManager.registry.forEach(s => {
                    s.isSynced = false;
                    delete s.cloudDataPulled;
                });
                if (typeof this.sync.app.scoreManager.saveRegistry === 'function') {
                    await this.sync.app.scoreManager.saveRegistry();
                } else {
                    console.error('[DriveSync] ScoreManager.saveRegistry is not a function!');
                }
            }

            localStorage.setItem('scoreflow_last_global_reset', remoteResetTime.toString());

            if (this.sync.app.showMessage) {
                this.sync.app.showMessage('雲端數據已重置，本地同步已暫停。', 'info');
            }

            this.sync.isPaused = true;
            this.refreshUI();
            this.sync.app.scoreManager?.render();
        }
    }
}
