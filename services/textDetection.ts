// services/textDetection.ts
// Modular AI-generated text detector using a BERT/Roberta-like classifier via Transformers.js.
// - Lazy-loads the model on first call
// - Chunks large input efficiently
// - Batches inference to reduce overhead
// - Provides fallback if model load/inference fails

export type AIChunkResult = { text: string; aiProbability: number };
export type AIDetectionResult = { overallScore: number; details: AIChunkResult[] };

export type DetectOptions = {
    // Hugging Face model repo id. Defaults to a lightweight detector if available.
    model?: string;
    // Max words per chunk (approx 1 word ~ 1 token for coarse splitting)
    maxWordsPerChunk?: number; // default ~ 800
    // Batch size for pipeline; higher can reduce overhead if memory allows
    batchSize?: number; // default 2
};

// Simple sentence splitter with fallback
function splitSentences(text: string): string[] {
    const cleaned = (text || '')
        .replace(/\s+/g, ' ')
        .replace(/[\r\t]/g, ' ')
        .trim();
    if (!cleaned) return [];
    const parts = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
    return parts.map((s) => s.trim()).filter(Boolean);
}

function wordCount(s: string): number {
    return (s.match(/\S+/g) || []).length;
}

function makeChunks(text: string, maxWords = 800): string[] {
    const sents = splitSentences(text);
    const chunks: string[] = [];
    let buf: string[] = [];
    let count = 0;
    for (const s of sents) {
        const w = wordCount(s);
        if (count + w > maxWords && buf.length) {
            chunks.push(buf.join(' '));
            buf = [s];
            count = w;
        } else {
            buf.push(s);
            count += w;
        }
    }
    if (buf.length) chunks.push(buf.join(' '));
    // Guard extremely long input w/o punctuation
    if (chunks.length === 0) {
        const words = (text || '').split(/\s+/);
        for (let i = 0; i < words.length; i += maxWords) {
            chunks.push(words.slice(i, i + maxWords).join(' '));
        }
    }
    return chunks;
}

let _pipeline: any | null = null;

async function getPipeline(model?: string): Promise<any> {
    if (_pipeline) return _pipeline;
    const chosenModel = model || 'roberta-base-openai-detector';
    // Lazy import to avoid bundling overhead until needed
    // @ts-ignore - dynamic import
    const { pipeline } = await import('@xenova/transformers');
    _pipeline = await pipeline('text-classification', chosenModel, {
        quantized: true,
        // allow multiple labels
        topk: 2,
    });
    return _pipeline;
}

function extractAIProbability(pred: any): number {
    // pred can be array of {label, score} or nested.
    // Normalize labels to lowercase and pick AI-related ones.
    const arr: Array<{ label: string; score: number }> = Array.isArray(pred)
        ? pred.map((x: any) => ({ label: String(x.label || '').toLowerCase(), score: Number(x.score || 0) }))
        : [];
    if (arr.length === 0) return 0.5;
    // Try common labels
    const aiLike = arr.find((x) => /(ai|fake|generated|machine)/.test(x.label));
    if (aiLike) return Math.max(0, Math.min(1, aiLike.score));
    // If labels look like 'REAL'/'FAKE' or 'HUMAN'/'AI'
    const fake = arr.find((x) => /fake/.test(x.label));
    const real = arr.find((x) => /real|human/.test(x.label));
    if (fake && real) {
        const sum = fake.score + real.score || 1;
        return sum ? fake.score / sum : fake.score;
    }
    // Fallback: take inverse of the highest confidence for non-AI labels
    const max = arr.reduce((m, x) => (x.score > m ? x.score : m), 0);
    return 1 - max * 0.5; // neutral-ish if unknown
}

export async function detectAIText(content: string, opts: DetectOptions = {}): Promise<AIDetectionResult> {
    if (!content || !content.trim()) {
        return { overallScore: 0, details: [] };
    }
    const maxWords = Math.max(200, Math.min(1200, opts.maxWordsPerChunk ?? 800));
    const batchSize = Math.max(1, Math.min(8, opts.batchSize ?? 2));
    const chunks = makeChunks(content, maxWords);

    try {
        const pipe = await getPipeline(opts.model);
        const details: AIChunkResult[] = [];
        for (let i = 0; i < chunks.length; i += batchSize) {
            const batch = chunks.slice(i, i + batchSize);
            const outputs = await pipe(batch);
            // outputs can be array of arrays; normalize
            const list = Array.isArray(outputs) ? outputs : [outputs];
            for (let j = 0; j < batch.length; j++) {
                const pred = Array.isArray(list[j]) ? list[j] : [list[j]];
                const p = extractAIProbability(pred);
                details.push({ text: batch[j], aiProbability: p });
            }
            // Yield to event loop to avoid blocking UI
            await new Promise((r) => setTimeout(r, 0));
        }
        // Weighted average by chunk length
        let total = 0;
        let weight = 0;
        for (const d of details) {
            const w = Math.max(1, d.text.length);
            total += d.aiProbability * w;
            weight += w;
        }
        const overallScore = weight ? total / weight : 0;
        return { overallScore, details };
    } catch (e) {
        // Fallback heuristic: use repetitiveness and burstiness as weak proxy
        try {
            const details: AIChunkResult[] = chunks.map((t) => {
                const words = (t.match(/\S+/g) || []).length;
                const unique = new Set((t.toLowerCase().match(/[a-z']+/g) || [])).size;
                const ratio = words ? unique / words : 0.5;
                // Lower uniqueness might imply templated/generated; keep conservative
                const p = Math.max(0, Math.min(1, 0.7 - ratio * 0.6));
                return { text: t, aiProbability: p };
            });
            const overall = details.reduce((s, d) => s + d.aiProbability * d.text.length, 0) /
                details.reduce((s, d) => s + d.text.length, 0);
            return { overallScore: isFinite(overall) ? overall : 0.5, details };
        } catch {
            return { overallScore: 0.5, details: chunks.map((t) => ({ text: t, aiProbability: 0.5 })) };
        }
    }
}
