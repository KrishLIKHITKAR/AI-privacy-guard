(function () {
    const $ = (id) => document.getElementById(id);

    function load() {
        chrome.storage.local.get(['allowMinutes', 'retentionDays', 'sensitiveDefault', 'showDebugRow', 'aiWhitelist', 'aiClassifierEnabled', 'autopopupEnabled', 'autopopupThreshold', 'alwaysMaskEnabled', 'autoSendRedacted'], (res) => {
            if (typeof res.allowMinutes === 'number') $('allowMinutes').value = String(res.allowMinutes);
            if (typeof res.retentionDays === 'number') $('retentionDays').value = String(res.retentionDays);
            if (typeof res.sensitiveDefault === 'string') $('sensitiveDefault').value = res.sensitiveDefault;
            $('showDebugRow').checked = !!res.showDebugRow;
            $('autopopupEnabled').checked = res.autopopupEnabled !== false;
            if (res.autopopupThreshold) $('autopopupThreshold').value = String(res.autopopupThreshold);
            $('alwaysMaskEnabled').checked = res.alwaysMaskEnabled !== false;
            $('autoSendRedacted').checked = res.autoSendRedacted !== false;
            const wl = res.aiWhitelist || {};
            const lines = Object.keys(wl).sort().join('\n');
            $('whitelist').value = lines;
            $('aiClassifierEnabled').checked = !!res.aiClassifierEnabled;
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
        const allowMinutes = Math.max(1, Math.min(120, Number($('allowMinutes').value || 5)));
        const retentionDays = Math.max(1, Math.min(30, Number($('retentionDays').value || 7)));
        const sensitiveDefault = $('sensitiveDefault').value === 'ask' ? 'ask' : 'block';
        const showDebugRow = $('showDebugRow').checked;
        const autopopupEnabled = $('autopopupEnabled').checked;
        const autopopupThreshold = $('autopopupThreshold').value || 'medium';
        const alwaysMaskEnabled = $('alwaysMaskEnabled').checked;
        const aiClassifierEnabled = $('aiClassifierEnabled').checked;
        const autoSendRedacted = $('autoSendRedacted').checked;
        const wlText = $('whitelist').value || '';
        const wlMap = {};
        wlText.split(/\r?\n/).map(s => s.trim()).filter(Boolean).forEach(origin => { wlMap[origin] = true; });
        chrome.storage.local.set({ allowMinutes, retentionDays, sensitiveDefault, showDebugRow, autopopupEnabled, autopopupThreshold, alwaysMaskEnabled, aiWhitelist: wlMap, aiClassifierEnabled, autoSendRedacted }, () => setStatus('ok', 'Saved'));
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
    function resetCooldown() {
        const status = $('status');
        status.textContent = 'Resetting…';
        chrome.storage.local.set({ aipgAutopopup: {} }, () => setStatus('ok', 'Cooldown reset', 1500));
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
        const ex = $('export'); if (ex) ex.addEventListener('click', exportLogs);
        const cl = $('clear'); if (cl) cl.addEventListener('click', clearLogs);
        const bk = $('back'); if (bk) bk.addEventListener('click', backToPopup);
        const rc = $('resetCooldown'); if (rc) rc.addEventListener('click', resetCooldown);
        load();
    });
})();
