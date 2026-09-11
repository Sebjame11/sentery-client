import { useState, useEffect } from 'react';
import { createSequence, isApolloConfiguredAsync } from '../utils/apollo';
import { showToast } from './Toast';

const STEP_TYPES = [
  { value: 'auto_email', label: 'Auto Email', desc: 'Sends automatically' },
  { value: 'manual_email', label: 'Manual Email', desc: 'Sends manually' },
  { value: 'call', label: 'Phone Call', desc: 'Call task' },
  { value: 'action_item', label: 'Task', desc: 'General task' },
];

const WAIT_MODES = [
  { value: 'minute', label: 'Minutes' },
  { value: 'hour', label: 'Hours' },
  { value: 'day', label: 'Days' },
];

export default function CreateSequenceModal({ onClose, onCreated }) {
  const [configured, setConfigured] = useState(null);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState([
    { type: 'auto_email', wait_time: 0, wait_mode: 'minute', subject: '', body: '' },
  ]);
  const [creating, setCreating] = useState(false);

  useEffect(() => { isApolloConfiguredAsync().then(setConfigured); }, []);

  const addStep = () => {
    setSteps([...steps, { type: 'auto_email', wait_time: 3, wait_mode: 'day', subject: '', body: '' }]);
  };

  const removeStep = (idx) => {
    if (steps.length <= 1) return;
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const updateStep = (idx, field, value) => {
    setSteps(steps.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const handleCreate = async () => {
    if (!name.trim()) { showToast('Enter a sequence name'); return; }
    if (steps.some(s => !s.subject.trim() || !s.body.trim())) { showToast('Fill in all email subjects and bodies'); return; }

    setCreating(true);
    try {
      await createSequence({
        name: name.trim(),
        permissions: 'team_can_use',
        active: true,
        steps,
      });
      showToast('Sequence created and activated');
      onCreated();
    } catch (err) {
      showToast('Failed: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  if (configured === null) {
    return (
      <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:32,maxWidth:400,width:'95%',textAlign:'center'}}>
          <div style={{fontSize:13,color:'var(--text-tertiary)'}}>Checking Apollo...</div>
        </div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:32,maxWidth:400,width:'95%',textAlign:'center'}}>
          <div style={{fontSize:16,fontWeight:600,color:'var(--text-primary)',marginBottom:6}}>Apollo Not Configured</div>
          <div style={{fontSize:13,color:'var(--text-tertiary)',marginBottom:16}}>Add your Apollo API key in Settings first.</div>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:680,width:'95%',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600}}>New Sequence</h3>
          <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div style={{flex:1,overflowY:'auto',minHeight:0}}>
          <div style={{marginBottom:16}}>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>Sequence Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}}
              placeholder="e.g. Q3 Outreach Campaign" />
          </div>

          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:0.5}}>Steps</label>
            <button className="btn-secondary" onClick={addStep} style={{fontSize:11,padding:'4px 10px',display:'flex',alignItems:'center',gap:4}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Step
            </button>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {steps.map((step, idx) => (
              <div key={idx} style={{padding:'14px',borderRadius:10,border:'1px solid var(--border)',background:'var(--bg-canvas)',position:'relative'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:24,height:24,borderRadius:6,background:'var(--accent-tint)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'var(--accent)'}}>{idx + 1}</div>
                    <select value={step.type} onChange={e => updateStep(idx, 'type', e.target.value)}
                      style={{padding:'4px 8px',fontSize:12,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:6,outline:'none'}}>
                      {STEP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {idx > 0 && (
                      <div style={{display:'flex',alignItems:'center',gap:4}}>
                        <span style={{fontSize:11,color:'var(--text-tertiary)'}}>Wait</span>
                        <input type="number" min="0" value={step.wait_time} onChange={e => updateStep(idx, 'wait_time', parseInt(e.target.value) || 0)}
                          style={{width:50,padding:'3px 6px',fontSize:12,textAlign:'center',background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:4,outline:'none'}} />
                        <select value={step.wait_mode} onChange={e => updateStep(idx, 'wait_mode', e.target.value)}
                          style={{padding:'3px 6px',fontSize:11,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:4,outline:'none'}}>
                          {WAIT_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(idx)} style={{padding:'2px',background:'none',border:'none',cursor:'pointer',color:'var(--text-tertiary)'}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>

                {(step.type === 'auto_email' || step.type === 'manual_email') && (
                  <>
                    <input value={step.subject} onChange={e => updateStep(idx, 'subject', e.target.value)}
                      style={{width:'100%',padding:'6px 10px',fontSize:12,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:6,outline:'none',boxSizing:'border-box',marginBottom:6}}
                      placeholder="Subject line (supports {{first_name}}, {{company}})" />
                    <textarea value={step.body} onChange={e => updateStep(idx, 'body', e.target.value)}
                      style={{width:'100%',padding:'6px 10px',fontSize:12,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:6,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:80,fontFamily:'inherit',lineHeight:1.4}}
                      placeholder="Email body (supports {{first_name}}, {{company}}, {{title}})" />
                  </>
                )}

                {step.type === 'call' && (
                  <textarea value={step.body} onChange={e => updateStep(idx, 'body', e.target.value)}
                    style={{width:'100%',padding:'6px 10px',fontSize:12,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:6,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:60,fontFamily:'inherit',lineHeight:1.4}}
                    placeholder="Call notes / talking points" />
                )}

                {step.type === 'action_item' && (
                  <input value={step.body} onChange={e => updateStep(idx, 'body', e.target.value)}
                    style={{width:'100%',padding:'6px 10px',fontSize:12,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:6,outline:'none',boxSizing:'border-box'}}
                    placeholder="Task description" />
                )}
              </div>
            ))}
          </div>

          <div style={{marginTop:12,padding:'10px 12px',background:'var(--bg-sunken)',borderRadius:8,fontSize:11,color:'var(--text-tertiary)',lineHeight:1.5}}>
            <strong>Variables:</strong> {'{{first_name}}'} {'{{last_name}}'} {'{{company}}'} {'{{title}}'} {'{{email}}'}
          </div>
        </div>

        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16,paddingTop:14,borderTop:'1px solid var(--border)'}}>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleCreate} disabled={creating} style={{display:'flex',alignItems:'center',gap:6}}>
            {creating ? 'Creating...' : 'Create & Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}
