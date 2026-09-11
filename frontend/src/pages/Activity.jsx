import { useState, useEffect, useCallback, useMemo } from 'react';
import useStore from '../store/useStore';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 100;

const TYPE_META = {
    prospect: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>, label: 'Prospect' },
    company: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, label: 'Company' },
    touchpoint: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/></svg>, label: 'Touchpoint' },
    email: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>, label: 'Email' },
    meeting: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label: 'Meeting' },
    segment: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><path d="M9 14l2 2 4-4"/></svg>, label: 'Segment' },
    member: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: 'Member' },
    email_integration: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>, label: 'Email Integration' },
    workspace: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>, label: 'Workspace' },
};

function dayKey(iso) {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(Date.now() - 86400000);
    const fmt = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yest.toDateString()) return 'Yesterday';
    if (d.getFullYear() === today.getFullYear()) return fmt;
    return fmt + ', ' + d.getFullYear();
}

function timeAgo(iso) {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Activity() {
    const { workspace } = useStore();
    const [items, setItems] = useState([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [memberFilter, setMemberFilter] = useState('all');
    const [typeFilter, setTypeFilter] = useState('all');

    const load = useCallback(async (reset) => {
        if (!workspace) return;
        try {
            let query = supabase.from('activity_log')
                .select('*')
                .eq('workspace_id', workspace.id)
                .order('created_at', { ascending: false })
                .limit(PAGE_SIZE);
            if (!reset) query = query.range(items.length, items.length + PAGE_SIZE - 1);
            const { data, error } = await query;
            if (error) throw error;
            setItems(prev => reset ? (data || []) : [...prev, ...(data || [])]);
            setHasMore((data || []).length === PAGE_SIZE);
        } catch (e) {
            console.warn('activity load failed:', e.message);
        } finally {
            setLoading(false);
        }
    }, [workspace, items.length]);

    useEffect(() => { setItems([]); setLoading(true); load(true); }, [workspace?.id]);

    const filtered = useMemo(() => {
        const uf = memberFilter === 'all' ? null : memberFilter;
        const tf = typeFilter === 'all' ? null : typeFilter;
        if (!uf && !tf) return items;
        return items.filter(a => (!uf || a.user_id === uf) && (!tf || a.entity_type === tf));
    }, [items, memberFilter, typeFilter]);

    const groups = useMemo(() => {
        const m = new Map();
        filtered.forEach(a => {
            const k = dayKey(a.created_at);
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(a);
        });
        return Array.from(m.entries());
    }, [filtered]);

    const memberNames = useMemo(() => {
        const m = new Map();
        items.forEach(a => { if (a.user_name && !m.has(a.user_id)) m.set(a.user_id, a.user_name); });
        return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1]));
    }, [items]);

    const typeChips = useMemo(() => {
        const counts = {};
        items.forEach(a => { counts[a.entity_type] = (counts[a.entity_type] || 0) + 1; });
        return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }, [items]);

    const empty = !loading && filtered.length === 0;

    return (
        <div style={{ animation: 'fadeSlideUp 0.3s ease-out' }}>
            <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:'0 0 16px'}}>Activity</h1>
            <div className="activity-toolbar">
                <div className="activity-chips">
                    <button className={'activity-chip' + (typeFilter === 'all' ? ' active' : '')} onClick={() => setTypeFilter('all')}>All</button>
                    {typeChips.map(([t, count]) => (
                        <button key={t} className={'activity-chip' + (typeFilter === t ? ' active' : '')} onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}>
                            {TYPE_META[t]?.label || t} · {count}
                        </button>
                    ))}
                </div>
                <select className="activity-member-select" value={memberFilter} onChange={e => setMemberFilter(e.target.value)}>
                    <option value="all">Everyone</option>
                    {memberNames.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
            </div>

            {loading && <div className="activity-empty">Loading activity…</div>}

            {empty && <div className="activity-empty">
                <div className="activity-empty-title">No activity yet</div>
                <div className="activity-empty-sub">Actions across the workspace — prospects, emails, meetings, segments — will appear here.</div>
            </div>}

            {!loading && groups.map(([day, rows]) => (
                <div className="activity-day" key={day}>
                    <div className="activity-day-label">{day}</div>
                    {rows.map(a => {
                        const meta = TYPE_META[a.entity_type] || { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/></svg>, label: a.entity_type };
                        const actor = a.user_name || 'Someone';
                        const first = actor.trim().split(/\s+/)[0];
                        let summary = a.summary || a.action || '';
                        let viaAi = !!(a.metadata && a.metadata.via_ai);
                        if (!viaAi && first && summary.startsWith(`${first}'s AI assistant `)) {
                            summary = summary.slice(first.length);
                            viaAi = true;
                        } else if (first && summary.startsWith(first + ' ')) {
                            summary = summary.slice(first.length + 1);
                        }
                        return (
                            <div className="activity-row" key={a.id}>
                                <div className="activity-icon">{meta.icon}</div>
                                <div className="activity-body">
                                    <div className="activity-text">
                                        <strong>{actor}</strong>
                                        {viaAi ? <span>'s AI assistant {summary}</span> : <span> {summary}</span>}
                                    </div>
                                    <div className="activity-meta">{meta.label}{a.entity_name ? ' · ' + a.entity_name : ''}</div>
                                </div>
                                <div className="activity-time">{timeAgo(a.created_at)}</div>
                            </div>
                        );
                    })}
                </div>
            ))}

            {hasMore && <button className="activity-more" onClick={() => load(false)}>Load more</button>}
        </div>
    );
}