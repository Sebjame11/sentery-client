import { useState } from 'react';
import { esc } from '../utils/helpers';
import { showToast } from '../components/Toast';
import { generateObjectionResponse, enrichProspect } from '../utils/ai';

const PLAYBOOKS = [
    { id:'cold-outreach', name:'Cold Outreach', scenarios:[
        { name:'First Touch Email', script:`Hi {{first_name}},\n\nI came across {{company}} and was impressed by what you're building in the {{industry}} space.\n\nI work with companies like yours to solve [specific problem]. We've helped similar companies achieve [specific result] within [timeframe].\n\nWould you be open to a quick 15-minute chat to see if this could be relevant for {{company}}?\n\nBest,\n{{sender_name}}` },
        { name:'LinkedIn Connection Request', script:`Hi {{first_name}} — I noticed we're both in the {{industry}} space. I'd love to connect and share insights on [topic]. No pitch, just genuine networking.` },
        { name:'Follow-Up After No Reply', script:`Hi {{first_name}},\n\nJust bumping this up in case it got buried. I know things get busy.\n\nQuick question: is [problem] a priority for {{company}} right now? If not, no worries at all.\n\n— {{sender_name}}` },
    ]},
    { id:'discovery', name:'Discovery Calls', scenarios:[
        { name:'Opening Questions', script:`1. What's the biggest challenge you're facing with [area] right now?\n2. How are you currently handling [problem]?\n3. What would an ideal solution look like for you?\n4. Who else is involved in this decision?\n5. What's your timeline for implementing a solution?` },
        { name:'Budget Qualification', script:`1. Have you allocated budget for this initiative?\n2. What's the range you're working with?\n3. How do you typically evaluate ROI on purchases like this?\n4. Are there other priorities competing for the same budget?` },
        { name:'Pain Amplification', script:`1. How long has this been a problem?\n2. What happens if you don't solve it in the next 6 months?\n3. How does this impact your team's productivity?\n4. What's the cost of doing nothing?` },
    ]},
    { id:'objection-handling', name:'Objection Handling', scenarios:[
        { name:'Too Expensive', script:`I understand budget is a concern. Let me ask — compared to the cost of [problem], how does our pricing look?\n\nMany of our clients found that the ROI paid for itself within [timeframe]. Would it help if I walked you through the numbers?` },
        { name:'Happy With Current Solution', script:`That's great to hear. Out of curiosity, what would make you consider switching if the right solution came along?\n\nOur clients who switched often tell us they didn't realize how much time they were losing until they saw the difference.` },
        { name:'Need to Talk to My Boss', script:`Absolutely. What questions do you think your boss will have?\n\nI can prepare a one-pager that addresses those concerns. Would it help if I joined that conversation?` },
        { name:'Not the Right Time', script:`I respect that. When would be a better time to revisit this?\n\nIn the meantime, I'll send you some case studies from companies in similar situations. No pressure — just want to make sure you have the info when the timing is right.` },
    ]},
    { id:'closing', name:'Closing', scenarios:[
        { name:'Trial Close', script:`If we could solve [problem], would this be something you'd want to move forward with?\n\nWhat would need to be true for you to say yes today?` },
        { name:'Urgency Creation', script:`I want to be transparent — our [pricing/onboarding] changes on [date]. If we can get started before then, you'll lock in [benefit].\n\nIs there anything blocking us from moving forward this week?` },
        { name:'Final Follow-Up', script:`Hi {{first_name}},\n\nI've sent over the proposal and wanted to check if you have any questions.\n\nI'm confident this will help {{company}} achieve [result]. Shall we set up a quick call to finalize the details?\n\n— {{sender_name}}` },
    ]},
    { id:'referral', name:'Referral Requests', scenarios:[
        { name:'Happy Client Referral', script:`Hi {{first_name}},\n\nI'm glad we've been able to help {{company}} with [result].\n\nI'm looking to work with more companies in the [industry] space. Do you know anyone who might be facing similar challenges? An introduction would mean a lot.\n\n— {{sender_name}}` },
        { name:'Warm Introduction Request', script:`Hi {{first_name}},\n\nI noticed you're connected to [contact] at [company]. I've been trying to reach them about [topic].\n\nWould you be comfortable making an introduction? I'd be happy to provide context on why I think this would be valuable for them.` },
    ]},
    { id:'re-engagement', name:'Re-engagement', scenarios:[
        { name:'Dormant Prospect', script:`Hi {{first_name}},\n\nIt's been a while since we last connected. A lot has changed on our end — we've [new feature/better pricing/case study].\n\nWould you be open to reconnecting? I think you'll find things are different now.\n\n— {{sender_name}}` },
        { name:'Post-Lost Re-engagement', script:`Hi {{first_name}},\n\nI know we didn't work out last time, and I respect that decision.\n\nI wanted to check in because we've made some significant improvements since then. Would you be open to a quick update call?\n\nNo hard feelings either way — I just want to make sure you know what's available when the timing is right.` },
    ]},
];

