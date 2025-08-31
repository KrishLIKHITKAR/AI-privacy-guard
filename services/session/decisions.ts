import type { SessionDecision, RiskAssessment } from '../../types';

declare const chrome: any;

async function getStrictMode(): Promise<boolean> {
    return await new Promise(resolve => chrome.storage.local.get(['strictMode'], (r: any) => resolve(!!r?.strictMode)));
}

export async function decideOutbound(risk: RiskAssessment, hasCriticalSecrets: boolean): Promise<SessionDecision> {
    const strict = await getStrictMode();
    if (hasCriticalSecrets) return { action: 'block', reason: 'Critical secret detected' };
    if (risk.level === 'high' && strict) return { action: 'block', reason: 'High risk (strict mode)' };
    if (risk.level === 'high') return { action: 'rewrite', reason: 'High risk: sanitized' };
    return { action: 'allow' };
}

export async function decideInbound(hasMalicious: boolean, risk: RiskAssessment): Promise<SessionDecision> {
    const strict = await getStrictMode();
    if (hasMalicious && strict) return { action: 'block', reason: 'Malicious content (strict mode)' };
    if (hasMalicious) return { action: 'rewrite', reason: 'Sanitized response' };
    if (risk.level === 'high' && strict) return { action: 'rewrite', reason: 'High risk (strict)' };
    return { action: 'allow' };
}
