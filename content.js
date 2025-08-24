// content.js

console.log(`AI Privacy Guard content script loaded on page: ${location.href}`);

// Lightweight network observers to record POSTs (active usage) without modifying requests
try {
    (function () {
        const w = window;
        if (w.__aipgPatched) return;
        w.__aipgPatched = true;
        w.__aipgSignals = w.__aipgSignals || { posts: [], ws: [] };
        // fetch
        const origFetch = w.fetch;
        if (typeof origFetch === 'function') {
            w.fetch = function (input, init) {
                try {
                    const method = ((init && init.method) || 'GET').toUpperCase();
                    const url = typeof input === 'string' ? input : (input && input.url) || '';
                    if (method === 'POST') {
                        w.__aipgSignals.posts.push({ url, ts: Date.now() });
                    }
                } catch { }
                // @ts-ignore
                return origFetch.apply(this, arguments);
            };
        }
        // XHR
        if (w.XMLHttpRequest) {
            const origOpen = w.XMLHttpRequest.prototype.open;
            const origSend = w.XMLHttpRequest.prototype.send;
            w.XMLHttpRequest.prototype.open = function (method, url) {
                try { this.__aipgMethod = String(method || 'GET').toUpperCase(); this.__aipgUrl = String(url || ''); } catch { }
                return origOpen.apply(this, arguments);
            };
            w.XMLHttpRequest.prototype.send = function (body) {
                try {
                    if (this.__aipgMethod === 'POST') {
                        w.__aipgSignals.posts.push({ url: this.__aipgUrl || '', ts: Date.now(), bodySize: typeof body === 'string' ? body.length : 0 });
                    }
                } catch { }
                return origSend.apply(this, arguments);
            };
        }
    })();
} catch { }

function detectSensitiveCategory(hostname, href) {
    const cats = [];
    const h = String(hostname || '').toLowerCase();
    const u = String(href || '').toLowerCase();
    if (/\.gov$/.test(h) || /gov\b/.test(u)) cats.push('government');
    if (/bank|finance|pay|paypal|chase|boa|hsbc|citibank/.test(h + u)) cats.push('banking');
    if (/clinic|health|medical|patient|pharma|hospital/.test(h + u)) cats.push('healthcare');
    if (/\.edu$/.test(h) || /university|college|campus|edu\b/.test(u)) cats.push('education');
    if (/court|legal|law|attorney|bar\b/.test(h + u)) cats.push('legal');
    return Array.from(new Set(cats));
}

function detectFormsAndCredentials() {
    const hasForm = !!document.querySelector('form');
    const creds = !!document.querySelector('input[type="password"], input[name*="pass" i], input[name*="card" i], input[name*="ssn" i]');
    return { hasForm, creds };
}

function detectTrackers() {
    const patterns = [
        /google-analytics|googletagmanager|gtag/,
        /facebook|fbq|connect\.facebook\.net/,
        /segment|amplitude|mixpanel|hotjar|sentry/,
        /doubleclick|adservice|adroll/
    ];
    const urls = [];
    document.querySelectorAll('script[src], img[src], iframe[src]').forEach(el => {
        const src = el.getAttribute('src');
        if (src) urls.push(src);
    });
    return urls.some(u => patterns.some(p => p.test(u)));
}

function findPolicyLinkAbsolute() {
    try {
        const anchors = Array.from(document.querySelectorAll('a[href]'));
        const cand = anchors.find(a => /privacy|policy/i.test(a.textContent || '') || /privacy/i.test(a.getAttribute('href') || ''));
        if (!cand) return null;
        const href = cand.getAttribute('href');
        if (!href) return null;
        const url = new URL(href, location.href);
        return url.href;
    } catch {
        return null;
    }
}

