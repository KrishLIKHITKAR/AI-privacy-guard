import { describe, it, expect } from 'vitest';

// Rebuild key regexes here to verify behavior without importing MV3 code.
const aiEndpointPatterns = [
    /api\.openai\.com\/v1/i,
    /api\.anthropic\.com/i,
    /generativelanguage\.googleapis\.com/i,
    /aiplatform\.googleapis\.com/i,
    /vertex\.ai/i,
    /openai\.azure\.com/i,
    /cognitiveservices\.azure\.com/i,
    /\/openai\/deployments\//i,
    /api\.cohere\.ai/i,
    /api-inference\.huggingface\.co/i,
    /huggingface\.co\/(api|models|inference)/i,
    /api\.replicate\.com/i,
    /api\.stability\.ai/i
];

const modelFileRe = /\.(onnx|tflite|safetensors|bin|gguf|pt|pth)(\?.*)?$/i;
const modelPattern = /model[-_]?weights|checkpoint|\.ggml(\?.*)?$/i;

const ignoreResourceDomains = [
    /google-analytics\.com/i,
    /googletagmanager\.com/i,
    /doubleclick\.net/i,
    /facebook\.com\/(tr|plugins)/i,
    /connect\.facebook\.net/i,
    /linkedin\.com\/(analytics|li|px)/i,
    /twitter\.com\/i\/pixel/i,
    /cdnjs\.cloudflare\.com/i,
    /unpkg\.com/i,
    /jsdelivr\.net/i,
    /static\.hotjar\.com/i,
    /cdn\.segment\.com/i,
    /cdn\.amplitude\.com/i,
    /cdn\.mixpanel\.com/i
];

describe('Detection regexes', () => {
    it('matches AI endpoints and not analytics', () => {
        const aiUrl = 'https://api.openai.com/v1/chat/completions';
        const analyticsUrl = 'https://www.google-analytics.com/g/collect?v=2';
        const matchesAI = aiEndpointPatterns.some(r => r.test(aiUrl));
        const matchesAnalytics = aiEndpointPatterns.some(r => r.test(analyticsUrl));
        expect(matchesAI).toBe(true);
        expect(matchesAnalytics).toBe(false);
    });

    it('detects model filenames and ignores normal assets', () => {
        const modelA = 'https://cdn.example.com/models/llm.ggml';
        const modelB = 'https://cdn.example.com/model-weights.bin?cache=1';
        const css = 'https://cdn.example.com/styles/site.css';
        const isModel = (u: string) => modelFileRe.test(u) || modelPattern.test(u);
        expect(isModel(modelA)).toBe(true);
        expect(isModel(modelB)).toBe(true);
        expect(isModel(css)).toBe(false);
    });

    it('ignores noisy analytics domains', () => {
        const url = 'https://connect.facebook.net/en_US/fbevents.js';
        const ignored = ignoreResourceDomains.some(r => r.test(url));
        expect(ignored).toBe(true);
    });
});
