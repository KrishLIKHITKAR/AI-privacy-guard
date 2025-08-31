export const GRANULARITY: Record<string, string[]> = {
    email: ['domain_only', 'first_letter', 'full_mask'],
    phone: ['last_4', 'area_code', 'full_mask'],
    address: ['city_only', 'state_only', 'country_only', 'full_mask'],
    dob: ['year_only', 'age_range', 'full_mask'],
    card: ['last_4', 'bin_only', 'full_mask'],
};
