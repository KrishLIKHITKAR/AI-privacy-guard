export interface PermissionSummarizationInput {
    site_url: string;
    context: {
        is_sensitive_category: string[];
        incognito: boolean;
        trackers_detected: boolean;
        model_download_gb: number | null;
        ai_detected?: boolean;
        ai_debug?: {
            aiPostCount?: number;
            largeModelCount?: number;
            passiveEndpointSightings?: number;
        };
        ai_signals?: number;
    };
    ai_intent: string;
    data_scope: {
        page_text?: boolean;
        forms?: boolean;
        credentials_fields?: boolean;
        clipboard?: boolean;
        screenshots?: boolean;
        camera?: boolean;
        microphone?: boolean;
    };
    processing_location: 'on_device' | 'cloud' | 'unknown';
    policy_text_excerpt: string | null;
    change_diff: string | null;
    page_text_excerpt?: string | null;
}

export interface PermissionSummarizationOutput {
    header_line: string;
    summary_one_liner: string;
    bullets: string[];
    risk_score: 'Low' | 'Medium' | 'High';
    red_flags: string[];
    action_hint: string;
    policy_summary: string;
    deep_dive?: string;
    pii_note?: string;
}

export interface PolicyChangeInput {
    old_policy_excerpt: string;
    new_policy_excerpt: string;
}

export interface PolicyChangeOutput {
    change_summary: string[];
}

export interface PolicySummaryInput {
    policy_excerpt: string;
}

export interface PolicySummaryOutput {
    summary_points: string[];
}

// New shared types for features #3, #4, #5, #7, #8
export type ProcessingLocation = 'cloud' | 'on_device' | 'unknown';
export type SiteCategory =
    | 'banking' | 'healthcare' | 'government' | 'education'
    | 'work' | 'developer' | 'ecommerce' | 'social' | 'news' | 'general';

export interface AIDetectionContext {
    origin: string;
    tabId?: number;
    processing: ProcessingLocation;
    trackersPresent: boolean;
    siteCategory: SiteCategory;
    piiSummary?: PIISummary;
}

export type RiskLevel = 'low' | 'medium' | 'high';

export interface RiskAssessment {
    level: RiskLevel;
    score: number; // 0-100
    redFlags: string[]; // concrete reasons
    factors: Record<string, number>; // factor->contribution
}

export interface Redaction {
    type: string;             // e.g., 'email', 'cc', 'api_key'
    value: string;            // original snippet
    replacement: string;      // tokenized/masked form
    start: number;
    end: number;
    confidence: number;       // 0-1
}

export interface PIISummary {
    counts: Record<string, number>; // type->count
}

export interface SanitizationResult {
    original: string;
    sanitized: string;
    redactions: Redaction[];
    piiSummary: PIISummary;
}

export interface GranularityPolicy {
    dataType: string; // 'email' | 'phone' | 'address' | 'card' | ...
    level: string;    // 'domain_only' | 'last_4' | 'city_only' | ...
    apply(value: string): string;
}

export interface SessionDecision {
    action: 'allow' | 'block' | 'rewrite';
    reason?: string;
    rewrittenBody?: string | ArrayBuffer;
}

export interface MemoryRecord {
    id: string;
    tabId?: number;
    origin: string;
    ts: number;
    direction: 'prompt' | 'response';
    sessionId: string; // per-tab isolation id
    risk?: RiskAssessment;
    pii?: PIISummary;
    excerpt: string; // small snippet only (<= 256 chars)
}

export interface FeatureFlags {
    riskEngineEnabled: boolean;
    sanitizationEnabled: boolean;
    granularityEnabled: boolean;
    sessionSanitizerEnabled: boolean;
    memoryCenterEnabled: boolean;
    useLocalAIForExplanations: boolean;
}