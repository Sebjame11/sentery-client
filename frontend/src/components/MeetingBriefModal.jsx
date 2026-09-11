import { useState } from 'react';
import { showToast } from './Toast';

const RISK_COLORS = { Low: 'var(--color-success)', Medium: 'var(--accent)', High: 'var(--color-warning)', Critical: 'var(--color-error)' };
const SEVERITY_COLORS = { Low: 'var(--text-muted)', Medium: 'var(--accent)', High: 'var(--color-warning)', Critical: 'var(--color-error)' };

function Badge({ text, color }) {
    return <span style={{fontSize:10,padding:'2px 8px',borderRadius:4,background:color||'var(--bg-surface-alt)',color:'#fff',fontWeight:600}}>{text}</span>;
}

function Section({ title, children }) {
    return (
        <div style={{marginBottom:16}}>
            <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8,borderBottom:'1px solid var(--border)',paddingBottom:4}}>{title}</div>
            {children}
        </div>
    );
}

function Field({ label, value, bold }) {
    if (value === null || value === undefined || value === '') return null;
    return <div style={{marginBottom:4}}><span style={{fontSize:11,color:'var(--text-muted)'}}>{label}: </span><span style={{fontSize:13,fontWeight:bold?600:400}}>{String(value)}</span></div>;
}

function ItemList({ items, renderItem }) {
    if (!items || !items.length) return <div style={{fontSize:12,color:'var(--text-muted)',fontStyle:'italic'}}>None identified</div>;
    return <div style={{display:'flex',flexDirection:'column',gap:6}}>{items.map((item, i) => <div key={i}>{renderItem(item, i)}</div>)}</div>;
}

