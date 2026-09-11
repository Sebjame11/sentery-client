import { useState, useMemo, useEffect } from 'react';
import useStore from '../store/useStore';
import { supabase } from '../lib/supabase';
import { formatMoney, daysInStage, esc, countryFlag, linkedinUrl } from '../utils/helpers';
import { STAGE_LABELS, PIPELINE_STAGES, WIN_REASONS, LOSS_REASONS, LIFECYCLE_LABELS, CONTACT_STATUS_LABELS } from '../utils/constants';
import { showToast } from '../components/Toast';
import { openModalFn } from '../components/Modal';
import TagManager from '../components/TagManager';
import AIButton, { AIResultModal } from '../components/AIButton';
import MeetingBriefModal from '../components/MeetingBriefModal';
import EnrichmentPanel from '../components/EnrichmentPanel';
import ContactEditModal from '../components/ContactEditModal';
import ComposeEmailModal from '../components/ComposeEmailModal';
import EmailDetailModal from '../components/EmailDetailModal';
import { generateEmail, generateFollowUp, generateMeetingBrief, assessDealRisk, generateWinLossSummary } from '../utils/ai';
import { sendEmail, isEmailConfigured, getEmailConfig, setEmailConfig } from '../utils/email';

export default function ProspectDetail({ prospectId, onBack }) {
    const { prospects, templates, updateProspect, addTouchpoint, deleteProspect } = useStore();
    const [activeTab, setActiveTab] = useState('overview');
    const [aiResult, setAiResult] = useState(null);
    const [aiTitle, setAiTitle] = useState('');
    const [sendDraft, setSendDraft] = useState(null);
    const [senderName, setSenderName] = useState('');
    const [sendingLoading, setSendingLoading] = useState(false);
    const [showEmailConfig, setShowEmailConfig] = useState(false);
    const [emailDetail, setEmailDetail] = useState(null);
    const [ejConfig, setEjConfig] = useState(getEmailConfig());
    const [meetingBrief, setMeetingBrief] = useState(null);
    const [showEdit, setShowEdit] = useState(false);
    const [showComposeEmail, setShowComposeEmail] = useState(false);
    const [meetings, setMeetings] = useState([]);
    const p = prospects.find(x => x.id === prospectId);

    useEffect(() => {
        if (!prospectId) return;
        supabase.from('meetings')
            .select('*')
            .eq('prospect_id', prospectId)
            .order('starts_at', { ascending: false })
            .then(({ data }) => setMeetings(data || []));
    }, [prospectId]);

    if (!p) return <div style={{textAlign:'center',padding:48,color:'var(--text-tertiary)'}}>Prospect not found</div>;

    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2);
    const stageIdx = PIPELINE_STAGES.indexOf(p.stage);
    const score = computeScore(p);

    const logTouchpoint = () => {
        openModalFn('Log Touchpoint: ' + p.name,
            '<div class="field"><label class="field-label">Channel</label><select class="field-input" id="tpChannel"><option>Email</option><option>LinkedIn</option><option>Call</option><option>SMS</option><option>Meeting</option></select></div>' +
            '<div class="field"><label class="field-label">Note</label><textarea class="field-input" id="tpNote" placeholder="What happened..."></textarea></div>' +
            '<div class="field"><label class="field-label">Outcome</label><select class="field-input" id="tpOutcome"><option value="pending">Pending</option><option value="replied">Replied</option><option value="meeting">Meeting Booked</option><option value="completed">Completed</option><option value="no-reply">No Reply</option></select></div>' +
            '<button class="btn-primary" style="width:100%;margin-top:8px" onclick="document.dispatchEvent(new CustomEvent(\'logTouchpoint\'))">Save Touchpoint</button>'
        );
        window._logTpProspectId = p.id;
    };

    const advanceStage = () => {
        const next = PIPELINE_STAGES[stageIdx + 1];
        if (!next || p.stage === 'won' || p.stage === 'lost') return;
        if (next === 'won' || next === 'lost') {
            openModalFn((next === 'won' ? 'Won' : 'Lost') + ': ' + p.name,
                '<div class="field"><label class="field-label">' + (next === 'won' ? 'Why We Won' : 'Why We Lost') + '</label><select class="field-input" id="outcomeReason"><option value="">Select reason...</option>' +
                (next === 'won' ? WIN_REASONS : LOSS_REASONS).map(r => '<option>' + r + '</option>').join('') +
                '</select></div>' +
                '<div class="field"><label class="field-label">Notes</label><textarea class="field-input" id="outcomeNotes" placeholder="Details..."></textarea></div>' +
                '<button class="btn-primary" style="width:100%;margin-top:8px" onclick="document.dispatchEvent(new CustomEvent(\'confirmOutcome\',{detail:{id:' + p.id + ',stage:\'' + next + '\'}}))">Confirm</button>'
            );
            return;
        }
        updateProspect(p.id, { stage: next, stageEnteredAt: new Date().toISOString().slice(0,10) });
        showToast(p.name + ' moved to ' + STAGE_LABELS[next]);
    };

    const deleteP = () => {
        if (!confirm('Delete ' + p.name + '?')) return;
        deleteProspect(p.id);
        onBack();
        showToast(p.name + ' deleted');
    };

    const stageColors = {
        lead: 'var(--text-tertiary)', contacted: 'var(--accent)', engaged: 'var(--accent)',
        meeting: 'var(--warning)', proposal: 'var(--warning)', negotiation: 'var(--success)',
        won: 'var(--success)', lost: 'var(--danger)'
    };

    const allActivity = [];
    p.touchpoints.forEach(t => allActivity.push({ type: 'touchpoint', date: t.date, data: t }));
    meetings.forEach(m => allActivity.push({
        type: 'meeting', date: m.starts_at.slice(0, 10),
        data: { channel: 'Calendar', note: `Meeting booked at ${new Date(m.starts_at).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}`, outcome: m.status === 'cancelled' ? 'cancelled' : 'meeting', cancelled: m.status === 'cancelled' },
    }));
    allActivity.sort((a, b) => b.date.localeCompare(a.date));

    return (
        <>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
                <button className="btn-secondary" onClick={onBack} style={{padding:'6px 12px',fontSize:'0.78rem'}}>&larr; Back</button>
                <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <div style={{width:40,height:40,borderRadius:'50%',background:'var(--accent-tint)',color:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:'0.85rem'}}>{initials}</div>
                        <div>
                            <div style={{fontSize:'1rem',fontWeight:600}}>{p.name}</div>
                            <div style={{fontSize:'0.78rem',color:'var(--text-tertiary)'}}>{p.title}{p.title && p.company ? ' at ' : ''}{p.company}</div>
                        </div>
                    </div>
                </div>
                <div style={{display:'flex',gap:6}}>
                    <button className="btn-secondary" onClick={() => setShowEdit(true)} style={{padding:'6px 12px',fontSize:'0.78rem'}}>Edit</button>
                    {p.email && <button className="btn-secondary" onClick={() => setShowComposeEmail(true)} style={{padding:'6px 12px',fontSize:'0.78rem',display:'flex',alignItems:'center',gap:4}}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        Send Email
                    </button>}
                    {p.stage !== 'won' && p.stage !== 'lost' && <button className="btn-primary" onClick={advanceStage}>Advance</button>}
                    <button className="btn-secondary" onClick={logTouchpoint}>+ Touch</button>
                    <AIButton
                        label="AI"
                        size="small"
                        prospect={p}
                        onResult={(r, opt) => {
                            if (opt === 'Meeting Prep Brief') { setMeetingBrief(r); }
                            else { setAiResult(r); setAiTitle('AI Generated Content'); }
                        }}
                        options={[
                            { label: 'Write Outreach Email', fn: (p) => generateEmail(p, 'outreach') },
                            { label: 'Write Follow-Up', fn: (p) => generateFollowUp(p, p.touchpoints?.[p.touchpoints.length - 1]) },
                            { label: 'Meeting Prep Brief', fn: (p) => generateMeetingBrief(p) },
                            { label: 'Assess Deal Risk', fn: (p) => assessDealRisk(p) },
                            { label: 'Win/Loss Summary', fn: (p) => generateWinLossSummary(p) },
                        ]}
                    />
                    <button className="btn-xs" style={{color:'var(--danger)'}} onClick={deleteP}>Delete</button>
                </div>
            </div>

            <div style={{display:'flex',gap:8,marginBottom:16}}>
                {['overview', 'timeline', 'touchpoints', 'templates', 'enrichment'].map(tab => (
                    <button key={tab} className={'btn-xs' + (activeTab === tab ? ' btn-xs-accent' : '')} onClick={() => setActiveTab(tab)} style={{textTransform:'capitalize'}}>{tab}</button>
                ))}
            </div>

            {activeTab === 'overview' && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
                        <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Details</div>
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Email</div><div style={{fontSize:'0.85rem'}}>{p.email || '-'}</div></div>
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Phone</div><div style={{fontSize:'0.85rem'}}>{p.phone || '-'}</div></div>
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>LinkedIn</div>{p.linkedin ? <a href={linkedinUrl(p.linkedin)} target="_blank" rel="noopener noreferrer" style={{fontSize:'0.85rem',color:'var(--accent)',textDecoration:'none'}}>{p.linkedin}</a> : <div style={{fontSize:'0.85rem'}}>-</div>}</div>
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Tier</div><span className={'tag tag-' + p.tier}>{p.tier}</span></div>
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Stage</div><span className="tag" style={{color:stageColors[p.stage]}}>{STAGE_LABELS[p.stage]}</span></div>
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Lifecycle</div><span className="tag" style={{color:'var(--accent)'}}>{LIFECYCLE_LABELS[p.lifecycleStage || p.lifecycle_stage || 'lead']}</span></div>
                            {(p.contactStatus || p.status) && <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Status</div><span className="tag" style={{color:'var(--warning)'}}>{CONTACT_STATUS_LABELS[p.contactStatus || p.status] || '-'}</span></div>}
                            {(p.leadSource || p.lead_source) && <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Lead Source</div><span className="tag" style={{color:'var(--accent)'}}>{p.leadSource || p.lead_source}</span></div>}
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Days in Stage</div><div style={{fontSize:'0.85rem'}}>{daysInStage(p)} days</div></div>
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Countries</div><div style={{fontSize:'0.85rem'}}>{(p.countries?.length ? p.countries : (p.country ? [p.country] : [])).map(c => countryFlag(c) ? <span key={c} className={countryFlag(c)} style={{marginRight:4,fontSize:14,verticalAlign:-1}} title={c}></span> : null)}{(p.countries?.length ? p.countries.join(', ') : p.country || '-')}</div></div>
                            <EditableDealValue prospectId={p.id} value={p.dealValue || 0} />
                            <div><div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Score</div><div style={{fontSize:'0.85rem',fontWeight:600,color:score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)'}}>{score}/100</div></div>
                        </div>
                    </div>
                    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
                        <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Tags</div>
                        <TagManager prospectId={p.id} />
                    </div>
                    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
                        <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Notes</div>
                        <div style={{fontSize:'0.85rem',whiteSpace:'pre-wrap',lineHeight:1.7,color:p.notes ? 'var(--text-primary)' : 'var(--text-tertiary)'}}>
                            {p.angle && <div style={{marginBottom:8}}><span style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Angle: </span>{p.angle}</div>}
                            {p.notes || 'No notes yet'}
                        </div>
                    </div>
                    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16,gridColumn:'1/-1'}}>
                        <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Pipeline Progress</div>
                        <div style={{display:'flex',gap:2,alignItems:'center'}}>
                            {PIPELINE_STAGES.map((s, i) => (
                                <div key={s} style={{flex:1,height:8,borderRadius:4,background:i <= stageIdx ? stageColors[s] : 'var(--bg-sunken)',transition:'background 300ms'}} title={STAGE_LABELS[s]}></div>
                            ))}
                        </div>
                        <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
                            <span style={{fontSize:'0.65rem',color:'var(--text-tertiary)'}}>Lead</span>
                            <span style={{fontSize:'0.65rem',color:'var(--text-tertiary)'}}>Won</span>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'timeline' && (
                <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
                    <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Activity Timeline</div>
                    {allActivity.length === 0 ? (
                        <div style={{textAlign:'center',padding:32,color:'var(--text-tertiary)',fontSize:'0.85rem'}}>No activity yet. Log a touchpoint to start tracking.</div>
                    ) : (
                        <div style={{position:'relative',paddingLeft:20}}>
                            <div style={{position:'absolute',left:6,top:4,bottom:4,width:2,background:'var(--border)'}}></div>
                            {allActivity.map((a, i) => (
                                <div key={i} style={{position:'relative',marginBottom:16,paddingLeft:16}}>
                                    <div style={{position:'absolute',left:-17,top:6,width:10,height:10,borderRadius:'50%',background:a.data.outcome === 'replied' ? 'var(--success)' : a.data.outcome === 'meeting' ? 'var(--warning)' : a.data.cancelled ? 'var(--danger)' : 'var(--accent)',border:'2px solid var(--bg-surface)'}}></div>
                                    <div style={{fontSize:'0.78rem',fontWeight:500}}>{a.data.channel}</div>
                                    <div style={{fontSize:'0.82rem',color:'var(--text-secondary)',marginTop:2}}>{a.data.note}</div>
                                    <div style={{fontSize:'0.7rem',color:'var(--text-tertiary)',marginTop:2}}>{a.date} &middot; {a.data.cancelled ? 'cancelled' : a.data.outcome}</div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'touchpoints' && (
                <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                        <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Touchpoints ({p.touchpoints.length})</div>
                        <button className="btn-xs btn-xs-accent" onClick={logTouchpoint}>+ Add Touchpoint</button>
                    </div>
                    {p.touchpoints.length === 0 ? (
                        <div style={{textAlign:'center',padding:32,color:'var(--text-tertiary)',fontSize:'0.85rem'}}>No touchpoints recorded</div>
                    ) : (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                            {[...p.touchpoints].reverse().map((t, i) => (
                                <div key={i} onClick={t.email_message_id ? () => setEmailDetail(t.email_message_id) : undefined} style={{display:'flex',gap:10,alignItems:'flex-start',padding:'10px 12px',background:'var(--bg-sunken)',borderRadius:8,cursor:t.email_message_id ? 'pointer' : 'default'}}>
                                    <span className={'tag tag-' + (t.outcome === 'replied' ? 'warm' : t.outcome === 'meeting' ? 'hot' : 'cold')} style={{fontSize:'0.68rem',flexShrink:0}}>{t.outcome}</span>
                                    <div style={{flex:1,minWidth:0}}>
                                        <div style={{fontSize:'0.82rem'}}>{t.note}</div>
                                        <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)'}}>{t.date} &middot; {t.channel}{t.email_message_id ? ' · click to view email' : ''}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'templates' && (
                <div className="dash-card" style={{padding:16}}>
                    <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Email Templates</div>
                    {templates.length === 0 ? (
                        <div style={{textAlign:'center',padding:24,color:'var(--text-tertiary)',fontSize:13}}>No templates yet. Create one in Outreach first.</div>
                    ) : (
                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                            {templates.map(t => {
                                const vars = { first_name: p.name?.split(' ')[0] || '', company: p.company || '', pain_point: p.angle || 'improving efficiency', sender_name: 'You', industry: p.industry || '', city: '' };
                                const fill = (text) => (text || '').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] || `[${k}]`);
                                const filledSubject = fill(t.subject);
                                const filledBody = fill(t.body);
                                return (
                                    <div key={t.id} style={{background:'var(--bg-sunken)',borderRadius:8,padding:12}}>
                                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                                            <span style={{fontWeight:500,fontSize:13}}>{t.name}</span>
                                            <span style={{fontSize:10,color:'var(--text-tertiary)'}}>{t.category || 'General'}</span>
                                        </div>
                                        {filledSubject && <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:4}}>Subject: {filledSubject}</div>}
                                        <div style={{fontSize:12,whiteSpace:'pre-wrap',lineHeight:1.6,maxHeight:80,overflow:'hidden',color:'var(--text-secondary)',marginBottom:8}}>{filledBody}</div>
                                        <div style={{display:'flex',gap:4}}>
                                            <button className="btn-xs" onClick={() => {
                                                const full = `Subject: ${filledSubject}\n\n${filledBody}`;
                                                navigator.clipboard.writeText(full);
                                                showToast('Copied with prospect data');
                                            }}>Copy</button>
                                            <button className="btn-xs" onClick={() => {
                                                addTouchpoint(p.id, { channel: 'Email', note: `Using template: ${t.name}\n\n${filledBody}`, outcome: 'pending' });
                                                showToast('Logged as touchpoint');
                                            }}>Log Touchpoint</button>
                                            <button className="btn-xs" onClick={() => {
                                                addTouchpoint(p.id, { channel: 'Email', note: `Using template: ${t.name}\n\n${filledBody}`, outcome: 'completed' });
                                                showToast('Logged as completed');
                                            }}>Log Completed</button>
                                            <button className="btn-xs btn-xs-accent" onClick={() => { setSendDraft({ name: t.name, subject: filledSubject, body: filledBody }); setShowEmailConfig(!isEmailConfigured()); }}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="10" height="10" style={{marginRight:2}}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                                                Send
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'enrichment' && (
                <EnrichmentPanel
                    type="person"
                    data={p}
                    onEnrich={(data) => {
                        updateProspect(p.id, data);
                        showToast('Prospect data updated from Apollo');
                    }}
                />
            )}

            <AIResultModal
                title={aiTitle}
                content={aiResult}
                onClose={() => setAiResult(null)}
                onUse={aiResult ? (content) => {
                    addTouchpoint(p.id, { channel: 'AI', note: content, outcome: 'completed', date: new Date().toISOString().slice(0,10) });
                    showToast('Added as touchpoint');
                } : undefined}
            />
            <MeetingBriefModal content={meetingBrief} onClose={() => setMeetingBrief(null)} />
            {showEdit && <ContactEditModal prospect={p} onClose={() => setShowEdit(false)} />}
            {showComposeEmail && <ComposeEmailModal contact={p} onClose={() => setShowComposeEmail(false)} />}
            {emailDetail && <EmailDetailModal messageId={emailDetail} onClose={() => setEmailDetail(null)} />}

            {sendDraft && (
                <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',backdropFilter:'blur(4px)',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}} onClick={() => setSendDraft(null)}>
                    <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:520,width:'90%',maxHeight:'90vh',overflow:'auto'}} onClick={e => e.stopPropagation()}>
                        {showEmailConfig ? (
                            <>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                                    <h3 style={{margin:0,fontSize:15}}>EmailJS Setup</h3>
                                    <button className="btn-icon-sm" onClick={() => setShowEmailConfig(false)}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                </div>
                                <ol style={{margin:'0 0 16px 0',paddingLeft:20,fontSize:12,color:'var(--text-secondary)',lineHeight:1.8}}>
                                    <li>Go to <a href="https://emailjs.com" target="_blank" style={{color:'var(--accent)'}}>emailjs.com</a> and sign up (free)</li>
                                    <li>Connect an email service (Gmail, Outlook, or SMTP)</li>
                                    <li>Create an email template with variables: <code>{'{{to_email}}'}</code>, <code>{'{{subject}}'}</code>, <code>{'{{message}}'}</code>, <code>{'{{from_name}}'}</code></li>
                                    <li>Copy your Service ID, Template ID, and Public Key below</li>
                                </ol>
                                <div className="field">
                                    <label className="field-label">Service ID</label>
                                    <input className="field-input" value={ejConfig.serviceId} onChange={e => setEjConfig({...ejConfig, serviceId: e.target.value})} placeholder="service_xxxxxxx" />
                                </div>
                                <div className="field">
                                    <label className="field-label">Template ID</label>
                                    <input className="field-input" value={ejConfig.templateId} onChange={e => setEjConfig({...ejConfig, templateId: e.target.value})} placeholder="template_xxxxxxx" />
                                </div>
                                <div className="field">
                                    <label className="field-label">Public Key</label>
                                    <input className="field-input" value={ejConfig.publicKey} onChange={e => setEjConfig({...ejConfig, publicKey: e.target.value})} placeholder="user_xxxxxxx" />
                                </div>
                                <button className="btn-primary" style={{width:'100%'}} onClick={() => {
                                    if (!ejConfig.serviceId || !ejConfig.templateId || !ejConfig.publicKey) { showToast('All three fields required'); return; }
                                    setEmailConfig(ejConfig);
                                    setShowEmailConfig(false);
                                    showToast('EmailJS configured');
                                }}>Save Config</button>
                            </>
                        ) : (
                            <>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                                    <h3 style={{margin:0,fontSize:15}}>Send: {sendDraft.name}</h3>
                                    <button className="btn-icon-sm" onClick={() => setSendDraft(null)}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                    </button>
                                </div>

                                <div className="field">
                                    <label className="field-label">To *</label>
                                    <input className="field-input" value={sendDraft.to || p.email || ''} onChange={e => setSendDraft({ ...sendDraft, to: e.target.value })} placeholder="prospect@company.com" />
                                </div>

                                <div className="field">
                                    <label className="field-label">Sender Name</label>
                                    <input className="field-input" value={senderName} onChange={e => setSenderName(e.target.value)} placeholder="Your Name (appears in recipient's inbox)" />
                                </div>

                                <div className="field">
                                    <label className="field-label">Subject</label>
                                    <div style={{padding:'8px 10px',background:'var(--bg-sunken)',borderRadius:8,fontSize:13}}>{sendDraft.subject || '(no subject)'}</div>
                                </div>

                                <div className="field">
                                    <label className="field-label">Body</label>
                                    <div style={{padding:'8px 10px',background:'var(--bg-sunken)',borderRadius:8,fontSize:13,whiteSpace:'pre-wrap',lineHeight:1.6,maxHeight:200,overflow:'auto'}}>{sendDraft.body}</div>
                                </div>

                                <div style={{display:'flex',flexDirection:'column',gap:6,marginTop:8}}>
                                    <button className="btn-primary" style={{width:'100%'}} onClick={async () => {
                                        if (!sendDraft.to?.trim()) { showToast('Recipient email required'); return; }
                                        if (!isEmailConfigured()) { setShowEmailConfig(true); return; }
                                        setSendingLoading(true);
                                        try {
                                            await sendEmail({ to: sendDraft.to.trim(), subject: sendDraft.subject || '', message: sendDraft.body, from_name: senderName.trim() || undefined });
                                            addTouchpoint(p.id, { channel: 'Email', note: `Sent template: ${sendDraft.name}\n\n${sendDraft.body}`, outcome: 'completed' });
                                            showToast('Email sent to ' + sendDraft.to.trim());
                                            setSendDraft(null);
                                            setSenderName('');
                                        } catch (err) {
                                            showToast('Send failed: ' + err.message);
                                        } finally {
                                            setSendingLoading(false);
                                        }
                                    }} disabled={sendingLoading}>
                                        {sendingLoading ? 'Sending...' : 'Send Email'}
                                    </button>
                                    {!isEmailConfigured() && (
                                        <button className="btn-secondary" style={{width:'100%',fontSize:11}} onClick={() => setShowEmailConfig(true)}>
                                            Configure EmailJS
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}

function computeScore(p) {
    let s = 0;
    if (p.dealValue >= 100000) s += 25;
    else if (p.dealValue >= 50000) s += 20;
    else if (p.dealValue >= 10000) s += 15;
    else if (p.dealValue > 0) s += 10;
    const stageScores = { lead: 5, contacted: 10, engaged: 20, meeting: 30, proposal: 40, negotiation: 45, won: 50, lost: 0 };
    s += stageScores[p.stage] || 0;
    const tpCount = p.touchpoints.length;
    if (tpCount >= 5) s += 15;
    else if (tpCount >= 3) s += 10;
    else if (tpCount >= 1) s += 5;
    const replied = p.touchpoints.filter(t => t.outcome === 'replied' || t.outcome === 'meeting').length;
    if (replied >= 3) s += 10;
    else if (replied >= 1) s += 5;
    if (p.tier === 'hot') s += 5;
    else if (p.tier === 'warm') s += 3;
    return Math.min(100, s);
}

function EditableDealValue({ prospectId, value }) {
    const [editing, setEditing] = useState(false);
    const [inputVal, setInputVal] = useState(String(value));
    const updateProspect = useStore(s => s.updateProspect);

    const save = () => {
        const num = Number(inputVal);
        if (isNaN(num) || num < 0) { showToast('Enter a valid number'); return; }
        updateProspect(prospectId, { dealValue: num });
        setEditing(false);
        showToast('Deal value updated');
    };

    if (editing) {
        return (
            <div>
                <div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Deal Value</div>
                <div style={{display:'flex',gap:4,alignItems:'center',marginTop:2}}>
                    <span style={{fontSize:'0.75rem',color:'var(--text-tertiary)'}}>$</span>
                    <input type="number" min="0" value={inputVal}
                        onChange={e => setInputVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setInputVal(String(value)); } }}
                        style={{
                            width:90,padding:'3px 6px',fontSize:'0.85rem',fontWeight:500,
                            background:'var(--bg-surface)',color:'var(--accent)',
                            border:'1.5px solid var(--accent)',borderRadius:6,
                            outline:'none',
                        }}
                        autoFocus
                    />
                    <button className="btn-xs" style={{fontSize:10,padding:'2px 6px'}} onClick={save}>Save</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{cursor:'pointer'}} onClick={() => { setInputVal(String(value)); setEditing(true); }}>
            <div style={{fontSize:'0.7rem',color:'var(--text-tertiary)'}}>Deal Value</div>
            <div style={{fontSize:'0.85rem',color:'var(--accent)',fontWeight:500,display:'flex',alignItems:'center',gap:4}}>
                {formatMoney(value)}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="10" height="10" style={{opacity:0.3}}><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
            </div>
        </div>
    );
}
