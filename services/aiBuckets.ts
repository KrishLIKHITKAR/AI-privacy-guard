// services/aiBuckets.ts - tab+origin AI signal buckets with persistence
import { getLocal, setLocal, DB_KEYS, ProviderDB } from './db';

declare const chrome: any;

export type SignalCounts = {
    aiPost: number;
    sse: number;
    modelDownload: number; // legacy aggregate
    modelDownloadsMed?: number;
    modelDownloadsHuge?: number;
    streamLarge?: number; // SSE/NDJSON > threshold
    passive: number;
};

export type SignalBucket = {
    tabId: number;
    origin: string;
    counts: SignalCounts;
    windowStart: number; // ms epoch
    ts: number; // last update
    piiMarks?: number;
    lastPiiTs?: number;
    piiKinds?: Set<string>;
};

export const BUCKET_STORE_KEY = 'aipgAIBuckets';
const WINDOW_MS = 30_000; // 30s active window
const WRITE_DEBOUNCE_MS = 500;

const buckets = new Map<string, SignalBucket>();
const writeTimers = new Map<string, number>();

// Path heuristics to spot AI endpoints; kept in sync with classifier
const pathHeuristics = /(generate|chat|prompt|predict|infer|inference|complet(ion|e)|embedd(ing|ings)|vision|speech|tts|stt|asr|ocr|translate|moderation|rerank|reason|think|model|models|v1|v2|stream|sse|ws|vertex|gemini|ai|ml|l(la)?m)/i;

export function tabOriginKey(tabId: number, origin: string): string {
    return `${tabId}|${origin}`;
}

export function getBucketsMap(): Map<string, SignalBucket> {
    return buckets;
}

function pruneOld(now = Date.now()) {
    let changed = false;
    for (const [k, b] of buckets) {
        if ((now - b.ts) > WINDOW_MS) { buckets.delete(k); changed = true; }
    }
    return changed;
}

async function getProviderDomains(): Promise<Record<string, { name: string }>> {
    const res = await getLocal<ProviderDB>([DB_KEYS.providers]);
    const db = res[DB_KEYS.providers] as any as ProviderDB;
    return (db?.domains || {}) as Record<string, { name: string }>;
}

export async function isKnownAIHost(host: string): Promise<boolean> {
    try {
        const domains = await getProviderDomains();
        return !!domains[host];
    } catch { return false; }
}

export function persistBucket(key: string, bucket: SignalBucket) {
    // debounce writes per key
    try { if (writeTimers.has(key)) { clearTimeout(writeTimers.get(key) as number); } } catch { }
    const timer = setTimeout(async () => {
        try {
            const res = await getLocal<Record<string, SignalBucket>>([BUCKET_STORE_KEY]);
            const store = (res[BUCKET_STORE_KEY] as any) || {};
            store[key] = { tabId: bucket.tabId, origin: bucket.origin, counts: bucket.counts, windowStart: bucket.windowStart, ts: bucket.ts, piiMarks: bucket.piiMarks || 0, lastPiiTs: bucket.lastPiiTs || 0, piiKinds: Array.from(bucket.piiKinds || []) };
            await setLocal({ [BUCKET_STORE_KEY]: store });
        } catch { /* ignore */ }
        finally {
            try { if (writeTimers.has(key)) { clearTimeout(writeTimers.get(key) as number); } } catch { }
            writeTimers.delete(key);
        }
    }, WRITE_DEBOUNCE_MS) as unknown as number;
    writeTimers.set(key, timer);
}

export async function restoreBuckets(): Promise<Map<string, SignalBucket>> {
    try {
        const res = await getLocal<Record<string, SignalBucket>>([BUCKET_STORE_KEY]);
        const store = (res[BUCKET_STORE_KEY] as any) || {};
        buckets.clear();
        const now = Date.now();
        for (const [k, v] of Object.entries(store)) {
            if (v && typeof v === 'object') {
                const vv: any = v as any;
                const b: SignalBucket = {
                    tabId: Number(vv.tabId),
                    origin: String(vv.origin || ''),
                    counts: { aiPost: Number(vv.counts?.aiPost || 0), sse: Number(vv.counts?.sse || 0), modelDownload: Number(vv.counts?.modelDownload || 0), passive: Number(vv.counts?.passive || 0) },
                    windowStart: Number(vv.windowStart) || now,
                    ts: Number(vv.ts) || now,
                    piiMarks: Number(vv.piiMarks || 0),
                    lastPiiTs: Number(vv.lastPiiTs || 0),
                    piiKinds: new Set<string>(Array.isArray(vv.piiKinds) ? vv.piiKinds.map((s: any) => String(s)) : []),
                };
                // prune old (> WINDOW_MS)
                if ((now - b.ts) <= WINDOW_MS) buckets.set(k, b);
            }
        }
        // write back pruned
        try {
            const out: Record<string, SignalBucket> = {};
            for (const [k, v] of buckets) out[k] = v;
            await setLocal({ [BUCKET_STORE_KEY]: out });
        } catch { }
    } catch {
        buckets.clear();
    }
    return buckets;
}

