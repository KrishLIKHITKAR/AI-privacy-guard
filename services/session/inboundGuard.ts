import type { AIDetectionContext, MemoryRecord } from '../../types';
import { hasInlineScripts, hasJavascriptUrls, hasTrackingParams } from './scanners';
import { sanitizeHtml } from '../sanitization/htmlSanitizer';
import { SCAN_BODY_BYTE_LIMIT } from '../constants';
import { clampExcerpt } from '../constants';

declare const chrome: any;

async function featureEnabled(): Promise<boolean> {
    return await new Promise(resolve => chrome.storage.local.get(['sessionSanitizerEnabled'], (r: any) => resolve(r?.sessionSanitizerEnabled !== false)));
}

async function recordMemory(rec: MemoryRecord) {
    try {
        const key = 'aipgMemoryRecords';
        const data = await new Promise<any>(resolve => chrome.storage.local.get([key], (r: any) => resolve(r || {})));
        const list: MemoryRecord[] = data[key] || [];
        list.push(rec);
        if (list.length > 500) list.splice(0, list.length - 500);
        await chrome.storage.local.set({ [key]: list });
    } catch { }
}

export async function inspectResponseBody(bodyText: string, contentType: string, ctx: AIDetectionContext & { sessionId: string }): Promise<{ sanitized?: string; malicious: boolean } | null> {
    if (!(await featureEnabled())) return null;
    if (!contentType || !/(text|json|html)/i.test(contentType)) return null;
    if (!bodyText) return null;
    if (bodyText.length > SCAN_BODY_BYTE_LIMIT) return { malicious: false }; // too large, monitor only

    let malicious = false;
    let sanitized: string | undefined = undefined;

    if (/html/i.test(contentType)) {
        malicious = hasInlineScripts(bodyText) || hasJavascriptUrls(bodyText);
        if (malicious) sanitized = sanitizeHtml(bodyText);
    } else {
        // text/json: strip tracking URLs
        if (hasTrackingParams(bodyText)) {
            malicious = true;
            sanitized = bodyText.replace(/([?&])(utm_[a-z]+|gclid|fbclid|msclkid)=[^&\s]+/gi, '$1');
        }
    }

    await recordMemory({ id: crypto.randomUUID(), origin: ctx.origin, tabId: ctx.tabId, ts: Date.now(), direction: 'response', sessionId: ctx.sessionId, excerpt: clampExcerpt(sanitized || bodyText) });
    return { sanitized, malicious };
}

export const __module = 'inboundGuard';
