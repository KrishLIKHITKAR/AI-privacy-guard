export type LocalSummary = { bullets: string[]; confidence: number; shortExcerpt?: string };

class SentenceScorer {
    private stop = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'for', 'in', 'on', 'by', 'with', 'we', 'you', 'your', 'our', 'us', 'is', 'are', 'be', 'as', 'that']);
    private tokenize(s: string): string[] {
        return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(t => t && !this.stop.has(t));
    }
    private sim(a: string[], b: string[]): number {
        const sa = new Set(a); const sb = new Set(b);
        const inter = [...sa].filter(x => sb.has(x)).length;
        const denom = Math.sqrt(sa.size || 1) * Math.sqrt(sb.size || 1);
        return inter / denom;
    }
    centrality(sentences: string[]): number[] {
        const toks = sentences.map(s => this.tokenize(s));
        const n = sentences.length;
        const scores = new Array(n).fill(0);
        for (let i = 0; i < n; i++) {
            let s = 0; const ti = toks[i];
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const w = this.sim(ti, toks[j]);
                s += w;
            }
            scores[i] = s / Math.max(1, n - 1);
        }
        return scores;
    }
    ruleBoost(sentence: string, keyTerms: Record<string, string[]>): number {
        let score = 0;
        const lower = sentence.toLowerCase();
        Object.values(keyTerms).flat().forEach(term => { if (lower.includes(term)) score += 0.08; });
        if (/\b(ai|artificial intelligence|machine learning|automated)\b/i.test(sentence)) score += 0.28;
        if (/\b(opt[- ]?(out|in)|delete|remove|request)\b/i.test(sentence)) score += 0.18;
        if (/\b(third[- ]?party|share|sell|disclose)\b/i.test(sentence)) score += 0.2;
        if (/\b(days?|months?|years?|until)\b/i.test(sentence)) score += 0.15;
        if (/\b(cookie|tracking|analytics|beacon|pixel)\b/i.test(sentence)) score += 0.12;
        if (/\b(children|minor|13|16)\b/i.test(sentence)) score += 0.12;
        if (/\b(sensitive|health|biometric|financial)\b/i.test(sentence)) score += 0.18;
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
        const centrality = this.scorer.centrality(sentences);
        const scored = sentences.map((s, i) => ({
            text: s,
            base: centrality[i],
            boost: this.scorer.ruleBoost(s, this.keyTerms),
            category: this.categorize(s)
        })).map(x => ({ ...x, score: Math.min(1, x.base * 0.6 + x.boost * 0.6) }));
        const selected = this.selectTopBullets(scored, maxBullets);
        const bullets = this.dedupBullets(selected.map(b => this.compress(b.text, b.category)));
        const confidence = this.confidence(scored);
        const shortExcerpt = this.pickExcerpt(sentences, centrality);
        return { bullets, confidence, shortExcerpt };
    }

    private extractSentences(text: string): string[] {
        const cleaned = text
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        // simple sentence split with abbreviation guard
        const parts = cleaned.split(/(?<!\b(?:Mr|Mrs|Ms|Dr|Inc|Ltd|Co|vs))\.(\s+)/).join('. ').split(/(?<=[.!?])\s+/);
        const sentences = (parts || []).map(s => s.trim());
        return sentences.filter(s => s.length > 30 && s.length < 350).slice(0, 400);
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

    private pickExcerpt(sentences: string[], centrality: number[]): string | undefined {
        if (!sentences.length) return undefined;
        const idx = centrality
            .map((s, i) => ({ s, i }))
            .sort((a, b) => b.s - a.s)
            .slice(0, 3)
            .map(x => x.i)
            .sort((a, b) => a - b);
        const excerpt = idx.map(i => sentences[i]).join(' ');
        return excerpt ? excerpt.slice(0, 280) + (excerpt.length > 280 ? '...' : '') : undefined;
    }

    private dedupBullets(bullets: string[]): string[] {
        const out: string[] = [];
        for (const b of bullets) {
            const lower = b.toLowerCase();
            if (out.some(x => this.similar(lower, x.toLowerCase()) > 0.85)) continue;
            out.push(b);
        }
        return out;
    }
    private similar(a: string, b: string): number {
        const sa = new Set(a.split(/\W+/).filter(Boolean));
        const sb = new Set(b.split(/\W+/).filter(Boolean));
        const inter = [...sa].filter(x => sb.has(x)).length;
        const denom = Math.sqrt(sa.size || 1) * Math.sqrt(sb.size || 1);
        return inter / denom;
    }
}
