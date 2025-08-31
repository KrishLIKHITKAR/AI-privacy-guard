import { describe, it, expect } from 'vitest';
import { assessRisk } from '../services/risk/riskEngine';
import type { AIDetectionContext, SiteCategory } from '../types';
import { withBucket, getActiveBucket, shouldEscalateWithPii } from '../services/aiBuckets';

function mkCtx(opts: Partial<AIDetectionContext> & { processing: 'cloud' | 'on_device' | 'unknown'; siteCategory?: SiteCategory }): AIDetectionContext {
    return {
        origin: opts.origin || 'https://example.com',
        tabId: opts.tabId ?? 1,
        processing: opts.processing,
        trackersPresent: !!opts.trackersPresent,
        siteCategory: opts.siteCategory || 'developer',
        piiSummary: opts.piiSummary || { counts: {} },
    };
}

describe('AI detection harness (riskEngine + buckets)', () => {
    it('OpenAI POST with JSON + auth header → aiDetected=true, medium+, cloud red flag', () => {
        const origin = 'https://api.openai.com';
        const tabId = 101;
        // Simulate a POST counted by buckets
        withBucket(tabId, origin, b => { b.counts.aiPost++; });
        const ctx = mkCtx({ origin, tabId, processing: 'cloud', trackersPresent: false, siteCategory: 'developer' });
        const r = assessRisk(ctx);
        expect(r.aiDetected).toBe(true);
        expect(r.level === 'medium' || r.level === 'high').toBe(true);
        expect(r.redFlags.join(' ')).toMatch(/Cloud processing/i);
        const bucket = getActiveBucket(tabId, origin);
        expect(bucket?.counts.aiPost || 0).toBeGreaterThan(0);
    });

    it('SSE stream (event-stream) → aiDetected=true (cloud), cloud red flag, medium+', () => {
        const origin = 'https://stream.provider.ai';
        const tabId = 102;
        // Simulate SSE sighting via bucket
        withBucket(tabId, origin, b => { b.counts.sse++; });
        const ctx = mkCtx({ origin, tabId, processing: 'cloud', trackersPresent: false, siteCategory: 'developer' });
        const r = assessRisk(ctx);
        expect(r.aiDetected).toBe(true);
        expect(r.level === 'medium' || r.level === 'high').toBe(true);
        expect(r.redFlags.join(' ')).toMatch(/Cloud processing/i);
        const bucket = getActiveBucket(tabId, origin);
        expect(bucket?.counts.sse || 0).toBeGreaterThan(0);
    });

    it('Model file download 200MB → bucket registers modelDownload; riskEngine likely low and aiDetected=false (unknown processing)', () => {
        const origin = 'https://models.example.com';
        const tabId = 103;
        // Simulate large model download
        withBucket(tabId, origin, b => { b.counts.modelDownload++; });
        const ctx = mkCtx({ origin, tabId, processing: 'unknown', trackersPresent: false, siteCategory: 'developer' });
        const r = assessRisk(ctx);
        expect(r.aiDetected).toBe(false);
        expect(r.level).toBe('low');
        const bucket = getActiveBucket(tabId, origin);
        expect(bucket?.counts.modelDownload || 0).toBeGreaterThan(0);
    });

    it('Unknown domain large JSON POST + API key → aiDetected=true (cloud), medium+, cloud red flag', () => {
        const origin = 'https://unknown-ai-like.example';
        const tabId = 104;
        // Simulate POST via bucket
        withBucket(tabId, origin, b => { b.counts.aiPost++; });
        const ctx = mkCtx({ origin, tabId, processing: 'cloud', trackersPresent: false, siteCategory: 'developer' });
        const r = assessRisk(ctx);
        expect(r.aiDetected).toBe(true);
        expect(r.level === 'medium' || r.level === 'high').toBe(true);
        expect(r.redFlags.join(' ')).toMatch(/Cloud processing/i);
        const bucket = getActiveBucket(tabId, origin);
        expect(bucket?.counts.aiPost || 0).toBeGreaterThan(0);
    });

    it('Harmless login POST → aiDetected=false, low risk, no cloud red flag', () => {
        const origin = 'https://login.example.com';
        const tabId = 105;
        const ctx = mkCtx({ origin, tabId, processing: 'on_device', trackersPresent: false, siteCategory: 'general' });
        const r = assessRisk(ctx);
        expect(r.aiDetected).toBe(false);
        // general (10) + on_device (5) + trackers(0) = 15 => low
        expect(r.level).toBe('low');
        expect(r.redFlags.join(' ')).not.toMatch(/Cloud processing/i);
    });

    it('shouldEscalateWithPii returns true only within window', () => {
        const now = Date.now();
        expect(shouldEscalateWithPii(null, now, 15000)).toBe(false);
        expect(shouldEscalateWithPii({ lastPiiTs: 0 } as any, now, 15000)).toBe(false);
        expect(shouldEscalateWithPii({ lastPiiTs: now - 10_000 } as any, now, 15_000)).toBe(true);
        expect(shouldEscalateWithPii({ lastPiiTs: now - 20_000 } as any, now, 15_000)).toBe(false);
    });
});
