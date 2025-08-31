// background orchestrator
// Ensure we can see when the MV3 service worker starts
try { console.log('AIPG SW (background.ts) starting'); } catch { }
import { ensureSeedProviders, getServicesForOrigin } from './services/db.ts';
import { setupMemoryCleanup } from './services/memory/retention.ts';
import { inferSiteCategory } from './services/risk/siteCategories.ts';
import { assessRisk, explainRisk } from './services/risk/riskEngine.ts';
import { classifyRequest } from './services/classifier.ts';
// Capture URL/method early (covers main_frame and subresource fetches)
chrome.webRequest.onBeforeRequest.addListener(
    (details: any) => { classifyRequest(details).catch(() => { }); },
    { urls: ['<all_urls>'] }
);

declare const chrome: any;

// --- Centralized popup manager to avoid too many windows ---
let __aipgPopupWinId: number | undefined;
let __aipgPopupTabId: number | undefined;
let __aipgLastPopupAnyAt = 0;
let __aipgAutoCloseTimer: number | undefined;
let __aipgCurrentPopupOrigin: string | undefined;

type RiskLevel = 'low' | 'medium' | 'high';

async function getAutoPopupFlags() {
    const s = await new Promise<any>((resolve) => chrome.storage.local.get([
        'autopopupEnabled', 'autopopupThreshold', 'autopopupOriginCooldownMs', 'autopopupGlobalCooldownMs', 'aipgAutopopup'
    ], resolve));
    return {
        enabled: s.autopopupEnabled !== false,
        threshold: String(s.autopopupThreshold || 'medium').toLowerCase() as RiskLevel,
        originCdMs: Number.isFinite(s.autopopupOriginCooldownMs) ? Number(s.autopopupOriginCooldownMs) : 5 * 60_000,
        globalCdMs: Number.isFinite(s.autopopupGlobalCooldownMs) ? Number(s.autopopupGlobalCooldownMs) : 60_000,
        originMap: (s.aipgAutopopup || {}) as Record<string, number>,
    };
}

function meetsThreshold(level: RiskLevel, threshold: RiskLevel) {
    const rank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };
    return rank[level] >= rank[threshold];
}

async function shouldOpenPopup(origin: string, level: RiskLevel) {
    const now = Date.now();
    const { enabled, threshold, originCdMs, globalCdMs, originMap } = await getAutoPopupFlags();
    if (!enabled) return false;
    if (!meetsThreshold(level, threshold)) return false;
    if (__aipgLastPopupAnyAt && (now - __aipgLastPopupAnyAt) < globalCdMs) return false;
    const last = Number(originMap[origin] || 0);
    if (last && (now - last) < originCdMs) return false;
    originMap[origin] = now;
    await chrome.storage.local.set({ aipgAutopopup: originMap });
    __aipgLastPopupAnyAt = now;
    return true;
}

async function openOrFocusPopup(origin: string, advanced?: boolean) {
    try {
        const url = chrome.runtime.getURL('popup.html') + `?origin=${encodeURIComponent(origin)}${advanced ? '&advanced=1' : ''}`;
        if (__aipgPopupWinId && __aipgPopupTabId) {
            try {
                const win = await chrome.windows.get(__aipgPopupWinId);
                if (win && win.id != null) {
                    try { await chrome.tabs.update(__aipgPopupTabId, { url, active: true }); } catch { }
                    await chrome.windows.update(__aipgPopupWinId, { focused: true });
                    // Reset auto-close timer when reusing the window
                    __aipgCurrentPopupOrigin = origin;
                    scheduleAutoClose(origin);
                    return;
                }
            } catch { /* fall through to create */ }
        }
        const w = await chrome.windows.create({ url, type: 'popup', width: 420, height: 640, focused: true });
        __aipgPopupWinId = w.id as number;
        if (w.tabs && w.tabs.length) __aipgPopupTabId = w.tabs[0].id as number;
        __aipgCurrentPopupOrigin = origin;
        scheduleAutoClose(origin);
        const onRemoved = (id: number) => {
            if (id === __aipgPopupWinId) {
                __aipgPopupWinId = undefined; __aipgPopupTabId = undefined;
                __aipgCurrentPopupOrigin = undefined;
                if (__aipgAutoCloseTimer) { clearTimeout(__aipgAutoCloseTimer); __aipgAutoCloseTimer = undefined; }
                try { chrome.windows.onRemoved.removeListener(onRemoved); } catch { }
            }
        };
        chrome.windows.onRemoved.addListener(onRemoved);
    } catch { }
}

