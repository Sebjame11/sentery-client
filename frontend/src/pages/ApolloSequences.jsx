import { useState, useEffect } from 'react';
import { searchSequences, activateSequence, deactivateSequence, isApolloConfiguredAsync } from '../utils/apollo';
import { showToast } from '../components/Toast';
import CreateSequenceModal from '../components/CreateSequenceModal';
import AddToSequenceModal from '../components/AddToSequenceModal';

export default function SequencesPage() {
  const [configured, setConfigured] = useState(null);
  const [sequences, setSequences] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [addToSequence, setAddToSequence] = useState(null);

  useEffect(() => {
    isApolloConfiguredAsync().then(setConfigured);
  }, []);

  useEffect(() => {
    if (configured) loadSequences();
  }, [configured]);

  const loadSequences = async () => {
    setLoading(true);
    try {
      const resp = await searchSequences({ name: search || undefined });
      setSequences(resp.data || []);
    } catch (err) {
      showToast('Failed to load sequences: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleActive = async (seq) => {
    try {
      if (seq.active) {
        await deactivateSequence(seq.id);
        showToast(`"${seq.name}" deactivated`);
      } else {
        await activateSequence(seq.id);
        showToast(`"${seq.name}" activated`);
      }
      loadSequences();
    } catch (err) {
      showToast('Failed: ' + err.message);
    }
  };

  if (configured === null) {
    return (
      <div style={{animation:'fadeSlideUp 0.3s ease-out',padding:'60px 20px',textAlign:'center'}}>
        <div style={{fontSize:13,color:'var(--text-tertiary)'}}>Checking Apollo...</div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div style={{animation:'fadeSlideUp 0.3s ease-out',padding:'60px 20px',textAlign:'center'}}>
        <div style={{width:64,height:64,borderRadius:16,background:'var(--bg-sunken)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px'}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="32" height="32"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
        <h2 style={{fontSize:20,fontWeight:700,color:'var(--text-primary)',marginBottom:8}}>Apollo Not Configured</h2>
        <p style={{fontSize:14,color:'var(--text-tertiary)',marginBottom:20}}>Add your Apollo API key in Settings to manage sequences.</p>
      </div>
    );
  }

  return (
    <div style={{animation:'fadeSlideUp 0.3s ease-out'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 style={{fontSize:24,fontWeight:700,color:'var(--text-primary)',margin:0}}>Sequences</h1>
          <p style={{fontSize:13,color:'var(--text-tertiary)',margin:'4px 0 0'}}>Automated email campaigns powered by Apollo</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreate(true)} style={{display:'flex',alignItems:'center',gap:6}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Sequence
        </button>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <div style={{position:'relative',flex:1,maxWidth:320}}>
          <svg style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-tertiary)',pointerEvents:'none'}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search sequences..." value={search} onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadSequences()}
            style={{width:'100%',padding:'8px 10px 8px 32px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
        </div>
        <button className="btn-secondary" onClick={loadSequences} disabled={loading} style={{fontSize:12}}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loading && sequences.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:'var(--text-tertiary)',fontSize:13}}>Loading sequences...</div>
      ) : sequences.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 20px'}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="40" height="40" style={{opacity:0.25,marginBottom:12}}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          <div style={{fontSize:16,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>No sequences found</div>
          <div style={{fontSize:13,color:'var(--text-tertiary)',marginBottom:16}}>Create your first sequence to start automated outreach.</div>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>Create Sequence</button>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {sequences.map(seq => {
            const totalContacts = (seq.contact_statuses?.active || 0) + (seq.contact_statuses?.finished || 0) + (seq.contact_statuses?.paused || 0);
            return (
              <div key={seq.id} style={{
                padding:'16px 20px',borderRadius:12,
                background:'var(--bg-surface)',border:'1px solid var(--border)',
                transition:'all 0.15s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; }}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <div style={{width:36,height:36,borderRadius:10,background: seq.active ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'var(--bg-sunken)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke={seq.active ? 'var(--success)' : 'var(--text-tertiary)'} strokeWidth="1.5" strokeLinecap="round" width="18" height="18"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    </div>
                    <div>
                      <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>{seq.name}</div>
                      <div style={{fontSize:11,color:'var(--text-tertiary)'}}>{seq.num_steps} steps &middot; {totalContacts} contacts &middot; Created {new Date(seq.created).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:4,background: seq.active ? 'color-mix(in srgb, var(--success) 12%, transparent)' : 'var(--bg-sunken)',color: seq.active ? 'var(--success)' : 'var(--text-tertiary)'}}>
                      {seq.active ? 'Active' : 'Inactive'}
                    </span>
                    <button className="btn-xs" onClick={() => toggleActive(seq)}>
                      {seq.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className="btn-xs" onClick={() => setAddToSequence(seq)}>
                      Add Contacts
                    </button>
                  </div>
                </div>

                <div style={{display:'grid',gridTemplateColumns:'repeat(6, 1fr)',gap:8}}>
                  {[
                    { label:'Scheduled', value: seq.stats.scheduled, color:'var(--text-tertiary)' },
                    { label:'Delivered', value: seq.stats.delivered, color:'var(--accent)' },
                    { label:'Opened', value: seq.stats.opened, color:'var(--success)' },
                    { label:'Clicked', value: seq.stats.clicked, color:'var(--accent)' },
                    { label:'Replied', value: seq.stats.replied, color:'var(--success)' },
                    { label:'Bounced', value: seq.stats.bounced, color:'var(--danger)' },
                  ].map(s => (
                    <div key={s.label} style={{textAlign:'center',padding:'6px 0',background:'var(--bg-canvas)',borderRadius:6}}>
                      <div style={{fontSize:16,fontWeight:700,color:s.color}}>{s.value}</div>
                      <div style={{fontSize:10,color:'var(--text-tertiary)'}}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {(seq.stats.open_rate > 0 || seq.stats.reply_rate > 0) && (
                  <div style={{display:'flex',gap:12,marginTop:8,fontSize:11,color:'var(--text-tertiary)'}}>
                    {seq.stats.open_rate > 0 && <span>Open rate: <strong style={{color:'var(--text-primary)'}}>{(seq.stats.open_rate * 100).toFixed(1)}%</strong></span>}
                    {seq.stats.click_rate > 0 && <span>Click rate: <strong style={{color:'var(--text-primary)'}}>{(seq.stats.click_rate * 100).toFixed(1)}%</strong></span>}
                    {seq.stats.reply_rate > 0 && <span>Reply rate: <strong style={{color:'var(--text-primary)'}}>{(seq.stats.reply_rate * 100).toFixed(1)}%</strong></span>}
                    {seq.stats.bounce_rate > 0 && <span>Bounce rate: <strong style={{color:'var(--danger)'}}>{(seq.stats.bounce_rate * 100).toFixed(1)}%</strong></span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showCreate && <CreateSequenceModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadSequences(); }} />}
      {addToSequence && <AddToSequenceModal sequence={addToSequence} onClose={() => setAddToSequence(null)} />}
    </div>
  );
}
