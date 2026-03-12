let activeDB = null;

export async function get(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('store', 'readonly');
        const request = transaction.objectStore('store').get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function set(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('store', 'readwrite');
        const request = transaction.objectStore('store').put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
    });
}

export async function remove(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('store', 'readwrite');
        const request = transaction.objectStore('store').delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function clear() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('store', 'readwrite');
        const request = transaction.objectStore('store').clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
    });
}

export async function getAllKeys() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction('store', 'readonly');
        const request = transaction.objectStore('store').getAllKeys();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        transaction.onerror = () => reject(transaction.error);
    });
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
