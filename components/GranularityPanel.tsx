import React, { useEffect, useState } from 'react';

declare const chrome: any;

type Settings = { email: string; phone: string; address: string; dob: string; card: string };
const DEFAULTS: Settings = { email: 'domain_only', phone: 'last_4', address: 'city_only', dob: 'age_range', card: 'last_4' };

export function GranularityPanel() {
    const [s, setS] = useState<Settings>(DEFAULTS);
    const [saved, setSaved] = useState<string>('');
    useEffect(() => {
        try { chrome.storage.local.get(['granularitySettings'], (r: any) => setS({ ...DEFAULTS, ...(r?.granularitySettings || {}) })); } catch { }
    }, []);
    const save = () => {
        try { chrome.storage.local.set({ granularitySettings: s }, () => { setSaved('Saved'); setTimeout(() => setSaved(''), 1200); }); } catch { }
    };
    const L = (props: any) => <label className="block text-xs text-gray-700 font-medium mb-1" {...props} />;
    const Sel = (props: any) => <select className="w-full border rounded px-2 py-1 text-sm" {...props} />;
    return (
        <div className="text-sm">
            <div className="grid grid-cols-1 gap-3">
                <div>
                    <L>Email</L>
                    <Sel value={s.email} onChange={e => setS({ ...s, email: e.target.value })}>
                        <option value="none">No masking</option>
                        <option value="domain_only">Only domain (e.g., @gmail.com)</option>
                        <option value="full_mask">Full mask</option>
                    </Sel>
                </div>
                <div>
                    <L>Phone</L>
                    <Sel value={s.phone} onChange={e => setS({ ...s, phone: e.target.value })}>
                        <option value="none">No masking</option>
                        <option value="last_4">Last 4 only</option>
                        <option value="full_mask">Full mask</option>
                    </Sel>
                </div>
                <div>
                    <L>Card</L>
                    <Sel value={s.card} onChange={e => setS({ ...s, card: e.target.value })}>
                        <option value="none">No masking</option>
                        <option value="last_4">Last 4 only</option>
                        <option value="full_mask">Full mask</option>
                    </Sel>
                </div>
                <div>
                    <L>Date of birth</L>
                    <Sel value={s.dob} onChange={e => setS({ ...s, dob: e.target.value })}>
                        <option value="none">No masking</option>
                        <option value="age_range">Age range</option>
                        <option value="full_mask">Full mask</option>
                    </Sel>
                </div>
                <div>
                    <L>Address</L>
                    <Sel value={s.address} onChange={e => setS({ ...s, address: e.target.value })}>
                        <option value="none">No masking</option>
                        <option value="city_only">City only</option>
                        <option value="full_mask">Full mask</option>
                    </Sel>
                </div>
            </div>
            <div className="mt-3">
                <button className="px-3 py-1 rounded bg-slate-800 text-white text-xs" onClick={save}>Save granularity</button>
                {saved ? <span className="ml-2 text-xs text-green-700">{saved}</span> : null}
            </div>
        </div>
    );
}
