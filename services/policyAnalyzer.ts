// services/policyAnalyzer.ts
// Modular Privacy Policy Analyzer with local-first summarization and cloud fallback.

declare const chrome: any;

import { LocalSummarizer } from './localSummarizer';
import { summarizePolicy } from './geminiService';

export type PolicyAnalysis = {
    found: boolean;
    url: string | null;
    summary: string;
    riskHighlights: string[];
};

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

async function fetchPolicyText(siteUrl: string | null, policyUrl: string | null, wantFull = true): Promise<{ url: string | null; excerpt: string; fullText?: string }> {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ type: 'FETCH_POLICY', siteUrl, url: policyUrl || undefined, full: wantFull }, (res: any) => {
                if (res && res.success) {
                    resolve({ url: res.url || policyUrl, excerpt: res.excerpt || '', fullText: res.fullText });
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
        if (res.bullets && res.bullets.length) return res.bullets.join('\n');
    } catch { /* ignore */ }
    return null;
}

async function summarizeCloud(text: string): Promise<string | null> {
    try {
        const cloudEnabled = await new Promise<boolean>((resolve) => {
            chrome.storage.local.get(['cloudEnabled'], (r: any) => resolve(!!r.cloudEnabled));
        });
        if (!cloudEnabled) return null;
        const out = await summarizePolicy({ policy_excerpt: text.slice(0, 10000) });
        const bullets = (out?.summary_points || []).map((s: string) => s.trim()).filter(Boolean).slice(0, 5);
        return bullets.join('\n');
    } catch {
        return null;
    }
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

    // Fetch and extract policy text via background (includes auto-discovery fallback)
    const fetched = await fetchPolicyText(siteUrl, policyUrl, true);
    const text = (fetched.fullText || fetched.excerpt || '').trim();
    const found = !!text;

    // Summarize local-first, cloud fallback for long/complex
    let summary = (await summarizeLocal(text)) || '';
    const tooLong = text.length > 8000 || summary.length < 40; // heuristic complexity/quality
    if (!summary || tooLong) {
        const cloud = await summarizeCloud(text);
        if (cloud && cloud.trim()) summary = cloud.trim();
    }
    if (!summary) summary = (text.slice(0, 400) + (text.length > 400 ? '…' : ''));

    const riskHighlights = extractRiskHighlights(text);

    return {
        found,
        url: fetched.url || policyUrl,
        summary,
        riskHighlights,
    };
}
