# ScoreFlow — Delta Sync Feature Requirement Spec

**Target:** Claude Code  
**Project path:** `/Users/victor_hsu/MyProgram/SheetMusic_Viewer`  
**Feature:** Cross-machine, cross-browser annotation sync via shared folder (Dropbox / iCloud Drive / NAS)

---

## Background & Context

ScoreFlow (`src/main.js`) currently stores annotations (stamps) in `localStorage` keyed by PDF fingerprint:
- `scoreflow_stamps_<fingerprint>` — per-score stamps array
- `scoreflow_layers` — layer config
- Collaboration uses `publishWork()` which writes a full-snapshot JSON to a linked folder via File System Access API

The problem: switching machines loses all local annotations. Full-snapshot overwrite also destroys work done on the other machine.

---

## Goal

Enable **automatic, delta-based annotation sync** across machines via any shared folder (Dropbox, iCloud Drive, NAS).  
No backend. No cloud API. Pure File System Access API + periodic polling.

---

## New File: `src/sync.js`

Create a new ES module `src/sync.js`. This module handles all sync logic. `main.js` imports and uses it.

### 1. Change History Data Model

Every mutation to `this.stamps` or `this.layers` must be recorded as a **change event**.

```js
// A single change event
{
  id: "ch_<timestamp>_<4-char-random>",   // e.g. "ch_1709123400000_a3fx"
  ts: 1709123400000,                        // Date.now()
  type: "stamp_add" | "stamp_delete" | "stamp_move" | "layer_update" | "stamps_clear",
  payload: { /* see below */ }
}
```

**Payload shapes per type:**

| `type` | `payload` |
|---|---|
| `stamp_add` | Full stamp object (same shape as current `this.stamps[]` item) |
| `stamp_delete` | `{ stampId: string }` |
| `stamp_move` | `{ stampId: string, x: number, y: number, points?: array }` |
| `layer_update` | Full `this.layers` array snapshot |
| `stamps_clear` | `{ fingerprint: string }` |

**Stamp objects must have a stable `id` field.** Currently stamps have no id. All new stamps must be assigned `id: "s_" + Date.now() + "_" + Math.random().toString(36).slice(2,6)` at creation time.

### 2. Sync File Format (JSON written to shared folder)

Filename: `sf_sync_<fingerprint_short8>_<deviceId>.json`  
Example: `sf_sync_a3b1c2d4_MacBook-Victor.json`

```json
{
  "schemaVersion": 2,
  "fingerprint": "<full SHA-256 fingerprint>",
  "deviceId": "<deviceId>",
  "lastModified": 1709123456789,
  "stamps": [ /* full current stamps array — source of truth for this device */ ],
  "layers": [ /* full current layers array */ ],
  "changeHistory": [
    { "id": "ch_...", "ts": ..., "type": "stamp_add", "payload": { ... } }
  ]
}
```

`changeHistory` is **append-only** and capped at **500 entries** (drop the oldest when over limit).  
`stamps` and `layers` are always a full snapshot of the device's current state at time of write.

### 3. Device ID

Generate once per browser/device, persist in `localStorage` as `scoreflow_device_id`.  
Generation: `navigator.userAgent` hash (reuse existing djb2 fallback pattern in the project) + timestamp suffix, e.g. `"device_a3f1b2_1709000000"`.

### 4. `SyncManager` Class

Export a class `SyncManager` from `src/sync.js`:

```js
export class SyncManager {
  constructor(scoreFlow)  // receives the ScoreFlow instance
  
  // Called by main.js after a folder is linked
  attachFolder(folderHandle, type)  // type: 'personal' | 'orchestra'
  detachFolder(type)

  // Record a mutation — called by main.js on every stamp/layer change
  recordChange(type, payload)

  // Write current state to the linked folder immediately
  async flushToFolder(folderHandle)

  // Read all peer sync files from folder, compute and apply delta
  async pullFromFolder(folderHandle)

  // Start / stop the 30-second auto-sync interval
  startAutoSync(intervalMs = 30000)
  stopAutoSync()

  // Returns sync status info for UI
  getSyncStatus()  // { lastPush: Date|null, lastPull: Date|null, pendingChanges: number }
}
```

