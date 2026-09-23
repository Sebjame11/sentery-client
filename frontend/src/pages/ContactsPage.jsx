import { useState, useMemo, useEffect } from 'react';
import useStore from '../store/useStore';
import { esc, timeAgo, formatMoney, daysInStage, countryFlag, linkedinUrl } from '../utils/helpers';
import { STAGE_LABELS, PIPELINE_STAGES } from '../utils/constants';
import ContactEditModal from '../components/ContactEditModal';
import ProspectSearchModal from '../components/ProspectSearchModal';
import ComposeEmailModal from '../components/ComposeEmailModal';
import Pagination from '../components/Pagination';
import { isApolloConfiguredAsync } from '../utils/apollo';

const CONTACT_PAGE_SIZE = 30;

const TIER_STYLES = {
  hot: { bg:'color-mix(in srgb, var(--danger) 12%, transparent)', color:'var(--danger)', dot:'var(--danger)', label:'Hot' },
  warm: { bg:'color-mix(in srgb, var(--warning) 12%, transparent)', color:'var(--warning)', dot:'var(--warning)', label:'Warm' },
  cold: { bg:'color-mix(in srgb, var(--accent) 12%, transparent)', color:'var(--accent)', dot:'var(--accent)', label:'Cold' },
};

const STAGE_COLORS = {
  lead:'var(--text-tertiary)', contacted:'var(--accent)', engaged:'var(--accent)',
  meeting:'var(--warning)', proposal:'var(--warning)', negotiation:'var(--success)',
  won:'var(--success)', lost:'var(--danger)',
};

