import { useState, useMemo } from 'react';
import useStore from '../store/useStore';
import { formatMoney, daysInStage, esc, timeAgo, linkedinUrl, getUnifiedDeals } from '../utils/helpers';
import { STAGE_LABELS, PIPELINE_STAGES } from '../utils/constants';
import { showToast } from '../components/Toast';
import AIButton, { AIResultModal } from '../components/AIButton';
import MeetingBriefModal from '../components/MeetingBriefModal';
import { generateMeetingBrief, assessDealRisk } from '../utils/ai';

const PRIORITIES = ['low','medium','high','critical'];
const PRIORITY_COLORS = { low:'var(--text-muted)', medium:'var(--accent)', high:'var(--warning)', critical:'var(--danger)' };
const PRIORITY_BG = { low:'var(--bg-sunken)', medium:'color-mix(in srgb, var(--accent) 12%, transparent)', high:'color-mix(in srgb, var(--warning) 12%, transparent)', critical:'color-mix(in srgb, var(--danger) 12%, transparent)' };

function StatBox({ label, value, accent }) {
  return (
    <div style={{
      flex:1,padding:'12px 14px',borderRadius:10,
      background:'var(--bg-surface)',border:'1px solid var(--border)',
    }}>
      <div style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:500,marginBottom:2}}>{label}</div>
      <div style={{fontSize:18,fontWeight:600,color:accent || 'var(--text-primary)',letterSpacing:-0.3}}>{value}</div>
    </div>
  );
}

function EditableValue({ prospect, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(prospect.dealValue || ''));

  if (editing) {
    return (
      <div>
        <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:3,letterSpacing:0.2,textTransform:'uppercase'}}>Deal Value</div>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <span style={{fontSize:13,color:'var(--text-tertiary)'}}>$</span>
          <input type="number" min="0" value={val} autoFocus
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { const n = Number(val); if (!isNaN(n) && n >= 0) { onSave('dealValue', n); showToast('Updated'); } setEditing(false); }
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={() => setEditing(false)}
            style={{width:90,padding:'3px 6px',fontSize:13,fontWeight:600,background:'var(--bg-surface)',color:'var(--accent)',border:'1.5px solid var(--accent)',borderRadius:6,outline:'none',fontFamily:'inherit'}}
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{cursor:'pointer'}} onClick={() => { setVal(String(prospect.dealValue || '')); setEditing(true); }}>
      <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:3,letterSpacing:0.2,textTransform:'uppercase'}}>Deal Value</div>
      <div style={{display:'flex',alignItems:'center',gap:4}}>
        <span style={{fontSize:20,fontWeight:700,color:'var(--accent)',letterSpacing:-0.5}}>{formatMoney(prospect.dealValue)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12" style={{opacity:0.2}}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
      </div>
    </div>
  );
}

