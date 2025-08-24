#!/usr/bin/env node
// Minimal HTTP(S) fetcher: prints status, headers (JSON), and body to stdout.
// Usage:
//   npm run tool:fetch -- <url>

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

const urlArg = process.argv.slice(2)[0];
if (!urlArg) {
    console.error('Usage: npm run tool:fetch -- <url>');
    process.exit(1);
}

const u = new URL(urlArg);
const client = u.protocol === 'https:' ? https : http;

const req = client.request(u, { method: 'GET', headers: { 'User-Agent': 'AI-privacy-guard/1.0' } }, (res) => {
    const chunks = [];
    res.on('data', (d) => chunks.push(d));
    res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const headers = Object.fromEntries(Object.entries(res.headers));
        const out = {
            url: urlArg,
            status: res.statusCode,
            headers,
            body
        };
        process.stdout.write(JSON.stringify(out, null, 2));
    });
});
req.on('error', (e) => {
    console.error('Fetch error:', e.message);
    process.exit(2);
});
req.end();
