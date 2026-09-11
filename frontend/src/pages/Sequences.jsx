import { useState } from 'react';
import useStore from '../store/useStore';
import { esc, timeAgo } from '../utils/helpers';
import { showToast } from '../components/Toast';

const CHANNELS = ['Email','LinkedIn','Call','SMS','Twitter'];

function SequenceBuilder({ sequence, onSave, onCancel }) {
    const [name, setName] = useState(sequence?.name || '');
    const [steps, setSteps] = useState(sequence?.steps || [{ day:0, channel:'Email', subject:'', body:'', action:'Send initial outreach' }]);
    const [selectedStep, setSelectedStep] = useState(0);

    const addStep = () => { setSteps([...steps, { day:steps[steps.length-1].day+3, channel:'Email', subject:'', body:'', action:'' }]); setSelectedStep(steps.length); };
    const updateStep = (idx, field, value) => { setSteps(steps.map((s,i) => i===idx ? {...s, [field]:value} : s)); };
    const removeStep = (idx) => { if (steps.length <= 1) return; setSteps(steps.filter((_,i) => i!==idx)); if (selectedStep >= steps.length-1) setSelectedStep(Math.max(0, steps.length-2)); };
    const moveStep = (idx, dir) => { const ni=idx+dir; if (ni<0||ni>=steps.length) return; const ns=[...steps]; [ns[idx], ns[ni]] = [ns[ni], ns[idx]]; setSteps(ns); setSelectedStep(ni); };
    const handleSave = () => { if (!name.trim()) { showToast('Sequence name required'); return; } onSave({ id:sequence?.id||Date.now().toString(), name:name.trim(), steps, createdAt:sequence?.createdAt||new Date().toISOString() }); };
    const totalDays = steps.length ? steps[steps.length-1].day : 0;

    return (
        <div className="mac-split">
            <div className="mac-split-sidebar" style={{width:220}}>
                <div className="mac-input-wrap" style={{marginBottom:12}}>
                    <div className="mac-label">Sequence Name</div>
                    <input className="mac-input" value={name} onChange={e => setName(e.target.value)} placeholder="My sequence" />
                </div>
                <div className="mac-label" style={{marginBottom:6}}>Steps ({steps.length}) — {totalDays} days</div>
                <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:8}}>
                    {steps.map((step, i) => (
                        <div key={i} style={{padding:'8px 10px',borderRadius:7,cursor:'pointer',background:selectedStep===i?'var(--accent-tint)':'transparent',border:`1px solid ${selectedStep===i?'var(--border)':'transparent'}`,fontSize:12,display:'flex',alignItems:'center',gap:8}} onClick={() => setSelectedStep(i)}>
                            <span style={{width:20,height:20,borderRadius:6,background:'var(--accent)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600,flexShrink:0}}>{i+1}</span>
                            <span className="mac-truncate" style={{flex:1}}>{step.action || step.channel}</span>
                            <span style={{fontSize:10,color:'var(--text-muted)',flexShrink:0}}>Day {step.day}</span>
                        </div>
                    ))}
                </div>
                <button className="mac-btn mac-btn-ghost mac-btn-sm" style={{width:'100%'}} onClick={addStep}>+ Add Step</button>
            </div>
            <div className="mac-split-content">
                <div className="mac-group" style={{marginBottom:0}}>
                    <div className="mac-group-header">
                        <span>Step {selectedStep + 1}</span>
                        <div className="mac-gap-sm">
                            <button className="mac-btn-icon mac-btn-sm" onClick={() => moveStep(selectedStep,-1)} disabled={selectedStep===0}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><polyline points="18 15 12 9 6 15"/></svg></button>
                            <button className="mac-btn-icon mac-btn-sm" onClick={() => moveStep(selectedStep,1)} disabled={selectedStep===steps.length-1}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg></button>
                            <button className="mac-btn-icon mac-btn-sm" onClick={() => removeStep(selectedStep)} disabled={steps.length<=1}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                        </div>
                    </div>
                    <div className="mac-group-body" style={{padding:'12px 16px'}}>
                        <div className="mac-grid-2" style={{gap:10,marginBottom:10}}>
                            <div className="mac-input-wrap"><div className="mac-label">Send on Day</div><input type="number" className="mac-input" value={steps[selectedStep]?.day||0} min={0} onChange={e => updateStep(selectedStep,'day',parseInt(e.target.value)||0)} /></div>
                            <div className="mac-input-wrap"><div className="mac-label">Channel</div><select className="mac-select" value={steps[selectedStep]?.channel||'Email'} onChange={e => updateStep(selectedStep,'channel',e.target.value)}>{CHANNELS.map(ch => <option key={ch}>{ch}</option>)}</select></div>
                        </div>
                        <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Action Description</div><input className="mac-input" value={steps[selectedStep]?.action||''} onChange={e => updateStep(selectedStep,'action',e.target.value)} placeholder="What to do" /></div>
                        {steps[selectedStep]?.channel === 'Email' && (<>
                            <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Subject Line</div><input className="mac-input" value={steps[selectedStep]?.subject||''} onChange={e => updateStep(selectedStep,'subject',e.target.value)} placeholder="Email subject" /></div>
                            <div className="mac-input-wrap"><div className="mac-label">Email Body</div><textarea className="mac-textarea" value={steps[selectedStep]?.body||''} onChange={e => updateStep(selectedStep,'body',e.target.value)} placeholder="Email content" rows={6} /></div>
                        </>)}
                        <div className="mac-gap" style={{marginTop:12}}>
                            <button className="mac-btn mac-btn-primary" onClick={handleSave}>Save Sequence</button>
                            <button className="mac-btn mac-btn-ghost" onClick={onCancel}>Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function EmailSequences() {
    const prospects = useStore(s => s.prospects);
    const updateProspect = useStore(s => s.updateProspect);
    const [sequences, setSequences] = useState(() => { try { return JSON.parse(localStorage.getItem('vn_sequences'))||[]; } catch { return []; } });
    const [editing, setEditing] = useState(null);
    const [enrolling, setEnrolling] = useState(null);
    const [selectedProspects, setSelectedProspects] = useState([]);
    const [viewingEnrolled, setViewingEnrolled] = useState(null);

    const saveSequences = (list) => { setSequences(list); localStorage.setItem('vn_sequences', JSON.stringify(list)); };
    const handleSave = (seq) => { editing ? saveSequences(sequences.map(s => s.id === seq.id ? seq : s)) : saveSequences([...sequences, seq]); setEditing(null); };
    const handleDelete = (id) => { saveSequences(sequences.filter(s => s.id !== id)); prospects.filter(p => p.sequenceId === id).forEach(p => updateProspect(p.id, { sequenceId:null, sequenceStep:0, sequenceStartedAt:null })); showToast('Sequence deleted'); };

    const getEnrolled = (seqId) => prospects.filter(p => p.sequenceId === seqId);
    const getCompleted = (seqId) => getEnrolled(seqId).filter(p => { const seq = sequences.find(s => s.id === seqId); return seq && p.sequenceStep >= seq.steps.length; });
    const getActive = (seqId) => getEnrolled(seqId).filter(p => { const seq = sequences.find(s => s.id === seqId); return seq && p.sequenceStep < seq.steps.length; });

    const handleEnroll = () => {
        if (selectedProspects.length === 0) { showToast('Select prospects'); return; }
        selectedProspects.forEach(id => { updateProspect(id, { sequenceId:enrolling.id, sequenceStep:0, sequenceStartedAt:new Date().toISOString() }); });
        showToast(`${selectedProspects.length} prospect${selectedProspects.length>1?'s':''} enrolled`);
        setEnrolling(null); setSelectedProspects([]);
    };

    const advanceStep = (prospectId) => {
        const p = prospects.find(pr => pr.id === prospectId);
        if (!p) return;
        const seq = sequences.find(s => s.id === p.sequenceId);
        if (!seq) return;
        const nextStep = p.sequenceStep + 1;
        if (nextStep >= seq.steps.length) { updateProspect(prospectId, { sequenceStep:nextStep, sequenceCompletedAt:new Date().toISOString() }); showToast('Prospect completed sequence'); }
        else { updateProspect(prospectId, { sequenceStep:nextStep }); showToast(`Advanced to step ${nextStep + 1}`); }
    };

    const removeFromSequence = (prospectId) => { updateProspect(prospectId, { sequenceId:null, sequenceStep:0, sequenceStartedAt:null, sequenceCompletedAt:null }); showToast('Removed from sequence'); };

    if (enrolling) {
        const available = prospects.filter(p => !p.sequenceId);
        const seq = sequences.find(s => s.id === enrolling);
        return (
            <div className="mac-page">
                <div className="mac-page-header"><h1 className="mac-page-title">Enroll in "{enrolling.name}"</h1></div>
                <div className="mac-group">
                    <div className="mac-group-body" style={{padding:'12px 16px'}}>
                        <div className="mac-chip-row" style={{marginBottom:12}}>
                            {seq.steps.map((step, i) => <div key={i} className="mac-chip"><span style={{fontWeight:600}}>#{i+1}</span>{step.channel}<span className="mac-text-muted">Day {step.day}</span></div>)}
                        </div>
                        <div className="mac-gap-sm" style={{marginBottom:10}}>
                            <button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => setSelectedProspects(available.map(p => p.id))}>Select All</button>
                            <button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => setSelectedProspects([])}>Deselect All</button>
                            <span style={{fontSize:12,color:'var(--text-muted)',alignSelf:'center'}}>{selectedProspects.length} selected</span>
                        </div>
                        {available.length === 0 && <div className="mac-empty" style={{padding:'20px 0',fontSize:'0.82rem'}}><div className="mac-empty-desc">All prospects are already in a sequence</div></div>}
                        <div style={{maxHeight:400,overflowY:'auto'}}>
                            {available.map(p => (
                                <label key={p.id} className="mac-row" style={{cursor:'pointer',padding:'8px 0'}}>
                                    <input type="checkbox" checked={selectedProspects.includes(p.id)} onChange={e => { e.target.checked ? setSelectedProspects([...selectedProspects, p.id]) : setSelectedProspects(selectedProspects.filter(id => id !== p.id)); }} />
                                    <span style={{fontWeight:500,flex:1,fontSize:'0.82rem'}}>{esc(p.company)}</span>
                                    <span style={{fontSize:'0.75rem',color:'var(--text-tertiary)'}}>{esc(p.name)}</span>
                                    <span className="mac-badge" style={{background:`var(--${p.stage}-tint)`,color:`var(--${p.stage === 'won' ? 'success' : p.stage === 'lost' ? 'danger' : 'accent'})`,fontSize:10}}>{p.stage}</span>
                                </label>
                            ))}
                        </div>
                        <div className="mac-gap" style={{marginTop:12}}>
                            <button className="mac-btn mac-btn-primary" onClick={handleEnroll}>Enroll Selected ({selectedProspects.length})</button>
                            <button className="mac-btn mac-btn-ghost" onClick={() => { setEnrolling(null); setSelectedProspects([]); }}>Cancel</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (viewingEnrolled) {
        const seq = sequences.find(s => s.id === viewingEnrolled);
        const enrolled = getEnrolled(viewingEnrolled);
        return (
            <div className="mac-page">
                <div className="mac-flex-between" style={{marginBottom:16}}>
                    <div className="mac-flex" style={{gap:8}}>
                        <button className="mac-btn mac-btn-ghost" onClick={() => setViewingEnrolled(null)}>&larr; Back</button>
                        <h1 className="mac-page-title" style={{margin:0}}>{esc(seq?.name)} — Enrolled ({enrolled.length})</h1>
                    </div>
                </div>
                {enrolled.length === 0 && <div className="mac-group"><div className="mac-empty"><div className="mac-empty-desc">No prospects enrolled</div></div></div>}
                {enrolled.length > 0 && <div className="mac-group"><div className="mac-table-wrap"><table className="mac-table"><thead><tr><th>Company</th><th>Contact</th><th>Step</th><th>Status</th><th>Started</th><th>Actions</th></tr></thead><tbody>
                    {enrolled.map(p => {
                        const isComplete = seq && p.sequenceStep >= seq.steps.length;
                        const currentStep = seq?.steps[p.sequenceStep];
                        return (
                            <tr key={p.id}>
                                <td style={{fontWeight:500}}>{esc(p.company)}</td>
                                <td>{esc(p.name)}</td>
                                <td><div className="mac-gap-sm">{seq?.steps.map((_,i) => <div key={i} style={{width:10,height:10,borderRadius:2,background:i<p.sequenceStep?'var(--success)':i===p.sequenceStep?'var(--accent)':'var(--bg-sunken)',border:'1px solid var(--border)'}} title={`Step ${i+1}`} />)}</div></td>
                                <td>{isComplete ? <span className="mac-text-success" style={{fontSize:'0.78rem',fontWeight:600}}>Completed</span> : <span style={{fontSize:'0.78rem'}}><span className="mac-text-accent">Step {p.sequenceStep+1}</span><span className="mac-text-muted" style={{marginLeft:4}}>{currentStep?.channel}</span></span>}</td>
                                <td style={{fontSize:'0.75rem',color:'var(--text-tertiary)'}}>{p.sequenceStartedAt ? timeAgo(p.sequenceStartedAt) : '-'}</td>
                                <td><div className="mac-gap-sm">{!isComplete && <button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => advanceStep(p.id)}>Done</button>}<button className="mac-btn mac-btn-ghost mac-btn-xs" style={{color:'var(--danger)'}} onClick={() => removeFromSequence(p.id)}>Remove</button></div></td>
                            </tr>
                        );
                    })}
                </tbody></table></div></div>}
            </div>
        );
    }

    return (
        <div className="mac-page">
            <div className="mac-page-header">
                <h1 className="mac-page-title">Email Sequences</h1>
                <button className="mac-btn mac-btn-primary" onClick={() => setEditing({ steps:[{ day:0, channel:'Email', subject:'', body:'', action:'Send initial outreach' }] })}>+ New Sequence</button>
            </div>

            {editing ? <SequenceBuilder sequence={editing} onSave={handleSave} onCancel={() => setEditing(null)} /> : (
                <>
                    {sequences.length === 0 && <div className="mac-group"><div className="mac-empty"><div className="mac-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="32" height="32"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg></div><div className="mac-empty-title">No sequences yet</div><div className="mac-empty-desc">Create one to start drip campaigns.</div></div></div>}
                    <div className="mac-grid-2">
                        {sequences.map((seq, seqIdx) => {
                            const enrolled = getEnrolled(seq.id);
                            const active = getActive(seq.id);
                            const completed = getCompleted(seq.id);
                            const totalDays = seq.steps.length ? seq.steps[seq.steps.length-1].day : 0;
                            return (
                                <div key={seq.id} className="mac-group" style={{marginBottom:0,animation:`fadeSlideUp 0.25s ease-out ${seqIdx*0.06}s both`}}>
                                    <div className="mac-group-header" style={{paddingBottom:8}}>
                                        <div className="mac-flex" style={{gap:6}}>
                                            <span>{esc(seq.name)}</span>
                                            <span className="mac-group-header-count">{seq.steps.length} steps · {totalDays}d</span>
                                        </div>
                                        <div className="mac-gap-sm">
                                            <button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => { setEnrolling(seq); setSelectedProspects([]); }}>Enroll</button>
                                            <button className="mac-btn-icon mac-btn-sm" onClick={() => setEditing(seq)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                                            <button className="mac-btn-icon mac-btn-sm" onClick={() => handleDelete(seq.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
                                        </div>
                                    </div>
                                    <div className="mac-group-body" style={{padding:'4px 16px 10px'}}>
                                        <div className="mac-chip-row">{seq.steps.map((step, i) => <div key={i} className="mac-chip"><span style={{fontWeight:600}}>#{i+1}</span>{step.channel}<span className="mac-text-muted">Day {step.day}</span></div>)}</div>
                                        {enrolled.length > 0 && <div className="mac-flex-between" style={{marginTop:8,fontSize:'0.78rem'}}><div className="mac-flex" style={{gap:10}}><span><span className="mac-text-accent" style={{fontWeight:600}}>{active.length}</span> <span className="mac-text-muted">active</span></span><span><span className="mac-text-success" style={{fontWeight:600}}>{completed.length}</span> <span className="mac-text-muted">completed</span></span></div><button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => setViewingEnrolled(seq.id)}>View</button></div>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
