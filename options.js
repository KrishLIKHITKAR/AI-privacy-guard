(function () {
    const $ = (id) => document.getElementById(id);

    function load() {
        chrome.storage.local.get(['GEMINI_API_KEY', 'cloudEnabled', 'allowMinutes', 'retentionDays', 'sensitiveDefault'], (res) => {
            if (res && res.GEMINI_API_KEY) {
                $('apiKey').value = res.GEMINI_API_KEY;
            }
            $('cloudEnabled').checked = !!res.cloudEnabled;
            if (typeof res.allowMinutes === 'number') $('allowMinutes').value = String(res.allowMinutes);
            if (typeof res.retentionDays === 'number') $('retentionDays').value = String(res.retentionDays);
            if (typeof res.sensitiveDefault === 'string') $('sensitiveDefault').value = res.sensitiveDefault;
        });
    }

    function setStatus(kind, text, ttl = 2000) {
        const status = $('status');
        status.textContent = '';
        const el = document.createElement('span');
        el.className = kind === 'ok' ? 'ok' : kind === 'err' ? 'err' : '';
        el.textContent = text;
        status.appendChild(el);
        setTimeout(() => (status.textContent = ''), ttl);
    }

    function save() {
        const key = $('apiKey').value.trim();
        const cloudEnabled = $('cloudEnabled').checked;
        const allowMinutes = Math.max(1, Math.min(120, Number($('allowMinutes').value || 5)));
        const retentionDays = Math.max(1, Math.min(30, Number($('retentionDays').value || 7)));
        const sensitiveDefault = $('sensitiveDefault').value === 'ask' ? 'ask' : 'block';
        chrome.storage.local.set({ GEMINI_API_KEY: key, cloudEnabled, allowMinutes, retentionDays, sensitiveDefault }, () => setStatus('ok', 'Saved'));
    }

    function test() {
        const status = $('status');
        status.textContent = 'Testing…';
        chrome.runtime.sendMessage({ type: 'TEST_GEMINI_KEY' }, (res) => {
            if (res && res.success) setStatus('ok', 'Key works', 2500);
            else setStatus('err', 'Invalid key', 2500);
        });
    }

    function exportLogs() {
        const status = $('status');
        status.textContent = 'Exporting…';
        chrome.runtime.sendMessage({ type: 'EXPORT_LOGS' }, (res) => {
            if (!res || !res.success) return setStatus('err', 'Export failed', 2500);
            const blob = new Blob([JSON.stringify(res.data || [], null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = `ai-privacy-logs-${Date.now()}.json`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
            setStatus('ok', 'Logs exported', 2500);
        });
    }

    function clearLogs() {
        const status = $('status');
        status.textContent = 'Clearing…';
        chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' }, (res) => {
            if (res && res.success) setStatus('ok', 'Logs cleared', 2500);
            else setStatus('err', 'Failed to clear', 2500);
        });
    }
    function backToPopup() {
        try {
            // Try to close this tab and open the extension popup by focusing the browserAction
            chrome.tabs.getCurrent((tab) => {
                if (tab && tab.id) chrome.tabs.remove(tab.id);
            });
        } catch { }
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('save').addEventListener('click', save);
        const t = $('test'); if (t) t.addEventListener('click', test);
        const ex = $('export'); if (ex) ex.addEventListener('click', exportLogs);
        const cl = $('clear'); if (cl) cl.addEventListener('click', clearLogs);
        const bk = $('back'); if (bk) bk.addEventListener('click', backToPopup);
        load();
    });
})();
