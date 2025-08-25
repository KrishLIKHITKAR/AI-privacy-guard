// services/db.ts - storage-backed local knowledge base
export type ClassifiedService = {
    origin: string;
    url: string;
    knownProvider?: string | null;
    isAI: boolean;
    reason: string;
    classification: 'known' | 'heuristic' | 'unknown';
    risk: 'Low' | 'Medium' | 'High';
    dataTypes: string[];
    explanation: string;
    lastSeen: number;
};

declare const chrome: any;

export const DB_KEYS = {
    providers: 'aiProviders',
    services: 'aiServices',
    explanations: 'aiExplainCache',
} as const;

export type ProviderDB = { domains: Record<string, { name: string; tags?: string[] }> };
export type ServicesDB = Record<string, ClassifiedService>;
export type ExplainDB = Record<string, { text: string; ts: number }>;

export async function getLocal<T>(keys: string[]): Promise<Record<string, T>> {
    return await new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}
export async function setLocal(obj: Record<string, any>): Promise<void> {
    return await new Promise((resolve) => chrome.storage.local.set(obj, resolve));
}

export function bucketKeyFromUrl(u: string): string {
    try {
        const url = new URL(u);
        const seg = url.pathname.split('/').filter(Boolean)[0] || '';
        return `${url.origin}/${seg}`;
    } catch { return u; }
}

export async function ensureSeedProviders() {
    const res = await getLocal<ProviderDB>([DB_KEYS.providers]);
    let db = res[DB_KEYS.providers] as any as ProviderDB;
    if (!db || !db.domains) {
        db = {
            domains: {
                'api.openai.com': { name: 'OpenAI' },
                'chat.openai.com': { name: 'OpenAI Chat' },
                'api.anthropic.com': { name: 'Anthropic' },
                'generativelanguage.googleapis.com': { name: 'Google AI' },
                'aiplatform.googleapis.com': { name: 'Vertex AI' },
                'gemini.google.com': { name: 'Google Gemini' },
                'ai.google.dev': { name: 'Google AI' },
                'content-vision.googleapis.com': { name: 'Google Vision' },
                'openai.azure.com': { name: 'Azure OpenAI' },
                'cognitiveservices.azure.com': { name: 'Azure Cognitive Services' },
                'api.cohere.ai': { name: 'Cohere' },
                'api-inference.huggingface.co': { name: 'Hugging Face Inference' },
                'api.replicate.com': { name: 'Replicate' },
                'api.stability.ai': { name: 'Stability AI' },
            }
        };
        await setLocal({ [DB_KEYS.providers]: db });
    }
}

export async function saveService(record: ClassifiedService) {
    const res = await getLocal<ServicesDB>([DB_KEYS.services]);
    const services = (res[DB_KEYS.services] as any as ServicesDB) || {};
    const key = bucketKeyFromUrl(record.url);
    services[key] = record;
    await setLocal({ [DB_KEYS.services]: services });
}

export async function getServicesForOrigin(origin: string): Promise<ClassifiedService[]> {
    const res = await getLocal<ServicesDB>([DB_KEYS.services]);
    const services = (res[DB_KEYS.services] as any as ServicesDB) || {};
    return Object.values(services).filter(s => s.origin === origin).sort((a, b) => b.lastSeen - a.lastSeen);
}

export async function getExplainCached(key: string): Promise<string | null> {
    const all = await getLocal<ExplainDB>([DB_KEYS.explanations]);
    const cache = (all[DB_KEYS.explanations] as any as ExplainDB) || {};
    const hit = cache[key];
    return hit?.text || null;
}

export async function setExplainCached(key: string, text: string) {
    const all = await getLocal<ExplainDB>([DB_KEYS.explanations]);
    const cache = (all[DB_KEYS.explanations] as any as ExplainDB) || {};
    cache[key] = { text, ts: Date.now() };
    await setLocal({ [DB_KEYS.explanations]: cache });
}

// Optional stub for future crowdsourced DB lookup (no network today)
export async function crowdsourcedLookupStub(_host: string): Promise<null> {
    return null;
}
