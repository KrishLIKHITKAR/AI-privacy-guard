import type { SiteCategory } from '../../types';

export function inferSiteCategory(hostname: string, url: string, title?: string): SiteCategory {
    const h = (hostname || '').toLowerCase();
    const u = (url || '').toLowerCase();
    const t = (title || '').toLowerCase();
    const hay = h + ' ' + u + ' ' + t;
    if (/\.gov$|\bgov\b/.test(hay)) return 'government';
    if (/bank|finance|pay|paypal|chase|boa|hsbc|citibank|stripe|square|visa|mastercard/.test(hay)) return 'banking';
    if (/clinic|health|medical|patient|pharma|hospital|hipaa/.test(hay)) return 'healthcare';
    if (/\.edu$|university|college|campus|edu\b/.test(hay)) return 'education';
    if (/github|gitlab|bitbucket|npm|pypi|developer|dev\b/.test(hay)) return 'developer';
    if (/shop|cart|checkout|product|ecommerce|store\b/.test(hay)) return 'ecommerce';
    if (/twitter|x\.com|facebook|instagram|linkedin|tiktok|social\b/.test(hay)) return 'social';
    if (/news|cnn|bbc|nytimes|guardian|reuters|apnews/.test(hay)) return 'news';
    if (/work|intranet|jira|confluence|notion|slack|microsoft|google\s*workspace/.test(hay)) return 'work';
    return 'general';
}
