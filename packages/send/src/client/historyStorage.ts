/**
 * Send History — localStorage persistence for anonymous send sessions.
 *
 * Stores rich metadata (fileName, fileSize, expiry) in a single JSON array.
 * Max 50 entries with FIFO eviction. Expired entries pruned on every read.
 *
 * Share URLs include the full #key= fragment. The server never sees the fragment
 * (it's a URL hash, not sent in HTTP requests), so zero-knowledge holds server-side.
 * localStorage is the sender's own browser, where the key already lives at the
 * moment of sharing — omitting it here would just break re-copying from history.
 */

export interface SendHistoryEntry {
    sessionId: string;
    fileName: string;
    fileSize: number;
    /** Full share URL including the #key= fragment */
    shareUrl: string;
    /** ISO timestamp */
    expiresAt: string;
    /** ISO timestamp */
    createdAt: string;
}

const STORAGE_KEY = "stenvault:send:history";
const MAX_ENTRIES = 50;

function readRaw(): SendHistoryEntry[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn("[SendHistory] Corrupt localStorage data, clearing:", err);
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* best effort */ }
        return [];
    }
}

function writeRaw(entries: SendHistoryEntry[]): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch {
        // Quota exceeded or private browsing — best effort
    }
}

function filterExpired(entries: SendHistoryEntry[]): SendHistoryEntry[] {
    const now = Date.now();
    return entries.filter((e) => new Date(e.expiresAt).getTime() > now);
}

/** Read history, filtering out expired entries (rewrites to localStorage). */
export function getHistory(): SendHistoryEntry[] {
    const all = readRaw();
    const live = filterExpired(all);
    // Rewrite if we pruned any expired entries
    if (live.length !== all.length) {
        writeRaw(live);
    }
    return live;
}

/** Add a new entry (newest first). Evicts oldest if > MAX_ENTRIES. */
export function addToHistory(entry: SendHistoryEntry): void {
    const current = filterExpired(readRaw());
    // Deduplicate by sessionId
    const filtered = current.filter((e) => e.sessionId !== entry.sessionId);
    const updated = [entry, ...filtered].slice(0, MAX_ENTRIES);
    writeRaw(updated);
}

/** Remove a single entry by sessionId (dismiss). */
export function removeFromHistory(sessionId: string): void {
    const current = readRaw();
    writeRaw(current.filter((e) => e.sessionId !== sessionId));
}

/** Clear all history (used after successful backend migration). */
export function clearHistory(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // Best effort
    }
}
