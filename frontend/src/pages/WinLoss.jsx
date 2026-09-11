import { useMemo } from 'react';
import useStore from '../store/useStore';
import { formatMoney, daysInStage, esc, getUnifiedDeals } from '../utils/helpers';
import { STAGE_LABELS, PIPELINE_STAGES } from '../utils/constants';

const WIN_REASONS = [
    'Budget approved','Strong champion','Better fit than competitor','Urgent pain',
    'Executive sponsor','Proven ROI case','Quick implementation','Existing relationship',
    'Cultural fit','Timeline alignment',
];

const LOSS_REASONS = [
    'Budget constraints','Champion left','Lost to competitor','No decision made',
    'Internal solution chosen','Project shelved','Timing wrong','Scope mismatch',
    'Pricing too high','No urgency',
];

function ReasonBreakdown({ title, items, color }) {
    const counts = {};
    items.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted.length ? sorted[0][1] : 1;

    return (
        <div className="mac-group">
            <div className="mac-group-header">{title} <span className="mac-group-header-count">({items.length})</span></div>
            <div className="mac-group-body" style={{padding:'8px 16px 12px'}}>
                {sorted.length === 0 && <div style={{fontSize:13,color:'var(--text-muted)',textAlign:'center',padding:'12px 0'}}>No data yet</div>}
                {sorted.map(([reason, count]) => (
                    <div key={reason} className="mac-chart-row" style={{marginBottom:6}}>
                        <div className="mac-chart-label" style={{width:110,fontSize:11}}>{reason}</div>
                        <div className="mac-chart-bar" style={{height:16}}>
                            <div className="mac-chart-fill" style={{width:`${(count / max) * 100}%`,background:color}} />
                            <span className="mac-chart-count" style={{fontSize:10}}>{count}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function StageDurationChart({ prospects }) {
    const closed = prospects.filter(p => ['won','lost'].includes(p.stage));
    if (closed.length === 0) return <div className="mac-group"><div className="mac-group-body"><div className="mac-empty" style={{padding:'20px 0'}}><div className="mac-empty-desc">No closed deals yet</div></div></div></div>;

    const avgDays = PIPELINE_STAGES.filter(s => s !== 'won' && s !== 'lost').map(stage => {
        const inStage = closed.filter(p => {
            if (!p.touchpoints || !p.touchpoints.length) return false;
            const stageTps = p.touchpoints.filter(t => {
                const note = (t.note || '').toLowerCase();
                const channel = (t.channel || '').toLowerCase();
                return note.includes(stage) || channel.includes(stage);
            });
            return stageTps.length > 0 || (p.stage === stage);
        });
        if (inStage.length === 0) return { stage, days: 0, count: 0 };
        const total = inStage.reduce((sum, p) => {
            const created = new Date(p.createdAt || p.created_at || Date.now()).getTime();
            const entered = p.stageEnteredAt ? new Date(p.stageEnteredAt).getTime() : created;
            const touchpoints = (p.touchpoints || []).sort((a, b) => new Date(a.date) - new Date(b.date));
            const lastStageTouch = touchpoints.filter(t => {
                const note = (t.note || '').toLowerCase();
                const channel = (t.channel || '').toLowerCase();
                return note.includes(stage) || channel.includes(stage);
            }).pop();
            const stageEnd = lastStageTouch ? new Date(lastStageTouch.date).getTime() : Date.now();
            return sum + Math.max(1, Math.ceil((stageEnd - entered) / 86400000));
        }, 0);
        return { stage, days: Math.round(total / inStage.length), count: inStage.length };
    });

    const maxDays = Math.max(...avgDays.map(d => d.days), 1);

    return (
        <div className="mac-group">
            <div className="mac-group-header">Avg Days per Stage</div>
            <div className="mac-group-body" style={{padding:'8px 16px 12px'}}>
                {avgDays.map(d => (
                    <div key={d.stage} className="mac-chart-row" style={{marginBottom:6}}>
                        <div className="mac-chart-label" style={{width:90}}>{STAGE_LABELS[d.stage]}</div>
                        <div className="mac-chart-bar" style={{height:18}}>
                            <div className="mac-chart-fill" style={{width:`${(d.days / maxDays) * 100}%`,background:d.days > 0 ? 'var(--accent)' : 'var(--border)'}} />
                            <span className="mac-chart-count" style={{fontSize:11}}>{d.days}d</span>
                        </div>
                        <div className="mac-chart-stat">({d.count})</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function WinLossAnalysis() {
    const prospects = useStore(s => s.prospects);
    const deals = useStore(s => s.deals);
    const companies = useStore(s => s.companies);
    const items = useMemo(() => getUnifiedDeals(prospects, deals, companies), [prospects, deals, companies]);
    const won = items.filter(p => p.stage === 'won');
    const lost = items.filter(p => p.stage === 'lost');
    const total = won.length + lost.length;
    const winRate = total ? Math.round((won.length / total) * 100) : 0;
    const avgWonValue = won.length ? won.reduce((s, p) => s + (p.dealValue || 0), 0) / won.length : 0;
    const avgLostValue = lost.length ? lost.reduce((s, p) => s + (p.dealValue || 0), 0) / lost.length : 0;
    const totalWonValue = won.reduce((s, p) => s + (p.dealValue || 0), 0);
    const totalLostValue = lost.reduce((s, p) => s + (p.dealValue || 0), 0);

    return (
        <div className="mac-page">
            <div className="mac-page-header">
                <div>
                    <h1 className="mac-page-title">Win / Loss Analysis</h1>
                    <div className="mac-page-sub">{total} closed deals</div>
                </div>
            </div>

            <div className="mac-stats">
                <div className="mac-stat"><div className="mac-stat-value" style={{color:'var(--success)'}}>{won.length}</div><div className="mac-stat-label">Won Deals</div></div>
                <div className="mac-stat"><div className="mac-stat-value" style={{color:'var(--danger)'}}>{lost.length}</div><div className="mac-stat-label">Lost Deals</div></div>
                <div className="mac-stat"><div className="mac-stat-value">{winRate}%</div><div className="mac-stat-label">Win Rate</div></div>
                <div className="mac-stat"><div className="mac-stat-value">{formatMoney(avgWonValue)}</div><div className="mac-stat-label">Avg Won Deal</div></div>
                <div className="mac-stat"><div className="mac-stat-value">{formatMoney(totalWonValue)}</div><div className="mac-stat-label">Total Won</div></div>
                <div className="mac-stat"><div className="mac-stat-value">{formatMoney(totalLostValue)}</div><div className="mac-stat-label">Total Lost</div></div>
            </div>

            <div className="mac-grid-3" style={{marginBottom:16}}>
                <StageDurationChart prospects={items} />
                <ReasonBreakdown title="Why We Won" items={won.map(p => p.outcomeReason).filter(Boolean)} color="var(--success)" />
                <ReasonBreakdown title="Why We Lost" items={lost.map(p => p.outcomeReason).filter(Boolean)} color="var(--danger)" />
            </div>

            {total > 0 && (
                <div className="mac-group">
                    <div className="mac-group-header">Closed Deals</div>
                    <div className="mac-table-wrap">
                        <table className="mac-table">
                            <thead>
                                <tr><th>Company</th><th>Contact</th><th>Value</th><th>Stage</th><th>Days</th><th>Touchpoints</th><th>Reason</th></tr>
                            </thead>
                            <tbody>
                                {won.concat(lost).sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0)).map(p => (
                                    <tr key={p.id}>
                                        <td style={{fontWeight:500}}>{esc(p.company)}</td>
                                        <td>{esc(p.name)}</td>
                                        <td style={{fontWeight:500}}>{formatMoney(p.dealValue)}</td>
                                        <td><span className={`mac-badge`} style={{background:p.stage === 'won' ? 'var(--success-tint)' : 'var(--danger-tint)',color:p.stage === 'won' ? 'var(--success)' : 'var(--danger)'}}>{p.stage.toUpperCase()}</span></td>
                                        <td style={{fontSize:'0.78rem'}}>{daysInStage(p)} days</td>
                                        <td style={{fontSize:'0.78rem'}}>{(p.touchpoints || []).length}</td>
                                        <td style={{fontSize:'0.75rem',color:'var(--text-secondary)'}}>{p.outcomeReason || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
