// services/botDetection.ts
// Minimal, modular BotD integration with graceful fallback.

export type BotDetectionResult = {
    isBot: boolean;
    confidence: number; // 0..1
    signals: Record<string, any>;
};

// Attempt to use Fingerprint's BotD if available in runtime context; otherwise fallback to heuristics.
export async function detectBotUsage(): Promise<BotDetectionResult> {
    // Try global botd first (if bundled/loaded elsewhere)
    const anyGlobal: any = globalThis as any;
    try {
        if (anyGlobal?.botd?.load) {
            const botd = await anyGlobal.botd.load();
            const result = await botd.detect();
            // BotD returns { bot: { result: 'bot' | 'notBot', type, probability, ... }, requestId }
            const bot = result?.bot || {};
            const isBot = String(bot.result || '').toLowerCase() === 'bot';
            const confidence = typeof bot.probability === 'number' ? Math.max(0, Math.min(1, bot.probability)) : (isBot ? 0.8 : 0.6);
            return {
                isBot,
                confidence,
                signals: {
                    type: bot.type,
                    probability: bot.probability,
                    requestId: result?.requestId,
                    raw: bot,
                },
            };
        }
    } catch (e) {
        // fall through to heuristic
    }

    // Try dynamic import if package is bundled in this context
    try {
        // @ts-ignore - optional dep; bundlers tree-shake if unused
        const mod = await import('@fingerprintjs/botd');
        if (mod && typeof mod.load === 'function') {
            const botd = await mod.load();
            const result = await botd.detect();
            const bot = (result as any)?.bot || {};
            const isBot = String(bot.result || '').toLowerCase() === 'bot';
            const confidence = typeof bot.probability === 'number' ? Math.max(0, Math.min(1, bot.probability)) : (isBot ? 0.8 : 0.6);
            return {
                isBot,
                confidence,
                signals: {
                    type: bot.type,
                    probability: bot.probability,
                    requestId: (result as any)?.requestId,
                    raw: bot,
                },
            };
        }
    } catch (_) {
        // Fallback
    }

    // Heuristic fallback (runs in any DOM context)
    try {
        const nav: any = navigator as any;
        const signals: Record<string, any> = {};
        signals.webdriver = !!nav.webdriver;
        signals.pluginsLength = (nav.plugins && nav.plugins.length) || 0;
        signals.languagesLength = (nav.languages && nav.languages.length) || 0;
        signals.hardwareConcurrency = (nav.hardwareConcurrency || 0);
        signals.deviceMemory = (nav.deviceMemory || 0);
        signals.userAgent = (nav.userAgent || '');
        signals.permissions = [] as any[];
        try {
            if (navigator.permissions && (navigator.permissions as any).query) {
                const names = ['notifications', 'push', 'camera', 'microphone', 'background-sync'];
                for (const name of names) {
                    try { const st = await (navigator.permissions as any).query({ name } as any); signals.permissions.push({ name, state: st?.state }); } catch { }
                }
            }
        } catch { }

        // Basic heuristic scoring
        let score = 0;
        if (signals.webdriver) score += 0.6; // strong signal
        if (signals.pluginsLength === 0) score += 0.1;
        if (signals.languagesLength === 0) score += 0.1;
        if (/headless|puppeteer|playwright/i.test(signals.userAgent)) score += 0.6;
        const isBot = score >= 0.6;
        const confidence = Math.max(0.2, Math.min(1, score));
        return { isBot, confidence, signals };
    } catch {
        return { isBot: false, confidence: 0.5, signals: { error: 'no-context' } };
    }
}
