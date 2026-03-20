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
            
            if (event === 'SIGNED_IN') {
                this.app.uiManager?.showToast?.(`Welcome, ${this.user.email}`, 'success')
                
                // --- NEW GLUE: Sync User Profile and Global Library ---
                this.pullProfile().then(data => {
                    if (data && this.app.profileManager) {
                        this.app.profileManager.data = { ...this.app.profileManager.data, ...data };
                        this.app.profileManager.render();
                    }
                });

                // Setlist Sync - Dedicated Table
                this.pullSetlists().then(cloudSetlists => {
                    if (cloudSetlists && this.app.setlistManager) {
                        this.app.setlistManager.mergeSetlists(cloudSetlists);
                    }
                });

                if (this.app.scoreManager) {
                    this.pullScoreRegistry();
                }

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
                // FORCE UPDATE: Always accept cloud version if we're in a sync session
                console.log(`   -> Syncing existing stamp [${stamp.type}]`)
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
    async syncScore(fingerprint, metadata) {
        if (!this.client || !this.user) return
        
        const scoreData = {
            fingerprint: fingerprint,
            user_id: this.user.id,
            title: metadata?.title || 'Untitled',
            composer: metadata?.composer || 'Unknown'
        }

        // Only subscribe if not already pulling/subscribed
        this.subscribeToAnnotations(fingerprint)

        const { error } = await this.client
            .from('scores')
            .upsert(scoreData, { onConflict: 'fingerprint' })

        if (error) {
            console.error('[Supabase] ❌ Sync score error:', error.message)
        } else {
            console.log('[Supabase] ✅ Score metadata synced:', metadata?.title)
        }
    }

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
            console.warn('[Supabase] ⚠️ Push skipped: User not logged in.')
            return
        }
        if (!fingerprint) {
            console.warn('[Supabase] ⚠️ Push skipped: Missing score fingerprint.')
            return
        }
        
        // Map app stamp structure to Supabase DB schema
        const dbRecord = {
            id: stamp.id, // We use the same UUID generated locally
            fingerprint: fingerprint,
            user_id: this.user.id,
            layer_id: stamp.layerId || 'draw',
            type: stamp.type,
            page: stamp.page || 0,
            data: stamp, // The whole object goes into JSONB
            updated_at: new Date().toISOString()
        }

        console.log(`[Supabase] ⬆️ Pushing annotation [${stamp.type}] ID: ${stamp.id}`)
        
        const { error } = await this.client
            .from('annotations')
            .upsert(dbRecord)

        if (error) {
            console.error('[Supabase] ❌ Push annotation error:', error.message)
        } else {
            console.log(`[Supabase] ✅ Annotation pushed successfully.`)
        }
    }

    /**
     * Deletes an annotation from Supabase.
     */
    async deleteAnnotation(id) {
        if (!this.client || !this.user) {
            console.warn('[Supabase] ⚠️ Delete skipped: No session.')
            return
        }

        console.log(`[Supabase] 🗑️ Deleting annotation ID: ${id}`)

        const { error } = await this.client
            .from('annotations')
            .delete()
            .eq('id', id)
            .eq('user_id', this.user.id) // Security check

        if (error) {
            console.error('[Supabase] ❌ Delete annotation error:', error.message)
        } else {
            console.log('[Supabase] ✅ Annotation deleted in cloud.')
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
     * Fetches all annotations for a score from Supabase.
     */
    async pullAnnotations(fingerprint, force = false) {
        if (!this.client || !this.user) return []
        
        console.log(`[Supabase] Pulling annotations for ${fingerprint} (Force: ${force})`)
        const { data, error } = await this.client
            .from('annotations')
            .select('*')
            .eq('fingerprint', fingerprint)

        if (error) {
            console.error('[Supabase] Pull annotations error:', error)
            return null
        }

        const cloudStamps = (data || []).map(record => record.data)
        
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
        import('../db.js').then(db => db.set(`stamps_${fingerprint}`, this.app.stamps))
        
        // Start listening for live changes after initial pull
        this.subscribeToAnnotations(fingerprint)
        
        return this.app.stamps
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
     * Pushes setlists to Supabase.
     */
    async pushSetlists(setlists) {
        if (!this.client || !this.user) return;
        console.log(`[Supabase] ⬆️ Syncing ${setlists.length} Setlists to profiles...`);
        
        // We store everything in the 'data' JSONB column of the profiles table
        const currentProfile = await this.pullProfile() || {};
        const updatedData = { ...currentProfile, setlists: setlists };

        const { error } = await this.client
            .from('profiles')
            .upsert({
                id: this.user.id,
                email: this.user.email,
                data: updatedData,
                updated_at: new Date().toISOString()
            });

        if (error) console.error('[Supabase] Setlist push failed:', error.message);
        else console.log('[Supabase] ✅ Setlists synced to profiles.');
    }

    /**
     * Pulls setlists from Supabase profiles data field. (Maximum Compatibility)
     */
    async pullSetlists() {
        if (!this.client || !this.user) return null;
        console.log('[Supabase] ↓ Pulling Setlists from profiles...');
        const data = await this.pullProfile();
        return data?.setlists || null;
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
            filename: metadata?.fileName || '',
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
