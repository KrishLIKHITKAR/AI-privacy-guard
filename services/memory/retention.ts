import { pruneOld } from './model';

declare const chrome: any;

export function setupMemoryCleanup() {
    try {
        chrome.alarms.create('memoryCleanup', { periodInMinutes: 60 });
        chrome.alarms.onAlarm.addListener((a: any) => {
            if (a && a.name === 'memoryCleanup') {
                try {
                    chrome.storage.local.get(['retentionDays', 'ttlDays'], (r: any) => {
                        const days = Number(r?.retentionDays ?? r?.ttlDays);
                        const ttl = Number.isFinite(days) && days > 0 ? days : undefined;
                        pruneOld(ttl).catch(() => { });
                    });
                } catch {
                    pruneOld().catch(() => { });
                }
            }
        });
    } catch { }
}
