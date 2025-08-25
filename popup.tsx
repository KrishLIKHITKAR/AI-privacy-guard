import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';

declare const chrome: any;

type Service = {
    url: string;
    classification: 'known' | 'heuristic' | 'unknown';
    knownProvider?: string | null;
    risk: 'Low' | 'Medium' | 'High';
    explanation: string;
    reason: string;
    lastSeen: number;
};

function Popup() {
    const [origin, setOrigin] = useState<string>('');
    const [services, setServices] = useState<Service[]>([]);
    const [policy, setPolicy] = useState<{ url: string | null; summary: string; riskHighlights: string[] } | null>(null);
    const [policyLoading, setPolicyLoading] = useState(false);
    const [showDebug, setShowDebug] = useState(false);

    useEffect(() => {
        try {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
                const url = tabs?.[0]?.url || '';
                try { const o = new URL(url).origin; setOrigin(o); } catch { setOrigin(''); }
                if (!/^https?:\/\//i.test(url)) return;
                chrome.runtime.sendMessage({ type: 'GET_SERVICES_FOR_ORIGIN', origin: new URL(url).origin }, (res: any) => {
                    if (res?.success && Array.isArray(res.data)) setServices(res.data);
                });
            });
            chrome.storage.local.get(['showDebugRow'], (r: any) => setShowDebug(!!r?.showDebugRow));
        } catch { }
    }, []);

    return (
        <div className="p-4 text-sm font-sans" style={{ minWidth: 380 }}>
            <div className="flex items-center justify-between mb-2">
                <h1 className="text-lg font-bold">AI Privacy Guard</h1>
                <button className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={() => {
                    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
                    else window.open('options.html', '_blank');
                }}>Settings</button>
            </div>
            {origin ? <div className="text-gray-600 mb-3">Site: {origin}</div> : null}
            {services.length === 0 ? (
                <div className="text-gray-600">No AI services detected yet on this page.</div>
            ) : (
                <ul className="space-y-2">
                    {services.map((s, idx) => (
                        <li key={idx} className="border rounded p-2 bg-white">
                            <div className="flex items-center justify-between">
                                <div className="font-medium truncate" title={s.url}>{s.knownProvider || new URL(s.url).host}</div>
                                <span className={`text-xs px-2 py-0.5 rounded ${s.risk === 'High' ? 'bg-red-100 text-red-700' : s.risk === 'Medium' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'}`}>{s.risk}</span>
                            </div>
                            <div className="text-xs text-gray-600 mt-1">{s.explanation}</div>
                            {s.classification !== 'known' && (
                                <div className="text-[11px] text-gray-500 mt-1">{s.classification === 'heuristic' ? 'Unclassified AI service — treat with caution.' : s.reason}</div>
                            )}
                            {showDebug ? (
                                <div className="text-[11px] text-gray-400 mt-1">why: {s.reason || 'n/a'}{s?.lastSeen ? ` • ${new Date(s.lastSeen).toLocaleTimeString()}` : ''}</div>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
            <div className="mt-3 border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">Privacy Policy</div>
                    <button
                        className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
                        onClick={() => {
                            setPolicyLoading(true);
                            try {
                                chrome.runtime.sendMessage({ type: 'ANALYZE_PRIVACY_POLICY' }, async (res: any) => {
                                    if (chrome.runtime.lastError) {
                                        // Fallback: directly request FETCH_POLICY and do very light summarization in popup
                                        try {
                                            const tab: any = await new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => resolve(tabs?.[0] || null)));
                                            const siteUrl = tab?.url || '';
                                            chrome.runtime.sendMessage({ type: 'FETCH_POLICY', siteUrl }, async (res2: any) => {
                                                const text = (res2?.fullText || res2?.excerpt || '').slice(0, 4000);
                                                const url = res2?.url || null;
                                                const bullets = [] as string[];
                                                const t = (text || '').toLowerCase();
                                                if (/third[- ]?part(y|ies)|share with|disclose to/.test(t)) bullets.push('Shares data with third parties');
                                                if (/retain|retention|store for|until/.test(t)) bullets.push('Data retention defined');
                                                if (/advertis|marketing|personaliz/.test(t)) bullets.push('Uses data for advertising/marketing');
                                                if (/(ai|machine\s*learning|model|training)/.test(t)) bullets.push('Mentions AI/model usage or training');
                                                if (/cookie|tracking|analytics/.test(t)) bullets.push('Cookies/analytics tracking');
                                                const summary = bullets.slice(0, 4).join('\n') || (text.slice(0, 300) + (text.length > 300 ? '…' : ''));
                                                setPolicy({ url, summary, riskHighlights: bullets.slice(0, 6) });
                                                setPolicyLoading(false);
                                            });
                                        } catch {
                                            setPolicyLoading(false);
                                        }
                                        return;
                                    }
                                    if (res?.success && res.data) {
                                        setPolicy({ url: res.data.url || null, summary: res.data.summary || '', riskHighlights: res.data.riskHighlights || [] });
                                    }
                                    setPolicyLoading(false);
                                });
                            } catch {
                                setPolicyLoading(false);
                            }
                        }}
                    >Analyze</button>
                </div>
                {policyLoading ? (
                    <div className="text-[11px] text-gray-500">Analyzing…</div>
                ) : policy ? (
                    <div className="text-xs text-gray-700">
                        {policy.url ? <div className="mb-1 truncate"><a className="text-blue-600 hover:underline" href={policy.url} target="_blank">{policy.url}</a></div> : null}
                        {(() => {
                            const raw = String(policy.summary || '');
                            const lines = raw.split(/\n+/)
                                .map(s => s.replace(/^\s*[-*•]\s*/, '').trim())
                                .filter(Boolean);
                            const uniq = Array.from(new Set(lines));
                            if (uniq.length) {
                                return (
                                    <ul className="mt-1 list-disc list-inside text-gray-700">
                                        {uniq.map((h, i) => <li key={i}>{h}</li>)}
                                    </ul>
                                );
                            }
                            return (
                                <div className="whitespace-pre-wrap">
                                    {raw && raw.trim().length > 0 ? raw : 'No privacy policy mentioned.'}
                                </div>
                            );
                        })()}
                    </div>
                ) : (
                    <div className="text-[11px] text-gray-500">Finds and summarizes the site’s privacy policy locally.</div>
                )}
            </div>
            <div className="text-[11px] text-gray-500 mt-3">
                100% local. Uses Chrome webRequest and on-device AI when available. No cloud calls.
            </div>
        </div>
    );
}

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
    <React.StrictMode>
        <Popup />
    </React.StrictMode>
);
