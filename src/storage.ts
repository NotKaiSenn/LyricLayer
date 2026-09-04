import type { TranslationEntry } from "./types";

export interface TranslationStore {
  get(trackUri: string): Promise<TranslationEntry | undefined>;
  save(entry: TranslationEntry): Promise<void>;
  delete(trackUri: string): Promise<void>;
  getAll(): Promise<TranslationEntry[]>;
}

const DB_NAME = "lyric-layer";
const STORE_NAME = "translations";
const DB_VERSION = 1;

export class IndexedDbTranslationStore implements TranslationStore {
  private dbPromise?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "trackUri" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("无法打开翻译数据库"));
    });
    return this.dbPromise;
  }

  private async request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = run(tx.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("数据库操作失败"));
      tx.onabort = () => reject(tx.error ?? new Error("数据库事务已中止"));
    });
  }

  get(trackUri: string): Promise<TranslationEntry | undefined> {
    return this.request("readonly", (store) => store.get(trackUri));
  }

  async save(entry: TranslationEntry): Promise<void> {
    await this.request("readwrite", (store) => store.put(entry));
  }

  async delete(trackUri: string): Promise<void> {
    await this.request("readwrite", (store) => store.delete(trackUri));
  }

  getAll(): Promise<TranslationEntry[]> {
    return this.request("readonly", (store) => store.getAll());
  }
}
