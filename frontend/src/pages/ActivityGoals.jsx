import { useState, useMemo } from 'react';
import useStore from '../store/useStore';
import { showToast } from '../components/Toast';

const SVG_EMAIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,4 12,13 2,4"/></svg>';
const SVG_CALL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const SVG_LINKEDIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>';
const SVG_SMS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
const SVG_MEETING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';

const ACTIVITY_TYPES = [
    { id:'email', label:'Emails', icon:SVG_EMAIL, color:'#4A90D9' },
    { id:'call', label:'Calls', icon:SVG_CALL, color:'#D97757' },
    { id:'linkedin', label:'LinkedIn', icon:SVG_LINKEDIN, color:'#0077B5' },
    { id:'sms', label:'SMS', icon:SVG_SMS, color:'#7B68EE' },
    { id:'meeting', label:'Meetings', icon:SVG_MEETING, color:'#28A745' },
];

export default function ActivityGoals() {
    const prospects = useStore(s => s.prospects);
    const [goals, setGoals] = useState(() => {
        try { return JSON.parse(localStorage.getItem('vn_activityGoals')) || { daily:{ email:20,call:10,linkedin:15,sms:5,meeting:2 }, weekly:{ email:100,call:50,linkedin:75,sms:25,meeting:10 } }; } catch { return { daily:{ email:20,call:10,linkedin:15,sms:5,meeting:2 }, weekly:{ email:100,call:50,linkedin:75,sms:25,meeting:10 } }; }
    });
    const [editing, setEditing] = useState(false);
    const [trendRange, setTrendRange] = useState(14);

    const today = new Date();
    const todayStr = today.toISOString().slice(0,10);
    const getDayTouches = (dateStr) => prospects.flatMap(p => (p.touchpoints || []).filter(t => t.date && t.date.startsWith(dateStr)));
    const todayTouches = getDayTouches(todayStr);
    const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay()); weekStart.setHours(0,0,0,0);
    const weekTouches = prospects.flatMap(p => (p.touchpoints || []).filter(t => t.date && new Date(t.date) >= weekStart));

    const countChannel = (touches, ch) => {
        if (ch === 'meeting') return touches.filter(t => t.outcome === 'meeting').length;
        return touches.filter(t => t.channel?.toLowerCase() === ch).length;
    };

    const todayByChannel = {}; ACTIVITY_TYPES.forEach(at => { todayByChannel[at.id] = countChannel(todayTouches, at.id); });
    const weekByChannel = {}; ACTIVITY_TYPES.forEach(at => { weekByChannel[at.id] = countChannel(weekTouches, at.id); });

    const todayTotal = ACTIVITY_TYPES.reduce((s, at) => s + todayByChannel[at.id], 0);
    const dailyGoalTotal = ACTIVITY_TYPES.reduce((s, at) => s + (goals.daily[at.id] || 0), 0);
    const todayPct = dailyGoalTotal ? Math.min((todayTotal / dailyGoalTotal) * 100, 100) : 0;
    const weekTotal = ACTIVITY_TYPES.reduce((s, at) => s + weekByChannel[at.id], 0);
    const weeklyGoalTotal = ACTIVITY_TYPES.reduce((s, at) => s + (goals.weekly[at.id] || 0), 0);
    const weekPct = weeklyGoalTotal ? Math.min((weekTotal / weeklyGoalTotal) * 100, 100) : 0;

    const streak = (() => {
        let count = 0; const d = new Date();
        while (true) { const ds = d.toISOString().slice(0,10); const touches = getDayTouches(ds); const total = ACTIVITY_TYPES.reduce((s, at) => s + countChannel(touches, at.id), 0); if (total >= Math.floor(dailyGoalTotal * 0.5)) { count++; d.setDate(d.getDate() - 1); } else break; }
        return count;
    })();

    const trendData = useMemo(() => {
        return Array.from({ length:trendRange }, (_, i) => {
            const d = new Date(today); d.setDate(d.getDate() - (trendRange - 1 - i));
            const ds = d.toISOString().slice(0,10);
            const touches = getDayTouches(ds);
            const byChannel = {}; ACTIVITY_TYPES.forEach(at => { byChannel[at.id] = countChannel(touches, at.id); });
            const total = ACTIVITY_TYPES.reduce((s, at) => s + byChannel[at.id], 0);
            return { date:ds, shortLabel:d.toLocaleDateString('en',{weekday:'short'}), label:d.toLocaleDateString('en',{month:'short',day:'numeric'}), total, byChannel };
        });
    }, [trendRange, prospects.length]);
    const maxTrend = Math.max(...trendData.map(d => d.total), 1);
    const bestDay = trendData.reduce((best, d) => d.total > best.total ? d : best, { total:0 });
    const avgDaily = trendRange ? Math.round(trendData.reduce((s, d) => s + d.total, 0) / trendRange) : 0;

    const saveGoal = (field, value) => { const newGoals = { ...goals, ...value }; setGoals(newGoals); localStorage.setItem('vn_activityGoals', JSON.stringify(newGoals)); };

    return (
        <div className="mac-page">
            <div className="mac-page-header">
                <h1 className="mac-page-title">Activity Goals</h1>
            </div>

            <div className="mac-stats">
                <div className="mac-stat"><div className="mac-stat-value">{streak}</div><div className="mac-stat-label">Day Streak</div></div>
                <div className="mac-stat">
                    <div className="mac-flex" style={{gap:4}}><div className="mac-stat-value" style={{color:todayPct>=100?'var(--success)':'var(--text-primary)'}}>{todayTotal}</div><span style={{fontSize:14,color:'var(--text-muted)',lineHeight:'1.2'}}>/ {dailyGoalTotal}</span></div>
                    <div className="mac-stat-label">Today</div>
                    <div className="mac-stat-bar"><div className="mac-stat-bar-fill" style={{width:`${todayPct}%`,background:todayPct>=100?'var(--success)':'var(--accent)'}} /></div>
                </div>
                <div className="mac-stat"><div className="mac-stat-value" style={{color:weekPct>=100?'var(--success)':'var(--text-primary)'}}>{weekTotal}</div><div className="mac-stat-label">This Week ({Math.round(weekPct)}%)</div><div className="mac-stat-bar"><div className="mac-stat-bar-fill" style={{width:`${weekPct}%`,background:weekPct>=100?'var(--success)':'var(--accent)'}} /></div></div>
                <div className="mac-stat"><div className="mac-stat-value">{avgDaily}</div><div className="mac-stat-label">Avg Daily ({trendRange}d)</div></div>
                <div className="mac-stat"><div className="mac-stat-value">{bestDay.total}</div><div className="mac-stat-label">Best Day ({bestDay.shortLabel||'-'})</div></div>
            </div>

            <div className="mac-group" style={{marginBottom:16}}>
                <div className="mac-group-header">
                    <span>Activity Trend</span>
                    <div className="mac-gap-sm">{[[7,'7d'],[14,'14d'],[30,'30d']].map(([d,label]) => <button key={d} className={trendRange === d ? 'mac-btn mac-btn-primary mac-btn-xs' : 'mac-btn mac-btn-ghost mac-btn-xs'} onClick={() => setTrendRange(d)}>{label}</button>)}</div>
                </div>
                <div className="mac-group-body" style={{padding:'8px 16px 12px'}}>
                    <div style={{display:'flex',alignItems:'flex-end',gap:1,height:80}}>
                        {trendData.map((d, i) => (
                            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,height:'100%',justifyContent:'flex-end'}} title={`${d.label}: ${d.total} total`}>
                                <div style={{fontSize:8,color:'var(--text-muted)'}}>{d.total}</div>
                                <div style={{width:'100%',display:'flex',flexDirection:'column',gap:0}}>
                                    {ACTIVITY_TYPES.reverse().map(at => { const count = d.byChannel[at.id]||0; const height = count ? Math.max((count/maxTrend)*50, 2) : 0; return <div key={at.id} style={{width:'100%',height,background:at.color,borderRadius:count?1:0,transition:'height 0.3s',minHeight:0}} />; })}
                                </div>
                                {i % Math.ceil(trendRange/7) === 0 && <div style={{fontSize:7,color:'var(--text-muted)',whiteSpace:'nowrap',marginTop:2}}>{d.shortLabel}</div>}
                            </div>
                        ))}
                    </div>
                    <div className="mac-flex" style={{gap:8,justifyContent:'center',marginTop:8}}>
                        {ACTIVITY_TYPES.map(at => <div key={at.id} className="mac-flex" style={{gap:3,fontSize:10}}><div style={{width:8,height:8,borderRadius:2,background:at.color}} /><span style={{color:'var(--text-muted)'}}>{at.label}</span></div>)}
                    </div>
                </div>
            </div>

            <div className="mac-grid-3">
                <div className="mac-group" style={{marginBottom:0}}>
                    <div className="mac-group-header"><span>Daily Goals</span><button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</button></div>
                    <div className="mac-group-body" style={{padding:'8px 16px 12px'}}>
                        {ACTIVITY_TYPES.map(at => {
                            const actual = todayByChannel[at.id]; const goal = goals.daily[at.id]||0; const pct = goal ? Math.min((actual/goal)*100,100) : 0;
                            return (
                                <div key={at.id} style={{marginBottom:12}}>
                                    <div className="mac-flex-between" style={{marginBottom:3}}>
                                        <span style={{fontSize:'0.78rem',fontWeight:500,display:'flex',alignItems:'center',gap:5}}><span dangerouslySetInnerHTML={{__html:at.icon}} /> {at.label}</span>
                                        {editing ? <input type="number" className="mac-input" style={{width:60,textAlign:'right',padding:'2px 6px',fontSize:12}} value={goal} min={0} onChange={e => saveGoal('daily',{daily:{...goals.daily,[at.id]:parseInt(e.target.value)||0}})} />
                                            : <span style={{fontSize:'0.78rem',fontWeight:500,color:actual>=goal?'var(--success)':'var(--text-secondary)'}}>{actual} / {goal}</span>}
                                    </div>
                                    <div className="mac-progress" style={{height:5}}><div className="mac-progress-fill" style={{width:`${pct}%`,background:pct>=100?'var(--success)':at.color}} /></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="mac-group" style={{marginBottom:0}}>
                    <div className="mac-group-header">Weekly Goals</div>
                    <div className="mac-group-body" style={{padding:'8px 16px 12px'}}>
                        {ACTIVITY_TYPES.map(at => {
                            const actual = weekByChannel[at.id]; const goal = goals.weekly[at.id]||0; const pct = goal ? Math.min((actual/goal)*100,100) : 0;
                            return (
                                <div key={at.id} style={{marginBottom:12}}>
                                    <div className="mac-flex-between" style={{marginBottom:3}}>
                                        <span style={{fontSize:'0.78rem',fontWeight:500,display:'flex',alignItems:'center',gap:5}}><span dangerouslySetInnerHTML={{__html:at.icon}} /> {at.label}</span>
                                        {editing ? <input type="number" className="mac-input" style={{width:60,textAlign:'right',padding:'2px 6px',fontSize:12}} value={goal} min={0} onChange={e => saveGoal('weekly',{weekly:{...goals.weekly,[at.id]:parseInt(e.target.value)||0}})} />
                                            : <span style={{fontSize:'0.78rem',fontWeight:500,color:actual>=goal?'var(--success)':'var(--text-secondary)'}}>{actual} / {goal}</span>}
                                    </div>
                                    <div className="mac-progress" style={{height:5}}><div className="mac-progress-fill" style={{width:`${pct}%`,background:pct>=100?'var(--success)':at.color}} /></div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="mac-group" style={{marginBottom:0}}>
                    <div className="mac-group-header">This Week</div>
                    <div className="mac-group-body" style={{padding:'8px 16px 12px'}}>
                        {[0,1,2,3,4,5,6].map(dayOffset => {
                            const d = new Date(); d.setDate(d.getDate() - d.getDay() + dayOffset);
                            const ds = d.toISOString().slice(0,10);
                            const touches = getDayTouches(ds);
                            const total = ACTIVITY_TYPES.reduce((s, at) => s + countChannel(touches, at.id), 0);
                            const maxDay = Math.max(...[0,1,2,3,4,5,6].map(d2 => { const dd = new Date(); dd.setDate(dd.getDate()-dd.getDay()+d2); const ts = dd.toISOString().slice(0,10); return ACTIVITY_TYPES.reduce((s, at) => s + countChannel(getDayTouches(ts), at.id), 0); }), 1);
                            const isToday = ds === todayStr;
                            const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                            return (
                                <div key={dayOffset} className="mac-flex" style={{gap:8,marginBottom:4}}>
                                    <div style={{width:30,fontSize:'0.72rem',fontWeight:isToday?600:400,color:isToday?'var(--accent)':'var(--text-secondary)'}}>{dayNames[dayOffset]}</div>
                                    <div className="mac-progress" style={{flex:1,height:16,borderRadius:3,display:'flex'}}>
                                        {ACTIVITY_TYPES.map(at => { const count = countChannel(touches, at.id); const width = count ? (count/maxDay)*100 : 0; return <div key={at.id} style={{width:`${width}%`,background:at.color,minWidth:count?2:0,transition:'width 0.3s',height:'100%'}} />; })}
                                    </div>
                                    <div style={{width:24,fontSize:'0.72rem',textAlign:'right',fontWeight:500}}>{total}</div>
                                </div>
                            );
                        })}
                        <div className="mac-flex" style={{gap:6,justifyContent:'center',marginTop:8}}>
                            {ACTIVITY_TYPES.map(at => <div key={at.id} className="mac-flex" style={{gap:2,fontSize:9}}><div style={{width:6,height:6,borderRadius:1,background:at.color}} /><span style={{color:'var(--text-muted)'}}>{at.label}</span></div>)}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
