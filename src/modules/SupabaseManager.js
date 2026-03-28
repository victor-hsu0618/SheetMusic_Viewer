import { createClient } from '@supabase/supabase-js'
import * as db from '../db.js'

export class SupabaseManager {
    constructor(app) {
        this.app = app
        this.client = null
        this.user = null
        
        // Configuration - ideally these would come from env vars or a settings UI
        this.url = localStorage.getItem('scoreflow_supabase_url') || 'https://tanoqdnqtxqxerwcbdlf.supabase.co'
        this.key = localStorage.getItem('scoreflow_supabase_key') || 'sb_publishable_CqpxXMRonYfz25IHc3VYvQ_CSKrgFU4'
        
        if (this.url && this.key) {
            this.initClient()
        }
    }

    initClient() {
        try {
            this.client = createClient(this.url, this.key)
            this.setupAuthListener()
            console.log('[Supabase] Client initialized.')
        } catch (err) {
            console.error('[Supabase] Failed to initialize client:', err)
        }
    }

    setupAuthListener() {
        if (!this.client) return

        this.client.auth.onAuthStateChange((event, session) => {
            this.user = session?.user || null
            console.log(`[Supabase] Auth state: ${event}`, this.user?.email)
            
            if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                if (event === 'SIGNED_IN') {
                    this.app.uiManager?.showToast?.(`Welcome, ${this.user.email}`, 'success')
                }

                // --- NEW GLUE: Sync User Profile and Global Library ---
                this.pullProfile().then(data => {
                    if (data && this.app.profileManager) {
                        this.app.profileManager.data = { ...this.app.profileManager.data, ...data };
                        this.app.profileManager.render();
                    }
                });

                // Setlist Sync - Dedicated Table
                this.pullSetlists().then(async cloudSetlists => {
                    if (cloudSetlists && this.app.setlistManager) {
                        await this.app.setlistManager.mergeSetlists(cloudSetlists);
                    }
                    // Always push merged result back to ensure new `setlists` column is populated
                    // (migrates data from legacy data.setlists fallback on first login)
                    if (this.app.setlistManager?.setlists?.length) {
                        this.pushSetlists(this.app.setlistManager.setlists);
                    }
                });

                if (this.app.scoreManager) {
                    this.pullScoreRegistry();
                }

                this.syncPanelConfig()

                // User content sync (userTextLibrary, etc.)
                this.pullUserContent().then(content => {
                    if (!content) return
                    if (Array.isArray(content.userTextLibrary)) {
                        this.app.userTextLibrary = content.userTextLibrary
                        localStorage.setItem('scoreflow_user_text_library', JSON.stringify(content.userTextLibrary))
                    }
                })

                // Background-sync all annotations once at login — no per-score pull needed
                this.backgroundSyncAllAnnotations()

                if (this.app.pdfFingerprint) {
                    this.subscribeToAnnotations(this.app.pdfFingerprint)
                }
            } else if (event === 'SIGNED_OUT') {
                this.unsubscribeAnnotations()
            }
        })
    }

    // --- REALTIME ---

    subscribeToAnnotations(fingerprint) {
        if (!this.client || !this.user || !fingerprint) return
        
        // Use a safe, unique channel name with prefix
        const channelName = `room_${fingerprint.substring(0, 12)}`;

        if (this.channel && this.currentFingerprint === fingerprint) {
            return
        }

        this.unsubscribeAnnotations()
        this.currentFingerprint = fingerprint

        console.log(`[Supabase] 📡 JOINING: ${channelName}`)
        this.channel = this.client
            .channel(channelName)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'annotations',
                filter: `fingerprint=eq.${fingerprint}`
            }, (payload) => {
                // WIRE-LEVEL DEBUG: See EVERY packet entering this machine's subscription
                console.log(`[Supabase] 🛰️ Pulse [${payload.eventType}]:`, payload.new?.id || payload.old?.id);

                // Since we have a server-side filter, anything arriving here should match.
                // However, we'll keep a loose safety check that doesn't block empty DELETE payloads.
                const targetFp = String(fingerprint).trim().toLowerCase();
                const packetFp = String(payload.new?.fingerprint || payload.old?.fingerprint || '').trim().toLowerCase();
                
                if (!packetFp || packetFp === targetFp) {
                    console.log('%c⚡ REALTIME MATCH', 'background: #222; color: #bada55', payload.eventType);
                    this.handleRealtimePayload(payload)
                } else {
                    console.log(`[Supabase] 📡 Ignored packet (FP mismatch: ${packetFp} vs ${targetFp})`);
                }
            })
            .subscribe((status) => {
                console.log(`[Supabase] 📡 Status [${fingerprint.substring(0,8)}]: ${status}`)
                if (status === 'SUBSCRIBED') {
                    console.log('[Supabase] ✅ Live sync established.')
                }
            })
    }

    unsubscribeAnnotations() {
        if (this.channel) {
            this.client.removeChannel(this.channel)
            this.channel = null
        }
    }

    async handleRealtimePayload(payload) {
        const { eventType, new: newRecord, old: oldRecord } = payload

        if (eventType === 'INSERT' || eventType === 'UPDATE') {
            const stamp = newRecord.data
            if (!stamp) return

            const idx = this.app.stamps.findIndex(s => s.id === stamp.id)
            if (idx !== -1) {
                // OPTIMISTIC LOCK: Only accept cloud version if it's strictly NEWER than local
                const localStamp = this.app.stamps[idx]
                if ((stamp.updatedAt || 0) <= (localStamp.updatedAt || 0)) {
                    console.log(`[Supabase] 🛡️ Ignored stale cloud update for [${stamp.type}] (Local: ${localStamp.updatedAt}, Cloud: ${stamp.updatedAt})`)
                    return
                }
                console.log(`   -> Syncing existing stamp [${stamp.type}] (Newer cloud version)`)
                this.app.stamps[idx] = stamp
            } else {
                console.log(`   -> New stamp from cloud [${stamp.type}]`)
                this.app.stamps.push(stamp)
            }
        } else if (eventType === 'DELETE') {
            const deleteId = oldRecord?.id 
            if (deleteId) {
                console.log(`[Supabase] 🗑️ Cloud DELETE: ${deleteId}`)
                this.app.stamps = this.app.stamps.filter(s => s.id !== deleteId)
            }
        }

        const incomingPage = (newRecord || oldRecord)?.page;

        // Create a local backup or notify system
        if (this.app.annotationManager) {
            console.log(`[Supabase] 🎨 Sync redraw triggered for page: ${incomingPage || 'unknown'}`)
            
            // 1. Target the specific page first (fastest, most direct)
            if (incomingPage) {
                this.app.annotationManager.redrawStamps(incomingPage);
            }
            
            // 2. Refresh global layers (handles cross-page dependencies)
            this.app.annotationRenderer?.redrawAllAnnotationLayers(true);
        }

        // Save to IndexedDB too for persistence
        if (this.app.pdfFingerprint) {
            const fp = this.app.pdfFingerprint;
            import('../db.js').then(db => db.set(`stamps_${fp}`, this.app.stamps))
        }
    }

    async signIn(email, password) {
        if (!this.client) return { error: 'Supabase not configured' }
        const { data, error } = await this.client.auth.signInWithPassword({ email, password })
        return { data, error }
    }

    async signOut() {
        if (!this.client) return
        await this.client.auth.signOut()
    }

    // --- Phase 3: CRUD Operations ---

    /**
     * Ensures the score exists in Supabase 'scores' table.
     */
    // --- (Removed Redundant syncScore) ---

    /**
     * Pushes a single annotation to Supabase.
     * @param {Object} stamp The annotation object from app.stamps
     * @param {string} fingerprint The score fingerprint
     */
    async pushAnnotation(stamp, fingerprint) {
        if (!this.client) {
            console.warn('[Supabase] ⚠️ Push skipped: Client not initialized.')
            return
        }
        if (!this.user) {
            // Silence warning for ordinary unauthenticated usage
            return
        }
        if (!fingerprint) {
            console.warn('[Supabase] ⚠️ Push skipped: Missing score fingerprint.')
            return
        }
        
        // Deleted stamps: hard-delete from Supabase to prevent accumulation
        if (stamp.deleted) {
            return this.deleteAnnotation(stamp.id)
        }

        // Skip system stamps unless sync is explicitly enabled
        if (stamp.type === 'system' && localStorage.getItem('scoreflow_sync_system_stamps') !== 'true') {
            return
        }

        // Map app stamp structure to Supabase DB schema
        const dbRecord = {
            id: stamp.id,
            fingerprint: fingerprint,
            user_id: this.user.id,
            layer_id: stamp.layerId || 'draw',
            type: stamp.type,
            page: stamp.page || 0,
            data: stamp,
            updated_at: stamp.updatedAt ? new Date(stamp.updatedAt).toISOString() : new Date().toISOString()
        }

        try {
            const { error } = await this.client
                .from('annotations')
                .upsert(dbRecord)

            if (error) {
                console.error('[Supabase] ❌ Push annotation error:', error.message)
            }
        } catch (err) {
            console.warn('[Supabase] ⚠️ Push annotation failed (network/offline):', err.message)
        }
    }

    /**
     * Deletes an annotation from Supabase.
     */
    async deleteAnnotation(id) {
        if (!this.client || !this.user) return

        try {
            const { error } = await this.client
                .from('annotations')
                .delete()
                .eq('id', id)
                .eq('user_id', this.user.id)

            if (error) {
                console.error('[Supabase] ❌ Delete annotation error:', error.message)
            }
        } catch (err) {
            console.warn('[Supabase] ⚠️ Delete annotation failed (network/offline):', err.message)
        }
    }

    /**
     * Pushes all annotations for a specific score to Supabase in a single batch.
     */
    async pushAllAnnotations(fingerprint, stamps) {
        if (!this.client || !this.user || !fingerprint) return false;
        
        if (!stamps || stamps.length === 0) {
            console.log('[Supabase] No annotations to push.');
            return true;
        }

        console.log(`[Supabase] ⬆️ Batch pushing ${stamps.length} annotations...`);

        const dbRecords = stamps.map(stamp => {
            // Ensure ID is a string
            const id = String(stamp.id);
            
            return {
                id: id,
                fingerprint: fingerprint,
                user_id: this.user.id,
                layer_id: stamp.layerId || 'draw',
                type: stamp.type,
                page: stamp.page || 0,
                data: stamp,
                updated_at: stamp.updated_at || stamp.updatedAt ? new Date(stamp.updated_at || stamp.updatedAt).toISOString() : new Date().toISOString()
            };
        });

        // Supabase upsert supports arrays for bulk operations
        const { error } = await this.client
            .from('annotations')
            .upsert(dbRecords);

        if (error) {
            console.error('[Supabase] ❌ Batch push error:', error.message);
            return false;
        }

        console.log('[Supabase] ✅ Batch push successful.');
        return true;
    }
    /**
     * Bidirectional sync on PDF open:
     * 1. Pull cloud stamps (source of truth for what exists in cloud)
     * 2. Push any local-only stamps up (catch annotations created before Supabase or during offline)
     * 3. Merge both sets → update app.stamps + redraw
     */
    async syncAnnotationsOnLoad(fingerprint) {
        if (!this.client || !this.user) return

        // 1. Read local stamps from IndexedDB BEFORE any override
        const localStamps = (await db.get(`stamps_${fingerprint}`)) || []
        const localActive = localStamps.filter(s => !s?.deleted)

        // 2. Pull cloud
        const { data, error } = await this.client
            .from('annotations')
            .select('*')
            .eq('fingerprint', fingerprint)
            .eq('user_id', this.user.id)

        if (error) {
            console.error('[Supabase] syncAnnotationsOnLoad pull error:', error)
            return
        }

        // Guard: fingerprint may have changed while pull was in flight
        if (this.app.pdfFingerprint !== fingerprint) return

        const cloudStamps = (data || []).map(r => r.data).filter(s => !s?.deleted)
        const cloudIds = new Set(cloudStamps.map(s => s.id))

        const syncSystemStamps = localStorage.getItem('scoreflow_sync_system_stamps') === 'true'

        // 3. Build a local map for quick lookup
        const localMap = new Map(localActive.map(s => [s.id, s]))

        // 4. Merge: newer updatedAt wins; local-only stamps get pushed up
        const merged = []
        const toUpload = []

        for (const cloudS of cloudStamps) {
            const local = localMap.get(cloudS.id)
            if (local && (local.updatedAt || 0) > (cloudS.updatedAt || 0)) {
                // Local is newer → keep local, push it up
                merged.push(local)
                toUpload.push(local)
            } else {
                merged.push(cloudS)
            }
        }

        // Local-only stamps (never reached Supabase)
        for (const local of localActive) {
            if (!cloudIds.has(local.id)) {
                if (syncSystemStamps || local.type !== 'system') toUpload.push(local)
                merged.push(local)
            }
        }

        if (toUpload.length > 0) {
            console.log(`[Supabase] syncOnLoad: uploading ${toUpload.length} newer/local-only stamps`)
            for (const s of toUpload) {
                await this.pushAnnotation(s, fingerprint)
            }
        }

        this.app.stamps = merged
        this.app.redrawAllAnnotationLayers?.()
        db.set(`stamps_${fingerprint}`, merged)

        console.log(`[Supabase] syncOnLoad: ${cloudStamps.length} cloud, ${toUpload.length} uploaded, ${merged.length} total`)
    }

    /**
     * Fetches all annotations for a score from Supabase.
     */
    async pullAnnotations(fingerprint, force = false) {
        if (!this.client || !this.user) return []
        
        console.log(`[Supabase] Pulling annotations for ${fingerprint} (Force: ${force})`)
        const { data, error } = await this.client
            .from('annotations')
            .select('*')
            .eq('fingerprint', fingerprint)
            .eq('user_id', this.user.id)

        if (error) {
            console.error('[Supabase] Pull annotations error:', error)
            return null
        }

        const cloudStamps = (data || []).map(record => record.data).filter(s => !s?.deleted)

        // Guard: if user switched scores while pull was in flight, do NOT touch this.app.stamps.
        // Only update local IndexedDB so the correct data is available next time this score loads.
        if (this.app.pdfFingerprint !== fingerprint) {
            console.warn(`[Supabase] pullAnnotations: fp mismatch — pull was for ${fingerprint.slice(0,8)}, current is ${this.app.pdfFingerprint?.slice(0,8)}. Saving to IndexedDB only.`)
            db.set(`stamps_${fingerprint}`, cloudStamps)
            return cloudStamps
        }

        if (force) {
            console.log(`[Supabase] Force Sync: Replacing all ${this.app.stamps.length} local stamps with ${cloudStamps.length} cloud stamps.`)
            this.app.stamps = cloudStamps
            this.app.redrawAllAnnotationLayers()
        } else if (data && data.length > 0) {
            // Merge logic: Add new ones, update existing if cloud is newer
            let changed = false
            cloudStamps.forEach(cloudS => {
                const localIdx = this.app.stamps.findIndex(s => s.id === cloudS.id)
                if (localIdx === -1) {
                    this.app.stamps.push(cloudS)
                    changed = true
                } else {
                    if ((cloudS.updatedAt || 0) > (this.app.stamps[localIdx].updatedAt || 0)) {
                        this.app.stamps[localIdx] = cloudS
                        changed = true
                    }
                }
            })

            if (changed) {
                this.app.redrawAllAnnotationLayers()
                console.log(`[Supabase] Merged ${cloudStamps.length} stamps from cloud.`)
            }
        }

        // Always update local storage with the final state
        db.set(`stamps_${fingerprint}`, this.app.stamps)

        return this.app.stamps
    }

    /**
     * Background sync: fetch only annotations updated since last sync,
     * then update IndexedDB for every affected fingerprint.
     * Called once on app startup / login — opening a score reads only IndexedDB.
     */
    async backgroundSyncAllAnnotations() {
        if (!this.client || !this.user) return

        const syncKey = `scoreflow_annot_sync_${this.user.id}`
        const lastSync = localStorage.getItem(syncKey)  // ISO string or null

        console.log(`[Supabase] Background sync: fetching annotations updated since ${lastSync ?? 'beginning'}`)

        const syncStartedAt = new Date().toISOString()

        let query = this.client
            .from('annotations')
            .select('fingerprint, data, updated_at')
            .eq('user_id', this.user.id)

        if (lastSync) {
            query = query.gt('updated_at', lastSync)
        }

        const { data, error } = await query

        if (error) {
            console.warn('[Supabase] Background sync failed:', error)
            return
        }

        if (!data || data.length === 0) {
            console.log('[Supabase] Background sync: nothing new since last sync.')
            localStorage.setItem(syncKey, syncStartedAt)
            return
        }

        // Group changed records by fingerprint (skip deleted — hard-deletes won't appear here)
        const byFp = {}
        for (const record of data) {
            if (record.data?.deleted) continue
            if (!byFp[record.fingerprint]) byFp[record.fingerprint] = []
            byFp[record.fingerprint].push(record.data)
        }

        // Merge into IndexedDB for each fingerprint
        for (const [fp, cloudStamps] of Object.entries(byFp)) {
            const localStamps = (await db.get(`stamps_${fp}`)) || []
            const merged = [...localStamps]
            let changed = false

            for (const cloudS of cloudStamps) {
                const idx = merged.findIndex(s => s.id === cloudS.id)
                if (idx === -1) {
                    merged.push(cloudS)
                    changed = true
                } else if ((cloudS.updatedAt || 0) > (merged[idx].updatedAt || 0)) {
                    merged[idx] = cloudS
                    changed = true
                }
            }

            if (changed) {
                await db.set(`stamps_${fp}`, merged)
                if (fp === this.app.pdfFingerprint) {
                    this.app.stamps = merged.filter(s => !s.deleted)
                    this.app.redrawAllAnnotationLayers?.()
                    console.log(`[Supabase] Background sync updated active score (${fp.slice(0, 8)})`)
                }
            }
        }

        // Save sync timestamp only after successful update
        localStorage.setItem(syncKey, syncStartedAt)
        console.log(`[Supabase] Background sync: ${data.length} record(s) across ${Object.keys(byFp).length} score(s) updated.`)
    }

    /**
     * Pulls metadata for a single score.
     */
    async pullScoreMetadata(fingerprint) {
        if (!this.client || !this.user) return null
        const { data, error } = await this.client
            .from('scores')
            .select('*')
            .eq('fingerprint', fingerprint)
            .maybeSingle()
        
        if (error) {
            console.warn('[Supabase] Metadata pull error:', error.message)
            return null
        }
        return data
    }

    // --- NEW: Global State Sync (Profile & Registry) ---

    /**
     * Pushes current user profile to Supabase 'profiles' table.
     */
    async pushProfile() {
        if (!this.client || !this.user || !this.app.profileManager) return;
        
        const profile = this.app.profileManager.data;
        const record = {
            id: this.user.id,
            email: this.user.email,
            data: profile, // name, title, note, updatedAt
            updated_at: new Date().toISOString()
        };

        console.log('[Supabase] ⬆️ Syncing Profile...');
        const { error } = await this.client.from('profiles').upsert(record);
        if (error) console.warn('[Supabase] Profile sync error:', error.message);
    }

    /**
     * Pulls user profile from Supabase.
     */
    async pullProfile() {
        if (!this.client || !this.user) return null;
        const { data, error } = await this.client
            .from('profiles')
            .select('data')
            .eq('id', this.user.id)
            .maybeSingle();
        
        if (error) {
            console.warn('[Supabase] Profile pull error:', error.message);
            return null;
        }
        return data?.data || null;
    }

    /**
     * Pushes setlists to the dedicated `setlists` column — no read-modify-write race condition.
     */
    async pushSetlists(setlists) {
        if (!this.client || !this.user) return;
        console.log(`[Supabase] ⬆️ Syncing ${setlists.length} Setlists...`);

        const { error } = await this.client
            .from('profiles')
            .upsert({
                id: this.user.id,
                email: this.user.email,
                setlists: setlists,
                updated_at: new Date().toISOString()
            });

        if (error) console.error('[Supabase] Setlist push failed:', error.message);
        else console.log('[Supabase] ✅ Setlists synced.');
    }

    /**
     * Pulls setlists from the dedicated `setlists` column.
     * Falls back to legacy `data.setlists` for backward compatibility.
     */
    async pullSetlists() {
        if (!this.client || !this.user) return null;
        console.log('[Supabase] ↓ Pulling Setlists...');
        const { data, error } = await this.client
            .from('profiles')
            .select('setlists, data')
            .eq('id', this.user.id)
            .maybeSingle();

        if (error) {
            console.warn('[Supabase] Setlist pull error:', error.message);
            return null;
        }
        // New column takes priority; fall back to legacy data.setlists
        return data?.setlists ?? data?.data?.setlists ?? null;
    }

    /**
     * Pull panel config from cloud and apply to localStorage.
     * Cloud is always authoritative (offline editing is blocked in toolset-inspector).
     */
    async syncPanelConfig() {
        if (!navigator.onLine) return
        const cfg = await this.pullPanelConfig()
        if (!cfg) return
        localStorage.setItem('scoreflow_panel_config', JSON.stringify(cfg))

        // Re-render strips with updated order
        this.app.docBarStripManager?.applyPanelConfig()

        console.log('[Supabase] ✅ panel_config applied from cloud')
    }

    /**
     * Pushes panel UI config to the dedicated `panel_config` column.
     */
    async pushPanelConfig(cfg) {
        if (!this.client || !this.user) return;
        console.log('[Supabase] ⬆️ Syncing panel_config...');

        const { error } = await this.client
            .from('profiles')
            .upsert({
                id: this.user.id,
                email: this.user.email,
                panel_config: cfg,
                updated_at: new Date().toISOString()
            });

        if (error) console.error('[Supabase] panel_config push failed:', error.message);
        else console.log('[Supabase] ✅ panel_config synced.');
    }

    /**
     * Pushes user content (userTextLibrary, etc.) to the dedicated `user_content` column.
     */
    async pushUserContent(content) {
        if (!this.client || !this.user) return;
        const { error } = await this.client
            .from('profiles')
            .upsert({
                id: this.user.id,
                email: this.user.email,
                user_content: content,
                updated_at: new Date().toISOString()
            });
        if (error) console.error('[Supabase] user_content push failed:', error.message);
        else console.log('[Supabase] ✅ user_content synced.');
    }

    /**
     * Pulls user content from the dedicated `user_content` column.
     */
    async pullUserContent() {
        if (!this.client || !this.user) return null;
        const { data, error } = await this.client
            .from('profiles')
            .select('user_content')
            .eq('id', this.user.id)
            .maybeSingle();
        if (error) {
            console.warn('[Supabase] user_content pull error:', error.message);
            return null;
        }
        return data?.user_content ?? null;
    }

    /**
     * Pulls panel UI config from the dedicated `panel_config` column.
     */
    async pullPanelConfig() {
        if (!this.client || !this.user) return null;
        const { data, error } = await this.client
            .from('profiles')
            .select('panel_config')
            .eq('id', this.user.id)
            .maybeSingle();

        if (error) {
            console.warn('[Supabase] panel_config pull error:', error.message);
            return null;
        }
        return data?.panel_config ?? null;
    }

    /**
     * Pulls all scores registered to this user to populate the Library placeholders.
     */
    async pullScoreRegistry() {
        if (!this.client || !this.user || !this.app.scoreManager) return;

        console.log('[Supabase] 📡 Pulling Registry placeholders...');
        const { data, error } = await this.client
            .from('scores')
            .select('*')
            .eq('user_id', this.user.id);

        if (error) {
            console.warn('[Supabase] Registry pull failed:', error.message);
            return;
        }

        if (data && data.length > 0) {
            let registryChanged = false;
            data.forEach(cloudRecord => {
                const fp = cloudRecord.fingerprint;
                const exists = this.app.scoreManager.registry.find(s => s.fingerprint === fp);
                
                if (!exists) {
                    // Create placeholder for cloud-available score
                    const placeholder = {
                        fingerprint: fp,
                        title: cloudRecord.title || 'Untitled',
                        composer: cloudRecord.composer || 'Unknown',
                        fileName: cloudRecord.filename || '',
                        storageMode: 'cloud', // It's on cloud but not yet locally cached
                        isCloudOnly: true,
                        isSynced: true,
                        dateImported: cloudRecord.created_at ? new Date(cloudRecord.created_at).getTime() : 0,
                        tags: cloudRecord.tags || []
                    };
                    this.app.scoreManager.registry.push(placeholder);
                    registryChanged = true;
                    console.log(`[Supabase] ↓ New placeholder: ${placeholder.title}`);
                } else {
                    // Update existing local entry if cloud data is newer
                    let itemChanged = false;
                    
                    const cloudUpdate = cloudRecord.updated_at ? new Date(cloudRecord.updated_at).getTime() : 0;
                    const localUpdate = exists.updatedAt || 0;

                    if (cloudUpdate > localUpdate) {
                        exists.updatedAt = cloudUpdate;
                        itemChanged = true;

                        // Also update Detail record in IndexedDB if it exists
                        (async () => {
                            try {
                                const detail = await db.get(`detail_${fp}`);
                                if (detail) {
                                    detail.name = exists.title;
                                    detail.composer = exists.composer;
                                    
                                    // Sync media_list from cloud if present
                                    if (cloudRecord.media_list) {
                                        detail.mediaList = cloudRecord.media_list;
                                        console.log(`[Supabase] ↓ Updated mediaList for ${exists.title}`);
                                    }
                                    
                                    await db.set(`detail_${fp}`, detail);
                                    
                                    // If active score updated, refresh its UI
                                    if (fp === this.app.pdfFingerprint) {
                                        this.app.viewerManager?.updateFloatingTitle();
                                        if (this.app.scoreDetailManager?.currentFp === fp) {
                                            this.app.scoreDetailManager.render(fp);
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn('[Supabase] Failed to update detail record during sync:', e);
                            }
                        })();
                    }

                    if (exists.isSynced === undefined) { exists.isSynced = true; itemChanged = true; }
                    
                    if (itemChanged) registryChanged = true;
                }
            });

            if (registryChanged) {
                this.app.scoreManager.render();
                this.app.scoreManager.saveRegistry();
            }
        }
    }

    /**
     * Enhanced syncScore to include library metadata
     */
    async syncScore(fingerprint, metadata) {
        if (!this.client || !this.user) return;
        
        // Fetch detail to get latest mediaList if not provided
        let scoreMediaList = metadata?.mediaList;
        if (!scoreMediaList) {
            try {
                const detail = await db.get(`detail_${fingerprint}`);
                scoreMediaList = detail?.mediaList || [];
            } catch (e) {}
        }

        const scoreData = {
            fingerprint: fingerprint,
            user_id: this.user.id,
            title: metadata?.title || 'Untitled',
            composer: metadata?.composer || 'Unknown',
            genre: metadata?.genre || null,
            sort_index: metadata?.sortIndex !== undefined ? metadata.sortIndex : (metadata?.sort_index || 0),
            filename: metadata?.fileName || metadata?.filename || '',
            tags: metadata?.tags || [],
            media_list: scoreMediaList || [], // SYNC NEW COLUMN
            last_accessed: metadata?.lastAccessed || Date.now(),
            updated_at: new Date().toISOString()
        }

        this.subscribeToAnnotations(fingerprint)

        const { error } = await this.client
            .from('scores')
            .upsert(scoreData, { onConflict: 'fingerprint' })

        if (error) {
            console.error('[Supabase] ❌ Sync score error:', error.message)
        } else {
            console.log('[Supabase] ✅ Registry Metadata synced:', metadata?.title)
        }
    }

    /**
     * Batch sync the entire local registry to Supabase
     */
    async syncScoreRegistry(registry) {
        if (!this.client || !this.user) return;
        
        console.log(`[Supabase] ⬆️ Syncing full registry (${registry.length} items)...`);
        
        // Push each one. In the future, we could use a single bulk upsert for performance.
        const promises = registry.map(score => this.syncScore(score.fingerprint, score));
        await Promise.all(promises);
    }

    // --- STORAGE (PDF) ---

    /**
     * Uploads a PDF to Supabase Storage bucket 'pdfs'.
     */
    async uploadPDFBuffer(fingerprint, buffer) {
        if (!this.client || !this.user) return null;
        if (!buffer || buffer.byteLength === 0) {
            console.error('[Supabase] PDF upload failed: Buffer is empty.');
            return null;
        }

        const path = `${this.user.id}/${fingerprint}.pdf`;
        console.log(`[Supabase] ⬆️ Uploading PDF to storage: ${path} (${buffer.byteLength} bytes)`);

        // Use Blob for more reliable upload across different environments
        const blob = new Blob([buffer], { type: 'application/pdf' });

        const { data, error } = await this.client.storage
            .from('pdfs')
            .upload(path, blob, {
                contentType: 'application/pdf',
                upsert: true
            });
        if (error) {
            console.error('[Supabase] PDF upload failed:', error.message);
            return null;
        }
        return data;
    }

    /**
     * Downloads a PDF from Supabase Storage.
     */
    async downloadPDFBuffer(fingerprint) {
        if (!this.client || !this.user) {
            console.warn('[Supabase] Missing client or user during download.');
            return null;
        }
        
        const path = `${this.user.id}/${fingerprint}.pdf`;
        let lastError = null;

        // Strategy 1: Standard Authenticated Download with Retries
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                console.log(`[Supabase] ↓ Download attempt ${attempt} for: ${fingerprint.substring(0,8)}...`);
                const { data, error } = await this.client.storage
                    .from('pdfs')
                    .download(path, {
                        cacheControl: 'no-store' // Avoid caching artifacts in middleware
                    });

                if (!error && data && data.size > 0) return data;
                if (error) lastError = error.message;
            } catch (e) {
                lastError = e.message || e;
                console.warn(`[Supabase] Download attempt ${attempt} failed:`, lastError);
            }
            if (attempt < 2) await new Promise(r => setTimeout(r, 1000));
        }

        // Strategy 2: Fallback to Signed URL + fetch
        console.log(`[Supabase] 🔄 Falling back to Signed URL for ${fingerprint.substring(0,8)}...`);
        let signedUrl = null;
        try {
            const { data: signData, error: signError } = await this.client.storage
                .from('pdfs')
                .createSignedUrl(path, 60);

            if (signError) throw new Error(signError.message);
            signedUrl = signData.signedUrl;

            // --- DEV PROXY HACK ---
            // On localhost, we use Vite's proxy to bypass CORS
            if (this.app.isDev && signedUrl.includes('supabase.co/storage/v1/object')) {
                const proxyUrl = signedUrl.replace(/https:\/\/.*\.supabase\.co\/storage\/v1\/object/, window.location.origin + '/SheetMusic_Viewer/api-proxy');
                console.log(`[Supabase] 🛡️ Using Dev Proxy:`, proxyUrl);
                signedUrl = proxyUrl;
            } else if (this.app.isDev) {
                console.log(`[Supabase] 🔗 Private Link (60s):`, signedUrl);
            }
            // --- END HACK ---

            // Strategy 2: Fallback to Signed URL + fetch (Clean request)
            const response = await fetch(signedUrl, {
                mode: 'cors',
                credentials: 'omit', 
                referrerPolicy: 'no-referrer',
                cache: 'no-store', // This acts like cacheControl: '0'
                headers: {
                    'Accept': 'application/pdf'
                }
            });
            
            if (response.ok) {
                const blob = await response.blob();
                if (blob.size > 0) return blob;
            } else {
                console.warn(`[Supabase] Signed URL fetch returned status: ${response.status}`);
            }
        } catch (e) {
            console.warn(`[Supabase] fetch strategy failed, trying Strategy 3 (XHR)...`, e.message);
        }

        // Strategy 3: XMLHttpRequest (The "Safe" Option)
        if (signedUrl) {
            console.log(`[Supabase] 🚀 Initializing XHR binary transfer for ${fingerprint.substring(0,8)}...`);
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', signedUrl, true);
                xhr.responseType = 'blob';
                xhr.setRequestHeader('Accept', 'application/pdf');
                xhr.withCredentials = false;
                
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        const blob = xhr.response;
                        if (blob && blob.size > 0) {
                            console.log(`[Supabase] ✅ XHR download successful (${blob.size} bytes)`);
                            resolve(blob);
                        } else {
                            reject(new Error('XHR returned empty blob'));
                        }
                    } else {
                        reject(new Error(`XHR Status: ${xhr.status}`));
                    }
                };
                
                xhr.onerror = () => reject(new Error('XHR Network Error (CORS, AdBlocker, or Blocked)'));
                xhr.ontimeout = () => reject(new Error('XHR Timeout'));
                xhr.timeout = 45000;
                xhr.send();
            });
        }

        throw new Error('All download strategies (Download, Fetch, XHR) exhausted.');
    }

    /**
     * Checks if a PDF exists in Supabase Storage.
     */
    async checkPDFExists(fingerprint) {
        if (!this.client || !this.user) return false;
        
        console.log(`[Supabase] 🔍 Checking existence of: ${fingerprint.substring(0,8)}.pdf`);
        const { data, error } = await this.client.storage
            .from('pdfs')
            .list(this.user.id, {
                limit: 1,
                offset: 0,
                search: `${fingerprint}.pdf`
            });

        if (error) {
            console.error('[Supabase] checkPDFExists error:', error.message);
            return false;
        }

        if (!data || data.length === 0) {
            console.log('[Supabase] 🔍 File not found in list.');
            return false;
        }
        
        // Ensure the file is not 0 bytes
        const file = data[0];
        const size = file.metadata?.size || file.size || 0;
        return size > 0;
    }

    /**
     * Deletes a score and all its associated data from Supabase (DB + Storage).
     */
    async deleteScore(fingerprint) {
        if (!this.client || !this.user) return;
        
        console.log(`[Supabase] 🗑️ DELETING SCORE: ${fingerprint}`);
        
        // 1. Delete from storage (bucket: 'pdfs')
        const path = `${this.user.id}/${fingerprint}.pdf`;
        const { error: storageError } = await this.client.storage
            .from('pdfs')
            .remove([path]);
        
        if (storageError) {
            console.warn('[Supabase] Storage deletion warning:', storageError.message);
        }

        // 2. Delete annotations
        const { error: annError } = await this.client
            .from('annotations')
            .delete()
            .eq('fingerprint', fingerprint)
            .eq('user_id', this.user.id);
        
        if (annError) console.warn('[Supabase] Annotation deletion warning:', annError.message);

        // 3. Delete from 'scores' metadata table
        const { error: dbError } = await this.client
            .from('scores')
            .delete()
            .eq('fingerprint', fingerprint)
            .eq('user_id', this.user.id);

        if (dbError) {
            console.error('[Supabase] ❌ DB Score deletion error:', dbError.message);
        } else {
            console.log('[Supabase] ✅ Score deleted successfully from cloud.');
        }
    }

    /**
     * Wipes local state and rebuilds the library from cloud data.
     */
    async forceFullCloudResync() {
        if (!this.client || !this.user) return false;
        
        try {
            console.log('[Supabase] ☢️ STARTING GLOBAL CLOUD RESYNC...');
            
            // 1. Wipe local IndexDB
            await db.clear();
            
            // 2. Clear relevant local storage
            localStorage.removeItem('scoreflow_session_fp');
            
            // 3. Reset ScoreManager registry
            if (this.app.scoreManager) {
                this.app.scoreManager.registry = [];
            }
            
            // 4. Re-pull metadata and placeholders from cloud
            await this.pullScoreRegistry();
            
            console.log('[Supabase] ✅ Global Cloud Resync successful.');
            return true;
        } catch (err) {
            console.error('[Supabase] ❌ Global Cloud Resync failed:', err);
            return false;
        }
    }
}
