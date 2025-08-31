(function () {
    const KEY = 'aipgMemoryRecords';
    const $ = (id) => document.getElementById(id);

    function render(records) {
        const host = ($('filterHost').value || '').trim().toLowerCase();
        const q = ($('search').value || '').trim().toLowerCase();
        const fEMAIL = $('fEMAIL').checked; const fPHONE = $('fPHONE').checked; const fCARD = $('fCARD').checked; const fAPIKEY = $('fAPIKEY').checked;
        const allow = { EMAIL: fEMAIL, PHONE: fPHONE, CARD: fCARD, APIKEY: fAPIKEY };
        const list = $('list'); list.textContent = '';

        const items = (records || []).filter(r => {
            if (host && !(String(r.site || r.origin || '').toLowerCase().includes(host))) return false;
            if (q && !(String(r.excerpt || '').toLowerCase().includes(q))) return false;
            if (r.piiCounts) {
                // show if any selected type present
                const has = Object.keys(allow).some(k => allow[k] && Number(r.piiCounts?.[k] || 0) > 0);
                if (!has && (fEMAIL || fPHONE || fCARD || fAPIKEY)) return false;
            }
            return true;
        }).reverse();

        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No records yet. Try sending a prompt on chatgpt.com and choose "Send Original".';
            empty.className = 'muted';
            list.appendChild(empty);
            return;
        }

        // Group by origin|sessionId
        const groups = new Map();
        for (const r of items) {
            const k = `${r.origin || r.site}|${r.sessionId || 'unknown'}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(r);
        }

        for (const [k, arr] of groups.entries()) {
            const [origin, sessionId] = k.split('|');
            const card = document.createElement('div');
            card.className = 'card';
            const h = document.createElement('div');
            h.className = 'row';
            h.innerHTML = `<div style="font-weight:600">${origin}</div><div class="muted">Session ${String(sessionId || '').slice(0, 8)}</div>`;
            card.appendChild(h);

            const ul = document.createElement('ul');
            ul.style.listStyle = 'none'; ul.style.padding = '0'; ul.style.margin = '0';
            arr.forEach(r => {
                const li = document.createElement('li');
                li.style.padding = '8px 0';
                li.style.borderTop = '1px solid #eee';
                const time = new Date(r.ts).toLocaleString();
                const meta = `${time} • ${r.direction}${r.rawAllowed ? ' • original' : ''}`;
                li.innerHTML = `<div class="muted" style="font-size:12px">${meta}</div><div>${String(r.excerpt || '').replace(/[&<>]/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[s]))}</div>`;
                ul.appendChild(li);
            });
            card.appendChild(ul);
            list.appendChild(card);
        }
    }

    function load() {
        try { chrome.storage.local.get([KEY], (r) => render(r?.[KEY] || [])); } catch { render([]); }
    }

    function purgeAll() {
        if (!confirm('Delete all memory records?')) return;
        chrome.storage.local.set({ [KEY]: [] }, load);
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('refresh').addEventListener('click', load);
        $('purge').addEventListener('click', purgeAll);
        $('filterHost').addEventListener('input', load);
        $('search').addEventListener('input', load);
        ['fEMAIL', 'fPHONE', 'fCARD', 'fAPIKEY'].forEach(id => $(id).addEventListener('change', load));
        load();
    });
})();
