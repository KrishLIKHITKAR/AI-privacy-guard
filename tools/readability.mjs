#!/usr/bin/env node
// Extract main article text from a URL using Mozilla Readability.
// Usage:
//   npm run tool:readability -- <url>

import { JSDOM } from 'jsdom';
import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { Readability } from '@mozilla/readability';

const urlArg = process.argv.slice(2)[0];
if (!urlArg) {
    console.error('Usage: npm run tool:readability -- <url>');
    process.exit(1);
}

function fetchText(u) {
    return new Promise((resolve, reject) => {
        const url = new URL(u);
        const client = url.protocol === 'https:' ? https : http;
        const req = client.request(url, { headers: { 'User-Agent': 'AI-privacy-guard/1.0' } }, (res) => {
            const chunks = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.end();
    });
}

try {
    const html = await fetchText(urlArg);
    const dom = new JSDOM(html, { url: urlArg });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    if (!article) {
        console.error('Readability could not parse this page.');
        process.exit(2);
    }
    process.stdout.write(JSON.stringify({ url: urlArg, title: article.title, byline: article.byline, content: article.textContent }, null, 2));
} catch (e) {
    console.error('Readability error:', e.message);
    process.exit(3);
}
