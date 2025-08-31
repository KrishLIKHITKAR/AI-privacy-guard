export const CATEGORY_BASE: Record<string, number> = {
    banking: 45, healthcare: 40, government: 40,
    work: 25, developer: 20, ecommerce: 20, education: 20,
    social: 15, news: 10, general: 10
};

export const DATA_WEIGHTS: Record<string, number> = {
    biometric: 40, ssn: 35, card: 35, api_key: 30, password: 30,
    address_full: 20, phone: 15, email: 10, name: 5, dob: 20,
    iban: 25, crypto_addr: 15
};

export const PROCESSING: Record<'cloud' | 'on_device' | 'unknown', number> = {
    cloud: 25, on_device: 5, unknown: 10
};

export const TRACKERS = { present: 10, absent: 0 };

export function toLevel(score: number): 'low' | 'medium' | 'high' {
    if (score >= 65) return 'high';
    if (score >= 35) return 'medium';
    return 'low';
}
