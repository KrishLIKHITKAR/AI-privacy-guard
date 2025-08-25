// services/riskRules.ts - static rules mapping

export const DataTypeRisk: Record<string, 'Low Risk' | 'Medium Risk' | 'High Risk'> = {
    biometric: 'High Risk',
    browsingHistory: 'Medium Risk',
    anonymizedText: 'Low Risk',
    image: 'High Risk',
    audio: 'High Risk',
    video: 'High Risk',
    json: 'Medium Risk',
    text: 'Low Risk',
    binary: 'Medium Risk',
};

export function fallbackExplanation(types: string[]): { risk: 'Low' | 'Medium' | 'High'; note: string } {
    const ranks = { 'Low Risk': 0, 'Medium Risk': 1, 'High Risk': 2 } as const;
    let worst: 'Low Risk' | 'Medium Risk' | 'High Risk' = 'Low Risk';
    for (const t of types) {
        const r = DataTypeRisk[t] || 'Medium Risk';
        if (ranks[r] > ranks[worst]) worst = r;
    }
    const map: any = { 'Low Risk': 'Low', 'Medium Risk': 'Medium', 'High Risk': 'High' };
    return { risk: map[worst], note: `Based on detected data types: ${types.join(', ') || 'none'}` };
}
