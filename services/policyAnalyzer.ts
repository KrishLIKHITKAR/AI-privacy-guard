// services/policyAnalyzer.ts
// Modular Privacy Policy Analyzer with local-first summarization and cloud fallback.

declare const chrome: any;

import { LocalSummarizer } from './localSummarizer';

export type PolicyAnalysis = {
    found: boolean;
    url: string | null;
    summary: string;
    riskHighlights: string[];
};

function hashText(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
    return String(h >>> 0);
}

async function findPolicyLinkFromContent(tabId: number): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            chrome.tabs.sendMessage(tabId, { type: 'FIND_POLICY_LINK' }, (res: any) => {
                resolve((res && res.url) || null);
            });
        } catch {
            resolve(null);
        }
    });
}

async function fetchPolicyText(siteUrl: string | null, policyUrl: string | null, wantFull = true): Promise<{ url: string | null; excerpt: string; fullText?: string; html?: string; baseUrl?: string | null }> {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ type: 'FETCH_POLICY', siteUrl, url: policyUrl || undefined, full: wantFull }, (res: any) => {
                if (res && res.success) {
                    resolve({ url: res.url || policyUrl, excerpt: res.excerpt || '', fullText: res.fullText, html: res.html, baseUrl: res.baseUrl });
                } else {
                    resolve({ url: policyUrl, excerpt: '', fullText: '' });
                }
            });
        } catch {
            resolve({ url: policyUrl, excerpt: '', fullText: '' });
        }
    });
}

function extractRiskHighlights(text: string): string[] {
    const t = (text || '').toLowerCase();
    const flags: string[] = [];
    if (/third[- ]?part(y|ies)|share with|disclose to/.test(t)) flags.push('Shares data with third parties');
    if (/retain|retention|store for|until/.test(t)) flags.push('Data retention defined');
    if (/advertis|marketing|personaliz/.test(t)) flags.push('Uses data for advertising/marketing');
    if (/(ai|machine\s*learning|model|training)/.test(t)) flags.push('Mentions AI/model usage or training');
    if (/cookie|tracking|analytics/.test(t)) flags.push('Cookies/analytics tracking');
    if (/sell\b|sale of data/.test(t)) flags.push('Sells or may sell data');
    if (/clipboard|screenshot|keystroke/.test(t)) flags.push('Clipboard/screenshots/keystrokes access');
    if (/credential|password|card|ssn/.test(t)) flags.push('Credentials/financial identifiers referenced');
    return Array.from(new Set(flags)).slice(0, 6);
}

async function summarizeLocal(text: string): Promise<string | null> {
    if (!text || !text.trim()) return null;
    // Try Chrome on-device AI first
    try {
        const anyGlobal: any = globalThis as any;
        if (anyGlobal?.ai?.summarizer?.create) {
            const summarizer = await anyGlobal.ai.summarizer.create({ type: 'key-points' });
            const result = await summarizer.summarize(text.slice(0, 8000));
            const s = typeof result === 'string' ? result : (result?.summary || '');
            if (s && s.trim()) return s.trim();
        }
    } catch { /* ignore */ }
    // Fallback to heuristic LocalSummarizer bullets
    try {
        const ls = new LocalSummarizer();
        const res = ls.summarize(text, 4);
        if (res.bullets && res.bullets.length) {
            const lines = [...res.bullets];
            if (res.shortExcerpt) lines.push(`Excerpt: ${res.shortExcerpt}`);
            return lines.join('\n');
        }
    } catch { /* ignore */ }
    return null;
}

export async function analyzePrivacyPolicy(): Promise<PolicyAnalysis> {
    // Identify active tab and origin
    const tab: any = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs?.[0] || null)));
    const siteUrl: string | null = (tab && tab.url) || null;
    const tabId: number | null = (tab && tab.id) || null;

    // Find a likely policy URL via content script (footer-first), optional
    let policyUrl: string | null = null;
    if (tabId) {
        policyUrl = await findPolicyLinkFromContent(tabId);
    }

    // Fetch and extract policy HTML/text via background, then prefer Readability via content
    const fetched = await fetchPolicyText(siteUrl, policyUrl, true);
    let text = (fetched.fullText || fetched.excerpt || '').trim();
    if (fetched?.html) {
        try {
            const extracted = await new Promise<any>((resolve) => {
                chrome.tabs.sendMessage(tabId!, { type: 'READABILITY_EXTRACT', html: fetched.html, baseUrl: fetched.baseUrl || siteUrl }, (res: any) => resolve(res));
            });
            if (extracted && extracted.success && extracted.data && extracted.data.text) {
                text = String(extracted.data.text || '').trim() || text;
            }
        } catch { /* ignore, keep fallback text */ }
    }
    const found = !!text;
    // Cache by content hash
    let cacheKey = '';
    if (found) {
        const title = '';
        cacheKey = 'policySum:' + hashText((fetched.url || '') + '|' + text.slice(0, 20000));
        try {
            const cached: any = await new Promise(resolve => chrome.storage.local.get([cacheKey], resolve));
            if (cached && cached[cacheKey] && typeof cached[cacheKey] === 'string') {
                const riskHighlights = extractRiskHighlights(text);
                return { found, url: fetched.url || policyUrl, summary: cached[cacheKey], riskHighlights };
            }
        } catch { /* ignore */ }
    }

    // Summarize local-first only (on-device AI if available, otherwise LocalSummarizer v2)
    let summary = (await summarizeLocal(text)) || '';
    if (!summary) summary = (text.slice(0, 400) + (text.length > 400 ? '…' : ''));

    // Save cache
    if (cacheKey && summary) {
        try { await new Promise(resolve => chrome.storage.local.set({ [cacheKey]: summary }, resolve)); } catch { }
    }

    const riskHighlights = extractRiskHighlights(text);

    return {
        found,
        url: fetched.url || policyUrl,
        summary,
        riskHighlights,
    };
}
