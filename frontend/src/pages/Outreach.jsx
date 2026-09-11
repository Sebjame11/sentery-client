import { useState, useMemo } from 'react';
import useStore from '../store/useStore';
import { showToast } from '../components/Toast';
import { generateTemplate } from '../utils/ai';
import { sendEmail, isEmailConfigured, getEmailConfig, setEmailConfig } from '../utils/email';

const VARS = ['first_name','company','pain_point','sender_name','industry','city'];
const CATEGORIES = ['All','Cold Email','Follow-Up','LinkedIn','Proposal','Breakup','Re-engagement'];

function replaceVars(text, overrides = {}) {
    if (!text) return '';
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => overrides[key] || `{{${key}}}`);
}

function TemplateEditor({ template, onSave, onCancel }) {
    const [name, setName] = useState(template?.name || '');
    const [subject, setSubject] = useState(template?.subject || '');
    const [body, setBody] = useState(template?.body || '');
    const [category, setCategory] = useState(template?.category || 'Cold Email');
    const [previewVars, setPreviewVars] = useState({ first_name:'Sarah', company:'Acme Inc', pain_point:'scaling outreach', sender_name:'You', industry:'SaaS', city:'SF' });
    const [showPreview, setShowPreview] = useState(false);

    const handleSave = () => {
        if (!name.trim() || !body.trim()) { showToast('Name and body required'); return; }
        onSave({ ...template, name:name.trim(), subject:subject.trim(), body:body.trim(), category });
    };

    return (
        <div className="mac-page">
            <div className="mac-flex-between" style={{marginBottom:16}}>
                <button className="mac-btn mac-btn-ghost" onClick={onCancel}>&larr; Back to templates</button>
            </div>
            <div className="mac-group" style={{maxWidth:680,margin:'0 auto'}}>
                <div className="mac-group-header">{template ? 'Edit Template' : 'New Template'}</div>
                <div className="mac-group-body" style={{padding:'14px 18px'}}>
                    <div className="mac-input-wrap" style={{marginBottom:12}}><div className="mac-label">Template Name</div><input className="mac-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cold Email — Cost Savings" /></div>
                    <div className="mac-grid-2" style={{gap:12,marginBottom:12}}>
                        <div className="mac-input-wrap"><div className="mac-label">Category</div><select className="mac-select" value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.filter(c => c !== 'All').map(c => <option key={c}>{c}</option>)}</select></div>
                        <div className="mac-input-wrap"><div className="mac-label">Subject Line</div><input className="mac-input" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject with {{variables}}" /></div>
                    </div>
                    <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Body</div><textarea className="mac-textarea" style={{minHeight:160,fontFamily:'var(--font-mono)',fontSize:12,lineHeight:1.7}} value={body} onChange={e => setBody(e.target.value)} placeholder="Hi {{first_name}},..." /></div>
                    <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:12}}>Available variables: {VARS.map(v => <code key={v} style={{background:'var(--bg-sunken)',padding:'1px 5px',borderRadius:3,margin:'0 2px',fontSize:11}}>{'{{'+v+'}}'}</code>)}</div>
                    <div className="mac-gap">
                        <button className="mac-btn mac-btn-primary" onClick={handleSave}>{template ? 'Update Template' : 'Save Template'}</button>
                        <button className="mac-btn mac-btn-ghost" onClick={() => setShowPreview(!showPreview)}>{showPreview ? 'Hide Preview' : 'Preview'}</button>
                        <button className="mac-btn mac-btn-ghost" onClick={onCancel}>Cancel</button>
                    </div>
                    {showPreview && (
                        <div style={{marginTop:14,borderTop:'1px solid var(--border)',paddingTop:14}}>
                            <div style={{fontSize:11,color:'var(--text-tertiary)',marginBottom:8}}>Preview with sample data</div>
                            <div className="mac-chip-row" style={{marginBottom:10}}>{VARS.map(v => <div key={v} className="mac-flex" style={{gap:3}}><span style={{fontSize:10,color:'var(--text-tertiary)'}}>{'{'+v+'}'}</span><input className="mac-input" style={{width:100,height:24,fontSize:11}} value={previewVars[v]||''} onChange={e => setPreviewVars({...previewVars,[v]:e.target.value})} /></div>)}</div>
                            {subject && <div style={{marginBottom:8,padding:'6px 10px',background:'var(--bg-sunken)',borderRadius:6,fontSize:12,fontWeight:500}}>Subject: {replaceVars(subject, previewVars)}</div>}
                            <div style={{padding:'10px 12px',background:'var(--bg-sunken)',borderRadius:8,fontSize:13,whiteSpace:'pre-wrap',lineHeight:1.7}}>{replaceVars(body, previewVars)}</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function Outreach() {
    const { templates, addTemplate, updateTemplate, deleteTemplate } = useStore();
    const [editing, setEditing] = useState(null);
    const [categoryFilter, setCategoryFilter] = useState('All');
    const [search, setSearch] = useState('');
    const [generating, setGenerating] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [sending, setSending] = useState(null);
    const [sendTo, setSendTo] = useState('');
    const [senderName, setSenderName] = useState('');
    const [sendingLoading, setSendingLoading] = useState(false);
    const [showEmailConfig, setShowEmailConfig] = useState(false);
    const [ejConfig, setEjConfig] = useState(getEmailConfig());

    const filtered = useMemo(() => {
        let list = templates;
        if (categoryFilter !== 'All') list = list.filter(t => t.category === categoryFilter);
        if (search.trim()) { const q = search.toLowerCase(); list = list.filter(t => t.name.toLowerCase().includes(q) || (t.body||'').toLowerCase().includes(q) || (t.subject||'').toLowerCase().includes(q)); }
        return list;
    }, [templates, categoryFilter, search]);

    const handleSave = (tpl) => {
        if (editing?.id) { updateTemplate(editing.id, { name:tpl.name, subject:tpl.subject, body:tpl.body, category:tpl.category }); showToast('Template updated'); }
        else { addTemplate({ name:tpl.name, subject:tpl.subject, body:tpl.body, category:tpl.category, createdAt:new Date().toISOString(), useCount:0 }); showToast('Template created'); }
        setEditing(null);
    };

    const handleAiGenerate = async () => {
        const desc = prompt('Describe the template you want to create:\n(e.g. "A short cold email about cost savings for finance VPs")');
        if (!desc) return; setGenerating(true);
        try {
            const raw = await generateTemplate(desc);
            let tpl; try { tpl = JSON.parse(raw); } catch { tpl = JSON.parse(raw.replace(/```/g,'').trim()); }
            if (tpl && tpl.name && tpl.body) { setEditing({ name:tpl.name, subject:tpl.subject||'', body:tpl.body, category:CATEGORIES.includes(tpl.category)?tpl.category:'Cold Email' }); showToast('AI template generated — review and save'); }
            else showToast('AI returned invalid template format');
        } catch (err) { showToast('AI error: '+err.message); } finally { setGenerating(false); }
    };

    const handleCopyTemplate = (tpl) => { navigator.clipboard.writeText(`Subject: ${tpl.subject||'(no subject)'}\n\n${tpl.body}`); updateTemplate(tpl.id, { useCount:(tpl.useCount||0)+1 }); showToast('Template copied'); };
    const handleCopyAsText = (tpl) => { navigator.clipboard.writeText(tpl.body.replace(/\{\{(\w+)\}\}/g, (_,k) => k==='first_name'?'Prospect':k==='company'?'Company':k==='sender_name'?'You':`[${k}]`)); updateTemplate(tpl.id, { useCount:(tpl.useCount||0)+1 }); showToast('Copied as plain text'); };

    const handleSendEmail = async () => {
        if (!sendTo.trim()) { showToast('Recipient email required'); return; }
        if (!isEmailConfigured()) { setShowEmailConfig(true); return; }
        setSendingLoading(true);
        try { await sendEmail({ to:sendTo.trim(), subject:sending.subject||'', message:sending.body, from_name:senderName.trim()||undefined }); updateTemplate(sending.id, { useCount:(sending.useCount||0)+1 }); showToast('Email sent to '+sendTo.trim()); setSending(null); setSendTo(''); setSenderName(''); }
        catch (err) { showToast('Send failed: '+err.message); } finally { setSendingLoading(false); }
    };

    const catCounts = useMemo(() => { const counts = {}; templates.forEach(t => { counts[t.category||'Uncategorized'] = (counts[t.category||'Uncategorized']||0)+1; }); return counts; }, [templates]);

    if (editing) return <TemplateEditor template={editing} onSave={handleSave} onCancel={() => setEditing(null)} />;

    return (
        <div className="mac-page">
            <div className="mac-page-header">
                <h1 className="mac-page-title">Outreach Templates</h1>
                <div className="mac-gap-sm">
                    <button className="mac-btn mac-btn-ghost mac-btn-sm" onClick={handleAiGenerate} disabled={generating}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><path d="M12 2a5 5 0 0 1 5 5c0 1.5-.7 2.8-1.8 3.7L12 12l-3.2-1.3A5 5 0 0 1 12 2z"/><circle cx="12" cy="7" r="1"/><path d="M8 21l1-4m6 4l-1-4m-5 0h8"/></svg>
                        {generating ? 'Generating...' : 'AI Generate'}
                    </button>
                    <button className="mac-btn mac-btn-primary" onClick={() => setEditing({})}>+ New Template</button>
                </div>
            </div>

            <div className="mac-flex" style={{gap:8,marginBottom:16,flexWrap:'wrap'}}>
                <div className="mac-input-wrap" style={{flex:1,minWidth:160}}>
                    <input className="mac-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..." />
                </div>
                <div className="mac-chip-row">
                    {CATEGORIES.map(c => (
                        <button key={c} className={categoryFilter === c ? 'mac-btn mac-btn-primary mac-btn-xs' : 'mac-btn mac-btn-ghost mac-btn-xs'} onClick={() => setCategoryFilter(c)}>
                            {c}{c !== 'All' ? ` (${catCounts[c]||0})` : ` (${templates.length})`}
                        </button>
                    ))}
                </div>
            </div>

            {templates.length === 0 ? (
                <div className="mac-group"><div className="mac-empty"><div className="mac-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="32" height="32"><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9z"/></svg></div><div className="mac-empty-title">No templates yet</div><div className="mac-empty-desc">Create one manually or let AI generate one for you</div><button className="mac-btn mac-btn-primary mac-btn-sm" style={{marginTop:8}} onClick={() => setEditing({})}>+ Create Template</button></div></div>
            ) : filtered.length === 0 ? (
                <div className="mac-group"><div className="mac-empty"><div className="mac-empty-desc">No templates match your filter</div></div></div>
            ) : (
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {filtered.map((t, i) => {
                        const isExpanded = expandedId === t.id;
                        return (
                            <div key={t.id} className="mac-group" style={{marginBottom:0,animation:`fadeSlideUp 0.25s ease-out ${i*0.04}s both`}}>
                                <div className="mac-group-header" style={{paddingBottom:8}}>
                                    <div className="mac-flex" style={{gap:6,flex:1,minWidth:0}}>
                                        <span style={{fontWeight:500,fontSize:'0.85rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                                        {t.category && <span className="mac-tag" style={{fontSize:9}}>{t.category}</span>}
                                        {(t.useCount||0) > 0 && <span className="mac-text-muted" style={{fontSize:'0.65rem'}}>Used {t.useCount}x</span>}
                                    </div>
                                </div>
                                <div className="mac-group-body" style={{padding:'4px 16px 10px'}}>
                                    {t.subject && <div style={{fontSize:'0.72rem',color:'var(--text-secondary)',marginBottom:4}}><span className="mac-text-muted">Subject: </span>{t.subject}</div>}
                                    <div style={{fontSize:'0.75rem',color:'var(--text-secondary)',whiteSpace:'pre-wrap',lineHeight:1.6,display:'-webkit-box',WebkitLineClamp:isExpanded?undefined:2,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{t.body}</div>
                                    <div className="mac-gap-sm" style={{marginTop:8}}>
                                        <button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => handleCopyTemplate(t)}>Copy</button>
                                        <button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => handleCopyAsText(t)}>Copy Text</button>
                                        <button className="mac-btn mac-btn-primary mac-btn-xs" onClick={() => { setSending(t); setSendTo(''); setSenderName(''); setShowEmailConfig(!isEmailConfigured()); }}>Send</button>
                                        <button className="mac-btn-icon mac-btn-sm" onClick={() => setExpandedId(isExpanded ? null : t.id)} title={isExpanded ? 'Less' : 'More'}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><polyline points={isExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/></svg>
                                        </button>
                                        <button className="mac-btn-icon mac-btn-sm" onClick={() => setEditing(t)}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        <button className="mac-btn-icon mac-btn-sm" style={{color:'var(--danger)',marginLeft:'auto'}} onClick={() => { if (confirm('Delete "'+t.name+'"?')) { deleteTemplate(t.id); showToast('Template deleted'); } }}>
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {sending && (
                <div className="mac-modal-overlay" onClick={() => setSending(null)}>
                    <div className="mac-modal" onClick={e => e.stopPropagation()}>
                        {showEmailConfig ? (
                            <>
                                <div className="mac-flex-between" style={{marginBottom:14}}>
                                    <h3 style={{margin:0,fontSize:15,fontWeight:500}}>EmailJS Setup</h3>
                                    <button className="mac-btn-icon" onClick={() => setShowEmailConfig(false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                                </div>
                                <ol style={{margin:'0 0 14px 0',paddingLeft:20,fontSize:12,color:'var(--text-secondary)',lineHeight:1.8}}>
                                    <li>Go to <a href="https://emailjs.com" target="_blank" style={{color:'var(--accent)'}}>emailjs.com</a> and sign up (free)</li>
                                    <li>Connect an email service (Gmail, Outlook, or SMTP)</li>
                                    <li>Create an email template with variables: <code>{'{{to_email}}'}</code>, <code>{'{{subject}}'}</code>, <code>{'{{message}}'}</code>, <code>{'{{from_name}}'}</code></li>
                                    <li>Copy your Service ID, Template ID, and Public Key below</li>
                                </ol>
                                <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Service ID</div><input className="mac-input" value={ejConfig.serviceId} onChange={e => setEjConfig({...ejConfig,serviceId:e.target.value})} placeholder="service_xxxxxxx" /></div>
                                <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Template ID</div><input className="mac-input" value={ejConfig.templateId} onChange={e => setEjConfig({...ejConfig,templateId:e.target.value})} placeholder="template_xxxxxxx" /></div>
                                <div className="mac-input-wrap" style={{marginBottom:14}}><div className="mac-label">Public Key</div><input className="mac-input" value={ejConfig.publicKey} onChange={e => setEjConfig({...ejConfig,publicKey:e.target.value})} placeholder="user_xxxxxxx" /></div>
                                <button className="mac-btn mac-btn-primary" style={{width:'100%'}} onClick={() => { if (!ejConfig.serviceId || !ejConfig.templateId || !ejConfig.publicKey) { showToast('All three fields required'); return; } setEmailConfig(ejConfig); setShowEmailConfig(false); showToast('EmailJS configured'); }}>Save Config</button>
                            </>
                        ) : (
                            <>
                                <div className="mac-flex-between" style={{marginBottom:14}}>
                                    <h3 style={{margin:0,fontSize:15,fontWeight:500}}>Send: {sending.name}</h3>
                                    <button className="mac-btn-icon" onClick={() => setSending(null)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                                </div>
                                <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">To *</div><input className="mac-input" value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="prospect@company.com" /></div>
                                <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Sender Name</div><input className="mac-input" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Your Name" /></div>
                                <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Subject</div><div style={{padding:'7px 10px',background:'var(--bg-sunken)',borderRadius:7,fontSize:'0.82rem'}}>{sending.subject || '(no subject)'}</div></div>
                                <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Body</div><div style={{padding:'7px 10px',background:'var(--bg-sunken)',borderRadius:7,fontSize:'0.82rem',whiteSpace:'pre-wrap',lineHeight:1.6,maxHeight:200,overflow:'auto'}}>{sending.body}</div></div>
                                <div className="mac-gap" style={{marginTop:10}}>
                                    <button className="mac-btn mac-btn-primary" style={{flex:1}} onClick={handleSendEmail} disabled={sendingLoading}>{sendingLoading ? 'Sending...' : 'Send Email'}</button>
                                    {!isEmailConfigured() && <button className="mac-btn mac-btn-ghost" style={{fontSize:11}} onClick={() => setShowEmailConfig(true)}>Configure EmailJS</button>}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
