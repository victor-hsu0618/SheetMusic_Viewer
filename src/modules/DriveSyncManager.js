import * as db from '../db.js';
import { DriveAuthManager } from './DriveAuthManager.js';
import { DriveFileManager } from './DriveFileManager.js';
import { DriveManifestManager } from './DriveManifestManager.js';
import { DriveLogManager } from './DriveLogManager.js';

/**
 * DriveSyncManager — coordinator for all Google Drive sync operations.
 *
 * Owns all shared state and delegates to three sub-managers:
 *   this.auth     — DriveAuthManager  (auth, UI, logging, auto-sync timer)
 *   this.file     — DriveFileManager  (file/folder CRUD, upload, download)
 *   this.manifest — DriveManifestManager (manifest load/save, scan, index reset)
 *
 * Proxy methods on this class allow sync logic (push/pull/syncScore etc.)
 * to call helpers without change.
 */
export class DriveSyncManager {
    constructor(app) {
        this.app = app;

        // --- Auth credentials ---
        this.clientId = '481081864196-tsbrivsjhdtkp4rn9ffgkg19g2sh5r3a.apps.googleusercontent.com';
        this.scopes = 'https://www.googleapis.com/auth/drive.file';
        this.tokenClient = null;
        this.accessToken = null;

        // --- Sync state ---
        this.isEnabled = false;
        this.isSyncing = false;
        this.isPaused = false;
        this.lastSyncTime = 0;
        this.lastProfileSyncTime = 0;
        this.syncInterval = 30000; // 30 seconds
        this.syncTimer = null;
        this.pushDebounceTimer = null;
        this.lastSyncRequest = 0;
        this.lastActivityTime = 0;
        this.activityTimeoutMs = 5 * 60 * 1000; // stop syncing after 5 min of inactivity

        // --- Auth state ---
        this.authTimeout = null;
        this.isAuthenticating = false;
        this.lastSilentAttempt = 0;
        this.silentAttemptCount = 0;

        // --- Drive folder IDs ---
        this.folderId = null;
        this.pdfsFolderId = null;
        this.annotationsFolderId = null;

        // --- Manifest ---
        this.manifest = {};
        this.manifestFileId = null;
        this.isManifestSaving = false;
        this.MANIFEST_NAME = 'cloud_manifest_v3.json';
        this.hasScanned = false;

        // --- Profile Sync ---
        this.profileFileId = null;
        this.isProfileSyncing = false;

        // --- UI state ---
        this.cloudStats = { totalAnnotations: 0, totalPDFs: 0 };
        this.uploadStatus = {
            json: { active: false },
            pdf: { active: false, loaded: 0, total: 0, fileName: '' }
        };

        // --- Sub-managers ---
        this.auth = new DriveAuthManager(this);
        this.file = new DriveFileManager(this);
        this.manifest_mgr = new DriveManifestManager(this);
        this.log = new DriveLogManager(this);
        this._pushLocks = new Set();
        this._pdfLocks = new Set();
    }

    // =========================================================
    // PROXY METHODS — delegate to sub-managers
    // Allows sync logic below to call this.xxx unchanged.
    // =========================================================

    init()                                          { return this.auth.init(); }
    gdriveFetch(url, opts)                          { return this.auth.gdriveFetch(url, opts); }
    refreshUI()                                     { return this.auth.refreshUI(); }
    updateCloudStatsUI()                            { return this.auth.updateCloudStatsUI(); }
    calculateLocalPendingSync()                     { return this.auth.calculateLocalPendingSync(); }
    refreshCloudStats()                             { return this.auth.refreshCloudStats(); }
    addLog(msg, type)                               { return this.auth.addLog(msg, type); }
    signIn(isSilent)                                { return this.auth.signIn(isSilent); }
    togglePauseSync()                               { return this.auth.togglePauseSync(); }
    signOut()                                       { return this.auth.signOut(); }
    startAutoSync()                                 { return this.auth.startAutoSync(); }
    stopAutoSync()                                  { return this.auth.stopAutoSync(); }
    prefetchPinnedScores()                          { return this.auth.prefetchPinnedScores(); }
    checkGlobalReset()                              { return this.auth.checkGlobalReset(); }

    shortHash(fp)                                   { return this.file.shortHash(fp); }
    safeTitle(title)                                { return this.file.safeTitle(title); }
    findOrCreateSubfolder(name, parentId)           { return this.file.findOrCreateSubfolder(name, parentId); }
    findOrCreateSyncFolder()                        { return this.file.findOrCreateSyncFolder(); }
    findSyncFile(fingerprint, type)                 { return this.file.findSyncFile(fingerprint, type); }
    findFileByName(fileName)                        { return this.file.findFileByName(fileName); }
    createFile(name, content, parentId)             { return this.file.createFile(name, content, parentId); }
    updateFile(fileId, content)                     { return this.file.updateFile(fileId, content); }
    getFileContent(fileId)                          { return this.file.getFileContent(fileId); }
    uploadPDF(fingerprint, buffer, fileName)        { return this.file.uploadPDF(fingerprint, buffer, fileName); }
    downloadPDF(fingerprint)                        { return this.file.downloadPDF(fingerprint); }
    downloadAndCacheScore(fp)                       { return this.file.downloadAndCacheScore(fp); }
    deleteSyncFiles(fingerprint, deletePDF)         { return this.file.deleteSyncFiles(fingerprint, deletePDF); }
    purgeAllCloudData()                             { return this.file.purgeAllCloudData(); }
    renameFile(fileId, newName)                     { return this.file.renameFile(fileId, newName); }

