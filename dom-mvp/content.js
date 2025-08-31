/**
Acceptance tests:
1) Type: "my email is alex@gmail.com and my phone is 9876543210"
   → Modal appears in ≤300ms with preview: "my email is [EMAIL:gmail.com] and my phone is [PHONE:****3210]"
2) [Send Redacted] → submits masked payload (verify DevTools → Network).
3) [Send Raw] → submits unmodified payload.
4) Typing noise without PII → no modal.

Notes:
- DOM-only; no background/storage/telemetry. DEBUG logs disabled by default.
- Composer detection: textarea#prompt-textarea, textarea[data-testid="prompt-textarea"], then main div[contenteditable="true"].
- Shadow DOM safe queryDeep + MutationObserver rebinding.
*/

(() => {
    const DEBUG = false;
    const MODAL_ROOT_ID = "aipg-modal-root";
    const CSS_URL = chrome.runtime.getURL("modal.css");
    const DEBOUNCE_MS = 200;

    /** Utils */
    const log = (...args) => { if (DEBUG) console.warn("[AIPG]", ...args); };
    const safe = (fn) => (...a) => { try { return fn(...a); } catch (e) { log(e); } };

    // Debounce
    function debounce(fn, wait) {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), wait);
        };
    }

    // queryDeep: recursively search across shadow roots
    function queryDeep(selectors) {
        const roots = [document];
        const seen = new Set();

        function collect(root) {
            if (!root || seen.has(root)) return;
            seen.add(root);
            try {
                root.querySelectorAll("*").forEach(el => {
                    if (el && el.shadowRoot) collect(el.shadowRoot);
                });
            } catch (_) { /* no-op */ }
        }

        collect(document);

        for (const sel of selectors) {
            for (const root of seen) {
                try {
                    const found = root.querySelector(sel);
                    if (found) return found;
                } catch (_) { /* invalid selector? skip */ }
            }
        }
        return null;
    }

    function getComposer() {
        const selectors = [
            "textarea#prompt-textarea",
            'textarea[data-testid="prompt-textarea"]',
            "main div[contenteditable='true']"
        ];
        return queryDeep(selectors);
    }

    // Simple Enter dispatcher with guard
    function dispatchEnter(el) {
        const evOpts = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
        el.dispatchEvent(new KeyboardEvent("keydown", evOpts));
        el.dispatchEvent(new KeyboardEvent("keyup", evOpts));
    }

    // Text get/set for textarea/contenteditable
    function getText(el) {
        if (!el) return "";
        if (el.tagName === "TEXTAREA") return el.value || "";
        if (el.isContentEditable) return el.innerText || "";
        return "";
    }
    function setText(el, text) {
        if (!el) return;
        if (el.tagName === "TEXTAREA") el.value = text;
        else if (el.isContentEditable) el.innerText = text;
        el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    /** PII detection and masking */
    const EMAIL_RE = /([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    const APIKEY_RE = /(?<!\[APIKEY:)([A-Za-z0-9_\-]{20,})/g;
    // Flexible digits with separators for phone/card
    const FLEX_DIGITS_RE = /(?<!\d)(?:\+?\d[\s\-().]?){10,}(?!\d)/g; // refine via length checks
    const FLEX_CARD_RE = /(?<!\d)(?:\d[\s\-]?){12,19}(?!\d)/g;

    function luhnValid(digits) {
        let sum = 0, dbl = false;
        for (let i = digits.length - 1; i >= 0; i--) {
            let n = parseInt(digits[i], 10);
            if (dbl) { n *= 2; if (n > 9) n -= 9; }
            sum += n; dbl = !dbl;
        }
        return sum % 10 === 0;
    }

    function quickHit(text) {
        if (!text) return false;
        if (/@.+\./.test(text)) return true;
        const digits = (text.match(/\d/g) || []).length;
        if (digits >= 10) return true;
        if (/[A-Za-z0-9_\-]{20,}/.test(text)) return true;
        return false;
    }

    function maskPII(text) {
        let out = text;
        const counts = { EMAIL: 0, PHONE: 0, CARD: 0, APIKEY: 0 };

        const alreadyMasked = /\[(EMAIL|PHONE|CARD|APIKEY):/;

        // Emails
        out = out.replace(EMAIL_RE, (m, _local, domain) => {
            if (m.startsWith("[EMAIL:")) return m;
            counts.EMAIL++;
            return `[EMAIL:${domain}]`;
        });

        // Credit cards (validate Luhn)
        out = out.replace(FLEX_CARD_RE, (m) => {
            if (alreadyMasked.test(m)) return m;
            const digitsOnly = m.replace(/\D+/g, "");
            if (digitsOnly.length < 12 || digitsOnly.length > 19) return m;
            if (!luhnValid(digitsOnly)) return m;
            counts.CARD++;
            const last4 = digitsOnly.slice(-4);
            return `[CARD:**** **** **** ${last4}]`;
        });

        // Phones (10–15 digits). Skip if it looks like a valid card (already handled)
        out = out.replace(FLEX_DIGITS_RE, (m) => {
            if (alreadyMasked.test(m)) return m;
            const digitsOnly = m.replace(/\D+/g, "");
            if (digitsOnly.length < 10 || digitsOnly.length > 15) return m;
            if (digitsOnly.length >= 12 && digitsOnly.length <= 19 && luhnValid(digitsOnly)) return m;
            counts.PHONE++;
            const last4 = digitsOnly.slice(-4);
            return `[PHONE:****${last4}]`;
        });

        // API keys: require at least one letter and one digit, and some entropy
        out = out.replace(APIKEY_RE, (m, token) => {
            if (m.startsWith("[APIKEY:")) return m;
            if (!/[A-Za-z]/.test(token) || !/\d/.test(token)) return m;
            if ([...new Set(token.split(""))].length < 6) return m;
            counts.APIKEY++;
            return `[APIKEY:${token.slice(0, 4)}…${token.slice(-4)}]`;
        });

        return { redacted: out, counts };
    }

    /** Modal */
    let modalState = { open: false, root: null, shadow: null, cssText: null, focusTrapHandler: null };

    async function ensureModalRoot() {
        if (modalState.root && modalState.shadow) return modalState;
        const root = document.getElementById(MODAL_ROOT_ID) || document.createElement("div");
        root.id = MODAL_ROOT_ID;
        Object.assign(root.style, { all: "initial" });
        document.documentElement.appendChild(root);
        const shadow = root.shadowRoot || root.attachShadow({ mode: "open" });

        // Load CSS once
        if (!modalState.cssText) {
            try {
                const resp = await fetch(CSS_URL);
                modalState.cssText = await resp.text();
            } catch (e) {
                log("Failed to load CSS", e);
                modalState.cssText = "";
            }
        }
        // Clear and inject style + container
        shadow.innerHTML = "";
        const style = document.createElement("style");
        style.textContent = modalState.cssText || "";
        shadow.appendChild(style);

        const container = document.createElement("div");
        container.className = "aipg-modal-container";
        container.innerHTML = `
      <div class="aipg-backdrop" part="backdrop"></div>
      <div class="aipg-dialog" role="dialog" aria-modal="true" aria-labelledby="aipg-title">
        <div class="aipg-header">
          <div class="aipg-icon" aria-hidden="true">⚠️</div>
          <h2 id="aipg-title">You are sharing personal information</h2>
        </div>
        <div class="aipg-body">
          <p class="aipg-subtle">Review and send the redacted version below. The raw text will not be shown.</p>
          <textarea class="aipg-preview" readonly></textarea>
          <div class="aipg-counts" aria-live="polite"></div>
        </div>
        <div class="aipg-actions">
          <button class="aipg-btn aipg-redacted" data-action="redacted">Send Redacted</button>
          <button class="aipg-btn aipg-raw" data-action="raw">Send Raw</button>
          <button class="aipg-btn aipg-cancel" data-action="cancel">Cancel</button>
        </div>
      </div>
    `;
        shadow.appendChild(container);

        modalState.root = root;
        modalState.shadow = shadow;
        return modalState;
    }

    function trapFocus(shadowHost) {
        const onKey = (e) => {
            if (e.key === "Escape") closeModal();
            if (e.key !== "Tab") return;
            const focusables = shadowHost.querySelectorAll(
                'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
            );
            const list = Array.from(focusables).filter(el => !el.hasAttribute("disabled"));
            if (list.length === 0) return;
            const current = shadowHost.activeElement;
            const i = list.indexOf(current);
            let next;
            if (e.shiftKey) {
                next = list[(i <= 0 ? list.length : i) - 1];
            } else {
                next = list[(i + 1) % list.length];
            }
            e.preventDefault();
            next.focus();
        };
        modalState.focusTrapHandler = onKey;
        shadowHost.addEventListener("keydown", onKey, true);
    }

    function untrapFocus(shadowHost) {
        if (modalState.focusTrapHandler) {
            shadowHost.removeEventListener("keydown", modalState.focusTrapHandler, true);
            modalState.focusTrapHandler = null;
        }
    }

    function closeModal() {
        if (!modalState.open || !modalState.shadow) return;
        const container = modalState.shadow.querySelector(".aipg-modal-container");
        if (container) container.remove();
        untrapFocus(modalState.shadow);
        modalState.open = false;
    }

    async function showModal({ redacted, counts, onRedacted, onRaw }) {
        await ensureModalRoot();
        const shadow = modalState.shadow;
        const container = shadow.querySelector(".aipg-modal-container");
        if (!container) return;
        modalState.open = true;

        // Bind content
        const preview = shadow.querySelector(".aipg-preview");
        const countsEl = shadow.querySelector(".aipg-counts");
        preview.value = redacted;
        countsEl.textContent = `{ EMAIL: ${counts.EMAIL}, PHONE: ${counts.PHONE}, CARD: ${counts.CARD}, APIKEY: ${counts.APIKEY} }`;

        // Backdrop/escape
        shadow.querySelector(".aipg-backdrop").addEventListener("click", safe(() => closeModal()));
        trapFocus(shadow);

        // Buttons
        shadow.querySelectorAll(".aipg-btn").forEach(btn => {
            btn.onclick = safe(() => {
                const action = btn.getAttribute("data-action");
                if (action === "redacted") onRedacted?.();
                else if (action === "raw") onRaw?.();
                closeModal();
            });
        });

        // Focus first button
        const firstBtn = shadow.querySelector(".aipg-btn");
        firstBtn && firstBtn.focus();
    }

    /** Bindings */
    const bound = new WeakSet();
    let lastPIISeen = false;

    function bindComposer(el) {
        if (!el || bound.has(el)) return;
        bound.add(el);

        // Loop guard for synthetic send
        el.__aipgGuard = false;

        const scan = safe(() => {
            const text = getText(el);
            if (!quickHit(text)) { lastPIISeen = false; return; }
            const { redacted, counts } = maskPII(text);
            const any = counts.EMAIL + counts.PHONE + counts.CARD + counts.APIKEY;
            lastPIISeen = any > 0;
            if (!lastPIISeen) return;

            if (!modalState.open) {
                showModal({
                    redacted, counts,
                    onRedacted: () => {
                        el.__aipgGuard = true;
                        setText(el, redacted);
                        dispatchEnter(el);
                        setTimeout(() => { el.__aipgGuard = false; }, 500);
                    },
                    onRaw: () => {
                        el.__aipgGuard = true;
                        dispatchEnter(el);
                        setTimeout(() => { el.__aipgGuard = false; }, 500);
                    }
                });
            }
        });
        const debouncedScan = debounce(scan, DEBOUNCE_MS);

        const onInput = safe(() => debouncedScan());
        const onPaste = safe(() => debouncedScan());
        const onBlur = safe(() => debouncedScan());

        const onKeyDown = safe((e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                if (el.__aipgGuard) return;
                const text = getText(el);
                if (!quickHit(text)) return;
                const { redacted, counts } = maskPII(text);
                const any = counts.EMAIL + counts.PHONE + counts.CARD + counts.APIKEY;
                if (any > 0) {
                    e.preventDefault();
                    e.stopPropagation();
                    showModal({
                        redacted, counts,
                        onRedacted: () => {
                            el.__aipgGuard = true;
                            setText(el, redacted);
                            dispatchEnter(el);
                            setTimeout(() => { el.__aipgGuard = false; }, 500);
                        },
                        onRaw: () => {
                            el.__aipgGuard = true;
                            dispatchEnter(el);
                            setTimeout(() => { el.__aipgGuard = false; }, 500);
                        }
                    });
                }
            }
        });

        const onKeyUp = safe((e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                if (el.__aipgGuard) return;
                if (lastPIISeen && !modalState.open) {
                    e.preventDefault();
                    e.stopPropagation();
                    const { redacted, counts } = maskPII(getText(el));
                    showModal({
                        redacted, counts,
                        onRedacted: () => {
                            el.__aipgGuard = true;
                            setText(el, redacted);
                            dispatchEnter(el);
                            setTimeout(() => { el.__aipgGuard = false; }, 500);
                        },
                        onRaw: () => {
                            el.__aipgGuard = true;
                            dispatchEnter(el);
                            setTimeout(() => { el.__aipgGuard = false; }, 500);
                        }
                    });
                }
            }
        });

        el.addEventListener("input", onInput, true);
        el.addEventListener("paste", onPaste, true);
        el.addEventListener("blur", onBlur, true);
        el.addEventListener("keydown", onKeyDown, true);
        el.addEventListener("keyup", onKeyUp, true);
    }

    const rebind = safe(() => {
        const el = getComposer();
        if (el) bindComposer(el);
    });

    // Observe re-renders
    const observer = new MutationObserver(() => rebind());
    safe(() => observer.observe(document.documentElement, { childList: true, subtree: true }));

    // Initial bind
    rebind();
})();
