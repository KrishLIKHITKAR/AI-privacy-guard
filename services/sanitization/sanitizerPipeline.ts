import type { SanitizationResult, SiteCategory } from '../../types';
import { sanitizeHtml } from './htmlSanitizer';
import { detectPII } from './piiDetector';
import { maskPII } from './piiMasker';
import { applyContextRules } from './contextRules';
import { SCAN_BODY_BYTE_LIMIT } from '../constants';
import { chunkStringByParagraph } from '../validators';

export async function sanitizeInput(input: string, category: SiteCategory): Promise<SanitizationResult> {
    const s = String(input || '');
    if (s.length > SCAN_BODY_BYTE_LIMIT) {
        const chunks = chunkStringByParagraph(s, 4000);
        const outParts: string[] = [];
        const allRedactions = [] as ReturnType<typeof detectPII>['redactions'];
        let counts: Record<string, number> = {};
        for (const c of chunks) {
            const step1 = sanitizeHtml(c);
            const { redactions, piiSummary } = detectPII(step1);
            for (const [k, v] of Object.entries(piiSummary.counts)) counts[k] = (counts[k] || 0) + v;
            const step2 = maskPII(step1, redactions);
            const step3 = applyContextRules(step2, category);
            outParts.push(step3);
            allRedactions.push(...redactions);
        }
        return { original: s, sanitized: outParts.join('\n\n'), redactions: allRedactions, piiSummary: { counts } };
    }
    const step1 = sanitizeHtml(s);
    const { redactions, piiSummary } = detectPII(step1);
    const step2 = maskPII(step1, redactions);
    const step3 = applyContextRules(step2, category);
    return { original: s, sanitized: step3, redactions, piiSummary };
}