    loadManifest()                                  { return this.manifest_mgr.loadManifest(); }
    saveManifest()                                  { return this.manifest_mgr.saveManifest(); }
    updateManifestEntry(fingerprint, data)          { return this.manifest_mgr.updateManifestEntry(fingerprint, data); }
    deleteManifestEntry(fingerprint, title)         { return this.manifest_mgr.deleteManifestEntry(fingerprint, title); }
    scanRemoteSyncFiles()                           { return this.manifest_mgr.scanRemoteSyncFiles(); }
    fetchCloudScoreDetails(fileId, fingerprint)     { return this.manifest_mgr.fetchCloudScoreDetails(fileId, fingerprint); }
    forcePushAll()                                  { return this.manifest_mgr.forcePushAll(); }

    // =========================================================
    // SYNC LOGIC — core coordination methods
    // =========================================================

    recordActivity() {
        this.lastActivityTime = Date.now();
    }

    async sync() {
        if (!this.isEnabled || this.isSyncing || this.isPaused) {
            if (this.isPaused) console.log('[DriveSync] Auto-sync is currently PAUSED.');
            return;
        }

        // Skip periodic sync when user has been idle
        if (this.lastActivityTime > 0 && (Date.now() - this.lastActivityTime) > this.activityTimeoutMs) {
            console.log('[DriveSync] User inactive, skipping sync.');
            return;
        }

        // --- Optimized Sync Strategy ---
        // 1. Initial Scan: Always allow the first scan to populate library placeholders
        if (!this.hasScanned) {
            console.log('[DriveSync] Performing initial cloud scan...');
        } else {
            // 2. Idle Skip: If already scanned and no PDF is open, skip periodic sync
            if (!this.app.pdfFingerprint) {
                return;
            }
        }

        const fingerprint = this.app.pdfFingerprint;

        // --- NEW: Verify active score hasn't been deleted on another device or purged ---
        if (fingerprint && this.manifest[fingerprint]?.deleted) {
            console.log(`[DriveSync] Active score is tombstoned in manifest. Skipping sync cycle for ${fingerprint.slice(0,8)}.`);
            return;
        }

        const now = Date.now();
        if (this.lastSyncRequest && (now - this.lastSyncRequest) < 5000) {
            console.log('[DriveSync] Sync requested too soon, skipping throttling.');
            return;
        }
        this.lastSyncRequest = now;
        this.isSyncing = true;

        console.groupCollapsed(`[DriveSync] Sync Cycle started at ${new Date().toLocaleTimeString()}`);
        console.trace('Caller Trace:');
        console.groupEnd();

        if (!this.accessToken) {
            console.log('[DriveSync] Enabled but no access token. Skipping sync until user reconnects.');
            this.isSyncing = false;
            return;
        }

        console.log('[DriveSync] Syncing cycle started...');

        try {
            if (!this.folderId || !this.pdfsFolderId || !this.annotationsFolderId) {
                this.folderId = await this.findOrCreateSyncFolder();
            }
            if (!this.folderId) throw new Error('Could not resolve sync folder');

            if (!this.hasScanned) {
                this.hasScanned = true;
                // Only load manifest for file reference, don't update registry placeholders automatically
                await this.loadManifest();
            } else {
                await this.loadManifest();
            }

            await this.checkGlobalReset();

            await this.syncProfile();

            if (this.app.pdfFingerprint) {
                const fingerprint = this.app.pdfFingerprint;

                const entry = this.manifest[fingerprint];
                if (entry?.deleted) {
                    console.log(`[DriveSync] Active score is tombstoned, skipping sync.`);
                } else {
                    const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
                    const title = score ? score.title : 'Unknown';
                    console.log(`[DriveSync] Prioritizing active score: ${title} (${fingerprint})`);

                    const needsPDF = !entry || !entry.pdfId;

                    if (needsPDF) {
                        const pdfData = await db.get(`score_buf_${fingerprint}`);
                        if (pdfData) await this.uploadPDF(fingerprint, pdfData, title);
                    }

                    // Backup-Only: Skip pull, only push local changes
                    await this.push(0);
                }
            }

            // Background batching removed as per user request to disable background sync
            // await this.syncBatch();

        } catch (err) {
            console.error('[DriveSync] Sync failed:', err);
            this.addLog('同步異常: ' + (err.message || '網路問題'), 'error');
        } finally {
            this.isSyncing = false;
            this.updateCloudStatsUI();
            this.refreshUI();
            this.log.flush().catch(e => console.warn('[DriveLog] flush error:', e.message));
        }
    }

    /**
     * Lightweight manifest refresh — runs every sync cycle after the initial full scan.
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
                        if (!s.isCloudOnly) return true; // Keep local scores
                        console.log(`[DriveSync] ✕ removed "${s.title || s.fingerprint.slice(0, 8)}" — deleted on another device`);
                        return false;
                    }
                    return true;
                });
                if (this.app.scoreManager.registry.length < before) registryChanged = true;
            }

            // 2. Add cloud-only placeholders? (DISABLED in Backup-Only mode)
            /*
            for (const [fp, entry] of Object.entries(this.manifest)) {
                // ... logic to add placeholders ...
            }
            */

