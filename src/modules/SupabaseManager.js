import { createClient } from '@supabase/supabase-js'

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
    async pullAnnotations(fingerprint) {
        if (!this.client || !this.user) return []
        
        console.log('[Supabase] Pulling annotations for:', fingerprint)
        const { data, error } = await this.client
            .from('annotations')
            .select('*')
            .eq('fingerprint', fingerprint)

        if (error) {
            console.error('[Supabase] Pull annotations error:', error)
            return []
        }

        if (data && data.length > 0) {
            const cloudStamps = data.map(record => record.data)
            
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
            
            // Start listening for live changes after initial pull
            this.subscribeToAnnotations(fingerprint)
        }
        
        return data.map(record => record.data)
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
                    // Update existing local entry
                    let itemChanged = false;
                    if (exists.isSynced === undefined) { exists.isSynced = true; itemChanged = true; }
                    
                    // If local entry thinks it's cloud-only but doesn't have metadata, sync it
                    if (exists.isCloudOnly && !exists.title) {
                        exists.title = cloudRecord.title;
                        exists.composer = cloudRecord.composer;
                        itemChanged = true;
                    }
                    
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
        
        const scoreData = {
            fingerprint: fingerprint,
            user_id: this.user.id,
            title: metadata?.title || 'Untitled',
            composer: metadata?.composer || 'Unknown',
            filename: metadata?.fileName || '',
            tags: metadata?.tags || [],
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
        if (!this.client || !this.user) return null;
        
        const path = `${this.user.id}/${fingerprint}.pdf`;
        console.log(`[Supabase] ↓ Downloading PDF from storage: ${path}`);
        
        const { data, error } = await this.client.storage
            .from('pdfs')
            .download(path);

        if (error) {
            console.warn('[Supabase] PDF download failed (might not exist):', error.message);
            return null;
        }
        
        if (!data || data.size === 0) {
            console.warn('[Supabase] PDF downloaded but it is 0 bytes.');
            return null;
        }
        
        return data;
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
        console.log(`[Supabase] 🔍 Found file. Size: ${size} bytes.`);
        return size > 0;
    }
}
