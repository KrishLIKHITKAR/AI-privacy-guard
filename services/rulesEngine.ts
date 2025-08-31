import type { PermissionSummarizationInput, PermissionSummarizationOutput } from "../types";

function buildHeaderLine(input: PermissionSummarizationInput): string {
    const parts: string[] = [];
    const d = input.data_scope || {};
    if (d.page_text) parts.push("page text");
    if (d.forms) parts.push("forms (may include credentials)");
    if (d.credentials_fields && !d.forms) parts.push("credentials fields");
    if (d.clipboard) parts.push("clipboard");
    if (d.screenshots) parts.push("screenshots");
    if (d.camera) parts.push("camera");
    if (d.microphone) parts.push("microphone");

    if (input.processing_location === "on_device") parts.push("on-device processing");
    else if (input.processing_location === "cloud") parts.push("cloud processing");
    else parts.push("processing location unknown");

    if (input.context?.trackers_detected) parts.push("tracking active");

    const ai = !!input.context?.ai_detected;
    if (!ai) {
        return 'No active AI usage detected on this page';
    }
    const lead = 'This page may be using AI and is accessing';
    return `${lead}: ${parts.join(", ")}`;
}

function summarizePolicyLocal(excerpt: string | null): string {
    if (!excerpt || !excerpt.trim()) return "No clear privacy/AI policy found. This can be risky.";
    const text = excerpt.replace(/\s+/g, ' ').trim();
    const bullets: string[] = [];
    if (/do\s+not\s+sell|don't\s+sell|opt[- ]?out/i.test(text)) bullets.push('Opt-out or “do not sell” options.');
    if (/third[- ]?part(y|ies)|share with/i.test(text)) bullets.push('Shares data with third parties.');
    if (/retain|retention|store for|until/i.test(text)) bullets.push('Defines data retention period.');
    if (/advertis|marketing|personaliz/i.test(text)) bullets.push('Uses data for ads/marketing.');
    if (/ai|machine\s*learning|model/i.test(text)) bullets.push('Mentions AI/model usage.');
    if (/cookie|tracking|analytics/i.test(text)) bullets.push('Cookies/analytics tracking.');
    // Ensure 3–4 compact bullets
    const out = bullets.slice(0, 4);
    if (out.length >= 3) return out.join(' ');
    const short = text.slice(0, 280);
    return (out.join(' ') + (out.length ? ' ' : '') + short + (text.length > 280 ? '…' : '')).trim();
}

function computeRiskAndFlags(input: PermissionSummarizationInput): { risk: "Low" | "Medium" | "High", flags: string[] } {
    const flags: string[] = [];
    const ctx = input.context || ({} as any);
    const d = input.data_scope || {};
    const sensitive = Array.isArray(ctx.is_sensitive_category) && ctx.is_sensitive_category.length > 0;
    if (sensitive) flags.push("sensitive_category");
    if (d.forms) flags.push("forms");
    if (d.credentials_fields) flags.push("credentials_or_financial_fields");
    if (input.processing_location === "cloud") flags.push("cloud_processing");
    if (ctx.trackers_detected) flags.push("trackers_during_ai");
    if (d.clipboard || d.screenshots) flags.push("keystrokes_or_screenshots_or_clipboard");
    if (!input.policy_text_excerpt && (d.forms || d.credentials_fields)) flags.push("no_policy");
    if (typeof ctx.model_download_gb === "number" && ctx.model_download_gb > 1) flags.push("model_large_download");

    // High risk conditions per rubric
    const high = (
        (sensitive && (d.forms || d.credentials_fields || input.processing_location !== "on_device" || ctx.trackers_detected)) ||
        (d.clipboard || d.screenshots) ||
        (!input.policy_text_excerpt && (d.forms || d.credentials_fields))
    );

    if (high) return { risk: "High", flags };

    const pageTextOnly = !!d.page_text && !d.forms && !d.credentials_fields && !d.clipboard && !d.screenshots && !d.camera && !d.microphone;
    if (!sensitive && input.processing_location === "cloud" && pageTextOnly && !ctx.trackers_detected) {
        return { risk: "Medium", flags };
    }

    if (!sensitive && input.processing_location === "on_device" && pageTextOnly && !ctx.trackers_detected) {
        return { risk: "Low", flags };
    }

    return { risk: "Medium", flags };
}

function actionHintFor(risk: "Low" | "Medium" | "High", input: PermissionSummarizationInput): string {
    if (risk === "High") return "Block by default; Allow once only if necessary.";
    if (risk === "Low") return "Allow once ok.";
    return "Ask every time";
}

export function analyzePermissionLocal(input: PermissionSummarizationInput): PermissionSummarizationOutput {
    const header_line = buildHeaderLine(input);
    const { risk, flags } = computeRiskAndFlags(input);

    // Summary one-liner
    const intent = (input.ai_intent || "analyze page").trim();
    const ai = !!input.context?.ai_detected;
    const summary_one_liner = ai
        ? `May use AI to ${intent}.`.slice(0, 120)
        : `No active AI usage detected; read-only analysis.`;

    // Bullets
    const d = input.data_scope || {};
    const dataBits: string[] = [];
    if (d.page_text) dataBits.push("page text");
    if (d.forms) dataBits.push("forms (may include credentials)");
    if (d.credentials_fields && !d.forms) dataBits.push("credentials fields");
    const dataBullet = dataBits.length ? `Data: ${dataBits.join(" and ")}` : "Data: Not available";

    const locBullet = input.processing_location === "on_device" ?
        "Location: on-device processing" :
        input.processing_location === "cloud" ? "Location: cloud processing requested" : "Location: processing location unknown";

    const trackBullet = input.context?.trackers_detected ?
        "Tracking: analytics detected during AI use" : "Tracking: none detected during AI use";

    const bullets = [dataBullet, locBullet, trackBullet];

    return {
        header_line,
        summary_one_liner,
        bullets,
        risk_score: risk,
        red_flags: flags,
        action_hint: actionHintFor(risk, input),
        policy_summary: summarizePolicyLocal(input.policy_text_excerpt)
    };
}