---

## Changes to `src/main.js`

### 1. Import SyncManager

```js
import { SyncManager } from './sync.js'
```

In `constructor()`, after all existing init:
```js
this.syncManager = new SyncManager(this)
```

### 2. Assign IDs to all new stamps

In `createCaptureOverlay()`, `endAction()` block, when a new stamp is finalized:
```js
activeObject.id = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
this.stamps.push(activeObject)
this.syncManager.recordChange('stamp_add', { ...activeObject })
```

In `spawnTextEditor()`, `finalize()`:
```js
stamp.id = 's_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
this.stamps.push(stamp)
this.syncManager.recordChange('stamp_add', { ...stamp })
```

### 3. Record stamp delete

In `eraseStampTarget(stamp)` (and keyboard Delete handler):
```js
this.syncManager.recordChange('stamp_delete', { stampId: stamp.id })
// then existing: this.stamps.splice(...)
```

### 4. Record stamp move

In `endAction()`, when `isMovingExisting === true`:
```js
this.syncManager.recordChange('stamp_move', {
  stampId: activeObject.id,
  x: activeObject.x,
  y: activeObject.y,
  points: activeObject.points
})
```

### 5. Record layer updates

In `addNewLayer()`, `deleteLayer()`, `resetLayers()`, after `this.saveToStorage()`:
```js
this.syncManager.recordChange('layer_update', { layers: this.layers })
```

### 6. Record stamps_clear

In `clearScoreAnnotations()`, after clearing:
```js
this.syncManager.recordChange('stamps_clear', { fingerprint: this.pdfFingerprint })
```

### 7. Attach folder handles to SyncManager

In `connectSyncFolder(type)`, after setting `this.personalSyncFolder` or `this.orchestraSyncFolder`:
```js
this.syncManager.attachFolder(handle, type)
this.syncManager.startAutoSync()
```

In `completeMissionSetup()`, after setting folders:
```js
this.syncManager.attachFolder(this.personalSyncFolder, 'personal')
if (this.orchestraSyncFolder) this.syncManager.attachFolder(this.orchestraSyncFolder, 'orchestra')
this.syncManager.startAutoSync()
```

In `renderActiveProfile()`, after recovering handles from `db.get(...)`:
```js
if (this.personalSyncFolder) this.syncManager.attachFolder(this.personalSyncFolder, 'personal')
if (this.orchestraSyncFolder) this.syncManager.attachFolder(this.orchestraSyncFolder, 'orchestra')
if (this.personalSyncFolder || this.orchestraSyncFolder) this.syncManager.startAutoSync()
```

### 8. Stop sync on exit / score change

In `exitMission()`, before clearing state:
```js
this.syncManager.stopAutoSync()
```

In `loadPDF()`, before loading new PDF — flush first if we have a folder:
```js
if (this.pdfFingerprint && this.syncManager) {
  await this.syncManager.flushToFolder(this.personalSyncFolder || this.orchestraSyncFolder)
}
```

### 9. Wire existing Export button to new format

In `exportProject()`, additionally call `syncManager.flushToFolder()` if a folder is linked (keep the existing download behavior as-is, just also push to folder).

---

## Delta Merge Algorithm (implement inside `SyncManager.pullFromFolder`)

