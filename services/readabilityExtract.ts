// services/readabilityExtract.ts
// Runs Mozilla Readability against either the live DOM (when called from content)
// or against HTML provided via DOMParser. Returns text content and simple structure.
import { Readability as ReadabilityCtor } from '@mozilla/readability';

export type ReadableOut = {
    ok: boolean;
    title?: string;
    byline?: string;
    text?: string;
    paragraphs?: string[];
};

// We dynamically import Readability at runtime from the extension bundle when used in content.

export async function extractReadableFromDocument(doc: Document): Promise<ReadableOut> {
    try {
        const R: any = (ReadabilityCtor as any)?.Readability || ReadabilityCtor as any;
        const reader = new R(doc);
        const article = reader.parse();
        if (!article) return { ok: false };
        const text = (article.textContent || '').replace(/\s+/g, ' ').trim();
        const paragraphs = (article.content || '')
            .split(/<\/?p[^>]*>/i)
            .map(s => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
            .filter(Boolean);
        return { ok: true, title: article.title || undefined, byline: article.byline || undefined, text, paragraphs };
    } catch {
        return { ok: false };
    }
}

export async function extractReadableFromHtml(html: string, baseUrl: string): Promise<ReadableOut> {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        (doc as any).URL = baseUrl; // help Readability with base URL
        return extractReadableFromDocument(doc);
    } catch {
        return { ok: false };
    }
}
