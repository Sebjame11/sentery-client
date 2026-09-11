import { useState, useEffect } from 'react';
import { searchPeople, getApolloLists, getApolloListContacts, enrichPerson, isApolloConfiguredAsync } from '../utils/apollo';
import useStore from '../store/useStore';
import { showToast } from './Toast';
import { countryFlag } from '../utils/helpers';
import { supabase } from '../lib/supabase';

export default function ProspectSearchModal({ onClose }) {
  const addProspect = useStore(s => s.addProspect);
  const existingProspects = useStore(s => s.prospects);
  const [mode, setMode] = useState('search');
  const [keywords, setKeywords] = useState('');
  const [titles, setTitles] = useState('');
  const [locations, setLocations] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [allResults, setAllResults] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [loadingAll, setLoadingAll] = useState(false);
  const [configured, setConfigured] = useState(null);
  const [lists, setLists] = useState([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [selectedList, setSelectedList] = useState(null);
  const [loadingListContacts, setLoadingListContacts] = useState(false);

  useEffect(() => { isApolloConfiguredAsync().then(setConfigured); }, []);

  useEffect(() => {
    if (mode === 'lists' && configured && lists.length === 0) {
      loadLists();
    }
  }, [mode, configured]);

  const loadLists = async () => {
    setLoadingLists(true);
    try {
      const resp = await getApolloLists({ perPage: 50 });
      setLists(resp.data || []);
    } catch (err) {
      showToast('Failed to load lists: ' + err.message);
    } finally {
      setLoadingLists(false);
    }
  };

  const loadListContacts = async (listId, listName) => {
    setSelectedList({ id: listId, name: listName });
    setLoadingListContacts(true);
    try {
      let allContacts = [];
      let p = 1;
      let totalPages = 1;
      while (p <= totalPages && p <= 50) {
        const resp = await getApolloListContacts(listId, { page: p, perPage: 100 });
        allContacts = [...allContacts, ...(resp.data || [])];
        totalPages = resp.pagination?.total_pages || 1;
        p++;
      }
      setAllResults(allContacts);
      setResults(allContacts.slice(0, 25));
      setPagination({ page: 1, total_pages: Math.ceil(allContacts.length / 25), total_entries: allContacts.length, per_page: 25 });
      setPage(1);
      setSelected(new Set(allContacts.map(r => r.email || r.name)));
      showToast(`Loaded ${allContacts.length} contacts from "${listName}"`);
    } catch (err) {
      showToast('Failed to load contacts: ' + err.message);
    } finally {
      setLoadingListContacts(false);
    }
  };

  const search = async (p = 1) => {
    if (!configured) { showToast('Add your Apollo API key in Settings first'); return; }
    if (!keywords && !titles) { showToast('Enter keywords or titles to search'); return; }
    setLoading(true);
    try {
      const resp = await searchPeople({
        keywords: keywords || undefined,
        titles: titles ? titles.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        locations: locations ? locations.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        page: p,
        perPage: 25,
      });
      setResults(resp.data || []);
      setAllResults(resp.data || []);
      setPagination(resp.pagination);
      setPage(p);
      setSelected(new Set());
      setSelectedList(null);
    } catch (err) {
      showToast('Search failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAllPages = async () => {
    if (!configured) { showToast('Add your Apollo API key in Settings first'); return; }
    if (!keywords && !titles) { showToast('Enter keywords or titles to search'); return; }
    setLoadingAll(true);
    try {
      const firstResp = await searchPeople({
        keywords: keywords || undefined,
        titles: titles ? titles.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        locations: locations ? locations.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        page: 1,
        perPage: 100,
      });
      let allPeople = [...(firstResp.data || [])];
      const totalPages = firstResp.pagination?.total_pages || 1;
      const maxPages = Math.min(totalPages, 10);
      for (let p = 2; p <= maxPages; p++) {
        const resp = await searchPeople({
          keywords: keywords || undefined,
          titles: titles ? titles.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          locations: locations ? locations.split(',').map(s => s.trim()).filter(Boolean) : undefined,
          page: p,
          perPage: 100,
        });
        allPeople = [...allPeople, ...(resp.data || [])];
      }
      setAllResults(allPeople);
      setResults(allPeople.slice(0, 25));
      setPagination({ ...firstResp.pagination, total_pages: 1, page: 1 });
      setPage(1);
      setSelected(new Set(allPeople.map(r => r.email || r.name)));
      setSelectedList(null);
      showToast(`Loaded ${allPeople.length} contacts from Apollo`);
    } catch (err) {
      showToast('Load failed: ' + err.message);
    } finally {
      setLoadingAll(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const pageIds = results.map(r => r.email || r.name);
    const allSelected = pageIds.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach(id => next.delete(id));
      } else {
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const importSelected = async () => {
    const toImport = allResults.filter(r => selected.has(r.email || r.name));
    if (toImport.length === 0) { showToast('Select contacts to import'); return; }
    setImporting(true);
    try {
      const existingEmails = new Set(existingProspects.map(p => p.email).filter(Boolean));
      let count = 0;
      let skipped = 0;
      for (const r of toImport) {
        const email = r.email || '';
        if (email && existingEmails.has(email)) { skipped++; continue; }
        // Skip contacts with no usable data
        if (!r.name || r.name.length < 2) {
          skipped++;
          continue;
        }

        // Enrich using Apollo ID to get ALL data
        let enriched = {};
        if (r.id) {
          try {
            const resp = await enrichPerson({
              apollo_id: r.id,
              email: r.email || undefined,
              first_name: r.first_name || undefined,
              last_name: r.last_name || undefined,
              linkedin_url: r.linkedin || undefined,
              organization_name: r.company || undefined,
            });
            if (resp?.data) enriched = resp.data;
          } catch (e) { console.log('Enrich failed for', r.name, e.message); }
        }

        const finalData = {
          name: enriched.name || r.name || [r.first_name, r.last_name].filter(Boolean).join(' '),
          title: enriched.title || r.title || '',
          company: enriched.company || r.company || '',
          email: enriched.email || r.email || '',
          phone: enriched.phone || r.phone || '',
          linkedin: enriched.linkedin || r.linkedin || '',
          stage: 'lead',
          tier: 'cold',
          dealValue: 0,
          angle: '',
          notes: 'Imported from Apollo.io' + (selectedList ? ` list: ${selectedList.name}` : ''),
          countries: enriched.country ? [enriched.country] : (r.country ? [r.country] : []),
          tags: ['apollo-import', ...(selectedList ? [`apollo-list:${selectedList.name}`] : [])],
          stageEnteredAt: new Date().toISOString().slice(0, 10),
          customFields: {
            ...(r.id ? { apollo_id: r.id } : {}),
            ...(enriched.apollo_id ? { apollo_id: enriched.apollo_id } : {}),
          },
        };
        await addProspect(finalData);
        count++;
      }
      let msg = count + ' contacts imported with enriched data';
      if (skipped > 0) msg += ' (' + skipped + ' duplicates skipped)';
      showToast(msg);
      onClose();
    } catch (err) {
      showToast('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const pageIds = results.map(r => r.email || r.name);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const someSelected = pageIds.some(id => selected.has(id));

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
          <div style={{width:48,height:48,borderRadius:12,background:'var(--bg-sunken)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="24" height="24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <div style={{fontSize:16,fontWeight:600,color:'var(--text-primary)',marginBottom:6}}>Apollo Not Configured</div>
          <div style={{fontSize:13,color:'var(--text-tertiary)',marginBottom:16}}>Add your Apollo API key in Settings to search 275M+ contacts.</div>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:760,width:'95%',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Find Prospects</h3>
          <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div style={{display:'flex',gap:2,marginBottom:16,background:'var(--bg-sunken)',borderRadius:8,padding:3}}>
          <button onClick={() => setMode('search')} style={{flex:1,padding:'6px 12px',fontSize:12,fontWeight:600,border:'none',borderRadius:6,cursor:'pointer',background: mode === 'search' ? 'var(--bg-surface)' : 'transparent',color: mode === 'search' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow: mode === 'search' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            Search Apollo
          </button>
          <button onClick={() => setMode('lists')} style={{flex:1,padding:'6px 12px',fontSize:12,fontWeight:600,border:'none',borderRadius:6,cursor:'pointer',background: mode === 'lists' ? 'var(--bg-surface)' : 'transparent',color: mode === 'lists' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow: mode === 'lists' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            From Lists
          </button>
        </div>

        {mode === 'search' ? (
          <>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:14}}>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>Keywords</label>
                <input value={keywords} onChange={e => setKeywords(e.target.value)} onKeyDown={e => e.key === 'Enter' && search(1)}
                  style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}}
                  placeholder="e.g. AI, fintech, Series B" />
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>Titles</label>
                <input value={titles} onChange={e => setTitles(e.target.value)} onKeyDown={e => e.key === 'Enter' && search(1)}
                  style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}}
                  placeholder="e.g. VP Sales, CTO" />
              </div>
              <div>
                <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>Locations</label>
                <input value={locations} onChange={e => setLocations(e.target.value)} onKeyDown={e => e.key === 'Enter' && search(1)}
                  style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}}
                  placeholder="e.g. San Francisco, New York" />
              </div>
            </div>
            <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
              <button className="btn-primary" onClick={() => search(1)} disabled={loading} style={{display:'flex',alignItems:'center',gap:6}}>
                {loading ? 'Searching...' : 'Search'}
              </button>
              <button className="btn-secondary" onClick={loadAllPages} disabled={loadingAll} style={{display:'flex',alignItems:'center',gap:6}}>
                {loadingAll ? 'Loading...' : 'Load All Results'}
              </button>
            </div>
          </>
        ) : (
          <div style={{marginBottom:14}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              <span style={{fontSize:13,color:'var(--text-secondary)',fontWeight:500}}>Your Apollo Lists</span>
              <button className="btn-secondary" onClick={loadLists} disabled={loadingLists} style={{fontSize:11,marginLeft:'auto',padding:'4px 10px'}}>
                {loadingLists ? 'Loading...' : 'Refresh'}
              </button>
            </div>
            {loadingLists ? (
              <div style={{textAlign:'center',padding:20,color:'var(--text-tertiary)',fontSize:13}}>Loading lists...</div>
            ) : lists.length === 0 ? (
              <div style={{textAlign:'center',padding:20,color:'var(--text-tertiary)',fontSize:13}}>No lists found. Create a list in Apollo first.</div>
            ) : (
              <div style={{maxHeight:200,overflowY:'auto',display:'flex',flexDirection:'column',gap:4}}>
                {lists.map(l => (
                  <div key={l.id} onClick={() => loadListContacts(l.id, l.name)} style={{
                    padding:'10px 14px',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',gap:10,
                    background: selectedList?.id === l.id ? 'var(--accent-tint)' : 'var(--bg-canvas)',
                    border: selectedList?.id === l.id ? '1px solid var(--accent)' : '1px solid transparent',
                    transition:'all 0.12s',
                  }}>
                    <div style={{width:32,height:32,borderRadius:8,background:'var(--accent-tint)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" width="16" height="16"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{l.name}</div>
                      <div style={{fontSize:11,color:'var(--text-tertiary)'}}>{l.count.toLocaleString()} contacts</div>
                    </div>
                    {selectedList?.id === l.id && loadingListContacts && (
                      <span style={{fontSize:11,color:'var(--accent)'}}>Loading...</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {selected.size > 0 && (
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:10}}>
            <button className="btn-primary" onClick={importSelected} disabled={importing} style={{display:'flex',alignItems:'center',gap:6,background:'var(--success)'}}>
              {importing ? 'Importing...' : `Import ${selected.size} Contact${selected.size > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {pagination && (
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10,padding:'8px 12px',background:'var(--bg-sunken)',borderRadius:8}}>
            <input type="checkbox" checked={allPageSelected} ref={el => { if (el) el.indeterminate = someSelected && !allPageSelected; }} onChange={toggleSelectAll} style={{accentColor:'var(--accent)'}} />
            <span style={{fontSize:12,color:'var(--text-secondary)'}}>Select all on this page</span>
            <span style={{fontSize:12,color:'var(--text-tertiary)',marginLeft:4}}>&middot;</span>
            <span style={{fontSize:12,color:'var(--text-tertiary)'}}>{pagination.total_entries.toLocaleString()} total results</span>
            {allResults.length > 25 && (
              <>
                <span style={{fontSize:12,color:'var(--text-tertiary)',marginLeft:4}}>&middot;</span>
                <span style={{fontSize:12,fontWeight:600,color:'var(--accent)'}}>{allResults.length} loaded</span>
              </>
            )}
          </div>
        )}

        <div style={{flex:1,overflowY:'auto',minHeight:0}}>
          {results.length > 0 ? (
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              {results.map((r, i) => {
                const id = r.email || r.name;
                return (
                  <div key={i} onClick={() => toggleSelect(id)} style={{
                    padding:'10px 12px',borderRadius:8,cursor:'pointer',display:'flex',alignItems:'center',gap:10,
                    background: selected.has(id) ? 'var(--accent-tint)' : 'var(--bg-canvas)',
                    border: selected.has(id) ? '1px solid var(--accent)' : '1px solid transparent',
                    transition:'all 0.12s',
                  }}>
                    <input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelect(id)} style={{accentColor:'var(--accent)',flexShrink:0}} />
                    <div style={{width:32,height:32,borderRadius:8,flexShrink:0,background:r.avatar ? 'transparent' : 'var(--accent-tint)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'var(--accent)',overflow:'hidden'}}>
                      {r.avatar ? <img src={r.avatar} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : (r.name?.[0] || '?')}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.name}</div>
                      <div style={{fontSize:11,color:'var(--text-tertiary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.title}{r.title && r.company ? ' @ ' : ''}{r.company}</div>
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0}}>
                      {r.country && <span className={countryFlag(r.country)} style={{fontSize:13}} title={r.country}></span>}
                      {r.email && <span style={{fontSize:10,color:'var(--accent)'}}>has email</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-tertiary)',fontSize:13}}>
              {loading ? 'Searching Apollo database...' : loadingAll ? 'Loading all results...' : mode === 'lists' ? 'Select a list to load contacts' : 'Enter search criteria and click Search'}
            </div>
          )}
        </div>

        {pagination && !loadingAll && allResults.length <= 25 && (
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:12,borderTop:'1px solid var(--border)',marginTop:12}}>
            <span style={{fontSize:12,color:'var(--text-tertiary)'}}>Page {page} of {pagination.total_pages}</span>
            <div style={{display:'flex',gap:6}}>
              <button className="btn-secondary" disabled={page <= 1} onClick={() => {
                const newPage = page - 1;
                setPage(newPage);
                setResults(allResults.slice((newPage - 1) * 25, newPage * 25));
              }} style={{fontSize:11}}>Previous</button>
              <button className="btn-secondary" disabled={page >= pagination.total_pages} onClick={() => {
                const newPage = page + 1;
                setPage(newPage);
                setResults(allResults.slice((newPage - 1) * 25, newPage * 25));
              }} style={{fontSize:11}}>Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
