// background orchestrator
import { ensureSeedProviders, getServicesForOrigin } from './services/db';
import { classifyRequest } from './services/classifier';
// Capture URL/method early (covers main_frame and subresource fetches)
chrome.webRequest.onBeforeRequest.addListener(
    (details: any) => { classifyRequest(details).catch(() => { }); },
    { urls: ['<all_urls>'] }
);

declare const chrome: any;

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
    if (msg?.type === 'TEST_GEMINI_KEY' || msg?.type === 'CALL_GEMINI') {
        sendResponse({ success: false, error: 'Cloud features disabled (local-only).' });
        return false;
    }
});

ensureSeedProviders().catch(() => { });
