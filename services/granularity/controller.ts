import { applyGranularity } from './transformers';

declare const chrome: any;

export async function applyGranularityControls(text: string): Promise<string> {
    try {
        const settings = await new Promise<Record<string, string>>((resolve) =>
            chrome.storage.local.get(['granularitySettings'], (r: any) => resolve(r?.granularitySettings || {
                email: 'domain_only', phone: 'last_4', address: 'city_only', dob: 'age_range', card: 'last_4'
            }))
        );
        return applyGranularity(text, settings);
    } catch { return text; }
}
