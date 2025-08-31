import type { PIISummary, Redaction } from '../../types';
import { detectPII as detect } from './piiPatterns';

export function detectPII(input: string): { redactions: Redaction[]; piiSummary: PIISummary } {
    try { return detect(input); } catch { return { redactions: [], piiSummary: { counts: {} } }; }
}
