import { describe, it, expect } from 'vitest';
import { assessRisk } from '../services/risk/riskEngine';

describe('riskEngine.assessRisk', () => {
    it('assigns high for banking + cloud + card', () => {
        const r = assessRisk({
            origin: 'https://bank.example',
            processing: 'cloud',
            trackersPresent: true,
            siteCategory: 'banking',
            piiSummary: { counts: { card: 1 } }
        });
        expect(r.level === 'high' || r.score >= 65).toBe(true);
        expect(r.redFlags.join(' ')).toMatch(/Cloud|banking|card/i);
        expect(r.aiDetected).toBe(true);
    });
    it('assigns low for general + on_device no data', () => {
        const r = assessRisk({ origin: 'https://site', processing: 'on_device', trackersPresent: false, siteCategory: 'general', piiSummary: { counts: {} } });
        expect(r.level === 'low' || r.score < 35).toBe(true);
        expect(r.aiDetected).toBe(false);
    });
});