            if (registryChanged) {
                await this.app.scoreManager.saveRegistry();
                this.app.scoreManager.render();
            }
        } catch (err) {
            console.warn('[DriveSync] refreshManifest failed:', err);
        }
    }

    // syncBatch() method removed to disable background synchronization of non-active scores.

    async syncScore(fingerprint, needsPDF, canPull, needsPush) {
        try {
            const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            if (!score) return;
            const entry = this.manifest[fingerprint];
            
            // --- SKIP: Tombstoned scores ---
            if (entry?.deleted) {
                console.log(`[DriveSync] SyncScore aborted: ${fingerprint.slice(0,8)} is tombstoned.`);
                return;
            }

            // --- 1. Determine the "Truth" Title (LWW) ---
            const localDetail = await this.app.scoreDetailManager?.getMetadata(fingerprint);
            const localUpdateTs = localDetail?.lastEdit || 0;
            const cloudUpdateTs = entry?.updated || 0;
            
            // Use whichever title is newer for filename generation
            const isLocalNewer = localUpdateTs >= cloudUpdateTs;
            const targetTitle = isLocalNewer ? (localDetail?.name || score.title) : (entry?.name || score.title);
            const prefix = this.safeTitle(targetTitle);
            const hash = this.shortHash(fingerprint);

            // --- 2. Correct Cloud Filenames (PDF & JSON) ---
            // This ensures "Duport" doesn't stay named "Concerto" on Drive
            if (entry) {
                // Check PDF
                if (entry.pdfId) {
                    const expectedPdfName = `${prefix}${hash}.pdf`;
                    if (entry.pdfFilename !== expectedPdfName) {
                        try {
                            console.log(`[DriveSync] Fixing mismatched PDF filename: "${entry.pdfFilename}" -> "${expectedPdfName}"`);
                            await this.renameFile(entry.pdfId, expectedPdfName);
                            await this.updateManifestEntry(fingerprint, { pdfFilename: expectedPdfName });
                        } catch (e) { console.warn(`[DriveSync] PDF rename failed: ${e.message}`); }
                    }
                }
                // Check JSON
                if (entry.syncId) {
                    const expectedJsonName = `${prefix}${hash}.json`;
                    if (entry.filename !== expectedJsonName) {
                        try {
                            console.log(`[DriveSync] Fixing mismatched JSON filename: "${entry.filename}" -> "${expectedJsonName}"`);
                            await this.renameFile(entry.syncId, expectedJsonName);
                            await this.updateManifestEntry(fingerprint, { filename: expectedJsonName });
                        } catch (e) { console.warn(`[DriveSync] JSON rename failed: ${e.message}`); }
                    }
                }
            }

            // --- 3. Handle PDF Data Sync ---
            const hasLocalPdf = !!(await db.get(`score_buf_${fingerprint}`));
            if (needsPDF || (this.app.pdfFingerprint === fingerprint)) {
                if (hasLocalPdf) {
                    const pdfData = await db.get(`score_buf_${fingerprint}`);
                    await this.uploadPDF(fingerprint, pdfData, targetTitle);
                }
            }

            // Auto-download PDF from cloud if missing locally
            const hasPdfInCloud = !!(entry && entry.pdfId);
            if (hasPdfInCloud && !hasLocalPdf) {
                try {
                    console.log(`[DriveSync] ↓ Auto-downloading PDF for "${targetTitle}"...`);
                    this.addLog(`正在下載雲端 PDF: ${targetTitle}`, 'system');
                    const buffer = await this.downloadPDF(fingerprint);
                    await db.set(`score_buf_${fingerprint}`, buffer);

                    const thumbnail = await this.app.scoreManager.helper.generateThumbnail(buffer.slice(0));
                    score.thumbnail = thumbnail;
                    score.isCloudOnly = false;
                    score.isPdfAvailable = true;
                    if (!score.fileName) score.fileName = `${prefix}.pdf`;
                    await this.app.scoreManager.saveRegistry();
                    this.app.scoreManager.render();
                } catch (err) { console.warn(`[DriveSync] PDF download failed:`, err.message); }
            }

            // --- 4. Metadata & Content Sync ---
            const isLocalNameGeneric = !localDetail?.name || localDetail.name === 'Unknown' || localDetail.name.includes('score_buf_');
            const hasRemoteRealName = entry?.name && entry.name !== 'Unknown' && !entry.name.includes('score_buf_');
            
            // Log the decision factors
            console.log(`[DriveSync] Sync decision for ${fingerprint.slice(0,8)}:`, {
                cloudUpdateTs, localUpdateTs, 
                passedCanPull: canPull, 
                isLocalNameGeneric, hasRemoteRealName
            });

            if (canPull || cloudUpdateTs > localUpdateTs || (isLocalNameGeneric && hasRemoteRealName)) {
                if (entry?.syncId) {
                    canPull = true;
                }
            } else if (localUpdateTs > cloudUpdateTs) {
                if (!score.isCloudOnly) {
                    needsPush = true;
                }
            }

            // 5. Execute PULL/PUSH
            // Manual sync or background scan can both trigger pulls
            if (canPull && entry?.syncId) {
                console.log(`[DriveSync] ↓ Pulling cloud data for "${targetTitle}"...`);
                const pulledVer = await this.pullBackground(fingerprint, entry.syncId);
                return pulledVer || true; 
            }

            if (needsPush) {
                // LOCK during push to prevent background batch overlapping with manual/timer sync
                if (this._pushLocks.has(fingerprint)) return;
                this._pushLocks.add(fingerprint);

                try {
                   const data = await this.gatherLocalData(fingerprint);
                   const fileId = entry ? entry.syncId : null;
                   const annotParent = this.annotationsFolderId || this.folderId;

                   if (fileId) {
                       await this.updateFile(fileId, data);
                   } else {
                       const newId = await this.createFile(`${prefix}${hash}.json`, data, annotParent);
                       if (newId) await this.updateManifestEntry(fingerprint, { syncId: newId });
                   }

                   await this.updateManifestEntry(fingerprint, {
                       name: targetTitle,
                       updated: Math.max(localUpdateTs, Date.now())
                   });

                   score.isSynced = true;
                   await this.app.scoreManager.saveRegistry();
                } finally {
                   this._pushLocks.delete(fingerprint);
                }
            }

            this.updateCloudStatsUI();
        } catch (err) {
            console.error(`[Sync] Failed sync score ${fingerprint}:`, err);
        }
    }

    /**
     * Headless pull for background scores — merges into IndexedDB without affecting active viewer.
     */
    async pullBackground(fingerprint, fileId) {
        if (!fileId) return 0;

        try {
            const remoteData = await this.getFileContent(fileId);
            if (!remoteData) return 0;

            // --- CRITICAL: Fingerprint Validation ---
            if (remoteData.fingerprint && remoteData.fingerprint !== fingerprint) {
                console.error(`[DriveSync] FINGERPRINT MISMATCH! Remote: ${remoteData.fingerprint.slice(0,8)} vs Local: ${fingerprint.slice(0,8)}`);
                console.log(`[DriveSync] Blocking pull for ${fileId} to prevent cross-score contamination.`);
                return 0;
            }

            const remoteVer = remoteData.version || 0;
            const score = this.app.scoreManager.registry.find(s => s.fingerprint === fingerprint);
            if (!score) return 0;

            const localDetail = await db.get(`detail_${fingerprint}`);
            const remoteDetail = remoteData.scoreDetail;

            let needsSave = false;
            const bgChanges = [];
            const scoreName = remoteDetail?.name || score.title || fingerprint.slice(0, 8);

            // 1. Merge Metadata — per-field to avoid stamp edits overwriting name
            if (remoteDetail) {
                const isLocalGeneric = !score.title || score.title === 'Unknown' || score.title.includes('score_buf_');
                const remoteNameTs = remoteDetail.nameEditedAt || 0;
                const localNameTs  = localDetail?.nameEditedAt  || 0;
                const shouldUpdateName = isLocalGeneric || (remoteNameTs > localNameTs);
                const remoteComposerTs = remoteDetail.composerEditedAt || 0;
                const localComposerTs  = localDetail?.composerEditedAt  || 0;
                const shouldUpdateMeta = shouldUpdateName || (remoteDetail.lastEdit > (localDetail?.lastEdit || 0));

                if (shouldUpdateMeta) {
                    const merged = { ...(localDetail || {}), ...remoteDetail };
                    if (!shouldUpdateName) {
                        merged.name = localDetail?.name || score.title;
                        merged.nameEditedAt = localNameTs;
                    }
                    if (remoteComposerTs <= localComposerTs) {
                        merged.composer = localDetail?.composer || score.composer;
                        merged.composerEditedAt = localComposerTs;
                    }
                    await db.set(`detail_${fingerprint}`, merged);
                    await this.app.scoreManager.updateMetadata(fingerprint, {
                        title: merged.name || score.title,
                        composer: merged.composer || 'Unknown'
                    }, true);

                    if (!score.dateImported || score.dateImported === 0) {
                        score.dateImported = remoteData.dateImported || remoteVer || Date.now();
                    }

                    needsSave = true;
                    if (isLocalGeneric && remoteDetail.name) {
                        bgChanges.push(`name resolved: "${remoteDetail.name}"`);
                    } else {
                        bgChanges.push(`metadata updated`);
                    }
                }
            }

            // 2. Merge Stamps, Sources, and Layers
            // We use DocActionManager's migration logic to handle legacy formats (marks/annotations)
            // and ensure all data is correctly sanitzed.
            const migratedData = this.app.docActionManager?.migrateLegacyData(remoteData) || remoteData;

            if (migratedData.stamps) {
                const localStamps = await db.get(`stamps_${fingerprint}`) || [];
                const localMap = new Map(localStamps.map(s => [s.id, s]));
                let newCount = 0;
                let updCount = 0;
                const newByType = {};

                const cloudStamps = migratedData.stamps || [];
                cloudStamps.forEach(remoteS => {
                    if (!remoteS.id) return;
                    const localS = localMap.get(remoteS.id);
                    if (!localS) {
                        localMap.set(remoteS.id, remoteS);
                        newCount++;
                        const t = remoteS.type || remoteS.stampType || 'unknown';
                        newByType[t] = (newByType[t] || 0) + 1;
                    } else if (remoteS.updatedAt > (localS.updatedAt || 0)) {
                        localMap.set(remoteS.id, remoteS);
                        updCount++;
                    }
                });

                if (newCount > 0 || updCount > 0) {
                    await db.set(`stamps_${fingerprint}`, Array.from(localMap.values()));
                    needsSave = true;
                    if (newCount > 0) {
                        const typeStr = Object.entries(newByType).map(([t, n]) => `${t}×${n}`).join(', ');
                        bgChanges.push(`+${newCount} stamp(s) [${typeStr}]`);
                        console.log(`[DriveSync] Pulled ${newCount} new migrated stamps for ${fingerprint}: ${typeStr}`);
                    }
                    if (updCount > 0) bgChanges.push(`updated ${updCount} stamp(s)`);
                }
            }

            // 2.5 Merge Sources & Layers (Isolated by Fingerprint)
            if (Array.isArray(migratedData.sources)) {
                const isCurrent = (this.app.pdfFingerprint === fingerprint);
                let localSources = isCurrent ? this.app.sources : (await db.get(`sources_${fingerprint}`)) || [];
                
                // Fallback for legacy scores currently relying on global sources
                if (localSources.length === 0 && isCurrent) {
                    localSources = this.app.sources || [];
                }

                const localSourceMap = new Map((localSources || []).map(s => [s.id, s]));
                let srcChanges = 0;
                migratedData.sources.forEach(rs => {
                    const existing = localSourceMap.get(rs.id);
                    if (!existing) {
                        rs.visible = true;
                        localSources.push(rs);
                        localSourceMap.set(rs.id, rs);
                        srcChanges++;
                    } else if ((rs.updatedAt || 0) > (existing.updatedAt || 0)) {
                        const wasVisible = existing.visible;
                        Object.assign(existing, rs);
                        if (wasVisible) existing.visible = true; 
                        srcChanges++;
                    }
                });

                if (srcChanges > 0) {
                    bgChanges.push(`merged ${srcChanges} interpretation styles`);
                    if (isCurrent) {
                        this.app.saveToStorage();
                        this.app.collaborationManager?.renderSourceUI();
                    } else {
                        await db.set(`sources_${fingerprint}`, localSources);
                    }
                }
            }

            if (Array.isArray(migratedData.layers)) {
                const isCurrent = (this.app.pdfFingerprint === fingerprint);
                let localLayers = isCurrent ? this.app.layers : (await db.get(`layers_${fingerprint}`)) || [];

                // Fallback for legacy
                if (localLayers.length === 0 && isCurrent) {
                    localLayers = this.app.layers || [];
                }

                const localLayerMap = new Map((localLayers || []).map(l => [l.id, l]));
                let lyrChanges = 0;
                migratedData.layers.forEach(rl => {
                    if (!localLayerMap.has(rl.id)) {
                        localLayers.push(rl);
                        localLayerMap.set(rl.id, rl);
                        lyrChanges++;
                    } else {
                        const ll = localLayerMap.get(rl.id);
                        if ((rl.updatedAt || 0) > (ll.updatedAt || 0)) {
                            Object.assign(ll, rl);
                            lyrChanges++;
                        }
                    }
                });
                if (lyrChanges > 0) {
                    bgChanges.push(`merged ${lyrChanges} layers`);
                    if (isCurrent) {
                        this.app.saveToStorage();
                        this.app.layerManager?.renderLayerUI();
                    } else {
                        await db.set(`layers_${fingerprint}`, localLayers);
                    }
                }
            }

            if (bgChanges.length > 0) {
                const label = score.isCloudOnly ? 'new file in cloud' : 'bg pull';
                console.log(`[DriveSync] ↓ ${label} "${scoreName}" — ${bgChanges.join(' | ')}`);
                this.log.record('pull', `${scoreName} — ${bgChanges.join(' | ')}`);
            }

            // 3. Mark as synced
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
     * Gather all local data for a score from various storage locations.
     */
    async gatherLocalData(fp) {
        let stamps = [];
        try {
            stamps = (await db.get(`stamps_${fp}`)) || [];
        } catch (e) { console.error('Failed to load stamps for sync', e); }

        const bookmarks = await db.get(`bookmarks_${fp}`) || [];

        const score = this.app.scoreManager.registry.find(s => s.fingerprint === fp);

        // HEAL: Ensure all marks being gathered for cloud have required sync metadata
        const now = Date.now();
        stamps.forEach(s => {
            if (!s.updatedAt) s.updatedAt = now;
            // Ensure type exists to prevent "all system" classification in cloud
            if (!s.type && s.points) s.type = 'pen';
            else if (!s.type && s.data) s.type = 'text';
            else if (!s.type) s.type = 'stamp';
        });

        return {
            stamps,
            bookmarks,
            sources: (fp === this.app.pdfFingerprint) ? (this.app.sources || []) : (await db.get(`sources_${fp}`)) || [],
            layers: (fp === this.app.pdfFingerprint) ? (this.app.layers || []) : (await db.get(`layers_${fp}`)) || [],
            scoreDetail: await this.app.scoreDetailManager?.getMetadata(fp) || {},
            version: Date.now(),
            fingerprint: fp,
            dateImported: score?.dateImported || 0
        };
    }

    /**
     * Manual score push wrapper. 
     * If fingerprint matches active PDF, it uses in-memory stamps.
     * Otherwise it gathers from DB.
     */
    async pushScore(fingerprint, isManual = false) {
        if (!this.folderId) return;
        
        // If it's the active score, we can use the regular push() which is already optimized
        if (fingerprint === this.app.pdfFingerprint) {
            return await this.push(0, isManual);
        }

        // For non-active score, we need a custom gather-then-upload flow
        if (this._pushLocks.has(fingerprint)) return;
        this._pushLocks.add(fingerprint);

        try {
            const data = await this.gatherLocalData(fingerprint);
            const entry = this.manifest[fingerprint];
            let fileId = entry?.syncId || await this.findSyncFile(fingerprint, 'sync');
            
            const prefix = this.safeTitle(data.scoreDetail?.name);
            const fileName = `${prefix}${this.shortHash(fingerprint)}.json`;
            const annotParent = this.annotationsFolderId || this.folderId;

            if (fileId) {
                await this.updateFile(fileId, data);
            } else {
                fileId = await this.createFile(fileName, data, annotParent);
            }

            if (fileId) {
                await this.updateManifestEntry(fingerprint, {
                    syncId: fileId,
                    name: prefix.replace(/_$/, ''),
                    filename: fileName,
                    updated: data.version
                });
                this.app.scoreManager?.updateSyncStatus(fingerprint, true);
            }
        } finally {
            this._pushLocks.delete(fingerprint);
        }
    }

    /**
     * Push local changes to Drive.
     */
    async push(remoteVersion = 0, isForced = false) {
        if (!this.folderId) return;

        const fingerprint = this.app.pdfFingerprint;
        if (!fingerprint) return;

        // --- CONCURRENCY LOCK ---
        if (this._pushLocks.has(fingerprint)) {
            console.log(`[DriveSync] Push for ${fingerprint.slice(0, 8)} is already in progress. Skipping duplicate.`);
            return;
        }
        this._pushLocks.add(fingerprint);

        this.uploadStatus.json.active = true;
        this.updateCloudStatsUI();

        try {
            const score = this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint);
            if (!score) return;

            // --- SKIP: Tombstoned scores ---
            const entry = this.manifest[fingerprint];
            if (entry?.deleted) {
                console.log(`[DriveSync] Push aborted: ${fingerprint.slice(0,8)} is tombstoned.`);
                return;
            }

            // --- FIXED: Use safe getMetadata instead of stale currentInfo ---
            const metadata = await this.app.scoreDetailManager?.getMetadata(fingerprint);
            
            const latestStampTime = this.app.stamps.length > 0
                ? Math.max(...this.app.stamps.map(s => s.updatedAt || 0))
                : 0;
            const localEdit = metadata?.lastEdit || 0;
            const latestLocalChange = Math.max(latestStampTime, localEdit);

            // Bypass sync skip check if forced
            if (!isForced && score.isSynced && remoteVersion <= (this.lastSyncTime || 0) && latestLocalChange <= (this.lastSyncTime || 0)) {
                console.log(`[DriveSync] Score ${score.title} is already synced. Skipping push.`);
                return;
            }

            this.addLog(`正在同步當前樂譜: ${score.title}`, 'system');

            // HEAL: Ensure all active stamps have updatedAt and proper types before push
            const now = Date.now();
            this.app.stamps.forEach(s => {
                if (!s.updatedAt) s.updatedAt = now - 1000; // slightly in the past
                
                // Try to recover type if it's missing or generic 'system'
                if (!s.type || s.type === 'system') {
                    if (s.points && s.points.length > 0) {
                        s.type = 'pen';
                        if (!s.layerId || s.layerId === 'others') s.layerId = 'draw';
                    } else if (s.data && (s.layerId === 'text' || s.layerId === 'draw' || s.layerId === 'others')) {
                        s.type = 'text';
                        if (!s.layerId || s.layerId === 'others') s.layerId = 'text';
                    } else if (s.draw && s.draw.type === 'text') {
                        s.type = 'text';
                        if (!s.layerId || s.layerId === 'others') s.layerId = 'text';
                    } else if (s.draw) {
                        s.type = 'stamp';
                    }
                }
            });

            const sinceLastSync = this.lastSyncTime || 0;
            const changedStamps = this.app.stamps.filter(s => (s.updatedAt || 0) > sinceLastSync);
            const diffParts = [];
            if (changedStamps.length > 0) {
                const byType = {};
                changedStamps.forEach(s => {
                    const t = s.type || s.stampType || 'unknown';
                    byType[t] = (byType[t] || 0) + 1;
                });
                const typeStr = Object.entries(byType).map(([t, n]) => `${t}×${n}`).join(', ');
                diffParts.push(`stamps: ${changedStamps.length} (${typeStr})`);
            }
            if (localEdit > sinceLastSync) {
                const metaName = metadata?.name || score.title;
                const prevName = score.title !== metaName ? ` (title: "${score.title}" → "${metaName}")` : '';
                diffParts.push(`metadata${prevName}`);
            }
            const diffStr = diffParts.length > 0 ? diffParts.join(' | ') : 'full sync';
            console.log(`[DriveSync] ↑ Push "${metadata?.name || score.title}" — changed: ${diffStr}`);

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
                scoreDetail: metadata,
                version: Date.now(),
                fingerprint
            };

            const typeCounts = {};
            this.app.stamps.forEach(s => {
                const t = s.type || 'undefined';
                typeCounts[t] = (typeCounts[t] || 0) + 1;
            });
            console.log(`[DriveSync] Push Data Prep: ${this.app.stamps.length} stamps. Breakdown:`, typeCounts);

            const scoreEntry = this.app.scoreManager?.registry?.find(s => s.fingerprint === fingerprint);
            const prefix = this.safeTitle(scoreEntry?.title);
            const fileName = `${prefix}${this.shortHash(fingerprint)}.json`;
            const annotParent = this.annotationsFolderId || this.folderId;
            
            // --- ID LOOKUP STRATEGY: Manifest First -> Sync Search -> Create ---
            let activeSyncId = entry?.syncId;
            
            if (!activeSyncId) {
                activeSyncId = await this.findSyncFile(fingerprint, 'sync');
            }

            if (activeSyncId) {
                await this.updateFile(activeSyncId, data);
            } else {
                console.log(`[DriveSync] 🆕 Creating new cloud file for: ${fileName}`);
                activeSyncId = await this.createFile(fileName, data, annotParent);
            }

            if (!activeSyncId) throw new Error('Failed to obtain or create Sync File ID');

            // Only set filename on first creation; preserve existing filename if file already existed
            const existingFilename = this.manifest[fingerprint]?.filename;
            await this.updateManifestEntry(fingerprint, {
                syncId: activeSyncId,
                name: prefix.replace(/_$/, ''),
                filename: existingFilename || fileName
            });

            this.addLog(`已上傳: ${stampsCount} 劃記, ${bookmarksCount} 書籤, ${sourcesCount} 詮釋`, 'success');
            this.log.record('push', `${score.title} — ${stampsCount} stamps, ${bookmarksCount} bookmarks`);
            this.lastSyncTime = data.version;
            localStorage.setItem(`scoreflow_sync_time_${fingerprint}`, data.version);

            // Keep registry title in sync with pushed metadata name
            if (metadata?.name && metadata.name !== score.title) {
                await this.app.scoreManager?.updateMetadata(fingerprint, {
                    title: metadata.name,
                    composer: metadata.composer || score.composer
                });
            }

            this.app.scoreManager?.updateSyncStatus(fingerprint, true);
        } catch (err) {
            console.error('[DriveSync] Push failed:', err);
            this.addLog('上傳資料失敗: ' + err.message, 'error');
        } finally {
            this._pushLocks.delete(fingerprint);
            this.uploadStatus.json.active = false;
            this.updateCloudStatsUI();
        }
    }

    pushDebounce(remoteVersion = 0) {
        if (this.pushDebounceTimer) clearTimeout(this.pushDebounceTimer);
        this.pushDebounceTimer = setTimeout(() => {
            this.push(remoteVersion);
        }, 2000);
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
            // Restore persisted lastSyncTime for this fingerprint (survives app restarts)
            if (!this.lastSyncTime) {
                const stored = parseInt(localStorage.getItem(`scoreflow_sync_time_${fingerprint}`) || '0');
                if (stored > 0) this.lastSyncTime = stored;
            }
            const localSyncTime = this.lastSyncTime || 0;

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

                const remoteIds = new Set(remoteData.stamps.map(s => s.id));
                // Only prune stamps that existed at last sync (updatedAt ≤ localSyncTime) but
                // are now absent from cloud. 
                // CRITICAL FIX: Only prune if updatedAt > 0. Legacy/unsynced marks (updatedAt=0) 
                // MUST be preserved until they receive a server timestamp or are pushed.
                const toPrune = localSyncTime > 0
                    ? this.app.stamps.filter(s => s.id && !remoteIds.has(s.id) && (s.updatedAt || 0) > 0 && (s.updatedAt || 0) <= localSyncTime)
                    : [];
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

            // 2. Sync Bookmarks
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

                const remoteBmIds = new Set(remoteData.bookmarks.map(bm => bm.id));
                const bmToPrune = localSyncTime > 0
                    ? this.app.jumpManager.bookmarks.filter(bm => bm.id && !remoteBmIds.has(bm.id) && (bm.updatedAt || 0) <= localSyncTime)
                    : [];
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

            // 3. Sync Sources
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

                const remoteSrcIds = new Set(remoteData.sources.map(src => src.id));
                const srcToPrune = localSyncTime > 0
                    ? this.app.sources.filter(src => src.id && !remoteSrcIds.has(src.id) && (src.updatedAt || 0) <= localSyncTime)
                    : [];
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

            // 4. Sync Layers
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

            // 5. Sync Score Detail — per-field merge to avoid stamp/media edits
            //    overwriting name/composer changes from the other device.
            const localInfo = this.app.scoreDetailManager?.currentInfo;
            if (remoteData.scoreDetail && localInfo) {
                const remote = remoteData.scoreDetail;
                let metaChanged = false;

                // name: compare nameEditedAt (falls back to lastEdit for old data)
                const remoteNameTs = remote.nameEditedAt || remote.lastEdit || 0;
                const localNameTs  = localInfo.nameEditedAt  || localInfo.lastEdit  || 0;
                const isLocalNameGeneric = !localInfo.name || localInfo.name === 'Unknown' || localInfo.name.includes('score_buf_');
                const hasRemoteRealName  = remote.name && remote.name !== 'Unknown' && !remote.name.includes('score_buf_');

                if ((remoteNameTs > localNameTs) || (isLocalNameGeneric && hasRemoteRealName)) {
                    if (remote.name && remote.name !== localInfo.name) {
                        console.log(`[DriveSync] ↓ name: "${localInfo.name}" → "${remote.name}" (remoteTs=${new Date(remoteNameTs).toLocaleTimeString()}, localTs=${new Date(localNameTs).toLocaleTimeString()})`);
                        localInfo.name = remote.name;
                        localInfo.nameEditedAt = remoteNameTs;
                        metaChanged = true;
                    }
                } else if (remote.name && remote.name !== localInfo.name) {
                    console.log(`[DriveSync] ↓ name SKIPPED (local newer): keeping "${localInfo.name}", remote had "${remote.name}"`);
                }

                // composer: compare composerEditedAt
                const remoteComposerTs = remote.composerEditedAt || remote.lastEdit || 0;
                const localComposerTs  = localInfo.composerEditedAt  || localInfo.lastEdit  || 0;
                if (remoteComposerTs > localComposerTs) {
                    if (remote.composer && remote.composer !== localInfo.composer) {
                        localInfo.composer = remote.composer;
                        localInfo.composerEditedAt = remoteComposerTs;
                        metaChanged = true;
                    }
                }

                // non-name fields: use lastEdit for the rest (media, stampScale, etc.)
                const remoteEdit = remote.lastEdit || 0;
                const localEdit  = localInfo.lastEdit || 0;
                if (remoteEdit > localEdit) {
                    localInfo.mediaList    = remote.mediaList    || localInfo.mediaList;
                    localInfo.activeMediaId = remote.activeMediaId ?? localInfo.activeMediaId;
                    localInfo.stampScale   = remote.stampScale   ?? localInfo.stampScale;
                    localInfo.lastEdit     = remoteEdit;
                    metaChanged = true;
                }

                if (metaChanged) {
                    this.app.scoreDetailManager.save(fingerprint);
                    this.app.scoreDetailManager.render(fingerprint);
                    if (localInfo.name) {
                        await this.app.scoreManager?.updateMetadata(fingerprint, {
                            title: localInfo.name,
                            composer: localInfo.composer || 'Unknown'
                        }, true);
                    }
                    hasChanges = true;
                    changesDetail.push(`metadata: name="${localInfo.name}"`);
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
            localStorage.setItem(`scoreflow_sync_time_${fingerprint}`, remoteVer);
            this.app.scoreManager?.updateSyncStatus(fingerprint, true);
            return remoteVer;
        } catch (err) {
            console.error('[DriveSync] Pull failed:', err);
            return 0;
        }
    }

    /**
     * Sync Global User Profile & Setlists.
     */
    async syncProfile() {
        if (!this.folderId || this.isProfileSyncing) return;
        this.isProfileSyncing = true;

        try {
            const fileName = 'user_profile_sync.json';
            
            if (!this.profileFileId) {
                this.profileFileId = await this.findFileByName(fileName);
            }
            
            const fileId = this.profileFileId;
            const localProfile = this.app.profileManager?.data;
            if (!localProfile) return;

            // Wait for SetlistManager to finish loading from DB before reading setlists.
            // If we read before init() completes, setlists would be [] and overwrite Drive with empty data.
            const sm = this.app.setlistManager;
            if (sm && !sm.isLoaded) {
                await new Promise(resolve => {
                    const check = setInterval(() => { if (sm.isLoaded) { clearInterval(check); resolve(); } }, 50);
                });
            }
            const localSetlists = sm?.setlists || [];

            if (fileId) {
                const remoteData = await this.getFileContent(fileId);
                let shouldPush = false;

                if (remoteData && remoteData.version > (this.lastProfileSyncTime || 0)) {
                    // 0. Sync GitHub token — pull from Drive if local is missing
                    if (remoteData.githubToken && !localStorage.getItem('scoreflow_github_token')) {
                        localStorage.setItem('scoreflow_github_token', remoteData.githubToken);
                        if (this.app.gistShareManager) this.app.gistShareManager._token = remoteData.githubToken;
                        console.log('[DriveSync] GitHub token synced from Drive.');
                    }

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

                    // 2. Merge Custom Text Library
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

                    // 3. Merge Setlists
                    if (Array.isArray(remoteData.setlists) && this.app.setlistManager) {
                        let setlistChanged = false;
                        const remoteSetlists = remoteData.setlists;

                        remoteSetlists.forEach(remoteSet => {
                            const localSet = this.app.setlistManager.setlists.find(s => s.id === remoteSet.id);
                            if (!localSet) {
                                this.app.setlistManager.setlists.push(remoteSet);
                                setlistChanged = true;
                            } else if ((remoteSet.updatedAt || 0) > (localSet.updatedAt || 0)) {
                                Object.assign(localSet, remoteSet);
                                setlistChanged = true;
                            }
                        });

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
                    if (localProfile.updatedAt > (this.lastProfileSyncTime || 0)) shouldPush = true;
                    const localNewestSetlist = Math.max(0, ...localSetlists.map(s => s.updatedAt || 0));
                    if (localNewestSetlist > (this.lastProfileSyncTime || 0)) shouldPush = true;
                }

                if (shouldPush || !this.lastProfileSyncTime) {
                    const payload = {
                        profile: localProfile,
                        userTextLibrary: this.app.userTextLibrary,
                        setlists: localSetlists,
                        githubToken: localStorage.getItem('scoreflow_github_token') || undefined,
                        version: Date.now()
                    };
                    await this.updateFile(fileId, payload);
                    this.lastProfileSyncTime = payload.version;
                    console.log('[DriveSync] Global sync data pushed (Newer).');
                }
            } else {
                const payload = {
                    profile: localProfile,
                    userTextLibrary: this.app.userTextLibrary,
                    setlists: localSetlists,
                    githubToken: localStorage.getItem('scoreflow_github_token') || undefined,
                    version: Date.now()
                };
                console.log(`[DriveSync] 🆕 Creating new profile sync file.`);
                this.profileFileId = await this.createFile(fileName, payload);
                this.lastProfileSyncTime = payload.version;
                this.addLog('首次上傳雲端設定與歌單', 'success');
            }
        } catch (err) {
            console.error('[DriveSync] Profile/Setlist sync failed:', err);
        } finally {
            this.isProfileSyncing = false;
        }
    }
}
