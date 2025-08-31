import type { Redaction } from '../../types';
import { REDACTION_TOKEN_PREFIX, REDACTION_TOKEN_SUFFIX } from '../constants';
import { sha256Hex } from '../validators';

export function maskPII(input: string, redactions: Redaction[]): string {
    let out = String(input || '');
    // Idempotency: if already masked, skip
    if (out.includes(REDACTION_TOKEN_PREFIX)) return out;
    // Apply from end to start to keep indices stable
    const sorted = [...redactions].sort((a, b) => b.start - a.start);
    for (const r of sorted) {
        const val = r.value;
        let label = r.type.toUpperCase();
        if (r.type === 'email') {
            const domain = (val.split('@')[1] || '').toLowerCase();
            label = `EMAIL:${domain}`;
        } else if (r.type === 'card') {
            const digits = val.replace(/\D+/g, '');
            label = `CARD:**** **** **** ${digits.slice(-4)}`;
        } else if (r.type === 'api_key') {
            label = `API_KEY:${sha256Hex(val).slice(0, 8)}`;
        } else if (r.type === 'phone') {
            const d = val.replace(/\D+/g, '');
            label = `PHONE:${d.slice(-4)}`;
        }
        const token = `${REDACTION_TOKEN_PREFIX}${label}${REDACTION_TOKEN_SUFFIX}`;
        out = out.slice(0, r.start) + token + out.slice(r.end);
    }
    return out;
}
