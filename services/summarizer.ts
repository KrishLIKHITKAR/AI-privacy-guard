// services/summarizer.ts - wrapper for Chrome on-device AI rephrasing

declare const chrome: any;

export async function rephraseExplanation(text: string): Promise<string> {
    try {
        const anyGlobal: any = globalThis as any;
        if (anyGlobal?.ai?.languageModel?.create) {
            const session = await anyGlobal.ai.languageModel.create({ temperature: 0.1 });
            const res = await session.prompt(`Rephrase this risk explanation in clear English under 24 words: ${text}`);
            const out = String(res || '').trim();
            if (out) return out.slice(0, 160);
        }
    } catch { }
    return text;
}
