#!/usr/bin/env node
// Minimal Ollama chat utility. Streams a single prompt to a local Ollama model and prints the response.
// Usage:
//   npm run tool:ollama -- --model llama3.2:3b --prompt "Hello"

import https from 'node:https';
import http from 'node:http';

// Parse args
const args = process.argv.slice(2);
function getArg(name, def) {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 ? args[idx + 1] : def;
}
const model = getArg('model', 'llama3.2:3b');
const prompt = getArg('prompt', 'Hello');
const host = process.env.OLLAMA_HOST || '127.0.0.1:11434';

const isHttps = host.startsWith('https://');
const base = host.replace(/^https?:\/\//, '');

const client = isHttps ? https : http;

const req = client.request({
    host: base.split(':')[0],
    port: base.split(':')[1] || (isHttps ? 443 : 80),
    method: 'POST',
    path: '/api/generate',
    headers: { 'Content-Type': 'application/json' }
}, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk) => process.stdout.write(chunk));
});

req.on('error', (e) => {
    console.error('Ollama error:', e.message);
    process.exit(2);
});

req.end(JSON.stringify({ model, prompt, stream: true }));
