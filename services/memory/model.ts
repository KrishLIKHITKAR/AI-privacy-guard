import type { MemoryRecord } from '../../types';
import { DEFAULT_TTL_DAYS } from '../constants';

declare const chrome: any;

const KEY = 'aipgMemoryRecords';

export async function listAll(): Promise<MemoryRecord[]> {
    const data = await new Promise<any>(resolve => chrome.storage.local.get([KEY], (r: any) => resolve(r || {})));
    return (data[KEY] || []) as MemoryRecord[];
}

export async function saveRecord(rec: MemoryRecord) {
    const list = await listAll();
    list.push(rec);
    if (list.length > 500) list.splice(0, list.length - 500);
    await chrome.storage.local.set({ [KEY]: list });
}

export async function deleteById(id: string) {
    const list = await listAll();
    const next = list.filter(x => x.id !== id);
    await chrome.storage.local.set({ [KEY]: next });
}

export async function wipeAll() {
    await chrome.storage.local.set({ [KEY]: [] });
}

export async function pruneOld(ttlDays?: number) {
    const ttl = (ttlDays ?? DEFAULT_TTL_DAYS) * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const list = await listAll();
    const next = list.filter(x => (now - x.ts) < ttl);
    if (next.length !== list.length) await chrome.storage.local.set({ [KEY]: next });
}
