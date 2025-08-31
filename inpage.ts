// inpage.ts - injected into the page context to wrap fetch/XHR and ask the extension to sanitize text bodies
(() => {
    try {
        if ((window as any).__aipgInpagePatched) return;
        (window as any).__aipgInpagePatched = true;

        // Reliable page<->content bridge using window.postMessage
        const NS = 'aipg';
        let reqId = 0;
        const pending = new Map<number, (v: any) => void>();

        window.addEventListener('message', (e: MessageEvent) => {
            try {
                if (e.source !== window) return; // only same page
                const data: any = (e as any).data;
                if (!data || data.ns !== NS || data.type !== 'SANITIZE_PRE_RESP') return;
                const cb = pending.get(data.id);
                if (cb) { pending.delete(data.id); cb(data); }
            } catch { }
        });

        async function sanitizeOutbound(url: string, body: any) {
            return new Promise<any>((resolve) => {
                try {
                    const id = ++reqId;
                    pending.set(id, resolve);
                    const payload = { ns: NS, id, type: 'SANITIZE_PRE_REQ', url, body };
                    window.postMessage(payload, '*');
                } catch { resolve({ ok: false }); }
            });
        }

        // Helper to extract details and rebuild init if needed
        async function maybeSanitizeFetch(input: RequestInfo | URL, init?: RequestInit) {
            let url = '';
            let method = 'GET';
            let body: any = undefined;
            let carry: Partial<RequestInit> | undefined = undefined;
            try {
                if (typeof input === 'string' || input instanceof URL) {
                    url = String(input);
                    method = ((init && init.method) || 'GET').toUpperCase();
                    if (init && ('body' in init)) body = (init as any).body;
                } else if (typeof Request !== 'undefined' && input instanceof Request) {
                    url = (input as any).url || '';
                    method = ((init && init.method) || (input as any).method || 'GET').toUpperCase();
                    if (init && ('body' in init)) body = (init as any).body;
                    else {
                        // Attempt to read body from Request clone (text/json)
                        try { body = await (input as any).clone().text(); } catch { body = undefined; }
                    }
                    // Preserve common attributes from original Request when we rebuild
                    try {
                        const hdrs: any = {};
                        (input as any).headers && (input as any).headers.forEach && (input as any).headers.forEach((v: string, k: string) => { hdrs[k] = v; });
                        carry = {
                            method,
                            headers: hdrs,
                            credentials: (input as any).credentials,
                            mode: (input as any).mode,
                            cache: (input as any).cache,
                            redirect: (input as any).redirect,
                            referrer: (input as any).referrer,
                            referrerPolicy: (input as any).referrerPolicy,
                            integrity: (input as any).integrity,
                            keepalive: (input as any).keepalive,
                            signal: (input as any).signal
                        } as Partial<RequestInit>;
                    } catch { }
                } else {
                    url = String((input as any) || '');
                }
            } catch { }

            // Only sanitize POST with string/JSON bodies (also support URLSearchParams/FormData best-effort)
            let newInit: RequestInit | undefined = init ? { ...init } : (carry ? { ...carry } as RequestInit : undefined);
            try {
                if (method === 'POST' && (typeof body === 'string' || typeof body === 'object')) {
                    let sendBody: any = body;
                    let restore: 'string' | 'json' | 'form' | 'search' = typeof body === 'string' ? 'string' : 'json';
                    try {
                        if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
                            sendBody = body.toString(); restore = 'search';
                        } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
                            const obj: any = {}; body.forEach((v: any, k: string) => { obj[k] = typeof v === 'string' ? v : '[file]'; });
                            sendBody = obj; restore = 'form';
                        }
                    } catch { }
                    const res = await sanitizeOutbound(url, sendBody);
                    if (res && res.ok && res.body !== undefined) {
                        let newBody: any;
                        if (restore === 'search') newBody = String(res.body);
                        else if (restore === 'form') newBody = new URLSearchParams((typeof res.body === 'object') ? res.body : {});
                        else newBody = (typeof res.body === 'object') ? JSON.stringify(res.body) : String(res.body);
                        newInit = { ...(newInit || {}), body: newBody };
                        // When original was Request with no init, switch to (url, init) call
                        return { input: url, init: newInit };
                    }
                }
            } catch { }
            return { input, init };
        }

        // Patch fetch
        const origFetch = window.fetch;
        if (typeof origFetch === 'function') {
            window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
                try {
                    const patched = await maybeSanitizeFetch(input, init);
                    return (origFetch as any).apply(this, [patched.input, patched.init]);
                } catch {
                    return (origFetch as any).apply(this, [input, init]);
                }
            } as any;
        }

        // Patch XHR send (string bodies)
        if ((window as any).XMLHttpRequest) {
            const X = (window as any).XMLHttpRequest;
            const origOpen = X.prototype.open;
            const origSend = X.prototype.send;
            X.prototype.open = function (method: string, url: string) {
                (this as any).__aipgMethod = String(method || 'GET').toUpperCase();
                (this as any).__aipgUrl = String(url || '');
                return origOpen.apply(this, arguments as any);
            } as any;
            X.prototype.send = function (body?: Document | BodyInit | null) {
                try {
                    const m = (this as any).__aipgMethod;
                    const u = (this as any).__aipgUrl || '';
                    if (m === 'POST' && typeof body === 'string') {
                        // Only string bodies here; binary untouched
                        return sanitizeOutbound(u, body).then((res: any) => {
                            const b = (res && res.ok && res.body !== undefined) ? (typeof res.body === 'object' ? JSON.stringify(res.body) : String(res.body)) : body as any;
                            return origSend.apply(this, [b]);
                        });
                    }
                } catch { }
                return origSend.apply(this, arguments as any);
            } as any;
        }

        // Patch WebSocket.send for text/JSON payloads
        try {
            const W = (window as any).WebSocket;
            if (W && W.prototype && !W.prototype.__aipgPatched) {
                const origSend = W.prototype.send;
                W.prototype.__aipgPatched = true;
                W.prototype.send = function (data: any) {
                    try {
                        if (typeof data === 'string') {
                            // Best-effort sanitize
                            return sanitizeOutbound((this as any)?.url || 'ws', data).then((res: any) => {
                                const out = (res && res.ok && res.body !== undefined) ? String(res.body) : data;
                                return origSend.apply(this, [out]);
                            });
                        }
                    } catch { }
                    return origSend.apply(this, arguments as any);
                } as any;
            }
        } catch { }
    } catch { }
})();
