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
                table: 'annotations'
            }, (payload) => {
                // WIRE-LEVEL DEBUG: See EVERY packet entering this machine's subscription
                console.log(`[Supabase] 🛰️ Pulse [${payload.eventType}]:`, payload.new?.id || payload.old?.id);

                // Manual filtering for maximum safety
                const targetFp = String(fingerprint).trim().toLowerCase();
                const packetFp = String(payload.new?.fingerprint || payload.old?.fingerprint || '').trim().toLowerCase();
                
                if (packetFp === targetFp) {
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
}
