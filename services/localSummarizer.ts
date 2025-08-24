export type LocalSummary = { bullets: string[]; confidence: number };

class SentenceScorer {
    score(sentence: string, keyTerms: Record<string, string[]>): number {
        let score = 0;
        const lower = sentence.toLowerCase();
        Object.values(keyTerms).flat().forEach(term => {
            if (lower.includes(term)) score += 0.1;
        });
        if (/\b(ai|artificial intelligence|machine learning)\b/i.test(sentence)) score += 0.3;
        if (/\b(opt[- ]out|delete|remove)\b/i.test(sentence)) score += 0.2;
        if (/\b(third[- ]party|share|sell)\b/i.test(sentence)) score += 0.2;
        if (/\b(days?|months?|years?)\b/i.test(sentence)) score += 0.15;
        if (/\b(may|might|could|possibly)\b/i.test(sentence)) score -= 0.05;
        return Math.max(0, Math.min(1, score));
    }
}

export class LocalSummarizer {
    private keyTerms: Record<string, string[]> = {
        collection: ['collect', 'gather', 'obtain', 'receive', 'store'],
        sharing: ['share', 'disclose', 'provide', 'third party', 'partner'],
        retention: ['retain', 'keep', 'store', 'delete', 'remove'],
        rights: ['opt out', 'opt-out', 'choice', 'control', 'request'],
        ai: ['artificial intelligence', 'machine learning', 'ai', 'algorithm', 'automated'],
        tracking: ['cookie', 'track', 'analytics', 'pixel', 'beacon']
    };
    private scorer = new SentenceScorer();

    summarize(policyText: string, maxBullets = 4): LocalSummary {
        if (!policyText || policyText.trim().length < 100) {
            return { bullets: ['Policy text too short to analyze'], confidence: 0.1 };
        }
        const sentences = this.extractSentences(policyText);
        const scored = sentences.map(s => ({
            text: s,
            score: this.scorer.score(s, this.keyTerms),
            category: this.categorize(s)
        }));
        const selected = this.selectTopBullets(scored, maxBullets);
        const bullets = selected.map(b => this.compress(b.text, b.category));
        const confidence = this.confidence(scored);
        return { bullets, confidence };
    }

    private extractSentences(text: string): string[] {
        const cleaned = text
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [];
        return sentences.map(s => s.trim()).filter(s => s.length > 30 && s.length < 300);
    }

    private categorize(sentence: string): string {
        const lower = sentence.toLowerCase();
        for (const [category, terms] of Object.entries(this.keyTerms)) {
            if (terms.some(t => lower.includes(t))) return category;
        }
        return 'general';
    }

    private selectTopBullets(scored: Array<{ text: string; score: number; category: string }>, maxBullets: number) {
        const byCategory: Record<string, Array<{ text: string; score: number; category: string }>> = {};
        for (const s of scored) {
            if (!byCategory[s.category]) byCategory[s.category] = [];
            byCategory[s.category].push(s);
        }
        Object.keys(byCategory).forEach(cat => byCategory[cat].sort((a, b) => b.score - a.score));
        const order = ['ai', 'collection', 'sharing', 'rights', 'retention', 'tracking', 'general'];
        const out: Array<{ text: string; score: number; category: string }> = [];
        for (const cat of order) {
            if (out.length >= maxBullets) break;
            const arr = byCategory[cat];
            if (arr && arr.length) out.push(arr[0]);
        }
        return out;
    }

    private compress(text: string, category: string): string {
        let t = text.replace(/\s+(in order to|for the purpose of)\s+/gi, ' ')
            .replace(/\s+however,?\s+/gi, ' ')
            .trim();
        if (t.length > 120) t = t.slice(0, 117) + '...';
        t = t.charAt(0).toUpperCase() + t.slice(1);
        const prefix: Record<string, string> = {
            ai: 'AI: ', collection: 'Data: ', sharing: 'Sharing: ', rights: 'Rights: ', retention: 'Retention: ', tracking: 'Tracking: '
        };
        return (prefix[category] || '') + t;
    }

    private confidence(scored: Array<{ score: number; category: string }>): number {
        if (!scored.length) return 0.1;
        const avg = scored.reduce((s, x) => s + x.score, 0) / scored.length;
        const hasAI = scored.some(s => s.category === 'ai');
        const catCount = new Set(scored.map(s => s.category)).size;
        let c = avg * 0.5;
        if (hasAI) c += 0.2;
        c += (Math.min(catCount, 6) / 6) * 0.3;
        return Math.min(1, c);
    }
}
