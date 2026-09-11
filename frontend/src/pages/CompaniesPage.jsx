import { useState, useMemo, useEffect, useRef } from 'react';

import useStore from '../store/useStore';
import { esc, timeAgo, formatMoney, linkedinUrl, countryFlag } from '../utils/helpers';
import { showToast } from '../components/Toast';
import { openModalFn } from '../components/Modal';
import EnrichmentPanel from '../components/EnrichmentPanel';
import ExportCompaniesCSV from '../components/ExportCompaniesCSV';
import { parseCompaniesCSV } from '../utils/csv';
import Pagination, { PAGE_SIZE } from '../components/Pagination';

const INDUSTRIES = ['Technology','Fintech','Healthcare','E-commerce','Education','Manufacturing','Media','Real Estate','Transportation','Energy','Consulting','Legal','Other'];
const SIZES = ['1-10','11-50','51-200','201-500','501-1000','1001-5000','5000+'];

const INDUSTRY_COLORS = {
  Technology:'#6366f1', Fintech:'#8b5cf6', Healthcare:'#ec4899', 'E-commerce':'#f59e0b',
  Education:'#3b82f6', Manufacturing:'#64748b', Media:'#f43f5e', 'Real Estate':'#14b8a6',
  Transportation:'#f97316', Energy:'#22c55e', Consulting:'#06b6d4', Legal:'#a855f7', Other:'#94a3b8',
};

function CompanyForm({ onSave, onClose, initial }) {
  const [form, setForm] = useState(() => ({ name:'', domain:'', industry:'', companySize:'', annualRevenue:'', phone:'', address:'', city:'', region:'', country:'', description:'', linkedinUrl:'', companyType:'prospect', tags:[], ...(initial || {}) }));
  const [tagInput, setTagInput] = useState('');

  const save = async () => {
    if (!form.name.trim()) { showToast('Company name is required'); return; }
    try {
      await onSave(form);
      onClose();
      showToast(form.name + ' saved');
    } catch (e) {
      showToast('Error saving company');
    }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
    setTagInput('');
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:600,width:'95%',maxHeight:'85vh',overflow:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600}}>{initial && initial.id ? 'Edit Company' : 'Add Company'}</h3>
          <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <label className="field-label">Company Name *</label>
            <input className="field-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Acme Corp" />
          </div>
          <div className="field">
            <label className="field-label">Company Type</label>
            <select className="field-input" value={form.companyType || 'prospect'} onChange={e => setForm({...form, companyType: e.target.value})}>
              <option value="prospect">Prospect</option>
              <option value="partner">Partner</option>
              <option value="client">Client</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Domain / Website</label>
            <input className="field-input" value={form.domain} onChange={e => setForm({...form, domain: e.target.value})} placeholder="acme.com" />
          </div>
          <div className="field">
            <label className="field-label">Industry</label>
            <select className="field-input" value={form.industry} onChange={e => setForm({...form, industry: e.target.value})}>
              <option value="">Select industry</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Company Size</label>
            <select className="field-input" value={form.companySize} onChange={e => setForm({...form, companySize: e.target.value})}>
              <option value="">Select size</option>
              {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Annual Revenue</label>
            <input className="field-input" value={form.annualRevenue} onChange={e => setForm({...form, annualRevenue: e.target.value})} placeholder="$10M - $50M" />
          </div>
          <div className="field">
            <label className="field-label">Phone</label>
            <input className="field-input" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="+1 555-0100" />
          </div>
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <label className="field-label">Address</label>
            <input className="field-input" value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="123 Main Street" />
          </div>
          <div className="field">
            <label className="field-label">City</label>
            <input className="field-input" value={form.city} onChange={e => setForm({...form, city: e.target.value})} placeholder="San Francisco" />
          </div>
          <div className="field">
            <label className="field-label">Region / State</label>
            <input className="field-input" value={form.region} onChange={e => setForm({...form, region: e.target.value})} placeholder="California" />
          </div>
          <div className="field">
            <label className="field-label">Country</label>
            <input className="field-input" value={form.country} onChange={e => setForm({...form, country: e.target.value})} placeholder="United States" />
          </div>
          <div className="field">
            <label className="field-label">LinkedIn</label>
            <input className="field-input" value={form.linkedinUrl} onChange={e => setForm({...form, linkedinUrl: e.target.value})} placeholder="linkedin.com/company/acme" />
          </div>
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <label className="field-label">Description</label>
            <textarea className="field-input" rows={3} value={form.description} onChange={e => setForm({...form, description: e.target.value})} placeholder="About the company..." />
          </div>
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <label className="field-label">Tags</label>
            <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:6}}>
              {(form.tags || []).map((t, i) => (
                <span key={i} style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,padding:'3px 8px',borderRadius:5,background:'var(--accent-tint)',color:'var(--accent)'}}>
                  {t}
                  <span onClick={() => setForm({...form, tags: form.tags.filter((_, j) => j !== i)})} style={{cursor:'pointer',opacity:0.6}}>x</span>
                </span>
              ))}
            </div>
            <div style={{display:'flex',gap:6}}>
              <input className="field-input" style={{flex:1}} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="Add tag..." />
              <button className="btn-secondary" style={{fontSize:11}} onClick={addTag}>+</button>
            </div>
          </div>
        </div>
        <button className="btn-primary" style={{width:'100%',marginTop:16}} onClick={save}>Save Company</button>
      </div>
    </div>
  );
}

