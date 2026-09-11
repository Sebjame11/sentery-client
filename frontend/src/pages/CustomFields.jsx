import { useState, useEffect, useCallback } from 'react';
import useStore from '../store/useStore';
import { api } from '../utils/meetings';
import { showToast } from '../components/Toast';
import { esc } from '../utils/helpers';

const FIELD_TYPES = ['text','number','date','select','checkbox','textarea'];
const FIELD_TEMPLATES = [
    { name:'Deal Stage Notes', type:'textarea', options:[] },
    { name:'Decision Maker', type:'checkbox', options:[] },
    { name:'Budget Range', type:'select', options:['<10k','10k-50k','50k-100k','100k-500k','500k+'] },
    { name:'Implementation Timeline', type:'select', options:['Immediate','1-3 months','3-6 months','6-12 months','12+ months'] },
    { name:'Tech Stack', type:'text', options:[] },
    { name:'Last Demo Date', type:'date', options:[] },
    { name:'Champion Name', type:'text', options:[] },
    { name:'Competitor in Deal', type:'text', options:[] },
];

export default function CustomFields() {
    const workspace = useStore(s => s.workspace);
    const wsId = workspace?.id;
    const prospects = useStore(s => s.prospects);
    const updateProspect = useStore(s => s.updateProspect);
    const [fields, setFields] = useState(() => { try { return JSON.parse(localStorage.getItem('vn_customFields'))||[]; } catch { return []; } });
    const [form, setForm] = useState({ name:'', type:'text', options:'', required:false });
    const [editing, setEditing] = useState(null);
    const [bulkEditField, setBulkEditField] = useState(null);
    const [bulkEditValue, setBulkEditValue] = useState('');
    const [bulkSelected, setBulkSelected] = useState([]);

    const syncToBackend = useCallback(async (list) => {
        if (!wsId) return;
        try {
            await api('/custom-fields', {
                method: 'PUT', auth: true,
                body: { workspace_id: wsId, fields: list.map((f, i) => ({ id: f.id, name: f.name, type: f.type, options: f.options || [], required: !!f.required, position: i })) },
            });
        } catch (e) {
            console.error('custom fields sync error:', e.message);
            showToast('Saved locally — server sync failed: ' + e.message);
        }
    }, [wsId]);

    useEffect(() => {
        if (!wsId) return;
        (async () => {
            try {
                const res = await api('/custom-fields', { auth: true });
                const server = res.custom_fields || [];
                if (server.length > 0) {
                    setFields(server);
                    localStorage.setItem('vn_customFields', JSON.stringify(server));
                } else if (fields.length > 0) {
                    await syncToBackend(fields);
                }
            } catch { /* server unavailable — stay on local data */ }
        })();
    }, [wsId]); // eslint-disable-line react-hooks/exhaustive-deps

    const saveFields = (list) => { setFields(list); localStorage.setItem('vn_customFields', JSON.stringify(list)); syncToBackend(list); };

    const handleAdd = () => {
        if (!form.name.trim()) { showToast('Field name required'); return; }
        const field = { id:Date.now().toString(), name:form.name.trim(), type:form.type, required:form.required, options:form.type === 'select' ? form.options.split(',').map(o => o.trim()).filter(Boolean) : [] };
        saveFields([...fields, field]);
        setForm({ name:'', type:'text', options:'', required:false });
        showToast('Field added');
    };

    const handleAddTemplate = (template) => { if (fields.find(f => f.name === template.name)) { showToast('Field already exists'); return; } saveFields([...fields, { id:Date.now().toString(), ...template }]); showToast(`Added "${template.name}" field`); };
    const handleDelete = (id) => { saveFields(fields.filter(f => f.id !== id)); showToast('Field deleted'); };

    const handleUpdateValue = (prospectId, fieldId, value) => {
        const p = prospects.find(pr => pr.id === prospectId);
        if (!p) return;
        updateProspect(prospectId, { customFields:{ ...(p.customFields||{}), [fieldId]:value } });
    };

    const handleBulkEdit = () => {
        if (!bulkEditField || bulkSelected.length === 0) return;
        bulkSelected.forEach(id => { const p = prospects.find(pr => pr.id === id); if (p) { updateProspect(id, { customFields:{ ...(p.customFields||{}), [bulkEditField]:bulkEditValue } }); } });
        showToast(`Updated ${bulkSelected.length} prospects`);
        setBulkEditField(null); setBulkEditValue(''); setBulkSelected([]);
    };

    const getFieldValueCount = (fieldId) => prospects.filter(p => p.customFields && p.customFields[fieldId]).length;
    const getFieldStats = (fieldId) => { const field = fields.find(f => f.id === fieldId); if (!field || field.type !== 'select') return null; const counts = {}; prospects.forEach(p => { const val = p.customFields?.[fieldId]; if (val) counts[val] = (counts[val]||0) + 1; }); return counts; };
    const unusedTemplates = FIELD_TEMPLATES.filter(t => !fields.find(f => f.name === t.name));

    return (
        <div className="mac-page">
            <div className="mac-page-header">
                <h1 className="mac-page-title">Custom Fields</h1>
            </div>

            <div className="mac-stats">
                <div className="mac-stat"><div className="mac-stat-value">{fields.length}</div><div className="mac-stat-label">Fields Defined</div></div>
                <div className="mac-stat"><div className="mac-stat-value">{prospects.filter(p => p.customFields && Object.keys(p.customFields).length > 0).length}</div><div className="mac-stat-label">Prospects with Data</div></div>
                <div className="mac-stat"><div className="mac-stat-value">{fields.reduce((s, f) => s + getFieldValueCount(f.id), 0)}</div><div className="mac-stat-label">Total Values</div></div>
            </div>

            <div className="mac-group" style={{marginBottom:16}}>
                <div className="mac-group-header">Field Definitions <span className="mac-group-header-count">({fields.length})</span></div>
                {fields.length > 0 && <div className="mac-table-wrap"><table className="mac-table"><thead><tr><th>Field Name</th><th>Type</th><th>Options</th><th>Required</th><th>Filled</th><th>Fill Rate</th><th>Actions</th></tr></thead><tbody>
                    {fields.map(f => {
                        const filled = getFieldValueCount(f.id);
                        const fillRate = prospects.length ? Math.round((filled/prospects.length)*100) : 0;
                        const stats = getFieldStats(f.id);
                        return (
                            <tr key={f.id}>
                                <td style={{fontWeight:500}}>{esc(f.name)}</td>
                                <td><span className="mac-tag" style={{fontSize:10}}>{f.type}</span></td>
                                <td style={{fontSize:'0.72rem',color:'var(--text-secondary)'}}>{f.options.length ? f.options.join(', ') : '-'}</td>
                                <td>{f.required ? 'Yes' : 'No'}</td>
                                <td>{filled}/{prospects.length}</td>
                                <td><div className="mac-flex" style={{gap:6}}><div className="mac-progress" style={{width:60,height:4}}><div className="mac-progress-fill" style={{width:`${fillRate}%`,background:fillRate>=80?'var(--success)':fillRate>=40?'var(--accent)':'var(--warning)'}} /></div><span style={{fontSize:'0.65rem'}}>{fillRate}%</span></div></td>
                                <td><div className="mac-gap-sm"><button className="mac-btn-icon mac-btn-sm" onClick={() => { setBulkEditField(f.id); setBulkSelected(prospects.map(p => p.id)); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button><button className="mac-btn-icon mac-btn-sm" onClick={() => handleDelete(f.id)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></td>
                            </tr>
                        );
                    })}
                </tbody></table></div>}

                {unusedTemplates.length > 0 && <div style={{padding:'10px 16px'}}>
                    <div className="mac-label" style={{marginBottom:6}}>Quick Add Templates</div>
                    <div className="mac-chip-row">{unusedTemplates.map(t => <button key={t.name} className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => handleAddTemplate(t)}>+ {t.name}</button>)}</div>
                </div>}

                <div style={{padding:'8px 16px 14px',borderTop:'1px solid var(--border)'}}>
                    <div className="mac-label" style={{marginBottom:6}}>Add New Field</div>
                    <div className="mac-grid-2" style={{gap:8,alignItems:'end'}}>
                        <div className="mac-input-wrap"><div className="mac-label">Name</div><input className="mac-input" value={form.name} onChange={e => setForm({...form, name:e.target.value})} placeholder="Field name" /></div>
                        <div className="mac-flex" style={{gap:8,alignItems:'end'}}>
                            <div className="mac-input-wrap" style={{flex:1}}><div className="mac-label">Type</div><select className="mac-select" value={form.type} onChange={e => setForm({...form, type:e.target.value})}>{FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                            <label className="mac-flex" style={{gap:4,fontSize:'0.72rem',paddingBottom:4,cursor:'pointer'}}><input type="checkbox" checked={form.required} onChange={e => setForm({...form, required:e.target.checked})} /> Required</label>
                        </div>
                    </div>
                    {form.type === 'select' && <div className="mac-input-wrap" style={{marginTop:8}}><div className="mac-label">Options (comma-separated)</div><input className="mac-input" value={form.options} onChange={e => setForm({...form, options:e.target.value})} placeholder="Opt1, Opt2" /></div>}
                    <button className="mac-btn mac-btn-primary mac-btn-sm" style={{marginTop:8}} onClick={handleAdd}>Add Field</button>
                </div>
            </div>

            {bulkEditField && (
                <div className="mac-group" style={{marginBottom:16,borderLeft:'3px solid var(--accent)'}}>
                    <div className="mac-group-header">Bulk Edit: {fields.find(f => f.id === bulkEditField)?.name}</div>
                    <div className="mac-group-body" style={{padding:'12px 16px'}}>
                        <div style={{marginBottom:8}}>
                            {(() => { const field = fields.find(f => f.id === bulkEditField); if (!field) return null;
                                if (field.type === 'select') return <select className="mac-select" style={{width:300}} value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)}><option value="">Select value...</option>{field.options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
                                if (field.type === 'checkbox') return <div className="mac-gap-sm"><button className={bulkEditValue==='true'?'mac-btn mac-btn-primary mac-btn-xs':'mac-btn mac-btn-ghost mac-btn-xs'} onClick={() => setBulkEditValue('true')}>Yes</button><button className={bulkEditValue==='false'?'mac-btn mac-btn-primary mac-btn-xs':'mac-btn mac-btn-ghost mac-btn-xs'} onClick={() => setBulkEditValue('false')}>No</button></div>;
                                return <input className="mac-input" style={{width:300}} value={bulkEditValue} onChange={e => setBulkEditValue(e.target.value)} placeholder="Value" />;
                            })()}
                        </div>
                        <div className="mac-text-muted" style={{fontSize:'0.75rem',marginBottom:8}}>Apply to {bulkSelected.length} prospects</div>
                        <div className="mac-gap"><button className="mac-btn mac-btn-primary mac-btn-sm" onClick={handleBulkEdit}>Apply to All</button><button className="mac-btn mac-btn-ghost mac-btn-sm" onClick={() => { setBulkEditField(null); setBulkEditValue(''); }}>Cancel</button></div>
                    </div>
                </div>
            )}

            {fields.length > 0 && (
                <div className="mac-group">
                    <div className="mac-group-header">Prospect Data Entry</div>
                    <div className="mac-table-wrap"><table className="mac-table"><thead><tr><th>Company</th>{fields.map(f => <th key={f.id} style={{minWidth:110}}>{esc(f.name)}</th>)}</tr></thead><tbody>
                        {prospects.slice(0, 20).map(p => (
                            <tr key={p.id}>
                                <td style={{fontWeight:500,whiteSpace:'nowrap'}}>{esc(p.company)}</td>
                                {fields.map(f => {
                                    const val = p.customFields?.[f.id] ?? '';
                                    return <td key={f.id}>
                                        {f.type === 'select' ? <select className="mac-select" style={{fontSize:11,padding:'3px 6px',minWidth:100}} value={val} onChange={e => handleUpdateValue(p.id, f.id, e.target.value)}><option value="">-</option>{f.options.map(o => <option key={o} value={o}>{o}</option>)}</select>
                                        : f.type === 'checkbox' ? <input type="checkbox" checked={!!val} onChange={e => handleUpdateValue(p.id, f.id, e.target.checked?true:'')} />
                                        : <input type={f.type} className="mac-input" style={{fontSize:11,padding:'3px 6px',minWidth:100}} value={val} onChange={e => handleUpdateValue(p.id, f.id, e.target.value)} placeholder="-" />}
                                    </td>;
                                })}
                            </tr>
                        ))}
                    </tbody></table></div>
                    {prospects.length > 20 && <div className="mac-text-muted" style={{fontSize:'0.72rem',padding:'8px 16px'}}>Showing 20 of {prospects.length} prospects</div>}
                </div>
            )}
        </div>
    );
}