export function withBucket(tabId: number, origin: string, fn: (b: SignalBucket) => SignalBucket | void): SignalBucket | null {
    if (!origin || !Number.isFinite(tabId) || tabId < 0) return null;
    const key = tabOriginKey(tabId, origin);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b) {
        b = { tabId, origin, counts: { aiPost: 0, sse: 0, modelDownload: 0, modelDownloadsMed: 0, modelDownloadsHuge: 0, streamLarge: 0, passive: 0 }, windowStart: now, ts: now };
    } else {
        // if window expired, reset counts and start a new window
        if ((now - b.windowStart) > WINDOW_MS) {
            b = { ...b, counts: { aiPost: 0, sse: 0, modelDownload: 0, modelDownloadsMed: 0, modelDownloadsHuge: 0, streamLarge: 0, passive: 0 }, windowStart: now };
        }
    }
    const before = JSON.stringify(b);
    const res = fn(b) || b;
    res.ts = now;
    const after = JSON.stringify(res);
    buckets.set(key, res);
    if (before !== after) persistBucket(key, res);
    // opportunistic prune
    if (pruneOld(now)) {
        try {
            const out: Record<string, SignalBucket> = {};
            for (const [k2, v2] of buckets) out[k2] = v2;
            void setLocal({ [BUCKET_STORE_KEY]: out });
        } catch { }
    }
    return res;
}

export function getActiveBucket(tabId: number, origin: string): SignalBucket | null {
    const b = buckets.get(tabOriginKey(tabId, origin));
    if (!b) return null;
    if ((Date.now() - b.ts) > WINDOW_MS) return null;
    return b;
}

export function computePassiveSighting(url: string, host: string): boolean {
    try {
        if (pathHeuristics.test(new URL(url).pathname)) return true;
    } catch { }
    // host-based will be checked by caller via isKnownAIHost
    return false;
}

// Check if any tab has recent activity for a given origin (within WINDOW_MS)
export function hasRecentActivityForOrigin(origin: string): boolean {
    const now = Date.now();
    for (const [, b] of buckets) {
        if (b.origin === origin && (now - b.ts) <= WINDOW_MS) return true;
    }
    return false;
}

// Dedup recent PII hashes for 2s to avoid flooding
const piiHashLastSeen = new Map<string, number>();

export type PiiMarkInput = { tabId: number; origin: string; kinds: string[]; hash: string; now?: number };

export function markPii(input: PiiMarkInput, windowMsForPii = 15_000, dedupeMs = 2_000): SignalBucket | null {
    const { tabId, origin, kinds, hash } = input;
    const now = input.now ?? Date.now();
    if (!origin || !Number.isFinite(tabId) || tabId < 0 || !hash) return null;
    const key = tabOriginKey(tabId, origin);
    const dedupeKey = `${key}|${hash}`;
    const last = piiHashLastSeen.get(dedupeKey) || 0;
    if (last && (now - last) < dedupeMs) return getActiveBucket(tabId, origin);
    piiHashLastSeen.set(dedupeKey, now);
    return withBucket(tabId, origin, (b) => {
        // Reset PII window if expired
        if (!b.lastPiiTs || (now - b.lastPiiTs) > windowMsForPii) {
            b.piiMarks = 0;
            b.piiKinds = new Set<string>();
        }
        b.piiMarks = (b.piiMarks || 0) + 1;
        b.lastPiiTs = now;
        if (!b.piiKinds) b.piiKinds = new Set<string>();
        for (const k of kinds || []) b.piiKinds.add(String(k));
        return b;
    });
}

export type PiiWindowConfig = { windowMs: number };
export function getDefaultPiiWindow(): number { return 15_000; }

// Pure helper for tests and classifier: should we escalate due to recent PII within window?
export function shouldEscalateWithPii(bucket: Pick<SignalBucket, 'lastPiiTs'> | null | undefined, now: number, windowMs: number): boolean {
    if (!bucket || !bucket.lastPiiTs) return false;
    return (now - bucket.lastPiiTs) <= windowMs;
}
