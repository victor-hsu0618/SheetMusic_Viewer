import * as db from '../db.js';
import { computeFingerprint } from '../fingerprint.js';
import * as pdfjsLib from 'pdfjs-dist';

export class ScoreRegistryHelper {
    constructor(app, manager) {
        this.app = app;
        this.manager = manager;
    }

    async saveRegistry(registry) {
        await db.set('score_registry', registry);
    }

    async calculateFingerprint(buffer) {
        return computeFingerprint(buffer);
    }

    async generateThumbnail(buffer) {
        // Thumbnails disabled for performance and "File Manager" speed
        return null;
    }

    async migrateLegacyData() {
        const legacyList = JSON.parse(localStorage.getItem('scoreflow_recent_solo_scores') || '[]');
        if (legacyList.length === 0) return;

        console.log(`[ScoreRegistryHelper] Migrating ${legacyList.length} legacy scores...`);

        for (const item of legacyList) {
            const buffer = await db.get(`recent_buf_${item.name}`);
            if (buffer) {
                const fingerprint = await this.calculateFingerprint(buffer);
                if (!this.manager.registry.find(s => s.fingerprint === fingerprint)) {
                    await this.manager.importScore({ name: item.name }, buffer.slice(0));
                }
            }
        }
        localStorage.removeItem('scoreflow_recent_solo_scores');
    }

    async migrateFallbackFingerprints() {
        const fallbackEntries = this.manager.registry.filter(s => s.fingerprint?.startsWith('fallback_'));
        if (fallbackEntries.length === 0) return;

        console.log(`[ScoreRegistryHelper] Migrating ${fallbackEntries.length} fallback_ fingerprint(s) to SHA-256...`);
        let changed = false;

        for (const entry of fallbackEntries) {
            const oldFp = entry.fingerprint;
            const buffer = await db.get(`score_buf_${oldFp}`);
            if (!buffer) {
                this.manager.registry = this.manager.registry.filter(s => s.fingerprint !== oldFp);
                changed = true;
                continue;
            }

            const newFp = await this.calculateFingerprint(new Uint8Array(buffer));
            if (newFp === oldFp) continue;

            const duplicate = this.manager.registry.find(s => s.fingerprint === newFp);
            if (duplicate) {
                this.manager.registry = this.manager.registry.filter(s => s.fingerprint !== oldFp);
            } else {
                entry.fingerprint = newFp;
                await db.set(`score_buf_${newFp}`, buffer);
                await db.remove(`score_buf_${oldFp}`);
                // Move other related data...
                const stamps = await db.get(`stamps_${oldFp}`);
                if (stamps) { await db.set(`stamps_${newFp}`, stamps); await db.remove(`stamps_${oldFp}`); }
            }
            changed = true;
        }

        if (changed) {
            await this.saveRegistry(this.manager.registry);
            this.manager.render();
        }
    }

    async getScoreBuffer(fp) {
        return await db.get(`score_buf_${fp}`);
    }

    async exportScoreData(fp) {
        const score = this.manager.registry.find(s => s.fingerprint === fp);
        let stamps = [];
        try {
            stamps = (await db.get(`stamps_${fp}`)) || [];
        } catch (e) { console.error('Export stamps failed:', e); }

        let detail = null;
        try {
            detail = await db.get(`detail_${fp}`) || null;
        } catch (e) { console.error('Export detail failed:', e); }

        return {
            fingerprint: fp,
            exportedAt: Date.now(),
            app: 'ScoreFlow',
            version: '3.0',
            score: score || { title: 'Unknown' },
            annotations: stamps,
            metadata: detail
        };
    }

    async migrateFingerprint(oldFp, newFp, title = 'Recovered') {
        if (!oldFp || !newFp || oldFp === newFp) return;
        
        console.log(`[ScoreRegistryHelper] 🛠️ AUTO-REPAIR: Migrating ${oldFp.slice(0,8)} -> ${newFp.slice(0,8)}`);
        
        // 1. Migrate IndexedDB Records
        const keys = [
            { old: `score_buf_${oldFp}`, new: `score_buf_${newFp}` },
            { old: `stamps_${oldFp}`, new: `stamps_${newFp}` },
            { old: `detail_${oldFp}`, new: `detail_${newFp}` },
            { old: `bookmarks_${oldFp}`, new: `bookmarks_${newFp}` },
            { old: `sources_${oldFp}`, new: `sources_${newFp}` },
            { old: `layers_${oldFp}`, new: `layers_${newFp}` }
        ];

        for (const pair of keys) {
            const data = await db.get(pair.old);
            if (data !== undefined && data !== null) {
                await db.set(pair.new, data);
                await db.remove(pair.old);
                console.log(`   -> Migrated ${pair.old}`);
            }
        }

        // 2. Update Registry
        const entry = this.manager.registry.find(s => s.fingerprint === oldFp);
        const duplicate = this.manager.registry.find(s => s.fingerprint === newFp);

        if (entry) {
            if (duplicate) {
                // If the new fingerprint already exists (maybe from another device sync), 
                // just remove the old one. Merge logic for markings would be ideal but risky here.
                this.manager.registry = this.manager.registry.filter(s => s.fingerprint !== oldFp);
            } else {
                entry.fingerprint = newFp;
                entry.title = entry.title || title;
            }
            await this.saveRegistry(this.manager.registry);
            this.manager.render();
        }

        console.log(`[ScoreRegistryHelper] ✅ Migration complete.`);
    }

