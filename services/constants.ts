export const MAX_EXCERPT_LEN = 256;
export const SCAN_BODY_BYTE_LIMIT = 512 * 1024; // 512KB scan cap
export const REDACTION_TOKEN_PREFIX = '⟦';
export const REDACTION_TOKEN_SUFFIX = '⟧';
export const DEFAULT_TTL_DAYS = 14;

export function clampExcerpt(s: string, len = MAX_EXCERPT_LEN): string {
    if (!s) return '';
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > len ? t.slice(0, len - 1) + '…' : t;
}
