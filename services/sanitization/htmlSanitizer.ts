export function sanitizeHtml(input: string): string {
    const s = String(input || '');
    try {
        // @ts-ignore
        const San = (globalThis as any).Sanitizer;
        if (typeof San === 'function') {
            const sanitizer = new San({
                allowElements: ['b', 'strong', 'i', 'em', 'u', 'span', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre'],
                allowAttributes: { 'span': ['class'] },
            });
            // @ts-ignore
            const out = sanitizer.sanitizeFor ? sanitizer.sanitizeFor('div', s) : sanitizer.sanitize(s);
            return typeof out === 'string' ? out : (out?.innerHTML || '');
        }
    } catch { }
    // Fallback: strip all tags except a small whitelist, remove event handlers and javascript: URLs
    return s
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/ on[a-z]+="[^"]*"/gi, '')
        .replace(/ on[a-z]+='[^']*'/gi, '')
        .replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"')
        .replace(/href\s*=\s*'javascript:[^']*'/gi, "href='#'")
        .replace(/<(?!\/?(b|strong|i|em|u|span|p|br|ul|ol|li|code|pre)\b)[^>]*>/gi, '')
        .replace(/<\/(?!\/?(b|strong|i|em|u|span|p|br|ul|ol|li|code|pre)\b)[^>]*>/gi, '');
}