async function aiGuessPolicyLink() {
    try {
        const anyGlobal = /** @type {any} */(globalThis);
        if (!(anyGlobal && anyGlobal.ai && anyGlobal.ai.prompt && anyGlobal.ai.prompt.create)) return null;
        const anchors = Array.from(document.querySelectorAll('a[href]'))
            .map(a => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').trim() }))
            .filter(x => x.href && !/^javascript:/i.test(x.href));
        if (anchors.length === 0) return null;
        const short = anchors.slice(0, 40); // limit prompt size
        const list = short.map((x, i) => `${i + 1}. ${x.text} -> ${x.href}`).join('\n');
        const session = await anyGlobal.ai.prompt.create();
        const q = `From the following links on a web page, select the one that most likely leads to the site's Privacy Policy. Respond with only the URL (absolute or relative) and nothing else. If none match, respond with "" (empty).\n\n${list}`;
        const answer = String(await session.prompt(q)).trim();
        if (!answer) return null;
        const href = answer.split(/\s+/)[0].trim();
        if (!href) return null;
        const url = new URL(href, location.href);
        return url.href;
    } catch { return null; }
}

async function gatherAISignals({ observeMs = 5000, whitelist = {} } = {}) {
    // Only consider strong signals: POSTs to known AI APIs OR large model downloads
    const aiEndpointPatterns = [
        // OpenAI
        /api\.openai\.com\/v1/i,
        // Anthropic
        /api\.anthropic\.com/i,
        // Google/Vertex
        /generativelanguage\.googleapis\.com/i,
        /aiplatform\.googleapis\.com/i,
        /vertex\.ai/i,
        // Azure OpenAI & Cognitive Services
        /openai\.azure\.com/i,
        /cognitiveservices\.azure\.com/i,
        /\/openai\/deployments\//i,
        // Cohere
        /api\.cohere\.ai/i,
        // Hugging Face
        /api-inference\.huggingface\.co/i,
        /huggingface\.co\/(api|models|inference)/i,
        // Replicate
        /api\.replicate\.com/i,
        // Stability
        /api\.stability\.ai/i
    ];
    const modelFileRe = /\.(onnx|tflite|safetensors|bin|gguf|pt|pth)(\?.*)?$/i;
    const ignoreResourceDomains = [
        /google-analytics\.com/i,
        /googletagmanager\.com/i,
        /doubleclick\.net/i,
        /facebook\.com\/(tr|plugins)/i,
        /connect\.facebook\.net/i,
        /linkedin\.com\/(analytics|li|px)/i,
        /twitter\.com\/i\/pixel/i,
        /cdnjs\.cloudflare\.com/i,
        /unpkg\.com/i,
        /jsdelivr\.net/i,
        /static\.hotjar\.com/i,
        /cdn\.segment\.com/i,
        /cdn\.amplitude\.com/i,
        /cdn\.mixpanel\.com/i
    ];

    const origin = (() => { try { return new URL(location.href).origin; } catch { return location.origin; } })();
    if (whitelist && (whitelist[origin] || whitelist['*' + origin.slice(origin.indexOf('.'))])) {
        return { aiDetected: false, processing: 'unknown', signals: 0, details: {} };
    }

    // Ensure our passive observers exist
    try { if (!window.__aipgSignals) window.__aipgSignals = { posts: [], ws: [] }; } catch { }

    // Wait for activity window
    await new Promise(resolve => setTimeout(resolve, observeMs));

    // Count POSTs to AI endpoints
    let aiPostCount = 0;
    try {
        const posts = (window.__aipgSignals && window.__aipgSignals.posts) || [];
        aiPostCount = posts.filter(p => aiEndpointPatterns.some(r => r.test(String(p.url || '')))).length;
    } catch { }

    // Detect large model downloads (likely on-device inference)
    let largeModelCount = 0;
    try {
        const resEntries = (performance.getEntriesByType('resource') || []);
        for (const r of resEntries) {
            const name = r && r.name;
            if (!name || ignoreResourceDomains.some(rx => rx.test(name))) continue;
            // model file extensions or common model filename patterns
            const modelPattern = /model[-_]?weights|checkpoint|\.ggml(\?.*)?$/i;
            if (!(modelFileRe.test(name) || modelPattern.test(name))) continue;
            const size = (r.transferSize || r.encodedBodySize || 0);
            if (size > 5_000_000) largeModelCount++; // >5MB to cut tiny assets
        }
    } catch { }

    // Optional passive endpoint sightings (not used to flip detection by themselves)
    let passiveEndpointSightings = 0;
    try {
        const resEntries = (performance.getEntriesByType('resource') || []);
        passiveEndpointSightings = resEntries.filter(r => aiEndpointPatterns.some(rx => rx.test(String(r && r.name || '')))).length;
    } catch { }

    // Optional WASM indicator count (transformer/tfjs/ort), does not flip detection
    let wasmIndicatorCount = 0;
    try {
        const wasmRx = /(ort[-_]?wasm|tfjs[-_]?backend[-_]?wasm|transformers?\.(wasm|js))/i;
        const resEntries = (performance.getEntriesByType('resource') || []);
        for (const r of resEntries) {
            const name = String(r && r.name || '');
            if (wasmRx.test(name)) {
                const size = (r.transferSize || r.encodedBodySize || 0);
                if (size > 1_000_000) wasmIndicatorCount++; // >1MB wasm/js
            }
        }
    } catch { }

    // Decision: require evidence of active POSTs or large model downloads
    const aiDetected = (aiPostCount > 0) || (largeModelCount > 0);
    const processing = aiPostCount > 0 ? 'cloud' : (largeModelCount > 0 ? 'on_device' : 'unknown');

    return {
        aiDetected,
        processing,
        signals: aiPostCount + largeModelCount,
        details: { aiPostCount, largeModelCount, passiveEndpointSightings, wasmIndicatorCount }
    };
}

async function collectPageAiContextWithObservation() {
    const { hasForm, creds } = detectFormsAndCredentials();
    const whitelist = await new Promise(resolve => chrome.storage.local.get(['aiWhitelist'], r => resolve(r.aiWhitelist || {})));
    const ai = await gatherAISignals({ observeMs: 5000, whitelist });
    let pageExcerpt = '';
    try {
        pageExcerpt = (document.body?.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 4000);
    } catch { }

    const ctx = {
        site_url: location.href,
        context: {
            is_sensitive_category: detectSensitiveCategory(location.hostname, location.href),
            incognito: false,
            trackers_detected: detectTrackers(),
            model_download_gb: null,
            ai_detected: ai.aiDetected,
            ai_debug: ai.details,
            ai_signals: ai.signals,
        },
        ai_intent: 'summarize page text',
        data_scope: {
            page_text: true,
            forms: hasForm || false,
            credentials_fields: creds || false,
        },
        processing_location: ai.processing,
        policy_text_excerpt: null,
        change_diff: null,
        page_text_excerpt: pageExcerpt || null,
    };
    return ctx;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'GET_PAGE_AI_CONTEXT') {
        (async () => {
            try {
                const data = await collectPageAiContextWithObservation();
                let policyUrl = findPolicyLinkAbsolute();
                if (!policyUrl) {
                    try { policyUrl = await aiGuessPolicyLink(); } catch { }
                }
                chrome.runtime.sendMessage({ type: 'FETCH_POLICY', url: policyUrl || undefined }, (res) => {
                    try {
                        if (res && res.success && typeof res.excerpt === 'string') {
                            data.policy_text_excerpt = res.excerpt;
                            if (res.url) data.policy_url = res.url;
                        }
                    } catch { }
                    sendResponse({ success: true, data });
                });
            } catch (err) {
                sendResponse({ success: false, error: (err && err.message) || String(err) });
            }
        })();
        return true;
    }
    if (msg && msg.type === 'DETECT_AI_TEXT') {
        (async () => {
            try {
                const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
                if (!text) { sendResponse({ success: true, data: { overallScore: 0, details: [] } }); return; }
                // dynamic import of modular service (bundled by Vite)
                const mod = await import('./services/textDetection.ts');
                const { detectAIText } = mod;
                const result = await detectAIText(text, { maxWordsPerChunk: 800, batchSize: 2 });
                sendResponse({ success: true, data: result });
            } catch (e) {
                sendResponse({ success: false, error: e?.message || String(e) });
            }
        })();
        return true;
    }
});
// Smarter policy discovery: prefer footer links and score likely candidates
function findPolicyLinkFromFooter() {
    try {
        const containers = Array.from(document.querySelectorAll('footer, [role="contentinfo"], .footer'));
        const linkPatterns = [
            /privacy[\s-]?policy/i,
            /data[\s-]?protection/i,
            /privacy[\s-]?notice/i,
            /gdpr/i,
            /your[\s-]?privacy/i
        ];
        const candidates = [];
        for (const c of containers) {
            const anchors = Array.from(c.querySelectorAll('a[href]'));
            for (const a of anchors) {
                const text = (a.textContent || '').trim();
                const href = a.getAttribute('href') || '';
                if (!href || /^javascript:/i.test(href)) continue;
                if (linkPatterns.some(rx => rx.test(text) || rx.test(href))) {
                    let score = 0.5;
                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('privacy policy')) score += 0.3;
                    else if (lowerText.includes('privacy')) score += 0.2;
                    if (/\/privacy/i.test(href)) score += 0.2;
                    candidates.push({ a, href, score });
                }
            }
        }
        candidates.sort((x, y) => y.score - x.score);
        if (candidates[0]) {
            const url = new URL(candidates[0].href, location.href);
            return url.href;
        }
        return null;
    } catch { return null; }
}


