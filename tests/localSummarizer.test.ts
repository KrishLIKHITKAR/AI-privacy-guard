import { describe, it, expect } from 'vitest';
import { LocalSummarizer } from '../services/localSummarizer';

describe('LocalSummarizer', () => {
    it('produces diverse bullets on realistic policy text', () => {
        const text = `We collect account information and usage data. We may share information with third parties for analytics and service providers. 
    Users can opt-out of marketing communications and request deletion of their data. We retain data for 12 months unless required longer. 
    Our services may use artificial intelligence to provide recommendations. Cookies and pixels track site performance.`;
        const ls = new LocalSummarizer();
        const res = ls.summarize(text, 4);
        expect(res.bullets.length).toBeGreaterThanOrEqual(3);
        expect(res.bullets.length).toBeLessThanOrEqual(4);
    });

    it('handles short text edge case', () => {
        const ls = new LocalSummarizer();
        const res = ls.summarize('Too short', 4);
        expect(res.bullets[0]).toMatch(/too short/i);
    });
});
