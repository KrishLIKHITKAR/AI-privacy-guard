import React, { useState, useEffect, useCallback } from 'react';
// Allow using Chrome extension API in TS context
declare const chrome: any;
import type { PermissionSummarizationInput, PermissionSummarizationOutput, PolicySummaryOutput } from './types';
import { summarizePermissionRequest, summarizePolicy } from './services/geminiService';
import { analyzePermissionLocal } from './services/rulesEngine';
import { LocalSummarizer } from './services/localSummarizer';
import OutputDisplay from './components/OutputDisplay';
import { ShieldExclamationIcon, ShieldCheckIcon } from './components/Icons';
import type { BotDetectionResult } from './services/botDetection';

const App: React.FC = () => {
    // State for Permission Summarization
    const [currentScenario, setCurrentScenario] = useState<PermissionSummarizationInput | null>(null);
    const [output, setOutput] = useState<PermissionSummarizationOutput | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedScenarioLabel, setSelectedScenarioLabel] = useState<string>('');

    // State for automatic Policy Analysis
    const [currentPolicy, setCurrentPolicy] = useState<string>('');
    const [policySummaryOutput, setPolicySummaryOutput] = useState<PolicySummaryOutput | null>(null);
    const [isPolicyLoading, setIsPolicyLoading] = useState<boolean>(false);
    const [policyError, setPolicyError] = useState<string | null>(null);
    const [policyAutoFilled, setPolicyAutoFilled] = useState<boolean>(false);
    const [policyUrl, setPolicyUrl] = useState<string | null>(null);
    const [activeOrigin, setActiveOrigin] = useState<string | null>(null);
    const [fpNoted, setFpNoted] = useState<string | null>(null);
    const [showDebugRow, setShowDebugRow] = useState<boolean>(false);
    const [botResult, setBotResult] = useState<BotDetectionResult | null>(null);
    const [aiTextScore, setAiTextScore] = useState<number | null>(null);
    const [policyQuickSummary, setPolicyQuickSummary] = useState<{ url: string | null; summary: string; riskHighlights: string[] } | null>(null);


    const handleSummarizePermission = useCallback(async (input: PermissionSummarizationInput) => {
        setIsLoading(true);
        setError(null);
        setOutput(null);
        try {
            // Prefer on-device Chrome AI for a one-liner if available, combined with deterministic rules.
            let chromeOneLiner: string | null = null;
            try {
                const anyGlobal: any = globalThis as any;
                if (anyGlobal?.ai?.summarizer?.create) {
                    const summarizer = await anyGlobal.ai.summarizer.create({ type: 'tl;dr' });
                    const res = await summarizer.summarize(JSON.stringify(input).slice(0, 4000));
                    const text = typeof res === 'string' ? res : (res?.summary || '');
                    chromeOneLiner = (text || '').trim().slice(0, 160);
                }
            } catch { /* ignore */ }

            // Deterministic rules are always available
            const localOut = analyzePermissionLocal(input);

            // Optionally enhance with cloud if enabled; otherwise rely on local + chromeOneLiner
            let combined = { ...localOut } as PermissionSummarizationOutput;
            if (chromeOneLiner) combined.summary_one_liner = chromeOneLiner;

            try {
                const cloudEnabled = await new Promise<boolean>((resolve) => {
                    chrome.storage.local.get(['cloudEnabled'], (r: any) => resolve(!!r.cloudEnabled));
                });
                if (cloudEnabled) {
                    const modelOut = await summarizePermissionRequest(input);
                    // Merge conservatively: take higher risk and union flags; keep local header wording discipline
                    const riskRank = { Low: 0, Medium: 1, High: 2 } as const;
                    const finalRisk = (riskRank[modelOut.risk_score] >= riskRank[combined.risk_score]) ? modelOut.risk_score : combined.risk_score;
                    combined = {
                        ...combined,
                        risk_score: finalRisk,
                        red_flags: Array.from(new Set([...(combined.red_flags || []), ...(modelOut.red_flags || [])])),
                        // prefer model bullets if present to enrich context
                        bullets: (modelOut.bullets && modelOut.bullets.length >= 2) ? modelOut.bullets : combined.bullets,
                        action_hint: modelOut.action_hint || combined.action_hint,
                        policy_summary: modelOut.policy_summary || combined.policy_summary
                    };
                    const localSaysAI = !!input.context?.ai_detected;
                    if (!chromeOneLiner && modelOut.summary_one_liner && localSaysAI) {
                        combined.summary_one_liner = modelOut.summary_one_liner.slice(0, 160);
                    }
                }
            } catch { /* cloud disabled or failed */ }

            setOutput(combined);
        } catch (e) {
            console.error(e);
            // Fallback to deterministic rules engine
            try {
                const local = analyzePermissionLocal(input);
                setOutput(local);
                setError('Using on-device analysis only.');
            } catch (err) {
                setError('Failed to get analysis from AI. Please ensure your API key is configured correctly.');
            }
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // Load UI toggles
        try { chrome?.storage?.local?.get?.(['showDebugRow'], (r: any) => setShowDebugRow(!!r.showDebugRow)); } catch { }
        // Try to get live page context first; fallback to minimal default
        const fallback: PermissionSummarizationInput = {
            site_url: 'about:blank',
            context: { is_sensitive_category: [], incognito: false, trackers_detected: false, model_download_gb: null },
            ai_intent: 'summarize page text',
            data_scope: { page_text: true },
            processing_location: 'unknown',
            policy_text_excerpt: null,
            change_diff: null,
            page_text_excerpt: null,
        };
        try {
            chrome?.tabs?.query?.({ active: true, currentWindow: true }, (tabs: any[]) => {
                const tabId = tabs && tabs[0]?.id;
                if (!tabId) {
                    handleSummarizePermission(fallback);
                    return;
                }
                try {
                    chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_AI_CONTEXT' }, async (res: any) => {
                        if (res && res.success && res.data) {
                            try { const u = new URL(res.data.site_url); setActiveOrigin(u.origin); } catch { }
                            const input = res.data as PermissionSummarizationInput;
                            // If no strong signals but we have page text, ask Chrome Prompt API on-device if the page uses AI (strict yes/no)
                            try {
                                const settings: any = await new Promise((resolve) => chrome.storage.local.get(['aiClassifierEnabled'], resolve));
                                const classifierEnabled = !!settings?.aiClassifierEnabled;
                                if (classifierEnabled && !input.context?.ai_detected && input.page_text_excerpt) {
                                    const anyGlobal: any = globalThis as any;
                                    if (anyGlobal?.ai?.prompt) {
                                        const session = await anyGlobal.ai.prompt.create();
                                        const excerpt = String(input.page_text_excerpt).slice(0, 1200);
                                        const question = `You are a binary classifier that determines if a webpage uses AI technology.\n\nSTRICT RULES:\n1. Return ONLY "yes" or "no" - nothing else\n2. "yes" means the page ACTIVELY uses AI for core functionality\n3. "no" for marketing pages, blogs about AI, or static content\n\nACTIVE AI INDICATORS (return "yes"):\n- Interactive chat interfaces with AI responses\n- Image/text/code generation tools\n- AI-powered search or recommendations in use\n- Machine learning demos or playgrounds\n- Voice/image recognition interfaces\n\nNOT AI (return "no"):\n- Blog posts or articles about AI\n- Marketing pages for AI products\n- Documentation or tutorials\n- Static content mentioning AI\n- Analytics or tracking scripts\n\nAnalyze this page excerpt and respond with only "yes" or "no":\n${excerpt}`;
                                        const answer = await session.prompt(question);
                                        const txt = String(answer || '').trim().toLowerCase();
                                        if (txt === 'yes') {
                                            (input as any).context.ai_detected = true;
                                            if (input.processing_location === 'unknown') input.processing_location = 'on_device';
                                        }
                                    }
                                }
                            } catch { /* ignore Prompt API issues */ }
                            handleSummarizePermission(input);
                        } else {
                            handleSummarizePermission(fallback);
                        }
                    });
                } catch {
                    // Receiving end does not exist (e.g., chrome:// pages)
                    handleSummarizePermission(fallback);
                }
            });
        } catch {
            handleSummarizePermission(fallback);
        }
    }, [handleSummarizePermission]);

    // No scenario selector; auto-analysis only

    // Auto-fetch & analyze policy once per tab
    useEffect(() => {
        try {
            chrome?.tabs?.query?.({ active: true, currentWindow: true }, (tabs: any[]) => {
                const tab = tabs && tabs[0];
                const siteUrl = tab?.url;
                if (!siteUrl) return;
                if (policyAutoFilled) return;
                setIsPolicyLoading(true);
                chrome.runtime.sendMessage({ type: 'FETCH_POLICY', siteUrl, full: true }, async (res: any) => {
                    try {
                        if (res && res.success) {
                            const text = res.fullText || res.excerpt || '';
                            if (text && text.trim().length > 0) {
                                setCurrentPolicy(text);
                                setPolicyAutoFilled(true);
                                if (res.url) setPolicyUrl(res.url);
                                // Summarize locally first (Chrome built-in if available)
                                let usedChromeAI = false;
                                let localSummary: string | null = null;
                                try {
                                    const anyGlobal: any = globalThis as any;
                                    const canSummarize = !!(anyGlobal?.ai?.summarizer?.create);
                                    if (canSummarize) {
                                        const summarizer = await anyGlobal.ai.summarizer.create({ type: 'key-points' });
                                        const result = await summarizer.summarize(text);
                                        const s = typeof result === 'string' ? result : (result?.summary || '');
                                        if (s && s.trim()) {
                                            usedChromeAI = true;
                                            localSummary = s.trim();
                                            const points = localSummary
                                                .split(/\n|\.[\s\n]+/)
                                                .map((x: string) => x.replace(/^[-*•]\s*/, '').trim())
                                                .filter(Boolean)
                                                .slice(0, 5);
                                            if (points.length) setPolicySummaryOutput({ summary_points: points });
                                        }
                                    }
                                } catch { }
                                if (!usedChromeAI) {
                                    try {
                                        // Try structured local summarizer first
                                        const ls = new LocalSummarizer();
                                        const res = ls.summarize(text, 4);
                                        if (res.bullets && res.bullets.length) {
                                            setPolicySummaryOutput({ summary_points: res.bullets });
                                            localSummary = res.bullets.join(' ');
                                        } else {
                                            // Fallback to background heuristic if needed
                                            const ondev: any = await new Promise((resolve) => {
                                                chrome.runtime.sendMessage({ type: 'SUMMARIZE_POLICY_ONDEVICE', excerpt: text }, resolve);
                                            });
                                            if (ondev && ondev.success && typeof ondev.summary === 'string') {
                                                localSummary = ondev.summary;
                                                const pts = localSummary
                                                    .split(/\.[\s\n]+/)
                                                    .map((x: string) => x.trim())
                                                    .filter(Boolean)
                                                    .slice(0, 5);
                                                if (pts.length) setPolicySummaryOutput({ summary_points: pts });
                                            }
                                        }
                                    } catch { }
                                }
                                // If cloud enabled, enhance
                                const cloudEnabled = await new Promise<boolean>((resolve) => {
                                    try { chrome.storage.local.get(['cloudEnabled'], (r: any) => resolve(!!r.cloudEnabled)); } catch { resolve(false); }
                                });
                                if (cloudEnabled) {
                                    try {
                                        const result = await summarizePolicy({ policy_excerpt: text });
                                        // Enforce 3-4 concise bullets
                                        const trimmed = (result?.summary_points || [])
                                            .map((s: string) => s.replace(/\s+/g, ' ').trim())
                                            .filter(Boolean)
                                            .slice(0, 4);
                                        if (trimmed.length) setPolicySummaryOutput({ summary_points: trimmed });
                                    } catch { }
                                }
                            }
                        }
                    } catch { }
                    setIsPolicyLoading(false);
                });
            });
        } catch { }
    }, [policyAutoFilled]);

    // removed manual policy analyzer handler (automatic now)

    // Optional: trigger bot detection only on popup open (user action)
    useEffect(() => {
        try {
            chrome?.runtime?.sendMessage?.({ type: 'BOT_DETECT' }, (res: any) => {
                if (res && res.success) setBotResult(res.data as BotDetectionResult);
            });
        } catch { }
    }, []);

    // Example: trigger on-demand AI text detection (runs once on popup open here; can be moved to a button)
    useEffect(() => {
        try {
            chrome?.tabs?.query?.({ active: true, currentWindow: true }, (tabs: any[]) => {
                const tabId = tabs && tabs[0]?.id;
                if (!tabId) return;
                chrome.tabs.sendMessage(tabId, { type: 'DETECT_AI_TEXT' }, (res: any) => {
                    if (res && res.success && res.data) setAiTextScore(res.data.overallScore ?? null);
                });
                // Kick off a lightweight policy analysis on demand
                chrome.tabs.sendMessage(tabId, { type: 'ANALYZE_PRIVACY_POLICY' }, (p: any) => {
                    if (p && p.success && p.data) {
                        setPolicyQuickSummary({ url: p.data.url || null, summary: p.data.summary || '', riskHighlights: p.data.riskHighlights || [] });
                    }
                });
            });
        } catch { }
    }, []);


    return (
        <div className="min-h-screen bg-gray-50 text-brand-text-primary font-sans">
            <main className="container mx-auto p-4 md:p-8 max-w-4xl">
                <header className="text-center mb-8">
                    <div className="flex items-center justify-center gap-3">
                        <ShieldCheckIcon className="h-10 w-10 text-brand-primary" />
                        <h1 className="text-4xl font-bold tracking-tight text-gray-800">
                            AI Privacy Guard
                        </h1>
                    </div>
                    <div className="mt-2">
                        <button
                            onClick={() => chrome?.runtime?.openOptionsPage?.()}
                            className="text-sm text-brand-primary hover:underline"
                        >
                            Settings
                        </button>
                    </div>
                    <p className="mt-2 text-lg text-brand-text-secondary">
                        Simulating how a browser extension analyzes AI permission requests on websites.
                    </p>
                </header>

                <div className="bg-brand-surface p-6 rounded-2xl shadow-lg mb-8">
                    <div className="border-t border-gray-200 pt-2">
                        {isLoading && (
                            <div className="flex flex-col items-center justify-center text-center p-8">
                                <svg className="animate-spin h-12 w-12 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <p className="mt-4 text-lg font-semibold text-brand-text-secondary">Analyzing AI Request...</p>
                                <p className="text-sm text-gray-500">Communicating with Gemini API.</p>
                            </div>
                        )}
                        {error && (
                            <div className="flex flex-col items-center justify-center text-center p-8 bg-red-50 rounded-lg gap-3">
                                <ShieldExclamationIcon className="h-12 w-12 text-red-500" />
                                <p className="mt-2 text-lg font-semibold text-red-700">An Error Occurred</p>
                                <p className="text-sm text-red-600">{error}</p>
                                <button
                                    onClick={() => chrome?.runtime?.openOptionsPage?.()}
                                    className="mt-2 inline-flex items-center rounded-md bg-brand-primary px-3 py-2 text-white text-sm font-medium hover:opacity-90"
                                >
                                    Open Settings
                                </button>
                            </div>
                        )}
                        {output && !isLoading && (
                            <>
                                <OutputDisplay data={{
                                    ...output,
                                    policy_summary: policySummaryOutput
                                        ? policySummaryOutput.summary_points.join('\n')
                                        : output.policy_summary
                                }} />
                                {botResult && (
                                    <div className="mt-3 text-xs text-gray-500">
                                        Bot check: {botResult.isBot ? 'bot-like' : 'normal'} (conf {Math.round((botResult.confidence || 0) * 100)}%)
                                    </div>
                                )}
                                {typeof aiTextScore === 'number' && (
                                    <div className="mt-1 text-xs text-gray-500">
                                        AI-text likelihood: {Math.round(aiTextScore * 100)}%
                                    </div>
                                )}
                                {currentScenario?.context?.ai_detected && currentScenario?.context?.ai_debug && (currentScenario.context.ai_debug.aiPostCount || 0) === 0 && (
                                    <div className="mt-2 text-xs text-blue-600">Detected AI via on-device classification (no active AI network calls observed).</div>
                                )}
                                {/* Why flagged row (debug/transparent) */}
                                {showDebugRow && currentScenario?.context?.ai_debug && (
                                    <div className="mt-2 text-xs text-gray-500">
                                        <span className="font-semibold">Why flagged:</span>
                                        <span className="ml-2">POSTs: {currentScenario.context.ai_debug.aiPostCount || 0}</span>
                                        <span className="ml-2">Models: {currentScenario.context.ai_debug.largeModelCount || 0}</span>
                                        <span className="ml-2">Passive: {currentScenario.context.ai_debug.passiveEndpointSightings || 0}</span>
                                        <span className="ml-2">WASM: {currentScenario.context.ai_debug.wasmIndicatorCount || 0}</span>
                                    </div>
                                )}
                                {activeOrigin && (
                                    <div className="mt-3 flex items-center justify-between">
                                        <button
                                            onClick={() => {
                                                try {
                                                    chrome.storage.local.get(['aiWhitelist'], (r: any) => {
                                                        const map = r.aiWhitelist || {};
                                                        map[activeOrigin] = true;
                                                        chrome.storage.local.set({ aiWhitelist: map }, () => setFpNoted('Thanks! We will ignore this site next time.'));
                                                    });
                                                } catch { }
                                            }}
                                            className="text-xs text-gray-500 hover:text-gray-700 underline"
                                        >
                                            Report false positive for this site
                                        </button>
                                        {fpNoted && <span className="text-xs text-green-600">{fpNoted}</span>}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {(isPolicyLoading || policySummaryOutput || policyError) && (
                    <div className="bg-brand-surface p-6 rounded-2xl shadow-lg mb-8">
                        <h2 className="text-xl font-bold text-gray-800 mb-2">Privacy Policy</h2>
                        {isPolicyLoading && <p className="text-sm text-gray-500">Fetching and analyzing policy…</p>}
                        {policyError && <p className="text-sm text-red-600">{policyError}</p>}
                        {policySummaryOutput && (
                            <div className="mt-2 space-y-2">
                                <ul className="list-disc pl-5 text-sm text-brand-text-secondary">
                                    {policySummaryOutput.summary_points.map((p, i) => (
                                        <li key={i}>{p}</li>
                                    ))}
                                </ul>
                                {policyUrl && (
                                    <button
                                        onClick={() => chrome?.tabs?.create?.({ url: policyUrl })}
                                        className="mt-3 text-sm text-brand-primary hover:underline"
                                    >
                                        View full policy
                                    </button>
                                )}
                                {policyQuickSummary && (
                                    <div className="mt-4 bg-gray-50 p-3 rounded">
                                        <div className="text-xs text-gray-600 font-semibold mb-1">Quick analyzer</div>
                                        <div className="text-sm whitespace-pre-wrap">{policyQuickSummary.summary}</div>
                                        {policyQuickSummary.riskHighlights?.length > 0 && (
                                            <ul className="list-disc pl-5 mt-2 text-xs text-gray-600">
                                                {policyQuickSummary.riskHighlights.map((h, idx) => <li key={idx}>{h}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <footer className="text-center mt-8 text-sm text-gray-500">
                    <p>&copy; {new Date().getFullYear()} AI Privacy Guard. All rights reserved.</p>
                    <p className="mt-1">This is a demo application and does not represent a real browser extension.</p>
                </footer>
            </main>
        </div>
    );
};

export default App;