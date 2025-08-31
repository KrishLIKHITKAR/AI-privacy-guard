export function emailDomainOnly(emailToken: string): string {
    const m = /⟦EMAIL:([^⟧]+)⟧/.exec(emailToken);
    return m ? `⟦EMAIL:${m[1]}⟧` : emailToken;
}

export function phoneLast4(token: string): string {
    const m = /⟦PHONE:(\d{2,})⟧/.exec(token);
    return m ? `⟦PHONE:${m[1].slice(-4)}⟧` : token;
}

export function cardLast4(token: string): string {
    const m = /⟦CARD:([^⟧]+)⟧/.exec(token);
    return m ? `⟦CARD:${m[1].slice(-4)}⟧` : token;
}

export function dobToAgeRange(text: string): string {
    // Heuristic: replace YYYY-MM-DD or similar with age bucket placeholder
    return text.replace(/\b(19|20)\d{2}[\/.-]\d{1,2}[\/.-]\d{1,2}\b/g, '⟦DOB:AGE_RANGE⟧');
}

export function applyGranularity(text: string, settings: Record<string, string>): string {
    let out = text;
    if (settings.email === 'domain_only') {
        out = out.replace(/⟦EMAIL:[^⟧]+⟧/g, (m) => emailDomainOnly(m));
    } else if (settings.email === 'full_mask') {
        out = out.replace(/⟦EMAIL:[^⟧]+⟧/g, '⟦EMAIL⟧');
    }
    if (settings.phone === 'last_4') {
        out = out.replace(/⟦PHONE:[^⟧]+⟧/g, (m) => phoneLast4(m));
    } else if (settings.phone === 'full_mask') {
        out = out.replace(/⟦PHONE:[^⟧]+⟧/g, '⟦PHONE⟧');
    }
    if (settings.card === 'last_4') {
        out = out.replace(/⟦CARD:[^⟧]+⟧/g, (m) => cardLast4(m));
    } else if (settings.card === 'full_mask') {
        out = out.replace(/⟦CARD:[^⟧]+⟧/g, '⟦CARD⟧');
    }
    if (settings.dob === 'age_range') {
        out = dobToAgeRange(out);
    } else if (settings.dob === 'full_mask') {
        out = out.replace(/⟦DOB:[^⟧]*⟧/g, '⟦DOB⟧');
    }
    // address simplifications
    if (settings.address === 'full_mask') {
        out = out.replace(/⟦ADDRESS\b[^⟧]*⟧/g, '⟦ADDRESS⟧');
    }
    return out;
}