function scheduleAutoClose(origin: string) {
    try {
        if (__aipgAutoCloseTimer) { clearTimeout(__aipgAutoCloseTimer); __aipgAutoCloseTimer = undefined; }
        // Auto-close after 2 minutes (120000 ms)
        __aipgAutoCloseTimer = setTimeout(async () => {
            try {
                if (__aipgPopupWinId != null) {
                    try { await chrome.windows.remove(__aipgPopupWinId); } catch { }
                }
            } finally {
                // Clear window refs
                __aipgPopupWinId = undefined;
                __aipgPopupTabId = undefined;
                __aipgAutoCloseTimer = undefined;
                // Reset cooldowns so same site can popup again immediately
                try {
                    const key = 'aipgAutopopup';
                    const data = await new Promise<any>((resolve) => chrome.storage.local.get([key], resolve));
                    const map = (data?.[key] || {}) as Record<string, number>;
                    if (origin && map[origin]) { delete map[origin]; }
                    await chrome.storage.local.set({ [key]: map });
                } catch { }
                __aipgLastPopupAnyAt = 0;
            }
        }, 120000) as unknown as number;
    } catch { }
}

chrome.webRequest.onBeforeSendHeaders.addListener(
    (details: any) => { classifyRequest(details).catch(() => { }); },
    { urls: ['<all_urls>'] },
    ['requestHeaders', 'extraHeaders']
);

chrome.webRequest.onHeadersReceived.addListener(
    (details: any) => { classifyRequest(details).catch(() => { }); },
    { urls: ['<all_urls>'] },
    ['responseHeaders', 'extraHeaders']
);

chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: any) => {
    // ---------------- Local Memory (used by content.js) ----------------
    const MEMORY_KEY = 'aipgMemoryRecords';
    const PII_INDEX_KEY = 'aipgPiiIndex';

    type AnyRec = any;
    function validateMemoryRecord(r: AnyRec): boolean {
        try {
            if (!r || typeof r !== 'object') { try { console.warn('AIPG SW: invalid record (not object)', r); } catch { }; return false; }
            if (!r.id || typeof r.id !== 'string') { try { console.warn('AIPG SW: invalid id', r && r.id); } catch { }; return false; }
            if (!r.ts || typeof r.ts !== 'number') { try { console.warn('AIPG SW: invalid ts', r && r.ts); } catch { }; return false; }
            if (!r.site || typeof r.site !== 'string') { try { console.warn('AIPG SW: invalid site', r && r.site); } catch { }; return false; }
            if (!r.conversationUrl || typeof r.conversationUrl !== 'string') { try { console.warn('AIPG SW: invalid conversationUrl', r && r.conversationUrl); } catch { }; return false; }
            if (!(r.direction === 'prompt' || r.direction === 'response')) { try { console.warn('AIPG SW: invalid direction', r && r.direction); } catch { }; return false; }
            if (typeof r.excerpt !== 'string') { try { console.warn('AIPG SW: invalid excerpt'); } catch { }; return false; }
            if (r.direction === 'prompt') {
                if (typeof r.rawAllowed !== 'boolean') { try { console.warn('AIPG SW: missing rawAllowed for prompt'); } catch { }; return false; }
                if (!r.piiCounts || typeof r.piiCounts !== 'object') { try { console.warn('AIPG SW: adding default piiCounts'); } catch { }; r.piiCounts = { EMAIL: 0, PHONE: 0, CARD: 0, APIKEY: 0 }; }
            }
            // clamp
            r.excerpt = String(r.excerpt).slice(0, r.direction === 'response' ? 500 : 240);
            try { console.log('AIPG SW: validate ok', r.direction, r.id); } catch { }
            return true;
        } catch (e) { try { console.error('AIPG SW: validate exception', e); } catch { }; return false; }
    }

    // Immediate write with capping (avoid timers that may suspend)
    async function writeMemory(record: AnyRec): Promise<boolean> {
        if (!validateMemoryRecord(record)) return false;
        return await new Promise<boolean>((resolve) => {
            chrome.storage.local.get([MEMORY_KEY], (res: any) => {
                try {
                    const arr: AnyRec[] = Array.isArray(res?.[MEMORY_KEY]) ? res[MEMORY_KEY] : [];
                    const next = arr.concat([record]).sort((a, b) => a.ts - b.ts);
                    const capped = next.slice(Math.max(0, next.length - 500));
                    chrome.storage.local.set({ [MEMORY_KEY]: capped }, () => {
                        if (chrome.runtime.lastError) { try { console.error('AIPG SW: memory set error', chrome.runtime.lastError); } catch { }; resolve(false); return; }
                        try { console.log('AIPG SW: stored memory len=', capped.length); } catch { }
                        resolve(true);
                    });
                } catch (e) { try { console.error('AIPG SW: writeMemory exception', e); } catch { }; resolve(false); }
            });
        });
    }

    if (msg?.type === 'AIPG_OPEN_POPUP_FOR_ORIGIN') {
        (async () => {
            try {
                const origin = String(msg.origin || '');
                const rl: RiskLevel = String(msg.riskLevel || 'medium').toLowerCase() as RiskLevel;
                const adv = !!msg.advanced;
                if (!origin) { sendResponse({ success: false, error: 'no_origin' }); return; }
                if (await shouldOpenPopup(origin, rl)) {
                    await openOrFocusPopup(origin, adv);
                    sendResponse({ success: true });
                } else {
                    sendResponse({ success: false, reason: 'cooldown_or_threshold' });
                }
            } catch (e) {
                sendResponse({ success: false, error: e?.message || String(e) });
            }
        })();
        return true;
    }
    if (msg && msg.type === 'MEMORY_WRITE') {
        (async () => {
            try {
                try { console.log('AIPG SW: got MEMORY_WRITE', msg.record); } catch { }
                const ok = await writeMemory(msg.record);
                sendResponse({ success: ok });
            } catch (e) {
                try { console.error('AIPG SW: MEMORY_WRITE handler error', e); } catch { }
                sendResponse({ success: false, error: (e as any)?.message || 'write-failed' });
            }
        })();
        return true;
    }
    if (msg && msg.type === 'MEMORY_LIST') {
        chrome.storage.local.get([MEMORY_KEY], (res: any) => {
            sendResponse({ success: true, records: Array.isArray(res?.[MEMORY_KEY]) ? res[MEMORY_KEY] : [] });
        });
        return true;
    }
    if (msg && msg.type === 'MEMORY_DELETE') {
        const id = String(msg.id || '');
        chrome.storage.local.get([MEMORY_KEY], (res: any) => {
            const arr: AnyRec[] = Array.isArray(res?.[MEMORY_KEY]) ? res[MEMORY_KEY] : [];
            const next = arr.filter(r => r && r.id !== id);
            chrome.storage.local.set({ [MEMORY_KEY]: next }, () => sendResponse({ success: true }));
        });
        return true;
    }
    if (msg && msg.type === 'MEMORY_PURGE') {
        chrome.storage.local.set({ [MEMORY_KEY]: [], ['aipgPiiIndex']: {} }, () => sendResponse({ success: true }));
        return true;
    }
    if (msg && msg.type === 'PII_FOUND') {
        try {
            const { chatId, messageId, link, site, counts } = msg;
            if (!chatId || !messageId || !link) { sendResponse({ success: false, error: 'bad-args' }); return true; }
            chrome.storage.local.get([PII_INDEX_KEY], (res: any) => {
                const map = (res && res[PII_INDEX_KEY]) || {};
                const rec = map[chatId] || { link, site: site || null, lastTs: 0, items: [] };
                rec.link = link; if (site) rec.site = site;
                rec.items.push({ id: messageId, ts: Date.now(), counts: counts || null });
                rec.lastTs = Date.now();
                map[chatId] = rec;
                chrome.storage.local.set({ [PII_INDEX_KEY]: map }, () => sendResponse({ success: true }));
            });
        } catch (e) { sendResponse({ success: false, error: (e as any)?.message || 'pii-found-failed' }); }
        return true;
    }
    if (msg && msg.type === 'PII_INDEX_LIST') {
        chrome.storage.local.get([PII_INDEX_KEY], (res: any) => {
            sendResponse({ success: true, data: res && res[PII_INDEX_KEY] ? res[PII_INDEX_KEY] : {} });
        });
        return true;
    }
    if (msg?.type === 'GET_SERVICES_FOR_ORIGIN') {
        (async () => {
            try {
                const origin = String(msg.origin || '');
                const list = await getServicesForOrigin(origin);
                sendResponse({ success: true, data: list });
            } catch (e) {
                sendResponse({ success: false, error: e?.message || String(e) });
            }
        })();
        return true;
    }
    if (msg?.type === 'FETCH_POLICY') {
        (async () => {
            try {
                const siteUrl = String(msg.siteUrl || '');
                const hinted = String(msg.url || '');
                const candidate = hinted || siteUrl;
                let finalUrl: string | null = null;
                let html = '';
                if (candidate) {
                    // basic autodiscovery: try common policy paths if not a policy URL already
                    const base = new URL(candidate).origin;
                    const tries = hinted ? [hinted] : [
                        base + '/privacy',
                        base + '/privacy-policy',
                        base + '/legal/privacy',
                        base + '/policies/privacy'
                    ];
                    for (const u of tries) {
                        try {
                            const res = await fetch(u, { credentials: 'omit' });
                            if (res.ok) {
                                const ct = res.headers.get('content-type') || '';
                                if (/text\/html|text\/plain|application\/json/i.test(ct)) {
                                    html = await res.text(); finalUrl = u; break;
                                }
                            }
                        } catch { /* ignore and continue */ }
                    }
                }
                // send raw HTML so content can run Readability; also include fallback plain text
                const plain = (html || '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 6000);
                sendResponse({ success: true, url: finalUrl, html: html || '', excerpt: plain, fullText: plain, baseUrl: finalUrl || candidate || null });
            } catch (e) {
                sendResponse({ success: false, error: e?.message || String(e) });
            }
        })();
        return true;
    }
    if (msg?.type === 'OPEN_POPUP_WINDOW') {
        (async () => {
            try {
                const origin = msg?.origin ? String(msg.origin) : '';
                const url = chrome.runtime.getURL('popup.html') + (origin ? `?origin=${encodeURIComponent(origin)}` : '');
                await chrome.windows.create({ url, type: 'popup', width: 420, height: 640 });
                sendResponse({ success: true });
            } catch (e) {
                sendResponse({ success: false, error: e?.message || String(e) });
            }
        })();
        return true;
    }
    if (msg?.type === 'RISK_ASSESS') {
        (async () => {
            try {
                const { origin, trackersPresent, processing, piiSummary } = msg?.ctx || {};
                const siteCategory = inferSiteCategory(new URL(origin).hostname, origin);
                const assessment = assessRisk({ origin, processing, trackersPresent: !!trackersPresent, siteCategory, piiSummary });
                const text = await explainRisk(assessment, { origin, processing, trackersPresent: !!trackersPresent, siteCategory, piiSummary });
                sendResponse({ success: true, data: { assessment, text } });
            } catch (e) {
                sendResponse({ success: false, error: e?.message || String(e) });
            }
        })();
        return true;
    }
    if (msg?.type === 'TEST_GEMINI_KEY' || msg?.type === 'CALL_GEMINI') {
        sendResponse({ success: false, error: 'Cloud features disabled (local-only).' });
        return false;
    }
});