function DealDetail({ prospect, onUpdate }) {
  const [localNotes, setLocalNotes] = useState(prospect.notes || '');
  const [priority, setPriority] = useState(prospect.priority || 'medium');
  const [aiResult, setAiResult] = useState(null);
  const [aiTitle, setAiTitle] = useState('');
  const [briefContent, setBriefContent] = useState(null);
  const contacts = prospect._contacts || [prospect];

  const save = (field, value) => {
    contacts.forEach(c => onUpdate(c.id, { [field]: value }));
  };
  const stageIdx = PIPELINE_STAGES.indexOf(prospect.stage);
  const progress = stageIdx >= 0 ? ((stageIdx + 1) / (PIPELINE_STAGES.length - 2)) * 100 : 0;
  const touches = (prospect.touchpoints || []).slice(-8).reverse();
  const activeStages = PIPELINE_STAGES.filter(s => s !== 'lead');

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between'}}>
        <div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <div style={{
              width:44,height:44,borderRadius:12,
              background:'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 65%, #fff))',
              color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:18,fontWeight:700,
              boxShadow:'0 3px 10px color-mix(in srgb, var(--accent) 25%, transparent)',
            }}>
              {(prospect.company || prospect.name)[0].toUpperCase()}
            </div>
            <div>
              <div style={{fontSize:18,fontWeight:600,color:'var(--text-primary)',letterSpacing:-0.3}}>{esc(prospect.company || prospect.name)}</div>
              <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                <span style={{fontSize:13,color:'var(--text-tertiary)'}}>{esc(prospect.name)}</span>
                {prospect.title && <><span style={{width:3,height:3,borderRadius:'50%',background:'var(--border)'}} /><span style={{fontSize:12,color:'var(--text-tertiary)'}}>{esc(prospect.title)}</span></>}
              </div>
            </div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <AIButton label="AI" size="small" prospect={prospect}
            onResult={(r, opt) => { if (opt === 'Meeting Prep Brief') setBriefContent(r); else { setAiResult(r); setAiTitle('Assessment'); } }}
            options={[{ label:'Meeting Prep Brief', fn:(p) => generateMeetingBrief(p) }, { label:'Deal Risk Assessment', fn:(p) => assessDealRisk(p) }]}
          />
          <span style={{
            padding:'3px 10px',borderRadius:6,fontSize:11,fontWeight:600,
            background:PRIORITY_BG[priority],color:PRIORITY_COLORS[priority],
            textTransform:'capitalize',
          }}>{priority}</span>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1.2fr 0.8fr 1fr',gap:10}}>
        <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border)'}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Deal Info</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:2}}>Stage</div>
              <select style={{
                width:'100%',padding:'4px 6px',fontSize:12,fontWeight:500,borderRadius:6,
                background:'var(--bg-canvas)',border:'1.5px solid var(--border)',
                color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer',
              }} value={prospect.stage} onChange={e => save('stage', e.target.value)}>
                {activeStages.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:2}}>Priority</div>
              <select style={{
                width:'100%',padding:'4px 6px',fontSize:12,fontWeight:500,borderRadius:6,
                background:'var(--bg-canvas)',border:'1.5px solid var(--border)',
                color:'var(--text-primary)',outline:'none',fontFamily:'inherit',cursor:'pointer',
              }} value={priority} onChange={e => { setPriority(e.target.value); save('priority', e.target.value); }}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <EditableValue prospect={prospect} onSave={save} />
            <div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:2}}>Days in stage</div>
              <div style={{fontWeight:600,fontSize:13,color:'var(--text-primary)'}}>{daysInStage(prospect)}</div>
            </div>
          </div>
          <div style={{marginTop:12}}>
            <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:4}}>Progress</div>
            <div style={{height:6,borderRadius:3,background:'var(--border)',overflow:'hidden'}}>
              <div style={{height:'100%',borderRadius:3,width:`${Math.min(progress,100)}%`,background:progress >= 70 ? '#22c55e' : progress >= 40 ? 'var(--accent)' : 'var(--text-muted)',transition:'width 0.3s'}} />
            </div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:2}}>
              <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{STAGE_LABELS[prospect.stage]}</span>
              <span style={{fontSize:11,color:'var(--text-tertiary)',fontWeight:500}}>{Math.round(progress)}%</span>
            </div>
          </div>
        </div>

        <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border)'}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>
            Contacts{contacts.length > 1 ? ` (${contacts.length})` : ''}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:contacts.length > 1 ? 10 : 6}}>
            {contacts.map((c, i) => (
              <div key={c.id || i} style={contacts.length > 1 ? {padding:'8px 10px',borderRadius:8,background:'var(--bg-canvas)',border:'1px solid var(--border)'} : {}}>
                {contacts.length > 1 && <div style={{fontSize:11,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>{esc(c.name)}{c.title ? <span style={{fontWeight:400,color:'var(--text-tertiary)'}}> · {esc(c.title)}</span> : ''}</div>}
                {c.email && (
                  <div style={{fontSize:12,color:'var(--accent)',wordBreak:'break-all'}}>{esc(c.email)}</div>
                )}
                {c.phone && (
                  <div style={{fontSize:12,color:'var(--text-primary)',marginTop:2}}>{esc(c.phone)}</div>
                )}
                {c.linkedin && (
                  <a href={linkedinUrl(c.linkedin)} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'var(--accent)',wordBreak:'break-all',textDecoration:'none',marginTop:2,display:'block'}}>{esc(c.linkedin)}</a>
                )}
              </div>
            ))}
            {contacts.every(c => !c.email && !c.phone && !c.linkedin) && (
              <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'4px 0'}}>No contact details</div>
            )}
          </div>
        </div>

        <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border)'}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Strategy</div>
          {prospect.angle ? (
            <div style={{fontSize:12.5,color:'var(--text-primary)',lineHeight:1.5}}>{esc(prospect.angle)}</div>
          ) : (
            <div style={{fontSize:12,color:'var(--text-tertiary)'}}>No angle defined</div>
          )}
          {prospect.tier && (
            <div style={{marginTop:8,display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:11,color:'var(--text-tertiary)'}}>Tier:</span>
              <span style={{
                fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:4,
                background: prospect.tier === 'hot' ? 'var(--danger-tint)' : prospect.tier === 'warm' ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--bg-canvas)',
                color: prospect.tier === 'hot' ? 'var(--danger)' : prospect.tier === 'warm' ? 'var(--accent)' : 'var(--text-tertiary)',
                textTransform:'capitalize',
              }}>{prospect.tier}</span>
            </div>
          )}
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1.2fr 1fr',gap:10}}>
        <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border)'}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Notes</div>
          <textarea style={{
            width:'100%',padding:'8px 10px',fontSize:13,borderRadius:8,resize:'vertical',
            background:'var(--bg-canvas)',border:'1.5px solid var(--border)',
            color:'var(--text-primary)',outline:'none',fontFamily:'inherit',boxSizing:'border-box',minHeight:80,
          }} value={localNotes} onChange={e => setLocalNotes(e.target.value)} onBlur={() => save('notes', localNotes)} placeholder="Internal notes about this deal..." />
        </div>

        <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border)'}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>
            Tags
            {prospect.tags?.length > 0 && <span style={{fontWeight:400,marginLeft:4,color:'var(--text-tertiary)'}}>({prospect.tags.length})</span>}
          </div>
          {prospect.tags && prospect.tags.length > 0 ? (
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {prospect.tags.map((tag, i) => (
                <span key={i} style={{
                  fontSize:11,padding:'3px 8px',borderRadius:5,
                  background:'var(--accent-tint)',color:'var(--accent)',
                }}>{tag}</span>
              ))}
            </div>
          ) : (
            <div style={{fontSize:12,color:'var(--text-tertiary)'}}>No tags</div>
          )}
          {prospect.customFields && Object.keys(prospect.customFields).length > 0 && (
            <div style={{marginTop:10,borderTop:'1px solid var(--border)',paddingTop:10}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:6,letterSpacing:0.2,textTransform:'uppercase'}}>Custom Fields</div>
              {Object.entries(prospect.customFields).map(([k, v]) => (
                <div key={k} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'2px 0',fontSize:12}}>
                  <span style={{color:'var(--text-tertiary)'}}>{k}</span>
                  <span style={{color:'var(--text-primary)',fontWeight:500}}>{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border)'}}>
        <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Recent Activity</div>
        {touches.length === 0 ? (
          <div style={{textAlign:'center',padding:'16px 0'}}>
            <div style={{fontSize:13,color:'var(--text-tertiary)'}}>No touchpoints recorded yet</div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {touches.map((t, i) => (
              <div key={i} style={{
                display:'flex',alignItems:'center',gap:10,
                padding:'8px 10px',borderRadius:8,
                background:'var(--bg-canvas)',
              }}>
                <span style={{
                  padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:600,
                  background:'var(--accent-tint)',color:'var(--accent)',whiteSpace:'nowrap',
                }}>{t.channel}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12.5,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{esc(t.note)}</div>
                </div>
                <div style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap',flexShrink:0}}>{timeAgo(t.created_at || t.date)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {aiResult && <AIResultModal title={aiTitle} content={aiResult} onClose={() => setAiResult(null)} />}
      {briefContent && <MeetingBriefModal content={briefContent} onClose={() => setBriefContent(null)} />}
    </div>
  );
}

export default function DealRooms() {
  const prospects = useStore(s => s.prospects);
  const deals = useStore(s => s.deals);
  const companies = useStore(s => s.companies);
  const allItems = useMemo(() => getUnifiedDeals(prospects, deals, companies), [prospects, deals, companies]);
  const updateProspect = useStore(s => s.updateProspect);
  const [selectedId, setSelectedId] = useState(null);

  const DEAL_ROOM_STAGES = ['engaged','meeting','proposal','negotiation','won'];
  const activeDeals = allItems.filter(p => DEAL_ROOM_STAGES.includes(p.stage));

  const companyMap = new Map();
  activeDeals.forEach(p => {
    const key = (p.company || p.name || '').trim().toLowerCase();
    if (!key) return;
    if (!companyMap.has(key)) {
      companyMap.set(key, { ...p, _contacts: [p] });
    } else {
      const existing = companyMap.get(key);
      existing._contacts.push(p);
      const stageOrder = PIPELINE_STAGES;
      if (stageOrder.indexOf(p.stage) > stageOrder.indexOf(existing.stage)) {
        existing.stage = p.stage;
        existing._primaryContact = p;
      }
      existing.dealValue = Math.max(existing.dealValue || 0, p.dealValue || 0);
    }
  });
  const groupedDeals = [...companyMap.values()].sort((a, b) => (b.dealValue || 0) - (a.dealValue || 0));
  const selected = groupedDeals.find(d => d.id === selectedId);

  const totalValue = groupedDeals.reduce((a, p) => a + (p.dealValue || 0), 0);
  const highCount = groupedDeals.filter(p => p.priority === 'high' || p.priority === 'critical').length;
  const avgValue = groupedDeals.length > 0 ? Math.round(totalValue / groupedDeals.length) : 0;

  const handleUpdate = (id, fields) => updateProspect(id, fields);

  return (
    <div style={{padding:'24px 32px'}}>
      <div style={{marginBottom:20}}>
        <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:0}}>Deal Rooms</h1>
        <div style={{fontSize:13,color:'var(--text-tertiary)',marginTop:2}}>{groupedDeals.length} active deals</div>
      </div>

      <div style={{display:'flex',gap:10,marginBottom:20}}>
        <StatBox label="Active Deals" value={groupedDeals.length} />
        <StatBox label="Total Pipeline" value={formatMoney(totalValue)} accent="var(--accent)" />
        <StatBox label="High Priority" value={highCount} accent={highCount > 0 ? 'var(--warning)' : null} />
        <StatBox label="Avg Deal Size" value={formatMoney(avgValue)} />
      </div>

      {groupedDeals.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:12}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="40" height="40" style={{color:'var(--text-tertiary)',opacity:0.3,marginBottom:12}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <div style={{fontSize:16,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>No active deals</div>
          <div style={{fontSize:13,color:'var(--text-tertiary)'}}>Move prospects to the pipeline to track them here.</div>
        </div>
      ) : (
        <div style={{display:'flex',gap:20,alignItems:'flex-start'}}>
          <div style={{width:360,flexShrink:0}}>
            <div style={{padding:'12px 14px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border)'}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.3,textTransform:'uppercase'}}>Active Deals</div>
              <div style={{display:'flex',flexDirection:'column',gap:4,maxHeight:'calc(100vh - 260px)',overflowY:'auto'}}>
                {groupedDeals.map((p) => (
                  <div key={p.id} onClick={() => setSelectedId(p.id)} style={{
                    display:'flex',alignItems:'center',gap:10,
                    padding:'10px 12px',borderRadius:8,
                    background: selectedId === p.id ? 'var(--accent-tint)' : 'transparent',
                    border: selectedId === p.id ? '1px solid color-mix(in srgb, var(--accent) 20%, transparent)' : '1px solid transparent',
                    cursor:'pointer',transition:'all 0.15s',
                  }}
                    onMouseEnter={e => { if (selectedId !== p.id) e.currentTarget.style.background = 'var(--bg-canvas)'; }}
                    onMouseLeave={e => { if (selectedId !== p.id) e.currentTarget.style.background = 'transparent'; }}>
                    <div style={{
                      width:32,height:32,borderRadius:8,
                      background: selectedId === p.id ? 'var(--accent)' : 'var(--accent-tint)',
                      color: selectedId === p.id ? '#fff' : 'var(--accent)',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:13,fontWeight:600,flexShrink:0,transition:'all 0.15s',
                    }}>{(p.company || p.name)[0].toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {esc(p.company || p.name)}
                      </div>
                      <div style={{fontSize:11.5,color:'var(--text-tertiary)'}}>
                        {p._contacts.length > 1 ? `${p._contacts.length} contacts` : esc(p._contacts[0]?.name || '')}
                      </div>
                    </div>
                    <div style={{fontSize:12,fontWeight:600,color:'var(--accent)',flexShrink:0}}>{formatMoney(p.dealValue)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={{flex:1,minWidth:0}}>
            {selected ? (
              <DealDetail prospect={selected} onUpdate={handleUpdate} />
            ) : (
              <div style={{textAlign:'center',padding:'48px 20px',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10}}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="28" height="28" style={{color:'var(--text-tertiary)',opacity:0.25,marginBottom:8}}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <div style={{fontSize:13,color:'var(--text-tertiary)'}}>Select a deal to open its room</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}