function shouldShowBlockingModal(ctx) {
    // Prefer footer-driven discovery first
    const footerUrl = findPolicyLinkFromFooter();
    if (footerUrl) return footerUrl;
    // Fallback heuristic across all anchors
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const cand = anchors.find(a => /privacy[\s-]?policy|privacy|policy/i.test(a.textContent || '') || /privacy|privacy-policy/i.test(a.getAttribute('href') || ''));
    const sensitive = Array.isArray(cats) && cats.length > 0;
    const anyHighSignals = d.forms || d.credentials_fields || ctx?.context?.trackers_detected || ctx?.processing_location !== 'on_device';
    return !!(sensitive && anyHighSignals);
}

function createModal(onDecision) {
    const overlay = document.createElement('div');
    overlay.id = 'ai-privacy-guard-modal';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(0,0,0,0.45)';
    overlay.style.zIndex = '2147483647';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';

    const panel = document.createElement('div');
    panel.style.background = '#fff';
    panel.style.borderRadius = '12px';
    panel.style.width = 'min(92vw, 520px)';
    panel.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
    panel.style.padding = '20px';
    panel.style.fontFamily = 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif';

    const h = document.createElement('h2');
    h.textContent = 'AI Privacy Guard';
    h.style.margin = '0 0 8px 0';
    h.style.fontSize = '20px';
    h.style.fontWeight = '700';

    const p = document.createElement('p');
    p.textContent = "This looks sensitive. We're blocking AI by default. You can Allow once if needed.";
    p.style.margin = '0 0 14px 0';
    p.style.color = '#374151';
    p.style.fontSize = '14px';

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.marginTop = '12px';

    function makeBtn(label, bg, color) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.background = bg;
        b.style.color = color;
        b.style.border = 'none';
        b.style.padding = '10px 12px';
        b.style.borderRadius = '8px';
        b.style.cursor = 'pointer';
        b.style.fontWeight = '600';
        return b;
    }

    const allowOnce = makeBtn('Allow once', '#10B981', '#fff');
    const askEvery = makeBtn('Ask every time', '#3B82F6', '#fff');
    const block = makeBtn('Block', '#EF4444', '#fff');

    allowOnce.addEventListener('click', () => onDecision('allow_once'));
    askEvery.addEventListener('click', () => onDecision('ask'));
    block.addEventListener('click', () => onDecision('block'));

    btnRow.appendChild(allowOnce);
    btnRow.appendChild(askEvery);
    btnRow.appendChild(block);

    panel.appendChild(h);
    panel.appendChild(p);
    panel.appendChild(btnRow);
    overlay.appendChild(panel);

    return { overlay };
}

