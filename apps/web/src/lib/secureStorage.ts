/**
 * Secure Storage Utility
 *
 * Direct IndexedDB wrapper for storing sensitive data (private keys, tokens).
 * No abstraction layer -- this is web-only and uses the `idb` library directly.
 *
 * Replaces the StorageProvider.secure interface that was part of the
 * platform abstraction layer (removed since React Native sharing was abandoned).
 */

import { openDB, type IDBPDatabase } from 'idb';

// ============ Types ============

interface SecureStorageDB {
    secureData: {
        key: string;
        value: {
            data: string;
            createdAt: number;
            updatedAt: number;
        };
    };
}

// ============ Module-level state ============

const DB_NAME = 'stenvault-secure';
const DB_VERSION = 1;
let db: IDBPDatabase<SecureStorageDB> | null = null;

async function getDB(): Promise<IDBPDatabase<SecureStorageDB>> {
    if (db) return db;

    db = await openDB<SecureStorageDB>(DB_NAME, DB_VERSION, {
        upgrade(database) {
            if (!database.objectStoreNames.contains('secureData')) {
                database.createObjectStore('secureData');
            }
        },
    });

    return db;
}

// ============ Public API ============

/**
 * Store sensitive data in IndexedDB
 */
export async function setSecureItem(key: string, value: string): Promise<void> {
    const database = await getDB();
    const now = Date.now();

    await database.put(
        'secureData',
        { data: value, createdAt: now, updatedAt: now },
        key,
    );
}

/**
 * Retrieve sensitive data from IndexedDB
 */
export async function getSecureItem(key: string): Promise<string | null> {
    const database = await getDB();
    const entry = await database.get('secureData', key);
    return entry?.data ?? null;
}

/**
 * Remove sensitive data from IndexedDB
 */
export async function removeSecureItem(key: string): Promise<void> {
    const database = await getDB();
    await database.delete('secureData', key);
}
