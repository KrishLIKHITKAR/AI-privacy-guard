declare const chrome: any;

import type {
    PermissionSummarizationInput,
    PermissionSummarizationOutput,
    PolicyChangeInput,
    PolicyChangeOutput,
    PolicySummaryInput,
    PolicySummaryOutput,
} from "../types";

// Generic helper to call Gemini via background.js
async function callGemini(
    model: string,
    prompt: string,
    systemInstruction: string,
    responseSchema: any,
    meta?: { siteUrl?: string; isSensitive?: boolean }
): Promise<any> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            {
                type: "CALL_GEMINI",
                model,
                prompt,
                systemInstruction,
                responseSchema,
                site_url: meta?.siteUrl,
                is_sensitive: meta?.isSensitive === true,
            },
            (response) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (!response.success) {
                    reject(new Error(response.error));
                } else {
                    resolve(response.data);
                }
            }
        );
    });
}

const PERMISSION_SUMMARY_SYSTEM_PROMPT = `You are a privacy-first assistant embedded in a Chrome-only browser extension. Your purpose is to explain, in plain English, what AI access a site or extension is attempting; assess risk; and generate guidance that a non-technical user can understand and act on.\n\nCore Principles:\n- On-device analysis first. Never assume cloud use. If any field is unknown, say “Not available” and do not guess.\n- Plain-English, compact outputs. Avoid technical jargon. Be direct and factual.\n- Strict defaults. Banking, Healthcare, Education, Legal, and all Government sites are sensitive. On sensitive sites, the default recommendation is “Block by default; Allow once only if necessary.”\n- Explicitly state whether processing is on-device or cloud.\n- Always disclose if tracking/analytics are active.\n- If no privacy/AI policy is found, set policy_summary to: “No clear privacy/AI policy found. This can be risky.”\n- Redact any PII visible in inputs from outputs.\n\nOutput Format Discipline:\n- Always produce JSON that matches the provided schema.\n- header_line: Mandatory, format: “This site uses AI and is accessing: X, Y, Z”. Derive X, Y, Z from data_scope, trackers_detected, processing_location.\n- summary_one_liner: <= 18 words.\n- bullets: 2–3 short strings focusing on data used, processing location, tracking/analytics.\n- risk_score: \"Low\" | \"Medium\" | \"High\".\n- action_hint: A short recommendation.\n- policy_summary: Summarize policy_text_excerpt if provided, otherwise use the default \"no policy\" line.\n\nRISK RULES (Strict):\n- High risk: Sensitive category AND (forms, cloud processing, or trackers); OR keystroke/screenshot/clipboard access; OR no policy AND forms.\n- Medium risk: Non-sensitive site, cloud processing of page text only, no forms, no trackers; OR policy vague.\n- Low risk: On-device processing of non-sensitive page text only, no trackers, clear policy, no forms.\n\nTASK: Analyze the following JSON input about an AI permission request and generate a JSON output with your analysis.`;
const POLICY_DIFF_SYSTEM_PROMPT = `You are a privacy-first AI assistant. Your task is to compare two versions of a privacy policy and summarize the key, user-impacting changes in a clear, concise, and non-technical way.\n\nRules:\n- Focus on changes related to: Data collection scope (forms, credentials, screenshots/clipboard), processing location (on-device vs cloud), data sharing/retention, and third-party analytics/tracking.\n- Use plain English and avoid legal jargon.\n- If no substantive changes are found, return a single bullet point: \"No substantive policy changes detected.\".\n- Output a JSON object matching the provided schema.\n- Each bullet point in the summary should be a complete sentence.\n\nTASK: Analyze the 'old_policy_excerpt' and 'new_policy_excerpt' in the provided JSON input and generate a JSON output summarizing the changes.`;
const POLICY_SUMMARY_SYSTEM_PROMPT = `You are a privacy-first AI assistant. Your task is to summarize a privacy policy in a clear, concise, and non-technical way for a general audience.\n\nRules:\n- Extract the most critical points about user privacy.\n- Focus on: What data is collected (e.g., personal info, usage data, forms), how the data is used (e.g., service improvement, advertising, AI training), if data is shared with third parties, and how long data is kept.\n- Use plain English and avoid legal jargon.\n- Present the summary as a series of bullet points.\n- Output a JSON object matching the provided schema.\n- Each bullet point in the summary should be a complete sentence.\n\nTASK: Analyze the 'policy_excerpt' in the provided JSON input and generate a JSON output summarizing its key points.`;

// Keep your JSON schemas exactly as you had them
const permissionSummaryResponseSchema = {
    type: "OBJECT",
    properties: {
        header_line: { type: "STRING" },
        summary_one_liner: { type: "STRING" },
        bullets: { type: "ARRAY", items: { type: "STRING" } },
        risk_score: { type: "STRING" },
        red_flags: { type: "ARRAY", items: { type: "STRING" } },
        action_hint: { type: "STRING" },
        policy_summary: { type: "STRING" },
    },
    required: ["header_line", "summary_one_liner", "bullets", "risk_score", "red_flags", "action_hint", "policy_summary"]
};
const policyChangeResponseSchema = {
    type: "OBJECT",
    properties: {
        change_summary: {
            type: "ARRAY",
            items: { type: "STRING" }
        }
    },
    required: ["change_summary"]
};
const policySummaryResponseSchema = {
    type: "OBJECT",
    properties: {
        summary_points: {
            type: "ARRAY",
            items: { type: "STRING" }
        }
    },
    required: ["summary_points"]
};

// ----- PUBLIC FUNCTIONS -----

export async function summarizePermissionRequest(
    input: PermissionSummarizationInput
): Promise<PermissionSummarizationOutput> {
    const model = "gemini-2.5-flash";
    const prompt = `Please analyze this permission request:\n\n${JSON.stringify(
        input,
        null,
        2
    )}`;

    const result = await callGemini(
        model,
        prompt,
        PERMISSION_SUMMARY_SYSTEM_PROMPT,
        permissionSummaryResponseSchema,
        { siteUrl: input.site_url, isSensitive: Array.isArray(input.context?.is_sensitive_category) && input.context.is_sensitive_category.length > 0 }
    );

    if (!result.header_line || !result.risk_score) {
        throw new Error("Invalid JSON structure received from API.");
    }

    return result as PermissionSummarizationOutput;
}

export async function summarizePolicyChange(
    input: PolicyChangeInput
): Promise<PolicyChangeOutput> {
    const model = "gemini-2.5-flash";
    const prompt = `Please analyze the following policy changes:\n\n${JSON.stringify(
        input,
        null,
        2
    )}`;

    const result = await callGemini(
        model,
        prompt,
        POLICY_DIFF_SYSTEM_PROMPT,
        policyChangeResponseSchema
    );

    if (!result.change_summary || !Array.isArray(result.change_summary)) {
        throw new Error(
            "Invalid JSON structure received from API for policy change."
        );
    }

    return result as PolicyChangeOutput;
}

export async function summarizePolicy(
    input: PolicySummaryInput
): Promise<PolicySummaryOutput> {
    const model = "gemini-2.5-flash";
    const prompt = `Please summarize the following policy:\n\n${JSON.stringify(
        input,
        null,
        2
    )}`;

    const result = await callGemini(
        model,
        prompt,
        POLICY_SUMMARY_SYSTEM_PROMPT,
        policySummaryResponseSchema
    );

    if (!result.summary_points || !Array.isArray(result.summary_points)) {
        throw new Error(
            "Invalid JSON structure received from API for policy summary."
        );
    }

    return result as PolicySummaryOutput;
}