    triggerDownload(filename, content) {
        const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async rebuildLibrary() {
        if (!confirm('Rebuild library will scan all local PDF buffers and recreate your registry index. Proceed?')) return;
        this.app.showMessage('Scanning IndexedDB for orphan files...', 'system');
        console.log('[ScoreRegistryHelper] Rebuilding library from IndexedDB buffers...');
        
        try {
            // Get all keys from DB using a helper if available, or brute force prefix
            // For now, we assume db has a way to get all keys or we use common prefixes
            const allKeys = await db.getAllKeys(); 
            const bufferKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('score_buf_'));
            console.log(`[ScoreRegistryHelper] Found ${bufferKeys.length} PDF buffer(s) in storage.`);

            const newRegistry = [];
            for (const key of bufferKeys) {
                const fp = key.replace('score_buf_', '');
                const buffer = await db.get(key);
                if (!buffer) continue;

                // Recover metadata if possible
                const detail = await db.get(`detail_${fp}`);
                const score = this.manager.registry.find(s => s.fingerprint === fp);
                const thumbnail = await this.generateThumbnail(buffer.slice(0)).catch(() => null);

                newRegistry.push({
                    fingerprint: fp,
                    title: detail?.name || (score?.title && score.title !== 'Unknown' ? score.title : `Recovered (${fp.slice(0, 6)})`),
                    fileName: detail?.name ? detail.name + '.pdf' : (score?.fileName || 'recovered.pdf'),
                    composer: detail?.composer || (score?.composer !== 'Unknown' ? score.composer : 'Unknown'),
                    thumbnail: thumbnail,
                    dateImported: score?.dateImported || Date.now(),
                    lastAccessed: score?.lastAccessed || Date.now(),
                    tags: score?.tags || [],
                    isSynced: score?.isSynced || false,
                    storageMode: score?.storageMode || 'cached'
                });
                console.log(`[ScoreRegistryHelper] Recovered score: ${fp.slice(0, 8)}...`);
            }

            this.manager.registry = newRegistry;
            await this.saveRegistry(this.manager.registry);
            this.manager.render();
            
            console.log('[ScoreRegistryHelper] ✓ REBUILD: Success. Restoration complete.');
            this.app.showMessage(`Library rebuilt! ${newRegistry.length} scores recovered. 🧩`, 'success');
        } catch (err) {
            console.error('[ScoreRegistryHelper] ❌ Error rebuilding library:', err);
            this.app.showMessage('Rebuild failed: ' + err.message, 'error');
        }
    }
    async healLibrary() {
        this.app.showMessage('Healing metadata and fix titles...', 'system');
        console.log('[ScoreRegistryHelper] 🏥 Healing Library Registry & Purging Thumbnails...');
        let changed = false;

        for (const entry of this.manager.registry) {
            // PURGE THUMBNAILS: Clear stored images to save megabytes of space
            if (entry.thumbnail) {
                entry.thumbnail = null;
                changed = true;
            }

            if (!entry.fileName) continue;

            const baseFileName = entry.fileName.replace(/\.pdf$/i, '').trim();
            const currentTitle = (entry.title || '').trim();

            // Log mismatch for diagnostics only — do NOT auto-overwrite user-set titles
            const clean = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (clean(baseFileName) !== clean(currentTitle) && currentTitle && !currentTitle.includes(baseFileName)) {
                console.warn(`[ScoreRegistryHelper] ⚠️ title/fileName mismatch for ${entry.fingerprint.slice(0, 8)} (no action taken):`);
                console.warn(`   Title:    "${currentTitle}"`);
                console.warn(`   FileName: "${baseFileName}"`);
            }
        }

        if (changed) {
            console.log('[ScoreRegistryHelper] ✓ HEAL: Successfully repaired and purged library index.');
            this.app.showMessage('Metadata fixed and thumbnails purged! 🧼', 'success');
            await this.saveRegistry(this.manager.registry);
            this.manager.render();
            
            // SYNC TO CLOUD: If we healed, ensure cloud gets update too!
            if (this.app.supabaseManager) {
                await this.app.supabaseManager.syncScoreRegistry(this.manager.registry);
            }
        } else {
            this.app.showMessage('Your library is already healthy. ✨', 'info');
        }
    }
    
