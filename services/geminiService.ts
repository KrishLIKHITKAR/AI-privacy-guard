import { GoogleGenAI, Type } from "@google/genai";
import type { PermissionSummarizationInput, PermissionSummarizationOutput, PolicyChangeInput, PolicyChangeOutput, PolicySummaryInput, PolicySummaryOutput } from '../types';

const PERMISSION_SUMMARY_SYSTEM_PROMPT = `You are a privacy-first assistant embedded in a Chrome-only browser extension. Your purpose is to explain, in plain English, what AI access a site or extension is attempting; assess risk; and generate guidance that a non-technical user can understand and act on.

Core Principles:
- On-device analysis first. Never assume cloud use. If any field is unknown, say “Not available” and do not guess.
- Plain-English, compact outputs. Avoid technical jargon. Be direct and factual.
- Strict defaults. Banking, Healthcare, Education, Legal, and all Government sites are sensitive. On sensitive sites, the default recommendation is “Block by default; Allow once only if necessary.”
- Explicitly state whether processing is on-device or cloud.
- Always disclose if tracking/analytics are active.
- If no privacy/AI policy is found, set policy_summary to: “No clear privacy/AI policy found. This can be risky.”
- Redact any PII visible in inputs from outputs.

Output Format Discipline:
- Always produce JSON that matches the provided schema.
- header_line: Mandatory, format: “This site uses AI and is accessing: X, Y, Z”. Derive X, Y, Z from data_scope, trackers_detected, processing_location.
- summary_one_liner: <= 18 words.
- bullets: 2–3 short strings focusing on data used, processing location, tracking/analytics.
- risk_score: "Low" | "Medium" | "High".
- action_hint: A short recommendation.
- policy_summary: Summarize policy_text_excerpt if provided, otherwise use the default "no policy" line.

RISK RULES (Strict):
- High risk: Sensitive category AND (forms, cloud processing, or trackers); OR keystroke/screenshot/clipboard access; OR no policy AND forms.
- Medium risk: Non-sensitive site, cloud processing of page text only, no forms, no trackers; OR policy vague.
- Low risk: On-device processing of non-sensitive page text only, no trackers, clear policy, no forms.

TASK: Analyze the following JSON input about an AI permission request and generate a JSON output with your analysis.`;

const POLICY_DIFF_SYSTEM_PROMPT = `You are a privacy-first AI assistant. Your task is to compare two versions of a privacy policy and summarize the key, user-impacting changes in a clear, concise, and non-technical way.

Rules:
- Focus on changes related to: Data collection scope (forms, credentials, screenshots/clipboard), processing location (on-device vs cloud), data sharing/retention, and third-party analytics/tracking.
- Use plain English and avoid legal jargon.
- If no substantive changes are found, return a single bullet point: "No substantive policy changes detected."
- Output a JSON object matching the provided schema.
- Each bullet point in the summary should be a complete sentence.

TASK: Analyze the 'old_policy_excerpt' and 'new_policy_excerpt' in the provided JSON input and generate a JSON output summarizing the changes.`;

const POLICY_SUMMARY_SYSTEM_PROMPT = `You are a privacy-first AI assistant. Your task is to summarize a privacy policy in a clear, concise, and non-technical way for a general audience.

Rules:
- Extract the most critical points about user privacy.
- Focus on: What data is collected (e.g., personal info, usage data, forms), how the data is used (e.g., service improvement, advertising, AI training), if data is shared with third parties, and how long data is kept.
- Use plain English and avoid legal jargon.
- Present the summary as a series of bullet points.
- Output a JSON object matching the provided schema.
- Each bullet point in the summary should be a complete sentence.

TASK: Analyze the 'policy_excerpt' in the provided JSON input and generate a JSON output summarizing its key points.`;


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

const permissionSummaryResponseSchema = {
    type: Type.OBJECT,
    properties: {
        header_line: { type: Type.STRING },
        summary_one_liner: { type: Type.STRING },
        bullets: { type: Type.ARRAY, items: { type: Type.STRING } },
        risk_score: { type: Type.STRING },
        red_flags: { type: Type.ARRAY, items: { type: Type.STRING } },
        action_hint: { type: Type.STRING },
        policy_summary: { type: Type.STRING },
    },
    required: ["header_line", "summary_one_liner", "bullets", "risk_score", "red_flags", "action_hint", "policy_summary"]
};

const policyChangeResponseSchema = {
    type: Type.OBJECT,
    properties: {
        change_summary: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        }
    },
    required: ["change_summary"]
};

const policySummaryResponseSchema = {
    type: Type.OBJECT,
    properties: {
        summary_points: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        }
    },
    required: ["summary_points"]
};


const callGemini = async (model, prompt, systemInstruction, responseSchema) => {
    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.1
            },
        });

        const jsonString = response.text.trim();
        return JSON.parse(jsonString);

    } catch (error) {
        console.error("Error calling Gemini API:", error);
        if (error instanceof Error) {
            throw new Error(`Gemini API Error: ${error.message}`);
        }
        throw new Error("An unknown error occurred while communicating with the Gemini API.");
    }
}


export const summarizePermissionRequest = async (
  input: PermissionSummarizationInput
): Promise<PermissionSummarizationOutput> => {
  const model = 'gemini-2.5-flash';
  const prompt = `Please analyze this permission request:\n\n${JSON.stringify(input, null, 2)}`;
  
  const result = await callGemini(model, prompt, PERMISSION_SUMMARY_SYSTEM_PROMPT, permissionSummaryResponseSchema);
  
  // Basic validation
  if (!result.header_line || !result.risk_score) {
    throw new Error("Invalid JSON structure received from API.");
  }

  return result as PermissionSummarizationOutput;
};

export const summarizePolicyChange = async (
    input: PolicyChangeInput
): Promise<PolicyChangeOutput> => {
    const model = 'gemini-2.5-flash';
    const prompt = `Please analyze the following policy changes:\n\n${JSON.stringify(input, null, 2)}`;
    
    const result = await callGemini(model, prompt, POLICY_DIFF_SYSTEM_PROMPT, policyChangeResponseSchema);

    // Basic validation
    if (!result.change_summary || !Array.isArray(result.change_summary)) {
        throw new Error("Invalid JSON structure received from API for policy change.");
    }

    return result as PolicyChangeOutput;
};

export const summarizePolicy = async (
    input: PolicySummaryInput
): Promise<PolicySummaryOutput> => {
    const model = 'gemini-2.5-flash';
    const prompt = `Please summarize the following policy:\n\n${JSON.stringify(input, null, 2)}`;
    
    const result = await callGemini(model, prompt, POLICY_SUMMARY_SYSTEM_PROMPT, policySummaryResponseSchema);

    // Basic validation
    if (!result.summary_points || !Array.isArray(result.summary_points)) {
        throw new Error("Invalid JSON structure received from API for policy summary.");
    }

    return result as PolicySummaryOutput;
}