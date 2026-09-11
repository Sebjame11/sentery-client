import { useState, useMemo } from 'react';
import useStore from '../store/useStore';
import { formatMoney, daysInStage, getUnifiedDeals } from '../utils/helpers';
import { PIPELINE_STAGES, STAGE_LABELS, STAGE_WEIGHTS } from '../utils/constants';

export default function Analytics() {
    const { prospects: allProspects, deals, companies } = useStore();
    const allItems = useMemo(() => getUnifiedDeals(allProspects, deals, companies), [allProspects, deals, companies]);
    const [tab, setTab] = useState('overview');
    const [period, setPeriod] = useState('all'); // 'all' | 'month' | 'quarter' | 'year'
    const currentYear = new Date().getFullYear();
    const [filterYear, setFilterYear] = useState(String(currentYear));
    const availableYears = useMemo(() => {
        const years = new Set();
        years.add(String(currentYear));
        allItems.forEach(p => {
            const d = new Date(p.createdAt || p.created_at || 0);
            if (!isNaN(d)) years.add(String(d.getFullYear()));
        });
        return [...years].sort().reverse();
    }, [allItems]);

    const prospects = useMemo(() => {
        const yr = Number(filterYear);
        const base = allItems.filter(p => {
            const d = new Date(p.createdAt || p.created_at || 0);
            return !isNaN(d) && d.getFullYear() === yr;
        });
        if (period === 'all') return base;
        const now = new Date();
        let since;
        if (period === 'month') since = new Date(yr, now.getMonth(), 1);
        else if (period === 'quarter') {
            const q = Math.floor(now.getMonth() / 3);
            since = new Date(yr, q * 3, 1);
        } else if (period === 'year') since = new Date(yr, 0, 1);
        return base.filter(p => {
            const created = new Date(p.createdAt || p.created_at || 0);
            return created >= since;
        });
    }, [allItems, period, filterYear]);

    const total = prospects.length;
    const won = prospects.filter(p => p.stage === 'won').length;
    const lost = prospects.filter(p => p.stage === 'lost').length;
    const active = total - won - lost;
    const winRate = total > 0 ? Math.round(won / total * 100) : 0;

    const totalValue = prospects.reduce((a, p) => a + (p.dealValue || 0), 0);
    const wonValue = prospects.filter(p => p.stage === 'won').reduce((a, p) => a + (p.dealValue || 0), 0);
    const avgDeal = total > 0 ? Math.round(totalValue / total) : 0;

    const stageCounts = PIPELINE_STAGES.map(s => ({ stage: s, count: prospects.filter(p => p.stage === s).length }));
    const maxCount = Math.max(...stageCounts.map(s => s.count), 1);

    const channels = ['email', 'linkedin', 'call', 'sms'];
    const channelData = channels.map(ch => ({
        channel: ch,
        count: prospects.reduce((a, p) => a + p.touchpoints.filter(t => t.channel === ch).length, 0),
        replied: prospects.reduce((a, p) => a + p.touchpoints.filter(t => t.channel === ch && t.outcome === 'replied').length, 0)
    }));
    const maxChannel = Math.max(...channelData.map(c => c.count), 1);

    const angles = {};
    prospects.forEach(p => {
        if (p.angle) {
            if (!angles[p.angle]) angles[p.angle] = { count: 0, value: 0, won: 0 };
            angles[p.angle].count++;
            angles[p.angle].value += p.dealValue || 0;
            if (p.stage === 'won') angles[p.angle].won++;
        }
    });

    const donutColors = ['#D97757', '#4B7B5B', '#5B8DEF', '#B98900', '#9B6BC4', '#E07268', '#9C988F', '#D4D0C8'];
    let donutOffset = 0;
    const donutSegments = stageCounts.filter(s => s.count > 0).map((s, i) => {
        const pct = total > 0 ? s.count / total * 100 : 0;
        const dashArray = `${pct * 3.14} ${314 - pct * 3.14}`;
        const seg = { ...s, pct, dashArray, dashOffset: -donutOffset * 3.14, color: donutColors[i % donutColors.length] };
        donutOffset += pct;
        return seg;
    });

    return (
        <div style={{animation:'fadeSlideUp 0.3s ease-out'}}>
            <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:'0 0 16px'}}>Analytics</h1>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,flexWrap:'wrap',marginBottom:16}}>
                <div className="analytics-tabs">
                    {[['overview', 'Overview'], ['funnel', 'Funnel'], ['forecast', 'Forecast'], ['channels', 'Channels'], ['revenue', 'Revenue'], ['angles', 'Angles']].map(([key, label]) => (
                        <button key={key} className={'analytics-tab' + (tab === key ? ' active' : '')} onClick={() => setTab(key)}>{label}</button>
                    ))}
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
                        style={{fontSize:11,fontWeight:500,padding:'5px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',cursor:'pointer',fontFamily:'inherit',outline:'none'}}>
                        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <div style={{display:'flex',alignItems:'center',gap:4,padding:'3px',background:'var(--bg-sunken)',borderRadius:10,border:'1px solid var(--border)'}}>
                        {[['all', 'All'], ['month', 'Month'], ['quarter', 'Quarter'], ['year', 'Year']].map(([id, label]) => (
                        <button key={id} onClick={() => setPeriod(id)}
                            style={{
                                fontSize:11,fontWeight:600,padding:'5px 12px',borderRadius:8,border:'none',cursor:'pointer',fontFamily:'inherit',
                                background: period === id ? 'var(--bg-surface)' : 'transparent',
                                color: period === id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                                boxShadow: period === id ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                            }}>
                            {label}
                        </button>
                    ))}
                </div>
                </div>
            </div>

            {tab === 'overview' && (
                <div className="analytics-tab-panel active">
                    <div className="analytics-grid">
                        <div className="analytics-card">
                            <h3>Total Pipeline</h3>
                            <div className="analytics-big">{formatMoney(totalValue)}</div>
                            <div className="analytics-sub">{total} deals</div>
                        </div>
                        <div className="analytics-card">
                            <h3>Win Rate</h3>
                            <div className="analytics-big">{winRate}%</div>
                            <div className="analytics-sub">{won} won / {lost} lost</div>
                        </div>
                        <div className="analytics-card">
                            <h3>Avg Deal Size</h3>
                            <div className="analytics-big">{formatMoney(avgDeal)}</div>
                            <div className="analytics-sub">{active} active</div>
                        </div>
                    </div>
                    <div className="analytics-card" style={{marginBottom:16}}>
                        <h3>Stage Distribution</h3>
                        <div className="donut-wrap">
                            <svg width="120" height="120" viewBox="0 0 100 100">
                                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-sunken)" strokeWidth="12" />
                                {donutSegments.map((s, i) => (
                                    <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={s.color} strokeWidth="12"
                                        strokeDasharray={s.dashArray} strokeDashoffset={s.dashOffset}
                                        transform="rotate(-90 50 50)" />
                                ))}
                            </svg>
                            <div className="donut-legend">
                                {donutSegments.map((s, i) => (
                                    <div key={i} className="donut-legend-item">
                                        <div className="donut-legend-dot" style={{background: s.color}}></div>
                                        {STAGE_LABELS[s.stage]}: {s.count} ({Math.round(s.pct)}%)
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="analytics-card">
                        <h3>Stage Counts</h3>
                        <div className="analytics-bar-chart">
                            {stageCounts.map(s => (
                                <div key={s.stage} className="analytics-bar-row">
                                    <span className="analytics-bar-label">{STAGE_LABELS[s.stage]}</span>
                                    <div className="analytics-bar-track">
                                        <div className="analytics-bar-fill" style={{width: (s.count / maxCount * 100) + '%'}}></div>
                                    </div>
                                    <span className="analytics-bar-value">{s.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'funnel' && (
                <div className="analytics-tab-panel active">
                    <div className="analytics-card" style={{marginBottom:16}}>
                        <h3>Conversion Funnel</h3>
                        <div style={{padding:'16px 0'}}>
                            {(() => {
                                const funnelStages = ['lead', 'contacted', 'engaged', 'meeting', 'proposal', 'negotiation', 'won'];
                                const counts = funnelStages.map(s => prospects.filter(p => p.stage === s).length);
                                const maxCount = Math.max(...counts, 1);
                                const colors = ['#9C988F', '#D97757', '#D97757', '#B98900', '#B98900', '#4B7B5B', '#4B7B5B'];
                                return funnelStages.map((s, i) => {
                                    const pct = maxCount > 0 ? (counts[i] / maxCount) * 100 : 0;
                                    const convRate = i > 0 && counts[i-1] > 0 ? Math.round(counts[i] / counts[i-1] * 100) : 100;
                                    return (
                                        <div key={s} style={{marginBottom:8}}>
                                            <div style={{display:'flex',justifyContent:'space-between',fontSize:'0.78rem',marginBottom:4}}>
                                                <span style={{fontWeight:500}}>{STAGE_LABELS[s]}</span>
                                                <span style={{color:'var(--text-tertiary)'}}>{counts[i]} {i > 0 && <span style={{color: convRate >= 50 ? 'var(--success)' : convRate >= 25 ? 'var(--warning)' : 'var(--danger)'}}>({convRate}%)</span>}</span>
                                            </div>
                                            <div style={{height:24,background:'var(--bg-sunken)',borderRadius:6,overflow:'hidden',position:'relative'}}>
                                                <div style={{height:'100%',width:pct+'%',background:colors[i],borderRadius:6,transition:'width 600ms ease'}}></div>
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    </div>
                    <div className="analytics-grid">
                        <div className="analytics-card">
                            <h3>Total Conversion</h3>
                            <div className="analytics-big">{total > 0 ? Math.round(prospects.filter(p => p.stage === 'won').length / total * 100) : 0}%</div>
                            <div className="analytics-sub">Lead to Won</div>
                        </div>
                        <div className="analytics-card">
                            <h3>Avg Stage Duration</h3>
                            <div className="analytics-big">{active > 0 ? Math.round(prospects.filter(p => p.stage !== 'won' && p.stage !== 'lost').reduce((a, p) => a + daysInStage(p), 0) / active) : 0}d</div>
                            <div className="analytics-sub">Across active deals</div>
                        </div>
                        <div className="analytics-card">
                            <h3>Drop-off Rate</h3>
                            <div className="analytics-big">{total > 0 ? Math.round(lost / total * 100) : 0}%</div>
                            <div className="analytics-sub">{lost} lost of {total}</div>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'forecast' && (
                <div className="analytics-tab-panel active">
                    <div className="analytics-grid" style={{marginBottom:16}}>
                        <div className="analytics-card">
                            <h3>Weighted Pipeline</h3>
                            <div className="analytics-big">{formatMoney(prospects.reduce((a, p) => a + (p.dealValue||0) * (STAGE_WEIGHTS[p.stage]||0), 0))}</div>
                            <div className="analytics-sub">Probability-adjusted value</div>
                        </div>
                        <div className="analytics-card">
                            <h3>Best Case</h3>
                            <div className="analytics-big">{formatMoney(prospects.filter(p => p.stage !== 'lost').reduce((a, p) => a + (p.dealValue||0), 0))}</div>
                            <div className="analytics-sub">All active deals close</div>
                        </div>
                        <div className="analytics-card">
                            <h3>Commit</h3>
                            <div className="analytics-big">{formatMoney(prospects.filter(p => ['proposal','negotiation','won'].includes(p.stage)).reduce((a, p) => a + (p.dealValue||0), 0))}</div>
                            <div className="analytics-sub">Proposal+ stage</div>
                        </div>
                    </div>
                    <div className="analytics-card">
                        <h3>Revenue Forecast by Stage</h3>
                        <div className="analytics-bar-chart">
                            {PIPELINE_STAGES.filter(s => s !== 'lost').map(s => {
                                const value = prospects.filter(p => p.stage === s).reduce((a, p) => a + (p.dealValue||0), 0);
                                const weighted = value * (STAGE_WEIGHTS[s] || 0);
                                const maxVal = Math.max(...PIPELINE_STAGES.filter(s2 => s2 !== 'lost').map(s2 => prospects.filter(p => p.stage === s2).reduce((a, p) => a + (p.dealValue||0), 0)), 1);
                                return (
                                    <div key={s} className="analytics-bar-row">
                                        <span className="analytics-bar-label">{STAGE_LABELS[s]}</span>
                                        <div className="analytics-bar-track">
                                            <div className="analytics-bar-fill" style={{width: (value / maxVal * 100) + '%'}}></div>
                                        </div>
                                        <span className="analytics-bar-value">{formatMoney(weighted)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {tab === 'channels' && (
                <div className="analytics-tab-panel active">
                    <div className="analytics-card">
                        <h3>Channel Activity</h3>
                        <div className="analytics-bar-chart">
                            {channelData.map(c => (
                                <div key={c.channel} className="analytics-bar-row">
                                    <span className="analytics-bar-label">{c.channel}</span>
                                    <div className="analytics-bar-track">
                                        <div className="analytics-bar-fill" style={{width: (c.count / maxChannel * 100) + '%'}}></div>
                                    </div>
                                    <span className="analytics-bar-value">{c.count}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="analytics-grid" style={{marginTop:16}}>
                        {channelData.map(c => (
                            <div key={c.channel} className="analytics-card">
                                <h3 style={{textTransform:'capitalize'}}>{c.channel}</h3>
                                <div className="analytics-big">{c.count}</div>
                                <div className="analytics-sub">{c.count > 0 ? Math.round(c.replied / c.count * 100) : 0}% reply rate</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === 'revenue' && (
                <div className="analytics-tab-panel active">
                    <div className="analytics-grid">
                        <div className="analytics-card">
                            <h3>Total Pipeline</h3>
                            <div className="analytics-big">{formatMoney(totalValue)}</div>
                            <div className="analytics-sub">{total} deals</div>
                        </div>
                        <div className="analytics-card">
                            <h3>Closed Won</h3>
                            <div className="analytics-big" style={{color:'var(--success)'}}>{formatMoney(wonValue)}</div>
                            <div className="analytics-sub">{won} deals won</div>
                        </div>
                        <div className="analytics-card">
                            <h3>Weighted</h3>
                            <div className="analytics-big">{formatMoney(prospects.reduce((a, p) => a + (p.dealValue||0) * (STAGE_WEIGHTS[p.stage]||0), 0))}</div>
                            <div className="analytics-sub">Probability-adjusted</div>
                        </div>
                    </div>
                </div>
            )}

            {tab === 'angles' && (
                <div className="analytics-tab-panel active">
                    <div className="analytics-grid">
                        {Object.entries(angles).map(([angle, data]) => (
                            <div key={angle} className="analytics-card">
                                <h3>{angle}</h3>
                                <div className="analytics-big">{data.count}</div>
                                <div className="analytics-sub">{formatMoney(data.value)} pipeline &middot; {data.won} won</div>
                                <div style={{marginTop:8,height:4,background:'var(--bg-sunken)',borderRadius:2,overflow:'hidden'}}>
                                    <div style={{height:'100%',width:(data.won / Math.max(data.count,1) * 100)+'%',background:'var(--success)',borderRadius:2}}></div>
                                </div>
                            </div>
                        ))}
                        {Object.keys(angles).length === 0 && <div className="analytics-card"><div style={{color:'var(--text-tertiary)',fontSize:'0.82rem'}}>No angles tracked yet</div></div>}
                    </div>
                </div>
            )}
        </div>
    );
}
