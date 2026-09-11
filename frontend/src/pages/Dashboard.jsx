import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import useStore from '../store/useStore';
import { formatMoney, daysInStage, getReminders, getDailyTouches, getStreak, esc } from '../utils/helpers';
import { currencySymbol, getCurrencyCode } from '../utils/currency';
import { STAGE_LABELS, PIPELINE_STAGES, STAGE_WEIGHTS, getStageIds, getStageLabels, getStageWeights } from '../utils/constants';
import { parseCSV } from '../utils/csv';
import { showToast } from '../components/Toast';
import { openModalFn } from '../components/Modal';
import ActivityCalendar from '../components/ActivityCalendar';
import RevenueGoal from '../components/RevenueGoal';
import PipelineSnapshots from '../components/PipelineSnapshots';
import TemplatePreview from '../components/TemplatePreview';
import CountrySelect from '../components/CountrySelect';

/* ── Helpers ── */
const diffStr = (curr, prev) => {
    if (prev === undefined || prev === null) return null;
    const d = curr - prev;
    if (d === 0) return { text: '0%', neutral: true };
    return { text: (d > 0 ? '+' : '') + (Math.abs(d) < 10 ? d.toFixed(1) : Math.round(d)) + '%', neutral: false, up: d > 0 };
};
const calcChange = (arr, fn) => {
    const now = fn(arr);
    const weekAgo = fn(arr.filter(p => {
        const d = p.stageEnteredAt || p.createdAt;
        return d && new Date(d) < new Date(Date.now() - 7 * 86400000);
    }));
    return weekAgo > 0 ? ((now - weekAgo) / weekAgo) * 100 : now > 0 ? 100 : 0;
};

/* ── Comparison Badge ── */
function CompareBadge({ value }) {
    if (value === null || value === undefined) return null;
    const up = value > 0;
    const zero = value === 0;
    return (
        <span className={`apple-compare ${zero ? 'neutral' : up ? 'up' : 'down'}`}>
            {zero ? '—' : up ? '↑' : '↓'} {zero ? '' : Math.abs(value).toFixed(0) + '%'}
        </span>
    );
}

