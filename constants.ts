import type { PermissionSummarizationInput } from './types';

export const HIGH_RISK_SCENARIO: PermissionSummarizationInput = {
  site_url: 'https://example-bank.com/login',
  context: {
    is_sensitive_category: ['banking'],
    incognito: false,
    trackers_detected: true,
    model_download_gb: null,
  },
  ai_intent: 'analyze forms for auto-fill',
  data_scope: {
    page_text: true,
    forms: true,
    credentials_fields: true,
  },
  processing_location: 'cloud',
  policy_text_excerpt: 'To improve our services, we may analyze form data using third-party AI partners. This data may be retained for up to 90 days for quality assurance. We may share anonymized data with analytics providers.',
  change_diff: null,
};

export const MEDIUM_RISK_SCENARIO: PermissionSummarizationInput = {
  site_url: 'https://news-aggregator.com/article/123',
  context: {
    is_sensitive_category: [],
    incognito: false,
    trackers_detected: false,
    model_download_gb: null,
  },
  ai_intent: 'summarize page text',
  data_scope: {
    page_text: true,
  },
  processing_location: 'cloud',
  policy_text_excerpt: 'Our AI features are powered by cloud services. We process content to generate summaries. User data handling is subject to the terms of our service providers.',
  change_diff: null,
};

export const LOW_RISK_SCENARIO: PermissionSummarizationInput = {
  site_url: 'https://tech-blog.dev/post/on-device-ai',
  context: {
    is_sensitive_category: [],
    incognito: true,
    trackers_detected: false,
    model_download_gb: 0.5,
  },
  ai_intent: 'translate page text',
  data_scope: {
    page_text: true,
  },
  processing_location: 'on_device',
  policy_text_excerpt: 'All AI-powered translation happens directly in your browser. No page data ever leaves your device. We do not use trackers during this process.',
  change_diff: null,
};

export const SCENARIOS = [
  { label: 'High Risk: Banking Site', value: HIGH_RISK_SCENARIO },
  { label: 'Medium Risk: News Site', value: MEDIUM_RISK_SCENARIO },
  { label: 'Low Risk: Tech Blog', value: LOW_RISK_SCENARIO },
];

export const PREVIOUS_POLICY_TEXT = `User data is processed to provide core service functionality. We may share usage statistics with partners. Data is retained for 12 months.`;

export const CURRENT_POLICY_TEXT = `To enhance our AI features, user data, including form inputs and page content, is processed by our cloud partners. This may include third-party analytics services. Data is now retained for 24 months for model training. We have also added clipboard and screenshot analysis capabilities.`;