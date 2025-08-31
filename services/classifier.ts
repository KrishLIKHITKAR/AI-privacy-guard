// services/classifier.ts - classify requests locally
import { DB_KEYS, ProviderDB, getLocal, setLocal, saveService, getExplainCached, setExplainCached } from './db';

declare const chrome: any;

const pathHeuristics = /(generate|chat|prompt|predict|infer|inference|complet(ion|e)|embedd(ing|ings)|vision|speech|tts|stt|asr|ocr|translate|moderation|rerank|reason|think|model|models|v1|v2|stream|sse|ws|vertex|gemini|ai|ml|l(la)?m)/i;

function parseOrigin(u: string): string | null {
    try { return new URL(u).origin; } catch { return null; }
}

function guessDataTypesFromHeaders(hdrs: Array<{ name?: string; value?: string }> | undefined): string[] {
    const out = new Set<string>();
    if (!hdrs) return [];
    for (const h of hdrs) {
        const name = (h?.name || '').toLowerCase();
        const value = (h?.value || '').toLowerCase();
        if (name === 'content-type') {
            if (value.includes('json')) out.add('json');
            if (value.includes('text')) out.add('text');
            if (value.includes('multipart/form-data')) out.add('image');
            if (value.includes('image/')) out.add('image');
            if (value.includes('audio/')) out.add('audio');
            if (value.includes('video/')) out.add('video');
            if (value.includes('octet-stream')) out.add('binary');
        }
        if (name === 'accept') {
            if (value.includes('application/json')) out.add('json');
            if (value.includes('image/')) out.add('image');
            if (value.includes('audio/')) out.add('audio');
            if (value.includes('video/')) out.add('video');
        }
    }
    return Array.from(out);
}

function payloadLooksLikeUserContent(details: any): boolean {
    const method = (details.method || 'GET').toUpperCase();
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        const lenHeader = (details.requestHeaders || []).find((h: any) => /content-length/i.test(h?.name || ''))?.value;
        const len = lenHeader ? parseInt(String(lenHeader), 10) : NaN;
        if (!Number.isNaN(len) && len > 4000) return true;
        const types = guessDataTypesFromHeaders(details.requestHeaders);
        if (types.some(t => ['image', 'audio', 'video', 'binary'].includes(t))) return true;
    }
    return false;
}

function responseLooksStructured(details: any): boolean {
    const types = guessDataTypesFromHeaders(details.responseHeaders);
    return types.includes('json') || types.includes('image') || types.includes('audio') || types.includes('video') || types.includes('binary');
}

function riskFor(dataTypes: string[], knownProvider?: string | null): 'Low' | 'Medium' | 'High' {
    const hasMedia = dataTypes.some(t => t === 'image' || t === 'audio' || t === 'video');
    if (hasMedia) return 'High';
    if (knownProvider) return 'Medium';
    return 'Medium';
}

function explanationFromRules(risk: 'Low' | 'Medium' | 'High', providerName?: string | null, dataTypes: string[] = []): string {
    const base = risk === 'High' ? 'This site may be sending sensitive data to an AI service.'
        : risk === 'Medium' ? 'This site may be sending your data to an AI service.'
            : 'Limited data may be used with AI on-device or minimally.';
    const provider = providerName ? ` Service: ${providerName}.` : '';
    const kinds = dataTypes.length ? ` Data types: ${dataTypes.join(', ')}.` : '';
    return `${base}${provider}${kinds}`;
}

async function maybeRephraseWithOnDeviceAI(text: string): Promise<string> {
    try {
        const anyGlobal: any = globalThis as any;
        if (anyGlobal?.ai?.languageModel?.create) {
            const session = await anyGlobal.ai.languageModel.create({ temperature: 0.1 });
            const res = await session.prompt(`Rephrase this risk explanation in clear, simple English under 24 words: ${text}`);
            const out = String(res || '').trim();
            if (out) return out.slice(0, 160);
        }
    } catch { }
    return text;
}

export async function classifyRequest(details: any) {
    try {
        const url = String(details.url || '');
        // Attribute to the page origin (initiator/documentUrl), fallback to request URL origin
        const pageOrigin = parseOrigin(details.initiator || details.originUrl || details.documentUrl || '') || null;
        const reqOrigin = parseOrigin(url);
        if (!reqOrigin || !/^https?:/i.test(reqOrigin)) return;

        const providersRes = await getLocal<ProviderDB>([DB_KEYS.providers]);
        const providers = providersRes[DB_KEYS.providers] as any as ProviderDB;
        const host = (() => { try { return new URL(url).host; } catch { return ''; } })();
        const provider = providers?.domains?.[host];
        const knownProviderName = provider?.name || null;

        const suspiciousPath = (() => { try { return pathHeuristics.test(new URL(url).pathname); } catch { return false; } })();
        const userContenty = payloadLooksLikeUserContent(details);
        const structuredOut = responseLooksStructured(details);

        let isAI = false;
        let classification: 'known' | 'heuristic' | 'unknown' = 'unknown';
        let reason = '';

        if (knownProviderName) {
            isAI = true; classification = 'known'; reason = `Known AI provider: ${knownProviderName}`;
        } else if (suspiciousPath && (userContenty || structuredOut)) {
            isAI = true; classification = 'heuristic'; reason = 'Heuristics: path + payload/response';
        } else if (userContenty && structuredOut) {
            isAI = true; classification = 'heuristic'; reason = 'Heuristics: user-like input and structured output';
        }

        const dataTypes = guessDataTypesFromHeaders(details.requestHeaders).concat(guessDataTypesFromHeaders(details.responseHeaders));
        const risk = isAI ? riskFor(dataTypes, knownProviderName) : 'Low';

        // explanation cache key
        const expKey = JSON.stringify({ risk, provider: knownProviderName, dataTypes: Array.from(new Set(dataTypes)).sort() });
        let explanation = await getExplainCached(expKey);
        if (!explanation) {
            const base = explanationFromRules(risk, knownProviderName, dataTypes);
            explanation = await maybeRephraseWithOnDeviceAI(base);
            await setExplainCached(expKey, explanation);
        }

        const record = {
            origin: pageOrigin || reqOrigin,
            url,
            knownProvider: knownProviderName,
            isAI,
            reason,
            classification,
            risk,
            dataTypes: Array.from(new Set(dataTypes)),
            explanation,
            lastSeen: Date.now(),
        };
        await saveService(record);
        // Auto-popup based on threshold (low/medium/high) once per origin; background manages cooldown and single window
        if (record.isAI && record.origin) {
            try {
                const level = String(record.risk || 'Medium').toLowerCase();
                try { await chrome.runtime.sendMessage({ type: 'AIPG_OPEN_POPUP_FOR_ORIGIN', origin: record.origin, riskLevel: level }); } catch { }
            } catch { /* ignore */ }
        }
    } catch {
        // ignore
    }
}