function CompanySymbol({ company, size = 44 }) {
    const initial = company.name?.[0]?.toUpperCase() || '?';
    return (
        <div style={{
            width: size, height: size, borderRadius: 12, flexShrink: 0,
            background: '#1a1a1a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        }}>
            <span style={{
                fontSize: size * 0.38, fontWeight: 700, color: '#fff',
                letterSpacing: '-0.02em',
            }}>{initial}</span>
        </div>
    );
}

function AvatarStack({ names, size = 24, max = 3 }) {
  const shown = names.slice(0, max);
  const overflow = names.length - max;
  return (
    <div style={{display:'flex',alignItems:'center'}}>
      {shown.map((n, i) => (
        <div key={i} style={{
          width:size,height:size,borderRadius:'50%',
          background:'var(--accent-tint)',color:'var(--accent)',
          display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:size * 0.42,fontWeight:700,
          border:'2px solid var(--bg-surface)',
          marginLeft: i > 0 ? -size * 0.25 : 0,
          position:'relative',zIndex: shown.length - i,
        }}>{n[0]?.toUpperCase()}</div>
      ))}
      {overflow > 0 && (
        <div style={{
          width:size,height:size,borderRadius:'50%',
          background:'var(--bg-sunken)',color:'var(--text-tertiary)',
          display:'flex',alignItems:'center',justifyContent:'center',
          fontSize:size * 0.36,fontWeight:600,
          border:'2px solid var(--bg-surface)',
          marginLeft: -size * 0.25,
        }}>+{overflow}</div>
      )}
    </div>
  );
}

export default function CompaniesPage() {
  const companies = useStore(s => s.companies);
  const prospects = useStore(s => s.prospects);
  const addCompany = useStore(s => s.addCompany);
  const updateCompany = useStore(s => s.updateCompany);
  const deleteCompany = useStore(s => s.deleteCompany);
  const importCompanies = useStore(s => s.importCompanies);
  const refreshCompanies = useStore(s => s.refreshCompanies);
  const setDetailId = useStore(s => s.setDetailId);
  const [selectedName, setSelectedName] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formInitial, setFormInitial] = useState(null);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('grid');
  const [filterIndustry, setFilterIndustry] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(1);
  const [detailTab, setDetailTab] = useState('overview');
  const [showEnrich, setShowEnrich] = useState(false);
  const csvRef = useRef(null);

  useEffect(() => { refreshCompanies(); }, [refreshCompanies]);
  useEffect(() => { setPage(1); }, [search, filterIndustry, filterType]);

  const handleCSVImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCompaniesCSV(ev.target.result);
      if (!rows.length) { showToast('No valid rows found'); return; }
      window._pendingCompanyImport = rows;
      const preview = rows.slice(0, 8).map(r => '<tr><td style="font-weight:500">' + esc(r.name) + '</td><td>' + esc(r.domain||'-') + '</td><td>' + esc(r.industry||'-') + '</td><td>' + esc(r.phone||'-') + '</td><td>' + esc(r.country||'-') + '</td><td>' + esc(r.companyType||'prospect') + '</td></tr>').join('');
      openModalFn('Import Preview (' + rows.length + ' companies)',
        '<div style="margin-bottom:12px;font-size:0.82rem;color:var(--text-secondary)">Found ' + rows.length + ' companies from CSV. Preview:</div>' +
        '<div style="overflow-x:auto"><table class="prospects-table" style="margin-bottom:16px;min-width:600px"><thead><tr><th>Name</th><th>Website</th><th>Industry</th><th>Phone</th><th>Country</th><th>Type</th></tr></thead><tbody>' + preview +
        (rows.length > 8 ? '<tr><td colspan="6" style="text-align:center;color:var(--text-tertiary)">...and ' + (rows.length - 8) + ' more</td></tr>' : '') +
        '</tbody></table></div>' +
        '<button class="btn-primary" style="width:100%" onclick="document.dispatchEvent(new CustomEvent(\'confirmCompanyCSV\'))">Import All</button>'
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  useEffect(() => {
    const handler = async () => {
      const rows = window._pendingCompanyImport;
      if (!rows || !rows.length) return;
      window._pendingCompanyImport = null;
      try {
        const result = await importCompanies(rows);
        const msg = result ? `${result.imported} companies imported` + (result.skipped ? ` (${result.skipped} skipped)` : '') : rows.length + ' companies imported';
        showToast(msg);
      } catch (err) {
        showToast('Import failed: ' + err.message);
      }
    };
    document.addEventListener('confirmCompanyCSV', handler);
    return () => document.removeEventListener('confirmCompanyCSV', handler);
  }, [importCompanies]);

  const derivedCounts = useMemo(() => {
    const map = new Map();
    prospects.forEach(p => {
      if (!p.company) return;
      map.set(p.company, (map.get(p.company) || 0) + 1);
    });
    return map;
  }, [prospects]);

  const allCompanies = useMemo(() => {
    const result = [];
    const seen = new Set();
    companies.forEach(c => {
      if (seen.has(c.name)) return;
      seen.add(c.name);
      result.push({ ...c, contactCount: derivedCounts.get(c.name) || 0, isDerived: false });
    });
    derivedCounts.forEach((count, name) => {
      if (seen.has(name)) return;
      seen.add(name);
      result.push({ id: 'derived-' + name, name, contactCount: count, isDerived: true, domain: '', industry: '', companySize: '', tags: [], description: '', city: '', region: '', country: '', phone: '', annualRevenue: '', linkedinUrl: '', address: '' });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [companies, derivedCounts]);

  const industries = useMemo(() => {
    const set = new Set();
    allCompanies.forEach(c => { if (c.industry) set.add(c.industry); });
    return [...set].sort();
  }, [allCompanies]);

  const filtered = useMemo(() => {
    const list = allCompanies.filter(c => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.name.toLowerCase().includes(q) && !(c.domain || '').toLowerCase().includes(q) && !(c.industry || '').toLowerCase().includes(q) && !(c.tags || []).some(t => t.toLowerCase().includes(q))) return false;
      }
      if (filterIndustry !== 'all' && c.industry !== filterIndustry) return false;
      if (filterType === 'enriched' && c.isDerived) return false;
      if (filterType === 'derived' && !c.isDerived) return false;
      return true;
    });
    const score = (c) => {
      let s = 0;
      if (!c.isDerived) s += 10;
      if (c.domain) s += 3;
      if (c.industry) s += 2;
      if (c.companySize) s += 2;
      if (c.country) s += 2;
      if (c.city) s += 1;
      if (c.logo_url) s += 2;
      if (c.description) s += 2;
      if (c.linkedinUrl) s += 1;
      if (c.annualRevenue) s += 2;
      if (c.phone) s += 1;
      if (c.tags && c.tags.length) s += 1;
      s += Math.min(c.contactCount || 0, 5);
      return s;
    };
    return [...list].sort((a, b) => score(b) - score(a));
  }, [allCompanies, search, filterIndustry, filterType]);

  const paged = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  const selected = allCompanies.find(c => c.name === selectedName) || null;
  const selectedContacts = useMemo(() => prospects.filter(p => p.company === selectedName), [prospects, selectedName]);

  const stats = useMemo(() => {
    const enriched = allCompanies.filter(c => !c.isDerived).length;
    const derived = allCompanies.filter(c => c.isDerived).length;
    const totalContacts = allCompanies.reduce((sum, c) => sum + c.contactCount, 0);
    const industriesSet = new Set(allCompanies.map(c => c.industry).filter(Boolean));
    return { enriched, derived, totalContacts, industryCount: industriesSet.size };
  }, [allCompanies]);

  const totalValue = useMemo(() => {
    return selectedContacts.reduce((sum, p) => sum + (p.dealValue || 0), 0);
  }, [selectedContacts]);

  const colorForIndustry = (ind) => INDUSTRY_COLORS[ind] || '#94a3b8';

  return (
    <div style={{padding:'24px 32px',display:'flex',flexDirection:'column',height:'100%',animation:'fadeSlideUp 0.3s ease-out'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <h1 style={{fontSize:22,fontWeight:650,color:'var(--text-primary)',letterSpacing:-0.4,margin:0}}>Companies</h1>
          <div style={{fontSize:13,color:'var(--text-tertiary)',marginTop:2}}>{allCompanies.length} companies across {stats.industryCount} industries</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <ExportCompaniesCSV />
          <button className="btn-secondary" onClick={() => csvRef.current?.click()} style={{fontSize:'0.78rem'}}>Import CSV</button>
          <input ref={csvRef} type="file" accept=".csv" onChange={handleCSVImport} style={{display:'none'}} />
          <button className="btn-primary" style={{display:'flex',alignItems:'center',gap:6}} onClick={() => { setFormInitial(null); setShowForm(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Company
          </button>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:16}}>
        {[
          { label:'Total Companies', value:allCompanies.length, icon:'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
          { label:'Total Contacts', value:stats.totalContacts, icon:'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75' },
          { label:'Enriched', value:stats.enriched, color:'var(--success)', icon:'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3' },
          { label:'Derived', value:stats.derived, color:'var(--warning)', icon:'M12 2L2 7l10 5 10-5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5' },
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
          <input type="text" placeholder="Search companies, tags..." value={search} onChange={e => setSearch(e.target.value)}
            style={{width:'100%',padding:'8px 10px 8px 32px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}
          />
        </div>
        <div style={{display:'flex',gap:4}}>
          {['all','enriched','derived'].map(t => (
            <button key={t} onClick={() => setFilterType(t)} style={{
              padding:'6px 12px',borderRadius:7,fontSize:12,fontWeight:500,border:'1px solid',cursor:'pointer',transition:'all 0.15s',
              background: filterType === t ? 'var(--accent)' : 'var(--bg-surface)',
              color: filterType === t ? '#fff' : 'var(--text-secondary)',
              borderColor: filterType === t ? 'var(--accent)' : 'var(--border)',
            }}>{t === 'all' ? 'All' : t === 'enriched' ? 'Enriched' : 'Derived'}</button>
          ))}
        </div>
        <div style={{display:'flex',gap:2,marginLeft:4,padding:3,borderRadius:8,background:'var(--bg-sunken)'}}>
          <button onClick={() => setView('grid')} style={{padding:'5px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,background:view === 'grid' ? 'var(--bg-surface)' : 'transparent',color:view === 'grid' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow:view === 'grid' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button onClick={() => setView('list')} style={{padding:'5px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,background:view === 'list' ? 'var(--bg-surface)' : 'transparent',color:view === 'list' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow:view === 'list' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          </button>
          <button onClick={() => setView('table')} style={{padding:'5px 10px',borderRadius:6,border:'none',cursor:'pointer',fontSize:12,fontWeight:500,background:view === 'table' ? 'var(--bg-surface)' : 'transparent',color:view === 'table' ? 'var(--text-primary)' : 'var(--text-tertiary)',boxShadow:view === 'table' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',transition:'all 0.15s'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </button>
        </div>
      </div>

      {industries.length > 0 && (
        <div style={{display:'flex',gap:6,marginBottom:16,overflowX:'auto',paddingBottom:2}}>
          <button onClick={() => setFilterIndustry('all')} style={{
            padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:500,border:'1px solid',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',
            background: filterIndustry === 'all' ? 'var(--text-primary)' : 'var(--bg-surface)',
            color: filterIndustry === 'all' ? 'var(--bg-canvas)' : 'var(--text-secondary)',
            borderColor: filterIndustry === 'all' ? 'var(--text-primary)' : 'var(--border)',
          }}>All Industries</button>
          {industries.map(ind => (
            <button key={ind} onClick={() => setFilterIndustry(ind)} style={{
              padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:500,border:'1px solid',cursor:'pointer',whiteSpace:'nowrap',transition:'all 0.15s',display:'flex',alignItems:'center',gap:5,
              background: filterIndustry === ind ? colorForIndustry(ind) : 'var(--bg-surface)',
              color: filterIndustry === ind ? '#fff' : 'var(--text-secondary)',
              borderColor: filterIndustry === ind ? colorForIndustry(ind) : 'var(--border)',
            }}>
              <span style={{width:6,height:6,borderRadius:'50%',background:filterIndustry === ind ? '#fff' : colorForIndustry(ind),flexShrink:0}}></span>
              {ind}
            </button>
          ))}
        </div>
      )}

      <div style={{display:'flex',gap:14,flex:1,minHeight:0,overflow:'hidden'}}>
        <div style={{flex:selected ? '0 0 420px' : '1',minWidth:0,minHeight:0,display:'flex',flexDirection:'column',transition:'flex 0.2s',overflow:'hidden'}}>
          {view === 'grid' ? (
            <div style={{display:'grid',gridTemplateColumns: selected ? '1fr' : 'repeat(auto-fill, minmax(380px, 1fr))',gap:16,overflowY:'auto',alignContent:'start',flex:1}}>
              {paged.map(c => {
                const contacts = prospects.filter(p => p.company === c.name);
                const contactNames = contacts.slice(0, 4).map(p => p.name);
                return (
                  <div key={c.id} onClick={() => { setSelectedName(c.name); setDetailTab('overview'); }} style={{
                    padding:'24px',borderRadius:20,cursor:'pointer',
                    background:'var(--bg-surface)',
                    border:selectedName === c.name ? '1.5px solid var(--accent)' : '1px solid var(--border)',
                    boxShadow: selectedName === c.name ? '0 4px 16px rgba(0,0,0,0.06)' : 'none',
                    transition:'all 0.18s ease',position:'relative',
                    display:'flex',flexDirection:'column',gap:18,
                  }}
                    onMouseEnter={e => { if (selectedName !== c.name) { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.06)'; } }}
                    onMouseLeave={e => { if (selectedName !== c.name) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'none'; } }}
                  >
                    {c.isDerived && <div style={{position:'absolute',top:16,right:16,background:'var(--bg-sunken)',padding:'3px 8px',borderRadius:5,fontSize:9,color:'var(--text-tertiary)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>derived</div>}
                    {!c.isDerived && c.companyType && c.companyType !== 'prospect' && (
                      <div style={{position:'absolute',top:16,right:16,background:c.companyType==='client'?'#dcfce7':c.companyType==='partner'?'#dbeafe':'var(--bg-sunken)',padding:'3px 8px',borderRadius:5,fontSize:9,color:c.companyType==='client'?'#16a34a':c.companyType==='partner'?'#2563eb':'var(--text-tertiary)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>{c.companyType}</div>
                    )}
                    <div>
                      <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:6}}>
                        <span style={{fontSize:18,fontWeight:650,color:'var(--text-primary)',letterSpacing:'-0.015em',flex:1,wordBreak:'break-word',overflowWrap:'break-word',lineHeight:1.3}}>{esc(c.name)}</span>
                        {c.country && countryFlag(c.country) && <span className={countryFlag(c.country)} style={{fontSize:16,borderRadius:2,lineHeight:1,flexShrink:0,marginTop:4,boxShadow:'0 0 0 1px var(--border)'}} title={c.country}></span>}
                      </div>
                      <div style={{fontSize:13,color:'var(--text-tertiary)'}}>{c.industry || '—'}{c.companySize ? <span style={{color:'var(--border)'}}> · </span> : null}{c.companySize ? `~${c.companySize} employees` : null}</div>
                    </div>
                    <div style={{height:1,background:'var(--border)'}} />
                    <div style={{display:'flex',flexDirection:'column',gap:10}}>
                      {c.domain && (
                        <a href={'https://' + c.domain.replace(/^https?:\/\//, '')} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={'Visit ' + c.domain} className="company-domain-link" style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,color:'var(--text-secondary)',textDecoration:'none',fontWeight:500}}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                          {c.domain.replace(/^www\./, '')}
                        </a>
                      )}
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        {contactNames.length > 0 && <AvatarStack names={contactNames} size={22} max={3} />}
                        <span style={{fontSize:13,color:'var(--text-secondary)'}}><span style={{fontWeight:600,color:'var(--text-primary)'}}>{c.contactCount}</span> contact{c.contactCount === 1 ? '' : 's'}</span>
                      </div>
                      {(c.city || c.country) && (
                        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:13,color:'var(--text-secondary)'}}>
                          {c.country && countryFlag(c.country) && <span className={countryFlag(c.country)} style={{fontSize:14,borderRadius:2,lineHeight:1,flexShrink:0,boxShadow:'0 0 0 1px var(--border)'}}></span>}
                          {[c.city, c.country].filter(Boolean).join(', ')}
                        </div>
                      )}
                    </div>
                    {c.tags && c.tags.length > 0 && (
                      <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                        {c.tags.slice(0, 3).map((t, i) => <span key={i} style={{fontSize:10,padding:'3px 8px',borderRadius:5,background:'var(--bg-sunken)',color:'var(--text-secondary)',fontWeight:500}}>{t}</span>)}
                        {c.tags.length > 3 && <span style={{fontSize:10,padding:'3px 8px',borderRadius:5,background:'var(--bg-sunken)',color:'var(--text-tertiary)'}}>+{c.tags.length - 3}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{gridColumn:'1/-1',textAlign:'center',padding:'60px 20px'}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="36" height="36" style={{opacity:0.25,marginBottom:10}}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:3}}>No companies found</div>
                  <div style={{fontSize:12,color:'var(--text-tertiary)'}}>{search ? 'Try a different search' : 'Add your first company to get started'}</div>
                </div>
              )}
            </div>
          ) : view === 'list' ? (
            <div style={{display:'flex',flexDirection:'column',gap:3,overflowY:'auto',flex:1}}>
              {paged.map(c => {
                const contacts = prospects.filter(p => p.company === c.name);
                return (
                  <div key={c.id} onClick={() => { setSelectedName(c.name); setDetailTab('overview'); }} style={{
                    padding:'10px 14px',borderRadius:10,cursor:'pointer',display:'flex',alignItems:'center',gap:12,
                    background: selectedName === c.name ? 'var(--accent-tint)' : 'var(--bg-surface)',
                    border: selectedName === c.name ? '1px solid var(--accent)' : '1px solid transparent',
                    transition:'all 0.12s',
                  }}
                    onMouseEnter={e => { if (selectedName !== c.name) e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                    onMouseLeave={e => { if (selectedName !== c.name) e.currentTarget.style.background = 'var(--bg-surface)'; }}
                  >
                    <div style={{
                      width:34,height:34,borderRadius:9,flexShrink:0,
                      background: c.logo_url ? 'transparent' : `linear-gradient(135deg, ${colorForIndustry(c.industry)}, color-mix(in srgb, ${colorForIndustry(c.industry)} 60%, #fff))`,
                      display:'flex',alignItems:'center',justifyContent:'center',
                      fontSize:13,fontWeight:700,color:c.logo_url ? 'var(--text-primary)' : '#fff',overflow:'hidden',
                    }}>
                      {c.logo_url ? <img src={c.logo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : c.name[0]?.toUpperCase()}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:6}}>
                        <span style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{esc(c.name)}</span>
                        {c.isDerived && <span style={{fontSize:9,fontWeight:500,padding:'1px 5px',borderRadius:3,background:'var(--bg-sunken)',color:'var(--text-tertiary)'}}>derived</span>}
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:6,marginTop:1}}>
                        {c.industry && <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{c.industry}</span>}
                        {c.domain && <><span style={{width:2,height:2,borderRadius:'50%',background:'var(--border)'}} /><a href={'https://' + c.domain.replace(/^https?:\/\//, '')} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={'Visit ' + c.domain} style={{fontSize:11,color:'var(--accent)',textDecoration:'none'}}>{c.domain}</a></>}
                        {[c.city, c.country].some(Boolean) && <><span style={{width:2,height:2,borderRadius:'50%',background:'var(--border)'}} /><span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,color:'var(--text-tertiary)',minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.country && countryFlag(c.country) && <span className={countryFlag(c.country)} style={{fontSize:12,borderRadius:2,lineHeight:1,flexShrink:0,boxShadow:'0 0 0 1px var(--border)'}} title={c.country}></span>}{[c.city, c.country].filter(Boolean).join(', ')}</span></>}
                      </div>
                    </div>
                    <AvatarStack names={contacts.slice(0, 2).map(p => p.name)} size={20} max={2} />
                    <span style={{fontSize:12,fontWeight:600,color:'var(--accent)',minWidth:20,textAlign:'right'}}>{c.contactCount}</span>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div style={{textAlign:'center',padding:'60px 20px'}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="36" height="36" style={{opacity:0.25,marginBottom:10}}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:3}}>No companies found</div>
                  <div style={{fontSize:12,color:'var(--text-tertiary)'}}>{search ? 'Try a different search' : 'Add your first company to get started'}</div>
                </div>
              )}
            </div>
          ) : (
            <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>
              {paged.length === 0 ? (
                <div style={{textAlign:'center',padding:'60px 20px'}}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="36" height="36" style={{opacity:0.25,marginBottom:10}}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--text-primary)',marginBottom:3}}>No companies found</div>
                  <div style={{fontSize:12,color:'var(--text-tertiary)'}}>{search ? 'Try a different search' : 'Add your first company to get started'}</div>
                </div>
              ) : (
                <div style={{flex:1,overflowY:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--border)'}}>
                        {['Company','Industry','Size','Location','Contacts','Type','Tags'].map(h => (
                          <th key={h} style={{padding:'8px 12px',textAlign:'left',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map(c => (
                        <tr key={c.id} onClick={() => { setSelectedName(c.name); setDetailTab('overview'); }}
                          style={{cursor:'pointer',borderBottom:'1px solid var(--border)',background:selectedName === c.name ? 'var(--accent-tint)' : 'transparent',transition:'background 0.12s'}}
                          onMouseEnter={e => { if (selectedName !== c.name) e.currentTarget.style.background = 'var(--bg-sunken)'; }}
                          onMouseLeave={e => { if (selectedName !== c.name) e.currentTarget.style.background = selectedName === c.name ? 'var(--accent-tint)' : 'transparent'; }}>
                          <td style={{padding:'10px 12px',fontWeight:500}}>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <div style={{width:28,height:28,borderRadius:7,background:'#1a1a1a',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                <span style={{fontSize:11,fontWeight:700,color:'#fff'}}>{c.name[0]?.toUpperCase()}</span>
                              </div>
                              <div>
                                <div style={{fontWeight:600,color:'var(--text-primary)'}}>{esc(c.name)}</div>
                                {c.domain && <div style={{fontSize:11,color:'var(--accent)'}}>{c.domain}</div>}
                              </div>
                            </div>
                          </td>
                          <td style={{padding:'10px 12px',fontSize:12}}>{c.industry || '—'}</td>
                          <td style={{padding:'10px 12px',fontSize:12}}>{c.companySize || '—'}</td>
                          <td style={{padding:'10px 12px',fontSize:12}}>
                            <span style={{display:'inline-flex',alignItems:'center',gap:4}}>
                              {c.country && countryFlag(c.country) && <span className={countryFlag(c.country)} style={{fontSize:12,borderRadius:2,lineHeight:1,boxShadow:'0 0 0 1px var(--border)'}}></span>}
                              {[c.city, c.country].filter(Boolean).join(', ') || '—'}
                            </span>
                          </td>
                          <td style={{padding:'10px 12px',fontSize:12,fontWeight:500}}>{c.contactCount}</td>
                          <td style={{padding:'10px 12px'}}>
                            {c.isDerived ? <span style={{fontSize:10,fontWeight:500,padding:'2px 6px',borderRadius:3,background:'var(--bg-sunken)',color:'var(--text-tertiary)'}}>derived</span>
                            : c.companyType && c.companyType !== 'prospect' ? <span style={{fontSize:10,fontWeight:500,padding:'2px 6px',borderRadius:3,background:c.companyType==='client'?'#dcfce7':c.companyType==='partner'?'#dbeafe':'var(--bg-sunken)',color:c.companyType==='client'?'#16a34a':c.companyType==='partner'?'#2563eb':'var(--text-tertiary)'}}>{c.companyType}</span>
                            : <span style={{fontSize:10,color:'var(--text-muted)'}}>prospect</span>}
                          </td>
                          <td style={{padding:'10px 12px'}}>
                            <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                              {(c.tags || []).slice(0,2).map((t,i) => <span key={i} style={{fontSize:10,padding:'2px 6px',borderRadius:3,background:'var(--bg-sunken)',color:'var(--text-secondary)'}}>{t}</span>)}
                              {(c.tags || []).length > 2 && <span style={{fontSize:10,color:'var(--text-tertiary)'}}>+{c.tags.length - 2}</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          <Pagination total={filtered.length} page={page} onChange={setPage} />
        </div>

        {selected && (
          <div style={{flex:'1 1 auto',minWidth:0,minHeight:0,overflow:'hidden',display:'flex',flexDirection:'column',background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:14,padding:0}}>
            <div style={{padding:'20px 24px 0',flexShrink:0}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:16,gap:12}}>
                <div style={{display:'flex',alignItems:'center',gap:14,minWidth:0,flex:1}}>
                  <div style={{
                    width:52,height:52,borderRadius:14,flexShrink:0,
                    background: selected.logo_url ? 'transparent' : `linear-gradient(135deg, ${colorForIndustry(selected.industry)}, color-mix(in srgb, ${colorForIndustry(selected.industry)} 55%, #fff))`,
                    display:'flex',alignItems:'center',justifyContent:'center',
                    fontSize:20,fontWeight:700,color:selected.logo_url ? 'var(--text-primary)' : '#fff',
                    boxShadow: selected.logo_url ? 'none' : `0 4px 14px color-mix(in srgb, ${colorForIndustry(selected.industry)} 30%, transparent)`,
                    overflow:'hidden',
                  }}>
                    {selected.logo_url ? <img src={selected.logo_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} /> : selected.name[0]?.toUpperCase()}
                  </div>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,fontSize:18,fontWeight:700,color:'var(--text-primary)',letterSpacing:-0.3}}>
                      {selected.country && countryFlag(selected.country) && <span className={countryFlag(selected.country)} style={{fontSize:18,borderRadius:3,lineHeight:1,flexShrink:0,boxShadow:'0 0 0 1px var(--border)'}} title={selected.country}></span>}
                      <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{esc(selected.name)}</span>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4,flexWrap:'wrap'}}>
                      {selected.companyType && selected.companyType !== 'prospect' && <span style={{fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:5,background:selected.companyType==='client'?'#dcfce7':selected.companyType==='partner'?'#dbeafe':'var(--bg-sunken)',color:selected.companyType==='client'?'#16a34a':selected.companyType==='partner'?'#2563eb':'var(--text-tertiary)'}}>{selected.companyType}</span>}
                      {selected.industry && <span style={{fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:5,background:`color-mix(in srgb, ${colorForIndustry(selected.industry)} 12%, transparent)`,color:colorForIndustry(selected.industry)}}>{selected.industry}</span>}
                      {selected.companySize && <span style={{fontSize:12,color:'var(--text-tertiary)'}}>{selected.companySize} employees</span>}
                      {selected.domain && <a href={'https://' + selected.domain.replace(/^https?:\/\//, '')} target="_blank" rel="noopener noreferrer" title={'Visit ' + selected.domain} style={{fontSize:12,color:'var(--accent)',fontWeight:500,textDecoration:'none',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{selected.domain}</a>}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button className="mac-btn" style={{fontSize:11,display:'flex',alignItems:'center',gap:4}} onClick={() => setSelectedName(null)} title="Close">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                  {selected.isDerived ? (
                    <button className="btn-primary" style={{fontSize:11,display:'flex',alignItems:'center',gap:4}} onClick={() => { setFormInitial({ name: selected.name }); setShowForm(true); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      Add Details
                    </button>
                  ) : (
                    <>
                      <button className="mac-btn" style={{fontSize:11,display:'flex',alignItems:'center',gap:4,whiteSpace:'nowrap'}} onClick={() => setShowEnrich(true)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                        Enrich
                      </button>
                      <button className="mac-btn" style={{fontSize:11,display:'flex',alignItems:'center',gap:4}} onClick={() => { setFormInitial(selected); setShowForm(true); }} title="Edit">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                      </button>
                      <button className="mac-btn" style={{fontSize:11,color:'var(--danger)',display:'flex',alignItems:'center',gap:4}} onClick={() => { if (confirm('Delete ' + selected.name + ' record?')) { deleteCompany(selected.id); setSelectedName(null); showToast('Deleted'); } }} title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div style={{display:'flex',gap:4,borderBottom:'1px solid var(--border)',marginBottom:16}}>
                {[{key:'overview',label:'Overview'},{key:'contacts',label:`Contacts (${selectedContacts.length})`},{key:'activity',label:'Activity'}].map(tab => (
                  <button key={tab.key} onClick={() => setDetailTab(tab.key)} style={{
                    padding:'8px 14px',fontSize:12,fontWeight:500,border:'none',cursor:'pointer',borderBottom:detailTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent',marginBottom:-1,
                    background:'transparent',color:detailTab === tab.key ? 'var(--accent)' : 'var(--text-tertiary)',transition:'all 0.15s',
                  }}>{tab.label}</button>
                ))}
              </div>
            </div>

            <div style={{padding:'0 24px 20px',flex:1,overflowY:'auto'}}>
              {detailTab === 'overview' && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                    <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Contact Info</div>
                      {selected.phone && <div style={{marginBottom:6}}><div style={{fontSize:11,color:'var(--text-tertiary)'}}>Phone</div><div style={{fontSize:12,color:'var(--text-primary)'}}>{selected.phone}</div></div>}
                      {selected.linkedinUrl && <div style={{marginBottom:6}}><div style={{fontSize:11,color:'var(--text-tertiary)'}}>LinkedIn</div><a href={linkedinUrl(selected.linkedinUrl)} target="_blank" rel="noopener noreferrer" style={{fontSize:12,color:'var(--accent)',wordBreak:'break-all',textDecoration:'none'}}>{selected.linkedinUrl}</a></div>}
                      {selected.annualRevenue && <div><div style={{fontSize:11,color:'var(--text-tertiary)'}}>Revenue</div><div style={{fontSize:12,color:'var(--text-primary)',fontWeight:500}}>{selected.annualRevenue}</div></div>}
                      {!selected.phone && !selected.linkedinUrl && !selected.annualRevenue && (
                        <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'4px 0'}}>{selected.isDerived ? 'No details yet' : 'No info added'}</div>
                      )}
                    </div>
                    <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Location</div>
                      {selected.address && <div style={{fontSize:12,color:'var(--text-primary)',marginBottom:4}}>{selected.address}</div>}
                      {(() => {
                        const locText = [selected.city, selected.region, selected.country].filter(Boolean).join(', ');
                        if (!locText) return <div style={{fontSize:12,color:'var(--text-tertiary)'}}>No location</div>;
                        return (
                          <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:'var(--text-primary)'}}>
                            {selected.country && countryFlag(selected.country) && <span className={countryFlag(selected.country)} style={{fontSize:14,borderRadius:2,lineHeight:1,flexShrink:0,boxShadow:'0 0 0 1px var(--border)'}} title={selected.country}></span>}
                            <span>{locText}</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {selected.description && (
                    <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:6,letterSpacing:0.2,textTransform:'uppercase'}}>About</div>
                      <div style={{fontSize:13,color:'var(--text-primary)',lineHeight:1.65,whiteSpace:'pre-wrap'}}>{esc(selected.description)}</div>
                    </div>
                  )}

                  {selected.tags && selected.tags.length > 0 && (
                    <div style={{padding:'14px 16px',borderRadius:10,background:'var(--bg-canvas)',border:'1px solid var(--border)'}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:8,letterSpacing:0.2,textTransform:'uppercase'}}>Tags</div>
                      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                        {selected.tags.map((t, i) => <span key={i} style={{fontSize:11,padding:'3px 9px',borderRadius:5,background:'var(--accent-tint)',color:'var(--accent)',fontWeight:500}}>{t}</span>)}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'contacts' && (
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {selectedContacts.length === 0 ? (
                    <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-tertiary)',fontSize:13}}>
                      No contacts from this company yet.
                      <br/>
                      <button className="btn-xs" style={{marginTop:8}} onClick={() => useStore.getState().setAppPage('contacts')}>Go to Contacts</button>
                    </div>
                  ) : (
                    <>
                      {totalValue > 0 && (
                        <div style={{padding:'10px 14px',borderRadius:8,background:'var(--accent-tint)',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:4}}>
                          <span style={{fontSize:12,color:'var(--accent)',fontWeight:500}}>Total Pipeline</span>
                          <span style={{fontSize:14,fontWeight:700,color:'var(--accent)'}}>${totalValue.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedContacts.map(p => (
                        <div key={p.id} onClick={() => setDetailId(p.id)} style={{
                          display:'flex',alignItems:'center',gap:10,
                          padding:'10px 12px',borderRadius:8,cursor:'pointer',transition:'background 0.12s',
                        }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-canvas)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <div style={{
                            width:32,height:32,borderRadius:8,flexShrink:0,
                            background:'var(--accent-tint)',color:'var(--accent)',
                            display:'flex',alignItems:'center',justifyContent:'center',
                            fontSize:12,fontWeight:700,
                          }}>{p.name[0]?.toUpperCase()}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{esc(p.name)}</div>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginTop:1}}>
                              {p.title && <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{esc(p.title)}</span>}
                              {p.email && <><span style={{width:2,height:2,borderRadius:'50%',background:'var(--border)'}} /><span style={{fontSize:11,color:'var(--accent)'}}>{p.email}</span></>}
                            </div>
                          </div>
                          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2,flexShrink:0}}>
                            {p.dealValue > 0 && <span style={{fontSize:11,fontWeight:600,color:'var(--accent)'}}>{formatMoney(p.dealValue)}</span>}
                            <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:3,background:'var(--bg-sunken)',color:'var(--text-tertiary)',textTransform:'capitalize'}}>{p.stage}</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {detailTab === 'activity' && (
                <div>
                  {selectedContacts.reduce((sum, p) => sum + (p.touchpoints?.length || 0), 0) === 0 ? (
                    <div style={{textAlign:'center',padding:'40px 20px',color:'var(--text-tertiary)',fontSize:13}}>No activity across contacts at this company.</div>
                  ) : (
                    <div style={{display:'flex',flexDirection:'column',gap:4}}>
                      {selectedContacts.flatMap(p => (p.touchpoints || []).map(t => ({...t, contactName: p.name, contactId: p.id})))
                        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                        .slice(0, 15)
                        .map((t, i) => (
                          <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 10px',borderRadius:8,background:'var(--bg-canvas)'}}>
                            <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:3,background:'var(--accent-tint)',color:'var(--accent)',whiteSpace:'nowrap'}}>{t.channel}</span>
                            <span style={{fontSize:12,color:'var(--text-primary)',flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{esc(t.note)}</span>
                            <span style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap',flexShrink:0}}>{esc(t.contactName)}</span>
                            <span style={{fontSize:10,color:'var(--text-tertiary)',whiteSpace:'nowrap',flexShrink:0}}>{timeAgo(t.created_at || t.date)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showForm && <CompanyForm initial={formInitial} onSave={formInitial && formInitial.id && !String(formInitial.id).startsWith('derived-') ? (data) => updateCompany(formInitial.id, data) : (data) => addCompany(data)} onClose={() => setShowForm(false)} />}

      {showEnrich && selected && (
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) setShowEnrich(false); }}>
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:0,maxWidth:440,width:'95%'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 16px 0'}}>
              <h3 style={{margin:0,fontSize:15,fontWeight:600}}>Enrich: {selected.name}</h3>
              <button className="btn-icon-sm" onClick={() => setShowEnrich(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <EnrichmentPanel
              type="company"
              data={selected}
              onEnrich={(data) => {
                updateCompany(selected.id, data);
                showToast('Company enriched from Apollo');
                setShowEnrich(false);
              }}
              onClose={() => setShowEnrich(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
