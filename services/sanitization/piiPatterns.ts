import type { PIISummary, Redaction } from '../../types';
import { luhnValid, ibanValid } from '../validators';

const RX = {
    email: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    phone: /\b(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3}\)?[\s-]?)?\d{3}[\s-]?\d{4}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
    card: /\b(?:\d[ -]*?){13,19}\b/g,
    jwt: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
    api_key: /(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z-_]{35}|sk-[A-Za-z0-9]{20,})/g,
    password: /\b(pass(word)?|pwd|secret|token)\s*[:=]\s*[^\s,;]{6,}\b/gi,
    crypto_addr: /\b(0x[a-fA-F0-9]{40}|bc1[ac-hj-np-z02-9]{11,71})\b/g,
    dob: /\b(?:(?:\d{1,2}[\/.-]){2}\d{2,4})\b/g,
    address_full: /\b\d+\s+([A-Za-z0-9._'-]+\s){1,5}(Street|St\.|Road|Rd\.|Ave\.|Avenue|Blvd\.|Lane|Ln\.)\b/gi,
};

export function detectPII(input: string): { redactions: Redaction[]; piiSummary: PIISummary } {
    const redactions: Redaction[] = [];
    const counts: Record<string, number> = {};
    function add(type: string, match: RegExpExecArray) {
        counts[type] = (counts[type] || 0) + 1;
        redactions.push({ type, value: match[0], replacement: '', start: match.index, end: match.index + match[0].length, confidence: 0.9 });
    }

    // Straight regex types
    for (const [type, rx] of Object.entries(RX)) {
        if (type === 'card' || type === 'iban') continue; // custom validation
        let m: RegExpExecArray | null;
        const g = new RegExp(rx.source, rx.flags);
        while ((m = g.exec(input))) add(type, m);
    }
    // Card numbers with Luhn validation
    {
        let m: RegExpExecArray | null; const g = new RegExp(RX.card.source, RX.card.flags);
        while ((m = g.exec(input))) {
            if (luhnValid(m[0])) add('card', m);
        }
    }
    // IBAN validation
    {
        let m: RegExpExecArray | null; const g = new RegExp(RX.iban.source, RX.iban.flags);
        while ((m = g.exec(input))) {
            if (ibanValid(m[0])) add('iban', m);
        }
    }

    // Merge overlaps: prefer longer spans
    redactions.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
    const merged: Redaction[] = [];
    for (const r of redactions) {
        const last = merged[merged.length - 1];
        if (!last || r.start >= last.end) merged.push(r);
        else if (r.end > last.end) last.end = r.end;
    }

    return { redactions: merged.map(r => ({ ...r, replacement: '' })), piiSummary: { counts } };
}