export default function ContactsPage() {
  const prospects = useStore(s => s.prospects);
  const companies = useStore(s => s.companies);
  const setDetailId = useStore(s => s.setDetailId);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('all');
  const [filterTier, setFilterTier] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [view, setView] = useState('grid');
  const [detailTab, setDetailTab] = useState('overview');
  const [showSearch, setShowSearch] = useState(false);
  const [showComposeEmail, setShowComposeEmail] = useState(false);
  const [apolloConfigured, setApolloConfigured] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => { isApolloConfiguredAsync().then(setApolloConfigured); }, []);
  useEffect(() => { setPage(1); }, [search, filterCompany, filterTier]);

  const companyNames = useMemo(() => {
    const names = new Set(prospects.map(p => p.company).filter(Boolean));
    companies.forEach(c => names.add(c.name));
    return [...names].sort();
  }, [prospects, companies]);

  const filtered = useMemo(() => {
    return prospects.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.company || '').toLowerCase().includes(q) && !(p.email || '').toLowerCase().includes(q) && !(p.title || '').toLowerCase().includes(q) && !(Array.isArray(p.tags) ? p.tags : []).some(t => String(typeof t === 'object' ? t.name : t).toLowerCase().includes(q))) return false;
      }
      if (filterCompany !== 'all' && p.company !== filterCompany) return false;
      if (filterTier !== 'all' && p.tier !== filterTier) return false;
      return true;
    });
  }, [prospects, search, filterCompany, filterTier]);

  const paged = useMemo(() => {
    const start = (page - 1) * CONTACT_PAGE_SIZE;
    return filtered.slice(start, start + CONTACT_PAGE_SIZE);
  }, [filtered, page]);

  const selected = selectedId ? prospects.find(p => p.id === selectedId) : null;
  const companyInfo = selected ? companies.find(c => c.name === selected.company) : null;

  // ── tags ──
  const [tagInput, setTagInput] = useState('');
  const updateProspect = useStore(s => s.updateProspect);
  const tagList = (p) => (Array.isArray(p?.tags) ? p.tags : [])
    .map(t => (t && typeof t === 'object' ? t.name : String(t || '')))
    .map(t => t.trim()).filter(Boolean);
  const addTag = () => {
    const t = tagInput.trim();
    if (!selected || !t) return;
    if (tagList(selected).some(x => x.toLowerCase() === t.toLowerCase())) { setTagInput(''); return; }
    updateProspect(selected.id, { tags: [...tagList(selected), t] });
    setTagInput('');
  };
  const removeTag = (t) => {
    if (!selected) return;
    updateProspect(selected.id, { tags: tagList(selected).filter(x => x.toLowerCase() !== t.toLowerCase()) });
  };

  const stats = useMemo(() => {
    const total = prospects.length;
    const pipeline = prospects.reduce((s, p) => s + (p.dealValue || 0), 0);
    const hot = prospects.filter(p => p.tier === 'hot').length;
    const warm = prospects.filter(p => p.tier === 'warm').length;
    const active = prospects.filter(p => !['won','lost'].includes(p.stage)).length;
    const won = prospects.filter(p => p.stage === 'won').length;
    return { total, pipeline, hot, warm, active, won };
  }, [prospects]);

  const lastTouch = (p) => {
    if (!p.touchpoints || p.touchpoints.length === 0) return null;
    // Store is oldest-first; last element is newest (also pick by date for safety)
    return p.touchpoints.reduce((a, b) => {
      const da = a.date || a.created_at || '';
      const db = b.date || b.created_at || '';
      if (da !== db) return da > db ? a : b;
      const ca = a.created_at || '';
      const cb = b.created_at || '';
      return cb > ca ? b : a;
    });
  };

  return (
    <div style={{padding:'24px 32px',display:'flex',flexDirection:'column',height:'100%',animation:'fadeSlideUp 0.3s ease-out'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:0}}>Contacts</h1>
          <div style={{fontSize:13,color:'var(--text-tertiary)',marginTop:2}}>{stats.total} people across {companyNames.length} companies &middot; {stats.active} active deals</div>
        </div>
        {apolloConfigured && (
          <button className="btn-secondary" onClick={() => setShowSearch(true)} style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            Sync from Apollo
          </button>
        )}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        {[
          { label:'Total Contacts', value:stats.total, icon:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
          { label:'Pipeline Value', value:formatMoney(stats.pipeline), icon:'M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', color:'var(--accent)' },
          { label:'Hot Leads', value:stats.hot, icon:'M13 2L3 14h9l-1 8 10-12h-9l1-8z', color:'var(--danger)' },
          { label:'Won Deals', value:stats.won, icon:'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3', color:'var(--success)' },
        ].map((s, i) => (
          <div key={i} style={{padding:'14px 16px',borderRadius:12,background:'var(--bg-surface)',border:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12}}>
            <div style={{width:36,height:36,borderRadius:10,background:s.color ? `color-mix(in srgb, ${s.color} 12%, transparent)` : 'var(--accent-tint)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <svg viewBox="0 0 24 24" fill="none" stroke={s.color || 'var(--accent)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d={s.icon}/></svg>
            </div>
            <div>
              <div style={{fontSize:20,fontWeight:300,color:'var(--text-primary)',lineHeight:1.1,letterSpacing:'-0.02em'}}>{s.value}</div>
              <div style={{fontSize:11,color:'var(--text-tertiary)',marginTop:1}}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
        <div style={{position:'relative',flex:1,maxWidth:320}}>
          <svg style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-tertiary)',pointerEvents:'none'}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search name, company, title, email..." value={search} onChange={e => setSearch(e.target.value)}
            style={{width:'100%',padding:'8px 10px 8px 32px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
          />
        </div>
        <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
          style={{padding:'7px 10px',fontSize:12,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',fontFamily:'inherit',maxWidth:180}}>
          <option value="all">All companies</option>
          {companyNames.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div style={{display:'flex',gap:4}}>
          {['all','hot','warm','cold'].map(t => {
            const s = t === 'all' ? { label:'All', bg:'var(--text-primary)', fg:'var(--bg-canvas)' } : TIER_STYLES[t];
            return (
              <button key={t} onClick={() => setFilterTier(t)} style={{
                padding:'6px 12px',borderRadius:7,fontSize:12,fontWeight:500,border:'1px solid',cursor:'pointer',transition:'all 0.15s',display:'flex',alignItems:'center',gap:5,
                background: filterTier === t ? s.bg : 'var(--bg-surface)',
                color: filterTier === t ? (t === 'all' ? s.fg : s.color) : 'var(--text-secondary)',
                borderColor: filterTier === t ? (t === 'all' ? s.bg : s.color) : 'var(--border)',
              }}>
                {t !== 'all' && <span style={{width:6,height:6,borderRadius:'50%',background:filterTier === t ? '#fff' : s.dot}}></span>}
                {s.label}
              </button>
            );
          })}
        </div>
        <div style={{display:'flex',gap:2,marginLeft:4,padding:3,borderRadius:8,background:'var(--bg-sunken)'}}>
          <button onClick={() => setView('grid')} style={{padding:'5px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,background:view === 'grid' ? 'var(--bg-surface)' : 'transparent',color:view === 'grid' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow:view === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button onClick={() => setView('list')} style={{padding:'5px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,background:view === 'list' ? 'var(--bg-surface)' : 'transparent',color:view === 'list' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow:view === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div style={{display:'flex',gap:14,flex:1,minHeight:0}}>
        <div style={{flex:selected ? '0 0 420px' : '1',minWidth:0,display:'flex',flexDirection:'column',transition:'flex 0.2s'}}>
          {view === 'grid' ? (
            <div style={{display:'grid',gridTemplateColumns: selected ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',gap:10,overflowY:'auto',alignContent:'start',flex:1}}>
              {paged.map(p => {
                const tier = TIER_STYLES[p.tier] || TIER_STYLES.cold;
                const lt = lastTouch(p);
                const flags = (p.countries?.length ? p.countries : (p.country ? [p.country] : [])).slice(0, 2);
                return (
                  <div key={p.id} onClick={() => { setSelectedId(p.id); setDetailTab('overview'); }} style={{
                    padding:'16px',borderRadius:12,cursor:'pointer',
                    background:'var(--bg-surface)',border:selectedId === p.id ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    transition:'all 0.15s',position:'relative',overflow:'hidden',
                  }}
                    onMouseEnter={e => { if (selectedId !== p.id) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.06)'; } }}
                    onMouseLeave={e => { if (selectedId !== p.id) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; } }}
                  >
                    <div style={{position:'absolute',top:0,right:0,padding:'6px 10px 8px 12px',borderRadius:'0 0 0 10px',background:tier.bg}}>
                      <span style={{fontSize:10,fontWeight:700,color:tier.color,textTransform:'uppercase',letterSpacing:0.3}}>{tier.label}</span>
                    </div>

                    <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:12}}>
                      <div style={{
                        width:44,height:44,borderRadius:12,flexShrink:0,
                        background:`linear-gradient(135deg, ${tier.dot}, color-mix(in srgb, ${tier.dot} 55%, #fff))`,
                        display:'flex',alignItems:'center',justifyContent:'center',
                        fontSize:17,fontWeight:700,color:'#fff',
                        boxShadow:`0 2px 8px color-mix(in srgb, ${tier.dot} 25%, transparent)`,
                      }}>{p.name[0]?.toUpperCase()}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:650,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',letterSpacing:-0.2}}>{esc(p.name)}</div>
                        <div style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{esc(p.title)}{p.title && p.company ? ' @ ' : ''}{esc(p.company)}</div>
                      </div>
                    </div>

                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                      <span style={{fontSize:10,fontWeight:600,padding:'3px 8px',borderRadius:5,background:`color-mix(in srgb, ${STAGE_COLORS[p.stage]} 12%, transparent)`,color:STAGE_COLORS[p.stage]}}>{STAGE_LABELS[p.stage] || p.stage}</span>
                      {p.dealValue > 0 && <span style={{fontSize:12,fontWeight:600,color:'var(--accent)'}}>{formatMoney(p.dealValue)}</span>}
                      <span style={{flex:1}}></span>
                      {flags.map(c => <span key={c} className={countryFlag(c)} style={{fontSize:13}} title={c}></span>)}
                    </div>

                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      {p.email && (
                        <div style={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:4}}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="12" height="12" style={{flexShrink:0}}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                          <span style={{fontSize:11,color:'var(--text-tertiary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.email}</span>
                        </div>
                      )}
                    </div>

                    {lt && (
                      <div style={{display:'flex',alignItems:'center',gap:5,marginTop:10,paddingTop:10,borderTop:'1px solid var(--border)'}}>
                        <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:3,background:'var(--accent-tint)',color:'var(--accent)',textTransform:'capitalize'}}>{lt.channel}</span>
                        <span style={{fontSize:11,color:'var(--text-tertiary)',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{esc(lt.note)}</span>
                        <span style={{fontSize:10,color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>{timeAgo(lt.created_at || lt.date)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {paged.length === 0 && (
                <div style={{gridColumn:'1/-1',textAlign:'center',padding:'60px 20px'}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="36" height="36" style={{opacity:0.25,marginBottom:10}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:3}}>No contacts found</div>
                  <div style={{fontSize:12,color:'var(--text-tertiary)'}}>{search || filterCompany !== 'all' || filterTier !== 'all' ? 'Try adjusting your filters' : 'Add your first contact from the Prospects page'}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',gap:3,overflowY:'auto',flex:1}}>
              {paged.map(p => {
                const tier = TIER_STYLES[p.tier] || TIER_STYLES.cold;
                const flags = (p.countries?.length ? p.countries : (p.country ? [p.country] : [])).slice(0, 2);
                return (
                  <div key={p.id} onClick={() => { setSelectedId(p.id); setDetailTab('overview'); }} style={{
                    padding:'10px 14px',borderRadius:10,cursor:'pointer',display:'flex',alignItems:'center',gap:12,
                    background: selectedId === p.id ? 'var(--accent-tint)' : 'var(--bg-surface)',
                    border: selectedId === p.id ? '1px solid var(--accent)' : '1px solid transparent',
                    transition:'all 0.12s',
                  }}
                    onMouseEnter={e => { if (selectedId !== p.id) e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                    onMouseLeave={e => { if (selectedId !== p.id) e.currentTarget.style.background = 'var(--bg-surface)'; }}
                  >
                    <div style={{
                      width:34,height:34,borderRadius:9,flexShrink:0,
                      background:`linear-gradient(135deg, ${tier.dot}, color-mix(in srgb, ${tier.dot} 55%, #fff))`,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:13,fontWeight:700,color:'#fff',overflow:'hidden',
                    }}>{p.name[0]?.toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{esc(p.name)}</span>
                        <span style={{width:6,height:6,borderRadius:'50%',background:tier.dot,flexShrink:0}}></span>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:1}}>
                        {p.company && <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{esc(p.company)}</span>}
                        {p.title && <><span style={{width:2,height:2,borderRadius:'50%',background:'var(--border)'}} /><span style={{fontSize:11,color:'var(--text-tertiary)'}}>{esc(p.title)}</span></>}
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                      {flags.map(c => <span key={c} className={countryFlag(c)} style={{fontSize:12}} title={c}></span>)}
                      <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:`color-mix(in srgb, ${STAGE_COLORS[p.stage]} 12%, transparent)`,color:STAGE_COLORS[p.stage]}}>{STAGE_LABELS[p.stage]}</span>
                      {p.dealValue > 0 && <span style={{fontSize:11,fontWeight:600,color:'var(--accent)',minWidth:60,textAlign:'right'}}>{formatMoney(p.dealValue)}</span>}
                    </div>
                  </div>
                );
              })}
              {paged.length === 0 && (
                <div style={{textAlign:'center',padding:'60px 20px'}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="36" height="36" style={{opacity:0.25,marginBottom:10}}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:3}}>No contacts found</div>
                  <div style={{fontSize:12,color:'var(--text-tertiary)'}}>{search || filterCompany !== 'all' || filterTier !== 'all' ? 'Try adjusting your filters' : 'Add your first contact from the Prospects page'}</div>
                </div>
              )}
            </div>
          )}
          <div style={{padding:'8px 14px',borderTop:'1px solid var(--border)',flexShrink:0}}>
            <Pagination total={filtered.length} page={page} onChange={setPage} />
          </div>
        </div>

        {selected && (
          <div style={{flex:1,minWidth:0,overflowY:'auto',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,padding:0}}>
            <div style={{padding:'20px 24px 0'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:14}}>
                  <div style={{
                    width:52,height:52,borderRadius:14,flexShrink:0,
                    background:`linear-gradient(135deg, ${(TIER_STYLES[selected.tier] || TIER_STYLES.cold).dot}, color-mix(in srgb, ${(TIER_STYLES[selected.tier] || TIER_STYLES.cold).dot} 55%, #fff))`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:20,fontWeight:700,color:'#fff',
                    boxShadow:`0 4px 14px color-mix(in srgb, ${(TIER_STYLES[selected.tier] || TIER_STYLES.cold).dot} 30%, transparent)`,
                  }}>{selected.name[0]?.toUpperCase()}</div>
                  <div>
                    <div style={{fontSize:18,fontWeight:700,color:'var(--text-primary)',letterSpacing:-0.3}}>{esc(selected.name)}</div>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginTop:3}}>
                      {selected.title && <span style={{fontSize:12,color:'var(--text-tertiary)'}}>{esc(selected.title)}</span>}
                      {selected.company && (
                        <span onClick={e => { e.stopPropagation(); useStore.getState().setAppPage('companies'); }} style={{fontSize:12,color:'var(--accent)',fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:4}}>
                          {esc(selected.company)}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                  {selected.email && <button className="btn-xs" onClick={() => setShowComposeEmail(true)} style={{display:'flex',alignItems:'center',gap:4}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="11" height="11"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    Email
                  </button>}
                  <button className="btn-xs" onClick={() => setEditId(selected.id)} style={{display:'flex',alignItems:'center',gap:4}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="11" height="11"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                    Edit
                  </button>
                  <span style={{display:'flex',alignItems:'center',gap:4,padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:600,background:(TIER_STYLES[selected.tier] || TIER_STYLES.cold).bg,color:(TIER_STYLES[selected.tier] || TIER_STYLES.cold).color}}>
                    <span style={{width:6,height:6,borderRadius:'50%',background:'currentColor'}}></span>
                    {(TIER_STYLES[selected.tier] || TIER_STYLES.cold).label}
                  </span>
                </div>
              </div>

              <div style={{display:'flex',gap:4,borderBottom:'1px solid var(--border)',marginBottom:16}}>
                {[{key:'overview',label:'Overview'},{key:'activity',label:`Activity (${selected.touchpoints?.length || 0})`},{key:'notes',label:'Notes'}].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} style={{
                    padding:'8px 14px',fontSize:12,fontWeight:500,border:'none',cursor:'pointer',borderBottom:detailTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',marginBottom:-1,
                    background:'transparent',color:detailTab === tab.key ? 'var(--accent)' : 'var(--text-tertiary)',transition:'all 0.15s',
                  }}>{tab.label}</button>
                ))}
              </div>
            </div>

            <div style={{padding:'0 24px 20px'}}>
              {detailTab === 'overview' && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Contact Info</div>
                      {selected.email && <div style={{marginBottom:6}}><div style={{fontSize:11,color:'var(--text-tertiary)'}}>Email</div><div style={{fontSize:12,color:'var(--accent)',wordBreak:'break-all'}}>{selected.email}</div></div>}
                      {selected.phone && <div style={{marginBottom:6}}><div style={{fontSize:11,color:'var(--text-tertiary)'}}>Phone</div><div style={{fontSize:12,color:'var(--text-primary)'}}>{selected.phone}</div></div>}
                      {selected.linkedin && <div><div style={{fontSize:11,color:'var(--text-tertiary)'}}>LinkedIn</div><a href={linkedinUrl(selected.linkedin)} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'var(--accent)',wordBreak:'break-all',textDecoration:'none'}}>{selected.linkedin}</a></div>}
                      {!selected.email && !selected.phone && !selected.linkedin && <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'4px 0'}}>No contact details</div>}
                    </div>
                    <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Deal Info</div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                        <div>
                          <div style={{fontSize:11,color:'var(--text-tertiary)'}}>Stage</div>
                          <div style={{display:'flex',alignItems:'center',gap:5,marginTop:2}}>
                            <span style={{width:7,height:7,borderRadius:'50%',background:STAGE_COLORS[selected.stage]}}></span>
                            <span style={{fontSize:12,fontWeight:500,color:'var(--text-primary)'}}>{STAGE_LABELS[selected.stage]}</span>
                          </div>
                        </div>
                        {selected.dealValue > 0 && <div><div style={{fontSize:11,color:'var(--text-tertiary)'}}>Deal Value</div><div style={{fontSize:13,fontWeight:600,color:'var(--accent)',marginTop:2}}>{formatMoney(selected.dealValue)}</div></div>}
                        <div><div style={{fontSize:11,color:'var(--text-tertiary)'}}>Days in Stage</div><div style={{fontSize:12,color:'var(--text-primary)',marginTop:2}}>{daysInStage(selected)}d</div></div>
                        {selected.angle && <div style={{gridColumn:'1 / -1'}}><div style={{fontSize:11,color:'var(--text-tertiary)'}}>Angle</div><div style={{fontSize:12,color:'var(--text-primary)',marginTop:2}}>{selected.angle}</div></div>}
                      </div>
                    </div>
                  </div>

                  {companyInfo && (
                    <div onClick={() => useStore.getState().setAppPage('companies')} style={{padding:'12px 14px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)',cursor:'pointer',transition:'border-color 0.15s'}}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:6,letterSpacing:0.2,textTransform:'uppercase'}}>Company</div>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:32,height:32,borderRadius:8,flexShrink:0,background:'var(--accent-tint)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700}}>{companyInfo.name[0].toUpperCase()}</div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,fontWeight:600,color:'var(--accent)'}}>{esc(companyInfo.name)}</div>
                          <div style={{fontSize:11,color:'var(--text-tertiary)'}}>{[companyInfo.industry, companyInfo.companySize].filter(Boolean).join(' · ') || 'No details'}</div>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14" style={{color:'var(--text-tertiary)'}}><polyline points="9 18 15 12 9 6"/></svg>
                      </div>
                    </div>
                  )}

                  <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                    <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Tags</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:5,marginBottom:8}}>
                      {tagList(selected).map((t, i) => (
                        <span key={t + i} style={{fontSize:11,padding:'3px 9px',borderRadius:5,background:'var(--accent-tint)',color:'var(--accent)',fontWeight:500,display:'inline-flex',alignItems:'center',gap:5}}>
                          {t}
                          <span onClick={() => removeTag(t)} title={`Remove ${t}`} style={{cursor:'pointer',opacity:0.55,lineHeight:1,fontWeight:700}}>×</span>
                        </span>
                      ))}
                      {tagList(selected).length === 0 && <span style={{fontSize:11,color:'var(--text-tertiary)'}}>No tags yet</span>}
                    </div>
                    <div style={{display:'flex',gap:6}}>
                      <input type="text" value={tagInput} placeholder="Add a tag and press Enter…" onChange={e => setTagInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                        style={{flex:1,padding:'6px 10px',fontSize:12,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:7,outline:'none',fontFamily:'inherit',minWidth:0}} />
                      <button onClick={addTag} style={{padding:'6px 12px',borderRadius:7,fontSize:11,fontWeight:600,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--text-secondary)',cursor:'pointer',whiteSpace:'nowrap'}}>Add</button>
                    </div>
                  </div>
                </div>
              )}

              {detailTab === 'activity' && (
                <div>
                  {!selected.touchpoints || selected.touchpoints.length === 0 ? (
                    <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-tertiary)',fontSize:13}}>No activity recorded yet.</div>
                  ) : (
                    <div style={{position:'relative',paddingLeft:24}}>
                      <div style={{position:'absolute',left:7,top:4,bottom:4,width:2,background:'var(--border)',borderRadius:1}}></div>
                      {[...selected.touchpoints].reverse().map((t, i) => (
                        <div key={i} style={{position:'relative',marginBottom:16}}>
                          <div style={{position:'absolute',left:-21,top:6,width:10,height:10,borderRadius:'50%',background: t.outcome === 'replied' || t.outcome === 'meeting' ? 'var(--success)' : t.outcome === 'no-reply' ? 'var(--danger)' : 'var(--accent)',border:'2px solid var(--bg-surface)'}}></div>
                          <div style={{padding:'10px 14px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                              <div style={{display:'flex',alignItems:'center',gap:6}}>
                                <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background:'var(--accent-tint)',color:'var(--accent)',textTransform:'capitalize'}}>{t.channel}</span>
                                <span style={{fontSize:10,fontWeight:600,padding:'2px 7px',borderRadius:4,background: t.outcome === 'replied' || t.outcome === 'meeting' ? 'var(--success-tint)' : t.outcome === 'no-reply' ? 'var(--danger-tint)' : 'var(--bg-sunken)',color: t.outcome === 'replied' || t.outcome === 'meeting' ? 'var(--success)' : t.outcome === 'no-reply' ? 'var(--danger)' : 'var(--text-secondary)',textTransform:'capitalize'}}>{t.outcome}</span>
                              </div>
                              <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{t.date}</span>
                            </div>
                            <div style={{fontSize:13,color:'var(--text-primary)',lineHeight:1.5}}>{esc(t.note)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'notes' && (
                <div>
                  {selected.notes || selected.angle ? (
                    <div style={{display:'flex',flexDirection:'column',gap:12}}>
                      {selected.angle && (
                        <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                          <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:6,letterSpacing:0.2,textTransform:'uppercase'}}>Angle / Pitch</div>
                          <div style={{fontSize:13,color:'var(--text-primary)',lineHeight:1.6}}>{esc(selected.angle)}</div>
                        </div>
                      )}
                      {selected.notes && (
                        <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                          <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:6,letterSpacing:0.2,textTransform:'uppercase'}}>Notes</div>
                          <div style={{fontSize:13,color:'var(--text-primary)',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{esc(selected.notes)}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-tertiary)',fontSize:13}}>No notes added yet.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {editId && (() => {
        const p = prospects.find(x => x.id === editId);
        return p ? <ContactEditModal prospect={p} onClose={() => setEditId(null)} /> : null;
      })()}
      {showSearch && <ProspectSearchModal onClose={() => setShowSearch(false)} />}
      {showComposeEmail && selected && <ComposeEmailModal contact={selected} onClose={() => setShowComposeEmail(false)} />}
    </div>
  );
}
