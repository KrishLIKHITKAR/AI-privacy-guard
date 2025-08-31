import React, { useEffect, useMemo, useState } from 'react';

declare const chrome: any;

type MemoryRecord = {
    id: string;
    ts: number;
    site: string;
    conversationUrl?: string;
    origin: string;
    sessionId: string;
    direction: 'prompt' | 'response';
    rawAllowed?: boolean;
    excerpt?: string;
    piiCounts?: { EMAIL: number; PHONE: number; CARD: number; APIKEY: number };
};

export function MemoryPanel() {
    const KEY = 'aipgMemoryRecords';
    const [records, setRecords] = useState<MemoryRecord[]>([]);
    const [loading, setLoading] = useState(false);

    async function loadViaMessage() {
        return await new Promise<MemoryRecord[]>((resolve) => {
            try {
                chrome.runtime.sendMessage({ type: 'MEMORY_LIST' }, (res: any) => {
                    if (res && res.success && Array.isArray(res.records)) resolve(res.records);
                    else resolve([]);
                });
            } catch { resolve([]); }
        });
    }

    const load = () => {
        setLoading(true);
        try {
            chrome.storage.local.get([KEY], async (res: any) => {
                try {
                    console.log('MemoryPanel: read', KEY, res?.[KEY]);
                    console.log('MemoryPanel: storage error?', chrome.runtime.lastError);
                } catch { }
                let all: MemoryRecord[] = Array.isArray(res?.[KEY]) ? res[KEY] : [];
                if (!all.length) {
                    // Fallback to runtime message (service worker) to avoid any popup storage access quirks
                    all = await loadViaMessage();
                }
                try { console.log('MemoryPanel: parsed records count=', all.length); } catch { }
                setRecords(all);
                setLoading(false);
            });
        } catch {
            (async () => { const list = await loadViaMessage(); setRecords(list); setLoading(false); })();
        }
    };

    useEffect(() => {
        load();
        // Live updates when storage changes in any tab
        try {
            const onChanged = (changes: any, area: string) => {
                if (area === 'local' && changes && Object.prototype.hasOwnProperty.call(changes, KEY)) {
                    load();
                }
            };
            chrome.storage.onChanged.addListener(onChanged);
            return () => { try { chrome.storage.onChanged.removeListener(onChanged); } catch { } };
        } catch { }
    }, []);

    // Filter only prompt records that were explicitly sent as Original
    const prompts = useMemo(() => {
        const filtered = (records || [])
            .filter(r => r && r.direction === 'prompt' && r.rawAllowed === true);
        try { console.log('MemoryPanel: filtered prompts count=', filtered.length, 'from total=', records.length); } catch { }
        return filtered;
    }, [records]);

    // Group by sessionId, pick latest per group (by ts)
    const groups = useMemo(() => {
        const map = new Map<string, MemoryRecord[]>();
        for (const r of prompts) {
            const sid = String(r.sessionId || '');
            if (!map.has(sid)) map.set(sid, []);
            map.get(sid)!.push(r);
        }
        const arr = Array.from(map.entries()).map(([sessionId, list]) => {
            list.sort((a, b) => b.ts - a.ts);
            const latest = list[0];
            return { sessionId, latest, count: list.length };
        });
        // newest groups first
        arr.sort((a, b) => (b.latest?.ts || 0) - (a.latest?.ts || 0));
        return arr;
    }, [prompts]);

    return (
        <div className="text-sm">
            <div className="flex items-center justify-between mb-2">
                <div className="font-medium">Original PII memory</div>
                <div className="flex items-center gap-2">
                    <button className="text-xs px-2 py-1 rounded bg-slate-200" onClick={load}>Refresh</button>
                    <button className="text-xs px-2 py-1 rounded bg-rose-100 text-rose-700" onClick={() => {
                        try { chrome.runtime.sendMessage({ type: 'MEMORY_PURGE' }, load); } catch { }
                    }}>Purge</button>
                </div>
            </div>
            {loading ? <div className="text-xs text-gray-500">Loading…</div> : null}
            {groups.length === 0 && !loading ? (
                <div className="text-xs text-gray-500">No chats with Original PII yet.</div>
            ) : null}
            <div className="space-y-3">
                {groups.map(g => {
                    const r = g.latest;
                    const host = r?.site || r?.origin || '';
                    const when = r?.ts ? new Date(r.ts).toLocaleString() : '';
                    const url = r?.conversationUrl || '';
                    return (
                        <div key={g.sessionId} className="border rounded p-2 bg-white">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-gray-700 truncate" title={host}>{host}</div>
                                <div className="flex items-center gap-2">
                                    {url ? (
                                        <a className="text-[11px] text-blue-600 hover:underline" href={url} target="_blank" rel="noopener noreferrer">Open Chat</a>
                                    ) : null}
                                    <div className="text-[11px] text-gray-500">Session {String(g.sessionId).slice(0, 6)}</div>
                                </div>
                            </div>
                            <div className="text-[11px] text-gray-500 mt-1">{when}</div>
                            <div className="text-xs text-gray-800 whitespace-pre-wrap mt-1">{String(r?.excerpt || '').slice(0, 240)}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