ensureSeedProviders().catch(() => { });
// Seed defaults if missing
try {
    chrome.storage.local.get(['riskEngineEnabled', 'sanitizationEnabled', 'granularityEnabled', 'sessionSanitizerEnabled', 'memoryCenterEnabled', 'useLocalAIForExplanations', 'strictMode', 'ttlDays', 'granularitySettings', 'alwaysMaskEnabled', 'autopopupThreshold'], (r: any) => {
        const patch: any = {};
        if (r.riskEngineEnabled === undefined) patch.riskEngineEnabled = true;
        if (r.sanitizationEnabled === undefined) patch.sanitizationEnabled = true;
        if (r.granularityEnabled === undefined) patch.granularityEnabled = true;
        if (r.sessionSanitizerEnabled === undefined) patch.sessionSanitizerEnabled = true;
        if (r.memoryCenterEnabled === undefined) patch.memoryCenterEnabled = true;
        if (r.useLocalAIForExplanations === undefined) patch.useLocalAIForExplanations = true;
        if (r.strictMode === undefined) patch.strictMode = false;
        if (r.ttlDays === undefined) patch.ttlDays = 14;
        if (!r.granularitySettings) patch.granularitySettings = { email: 'domain_only', phone: 'last_4', address: 'city_only', dob: 'age_range', card: 'last_4' };
        if (r.alwaysMaskEnabled === undefined) patch.alwaysMaskEnabled = true;
        if (!r.autopopupThreshold) patch.autopopupThreshold = 'medium';
        if (r.autopopupEnabled === undefined) patch.autopopupEnabled = true; // default ON
        if (Object.keys(patch).length) chrome.storage.local.set(patch);
    });
} catch { }

// Setup memory retention alarm
setupMemoryCleanup();
