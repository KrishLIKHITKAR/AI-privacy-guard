// Lightweight capability detection and caching. Safe to call from popup.
export type AICapabilities = { prompt: boolean; summarizer: boolean };

let cached: AICapabilities | null = null;

// Allow using Chrome extension API in TS context (optional)
declare const chrome: any;

export async function detectAICapabilities(): Promise<AICapabilities> {
    if (cached) return cached;
    const anyGlobal: any = globalThis as any;
    const caps: AICapabilities = { prompt: false, summarizer: false };
    try {
        if (anyGlobal?.ai?.prompt) caps.prompt = true;
    } catch { }
    try {
        if (anyGlobal?.ai?.summarizer?.create) caps.summarizer = true;
    } catch { }
    cached = caps;
    try { chrome?.storage?.local?.set?.({ aiCapabilities: caps }); } catch { }
    return caps;
}

export function getCachedAICapabilities(): AICapabilities | null {
    return cached;
}
