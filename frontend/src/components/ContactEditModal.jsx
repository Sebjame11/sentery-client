import { useState, useMemo } from 'react';
import useStore from '../store/useStore';
import { showToast } from './Toast';
import CountrySelect from './CountrySelect';
import CompanyPicker from './CompanyPicker';
import { currencySymbol, getCurrencyCode } from '../utils/currency';
import { LIFECYCLE_STAGES, LIFECYCLE_LABELS, CONTACT_STATUSES, CONTACT_STATUS_LABELS, getStageIds, getStageLabels, getLeadSources } from '../utils/constants';

const FIELDS = [
  { key: 'firstName', label: 'First Name', type: 'text', placeholder: 'John' },
  { key: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Doe' },
  { key: 'title', label: 'Title', type: 'text', placeholder: 'VP Sales' },
  { key: 'company', label: 'Company', type: 'company', placeholder: 'Acme Corp' },
  { key: 'email', label: 'Email', type: 'text', placeholder: 'john@acme.com' },
  { key: 'phone', label: 'Phone', type: 'text', placeholder: '+1 555-0100' },
  { key: 'linkedin', label: 'LinkedIn', type: 'text', placeholder: 'linkedin.com/in/johndoe' },
];

export default function ContactEditModal({ prospect, onClose }) {
  const updateProspect = useStore(s => s.updateProspect);
  const companies = useStore(s => s.companies);
  const workspace = useStore(s => s.workspace);
  const stageIds = useMemo(() => getStageIds(workspace), [workspace]);
  const stageLabels = useMemo(() => getStageLabels(workspace), [workspace]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => ({
    firstName: prospect.firstName || prospect.first_name || '',
    lastName: prospect.lastName || prospect.last_name || '',
    title: prospect.title || '',
    company: prospect.company || '',
    email: prospect.email || '',
    phone: prospect.phone || '',
    linkedin: prospect.linkedin || '',
    tier: prospect.tier || 'cold',
    stage: prospect.stage || 'lead',
    lifecycleStage: prospect.lifecycleStage || prospect.lifecycle_stage || 'lead',
    contactStatus: prospect.contactStatus || prospect.status || '',
    leadSource: prospect.leadSource || prospect.lead_source || '',
    dealValue: prospect.dealValue || 0,
    angle: prospect.angle || '',
    notes: prospect.notes || '',
    countries: prospect.countries || [],
  }));

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const save = async () => {
    const fullName = ((form.firstName || '') + ' ' + (form.lastName || '')).trim();
    if (!fullName) { showToast('Name is required'); return; }
    setSaving(true);
    try {
      const companyName = form.company.trim();
      if (companyName && !companies.some(c => c.name.toLowerCase() === companyName.toLowerCase())) {
        try { await useStore.getState().addCompany({ name: companyName }); } catch {}
      }
      await updateProspect(prospect.id, {
        name: fullName,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        title: form.title.trim(),
        company: companyName,
        email: form.email.trim(),
        phone: form.phone.trim(),
        linkedin: form.linkedin.trim(),
        tier: form.tier,
        stage: form.stage,
        lifecycleStage: form.lifecycleStage,
        contactStatus: form.lifecycleStage === 'lead' ? '' : form.contactStatus,
        leadSource: form.leadSource,
        dealValue: Number(form.dealValue) || 0,
        angle: form.angle.trim(),
        notes: form.notes,
        countries: form.countries,
      });
      showToast(fullName + ' saved');
      onClose();
    } catch (e) {
      showToast('Update failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:560,width:'95%',maxHeight:'90vh',overflow:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Edit Contact</h3>
          <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {FIELDS.map(f => (
            <div className="field" key={f.key} style={f.type === 'company' ? { gridColumn: '1 / -1' } : {}}>
              <label className="field-label">{f.label}</label>
              {f.type === 'company' ? (
                <CompanyPicker value={form.company} onChange={v => setField('company', v)} />
              ) : (
                <input className="field-input" value={form[f.key]} onChange={e => setField(f.key, e.target.value)} placeholder={f.placeholder} />
              )}
            </div>
          ))}

          <div className="field">
            <label className="field-label">Tier</label>
            <select className="field-input" value={form.tier} onChange={e => setField('tier', e.target.value)}>
              <option value="cold">Cold</option>
              <option value="warm">Warm</option>
              <option value="hot">Hot</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Stage</label>
            <select className="field-input" value={form.stage} onChange={e => setField('stage', e.target.value)}>
              {stageIds.map(s => (
                <option key={s} value={s}>{stageLabels[s]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Lifecycle Stage</label>
            <select className="field-input" value={form.lifecycleStage} onChange={e => setField('lifecycleStage', e.target.value)}>
              {LIFECYCLE_STAGES.map(s => <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>)}
            </select>
          </div>
          {form.lifecycleStage !== 'lead' && (
            <div className="field">
              <label className="field-label">Status</label>
              <select className="field-input" value={form.contactStatus} onChange={e => setField('contactStatus', e.target.value)}>
                <option value="">Select status...</option>
                {CONTACT_STATUSES.map(s => <option key={s} value={s}>{CONTACT_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label className="field-label">Lead Source</label>
            <select className="field-input" value={form.leadSource} onChange={e => setField('leadSource', e.target.value)}>
              <option value="">Select source...</option>
              {getLeadSources(workspace).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Deal Value ({currencySymbol(getCurrencyCode())})</label>
            <input className="field-input" type="number" min="0" value={form.dealValue} onChange={e => setField('dealValue', e.target.value)} placeholder="0" />
          </div>
          <div className="field">
            <label className="field-label">Angle / Pitch</label>
            <input className="field-input" value={form.angle} onChange={e => setField('angle', e.target.value)} placeholder="Cost reduction, growth, etc." />
          </div>
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <label className="field-label">Country</label>
            <CountrySelect value={form.countries} onChange={v => setField('countries', v)} />
          </div>
          <div className="field" style={{gridColumn:'1 / -1'}}>
            <label className="field-label">Notes</label>
            <textarea className="field-input" rows={3} value={form.notes} onChange={e => setField('notes', e.target.value)} placeholder="Research notes, talking points..." />
          </div>
        </div>

        <button className="btn-primary" style={{width:'100%',marginTop:16}} onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Contact'}</button>
      </div>
    </div>
  );
}