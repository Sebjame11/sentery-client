import { useState } from 'react';
import useStore from '../store/useStore';
import { daysInStage, getReminders, formatMoney } from '../utils/helpers';
import { STAGE_LABELS } from '../utils/constants';
import { showToast } from '../components/Toast';
import { openModalFn } from '../components/Modal';

export default function Reminders() {
    const { prospects, addTouchpoint, updateProspect } = useStore();
    const [selected, setSelected] = useState(new Set());
    const [collapsed, setCollapsed] = useState(new Set());
    const [followUpDays, setFollowUpDays] = useState(parseInt(localStorage.getItem('vn_followUpDays') || '5'));

    const now = Date.now();
    const reminders = getReminders(prospects).map(p => {
        const lastTp = p.touchpoints?.length ? p.touchpoints.reduce((a, t) => new Date(t.date) > new Date(a.date) ? t : a) : null;
        const daysSince = lastTp ? Math.floor((now - new Date(lastTp.date).getTime()) / 86400000) : daysInStage(p);
        const urgency = daysSince >= 7 ? 'high' : daysSince >= 5 ? 'medium' : 'low';
        return { ...p, daysSince, urgency, lastTouchDate: lastTp ? lastTp.date : 'Never' };
    }).sort((a, b) => b.daysSince - a.daysSince);

    const byStage = {};
    reminders.forEach(p => {
        if (!byStage[p.stage]) byStage[p.stage] = [];
        byStage[p.stage].push(p);
    });

    const toggleSelect = (id, checked) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (checked) next.add(id); else next.delete(id);
            return next;
        });
    };

    const quickLog = (id) => {
        addTouchpoint(id, { type: 'touchpoint', channel: 'Call', note: 'Quick follow-up logged from reminders', outcome: 'completed' });
        setSelected(new Set());
        showToast('Touch logged');
    };

    const bulkLog = () => {
        selected.forEach(id => quickLog(id));
        setSelected(new Set());
    };

    const viewProspect = (p) => {
        const sc = {lead:'tag-cold',contacted:'tag-cold',engaged:'tag-warm',meeting:'tag-warm',proposal:'tag-warm',negotiation:'tag-hot',won:'tag-won',lost:'tag-cold'};
        openModalFn(p.name + ': ' + p.company,
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">' +
                '<div><div class="field-label">Title</div><div style="font-size:0.85rem">' + (p.title||'') + '</div></div>' +
                '<div><div class="field-label">Tier</div><span class="tag tag-' + p.tier + '">' + p.tier + '</span></div>' +
                '<div><div class="field-label">Email</div><div style="font-size:0.85rem">' + (p.email||'') + '</div></div>' +
                '<div><div class="field-label">Phone</div><div style="font-size:0.85rem">' + (p.phone||'') + '</div></div>' +
                '<div><div class="field-label">Stage</div><span class="tag ' + (sc[p.stage]||'') + '">' + (STAGE_LABELS[p.stage]||p.stage) + '</span></div>' +
                '<div><div class="field-label">Deal Value</div><div style="font-size:0.85rem;font-weight:500;color:var(--accent)">' + (p.dealValue ? formatMoney(p.dealValue) : '-') + '</div></div>' +
            '</div>'
        );
    };

    return (
        <div style={{animation:'fadeSlideUp 0.3s ease-out'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
                <h2 style={{fontSize:'1rem',fontWeight:500}}>Follow-up Reminders</h2>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:'0.78rem',color:'var(--text-tertiary)'}}>Remind after</span>
                    <input type="number" className="field-input" style={{width:60}} value={followUpDays} min="1" max="60" onChange={e => { const v = parseInt(e.target.value) || 5; setFollowUpDays(v); localStorage.setItem('vn_followUpDays', v); }} />
                    <span style={{fontSize:'0.78rem',color:'var(--text-tertiary)'}}>days</span>
                </div>
            </div>

            {selected.size > 0 && (
                <div className="reminder-bulk-bar active">
                    <span>{selected.size} selected</span>
                    <button className="btn-xs btn-xs-accent" onClick={bulkLog}>Log Touch for All</button>
                    <button className="btn-xs" onClick={() => setSelected(new Set())}>Clear</button>
                </div>
            )}

            {reminders.length === 0 ? (
                <div style={{textAlign:'center',padding:48,color:'var(--text-tertiary)',fontSize:'0.85rem'}}>All caught up! No overdue follow-ups.</div>
            ) : Object.entries(byStage).map(([stage, items]) => {
                const isCollapsed = collapsed.has(stage);
                return (
                    <div key={stage} className="reminder-group">
                        <div className={'reminder-group-header' + (isCollapsed ? ' collapsed' : '')} onClick={() => {
                            setCollapsed(prev => {
                                const next = new Set(prev);
                                if (next.has(stage)) next.delete(stage); else next.add(stage);
                                return next;
                            });
                        }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                            <h3>{STAGE_LABELS[stage] || stage}</h3>
                            <span className="count">{items.length}</span>
                        </div>
                        {!isCollapsed && (
                            <div className="reminder-group-body">
                                {items.map(p => {
                                    const urg = p.urgency;
                                    const urgBg = urg === 'high' ? 'var(--danger-tint)' : urg === 'medium' ? 'var(--warning-tint)' : 'var(--success-tint)';
                                    const urgColor = urg === 'high' ? 'var(--danger)' : urg === 'medium' ? 'var(--warning)' : 'var(--success)';
                                    return (
                                        <div key={p.id} className={'reminder-item urgency-' + urg} style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 18px',display:'flex',alignItems:'center',gap:12}}>
                                            <input type="checkbox" className="prospect-checkbox" checked={selected.has(p.id)} onChange={e => toggleSelect(p.id, e.target.checked)} />
                                            <div className="reminder-item-icon" style={{background:urgBg,color:urgColor}}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                            </div>
                                            <div className="reminder-item-info" style={{flex:1}}>
                                                <div className="reminder-item-name">{p.name} <span style={{color:'var(--text-tertiary)',fontWeight:400}}>({p.company})</span></div>
                                                <div className="reminder-item-detail">Last: {p.lastTouchDate} &middot; Stage: {STAGE_LABELS[stage]}</div>
                                            </div>
                                            <div className={'reminder-elapsed urgency-' + urg}>{p.daysSince}d overdue</div>
                                            <div className="reminder-item-action" style={{display:'flex',gap:4}}>
                                                <button className="btn-xs" onClick={() => quickLog(p.id)}>Log Touch</button>
                                                <button className="btn-xs" onClick={() => viewProspect(p)}>View</button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
