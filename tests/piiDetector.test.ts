import { describe, it, expect } from 'vitest';
import { detectPII } from '../services/sanitization/piiDetector';

describe('piiDetector', () => {
    it('detects email and card', () => {
        const s = 'Contact me at user@example.com and my card 4242 4242 4242 4242.';
        const { piiSummary } = detectPII(s);
        expect((piiSummary.counts.email || 0) > 0).toBe(true);
        expect((piiSummary.counts.card || 0) > 0).toBe(true);
    });
    it('detects api key shapes', () => {
        const s = 'Key sk-AAAAAAAAAAAAAAAAAAAA test';
        const { piiSummary } = detectPII(s);
        expect((piiSummary.counts.api_key || 0) > 0).toBe(true);
    });
});
