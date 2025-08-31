export const MAX_EXCERPT_LEN = 256;
export const SCAN_BODY_BYTE_LIMIT = 512 * 1024; // 512KB scan cap
export const REDACTION_TOKEN_PREFIX = '⟦';
export const REDACTION_TOKEN_SUFFIX = '⟧';
export const DEFAULT_TTL_DAYS = 14;
// Heuristic thresholds for unknown AI detection (tunable)
export const MIN_JSON_BODY_BYTES = 50_000; // 50KB
export const TRIVIAL_POST_MAX_BYTES = 2_000; // ignore tiny POSTs (e.g., logins, pixels)
export const SEEN_HOST_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours for "previously unseen" tracking

export function clampExcerpt(s: string, len = MAX_EXCERPT_LEN): string {
    if (!s) return '';
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > len ? t.slice(0, len - 1) + '…' : t;
}
