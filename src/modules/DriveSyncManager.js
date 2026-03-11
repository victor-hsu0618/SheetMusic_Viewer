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
        this.lastSyncRequest = 0;
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

            try {
                // Use the new Promise-based signIn (silent)
                await this.signIn(true);
                
                // Retry with new token
                options.headers['Authorization'] = `Bearer ${this.accessToken}`;
                return await fetch(url, options);
            } catch (err) {
                console.error('[DriveSync] Silent refresh failed during fetch:', err);
                this.isEnabled = false;
                this.accessToken = null;
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
     * @param {boolean} isSilent If true, attempts silent sign-in without prompt.
     * @returns {Promise<string>} Access token or rejects with error.
     */
    async signIn(isSilent = false) {
        if (!this.tokenClient) {
            this.addLog('正在嘗試重新初始化 Google 服務...', 'system');
            this.init();
        }
        if (!this.tokenClient) {
            this.addLog('Google 授權組件尚未就緒，請稍後再試', 'error');
            throw new Error('Google Identity Services not ready');
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
                throw new Error('Too many silent auth failures');
            }
            this.lastSilentAttempt = now;
        }

        this.isAuthenticating = true;

        return new Promise((resolve, reject) => {
            // Setup a one-time wrapper for the callback
            const originalCallback = this.tokenClient.callback;
            this.tokenClient.callback = async (response) => {
                // Restore original callback
                this.tokenClient.callback = originalCallback;
                this.isAuthenticating = false;
                if (this.authTimeout) {
                    clearTimeout(this.authTimeout);
                    this.authTimeout = null;
                }

                // Handle standard callback logic (setting this.accessToken, etc.)
                await originalCallback(response);

                if (response.error) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.access_token);
                }
            };

            // Set a safety timeout
            this.authTimeout = setTimeout(() => {
                this.tokenClient.callback = originalCallback;
                this.isAuthenticating = false;
                this.authTimeout = null;
                reject(new Error('Auth Timeout'));
            }, 30000);

            try {
                // Only log if not too frequent or if manual
                const shouldLog = !isSilent || this.silentAttemptCount === 0 || (Date.now() - this.lastSilentAttempt > 60000);
                if (shouldLog) {
                    this.addLog(isSilent ? '正在背景連線...' : '正在請求授權...', 'system');
                }

                // Safari Popup Handling: ensure call is triggered from user interaction
                const options = isSilent ? {
                    prompt: '',
                    hint: localStorage.getItem('scoreflow_drive_user_hint') || ''
                } : { prompt: 'select_account' };

                this.tokenClient.requestAccessToken(options);
            } catch (err) {
                this.tokenClient.callback = originalCallback;
                this.isAuthenticating = false;
                if (this.authTimeout) {
                    clearTimeout(this.authTimeout);
                    this.authTimeout = null;
                }
                if (isSilent) this.silentAttemptCount++;
                console.error('[DriveSync] Sign-in request failed:', err);
                reject(err);
            }
        });
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
        
        // Only run immediate sync if not already busy
        if (!this.isSyncing) {
            this.sync(); 
        }
    }

    stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    async sync() {
        if (!this.isEnabled || this.isSyncing) return;

        // Throttling: Don't run full sync more than once every 5 seconds even if requested
        const now = Date.now();
        if (this.lastSyncRequest && (now - this.lastSyncRequest) < 5000) {
            console.log('[DriveSync] Sync requested too soon, skipping throttling.');
            return;
        }
        this.lastSyncRequest = now;
        this.isSyncing = true; // Guard immediately

        // Debug Trace: Find who is calling sync
        console.groupCollapsed(`[DriveSync] Sync Cycle started at ${new Date().toLocaleTimeString()}`);
        console.trace('Caller Trace:');
        console.groupEnd();

        // Sync Guard: If enabled but no token, try a silent reconnect once
        if (!this.accessToken) {
            console.log('[DriveSync] Enabled but no access token. Attempting silent reconnect...');
            try {
                await this.signIn(true);
            } catch (err) {
                console.error('[DriveSync] Silent reconnect failed in sync loop:', err);
                this.isSyncing = false;
                return;
            }
        }

        console.log('[DriveSync] Syncing cycle started...');

        try {
            if (!this.folderId) {
                this.folderId = await this.findOrCreateSyncFolder();
            }
            if (!this.folderId) throw new Error('Could not resolve sync folder');

            // First run: full scan (discovers Drive files, rebuilds manifest)
            // Subsequent runs: lightweight manifest refresh (picks up changes from other devices)
            if (!this.hasScanned) {
                this.hasScanned = true;
                await this.scanRemoteSyncFiles();
            } else {
                await this.refreshManifest();
            }

            // 0. Sync Profile first (it's global)
            await this.syncProfile();

            // 1. Sync the active score (Prioritized)
            if (this.app.pdfFingerprint) {
                const fingerprint = this.app.pdfFingerprint;

                // Skip if this score was just deleted (tombstoned) on this device
                if (this.manifest[fingerprint]?.deleted) {
                    console.log(`[DriveSync] Active score is tombstoned, skipping sync.`);
                } else {

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
                } // end tombstone check
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
     * Iterates through the entire registry to backup or update unsynced scores.
     * This now performs both PULL and PUSH in the background for all scores, 
     * including cloud-only placeholders to fetch their real titles.
     */
    /**
     * Lightweight manifest refresh — runs every sync cycle after the initial full scan.
     * Loads the latest manifest from Drive and applies two changes locally:
     *   1. Remove registry entries tombstoned by another device.
     *   2. Add cloud-only placeholders for new entries added by another device.
     */
    async refreshManifest() {
        if (!this.folderId || !this.app.scoreManager) return;
        try {
            const loaded = await this.loadManifest();
            if (!loaded || !this.manifest) return;

            let registryChanged = false;

            // 1. Remove tombstoned entries
            const tombstonedFps = new Set(
                Object.entries(this.manifest).filter(([, e]) => e.deleted).map(([fp]) => fp)
            );
            if (tombstonedFps.size > 0) {
                const before = this.app.scoreManager.registry.length;
                this.app.scoreManager.registry = this.app.scoreManager.registry.filter(s => {
                    if (tombstonedFps.has(s.fingerprint)) {
                        console.log(`[DriveSync] ✕ removed "${s.title || s.fingerprint.slice(0, 8)}" — deleted on another device`);
                        return false;
                    }
                    return true;
                });
                if (this.app.scoreManager.registry.length < before) registryChanged = true;
            }

            // 2. Add cloud-only placeholders for new manifest entries
            for (const [fp, entry] of Object.entries(this.manifest)) {
                if (entry.deleted) continue;
                if (!entry.syncId && !entry.pdfId) continue;
                const exists = this.app.scoreManager.registry.find(s => s.fingerprint === fp);
                if (!exists) {
                    const placeholder = {
                        fingerprint: fp,
                        title: entry.name || `雲端 PDF (${fp.slice(0, 8)})`,
                        fileName: '',
                        composer: 'Unknown',
                        thumbnail: null,
                        dateImported: 0,
                        lastAccessed: 0,
                        tags: [],
                        isSynced: false,
                        isCloudOnly: true,
                        isPdfAvailable: !!entry.pdfId
                    };
                    this.app.scoreManager.registry.push(placeholder);
                    registryChanged = true;
                    console.log(`[DriveSync] ↓ new file in cloud: "${placeholder.title}" (${fp.slice(0, 8)})`);
                }
            }

            if (registryChanged) {
                await this.app.scoreManager.saveRegistry();
                this.app.scoreManager.render();
            }
        } catch (err) {
            console.warn('[DriveSync] refreshManifest failed:', err);
        }
    }

    async syncBatch() {
        if (!this.app.scoreManager?.registry) return;

        let workDone = false;
        let processedCount = 0;
        const activeFp = this.app.pdfFingerprint;
        
        console.log(`[SyncDebug] syncBatch starting. Registry size: ${this.app.scoreManager.registry.length}. Manifest size: ${Object.keys(this.manifest).length}`);

        // Process ALL scores in registry (both local and cloud-only)
        for (const score of this.app.scoreManager.registry) {
            // Skip the current active score (already handled)
            if (score.fingerprint === activeFp) continue;

            const fp = score.fingerprint;
            const entry = this.manifest[fp];
            
            if (!entry) {
                // If not in manifest, it might be a newly added local file that needs first-time PDF upload
                const needsInitialPDF = !score.isCloudOnly;
                if (!needsInitialPDF) continue; 
            }

            const needsPDF = entry ? (!score.isCloudOnly && !entry.pdfId) : !score.isCloudOnly;
            const canPull = !!(entry && entry.syncId);
            const needsPush = !score.isCloudOnly && !score.isSynced;
            // For cloud-only: pull until cloudDataPulled is set.
            // For local scores: pull whenever manifest's updated timestamp is newer than last pulled version.
            const needsPull = canPull && (
                score.isCloudOnly
                    ? !score.cloudDataPulled
                    : (entry.updated || 0) > (score.lastPulledVersion || 0)
            );
            // Download PDF from cloud if available there but missing locally
            const needsPdfDownload = score.isCloudOnly && !!(entry && entry.pdfId);
            // Generate missing thumbnail for scores that have a local PDF but no thumbnail
            const needsThumbnail = !score.isCloudOnly && !score.thumbnail;

            // Metadata Check: If title is generic, we MUST pull to get the real name
            const isGeneric = !score.title || score.title === 'Unknown' || score.title.includes('score_buf_');
            const shouldPullMeta = canPull && isGeneric;

            if (needsPDF || needsPush || needsPull || needsPdfDownload || needsThumbnail || shouldPullMeta) {
                processedCount++;
                // Limit to 8 items per cycle for better balance
                if (processedCount > 8) break;

                workDone = true;
                console.log(`[Sync] Background processing: ${score.title || fp.slice(0,8)}... (Reason: PDF=${needsPDF}, PdfDownload=${needsPdfDownload}, Thumb=${needsThumbnail}, Push=${needsPush}, Pull=${needsPull}, PullMeta=${shouldPullMeta})`);
                await this.syncScore(fp, needsPDF, canPull, needsPush);

                // After sync, record manifest's updated timestamp so needsPull is false next cycle
                // (avoids loop caused by entry.updated being slightly newer than remoteVer)
                const refreshedEntry = this.manifest[fp];
                if (refreshedEntry && needsPull) {
                    score.lastPulledVersion = Math.max(score.lastPulledVersion || 0, refreshedEntry.updated || 0);
                    await this.app.scoreManager.saveRegistry();
                }

                // Short sleep to prevent UI jank
                await new Promise(r => setTimeout(r, 600));
            }
        }

        if (workDone) {
            console.log(`[Sync] Background cycle finished. Processed ${processedCount} items.`);
        } else {
            console.log('[SyncDebug] No background items needed processing.');
        }
    }

    /**
     * Synchronizes a specific score (PDF and/or JSON data).
     * Now uses manifest entry IDs directly for speed.
     */
    async syncScore(fingerprint, needsPDF, canPull, needsPush) {
        try {
            const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            if (!score) return;
            const entry = this.manifest[fingerprint];

            // 1. Handle PDF upload if needed (local → cloud)
            if (needsPDF) {
                const pdfKey = `score_buf_${fingerprint}`;
                const pdfData = await db.get(pdfKey);
                if (pdfData) {
                    await this.uploadPDF(fingerprint, pdfData, score.title || 'Unknown');
                }
            }

            // 1b. Handle PDF download if available in cloud but missing locally (cloud → local)
            const hasPdfInCloud = !!(entry && entry.pdfId);
            const hasLocalPdf = !!(await db.get(`score_buf_${fingerprint}`));
            if (hasPdfInCloud && !hasLocalPdf) {
                try {
                    console.log(`[DriveSync] ↓ Auto-downloading PDF for "${score.title || fingerprint.slice(0, 8)}"...`);
                    this.addLog(`正在下載雲端 PDF: ${score.title || '...'}`, 'system');
                    const buffer = await this.downloadPDF(fingerprint);
                    await db.set(`score_buf_${fingerprint}`, buffer);

                    // Generate thumbnail so the library card shows a preview
                    const thumbnail = await this.app.scoreManager.generateThumbnail(buffer.slice(0));
                    score.thumbnail = thumbnail;
                    score.isCloudOnly = false;
                    score.isPdfAvailable = true;
                    if (!score.fileName) score.fileName = (score.title || fingerprint.slice(0, 8)) + '.pdf';
                    await this.app.scoreManager.saveRegistry();
                    this.app.scoreManager.render();
                    console.log(`[DriveSync] ✓ PDF downloaded: "${score.title}" (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
                    this.addLog(`PDF 下載完成: ${score.title}`, 'success');
                } catch (err) {
                    console.warn(`[DriveSync] PDF auto-download failed for ${fingerprint.slice(0, 8)}:`, err.message);
                }
            }

            // 1c. Generate thumbnail if missing (retroactive fix for previously downloaded scores)
            if (!score.isCloudOnly && !score.thumbnail) {
                try {
                    const buffer = await db.get(`score_buf_${fingerprint}`);
                    if (buffer) {
                        const thumbnail = await this.app.scoreManager.generateThumbnail(buffer.slice(0));
                        if (thumbnail) {
                            score.thumbnail = thumbnail;
                            await this.app.scoreManager.saveRegistry();
                            this.app.scoreManager.render();
                            console.log(`[DriveSync] ✓ Thumbnail generated for "${score.title}"`);
                        }
                    }
                } catch (err) {
                    console.warn(`[DriveSync] Thumbnail generation failed for ${fingerprint.slice(0, 8)}:`, err.message);
                }
            }

            // 2. Background PULL (Headless)
            let remoteVersion = 0;
            if (canPull && fingerprint !== this.app.pdfFingerprint) {
                // Pass the fileId directly from manifest to skip searching
                remoteVersion = await this.pullBackground(fingerprint, entry.syncId);
            }

            // 3. Handle PUSH
            if (needsPush) {
                const data = await this.gatherLocalData(fingerprint);
                const prefix = this.safeTitle(score.title);
                const fileName = `${prefix}sync_${fingerprint}.json`;
                
                // Use existing fileId from manifest if available
                const fileId = entry ? entry.syncId : null;

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
                await this.app.scoreManager.saveRegistry();
            }

            this.updateCloudStatsUI();

        } catch (err) {
            console.error(`[Sync] Failed to sync score ${fingerprint}:`, err);
        }
    }

    /**
     * Specialized "Headless" Pull for background scores.
     * Merges remote data directly into IndexedDB without affecting active viewer.
     */
    async pullBackground(fingerprint, fileId) {
        if (!fileId) return 0;

        try {
            const remoteData = await this.getFileContent(fileId);
            if (!remoteData) return 0;

            const remoteVer = remoteData.version || 0;
            const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            if (!score) return 0;
            
            const localDetail = await db.get(`score_detail_${fingerprint}`);
            const remoteDetail = remoteData.scoreDetail;
            
            let needsSave = false;
            const bgChanges = [];
            const scoreName = remoteDetail?.name || score.title || fingerprint.slice(0, 8);

            // 1. Merge Metadata
            if (remoteDetail) {
                const isLocalGeneric = !score.title || score.title === 'Unknown' || score.title.includes('score_buf_');
                const shouldUpdateMeta = isLocalGeneric || (remoteDetail.lastEdit > (localDetail?.lastEdit || 0));

                if (shouldUpdateMeta) {
                    await db.set(`score_detail_${fingerprint}`, remoteDetail);
                    await this.app.scoreManager.updateMetadata(fingerprint, {
                        title: remoteDetail.name,
                        composer: remoteDetail.composer || 'Unknown'
                    }, true); // fromSync: true
                    needsSave = true;
                    if (isLocalGeneric && remoteDetail.name) {
                        bgChanges.push(`name resolved: "${remoteDetail.name}"`);
                    } else {
                        bgChanges.push(`metadata updated`);
                    }
                }
            }

            // 2. Merge Stamps (Background)
            if (Array.isArray(remoteData.stamps)) {
                const localStamps = await db.get(`score_stamps_${fingerprint}`) || [];
                const localMap = new Map(localStamps.map(s => [s.id, s]));
                let newCount = 0;
                let updCount = 0;
                const newByType = {};

                remoteData.stamps.forEach(remoteS => {
                    if (!remoteS.id) return;
                    const t = remoteS.type || remoteS.stampType || 'unknown';
                    const localS = localMap.get(remoteS.id);
                    if (!localS) {
                        localMap.set(remoteS.id, remoteS);
                        newCount++;
                        newByType[t] = (newByType[t] || 0) + 1;
                    } else if (remoteS.updatedAt > (localS.updatedAt || 0)) {
                        localMap.set(remoteS.id, remoteS);
                        updCount++;
                    }
                });

                if (newCount > 0 || updCount > 0) {
                    await db.set(`score_stamps_${fingerprint}`, Array.from(localMap.values()));
                    needsSave = true;
                    if (newCount > 0) {
                        const typeStr = Object.entries(newByType).map(([t, n]) => `${t}×${n}`).join(', ');
                        bgChanges.push(`+${newCount} annotation(s) [${typeStr}]`);
                    }
                    if (updCount > 0) bgChanges.push(`updated ${updCount} annotation(s)`);
                }
            }

            if (bgChanges.length > 0) {
                const label = score.isCloudOnly ? 'new file in cloud' : 'bg pull';
                console.log(`[DriveSync] ↓ ${label} "${scoreName}" — ${bgChanges.join(' | ')}`);
            }

            // 3. Mark as Synced — always persist lastPulledVersion to prevent re-pulling next cycle
            score.lastPulledVersion = remoteVer;
            if (score.isCloudOnly) score.cloudDataPulled = true;
            if (!score.isSynced) score.isSynced = true;
            await this.app.scoreManager.saveRegistry();

            return remoteVer;
        } catch (err) {
            console.error(`[Sync] Background pull failed for ${fingerprint}:`, err);
            return 0;
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
            if (!score) return; // score was deleted, nothing to push

            // Detect local changes: check if any stamp or metadata was modified after last sync
            const latestStampTime = this.app.stamps.length > 0
                ? Math.max(...this.app.stamps.map(s => s.updatedAt || 0))
                : 0;
            const localEdit = this.app.scoreDetailManager?.currentInfo?.lastEdit || 0;
            const latestLocalChange = Math.max(latestStampTime, localEdit);

            if (score && score.isSynced && remoteVersion <= (this.lastSyncTime || 0) && latestLocalChange <= (this.lastSyncTime || 0)) {
                // Heartbeat log only in console
                console.log(`[DriveSync] Score ${score.title} is already synced. Skipping push.`);
                return;
            }

            // Show UI log ONLY if we are actually pushing
            this.addLog(`正在同步當前樂譜: ${score.title}`, 'system');

            // Diff summary: show what changed since last sync
            const sinceLastSync = this.lastSyncTime || 0;
            const changedStamps = this.app.stamps.filter(s => (s.updatedAt || 0) > sinceLastSync);
            const diffParts = [];
            if (changedStamps.length > 0) {
                // Group by type for clarity
                const byType = {};
                changedStamps.forEach(s => {
                    const t = s.type || s.stampType || 'unknown';
                    byType[t] = (byType[t] || 0) + 1;
                });
                const typeStr = Object.entries(byType).map(([t, n]) => `${t}×${n}`).join(', ');
                diffParts.push(`stamps: ${changedStamps.length} (${typeStr})`);
            }
            if (localEdit > sinceLastSync) diffParts.push('metadata');
            const diffStr = diffParts.length > 0 ? diffParts.join(' | ') : 'full sync';
            console.log(`[DriveSync] ↑ Push "${score.title}" — changed: ${diffStr}`);

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
            const localSyncTime = this.lastSyncTime || 0;
            const localEditTime = this.app.scoreDetailManager?.currentInfo?.lastEdit || 0;

            console.log(`[DriveSync] Pulling Fingerprint: ${fingerprint}`);
            console.log(`[DriveSync] Remote Version: ${remoteVer}, Local LastSyncTime: ${localSyncTime}`);

            if (remoteVer <= localSyncTime) {
                this.addLog('雲端資料已是最新', 'system');
                return remoteVer;
            }

            console.log('[DriveSync] Remote changes found, merging...');
            let hasChanges = false;
            let changesDetail = [];
            const scoreName = remoteData.scoreDetail?.name || this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint)?.title || fingerprint.slice(0, 8);

            // 1. Sync Stamps
            if (Array.isArray(remoteData.stamps)) {
                const localMap = new Map();
                this.app.stamps.forEach(s => { if (s.id) localMap.set(s.id, s); });

                let newStamps = 0;
                let updatedStamps = 0;
                const newByType = {};
                const updByType = {};

                remoteData.stamps.forEach(remoteS => {
                    if (!remoteS.id) return;
                    const t = remoteS.type || remoteS.stampType || 'unknown';
                    const localS = localMap.get(remoteS.id);
                    if (!localS) {
                        this.app.stamps.push(remoteS);
                        hasChanges = true;
                        newStamps++;
                        newByType[t] = (newByType[t] || 0) + 1;
                    } else if (remoteS.updatedAt > (localS.updatedAt || 0)) {
                        Object.assign(localS, remoteS);
                        hasChanges = true;
                        updatedStamps++;
                        updByType[t] = (updByType[t] || 0) + 1;
                    }
                });

                // Reconciliation: Remove stamps that are local but missing from remote
                // (Only if they were created BEFORE the remote version, meaning they were likely deleted on another device)
                const remoteIds = new Set(remoteData.stamps.map(s => s.id));
                const toPrune = this.app.stamps.filter(s => s.id && !remoteIds.has(s.id) && (s.updatedAt || 0) < remoteVer);
                if (toPrune.length > 0) {
                    this.app.stamps = this.app.stamps.filter(s => !toPrune.includes(s));
                    hasChanges = true;
                    changesDetail.push(`deleted ${toPrune.length} annotation(s)`);
                }

                if (newStamps > 0) {
                    const typeStr = Object.entries(newByType).map(([t, n]) => `${t}×${n}`).join(', ');
                    changesDetail.push(`+${newStamps} annotation(s) [${typeStr}]`);
                }
                if (updatedStamps > 0) {
                    const typeStr = Object.entries(updByType).map(([t, n]) => `${t}×${n}`).join(', ');
                    changesDetail.push(`updated ${updatedStamps} annotation(s) [${typeStr}]`);
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

                // Reconciliation: Remove bookmarks missing from remote
                const remoteBmIds = new Set(remoteData.bookmarks.map(bm => bm.id));
                const bmToPrune = this.app.jumpManager.bookmarks.filter(bm => bm.id && !remoteBmIds.has(bm.id) && (bm.updatedAt || 0) < remoteVer);
                if (bmToPrune.length > 0) {
                    this.app.jumpManager.bookmarks = this.app.jumpManager.bookmarks.filter(bm => !bmToPrune.includes(bm));
                    bmMadeChanges = true;
                }

                if (bmMadeChanges) {
                    this.app.jumpManager.renderBookmarks();
                    hasChanges = true;
                    changesDetail.push(`bookmarks updated (total: ${remoteData.bookmarks.length})`);
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

                // Reconciliation: Remove sources missing from remote
                const remoteSrcIds = new Set(remoteData.sources.map(src => src.id));
                const srcToPrune = this.app.sources.filter(src => src.id && !remoteSrcIds.has(src.id) && (src.updatedAt || 0) < remoteVer);
                if (srcToPrune.length > 0) {
                    this.app.sources = this.app.sources.filter(src => !srcToPrune.includes(src));
                    srcMadeChanges = true;
                }

                if (srcMadeChanges) {
                    this.app.collaborationManager?.renderSourceUI();
                    hasChanges = true;
                    changesDetail.push(`interpretations updated (total: ${remoteData.sources.length})`);
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
                const remoteEdit = remoteData.scoreDetail.lastEdit || 0;
                const localEdit = localInfo?.lastEdit || 0;
                const remoteName = remoteData.scoreDetail.name;
                
                const isLocalGeneric = !localInfo || !localInfo.name || localInfo.name === 'Unknown' || localInfo.name.includes('score_buf_');
                const hasRemoteRealName = remoteName && remoteName !== 'Unknown' && !remoteName.includes('score_buf_');
                
                const shouldAcceptRemote = (remoteEdit > localEdit) || (isLocalGeneric && hasRemoteRealName);

                if (localInfo && shouldAcceptRemote) {
                    this.app.scoreDetailManager.currentInfo = remoteData.scoreDetail;
                    this.app.scoreDetailManager.save(fingerprint); 
                    this.app.scoreDetailManager.render(fingerprint);

                    if (this.app.scoreManager && remoteName) {
                        await this.app.scoreManager.updateMetadata(fingerprint, {
                            title: remoteName,
                            composer: remoteData.scoreDetail.composer || 'Unknown'
                        }, true); // TRUE: fromSync
                    }

                    hasChanges = true;
                    changesDetail.push(`metadata: name="${remoteName}"`);
                }
            }

            if (hasChanges) {
                const detail = changesDetail.join(' | ');
                console.log(`[DriveSync] ↓ Pull "${scoreName}" — ${detail}`);
                this.addLog(`已同步遠端更新: ${detail}`, 'info');
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
     * Sync Global User Profile & Setlists.
     */
    async syncProfile() {
        if (!this.folderId) return;
        const fileName = 'user_profile_sync.json';
        const fileId = await this.findSyncFile(fileName);
        const localProfile = this.app.profileManager?.data;
        const localSetlists = this.app.setlistManager?.setlists || [];
        if (!localProfile) return;

        try {
            if (fileId) {
                const remoteData = await this.getFileContent(fileId);
                let shouldPush = false;

                if (remoteData && remoteData.version > (this.lastProfileSyncTime || 0)) {
                    // 1. Merge Profile (LWW)
                    const remoteProfile = remoteData.profile;
                    if (remoteProfile && (remoteProfile.updatedAt || 0) > (localProfile.updatedAt || 0)) {
                        console.log('[DriveSync] Merging newer remote profile...');
                        Object.assign(this.app.profileManager.data, remoteProfile);
                        this.app.profileManager.save();
                        this.app.profileManager.render();
                    } else if (remoteProfile && (localProfile.updatedAt || 0) > (remoteProfile.updatedAt || 0)) {
                        shouldPush = true;
                    }

                    // 2. Merge Custom Text Library (Set Union)
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

                    // 3. Merge Setlists (LWW per setlist)
                    if (Array.isArray(remoteData.setlists) && this.app.setlistManager) {
                        let setlistChanged = false;
                        const remoteSetlists = remoteData.setlists;
                        
                        remoteSetlists.forEach(remoteSet => {
                            const localSet = this.app.setlistManager.setlists.find(s => s.id === remoteSet.id);
                            if (!localSet) {
                                // New setlist from remote
                                this.app.setlistManager.setlists.push(remoteSet);
                                setlistChanged = true;
                            } else if ((remoteSet.updatedAt || 0) > (localSet.updatedAt || 0)) {
                                // Remote is newer
                                Object.assign(localSet, remoteSet);
                                setlistChanged = true;
                            }
                        });

                        // Check if local has newer setlists to push
                        this.app.setlistManager.setlists.forEach(ls => {
                            const rs = remoteSetlists.find(s => s.id === ls.id);
                            if (!rs || (ls.updatedAt || 0) > (rs.updatedAt || 0)) {
                                shouldPush = true;
                            }
                        });

                        if (setlistChanged) {
                            await this.app.setlistManager.save();
                            this.app.setlistManager.render();
                        }
                    }
                } else {
                    // Check if anything local changed since last sync
                    if (localProfile.updatedAt > (this.lastProfileSyncTime || 0)) {
                        shouldPush = true;
                    }
                    // Check if any setlist is newer
                    const localNewestSetlist = Math.max(0, ...localSetlists.map(s => s.updatedAt || 0));
                    if (localNewestSetlist > (this.lastProfileSyncTime || 0)) {
                        shouldPush = true;
                    }
                }

                if (shouldPush || !this.lastProfileSyncTime) {
                    const payload = {
                        profile: localProfile,
                        userTextLibrary: this.app.userTextLibrary,
                        setlists: localSetlists,
                        version: Date.now()
                    };
                    await this.updateFile(fileId, payload);
                    this.lastProfileSyncTime = payload.version;
                    console.log('[DriveSync] Global sync data pushed (Newer).');
                }
            } else {
                // First time upload
                const payload = {
                    profile: localProfile,
                    userTextLibrary: this.app.userTextLibrary,
                    setlists: localSetlists,
                    version: Date.now()
                };
                await this.createFile(fileName, payload);
                this.lastProfileSyncTime = payload.version;
                this.addLog('首次上傳雲端設定與歌單', 'success');
            }
        } catch (err) {
            console.error('[DriveSync] Profile/Setlist sync failed:', err);
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
        form.append('file', new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));

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
            body: JSON.stringify(content, null, 2)
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
        if (!this.manifest) this.manifest = {};

        // Always create tombstone even if entry didn't exist yet —
        // Drive files may still be present and would otherwise resurrect the score on next scan.
        this.manifest[fingerprint] = {
            ...this.manifest[fingerprint],
            deleted: true,
            updated: Date.now()
        };

        await this.saveManifest();
        console.log(`[DriveSync] Entry ${fingerprint} marked as deleted (Tombstone).`);
    }

    /**
     * Delete both PDF and Sync JSON files for a specific fingerprint from Drive.
     */
    async deleteSyncFiles(fingerprint, deletePDF = false) {
        if (!this.folderId) return;

        try {
            // 1. Find and delete Sync JSON
            const syncId = await this.findSyncFile(fingerprint, 'sync');
            if (syncId) {
                this.addLog(`正在刪除雲端同步檔 (${fingerprint.slice(0, 8)})...`, 'system');
                await this.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${syncId}`, { method: 'DELETE' });
            }

            // 2. Find and delete PDF (optional)
            if (deletePDF) {
                const pdfId = await this.findSyncFile(fingerprint, 'pdf');
                if (pdfId) {
                    this.addLog(`正在刪除雲端 PDF 檔...`, 'system');
                    await this.gdriveFetch(`https://www.googleapis.com/drive/v3/files/${pdfId}`, { method: 'DELETE' });
                }
            }

            // 3. Mark as deleted in manifest
            await this.deleteManifestEntry(fingerprint);

            this.addLog(`樂譜雲端資料已清除 (${fingerprint.slice(0, 8)})`, 'success');
        } catch (err) {
            console.error('[DriveSync] Delete failed:', err);
            this.addLog('刪除雲端資料失敗: ' + err.message, 'error');
        }
    }

    /**
     * Forces all local scores to be marked as unsynced and triggers a full batch sync.
     * This ensures all local data is pushed to the cloud regardless of its current state.
     */
    async forcePushAll() {
        if (!this.isEnabled || !this.accessToken) {
            this.addLog('請先連線 Google Drive 才能執行同步', 'error');
            return;
        }

        const confirmed = await this.app.showDialog({
            title: '強制同步所有資料',
            message: `這將把本地書庫中的所有標記資料（包含曲名、作曲家、劃記、書籤及歌單）重新上傳至雲端。如果雲端已存在較新版本，可能會被本地覆蓋。確定要繼續嗎？`,
            type: 'confirm',
            icon: '📤'
        });

        if (!confirmed) return;

        try {
            this.addLog('正在準備強制同步...', 'system');
            
            // 1. Mark all registry entries as unsynced
            if (this.app.scoreManager?.registry) {
                for (const score of this.app.scoreManager.registry) {
                    if (!score.isCloudOnly) {
                        score.isSynced = false;
                    }
                }
                await this.app.scoreManager.saveRegistry();
            }

            // 2. Reset last profile sync time to force setlist/profile push
            this.lastProfileSyncTime = 0;

            // 3. Trigger a full sync cycle
            this.addLog('開始全面背景上傳...', 'system');
            this.sync(); 
            
            if (this.app.showMessage) {
                this.app.showMessage('已開始全量上傳流程，請查看日誌了解進度', 'success');
            }
        } catch (err) {
            console.error('[DriveSync] Force push failed:', err);
            this.addLog('強制同步啟動失敗: ' + err.message, 'error');
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

            // Preserve deletion tombstones — they must survive the manifest wipe
            const savedTombstones = {};
            for (const [fp, entry] of Object.entries(this.manifest)) {
                if (entry.deleted) savedTombstones[fp] = entry;
            }

            // Clear local manifest but restore tombstones so scan won't resurrect deleted scores
            this.manifest = { ...savedTombstones };
            this.hasScanned = false; // Force re-scan

            // Reset sync flags so syncBatch will re-pull everything from Drive
            for (const score of this.app.scoreManager.registry) {
                score.isSynced = false;
                delete score.cloudDataPulled;
            }
            await this.app.scoreManager.saveRegistry();

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
                        // Never resurrect tombstoned entries during self-heal
                        if (this.manifest[fp]?.deleted) return;

                        if (!this.manifest[fp]) {
                            this.manifest[fp] = {};
                            manifestChanged = true;
                        }

                        // Self-Heal: Recover syncId if missing
                        if (this.manifest[fp].syncId !== f.id) {
                            this.manifest[fp].syncId = f.id;
                            manifestChanged = true;
                        }

                        // Self-Heal: Recover name ONLY if completely missing
                        if (!this.manifest[fp].name || this.manifest[fp].name === 'Unknown') {
                            const fileNamePart = f.name.split('_sync_')[0];
                            if (fileNamePart && fileNamePart !== 'sync') {
                                this.manifest[fp].name = fileNamePart;
                                manifestChanged = true;
                            }
                        }
                    } else if (pdfMatch) {
                        const fp = pdfMatch[1];
                        // Never resurrect tombstoned entries during self-heal
                        if (this.manifest[fp]?.deleted) return;

                        if (!this.manifest[fp]) {
                            this.manifest[fp] = {};
                            manifestChanged = true;
                        }

                        if (this.manifest[fp].pdfId !== f.id) {
                            this.manifest[fp].pdfId = f.id;
                            manifestChanged = true;
                        }

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
                console.log('[DriveSync] Manifest updated during scan.');
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

            // Remove registry entries that are tombstoned in the manifest (deleted on another device)
            const tombstonedFps = new Set(
                Object.entries(this.manifest)
                    .filter(([, e]) => e.deleted)
                    .map(([fp]) => fp)
            );
            if (tombstonedFps.size > 0) {
                const before = this.app.scoreManager.registry.length;
                this.app.scoreManager.registry = this.app.scoreManager.registry.filter(s => {
                    if (tombstonedFps.has(s.fingerprint)) {
                        console.log(`[DriveSync] Removing tombstoned score from registry: ${s.title || s.fingerprint.slice(0, 8)}`);
                        return false;
                    }
                    return true;
                });
                if (this.app.scoreManager.registry.length < before) registryChanged = true;
            }

            // Mark local registry based on manifest
            for (const score of this.app.scoreManager.registry) {
                const entry = this.manifest[score.fingerprint];
                if (!entry) continue;

                const isSynced = !!entry.syncId;
                const isPdfAvailable = !!entry.pdfId;

                let changed = false;
                if (score.isSynced !== isSynced) {
                    score.isSynced = isSynced;
                    changed = true;
                }
                if (score.isPdfAvailable !== isPdfAvailable) {
                    score.isPdfAvailable = isPdfAvailable;
                    changed = true;
                }

                // Metadata Sync: If local is generic but manifest has a name
                if (entry.name && (score.title === 'Unknown' || score.title.includes('score_buf_'))) {
                    await this.app.scoreManager.updateMetadata(score.fingerprint, {
                        title: entry.name
                    }, true); // fromSync: true
                    // registryChanged will be handled by updateMetadata saving, but we mark it here too
                    registryChanged = true;
                }

                if (changed) {
                    registryChanged = true;
                    foundCount++;
                }
            }

            // 3. Add cloud-only placeholders for ALL manifest entries not yet in the local registry.
            for (const [fp, entry] of Object.entries(this.manifest)) {
                // IMPORTANT: Respect Deletion Tombstones
                if (entry.deleted) {
                    // console.log(`[DriveSync] Skipping deleted entry ${fp}`);
                    continue;
                }

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
                        isSynced: false,     // false = data not yet pulled locally; pullBackground will set true
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
