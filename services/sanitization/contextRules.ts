import type { SiteCategory } from '../../types';

export function applyContextRules(text: string, category: SiteCategory): string {
    let out = String(text || '');
    if (['banking', 'healthcare', 'government', 'work'].includes(category)) {
        // Mask names next to IDs: e.g., John Doe (ID: 12345)
        out = out.replace(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b\s*\(?(ID|MRN|Invoice)[:#]\s*\w+\)?/g, '⟦NAME⟧ ($2: ⟦ID⟧)');
        // Mask invoice or claim numbers like INV-2024-1234
        out = out.replace(/\b(?:INV|CLAIM|TKT)-\d{4}-\d{3,5}\b/g, '⟦DOC_ID⟧');
        // Always mask full addresses into city/state only shape if obvious
        out = out.replace(/\b\d+\s+([A-Za-z0-9._'-]+\s){1,5}(Street|St\.|Road|Rd\.|Ave\.|Avenue|Blvd\.|Lane|Ln\.)\b/gi, '⟦ADDRESS⟧');
    }
    return out;
}
