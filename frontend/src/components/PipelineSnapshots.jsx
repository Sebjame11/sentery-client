import { useState, useEffect, useMemo } from 'react';
import useStore from '../store/useStore';
import { formatMoney, getUnifiedDeals } from '../utils/helpers';
import { PIPELINE_STAGES, STAGE_LABELS, STAGE_WEIGHTS } from '../utils/constants';
import { showToast } from './Toast';

const STORAGE_KEY = 'vn_snapshots';

function getSnapshots() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}

export default function PipelineSnapshots() {
    const { prospects, deals, companies } = useStore();
    const items = useMemo(() => getUnifiedDeals(prospects, deals, companies), [prospects, deals, companies]);
    const [snapshots, setSnapshots] = useState(getSnapshots);
    const [compareId, setCompareId] = useState(null);

    useEffect(() => { setSnapshots(getSnapshots()); }, []);

    const saveSnapshot = () => {
        const snap = {
            id: Date.now(),
            date: new Date().toISOString().slice(0, 10),
            time: new Date().toLocaleTimeString(),
            totalProspects: items.length,
            totalValue: items.reduce((a, p) => a + (p.dealValue || 0), 0),
            weightedValue: items.reduce((a, p) => a + (p.dealValue || 0) * (STAGE_WEIGHTS[p.stage] || 0), 0),
            stages: PIPELINE_STAGES.map(s => ({ stage: s, count: items.filter(p => p.stage === s).length })),
            won: items.filter(p => p.stage === 'won').length,
            lost: items.filter(p => p.stage === 'lost').length,
        };
        const updated = [snap, ...snapshots].slice(0, 20);
        setSnapshots(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        showToast('Snapshot saved');
    };

    const deleteSnapshot = (id) => {
        const updated = snapshots.filter(s => s.id !== id);
        setSnapshots(updated);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        if (compareId === id) setCompareId(null);
    };

    const compare = compareId ? snapshots.find(s => s.id === compareId) : null;
    const current = {
        totalProspects: items.length,
        totalValue: items.reduce((a, p) => a + (p.dealValue || 0), 0),
        weightedValue: items.reduce((a, p) => a + (p.dealValue || 0) * (STAGE_WEIGHTS[p.stage] || 0), 0),
        won: items.filter(p => p.stage === 'won').length,
        lost: items.filter(p => p.stage === 'lost').length,
    };

    const diffStr = (curr, prev) => {
        if (prev === undefined) return '';
        const d = curr - prev;
        if (d === 0) return '=';
        return (d > 0 ? '+' : '') + (typeof curr === 'number' && curr < 1000 ? d : formatMoney(d));
    };
    const diffColor = (curr, prev) => {
        if (prev === undefined) return 'var(--text-tertiary)';
        const d = curr - prev;
        return d > 0 ? 'var(--success)' : d < 0 ? 'var(--danger)' : 'var(--text-tertiary)';
    };

    return (
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Pipeline Snapshots</div>
                <button className="btn-xs btn-xs-accent" onClick={saveSnapshot}>Save Snapshot</button>
            </div>
            {snapshots.length === 0 ? (
                <div style={{textAlign:'center',padding:24,color:'var(--text-tertiary)',fontSize:'0.85rem'}}>No snapshots yet. Save one to track changes over time.</div>
            ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {snapshots.slice(0, 10).map(snap => (
                        <div key={snap.id} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',background:compareId === snap.id ? 'var(--accent-tint)' : 'var(--bg-sunken)',borderRadius:6,border:compareId === snap.id ? '1px solid var(--accent)' : '1px solid transparent'}}>
                            <div style={{flex:1,minWidth:0}}>
                                <div style={{fontSize:'0.78rem',fontWeight:500}}>{snap.date} {snap.time}</div>
                                <div style={{fontSize:'0.68rem',color:'var(--text-tertiary)'}}>{snap.totalProspects} prospects &middot; {formatMoney(snap.totalValue)} pipeline</div>
                            </div>
                            {compare && (
                                <div style={{display:'flex',gap:8,fontSize:'0.68rem'}}>
                                    <span style={{color:diffColor(snap.totalProspects, compare.totalProspects)}}>{diffStr(snap.totalProspects, compare.totalProspects)} prospects</span>
                                    <span style={{color:diffColor(snap.totalValue, compare.totalValue)}}>{diffStr(snap.totalValue, compare.totalValue)}</span>
                                </div>
                            )}
                            <button className="btn-xs" onClick={() => setCompareId(compareId === snap.id ? null : snap.id)} style={{fontSize:'0.65rem'}}>{compareId === snap.id ? 'Stop' : 'Compare'}</button>
                            <button className="btn-xs" style={{color:'var(--danger)',fontSize:'0.65rem'}} onClick={() => deleteSnapshot(snap.id)}>Del</button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