```
1. Scan folder for all files matching `sf_sync_<fingerprint_short8>_*.json`
   where fingerprint_short8 matches current this.scoreFlow.pdfFingerprint.slice(0,8)

2. Skip our own file (deviceId matches).

3. For each peer file:
   a. Parse changeHistory
   b. Load our known "last synced change id" for this peer from localStorage:
      key: `scoreflow_sync_cursor_<fingerprint>_<peerId>`
   c. Filter peer's changeHistory to only entries with ts > cursor_ts (or all if no cursor)
   d. Apply each new entry in timestamp order:

      stamp_add:
        if (!this.stamps.find(s => s.id === payload.id))
          this.stamps.push(payload)

      stamp_delete:
        this.stamps = this.stamps.filter(s => s.id !== payload.stampId)

      stamp_move:
        const s = this.stamps.find(s => s.id === payload.stampId)
        if (s) { s.x = payload.x; s.y = payload.y; if (payload.points) s.points = payload.points }

      layer_update:
        // Last-write-wins: only apply if peer ts > our last layer change ts
        // Store our last layer change ts in syncManager._lastLayerChangedTs
        if (entry.ts > this._lastLayerChangedTs) {
          this.scoreFlow.layers = payload.layers
          this._lastLayerChangedTs = entry.ts
        }

      stamps_clear:
        if (payload.fingerprint === this.scoreFlow.pdfFingerprint)
          this.scoreFlow.stamps = []

   e. Save new cursor: last applied entry's id and ts to localStorage

4. After all peers processed:
   - call this.scoreFlow.saveToStorage()
   - call this.scoreFlow.renderPDF()  (redraw all pages)
   - update sync status timestamp
```

---

## Sync Status UI

Add a small sync indicator to the existing sidebar's Community Hub section.  
Do **not** add a new UI section — integrate into the existing `#sync-cloud-btn` and hub status area.

Show:
- `🟢 Synced X mins ago` when last pull was recent
- `🟡 Syncing...` during active pull/push
- `🔴 No folder linked` when no folder attached
- `⚠️ Sync error` if last operation threw

Update the status indicator after every `flushToFolder` and `pullFromFolder`.  
The `#sync-all-btn` button (already exists) should trigger an immediate `pullFromFolder` + `flushToFolder`.

---

## Auto-Sync Behavior

- Interval: every **30 seconds** when a folder is linked and a PDF is open
- On interval tick:
  1. `await flushToFolder(folder)` — write our latest state
  2. `await pullFromFolder(folder)` — read peers and apply delta
- If `this.scoreFlow.pdf === null` (no score open), skip the tick silently
- Use `setInterval` / `clearInterval`, stored as `this._syncIntervalId`

---

## Conflict Resolution Policy

| Situation | Resolution |
|---|---|
| Same stamp added on both devices | Dedup by `id` — keep both if different ids |
| Stamp deleted on A, moved on B | Delete wins (stamp_delete applied after) |
| Layer config changed on both | Last-write-wins by timestamp |
| Same stamp moved on both | Last-write-wins by entry timestamp |
| `stamps_clear` on A | Applied everywhere — clears all local stamps for that fingerprint |

---

## Backward Compatibility

- Existing `sf_personal_*` and `sf_orchestra_*` files written by old `publishWork()` are **not affected**
- The new sync files use prefix `sf_sync_*` and are distinct
- Old `exportProject()` format (version 1.3) is unchanged
- `handleImport()` / `importAsNewPersona()` remain unchanged
- Stamps without `id` field (pre-existing) are assigned a stable id at `loadFromStorage()` time:
  ```js
  this.stamps.forEach(s => {
    if (!s.id) s.id = 's_legacy_' + Math.random().toString(36).slice(2, 10)
  })
  ```
  Then `saveToStorage()` is called to persist the ids.

---

## File Structure After Change

```
src/
  main.js        ← modified (stamp ids, recordChange calls, SyncManager wiring)
  sync.js        ← NEW (SyncManager class)
  db.js          ← unchanged
  style.css      ← unchanged (sync status reuses existing CSS vars)
  constants.js   ← unchanged
  gdrive.js      ← unchanged
```

---

## Testing Checklist (for Claude Code to verify)

- [ ] New stamp gets `id` field before being pushed to `this.stamps`
- [ ] `sf_sync_<fp8>_<deviceId>.json` is created in linked folder on first flush
- [ ] Pulling from folder with a peer file applies only new entries (cursor respected)
- [ ] Duplicate stamp (same `id`) is not added twice
- [ ] Auto-sync interval starts when folder linked, stops on `exitMission()`
- [ ] `#sync-all-btn` triggers immediate push + pull
- [ ] Sync status text updates in UI after each cycle
- [ ] No crash when folder permission is denied mid-sync (wrap in try/catch, show ⚠️)
- [ ] Legacy stamps without `id` get assigned one at load time