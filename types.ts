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