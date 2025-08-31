import type { AIDetectionContext, MemoryRecord, SiteCategory } from '../../types';
import { sanitizeInput } from '../sanitization/sanitizerPipeline';
import { applyGranularityControls } from '../granularity/controller';
import { assessRisk } from '../risk/riskEngine';
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
        // cap size
        if (list.length > 500) list.splice(0, list.length - 500);
        await chrome.storage.local.set({ [key]: list });
    } catch { }
}

export async function preflightRewrite(body: any, ctx: AIDetectionContext & { sessionId: string }): Promise<{ rewritten: any; riskText: string; riskScore: number; redactions?: { type: string; value: string }[]; original?: any } | null> {
    if (!(await featureEnabled())) return null;
    // Only operate on string or JSON with string fields
    const cat: SiteCategory = ctx.siteCategory;
    let textPayload = '';
    let shaped: any = null;
    try {
        if (typeof body === 'string') textPayload = body;
        else if (body && typeof body === 'object') { shaped = JSON.parse(JSON.stringify(body)); }
    } catch { return null; }

    const applyToString = async (s: string) => {
        const san = await sanitizeInput(s, cat);
        const withGran = await applyGranularityControls(san.sanitized);
        const risk = assessRisk({ origin: ctx.origin, tabId: ctx.tabId, processing: ctx.processing, trackersPresent: ctx.trackersPresent, siteCategory: cat, piiSummary: san.piiSummary });
        await recordMemory({ id: crypto.randomUUID(), origin: ctx.origin, tabId: ctx.tabId, ts: Date.now(), direction: 'prompt', sessionId: ctx.sessionId, risk, pii: san.piiSummary, excerpt: clampExcerpt(withGran) });
        const redactions = (san.redactions || []).map(r => ({ type: r.type, value: r.value }));
        return { text: withGran, riskText: risk.level, riskScore: risk.score, redactions };
    };

    if (textPayload) {
        const res = await applyToString(textPayload);
        return { rewritten: res.text, riskText: res.riskText, riskScore: res.riskScore, redactions: res.redactions, original: textPayload };
    }

    if (shaped) {
        const mutate = async (obj: any) => {
            for (const k of Object.keys(obj)) {
                const v = obj[k];
                if (typeof v === 'string') {
                    const res = await applyToString(v);
                    obj[k] = res.text;
                } else if (v && typeof v === 'object') await mutate(v);
            }
        };
        await mutate(shaped);
        return { rewritten: shaped, riskText: 'mixed', riskScore: 0, original: body };
    }
    return null;
}

export const __module = 'outboundGuard';
