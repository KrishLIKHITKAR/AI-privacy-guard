import type { AIDetectionContext, RiskAssessment } from '../../types';
import { CATEGORY_BASE, DATA_WEIGHTS, PROCESSING, TRACKERS, toLevel } from './riskWeights';

export function assessRisk(ctx: AIDetectionContext): RiskAssessment {
    const factors: Record<string, number> = {};
    const base = CATEGORY_BASE[ctx.siteCategory] ?? 10; factors.category = base;
    let dataScore = 0;
    const counts = ctx.piiSummary?.counts || {};
    for (const [k, v] of Object.entries(counts)) {
        const w = DATA_WEIGHTS[k] || 0; if (v > 0) { dataScore += Math.min(w * v, w * 3); factors[`data:${k}`] = Math.min(w * v, w * 3); }
    }
    const proc = PROCESSING[ctx.processing] ?? 0; factors.processing = proc;
    const track = ctx.trackersPresent ? TRACKERS.present : TRACKERS.absent; factors.trackers = track;
    const score = Math.min(100, Math.round(base + dataScore + proc + track));
    const level = toLevel(score);
    const redFlags: string[] = [];
    // Infer AI presence from processing hints and PII signals (conservative):
    const anyPii = Object.values(counts).some(v => v > 0);
    const aiDetected = ctx.processing === 'cloud' || (ctx.processing === 'on_device' && anyPii) || ctx.trackersPresent;
    if (ctx.processing === 'cloud') redFlags.push('Cloud processing');
    if (ctx.trackersPresent) redFlags.push('Trackers detected');
    for (const [k, v] of Object.entries(counts)) if (v > 0 && (DATA_WEIGHTS[k] || 0) >= 20) redFlags.push(`${k} detected`);
    if (['banking', 'healthcare', 'government'].includes(ctx.siteCategory)) redFlags.push(`${ctx.siteCategory} site`);
    return { aiDetected, level, score, redFlags, factors };
}

export async function explainRisk(assessment: RiskAssessment, ctx: AIDetectionContext): Promise<string> {
    const facts = [
        `Site category: ${ctx.siteCategory}`,
        `Processing: ${ctx.processing}`,
        `Trackers present: ${ctx.trackersPresent ? 'yes' : 'no'}`,
        `Data detected: ${Object.entries(ctx.piiSummary?.counts || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k}(${v})`).join(', ') || 'none'}`,
        `Risk score: ${assessment.score} (${assessment.level})`
    ].join('\n- ');
    const base = `Based on site type and detected data, risk is ${assessment.level}. ${assessment.redFlags.join('; ')}`.trim();
    try {
        const any: any = globalThis as any;
        if (any?.ai?.languageModel?.create) {
            const session = await any.ai.languageModel.create({ temperature: 0.1 });
            const prompt = `System: You rephrase risk summaries. Do not infer new facts.\nUser: Facts:\n- ${facts}\n\nRules:\n- Rephrase clearly in <= 2 sentences.\n- No advice beyond these facts.\n- No guessing or inventions.\nOutput only plain English text.`;
            const res = await session.prompt(prompt);
            const text = String(res || '').trim();
            if (text) return text.slice(0, 240);
        } else if (any?.ai?.prompt?.create) {
            const session = await any.ai.prompt.create();
            const res = await session.prompt(`Rephrase clearly (<=2 sentences) without inventing: ${base}`);
            const text = String(res || '').trim();
            if (text) return text.slice(0, 240);
        }
    } catch { }
    return base;
}
