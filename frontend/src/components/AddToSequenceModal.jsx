import { useState, useEffect } from 'react';
import { addContactsToSequence, getEmailAccounts, searchPeople, isApolloConfiguredAsync } from '../utils/apollo';
import useStore from '../store/useStore';
import { showToast } from './Toast';

export default function AddToSequenceModal({ sequence, onClose }) {
  const [configured, setConfigured] = useState(null);
  const prospects = useStore(s => s.prospects);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [apolloSearch, setApolloSearch] = useState('');
  const [apolloResults, setApolloResults] = useState([]);
  const [searchingApollo, setSearchingApollo] = useState(false);
  const [tab, setTab] = useState('local');

  useEffect(() => {
    isApolloConfiguredAsync().then(c => { setConfigured(c); if (c) loadAccounts(); });
  }, []);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const resp = await getEmailAccounts();
      const accs = resp.data || [];
      setAccounts(accs);
      if (accs.length === 1) setSelectedAccount(accs[0].id);
    } catch (err) {
      console.error('Email accounts error:', err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const filtered = prospects.filter(p => {
    if (!p.email) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !(p.company || '').toLowerCase().includes(q) && !(p.email || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const searchApolloContacts = async () => {
    if (!apolloSearch.trim()) { showToast('Enter a name or email to search'); return; }
    setSearchingApollo(true);
    try {
      const resp = await searchPeople({
        keywords: apolloSearch,
        page: 1,
        perPage: 25,
      });
      setApolloResults(resp.data || []);
    } catch (err) {
      showToast('Search failed: ' + err.message);
    } finally {
      setSearchingApollo(false);
    }
  };

  const toggleSelect = (id, source = 'local') => {
    const key = `${source}:${id}`;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    const items = tab === 'local'
      ? filtered.map(p => `local:${p.id}`)
      : apolloResults.map(r => `apollo:${r.id || r.email}`);
    const allSelected = items.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) {
        items.forEach(id => next.delete(id));
      } else {
        items.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleAdd = async () => {
    if (selected.size === 0) { showToast('Select contacts to add'); return; }

    setAdding(true);
    try {
      const contactIds = [];
      const toCreate = [];

      for (const key of selected) {
        const [source, id] = key.split(':');
        if (source === 'local') {
          const prospect = prospects.find(p => p.id === id);
          if (prospect?.customFields?.apollo_id) {
            contactIds.push(prospect.customFields.apollo_id);
          } else {
            toCreate.push(prospect);
          }
        } else {
          contactIds.push(id);
        }
      }

      let added = 0;
      let skipped = 0;
      let skipReasons = {};

      if (contactIds.length > 0) {
        const resp = await addContactsToSequence(sequence.id, {
          contact_ids: contactIds,
          email_account_id: selectedAccount || undefined,
        });
        added = resp.data?.added || 0;
        skipped = Object.keys(resp.data?.skipped || {}).length;
        skipReasons = resp.data?.skipped || {};
      }

      let msg = '';
      if (added > 0) msg += added + ' contacts added to sequence';
      if (skipped > 0) {
        const reasonList = Object.values(skipReasons).slice(0, 3).join('; ');
        msg += ' (' + skipped + ' skipped' + (reasonList ? ': ' + reasonList : '') + ')';
      }
      if (toCreate.length > 0) msg += (msg ? '. ' : '') + toCreate.length + ' contacts need to be enriched first (no Apollo ID)';
      if (!msg) msg = 'Contacts added to sequence';
      showToast(msg);
      onClose();
    } catch (err) {
      showToast('Failed: ' + err.message);
    } finally {
      setAdding(false);
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

  const renderContact = (p, source, apolloId) => {
    const key = `${source}:${apolloId || p.id}`;
    const isSelected = selected.has(key);
    const hasApolloId = source === 'apollo' || !!p.customFields?.apollo_id;
    return (
      <div key={key} onClick={() => toggleSelect(apolloId || p.id, source)} style={{
        padding:'8px 10px',borderRadius:6,cursor:'pointer',display:'flex',alignItems:'center',gap:8,
        background: isSelected ? 'var(--accent-tint)' : 'transparent',
        border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
        opacity: hasApolloId ? 1 : 0.6,
        transition:'all 0.1s',
      }}>
        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(apolloId || p.id, source)} style={{accentColor:'var(--accent)',flexShrink:0}} />
        <div style={{width:28,height:28,borderRadius:6,background:'var(--accent-tint)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700,color:'var(--accent)',flexShrink:0}}>
          {p.name?.[0] || '?'}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name}</div>
          <div style={{fontSize:10,color:'var(--text-tertiary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.email}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0}}>
          <div style={{fontSize:10,color:'var(--text-tertiary)'}}>{p.company}</div>
          {!hasApolloId && <div style={{fontSize:9,color:'var(--warning)'}}>needs enrich</div>}
        </div>
      </div>
    );
  };

  const allItems = tab === 'local' ? filtered : apolloResults;
  const allKeys = tab === 'local'
    ? filtered.map(p => `local:${p.id}`)
    : apolloResults.map(r => `apollo:${r.id || r.email}`);
  const allSelected = allKeys.length > 0 && allKeys.every(id => selected.has(id));

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:600,width:'95%',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div>
            <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Add to Sequence</h3>
            <div style={{fontSize:12,color:'var(--text-tertiary)',marginTop:2}}>{sequence.name}</div>
          </div>
          <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div style={{marginBottom:10}}>
          <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>Send From (optional)</label>
          {loadingAccounts ? (
            <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'6px 0'}}>Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'6px 0'}}>Apollo will use your default email account.</div>
          ) : (
            <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
              style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}}>
              <option value="">Use default account</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.email}</option>
              ))}
            </select>
          )}
        </div>

        <div style={{display:'flex',gap:2,marginBottom:12,background:'var(--bg-sunken)',borderRadius:8,padding:3}}>
          <button onClick={() => setTab('local')} style={{flex:1,padding:'6px 12px',fontSize:12,fontWeight:600,border:'none',borderRadius:6,cursor:'pointer',background: tab === 'local' ? 'var(--bg-surface)' : 'transparent',color: tab === 'local' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow: tab === 'local' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            My Contacts ({prospects.filter(p => p.email).length})
          </button>
          <button onClick={() => setTab('apollo')} style={{flex:1,padding:'6px 12px',fontSize:12,fontWeight:600,border:'none',borderRadius:6,cursor:'pointer',background: tab === 'apollo' ? 'var(--bg-surface)' : 'transparent',color: tab === 'apollo' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow: tab === 'apollo' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            Search Apollo
          </button>
        </div>

        {tab === 'local' && (
          <div style={{position:'relative',marginBottom:10}}>
            <svg style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-tertiary)',pointerEvents:'none'}} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)}
              style={{width:'100%',padding:'8px 10px 8px 32px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
          </div>
        )}

        {tab === 'apollo' && (
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <input type="text" placeholder="Search by name, email, company..." value={apolloSearch} onChange={e => setApolloSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchApolloContacts()}
              style={{flex:1,padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}} />
            <button className="btn-primary" onClick={searchApolloContacts} disabled={searchingApollo} style={{fontSize:12,padding:'6px 14px',whiteSpace:'nowrap'}}>
              {searchingApollo ? 'Searching...' : 'Search'}
            </button>
          </div>
        )}

        {selected.size > 0 && (
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:8}}>
            <button className="btn-primary" onClick={handleAdd} disabled={adding} style={{fontSize:12,padding:'6px 14px',display:'flex',alignItems:'center',gap:6}}>
              {adding ? 'Adding...' : `Add ${selected.size} Contact${selected.size > 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        <div style={{flex:1,overflowY:'auto',minHeight:0,maxHeight:350}}>
          <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 10px',marginBottom:4,background:'var(--bg-sunken)',borderRadius:6}}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{accentColor:'var(--accent)'}} />
            <span style={{fontSize:11,color:'var(--text-secondary)'}}>Select all ({allItems.length} contacts)</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:2}}>
            {allItems.length === 0 && (
              <div style={{textAlign:'center',padding:'24px 16px',color:'var(--text-tertiary)',fontSize:12}}>
                {tab === 'local'
                  ? 'No contacts with email found. Import contacts from Apollo first.'
                  : 'Search Apollo to find contacts to add.'}
              </div>
            )}
            {tab === 'local'
              ? filtered.map(p => renderContact(p, 'local', p.customFields?.apollo_id))
              : apolloResults.map(r => renderContact(r, 'apollo', r.id))}
          </div>
        </div>
      </div>
    </div>
  );
}
