import { useState, useEffect, useMemo } from 'react';
import useStore from '../store/useStore';
import { showToast } from './Toast';
import { DEFAULT_PIPELINE_STAGES } from '../utils/constants';

const PROBABILITY_OPTIONS = [0,10,20,30,40,50,60,70,80,90,100];

export default function PipelineStagesEditor() {
  const workspace = useStore(s => s.workspace);
  const prospects = useStore(s => s.prospects);
  const updateWorkspaceProfile = useStore(s => s.updateWorkspaceProfile);
  const updateProspect = useStore(s => s.updateProspect);
  const [saving, setSaving] = useState(false);

  const stages = workspace?.company_profile?.pipeline_stages || [...DEFAULT_PIPELINE_STAGES];
  const hideLeadStage = workspace?.company_profile?.hideLeadStage || false;
  const [localStages, setLocalStages] = useState(stages);
  const [localHideLead, setLocalHideLead] = useState(hideLeadStage);
  const [dragIdx, setDragIdx] = useState(null);
  const [remapModal, setRemapModal] = useState(null); // { affectedStageId, dealCount, stageLabel, options }

  // Sync localStages when workspace changes externally (e.g. loadWorkspaces re-fetch)
  useEffect(() => {
    setLocalStages(stages);
  }, [JSON.stringify(stages)]);

  useEffect(() => {
    setLocalHideLead(hideLeadStage);
  }, [hideLeadStage]);

  const hasChanges = JSON.stringify(localStages) !== JSON.stringify(stages) || localHideLead !== hideLeadStage;

  // Count deals per stage
  const dealCounts = useMemo(() => {
    const counts = {};
    prospects.forEach(p => { if (p.stage) counts[p.stage] = (counts[p.stage] || 0) + 1; });
    return counts;
  }, [prospects]);

  // Detect old stages (present in current config but missing from localStages)
  const orphanedStages = useMemo(() => {
    const newIds = new Set(localStages.map(s => s.id));
    return stages.filter(s => !newIds.has(s.id) && dealCounts[s.id] > 0);
  }, [stages, localStages, dealCounts]);

  const update = (idx, field, value) => {
    setLocalStages(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  };

  const addStage = () => {
    const existingIds = localStages.map(s => s.id);
    let newId = 'custom_stage';
    let counter = 1;
    while (existingIds.includes(newId)) { newId = `custom_stage_${counter}`; counter++; }
    const newStage = {
      id: newId,
      name: 'New Stage',
      probability: 50,
      order: localStages.length - 2,
    };
    const updated = [...localStages];
    updated.splice(updated.length - 2, 0, newStage);
    setLocalStages(updated.map((s, i) => ({ ...s, order: i })));
  };

  const deleteStage = (idx) => {
    const stage = localStages[idx];
    if (stage.isSystem) { showToast('Cannot delete system stages'); return; }
    const dealCount = dealCounts[stage.id] || 0;
    if (dealCount > 0) {
      const options = localStages.filter(s => s.id !== stage.id);
      setRemapModal({ affectedStageId: stage.id, dealCount, stageLabel: stage.name, options, type: 'delete' });
      return;
    }
    setLocalStages(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })));
  };

  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    const updated = [...localStages];
    const [moved] = updated.splice(dragIdx, 1);
    updated.splice(idx, 0, moved);
    setLocalStages(updated.map((s, i) => ({ ...s, order: i })));
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  const handleRemapConfirm = async (targetStageId) => {
    if (!remapModal) return;
    const { affectedStageId } = remapModal;
    // Migrate all prospects with old stage to new stage
    const toMigrate = prospects.filter(p => p.stage === affectedStageId);
    for (const p of toMigrate) {
      try {
        await updateProspect(p.id, { stage: targetStageId });
      } catch (e) {
        console.error('Failed to migrate prospect', p.id, e);
      }
    }
    // Remove the old stage from localStages
    setLocalStages(prev => prev.filter(s => s.id !== affectedStageId).map((s, i) => ({ ...s, order: i })));
    setRemapModal(null);
    showToast(`Moved ${toMigrate.length} deal(s) to "${localStages.find(s => s.id === targetStageId)?.name || targetStageId}"`);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Migrate orphaned stages: move deals to first available stage
      for (const orphan of orphanedStages) {
        const targetId = localStages.find(s => s.id !== orphan.id)?.id;
        if (targetId) {
          const toMigrate = prospects.filter(p => p.stage === orphan.id);
          for (const p of toMigrate) {
            try { await updateProspect(p.id, { stage: targetId }); } catch (e) { console.error(e); }
          }
        }
      }
      await updateWorkspaceProfile({ pipeline_stages: localStages, hideLeadStage: localHideLead });
      showToast('Pipeline stages saved');
    } catch (e) {
      showToast('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setLocalStages([...DEFAULT_PIPELINE_STAGES]);
    showToast('Reset to defaults');
  };

  return (
    <div>
      {/* Remap modal */}
      {remapModal && (
        <div style={{position:'fixed',inset:0,zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)'}}>
          <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:24,maxWidth:420,width:'90%'}}>
            <div style={{fontSize:16,fontWeight:600,color:'var(--text-primary)',marginBottom:8}}>
              {remapModal.dealCount} deal(s) in "{remapModal.stageLabel}"
            </div>
            <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:16}}>
              This stage has active deals. Where should they move?
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
              {remapModal.options.map(s => (
                <button key={s.id} onClick={() => handleRemapConfirm(s.id)} style={{
                  padding:'8px 12px',borderRadius:8,border:'1px solid var(--border)',
                  background:'var(--bg-surface)',color:'var(--text-primary)',cursor:'pointer',textAlign:'left',fontSize:13
                }}>
                  {s.name}
                </button>
              ))}
            </div>
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <button onClick={() => setRemapModal(null)} style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',fontSize:13}}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)'}}>Pipeline Stages</div>
          <div style={{fontSize:12,color:'var(--text-secondary)'}}>Customize your deal stages. Drag to reorder.</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={resetToDefaults} style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',cursor:'pointer',fontSize:12}}>
            Reset to defaults
          </button>
          <button onClick={addStage} style={{padding:'6px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',cursor:'pointer',fontSize:12}}>
            + Add stage
          </button>
        </div>
      </div>

      {/* Orphaned stages warning */}
      {orphanedStages.length > 0 && (
        <div style={{padding:'10px 14px',borderRadius:8,background:'var(--warning-tint, #fff3cd)',border:'1px solid var(--warning, #ffc107)',marginBottom:12,fontSize:12,color:'var(--text-primary)'}}>
          {orphanedStages.length} old stage(s) have deals that will be moved to the first available stage when saved.
        </div>
      )}

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-card)',marginBottom:10}}>
        <div>
          <div style={{fontSize:13,fontWeight:500,color:'var(--text-primary)'}}>Show "Lead" stage in Pipeline</div>
          <div style={{fontSize:11,color:'var(--text-secondary)'}}>Turn off to hide the Lead column from the pipeline view</div>
        </div>
        <div
          onClick={() => setLocalHideLead(prev => !prev)}
          style={{
            width:40,height:22,borderRadius:11,cursor:'pointer',position:'relative',transition:'background 0.2s',
            background: localHideLead ? 'var(--bg-sunken)' : 'var(--accent)',
            border: '1px solid var(--border)',
          }}
        >
          <div style={{
            width:16,height:16,borderRadius:'50%',background:'#fff',position:'absolute',top:2,
            left: localHideLead ? 2 : 20, transition:'left 0.2s',
            boxShadow:'0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {localStages.map((stage, idx) => {
          const dealCount = dealCounts[stage.id] || 0;
          return (
            <div key={stage.id} draggable onDragStart={() => handleDragStart(idx)} onDragOver={(e) => handleDragOver(e, idx)} onDragEnd={handleDragEnd} style={{
              display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:8,
              border:'1px solid var(--border)',background: dragIdx === idx ? 'var(--bg-sunken)' : 'var(--bg-card)',
              opacity: dragIdx === idx ? 0.7 : 1,cursor:'grab'
            }}>
              <span style={{color:'var(--text-tertiary)',cursor:'grab',fontSize:14}}>⋮⋮</span>
              <input value={stage.name} onChange={e => update(idx, 'name', e.target.value)} style={{flex:1,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',fontSize:13}} />
              <select value={stage.probability} onChange={e => update(idx, 'probability', Number(e.target.value))} style={{width:70,padding:'4px 8px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-primary)',fontSize:12}}>
                {PROBABILITY_OPTIONS.map(p => <option key={p} value={p}>{p}%</option>)}
              </select>
              {dealCount > 0 && <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{dealCount} deal{dealCount !== 1 ? 's' : ''}</span>}
              {!stage.isSystem && (
                <button onClick={() => deleteStage(idx)} title="Delete stage" style={{background:'none',border:'none',color:'var(--danger)',cursor:'pointer',fontSize:16,padding:'0 4px'}}>×</button>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={save} disabled={!hasChanges || saving} style={{marginTop:16,padding:'8px 20px',borderRadius:8,border:'none',background: hasChanges ? 'var(--accent)' : 'var(--bg-sunken)',color: hasChanges ? '#fff' : 'var(--text-secondary)',cursor: hasChanges ? 'pointer' : 'not-allowed',fontSize:13,fontWeight:500}}>
        {saving ? 'Saving...' : 'Save Stages'}
      </button>
    </div>
  );
}
