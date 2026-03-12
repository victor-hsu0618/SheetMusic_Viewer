let activeDB = null;

// Wraps a DB operation with one automatic retry on InvalidStateError
// (stale connection from versionchange/close race condition).
async function withDB(fn) {
    try {
        return await fn(await openDB());
    } catch (err) {
        if (err.name === 'InvalidStateError') {
            activeDB = null;
            return await fn(await openDB());
        }
        throw err;
    }
}

function txPromise(db, mode, fn) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('store', mode);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
        fn(tx.objectStore('store'), resolve, reject);
    });
}

export function get(key) {
    return withDB(db => txPromise(db, 'readonly', (store, resolve, reject) => {
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

export function set(key, value) {
    return withDB(db => txPromise(db, 'readwrite', (store, resolve, reject) => {
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

export function remove(key) {
    return withDB(db => txPromise(db, 'readwrite', (store, resolve, reject) => {
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

export function clear() {
    return withDB(db => txPromise(db, 'readwrite', (store, resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    }));
}

export function getAllKeys() {
    return withDB(db => txPromise(db, 'readonly', (store, resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

export function closeDB() {
    if (activeDB) {
        activeDB.close();
        activeDB = null;
    }
}

function openDB() {
    if (activeDB) return Promise.resolve(activeDB);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('ScoreFlowStorage', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('store');
        request.onsuccess = () => {
            activeDB = request.result;
            activeDB.onversionchange = () => { activeDB.close(); activeDB = null; };
            activeDB.onclose = () => { activeDB = null; };
            resolve(activeDB);
        };
        request.onerror = () => reject(request.error);
    });
}