export default function Playbooks() {
    const [selected, setSelected] = useState(null);
    const [copiedIdx, setCopiedIdx] = useState(null);
    const [objectionInput, setObjectionInput] = useState('');
    const [objectionResponse, setObjectionResponse] = useState('');
    const [enrichInput, setEnrichInput] = useState('');
    const [enrichResult, setEnrichResult] = useState('');
    const [loading, setLoading] = useState(false);

    const copyScript = (script, idx) => { navigator.clipboard.writeText(script).then(() => { setCopiedIdx(idx); showToast('Script copied'); setTimeout(() => setCopiedIdx(null), 2000); }); };
    const handleObjection = async () => { if (!objectionInput.trim()) return; setLoading(true); try { const r = await generateObjectionResponse(null, objectionInput); setObjectionResponse(r); } catch (err) { showToast(err.message); } finally { setLoading(false); } };
    const handleEnrich = async () => { if (!enrichInput.trim()) return; setLoading(true); try { const r = await enrichProspect(enrichInput); setEnrichResult(r); } catch (err) { showToast(err.message); } finally { setLoading(false); } };

    const active = PLAYBOOKS.find(p => p.id === selected);

    return (
        <div className="mac-page">
            <div className="mac-page-header">
                <h1 className="mac-page-title">Sales Playbooks</h1>
            </div>

            <div className="mac-grid-3" style={{marginBottom:20}}>
                {PLAYBOOKS.map(pb => (
                    <div key={pb.id} className={`mac-stat`} style={{cursor:'pointer',borderColor:selected === pb.id ? 'var(--accent)' : 'var(--glass-border)',transition:'border-color 0.15s'}} onClick={() => setSelected(selected === pb.id ? null : pb.id)}>
                        <div style={{fontWeight:500,fontSize:'0.88rem',marginBottom:2}}>{pb.name}</div>
                        <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)'}}>{pb.scenarios.length} scripts</div>
                    </div>
                ))}
            </div>

            {active && (
                <div className="mac-group" style={{marginBottom:16}}>
                    <div className="mac-group-header">{active.name} <span className="mac-group-header-count">({active.scenarios.length} scripts)</span></div>
                    <div className="mac-group-body">
                        {active.scenarios.map((sc, i) => (
                            <div key={i} style={{padding:'12px 16px',borderBottom:i < active.scenarios.length - 1 ? '1px solid var(--border)' : 'none'}}>
                                <div className="mac-flex-between" style={{marginBottom:8}}>
                                    <span style={{fontWeight:500,fontSize:'0.85rem'}}>{sc.name}</span>
                                    <button className="mac-btn mac-btn-ghost mac-btn-sm" onClick={(e) => { e.stopPropagation(); copyScript(sc.script, `${active.id}-${i}`); }}>{copiedIdx === `${active.id}-${i}` ? 'Copied' : 'Copy'}</button>
                                </div>
                                <pre style={{background:'var(--bg-sunken)',border:'1px solid var(--border)',borderRadius:8,padding:12,fontSize:12,lineHeight:1.6,whiteSpace:'pre-wrap',fontFamily:'var(--font-mono)',color:'var(--text-primary)',margin:0}}>{sc.script}</pre>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="mac-grid-2">
                <div className="mac-group" style={{marginBottom:0}}>
                    <div className="mac-group-header">AI Objection Responder</div>
                    <div className="mac-group-body" style={{padding:'12px 16px'}}>
                        <div className="mac-input-wrap" style={{marginBottom:10}}>
                            <div className="mac-label">Enter the objection</div>
                            <input className="mac-input" value={objectionInput} onChange={e => setObjectionInput(e.target.value)} placeholder='e.g. "Your price is too high"' onKeyDown={e => e.key === 'Enter' && handleObjection()} />
                        </div>
                        <button className="mac-btn mac-btn-primary mac-btn-sm" onClick={handleObjection} disabled={loading || !objectionInput.trim()} style={{marginBottom:10}}>
                            {loading ? 'Generating...' : 'Generate Responses'}
                        </button>
                        {objectionResponse && <pre style={{background:'var(--bg-sunken)',border:'1px solid var(--border)',borderRadius:8,padding:12,whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.6,fontFamily:'var(--font-mono)',margin:0}}>{objectionResponse}</pre>}
                    </div>
                </div>
                <div className="mac-group" style={{marginBottom:0}}>
                    <div className="mac-group-header">AI Prospect Enrichment</div>
                    <div className="mac-group-body" style={{padding:'12px 16px'}}>
                        <div className="mac-input-wrap" style={{marginBottom:10}}>
                            <div className="mac-label">Company name</div>
                            <input className="mac-input" value={enrichInput} onChange={e => setEnrichInput(e.target.value)} placeholder='e.g. "Stripe"' onKeyDown={e => e.key === 'Enter' && handleEnrich()} />
                        </div>
                        <button className="mac-btn mac-btn-primary mac-btn-sm" onClick={handleEnrich} disabled={loading || !enrichInput.trim()} style={{marginBottom:10}}>
                            {loading ? 'Researching...' : 'Enrich Company'}
                        </button>
                        {enrichResult && <pre style={{background:'var(--bg-sunken)',border:'1px solid var(--border)',borderRadius:8,padding:12,whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.6,fontFamily:'var(--font-mono)',margin:0}}>{enrichResult}</pre>}
                    </div>
                </div>
            </div>
        </div>
    );
}