/* ── Pipeline Segmented Bar (clickable) ── */
function PipelineBar({ prospects, onStageClick, stageIds, stageLabels }) {
    const stages = (stageIds || PIPELINE_STAGES).filter(s => s !== 'lost');
    const labels = stageLabels || STAGE_LABELS;
    const defaultColors = {
        lead: '#94a3b8', contacted: '#60a5fa', engaged: '#a78bfa',
        meeting: '#f59e0b', proposal: '#f97316', negotiation: '#ef4444', won: '#22c55e',
    };
    const fallbackPalette = ['#6366f1','#0ea5e9','#14b8a6','#84cc16','#eab308','#f97316','#ec4899','#8b5cf6','#06b6d4','#10b981','#84cc16','#f59e0b'];
    const stageColors = {};
    stages.forEach((s, i) => {
        stageColors[s] = defaultColors[s] || fallbackPalette[i % fallbackPalette.length];
    });
    const counts = stages.map(s => prospects.filter(p => p.stage === s).length);
    const total = counts.reduce((a, b) => a + b, 0) || 1;

    return (
        <div>
            <div className="apple-pipe-bar">
                {stages.map((s, i) => {
                    const pct = (counts[i] / total) * 100;
                    if (pct === 0) return null;
                    return <div key={s} className="apple-pipe-seg" style={{flex: pct, background: stageColors[s]}} title={`${labels[s] || s}: ${counts[i]}`} onClick={() => onStageClick?.(s)} />;
                })}
            </div>
            <div className="apple-pipe-legend">
                {stages.map((s, i) => (
                    counts[i] > 0 && <div key={s} className="apple-pipe-legend-item" onClick={() => onStageClick?.(s)}>
                        <span className="apple-pipe-dot" style={{background: stageColors[s]}}></span>
                        <span className="apple-pipe-lbl">{labels[s] || s}</span>
                        <span className="apple-pipe-cnt">{counts[i]}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── Weekly Mini Bar Chart ── */
function WeekChart({ dailyData }) {
    const data = useMemo(() => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days.push({ label: d.toLocaleDateString('en', { weekday: 'narrow' }), count: dailyData[key] || 0, isToday: i === 0 });
        }
        return days;
    }, [dailyData]);
    const max = Math.max(...data.map(d => d.count), 1);

    return (
        <div className="apple-weekchart">
            {data.map((d, i) => (
                <div key={i} className="apple-weekchart-col">
                    <div className="apple-weekchart-barwrap">
                        <div className={`apple-weekchart-bar ${d.isToday ? 'today' : ''}`} style={{height: (d.count / max * 100) + '%'}}></div>
                    </div>
                    <span className={`apple-weekchart-lbl ${d.isToday ? 'today' : ''}`}>{d.label}</span>
                </div>
            ))}
        </div>
    );
}

/* ── Revenue Trend Sparkline ── */
function RevenueTrend({ prospects }) {
    const data = useMemo(() => {
        const days = [];
        for (let i = 29; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const dayStart = new Date(dateStr).getTime();
            const dayEnd = dayStart + 86400000;
            const won = prospects.filter(p => {
                if (p.stage !== 'won') return false;
                const entered = new Date(p.stageEnteredAt || p.createdAt).getTime();
                return entered >= dayStart && entered < dayEnd;
            }).reduce((a, p) => a + (p.dealValue || 0), 0);
            days.push(won);
        }
        // Cumulative
        let cum = 0;
        return days.map(v => { cum += v; return cum; });
    }, [prospects]);

    const max = Math.max(...data, 1);
    const w = 200, h = 40;
    const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 4) - 2}`).join(' ');
    const fillPts = `0,${h} ${pts} ${w},${h}`;

    return (
        <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{display:'block'}}>
            <polygon points={fillPts} fill="var(--accent)" opacity="0.08" />
            <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/* ── Action Item ── */
function ActionItem({ icon, title, description, badge, badgeColor, onClick }) {
    return (
        <div className="apple-action-item" onClick={onClick}>
            <div className="apple-action-icon">{icon}</div>
            <div className="apple-action-body">
                <div className="apple-action-title">{title}</div>
                <div className="apple-action-desc">{description}</div>
            </div>
            {badge && <span className="apple-action-badge" style={badgeColor ? {background: badgeColor + '18', color: badgeColor} : {}}>{badge}</span>}
        </div>
    );
}

/* ── Prospect Mini Row ── */
function ProspectMiniRow({ prospect, onClick, rightSlot, stageLabels }) {
    const labels = stageLabels || STAGE_LABELS;
    return (
        <div className="apple-mini-row" onClick={onClick}>
            <div className="apple-mini-avatar" style={{
                background: prospect.tier === 'hot' ? 'var(--danger-tint)' : prospect.tier === 'warm' ? 'var(--warning-tint)' : 'var(--bg-sunken)',
                color: prospect.tier === 'hot' ? 'var(--danger)' : prospect.tier === 'warm' ? 'var(--warning)' : 'var(--text-tertiary)',
            }}>
                {prospect.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
            <div className="apple-mini-info">
                <div className="apple-mini-name">{prospect.name}</div>
                <div className="apple-mini-meta">{prospect.company} · {labels[prospect.stage] || prospect.stage}</div>
            </div>
            {rightSlot}
        </div>
    );
}

/* ── Empty State ── */
function EmptyState({ icon, title, description, actionLabel, onAction }) {
    return (
        <div className="apple-empty-state">
            <div className="apple-empty-icon">{icon}</div>
            <div className="apple-empty-title">{title}</div>
            <div className="apple-empty-desc">{description}</div>
            {actionLabel && <button className="apple-btn apple-btn-primary" style={{marginTop:12}} onClick={onAction}>{actionLabel}</button>}
        </div>
    );
}

/* ── Main Dashboard ── */
export default function Dashboard() {
    const { prospects, deals, setAppPage, addProspect, workspace } = useStore();
    const csvFileRef = useRef(null);
    const [showAddForm, setShowAddForm] = useState(false);
    const [newP, setNewP] = useState({ name: '', title: '', company: '', email: '', phone: '', linkedin: '', tier: 'cold', stage: 'lead', dealValue: 0, angle: '', notes: '', countries: [] });

    const wsStageIds = useMemo(() => getStageIds(workspace), [workspace]);
    const wsStageLabels = useMemo(() => getStageLabels(workspace), [workspace]);
    const wsStageWeights = useMemo(() => getStageWeights(workspace), [workspace]);

    // ── Unified deal dataset: deals table is the source of truth for deal metrics;
    //    fall back to prospects when no deals exist (legacy/manual workspaces) ──
    const STAGE_TO_TIER = { lead:'cold', contacted:'cold', engaged:'warm', meeting:'warm', proposal:'hot', negotiation:'hot', won:'hot', lost:'cold' };
    const dashboardDeals = useMemo(() => {
        if (deals.length > 0) {
            const companies = useStore.getState().companies || [];
            return deals.map(d => {
                const company = companies.find(c => String(c.id) === String(d.company_id));
                const stage = d.stage || 'lead';
                return {
                    id: d.id,
                    name: d.primary_contact_name || company?.name || d.name || 'Unnamed',
                    company: company?.name || d.company_name || '',
                    tier: STAGE_TO_TIER[stage] || 'cold',
                    stage,
                    dealValue: d.deal_value || 0,
                    touchpoints: d.touchpoints || [],
                    stageEnteredAt: d.stage_entered_at || d.created_at || null,
                    createdAt: d.created_at,
                    outcomeReason: d.closed_won_reason || d.closed_lost_reason || '',
                };
            });
        }
        return prospects;
    }, [deals, prospects]);

    // ── Derived Data ──
    const total = dashboardDeals.length;
    const hot = dashboardDeals.filter(p => p.tier === 'hot').length;
    const won = dashboardDeals.filter(p => p.stage === 'won').length;
    const lost = dashboardDeals.filter(p => p.stage === 'lost').length;
    const meetings = dashboardDeals.reduce((a, p) => a + (p.touchpoints || []).filter(t => t.outcome === 'meeting').length, 0);
    const totalValue = dashboardDeals.reduce((a, p) => a + (p.dealValue || 0), 0);
    const wonValue = dashboardDeals.filter(p => p.stage === 'won').reduce((a, p) => a + (p.dealValue || 0), 0);
    const weightedValue = dashboardDeals.reduce((a, p) => a + (p.dealValue || 0) * (wsStageWeights[p.stage] || 0), 0);
    const activeCount = dashboardDeals.filter(p => !['won', 'lost'].includes(p.stage)).length;
    const winRate = (won + lost) > 0 ? Math.round(won / (won + lost) * 100) : 0;
    const reminders = getReminders(dashboardDeals);
    const streak = getStreak();
    const goal = parseInt(localStorage.getItem('vn_dailyGoal') || '10');
    const today = new Date().toISOString().slice(0, 10);
    const dailyData = getDailyTouches();
    const todayCount = dailyData[today] || 0;
    const goalPct = Math.min(100, Math.round(todayCount / goal * 100));

    // Week totals
    const weekTotal = useMemo(() => {
        let sum = 0;
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i);
            sum += dailyData[d.toISOString().slice(0, 10)] || 0;
        }
        return sum;
    }, []);

    // Comparisons (this week vs last week)
    const hotChange = useMemo(() => {
        const thisWeek = dashboardDeals.filter(p => p.tier === 'hot').length;
        const lastWeekProspects = dashboardDeals.filter(p => {
            const created = new Date(p.createdAt || p.stageEnteredAt);
            return created < new Date(Date.now() - 7 * 86400000);
        });
        const lastWeek = lastWeekProspects.filter(p => p.tier === 'hot').length;
        return lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek * 100) : thisWeek > 0 ? 100 : 0;
    }, [dashboardDeals]);

    const meetingChange = useMemo(() => {
        const now = meetings;
        const prev = dashboardDeals.reduce((a, p) => {
            const oldTps = (p.touchpoints || []).filter(t => {
                const d = new Date(t.date);
                return d < new Date(Date.now() - 7 * 86400000) && d >= new Date(Date.now() - 14 * 86400000);
            });
            return a + oldTps.filter(t => t.outcome === 'meeting').length;
        }, 0);
        return prev > 0 ? ((now - prev) / prev * 100) : now > 0 ? 100 : 0;
    }, [dashboardDeals, meetings]);

    // Top active deals
    const topDeals = useMemo(() =>
        dashboardDeals.filter(p => !['won', 'lost'].includes(p.stage))
            .sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0))
            .slice(0, 5),
    [dashboardDeals]);

    // Stale deals
    const staleDeals = useMemo(() =>
        dashboardDeals.filter(p => !['won', 'lost'].includes(p.stage) && daysInStage(p) > 14)
            .sort((a, b) => daysInStage(b) - daysInStage(a))
            .slice(0, 5),
    [dashboardDeals]);

    // Recent activity
    const recentActivity = useMemo(() =>
        dashboardDeals.flatMap(p =>
            (p.touchpoints || []).map(t => ({ ...t, prospectName: p.name, prospectCompany: p.company, prospectId: p.id }))
        ).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5),
    [dashboardDeals]);

    // Actions needed
    const actions = useMemo(() => {
        const list = [];
        if (reminders.length > 0) {
            list.push({
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
                title: `${reminders.length} follow-up${reminders.length > 1 ? 's' : ''} overdue`,
                description: reminders.slice(0, 2).map(r => r.name).join(', ') + (reminders.length > 2 ? ` +${reminders.length - 2} more` : ''),
                badge: 'Action needed',
                badgeColor: 'var(--warning)',
                onClick: () => setAppPage('reminders'),
            });
        }
        const negCount = dashboardDeals.filter(p => p.stage === 'negotiation').length;
        if (negCount > 0) {
            const negValue = dashboardDeals.filter(p => p.stage === 'negotiation').reduce((a, p) => a + (p.dealValue || 0), 0);
            list.push({
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                title: `${negCount} deal${negCount > 1 ? 's' : ''} in negotiation`,
                description: `${formatMoney(negValue)} ready to close`,
                badge: formatMoney(negValue),
                badgeColor: 'var(--accent)',
                onClick: () => setAppPage('pipeline'),
            });
        }
        const hotLeads = dashboardDeals.filter(p => p.tier === 'hot' && p.stage === 'lead');
        if (hotLeads.length > 0) {
            list.push({
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M12 2c.5 2.5 2 4.5 2 7a4 4 0 1 1-8 0c0-2.5 1.5-4.5 2-7 1.3 1.5 3 2 4 2z"/></svg>,
                title: `${hotLeads.length} hot lead${hotLeads.length > 1 ? 's' : ''} not contacted`,
                description: hotLeads.slice(0, 2).map(p => p.name).join(', '),
                badge: 'Urgent',
                badgeColor: 'var(--danger)',
                onClick: () => setAppPage('prospects'),
            });
        }
        if (todayCount >= goal) {
            list.push({
                icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
                title: 'Daily goal reached!',
                description: `${todayCount}/${goal} touchpoints completed`,
                badge: 'Done',
                badgeColor: 'var(--success)',
            });
        }
        return list;
    }, [dashboardDeals, reminders, todayCount, goal]);

    // Empty state check
    const isEmpty = total === 0;

    // Count-up animation
    useEffect(() => {
        const els = document.querySelectorAll('[data-count]');
        els.forEach(el => {
            const target = parseInt(el.dataset.count);
            if (isNaN(target)) return;
            const start = performance.now();
            function tick(now) {
                const p = Math.min(1, (now - start) / 800);
                el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))).toLocaleString();
                if (p < 1) requestAnimationFrame(tick);
            }
            requestAnimationFrame(tick);
        });
    }, []);

    const saveProspect = () => {
        if (!newP.name.trim()) { showToast('Name is required'); return; }
        addProspect({ ...newP, dealValue: Number(newP.dealValue) || 0 });
        showToast(newP.name + ' added');
        setNewP({ name: '', title: '', company: '', email: '', phone: '', linkedin: '', tier: 'cold', stage: 'lead', dealValue: 0, angle: '', notes: '', countries: [] });
        setShowAddForm(false);
    };

    const handleCSVImport = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const rows = parseCSV(ev.target.result);
            if (!rows.length) { showToast('No valid rows found'); return; }
            window._pendingCSVImport = rows;
            const preview = rows.slice(0, 8).map(r => '<tr><td style="font-weight:500">' + esc(r.name) + '</td><td>' + esc(r.title||'-') + '</td><td>' + esc(r.company||'-') + '</td><td>' + esc(r.email||'-') + '</td><td>' + esc(r.phone||'-') + '</td><td>' + esc(r.leadSource||'-') + '</td><td>' + esc(r.lifecycleStage||'lead') + '</td></tr>').join('');
            openModalFn('Import Preview (' + rows.length + ' prospects)',
                '<div style="margin-bottom:12px;font-size:0.82rem;color:var(--text-secondary)">Found ' + rows.length + ' prospects</div>' +
                '<div style="overflow-x:auto"><table class="prospects-table" style="margin-bottom:16px;min-width:700px"><thead><tr><th>Name</th><th>Title</th><th>Company</th><th>Email</th><th>Phone</th><th>Lead Source</th><th>Lifecycle</th></tr></thead><tbody>' + preview +
                (rows.length > 8 ? '<tr><td colspan="7" style="text-align:center;color:var(--text-tertiary)">+' + (rows.length - 8) + ' more</td></tr>' : '') +
                '</tbody></table></div>' +
                '<button class="btn-primary" style="width:100%" onclick="document.dispatchEvent(new CustomEvent(\'confirmCSV\'))">Import All</button>'
            );
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const inputStyle = {
        width:'100%',padding:'8px 10px',fontSize:13,
        background:'var(--bg-surface)',color:'var(--text-primary)',
        border:'1px solid var(--border)',borderRadius:8,
        outline:'none',boxSizing:'border-box',fontFamily:'inherit',
    };

    if (isEmpty) {
        return (
            <div className="apple-dash" style={{animation:'fadeSlideUp 0.3s ease-out'}}>
                <EmptyState
                    icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="48" height="48"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                    title="Your pipeline is empty"
                    description="Add your first prospect to get started. You can add them manually or import from a CSV file."
                    actionLabel="Add First Prospect"
                    onAction={() => setShowAddForm(true)}
                />
                {showAddForm && (
                    <div className="apple-dash-addform" style={{animation:'fadeSlideUp 0.2s ease-out'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                            <span style={{fontSize:15,fontWeight:600}}>New Prospect</span>
                            <button className="apple-btn-icon" onClick={() => setShowAddForm(false)}>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                        </div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                            <input style={inputStyle} value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} placeholder="Name *" />
                            <input style={inputStyle} value={newP.company} onChange={e => setNewP({...newP, company: e.target.value})} placeholder="Company" />
                            <input style={inputStyle} value={newP.email} onChange={e => setNewP({...newP, email: e.target.value})} placeholder="Email" />
                        </div>
                        <button className="apple-btn apple-btn-primary" style={{width:'100%',marginTop:12}} onClick={saveProspect}>Save</button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="apple-dash" style={{animation:'fadeSlideUp 0.3s ease-out'}}>

            {/* ── Page Header ── */}
            <div className="apple-dash-header">
                <div>
                    <h1 className="apple-dash-title">Dashboard</h1>
                    <p className="apple-dash-subtitle">{activeCount} active deal{activeCount !== 1 ? 's' : ''} · {formatMoney(totalValue)} pipeline · {won} won</p>
                </div>
                <div className="apple-dash-actions">
                    <button className="apple-btn apple-btn-ghost" onClick={() => setShowAddForm(!showAddForm)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add
                    </button>
                    <button className="apple-btn apple-btn-ghost" onClick={() => csvFileRef.current?.click()}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                        Import
                    </button>
                    <input ref={csvFileRef} type="file" accept=".csv" style={{display:'none'}} onChange={handleCSVImport} />
                    <button className="apple-btn apple-btn-primary" onClick={() => setAppPage('pipeline')}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><rect x="1" y="3" width="6" height="18" rx="1"/><rect x="9" y="8" width="6" height="13" rx="1"/><rect x="17" y="1" width="6" height="20" rx="1"/></svg>
                        Pipeline
                    </button>
                </div>
            </div>

            {/* ── Inline Add Form ── */}
            {showAddForm && (
                <div className="apple-dash-addform" style={{animation:'fadeSlideUp 0.2s ease-out'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                        <span style={{fontSize:15,fontWeight:600}}>New Prospect</span>
                        <button className="apple-btn-icon" onClick={() => setShowAddForm(false)}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
                        <input style={inputStyle} value={newP.name} onChange={e => setNewP({...newP, name: e.target.value})} placeholder="Name *" />
                        <input style={inputStyle} value={newP.company} onChange={e => setNewP({...newP, company: e.target.value})} placeholder="Company" />
                        <input style={inputStyle} value={newP.email} onChange={e => setNewP({...newP, email: e.target.value})} placeholder="Email" />
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:10,marginTop:10}}>
                        <input style={inputStyle} value={newP.title} onChange={e => setNewP({...newP, title: e.target.value})} placeholder="Title" />
                        <select style={inputStyle} value={newP.tier} onChange={e => setNewP({...newP, tier: e.target.value})}>
                            <option value="cold">Cold</option><option value="warm">Warm</option><option value="hot">Hot</option>
                        </select>
                        <select style={inputStyle} value={newP.stage} onChange={e => setNewP({...newP, stage: e.target.value})}>
                            <option value="lead">Lead</option><option value="contacted">Contacted</option><option value="engaged">Engaged</option>
                            <option value="meeting">Meeting</option><option value="proposal">Proposal</option><option value="negotiation">Negotiation</option>
                        </select>
                        <input style={inputStyle} type="number" value={newP.dealValue} onChange={e => setNewP({...newP, dealValue: e.target.value})} placeholder={`Deal ${currencySymbol(getCurrencyCode())}`} min="0" />
                    </div>
                    <button className="apple-btn apple-btn-primary" style={{width:'100%',marginTop:12}} onClick={saveProspect}>Save Prospect</button>
                </div>
            )}

            {/* ── Actions (Decision-led) ── */}
            {actions.length > 0 && (
                <div className="apple-section-card" style={{animation:'fadeSlideUp 0.3s ease-out 0.05s both'}}>
                    <div className="apple-section-header">
                        <span className="apple-section-label">What to do next</span>
                        <span className="apple-section-count">{actions.length}</span>
                    </div>
                    <div className="apple-actions-grid">
                        {actions.map((a, i) => <ActionItem key={i} {...a} />)}
                    </div>
                </div>
            )}

            {/* ── KPI Strip ── */}
            <div className="apple-kpi-strip" style={{animation:'fadeSlideUp 0.3s ease-out 0.1s both'}}>
                <div className="apple-kpi">
                    <div className="apple-kpi-top">
                        <span className="apple-kpi-value" data-count={total}>0</span>
                        <CompareBadge value={hotChange} />
                    </div>
                    <span className="apple-kpi-label">Prospects</span>
                </div>
                <div className="apple-kpi">
                    <div className="apple-kpi-top">
                        <span className="apple-kpi-value" data-count={hot}>0</span>
                        <CompareBadge value={hotChange} />
                    </div>
                    <span className="apple-kpi-label">Hot Leads</span>
                </div>
                <div className="apple-kpi">
                    <div className="apple-kpi-top">
                        <span className="apple-kpi-value" data-count={meetings}>0</span>
                        <CompareBadge value={meetingChange} />
                    </div>
                    <span className="apple-kpi-label">Meetings</span>
                </div>
                <div className="apple-kpi">
                    <div className="apple-kpi-top">
                        <span className="apple-kpi-value">{formatMoney(wonValue)}</span>
                    </div>
                    <span className="apple-kpi-label">Closed Won</span>
                </div>
                <div className="apple-kpi">
                    <div className="apple-kpi-top">
                        <span className="apple-kpi-value">{winRate}%</span>
                    </div>
                    <span className="apple-kpi-label">Win Rate</span>
                </div>
                <div className="apple-kpi">
                    <div className="apple-kpi-top">
                        <span className="apple-kpi-value">{formatMoney(weightedValue)}</span>
                    </div>
                    <span className="apple-kpi-label">Weighted</span>
                </div>
            </div>

            {/* ── Daily Goal + Revenue Trend ── */}
            <div className="apple-dash-split" style={{animation:'fadeSlideUp 0.3s ease-out 0.15s both'}}>
                <div className="apple-section-card apple-goal-card">
                    <div className="apple-section-header">
                        <span className="apple-section-label">Today's Activity</span>
                        <span className="apple-section-sub">{weekTotal} this week</span>
                    </div>
                    <div className="apple-goal-row">
                        <div className="apple-goal-ring-wrap">
                            <svg width="56" height="56" style={{transform:'rotate(-90deg)',display:'block'}}>
                                <circle cx="28" cy="28" r="24" fill="none" stroke="var(--bg-sunken)" strokeWidth="4" />
                                <circle cx="28" cy="28" r="24" fill="none" stroke={goalPct >= 100 ? 'var(--success)' : 'var(--accent)'} strokeWidth="4"
                                    strokeDasharray={2 * Math.PI * 24} strokeDashoffset={2 * Math.PI * 24 - (Math.min(goalPct, 100) / 100) * 2 * Math.PI * 24}
                                    strokeLinecap="round" style={{transition:'stroke-dashoffset 0.8s cubic-bezier(.22,1,.36,1)'}} />
                            </svg>
                            <div className="apple-goal-ring-label">{goalPct}%</div>
                        </div>
                        <div className="apple-goal-details">
                            <div className="apple-goal-big">{todayCount}<span className="apple-goal-small">/{goal}</span></div>
                            <div className="apple-goal-sub">touchpoints{streak > 0 ? ` · ${streak}d streak` : ''}</div>
                            <div className="apple-goal-bar-outer">
                                <div className="apple-goal-bar-inner" style={{width: goalPct + '%', background: goalPct >= 100 ? 'var(--success)' : 'var(--accent)'}}></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="apple-section-card">
                    <div className="apple-section-header">
                        <span className="apple-section-label">Revenue Trend</span>
                        <span className="apple-section-sub">30 days</span>
                    </div>
                    <RevenueTrend prospects={dashboardDeals} />
                    <div className="apple-revenue-stats">
                        <div className="apple-revenue-stat">
                            <span className="apple-revenue-stat-val">{formatMoney(wonValue)}</span>
                            <span className="apple-revenue-stat-lbl">Closed</span>
                        </div>
                        <div className="apple-revenue-stat">
                            <span className="apple-revenue-stat-val">{formatMoney(totalValue)}</span>
                            <span className="apple-revenue-stat-lbl">Pipeline</span>
                        </div>
                        <div className="apple-revenue-stat">
                            <span className="apple-revenue-stat-val">{formatMoney(weightedValue)}</span>
                            <span className="apple-revenue-stat-lbl">Projected</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Pipeline + Activity ── */}
            <div className="apple-dash-split" style={{animation:'fadeSlideUp 0.3s ease-out 0.2s both'}}>
                <div className="apple-section-card">
                    <div className="apple-section-header">
                        <span className="apple-section-label">Pipeline</span>
                        <button className="apple-link" onClick={() => setAppPage('pipeline')}>View board →</button>
                    </div>
                    <PipelineBar prospects={dashboardDeals} onStageClick={(s) => setAppPage('pipeline')} stageIds={wsStageIds} stageLabels={wsStageLabels} />
                </div>

                <div className="apple-section-card">
                    <div className="apple-section-header">
                        <span className="apple-section-label">Recent Activity</span>
                        <button className="apple-link" onClick={() => setAppPage('prospects')}>All →</button>
                    </div>
                    {recentActivity.length > 0 ? (
                        <div className="apple-activity-list">
                            {recentActivity.map((a, i) => {
                                const chIcons = {
                                    email: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
                                    linkedin: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>,
                                    call: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
                                    sms: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
                                };
                                return (
                                    <div key={i} className="apple-activity-item"
                                        onClick={() => { useStore.getState().setDetailId(a.prospectId); useStore.getState().setAppPage('prospects'); }}>
                                        <span className="apple-activity-ch">{chIcons[a.channel] || '●'}</span>
                                        <div className="apple-activity-body">
                                            <span className="apple-activity-name">{a.prospectName}</span>
                                            <span className="apple-activity-note">{a.note}</span>
                                        </div>
                                        <span className="apple-activity-date">{a.date.slice(5)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="apple-empty-inline">No activity yet. Log touchpoints to see them here.</div>
                    )}
                </div>
            </div>

            {/* ── Top Deals + Stale + Follow-up ── */}
            <div className="apple-dash-triple" style={{animation:'fadeSlideUp 0.3s ease-out 0.25s both'}}>
                <div className="apple-section-card">
                    <div className="apple-section-header">
                        <span className="apple-section-label">Top Deals</span>
                    </div>
                    {topDeals.length > 0 ? topDeals.map(p => (
                        <ProspectMiniRow key={p.id} prospect={p} stageLabels={wsStageLabels}
                            onClick={() => { useStore.getState().setDetailId(p.id); useStore.getState().setAppPage('prospects'); }}
                            rightSlot={<span className="apple-mini-value">{formatMoney(p.dealValue || 0)}</span>}
                        />
                    )) : <div className="apple-empty-inline">No active deals</div>}
                </div>

                <div className="apple-section-card">
                    <div className="apple-section-header">
                        <span className="apple-section-label">Stale Deals</span>
                        {staleDeals.length > 0 && <span className="apple-pill apple-pill-red">{staleDeals.length}</span>}
                    </div>
                    {staleDeals.length > 0 ? staleDeals.map(p => (
                        <ProspectMiniRow key={p.id} prospect={p} stageLabels={wsStageLabels}
                            onClick={() => { useStore.getState().setDetailId(p.id); useStore.getState().setAppPage('prospects'); }}
                            rightSlot={<span className="apple-mini-stale">{daysInStage(p)}d stuck</span>}
                        />
                    )) : <div className="apple-empty-inline">All deals moving</div>}
                </div>

                <div className="apple-section-card">
                    <div className="apple-section-header">
                        <span className="apple-section-label">Needs Follow-up</span>
                        {reminders.length > 0 && <span className="apple-pill apple-pill-amber">{reminders.length}</span>}
                    </div>
                    {reminders.length > 0 ? reminders.slice(0, 5).map(p => (
                        <ProspectMiniRow key={p.id} prospect={p} stageLabels={wsStageLabels}
                            onClick={() => { useStore.getState().setDetailId(p.id); useStore.getState().setAppPage('prospects'); }}
                            rightSlot={<span className="apple-link" style={{fontSize:11}}>Follow up</span>}
                        />
                    )) : <div className="apple-empty-inline">All caught up</div>}
                </div>
            </div>

            {/* ── Revenue Goal ── */}
            <div style={{animation:'fadeSlideUp 0.3s ease-out 0.3s both'}}>
                <RevenueGoal />
            </div>

            {/* ── Activity Heatmap ── */}
            <div className="apple-section-card" style={{animation:'fadeSlideUp 0.3s ease-out 0.35s both'}}>
                <ActivityCalendar />
            </div>

            {/* ── Bottom Row ── */}
            <div className="apple-dash-split" style={{animation:'fadeSlideUp 0.3s ease-out 0.4s both'}}>
                <div className="apple-section-card">
                    <PipelineSnapshots />
                </div>
                <div className="apple-section-card">
                    <TemplatePreview />
                </div>
            </div>
        </div>
    );
}
