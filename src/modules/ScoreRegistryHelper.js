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
        try {
            const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/');
            const pdf = await pdfjsLib.getDocument({
                data: buffer,
                cMapUrl: new URL('pdfjs/cmaps/', baseUrl).href,
                cMapPacked: true,
                standardFontDataUrl: new URL('pdfjs/standard_fonts/', baseUrl).href,
                jbig2WasmUrl: new URL('pdfjs/wasm/jbig2.wasm', baseUrl).href,
                wasmUrl: new URL('pdfjs/wasm/', baseUrl).href,
                isEvalSupported: false,
                stopAtErrors: false
            }).promise;

            const page = await pdf.getPage(1);
            const viewport = page.getViewport({ scale: 0.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            return canvas.toDataURL('image/webp', 0.7);
        } catch (err) {
            console.error('[ScoreRegistryHelper] Thumbnail failed:', err);
            return null;
        }
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
                const stamps = await db.get(`score_stamps_${oldFp}`);
                if (stamps) { await db.set(`score_stamps_${newFp}`, stamps); await db.remove(`score_stamps_${oldFp}`); }
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
            const storedStamps = await db.get(`score_stamps_${fp}`);
            if (storedStamps) stamps = storedStamps;
            else {
                // Fallback to localStorage if needed
                const local = localStorage.getItem(`scoreflow_stamps_${fp}`);
                if (local) stamps = JSON.parse(local);
            }
        } catch (e) { console.error('Export stamps failed:', e); }

        let detail = null;
        try {
            const storedDetail = await db.get(`score_detail_${fp}`);
            if (storedDetail) detail = storedDetail;
            else {
                const local = localStorage.getItem(`scoreflow_detail_${fp}`);
                if (local) detail = JSON.parse(local);
            }
        } catch (e) { console.error('Export detail failed:', e); }

        return {
            fingerprint: fp,
            exportedAt: Date.now(),
            app: 'ScoreFlow',
            version: '2.3',
            score: score || { title: 'Unknown' },
            annotations: stamps,
            metadata: detail
        };
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
        console.log('[ScoreRegistryHelper] Rebuilding library from IndexedDB buffers...');
        this.app.showMessage('Rebuilding library...', 'system');
        
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
                const detail = await db.get(`score_detail_${fp}`) || await db.get(`score_detail_${fp}`);
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
            this.app.showMessage(`Library rebuilt: ${newRegistry.length} score(s) recovered.`, 'success');
            console.log(`[ScoreRegistryHelper] Rebuild complete. ${newRegistry.length} entries.`);
        } catch (err) {
            console.error('[ScoreRegistryHelper] Rebuild failed:', err);
            this.app.showMessage('Rebuild failed: ' + err.message, 'error');
        }
    }
}
