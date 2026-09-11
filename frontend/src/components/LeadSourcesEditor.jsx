import { useState, useEffect } from 'react';
import useStore from '../store/useStore';
import { showToast } from './Toast';
import { DEFAULT_LEAD_SOURCES } from '../utils/constants';

export default function LeadSourcesEditor() {
  const workspace = useStore(s => s.workspace);
  const updateWorkspaceProfile = useStore(s => s.updateWorkspaceProfile);
  const [saving, setSaving] = useState(false);

  const sources = workspace?.company_profile?.lead_sources || [...DEFAULT_LEAD_SOURCES];
  const [localSources, setLocalSources] = useState(sources);

  useEffect(() => {
    setLocalSources(sources);
  }, [JSON.stringify(sources)]);

  const hasChanges = JSON.stringify(localSources) !== JSON.stringify(sources);

  const addSource = () => {
    setLocalSources(prev => [...prev, 'New Source']);
  };

  const updateSource = (idx, value) => {
    setLocalSources(prev => prev.map((s, i) => i === idx ? value : s));
  };

  const deleteSource = (idx) => {
    setLocalSources(prev => prev.filter((_, i) => i !== idx));
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateWorkspaceProfile({ lead_sources: localSources });
      showToast('Lead sources saved');
    } catch (e) {
      showToast('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setLocalSources([...DEFAULT_LEAD_SOURCES]);
    showToast('Reset to defaults');
  };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>Lead Sources</div>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>Customize the options shown when creating a contact.</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={resetToDefaults} style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',fontSize:12}}>
            Reset to defaults
          </button>
          <button onClick={addSource} style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',cursor:'pointer',fontSize:12}}>
            + Add source
          </button>
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {localSources.map((source, idx) => (
          <div key={idx} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-card)'}}>
            <input value={source} onChange={e => updateSource(idx, e.target.value)} style={{flex:1,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',fontSize:13}} />
            <button onClick={() => deleteSource(idx)} title="Delete" style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',fontSize:16,padding:'0 4px'}}>&times;</button>
          </div>
        ))}
      </div>

      <button onClick={save} disabled={!hasChanges || saving} style={{marginTop:16,padding:'8px 20px',borderRadius:8,border:'none',background: hasChanges ? 'var(--accent)' : 'var(--bg-sunken)',color: hasChanges ? '#fff' : 'var(--text-secondary)',cursor: hasChanges ? 'pointer' : 'not-allowed',fontSize:13,fontWeight:500}}>
        {saving ? 'Saving...' : 'Save Sources'}
      </button>
    </div>
  );
}
