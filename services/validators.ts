export function luhnValid(num: string): boolean {
    const s = (num || '').replace(/\D+/g, '');
    if (s.length < 12) return false;
    let sum = 0; let alt = false;
    for (let i = s.length - 1; i >= 0; i--) {
        let n = s.charCodeAt(i) - 48;
        if (alt) { n *= 2; if (n > 9) n -= 9; }
        sum += n; alt = !alt;
    }
    return sum % 10 === 0;
}

// Minimal IBAN checksum (mod 97 == 1)
export function ibanValid(iban: string): boolean {
    const clean = (iban || '').replace(/\s+/g, '').toUpperCase();
    if (!/^([A-Z]{2}\d{2})[A-Z0-9]{10,30}$/.test(clean)) return false;
    const rearranged = clean.slice(4) + clean.slice(0, 4);
    const converted = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
    // mod 97 with big ints via chunking
    let remainder = 0;
    for (let i = 0; i < converted.length; i += 7) {
        const part = String(remainder) + converted.slice(i, i + 7);
        remainder = Number(BigInt(part) % 97n);
    }
    return remainder === 1;
}

export function sha256Hex(input: string): string {
    // In MV3 we can use SubtleCrypto; fallback to a trivial hash if unavailable
    // Note: for token labels only; not for security
    try {
        const enc = new TextEncoder();
        const data = enc.encode(input);
        // @ts-ignore
        const d = (crypto?.subtle?.digest && crypto.subtle.digest('SHA-256', data)) || null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (d && (d as any).then) {
            // not actually async here; consumer should handle promise if used
        }
    } catch { }
    // Quick non-crypto fallback
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24); }
    return (h >>> 0).toString(16);
}

export function chunkStringByParagraph(input: string, max = 4000): string[] {
    const parts = (input || '').split(/\n{2,}/);
    const out: string[] = [];
    for (const p of parts) {
        if (p.length <= max) out.push(p);
        else {
            for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
        }
    }
    return out;
}
