import { useState, useEffect, useRef } from 'react';
import useStore from '../store/useStore';

const PAGES = [
    { id: 'dashboard', label: 'Dashboard', group: 'Navigation' },
    { id: 'digest', label: 'Daily Digest', group: 'Navigation' },
    { id: 'pipeline', label: 'Pipeline', group: 'Navigation' },
    { id: 'prospects', label: 'Prospects', group: 'Navigation' },
    { id: 'emails', label: 'Emails', group: 'Navigation' },
    { id: 'outreach', label: 'Outreach', group: 'Navigation' },
    { id: 'analytics', label: 'Analytics', group: 'Navigation' },
    { id: 'activity', label: 'Activity', group: 'Navigation' },
    { id: 'reminders', label: 'Reminders', group: 'Navigation' },
    { id: 'notes', label: 'Secure Notes', group: 'Navigation' },
    { id: 'duediligence', label: 'Due Diligence', group: 'Navigation' },
    { id: 'settings', label: 'Settings', group: 'Navigation' },
    { id: 'dealrooms', label: 'Deal Rooms', group: 'Navigation' },
    { id: 'winloss', label: 'Win/Loss Analysis', group: 'Navigation' },
    { id: 'territory', label: 'Territory View', group: 'Navigation' },
    { id: 'competitors', label: 'Competitors', group: 'Navigation' },
    { id: 'playbooks', label: 'Sales Playbooks', group: 'Navigation' },
    { id: 'sequences', label: 'Email Sequences', group: 'Navigation' },
    { id: 'goals', label: 'Activity Goals', group: 'Navigation' },
    { id: 'customfields', label: 'Custom Fields', group: 'Navigation' },
];

export default function CommandPalette({ open, onClose }) {
    const { prospects, setAppPage, addProspect, deleteProspect } = useStore();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    useEffect(() => {
        if (open) {
            setQuery('');
            setSelected(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    const results = [];

    if (!query) {
        PAGES.forEach(p => results.push({ type: 'page', ...p }));
        prospects.slice(0, 5).forEach(p => results.push({ type: 'prospect', id: p.id, label: p.name, sub: p.company, group: 'Recent Prospects' }));
    } else {
        const q = query.toLowerCase();
        PAGES.filter(p => p.label.toLowerCase().includes(q)).forEach(p => results.push({ type: 'page', ...p }));
        prospects.filter(p => (p.name||'').toLowerCase().includes(q) || (p.company||'').toLowerCase().includes(q) || (p.email||'').toLowerCase().includes(q)).slice(0, 10).forEach(p => results.push({ type: 'prospect', id: p.id, label: p.name, sub: p.company || p.email, group: 'Prospects' }));
        if ('add prospect'.includes(q)) results.push({ type: 'action', id: 'add', label: 'Add Prospect', group: 'Actions' });
        if ('import'.includes(q)) results.push({ type: 'action', id: 'import', label: 'Import CSV', group: 'Actions' });
        if ('pipeline'.includes(q) && q.length > 0) results.push({ type: 'action', id: 'pipeline', label: 'Go to Pipeline', group: 'Quick Actions' });
    }

    const grouped = {};
    results.forEach(r => {
        if (!grouped[r.group]) grouped[r.group] = [];
        grouped[r.group].push(r);
    });

    const flatResults = Object.values(grouped).flat();

    useEffect(() => {
        setSelected(0);
    }, [query]);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, flatResults.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
            if (e.key === 'Enter' && flatResults[selected]) { execute(flatResults[selected]); }
            if (e.key === 'Escape') { onClose(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, flatResults, selected]);

    useEffect(() => {
        const el = listRef.current?.children[selected];
        if (el) el.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    const execute = (item) => {
        if (item.type === 'page') { setAppPage(item.id); }
        else if (item.type === 'prospect') { setAppPage('pipeline'); setTimeout(() => document.dispatchEvent(new CustomEvent('viewProspectId', { detail: item.id })), 100); }
        else if (item.type === 'action' && item.id === 'add') { document.dispatchEvent(new CustomEvent('openAddProspect')); }
        onClose();
    };

    if (!open) return null;

    let idx = -1;

    return (
        <div className="cmd-overlay" onClick={onClose}>
            <div className="cmd-palette" onClick={e => e.stopPropagation()}>
                <div className="cmd-input-wrap">
                    <svg className="cmd-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    <input ref={inputRef} className="cmd-input" placeholder="Search prospects, pages, actions..." value={query} onChange={e => setQuery(e.target.value)} />
                    <span className="cmd-hint">ESC</span>
                </div>
                <div className="cmd-results" ref={listRef}>
                    {Object.entries(grouped).map(([group, items]) => (
                        <div key={group}>
                            <div className="cmd-group">{group}</div>
                            {items.map(item => {
                                idx++;
                                const thisIdx = idx;
                                return (
                                    <div key={item.type + item.id} className={'cmd-item' + (thisIdx === selected ? ' selected' : '')} onClick={() => execute(item)}
                                        onMouseEnter={() => setSelected(thisIdx)}>
                                        {item.type === 'page' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16,opacity:0.5}}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>}
                                        {item.type === 'prospect' && <div style={{width:24,height:24,borderRadius:'50%',background:'var(--accent-tint)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:600,flexShrink:0}}>{(item.label||'?').split(' ').map(w=>w[0]).join('').slice(0,2)}</div>}
                                        {item.type === 'action' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:16,height:16,opacity:0.5}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>}
                                        <div style={{flex:1,minWidth:0}}>
                                            <div className="cmd-item-label">{item.label}</div>
                                            {item.sub && <div className="cmd-item-sub">{item.sub}</div>}
                                        </div>
                                        {item.type === 'page' && <span className="cmd-item-badge">Page</span>}
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                    {flatResults.length === 0 && <div className="cmd-empty">No results for "{query}"</div>}
                </div>
            </div>
        </div>
    );
}
