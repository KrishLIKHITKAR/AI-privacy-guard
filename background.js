// background.js

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

async function getApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["GEMINI_API_KEY"], (result) => {
            resolve(result.GEMINI_API_KEY || null);
        });
    });
}

// --- Local 7-day logs ---
function withLogs(cb) {
    chrome.storage.local.get(['aiLogs', 'retentionDays'], (res) => {
        const now = Date.now();
        const days = (typeof res.retentionDays === 'number' ? res.retentionDays : 7);
        const windowMs = days * 24 * 60 * 60 * 1000;
        const arr = (res.aiLogs || []).filter((e) => e && e.time && (now - e.time) <= windowMs);
        cb(arr);
    });
}
function saveLogs(arr, done) {
    chrome.storage.local.set({ aiLogs: arr }, done);
}

// Minimal PII redaction for any outbound cloud prompts
function redactPII(text) {
    try {
        if (typeof text !== 'string') return text;
        let t = text;
        // Emails
        t = t.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED:EMAIL]');
        // Phone numbers (US-style variants)
        t = t.replace(/\b(?:\+?1[-.\s]?)?(?:\(\d{3}\)|\d{3})[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[REDACTED:PHONE]');
        // SSN
        t = t.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED:SSN]');
        // Credit/Debit card numbers (13-19 digits, allowing spaces/dashes)
        t = t.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED:CARD]');
        // IPv4
        t = t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[REDACTED:IP]');
        // Government/ID numbers (heuristic)
        t = t.replace(/\b(passport|driver'?s?\s*license|dl\s*number|national\s*id)[:#]?\s*[A-Z0-9-]+\b/gi, '[REDACTED:ID]');
        // Strip URL query strings to avoid leaking tokens/ids
        t = t.replace(/https?:\/\/[^\s"']+/gi, (m) => {
            try {
                const u = new URL(m);
                return `${u.origin}${u.pathname}`; // drop search/hash
            } catch {
                return m;
            }
        });
        return t;
    } catch {
        return text;
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'BOT_DETECT') {
        (async () => {
            try {
                // Run in the page context to access navigator/window signals
                const tabId = sender?.tab?.id;
                if (!tabId) throw new Error('No active tab for bot detection');
                const [{ result }] = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: async () => {
                        try {
                            const anyGlobal = globalThis;
                            // Inline minimal heuristic + optional global botd
                            async function detect() {
                                try {
                                    if (anyGlobal && anyGlobal.botd && typeof anyGlobal.botd.load === 'function') {
                                        const botd = await anyGlobal.botd.load();
                                        const r = await botd.detect();
                                        const bot = r?.bot || {};
                                        const isBot = String(bot.result || '').toLowerCase() === 'bot';
                                        const confidence = typeof bot.probability === 'number' ? Math.max(0, Math.min(1, bot.probability)) : (isBot ? 0.8 : 0.6);
                                        return { isBot, confidence, signals: { type: bot.type, probability: bot.probability, requestId: r?.requestId, raw: bot } };
                                    }
                                } catch { }

                                const nav = navigator;
                                const signals = {
                                    webdriver: !!nav.webdriver,
                                    pluginsLength: (nav.plugins && nav.plugins.length) || 0,
                                    languagesLength: (nav.languages && nav.languages.length) || 0,
                                    hardwareConcurrency: (nav.hardwareConcurrency || 0),
                                    deviceMemory: (nav.deviceMemory || 0),
                                    userAgent: (nav.userAgent || ''),
                                };
                                let score = 0;
                                if (signals.webdriver) score += 0.6;
                                if (signals.pluginsLength === 0) score += 0.1;
                                if (signals.languagesLength === 0) score += 0.1;
                                if (/headless|puppeteer|playwright/i.test(signals.userAgent)) score += 0.6;
                                const isBot = score >= 0.6;
                                const confidence = Math.max(0.2, Math.min(1, score));
                                return { isBot, confidence, signals };
                            }
                            return await detect();
                        } catch (e) {
                            return { isBot: false, confidence: 0.5, signals: { error: e?.message || 'botd-failed' } };
                        }
                    },
                });
                sendResponse({ success: true, data: result });
            } catch (err) {
                sendResponse({ success: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (message.type === 'SUMMARIZE_POLICY_ONDEVICE') {
        (async () => {
            try {
                const { excerpt } = message;
                if (!excerpt || typeof excerpt !== 'string' || !excerpt.trim()) {
                    sendResponse({ success: true, summary: 'No clear privacy/AI policy found. This can be risky.' });
                    return;
                }
                // Placeholder for Chrome on-device AI (if exposed in the future).
                // For now, just return the first 3 heuristic bullets similarly to rulesEngine.
                const text = excerpt.replace(/\s+/g, ' ').trim();
                const points = [];
                if (/do\s+not\s+sell|don't\s+sell|opt[- ]?out/i.test(text)) points.push('Mentions opt-out or “do not sell” options.');
                if (/third[- ]?part(y|ies)|share with/i.test(text)) points.push('Shares data with third parties.');
                if (/retain|retention|store for/i.test(text)) points.push('Specifies data retention.');
                if (/advertis|marketing|personaliz/i.test(text)) points.push('Uses data for advertising/marketing.');
                if (/ai|machine\s*learning|model/i.test(text)) points.push('References AI/model usage.');
                if (/cookie|tracking|analytics/i.test(text)) points.push('Mentions cookies/analytics tracking.');
                const out = points.slice(0, 3).join(' ');
                sendResponse({ success: true, summary: out || text.slice(0, 300) });
            } catch (err) {
                sendResponse({ success: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (message.type === 'LOG_EVENT') {
        withLogs((arr) => {
            arr.push(message.entry);
            saveLogs(arr, () => sendResponse({ success: true }));
        });
        return true;
    }
    if (message.type === 'EXPORT_LOGS') {
        withLogs((arr) => {
            sendResponse({ success: true, data: arr });
        });
        return true;
    }
    if (message.type === 'FETCH_POLICY') {
        (async () => {
            try {
                const policyUrl = (message && typeof message.url === 'string' && message.url) || null;
                const siteUrl = (message && typeof message.siteUrl === 'string' && message.siteUrl) || null;
                const full = !!(message && message.full);
                const origin = (() => {
                    try {
                        if (siteUrl) return new URL(siteUrl).origin;
                        return new URL(sender?.url || '').origin;
                    } catch { return null; }
                })();

                // Simple cache (24h TTL) keyed by URL or origin
                const cacheKey = policyUrl || `${origin}/__auto_policy`;
                const cache = await new Promise(resolve => chrome.storage.local.get(['policyCache'], res => resolve(res.policyCache || {})));
                const cached = cache[cacheKey];
                const ttlMs = 24 * 60 * 60 * 1000;
                if (cached && cached.ts && (Date.now() - cached.ts) < ttlMs) {
                    sendResponse({ success: true, excerpt: cached.excerpt, cached: true });
                    return;
                }

                // Helper: fetch a URL and extract readable text
                async function fetchAndExtract(u) {
                    const res = await fetch(u, { method: 'GET' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const html = await res.text();
                    // Remove scripts/styles/noscript
                    let t = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
                        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                        .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
                    // Keep headings and paragraphs markers to preserve boundaries
                    t = t.replace(/<\/(h1|h2|h3|p|li)>/gi, '\n')
                        .replace(/<br\s*\/?>/gi, '\n');
                    // Strip all other tags
                    t = t.replace(/<[^>]+>/g, ' ');
                    // Decode a few common entities
                    t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                    // Collapse whitespace
                    t = t.replace(/[\t\r]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').replace(/\s{2,}/g, ' ').trim();
                    // Focus around typical headings
                    const lower = t.toLowerCase();
                    const markers = ['privacy policy', 'privacy notice', 'data protection', 'política de privacidad', 'politique de confidentialité', 'datenschutz'];
                    let start = 0;
                    for (const m of markers) {
                        const i = lower.indexOf(m);
                        if (i >= 0) { start = Math.max(0, i - 200); break; }
                    }
                    const excerpt = t.slice(start, start + 4000); // up to ~4k chars for better summary
                    const fullText = t.slice(0, 100000); // cap ~100k chars
                    return { excerpt, fullText };
                }

                async function discoverPolicyFromOrigin() {
                    if (!origin) throw new Error('No origin and URL provided');
                    const bases = [origin];
                    const paths = [
                        '/privacy', '/privacy-policy', '/legal/privacy',
                        '/policies/privacy', '/privacy.html', '/privacypolicy',
                        '/terms/privacy', '/legal', '/terms-and-privacy',
                        '/privacy-notice', '/data-protection', '/gdpr',
                        '/en/privacy', '/en/privacy-policy', '/policy/privacy'
                    ];
                    for (const b of bases) {
                        for (const p of paths) {
                            const u = b + p;
                            try {
                                const ex = await fetchAndExtract(u);
                                return { url: u, excerpt: ex.excerpt, fullText: ex.fullText };
                            } catch (_) { /* try next */ }
                        }
                    }
                    throw new Error('Policy not found via auto-discovery');
                }

                let finalUrl = policyUrl;
                let excerpt;
                let fullText;
                try {
                    if (finalUrl) {
                        const data = await fetchAndExtract(finalUrl);
                        excerpt = data.excerpt;
                        fullText = data.fullText;
                    } else {
                        const found = await discoverPolicyFromOrigin();
                        finalUrl = found.url;
                        excerpt = found.excerpt;
                        fullText = found.fullText;
                    }
                } catch (e) {
                    // Last resort: return empty excerpt
                    excerpt = '';
                    fullText = '';
                }

                // Save cache
                try {
                    const k = finalUrl || cacheKey;
                    const next = Object.assign({}, cache, { [k]: { ts: Date.now(), excerpt, fullText } });
                    chrome.storage.local.set({ policyCache: next }, () => { });
                } catch { }

                const payload = { success: true, excerpt, url: finalUrl };
                if (full) payload.fullText = fullText;
                sendResponse(payload);
            } catch (err) {
                sendResponse({ success: false, error: err?.message || String(err) });
            }
        })();
        return true;
    }
    if (message.type === 'CLEAR_LOGS') {
        saveLogs([], () => sendResponse({ success: true }));
        return true;
    }
    if (message.type === "TEST_GEMINI_KEY") {
        (async () => {
            try {
                const apiKey = await getApiKey();
                if (!apiKey) throw new Error("Missing Gemini API key.");
                const url = `${GEMINI_API_URL}?key=${apiKey}`; // GET models listing
                const res = await fetch(url, { method: "GET" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`);
                sendResponse({ success: true });
            } catch (err) {
                sendResponse({ success: false, error: err.message || String(err) });
            }
        })();
        return true;
    }
    if (message.type === "CALL_GEMINI") {
        (async () => {
            try {
                const apiKey = await getApiKey();
                if (!apiKey) {
                    throw new Error("Missing Gemini API key. Set it in extension settings.");
                }
                const { model, prompt, systemInstruction, responseSchema, site_url, is_sensitive } = message;

                // Cloud toggle
                const { cloudEnabled } = await new Promise((resolve) => {
                    chrome.storage.local.get(['cloudEnabled'], (res) => resolve({ cloudEnabled: !!res.cloudEnabled }));
                });
                if (!cloudEnabled) {
                    throw new Error('Cloud analysis disabled in settings.');
                }

                // Enforcement: block cloud calls on sensitive sites unless explicitly allowed once
                const origin = (() => { try { return new URL(site_url || '').origin; } catch { return null; } })();
                if (is_sensitive && origin) {
                    const decision = await new Promise((resolve) => {
                        chrome.storage.local.get(['siteDecisions', 'allowMinutes', 'sensitiveDefault'], (res) => {
                            const map = res.siteDecisions || {};
                            const d = map[origin] || null;
                            const allowMs = Math.max(1, Number(res.allowMinutes || 5)) * 60 * 1000;
                            if (d && d.mode === 'allow_once' && d.ts && (Date.now() - d.ts) <= allowMs) {
                                resolve({ mode: 'allow_once', expiresAt: d.ts + allowMs });
                                return;
                            }
                            resolve(d || { mode: res.sensitiveDefault === 'ask' ? 'ask' : 'block' });
                        });
                    });
                    const d = decision || {};
                    const allowOnceActive = d.mode === 'allow_once' && d.expiresAt && d.expiresAt > Date.now();
                    if (!allowOnceActive) {
                        throw new Error('Cloud processing blocked by policy for this sensitive site. Use Allow once.');
                    }
                }

                const url = `${GEMINI_API_URL}/${model}:generateContent?key=${apiKey}`;

                const body = {
                    contents: [
                        { role: "user", parts: [{ text: redactPII(String(prompt || '')) }] }
                    ],
                    systemInstruction: {
                        role: "system",
                        parts: [{ text: systemInstruction }]
                    }
                    ,
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema
                    }
                };

                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error?.message || "Gemini API error");
                }

                // Parse JSON response safely
                let parsed;
                try {
                    parsed = JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
                } catch (err) {
                    throw new Error("Failed to parse Gemini JSON output");
                }

                sendResponse({ success: true, data: parsed });
            } catch (err) {
                sendResponse({ success: false, error: err.message });
            }
        })();

        return true; // async
    }
});