function getOrigin(u) {
    try { const x = new URL(u); return x.origin; } catch { return location.origin; }
}

async function ensureSiteDecision(ctx) {
    const origin = getOrigin(ctx.site_url);
    return new Promise((resolve) => {
        chrome.storage.local.get(['siteDecisions'], (res) => {
            const map = res.siteDecisions || {};
            resolve(map[origin] || null);
        });
    });
}

async function saveSiteDecision(ctx, decision) {
    const origin = getOrigin(ctx.site_url);
    return new Promise((resolve) => {
        chrome.storage.local.get(['siteDecisions', 'allowMinutes'], (res) => {
            const map = res.siteDecisions || {};
            const allowMs = Math.max(1, Number(res.allowMinutes || 5)) * 60 * 1000;
            map[origin] = {
                mode: decision,
                ts: Date.now(),
                expiresAt: decision === 'allow_once' ? Date.now() + allowMs : null
            };
            chrome.storage.local.set({ siteDecisions: map }, () => resolve(true));
        });
    });
}

function notifyLog(entry) {
    try { chrome.runtime.sendMessage({ type: 'LOG_EVENT', entry }); } catch { }
}

async function maybeShowBlockingModal() {
    try {
        const ctx = collectPageAiContext();
        const dec = await ensureSiteDecision(ctx);
        const origin = getOrigin(ctx.site_url);
        // Respect allow_once expiry
        if (dec && dec.mode === 'allow_once' && dec.expiresAt && dec.expiresAt > Date.now()) {
            notifyLog({ kind: 'modal_skip_allow_once', origin, time: Date.now() });
            return; // allowed for now
        }
        if (dec && dec.mode === 'block') {
            notifyLog({ kind: 'modal_skip_block', origin, time: Date.now() });
            return;
        }
        if (!shouldShowBlockingModal(ctx)) return;

        // Apply sensitive default behavior
        const { sensitiveDefault } = await new Promise((resolve) => {
            chrome.storage.local.get(['sensitiveDefault'], (r) => resolve({ sensitiveDefault: r.sensitiveDefault || 'block' }));
        });
        if (!dec && sensitiveDefault === 'block') {
            await saveSiteDecision(ctx, 'block');
            notifyLog({ kind: 'modal_auto_block', origin, time: Date.now() });
            return;
        }

        const { overlay } = createModal(async (choice) => {
            await saveSiteDecision(ctx, choice);
            document.body.removeChild(overlay);
            notifyLog({ kind: 'modal_choice', choice, origin, time: Date.now() });
        });
        document.body.appendChild(overlay);
        notifyLog({ kind: 'modal_shown', origin, time: Date.now() });
    } catch (e) {
        // best-effort
    }
}

// Show modal on first load if needed
try {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', maybeShowBlockingModal);
    } else {
        maybeShowBlockingModal();
    }
} catch { }

