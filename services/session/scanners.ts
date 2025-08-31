export function hasInlineScripts(html: string): boolean {
    return /<script[\s\S]*?>[\s\S]*?<\/script>/i.test(html) || / on[a-z]+=/i.test(html);
}

export function hasJavascriptUrls(html: string): boolean {
    return /href\s*=\s*"javascript:[^"]*"/i.test(html) || /href\s*=\s*'javascript:[^']*'/i.test(html);
}

export function hasTrackingParams(url: string): boolean {
    return /(utm_[a-z]+|gclid|fbclid|msclkid)=/i.test(url);
}
