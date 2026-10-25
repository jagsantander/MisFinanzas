/** Persistencia mínima en IndexedDB (una sola clave por valor). Si no hay IndexedDB, queda solo en memoria. */
const DB_NAME = "misfinanzas";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  } catch { return undefined; }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* sin almacenamiento: la sesión sigue en memoria */ }
}

export async function idbClear(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((resolve) => { const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).clear(); tx.oncomplete = () => resolve(); });
  } catch { /* nada que borrar */ }
}
