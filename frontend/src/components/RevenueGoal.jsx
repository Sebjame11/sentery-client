import { useState, useMemo } from 'react';
import useStore from '../store/useStore';
import { formatMoney, getUnifiedDeals } from '../utils/helpers';
import { PIPELINE_STAGES, STAGE_WEIGHTS, STAGE_LABELS } from '../utils/constants';

export default function RevenueGoal() {
    const { prospects, deals, companies } = useStore();
    const items = useMemo(() => getUnifiedDeals(prospects, deals, companies), [prospects, deals, companies]);
    const [goal, setGoal] = useState(parseInt(localStorage.getItem('vn_revenueGoal') || '500000'));
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState(String(goal));

    const totalValue = items.reduce((a, p) => a + (p.dealValue || 0), 0);
    const wonValue = items.filter(p => p.stage === 'won').reduce((a, p) => a + (p.dealValue || 0), 0);
    const weightedValue = items.reduce((a, p) => a + (p.dealValue || 0) * (STAGE_WEIGHTS[p.stage] || 0), 0);
    const pct = Math.min(100, Math.round((wonValue / Math.max(goal, 1)) * 100));
    const projectedPct = Math.min(100, Math.round((weightedValue / Math.max(goal, 1)) * 100));

    const saveGoal = () => {
        const v = parseInt(inputVal) || 500000;
        setGoal(v);
        localStorage.setItem('vn_revenueGoal', String(v));
        setEditing(false);
    };

    const stageBreakdown = PIPELINE_STAGES.filter(s => s !== 'lost' && s !== 'won').map(s => {
        const value = items.filter(p => p.stage === s).reduce((a, p) => a + (p.dealValue || 0), 0);
        return { stage: s, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 };
    }).filter(s => s.value > 0);

    return (
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Revenue Goal</div>
                {editing ? (
                    <div style={{display:'flex',gap:4,alignItems:'center'}}>
                        <input className="field-input" style={{width:100,height:24,fontSize:'0.75rem'}} value={inputVal} onChange={e => setInputVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveGoal()} autoFocus />
                        <button className="btn-xs btn-xs-accent" onClick={saveGoal}>Save</button>
                        <button className="btn-xs" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                ) : (
                    <button className="btn-xs" onClick={() => { setInputVal(String(goal)); setEditing(true); }}>Edit Goal</button>
                )}
            </div>

            <div style={{marginBottom:12}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:4}}>
                    <span style={{fontSize:'1.2rem',fontWeight:600,color:'var(--accent)'}}>{formatMoney(wonValue)}</span>
                    <span style={{fontSize:'0.78rem',color:'var(--text-tertiary)'}}>of {formatMoney(goal)}</span>
                </div>
                <div style={{height:8,background:'var(--bg-sunken)',borderRadius:4,overflow:'hidden',position:'relative'}}>
                    <div style={{height:'100%',width:pct+'%',background:'var(--success)',borderRadius:4,transition:'width 600ms ease',position:'relative',zIndex:1}}></div>
                    <div style={{height:'100%',width:projectedPct+'%',background:'var(--warning)',borderRadius:4,position:'absolute',top:0,left:0,opacity:0.3,transition:'width 600ms ease'}}></div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                    <span style={{fontSize:'0.65rem',color:'var(--text-tertiary)'}}>{pct}% closed</span>
                    <span style={{fontSize:'0.65rem',color:'var(--text-tertiary)'}}>{projectedPct}% projected ({formatMoney(weightedValue)})</span>
                </div>
            </div>

            {stageBreakdown.length > 0 && (
                <div>
                    <div style={{fontSize:'0.68rem',color:'var(--text-tertiary)',marginBottom:6}}>Pipeline Breakdown</div>
                    <div style={{display:'flex',height:6,borderRadius:3,overflow:'hidden',gap:1}}>
                        {stageBreakdown.map(s => (
                            <div key={s.stage} style={{flex:s.pct,background:'var(--accent)',borderRadius:3,minWidth:2}} title={STAGE_LABELS[s.stage] + ': ' + formatMoney(s.value)}></div>
                        ))}
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:8,marginTop:6}}>
                        {stageBreakdown.map(s => (
                            <div key={s.stage} style={{display:'flex',alignItems:'center',gap:4}}>
                                <div style={{width:6,height:6,borderRadius:2,background:'var(--accent)'}}></div>
                                <span style={{fontSize:'0.65rem',color:'var(--text-tertiary)'}}>{STAGE_LABELS[s.stage]}: {formatMoney(s.value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