    /**
     * One-time background migration to backfill lastAnnotationUpdate timestamps
     * by scanning local IndexedDB stamps for each registry entry.
     */
    async backfillLastAnnotationTimestamps() {
        const needsUpdate = this.manager.registry.filter(s => !s.lastAnnotationUpdate);
        if (needsUpdate.length === 0) return;

        console.log(`[ScoreRegistryHelper] 🧹 Backfilling annotation timestamps for ${needsUpdate.length} scores...`);
        let changed = false;

        // Process in small batches to avoid blocking main thread extensively
        for (const entry of needsUpdate) {
            try {
                const stamps = await db.get(`stamps_${entry.fingerprint}`);
                if (stamps && Array.isArray(stamps) && stamps.length > 0) {
                    // Find max updatedAt (standardized by our recent fixes to be numeric)
                    const maxTime = Math.max(...stamps.map(s => Number(s.updatedAt) || 0));
                    if (maxTime > 0) {
                        entry.lastAnnotationUpdate = maxTime;
                        changed = true;
                    }
                } else {
                    // No stamps found, mark as 0 or null to avoid re-scanning every time?
                    // Let's set to -1 as a seen-but-empty flag
                    entry.lastAnnotationUpdate = -1; 
                    changed = true;
                }
            } catch (err) {
                console.error(`[ScoreRegistryHelper] Failed backfill for ${entry.fingerprint}:`, err);
            }
            
            // Artificial breathing room every score
            await new Promise(r => setTimeout(r, 20));
        }

        if (changed) {
            console.log(`[ScoreRegistryHelper] ✅ Timestamp backfill complete.`);
            await this.saveRegistry(this.manager.registry);
            this.manager.render();
        }
    }

    /**
     * LRU eviction for page-render bitmap cache.
     * Keeps cache for only the 5 most recently accessed scores.
     * Also removes orphan cache entries whose fingerprint is not in the registry.
     */
    async evictPageRenderCache() {
        const MAX_CACHED_SCORES = 5;
        try {
            const allKeys = await db.getAllKeys();
            const cacheKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('page_render_'));

            if (cacheKeys.length === 0) return;

            // Extract unique fingerprints from cache keys (format: page_render_<fp>_p<num>)
            const cachedFps = new Set();
            for (const key of cacheKeys) {
                const rest = key.slice('page_render_'.length); // <fp>_p<num>
                const lastP = rest.lastIndexOf('_p');
                if (lastP > 0) cachedFps.add(rest.slice(0, lastP));
            }

            const registryFps = new Set(this.manager.registry.map(s => s.fingerprint));

            // 1. Find orphans — cached fingerprints not in registry
            const orphanFps = new Set();
            for (const fp of cachedFps) {
                if (!registryFps.has(fp)) orphanFps.add(fp);
            }

            // 2. LRU eviction — among registry entries that have cache, keep top N by lastAccessed
            const cachedRegistryEntries = this.manager.registry
                .filter(s => cachedFps.has(s.fingerprint))
                .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));

            const evictFps = new Set();
            for (let i = MAX_CACHED_SCORES; i < cachedRegistryEntries.length; i++) {
                evictFps.add(cachedRegistryEntries[i].fingerprint);
            }

            // 3. Collect all keys to remove
            const toRemoveFps = new Set([...orphanFps, ...evictFps]);
            if (toRemoveFps.size === 0) return;

            const keysToRemove = cacheKeys.filter(k => {
                const rest = k.slice('page_render_'.length);
                const lastP = rest.lastIndexOf('_p');
                if (lastP <= 0) return false;
                return toRemoveFps.has(rest.slice(0, lastP));
            });

            console.log(`[ScoreRegistryHelper] 🧹 Evicting page-render cache: ${orphanFps.size} orphan(s), ${evictFps.size} LRU eviction(s), ${keysToRemove.length} key(s) total`);
            await Promise.all(keysToRemove.map(k => db.remove(k)));
        } catch (err) {
            console.error('[ScoreRegistryHelper] Page-render cache eviction failed:', err);
        }
    }
}
