import { useState, useEffect } from 'react';
import { enrichPerson, enrichCompany, isApolloConfiguredAsync } from '../utils/apollo';
import { showToast } from './Toast';

export default function EnrichmentPanel({ type = 'person', data, onEnrich, onClose }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [configured, setConfigured] = useState(null);

  useEffect(() => {
    isApolloConfiguredAsync().then(setConfigured);
  }, []);

  const handleEnrich = async () => {
    setLoading(true);
    try {
      let resp;
      if (type === 'person') {
        resp = await enrichPerson({
          apollo_id: data.customFields?.apollo_id || undefined,
          email: data.email || undefined,
          first_name: data.name?.split(' ')[0],
          last_name: data.name?.split(' ').slice(1).join(' '),
          linkedin_url: data.linkedin || undefined,
          organization_name: data.company || undefined,
          title: data.title || undefined,
        });
      } else {
        resp = await enrichCompany({
          domain: data.domain,
          organization_name: data.name,
        });
      }
      setResult(resp.data);
      showToast(type === 'person' ? 'Contact enriched!' : 'Company enriched!');
    } catch (err) {
      showToast('Enrichment failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const applyResult = () => {
    if (!result || !onEnrich) return;
    const updates = {};
    if (type === 'person') {
      const cf = { ...(data.customFields || {}) };
      if (result.apollo_id) cf.apollo_id = result.apollo_id;
      if (result.industry) cf.industry = result.industry;
      if (result.company_size) cf.company_size = result.company_size;
      if (result.annual_revenue) cf.annual_revenue = result.annual_revenue;
      if (result.description) cf.company_description = result.description;
      if (result.founded_year) cf.founded_year = result.founded_year;
      if (result.technologies?.length) cf.technologies = result.technologies;
      if (result.keywords?.length) cf.keywords = result.keywords;
      updates.customFields = cf;
      if (result.email) updates.email = result.email;
      if (result.phone) updates.phone = result.phone;
      if (result.linkedin) updates.linkedin = result.linkedin;
      if (result.title) updates.title = result.title;
      if (result.company) updates.company = result.company;
      if (result.name) updates.name = result.name;
      if (result.city || result.country) {
        updates.countries = [];
        if (result.country) updates.countries.push(result.country);
      }
    } else {
      if (result.domain) updates.domain = result.domain;
      if (result.industry) updates.industry = result.industry;
      if (result.company_size) updates.companySize = String(result.company_size);
      if (result.annual_revenue) updates.annualRevenue = result.annual_revenue;
      if (result.phone) updates.phone = result.phone;
      if (result.address) updates.address = result.address;
      if (result.city) updates.city = result.city;
      if (result.state) updates.region = result.state;
      if (result.country) updates.country = result.country;
      if (result.linkedin) updates.linkedinUrl = result.linkedin;
      if (result.logo) updates.logo_url = result.logo;
      if (result.description) updates.description = result.description;
    }
    onEnrich(updates);
    showToast('Data applied');
    onClose?.();
  };

  if (configured === null) {
    return (
      <div style={{padding:'16px',textAlign:'center'}}>
        <div style={{fontSize:13,color:'var(--text-tertiary)'}}>Checking Apollo...</div>
      </div>
    );
  }

  if (!configured) {
    return (
      <div style={{padding:'16px',textAlign:'center'}}>
        <div style={{width:40,height:40,borderRadius:10,background:'var(--bg-sunken)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>Apollo not configured</div>
        <div style={{fontSize:12,color:'var(--text-tertiary)',marginBottom:12}}>Add your Apollo API key in Settings to enable enrichment.</div>
        <a href="#" onClick={e => { e.preventDefault(); onClose?.(); }} style={{fontSize:12,color:'var(--accent)',fontWeight:500}}>Go to Settings</a>
      </div>
    );
  }

  if (result) {
    const fields = type === 'person' ? [
      { label:'Name', value:result.name },
      { label:'Title', value:result.title },
      { label:'Company', value:result.company },
      { label:'Email', value:result.email },
      { label:'Phone', value:result.phone },
      { label:'LinkedIn', value:result.linkedin },
      { label:'Industry', value:result.industry },
      { label:'Company Size', value:result.company_size ? result.company_size + ' employees' : null },
      { label:'Revenue', value:result.annual_revenue },
      { label:'City', value:result.city },
      { label:'State', value:result.state },
      { label:'Country', value:result.country },
      { label:'Founded', value:result.founded_year },
      { label:'Description', value:result.description },
    ] : [
      { label:'Name', value:result.name },
      { label:'Domain', value:result.domain },
      { label:'Industry', value:result.industry },
      { label:'Size', value:result.company_size ? result.company_size + ' employees' : null },
      { label:'Revenue', value:result.annual_revenue },
      { label:'Phone', value:result.phone },
      { label:'City', value:result.city },
      { label:'Country', value:result.country },
      { label:'LinkedIn', value:result.linkedin },
      { label:'Description', value:result.description },
    ];
    return (
      <div style={{padding:'16px'}}>
        <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:12}}>Enrichment Results</div>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:16}}>
          {fields.filter(f => f.value).map((f, i) => (
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:11,color:'var(--text-tertiary)'}}>{f.label}</span>
              <span style={{fontSize:12,color:'var(--text-primary)',fontWeight:500,maxWidth:'60%',textAlign:'right',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.value}</span>
            </div>
          ))}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn-primary" style={{flex:1}} onClick={applyResult}>Apply to {type === 'person' ? 'Contact' : 'Company'}</button>
          <button className="btn-secondary" onClick={() => { setResult(null); onClose?.(); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{padding:'16px',textAlign:'center'}}>
      <div style={{width:40,height:40,borderRadius:10,background:'var(--accent-tint)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 12px'}}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" width="20" height="20"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      </div>
      <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>Enrich with Apollo</div>
      <div style={{fontSize:12,color:'var(--text-tertiary)',marginBottom:16}}>Pull latest data from Apollo's database</div>
      <button className="btn-primary" style={{width:'100%'}} onClick={handleEnrich} disabled={loading}>
        {loading ? 'Enriching...' : 'Enrich Now'}
      </button>
    </div>
  );
}
