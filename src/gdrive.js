/**
 * Google Drive Integration for ScoreFlow
 * Uses Google Identity Services (GSI) for OAuth and Drive REST API v3.
 */

const CLIENT_ID = '481081864196-tsbrivsjhdtkp4rn9ffgkg19g2sh5r3a.apps.googleusercontent.com'
const SCOPES = [
    'https://www.googleapis.com/auth/drive.file',      // files created / opened by this app
    'https://www.googleapis.com/auth/drive.readonly',  // read any file the user selects
    'email',                                           // show signed-in email
    'profile'
].join(' ')

let _tokenClient = null
let _token = null
let _userEmail = null

// ─── Auth ────────────────────────────────────────────────────────────────────

function _waitForGSI() {
    return new Promise(resolve => {
        if (window.google?.accounts?.oauth2) { resolve(); return }
        const id = setInterval(() => {
            if (window.google?.accounts?.oauth2) { clearInterval(id); resolve() }
        }, 200)
    })
}

export async function init() {
    await _waitForGSI()
    _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: () => {}   // overridden per request
    })
}

export async function signIn() {
    if (!_tokenClient) await init()
    return new Promise((resolve, reject) => {
        _tokenClient.callback = async resp => {
            if (resp.error) { reject(new Error(resp.error)); return }
            _token = resp.access_token
            try {
                const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${_token}` }
                })
                const info = await r.json()
                _userEmail = info.email
            } catch (_) {}
            resolve({ token: _token, email: _userEmail })
        }
        // Empty prompt = silent if already consented, otherwise shows consent
        _tokenClient.requestAccessToken({ prompt: _token ? '' : '' })
    })
}

export function signOut() {
    if (_token) google.accounts.oauth2.revoke(_token, () => {})
    _token = null
    _userEmail = null
}

export function isSignedIn() { return !!_token }
export function getUserEmail() { return _userEmail }

// ─── Internal fetch (auto-reauth on 401) ─────────────────────────────────────

async function _fetch(url, options = {}) {
    if (!_token) await signIn()
    const go = t => fetch(url, {
        ...options,
        headers: { ...options.headers, Authorization: `Bearer ${t}` }
    })
    let res = await go(_token)
    if (res.status === 401) {
        _token = null
        const { token } = await signIn()
        res = await go(token)
    }
    return res
}

// ─── Files ───────────────────────────────────────────────────────────────────

export async function listPDFs(query = '', pageToken = null) {
    let q = "mimeType='application/pdf' and trashed=false"
    if (query.trim()) q += ` and name contains '${query.trim().replace(/'/g, "\\'")}'`
    const params = new URLSearchParams({
        q,
        fields: 'files(id,name,modifiedTime,size),nextPageToken',
        pageSize: 50,
        orderBy: 'modifiedTime desc'
    })
    if (pageToken) params.set('pageToken', pageToken)
    const res = await _fetch(`https://www.googleapis.com/drive/v3/files?${params}`)
    if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`${res.status} ${body}`)
    }
    return res.json()
}

export async function downloadFile(fileId) {
    const res = await _fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)
    if (!res.ok) throw new Error(`Drive download failed: ${res.status}`)
    return res.arrayBuffer()
}

// ─── Annotations ─────────────────────────────────────────────────────────────

const _annoName = fp => `scoreflow_anno_${fp}.json`

async function _findAnnoFileId(fingerprint) {
    const params = new URLSearchParams({
        q: `name='${_annoName(fingerprint)}' and trashed=false`,
        fields: 'files(id)',
        pageSize: 1
    })
    const res = await _fetch(`https://www.googleapis.com/drive/v3/files?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.files?.[0]?.id || null
}

export async function saveAnnotations(fingerprint, stamps) {
    const body = JSON.stringify({ fingerprint, stamps, savedAt: new Date().toISOString() })
    const existingId = await _findAnnoFileId(fingerprint)

    if (existingId) {
        const res = await _fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`,
            { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body }
        )
        if (!res.ok) throw new Error(`Annotation update failed: ${res.status}`)
        return existingId
    }

    // Create new file via multipart upload
    const boundary = `sf_${Date.now()}`
    const meta = JSON.stringify({ name: _annoName(fingerprint), mimeType: 'application/json' })
    const multipart =
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n` +
        `--${boundary}--`
    const res = await _fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart }
    )
    if (!res.ok) throw new Error(`Annotation create failed: ${res.status}`)
    const data = await res.json()
    return data.id
}

export async function loadAnnotations(fingerprint) {
    const fileId = await _findAnnoFileId(fingerprint)
    if (!fileId) return null
    const res = await _fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`)
    if (!res.ok) return null
    return res.json()
}