export default function MeetingBriefModal({ content, onClose }) {
    const [parsed, setParsed] = useState(() => {
        if (!content) return null;
        try {
            let clean = content.trim();
            // Strip markdown code fences
            clean = clean.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
            // Find first { and last }
            const firstBrace = clean.indexOf('{');
            const lastBrace = clean.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace > firstBrace) {
                clean = clean.substring(firstBrace, lastBrace + 1);
            }
            // Remove trailing commas before } or ]
            clean = clean.replace(/,\s*([}\]])/g, '$1');
            // Remove single-line comments
            clean = clean.replace(/\/\/.*$/gm, '');
            return JSON.parse(clean);
        } catch {
            return null;
        }
    });
    const [showRaw, setShowRaw] = useState(false);

    if (!content) return null;

    if (!parsed) {
        return (
            <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}}>
                <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:600,width:'90%',maxHeight:'80vh',overflow:'auto'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                        <h3 style={{margin:0,fontSize:16}}>AI Meeting Brief</h3>
                        <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>
                    <div style={{fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap'}}>{content}</div>
                    <div style={{marginTop:16,display:'flex',gap:8}}>
                        <button className="btn-primary" onClick={() => { navigator.clipboard.writeText(content); showToast('Copied'); }}>Copy</button>
                        <button className="btn-secondary" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        );
    }

    const s = parsed.summary || {};
    const m = parsed.meeting || {};
    const r = parsed.risk_assessment || {};
    const ps = parsed.positive_signals || [];
    const co = parsed.conversation_objectives || [];
    const dq = parsed.discovery_questions || {};
    const ra = parsed.recommended_actions || [];
    const ns = parsed.next_steps || [];
    const sc = parsed.success_criteria || [];
    const prob = parsed.probability || {};
    const tp = parsed.talking_points || [];
    const oe = parsed.objections_to_expect || [];
    const ci = parsed.competitive_insight || {};
    const cc = parsed.company_context || {};

    return (
        <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}}>
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:720,width:'95%',maxHeight:'85vh',overflow:'auto'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                    <div>
                        <h3 style={{margin:0,fontSize:18}}>{s.headline || 'Meeting Prep Brief'}</h3>
                        <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>{m.contact_name} {m.title ? `- ${m.title}` : ''} at {m.company || 'N/A'}</div>
                    </div>
                    <div style={{display:'flex',gap:6}}>
                        <button className="btn-secondary" style={{fontSize:10}} onClick={() => setShowRaw(!showRaw)}>{showRaw ? 'Formatted' : 'Raw JSON'}</button>
                        <button className="btn-primary" style={{fontSize:10}} onClick={() => { navigator.clipboard.writeText(JSON.stringify(parsed, null, 2)); showToast('Copied JSON'); }}>Copy</button>
                        <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                    </div>
                </div>

                {showRaw ? (
                    <pre style={{background:'var(--bg-surface-alt)',border:'1px solid var(--border)',borderRadius:8,padding:12,fontSize:11,lineHeight:1.5,whiteSpace:'pre-wrap',fontFamily:'var(--font-mono)',margin:0}}>{JSON.stringify(parsed, null, 2)}</pre>
                ) : (
                    <>
                        <Section title="Summary">
                            <div style={{background:'var(--bg-surface-alt)',borderRadius:8,padding:12}}>
                                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                                    <Field label="Overview" value={s.overview} />
                                    <Badge text={s.confidence || 'N/A'} color={s.confidence === 'High' ? 'var(--color-success)' : s.confidence === 'Medium' ? 'var(--accent)' : 'var(--text-muted)'} />
                                </div>
                                <Field label="Meeting Goal" value={s.meeting_goal} bold />
                            </div>
                        </Section>

                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                            <Section title="Meeting Details">
                                <Field label="Company" value={m.company} bold />
                                <Field label="Contact" value={m.contact_name} />
                                <Field label="Title" value={m.title} />
                                <Field label="Type" value={m.meeting_type} />
                                <Field label="Deal Stage" value={m.deal_stage} />
                                <Field label="Value" value={m.opportunity_value} />
                                <Field label="Tier" value={m.account_tier} />
                            </Section>
                            <Section title="Risk Assessment">
                                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                                    <Badge text={r.overall_risk || 'N/A'} color={RISK_COLORS[r.overall_risk]} />
                                    {r.risk_score > 0 && <span style={{fontSize:12,fontWeight:600}}>{r.risk_score}/10</span>}
                                </div>
                                <Field label="Reasoning" value={r.reasoning} />
                                {r.top_risks?.length > 0 && (
                                    <div style={{marginTop:8}}>
                                        {r.top_risks.map((risk, i) => (
                                            <div key={i} style={{padding:'6px 0',borderTop:i>0?'1px solid var(--border)':'none'}}>
                                                <div style={{display:'flex',alignItems:'center',gap:6}}>
                                                    <Badge text={risk.severity} color={SEVERITY_COLORS[risk.severity]} />
                                                    <span style={{fontSize:12,fontWeight:600}}>{risk.title}</span>
                                                </div>
                                                <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{risk.description}</div>
                                                {risk.business_impact && <div style={{fontSize:11,color:'var(--color-warning)',marginTop:2}}>Impact: {risk.business_impact}</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </Section>
                        </div>

                        <Section title="Positive Signals">
                            <ItemList items={ps} renderItem={(item, i) => (
                                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'4px 0'}}>
                                    <span style={{color:'var(--color-success)',fontSize:14,marginTop:1}}>&#10003;</span>
                                    <div>
                                        <span style={{fontSize:13,fontWeight:600}}>{item.title}</span>
                                        <Badge text={item.importance} color={item.importance === 'High' ? 'var(--color-success)' : 'var(--text-muted)'} />
                                        <div style={{fontSize:12,color:'var(--text-secondary)'}}>{item.description}</div>
                                    </div>
                                </div>
                            )} />
                        </Section>

                        <Section title="Conversation Objectives">
                            <ItemList items={co} renderItem={(item, i) => (
                                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'4px 0'}}>
                                    <span style={{width:20,height:20,borderRadius:'50%',background:'var(--accent)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:600,flexShrink:0}}>{item.priority}</span>
                                    <div>
                                        <span style={{fontSize:13,fontWeight:600}}>{item.objective}</span>
                                        <div style={{fontSize:12,color:'var(--text-secondary)'}}>{item.reason}</div>
                                    </div>
                                </div>
                            )} />
                        </Section>

                        <Section title="Discovery Questions">
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                                {Object.entries(dq).filter(([,q]) => q.length > 0).map(([cat, questions]) => (
                                    <div key={cat}>
                                        <div style={{fontSize:11,fontWeight:600,color:'var(--accent)',textTransform:'capitalize',marginBottom:4}}>{cat.replace('_',' ')}</div>
                                        {questions.map((q, i) => <div key={i} style={{fontSize:12,padding:'2px 0',color:'var(--text-secondary)'}}>- {q}</div>)}
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <Section title="Recommended Actions">
                            <ItemList items={ra} renderItem={(item, i) => (
                                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'6px 0',borderTop:i>0?'1px solid var(--border)':'none'}}>
                                    <Badge text={item.priority} color={item.priority === 'High' ? 'var(--color-error)' : item.priority === 'Medium' ? 'var(--accent)' : 'var(--text-muted)'} />
                                    <div style={{flex:1}}>
                                        <div style={{fontSize:13,fontWeight:600}}>{item.action}</div>
                                        {item.owner && <div style={{fontSize:11,color:'var(--text-muted)'}}>Owner: {item.owner}</div>}
                                        {item.expected_outcome && <div style={{fontSize:11,color:'var(--text-secondary)'}}>Expected: {item.expected_outcome}</div>}
                                    </div>
                                </div>
                            )} />
                        </Section>

                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
                            <Section title="Next Steps">
                                <ItemList items={ns} renderItem={(item, i) => <div key={i} style={{fontSize:13,padding:'2px 0'}}>{i+1}. {item}</div>} />
                            </Section>
                            <Section title="Success Criteria">
                                <ItemList items={sc} renderItem={(item, i) => <div key={i} style={{fontSize:13,padding:'2px 0'}}>&#10003; {item}</div>} />
                            </Section>
                        </div>

                        <Section title="Talking Points">
                            <ItemList items={tp} renderItem={(item, i) => <div key={i} style={{fontSize:13,padding:'2px 0'}}>- {item}</div>} />
                        </Section>

                        <Section title="Objections to Expect">
                            <ItemList items={oe} renderItem={(item, i) => (
                                <div key={i} style={{padding:'8px 0',borderTop:i>0?'1px solid var(--border)':'none'}}>
                                    <div style={{fontSize:13,fontWeight:600,color:'var(--color-warning)'}}>"{item.objection}"</div>
                                    <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:4,fontStyle:'italic'}}>Response: {item.recommended_response}</div>
                                </div>
                            )} />
                        </Section>

                        {ci.competitors?.length > 0 && (
                            <Section title="Competitive Insight">
                                <div style={{marginBottom:4}}><span style={{fontSize:11,color:'var(--text-muted)'}}>Competitors: </span>{ci.competitors.join(', ')}</div>
                                {ci.risk && <Field label="Risk" value={ci.risk} />}
                                {ci.recommendation && <Field label="Recommendation" value={ci.recommendation} bold />}
                            </Section>
                        )}

                        {cc.industry && (
                            <Section title="Company Context">
                                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                                    <div>
                                        <Field label="Industry" value={cc.industry} />
                                        <Field label="Size" value={cc.size} />
                                        {cc.technology_stack?.length > 0 && <div style={{marginTop:4}}><span style={{fontSize:11,color:'var(--text-muted)'}}>Tech Stack: </span><span style={{fontSize:12}}>{cc.technology_stack.join(', ')}</span></div>}
                                    </div>
                                    <div>
                                        {cc.known_challenges?.length > 0 && <div><span style={{fontSize:11,color:'var(--text-muted)'}}>Challenges:</span>{cc.known_challenges.map((c,i) => <div key={i} style={{fontSize:12}}>- {c}</div>)}</div>}
                                        {cc.business_priorities?.length > 0 && <div style={{marginTop:4}}><span style={{fontSize:11,color:'var(--text-muted)'}}>Priorities:</span>{cc.business_priorities.map((p,i) => <div key={i} style={{fontSize:12}}>- {p}</div>)}</div>}
                                    </div>
                                </div>
                            </Section>
                        )}

                        {prob.close_probability > 0 && (
                            <Section title="Close Probability">
                                <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
                                    <div style={{fontSize:28,fontWeight:700,color:prob.close_probability >= 60 ? 'var(--color-success)' : prob.close_probability >= 30 ? 'var(--accent)' : 'var(--color-error)'}}>{prob.close_probability}%</div>
                                    <div>
                                        <Badge text={prob.confidence || 'N/A'} color={prob.confidence === 'High' ? 'var(--color-success)' : 'var(--accent)'} />
                                        <div style={{fontSize:12,color:'var(--text-secondary)',marginTop:2}}>{prob.reasoning}</div>
                                    </div>
                                </div>
                                {prob.key_factor_to_improve && <div style={{fontSize:12,color:'var(--accent)'}}>Key factor: {prob.key_factor_to_improve}</div>}
                            </Section>
                        )}
                    </>
                )}

                {!showRaw && (
                    <div style={{marginTop:16,paddingTop:12,borderTop:'1px solid var(--border)',display:'flex',justifyContent:'flex-end',gap:8}}>
                        <button className="btn-secondary" onClick={onClose}>Close</button>
                    </div>
                )}
            </div>
        </div>
    );
}
