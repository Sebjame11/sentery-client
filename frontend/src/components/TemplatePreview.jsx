import { useState } from 'react';
import useStore from '../store/useStore';

const SAMPLE_DATA = {
    first_name: 'Sarah',
    company: 'Stripe',
    pain_point: 'scaling their sales team',
    sender_name: 'Chetbrathna',
    sender_company: 'Sentery',
    industry: 'FinTech',
    city: 'San Francisco',
};

export default function TemplatePreview() {
    const { templates } = useStore();
    const [selected, setSelected] = useState(templates[0] || null);
    const [vars, setVars] = useState(SAMPLE_DATA);

    const replaceVars = (text) => {
        if (!text) return '';
        return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '{{' + key + '}}');
    };

    const setVar = (key, value) => setVars(prev => ({ ...prev, [key]: value }));

    if (templates.length === 0) {
        return (
            <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
                <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Template Preview</div>
                <div style={{textAlign:'center',padding:24,color:'var(--text-tertiary)',fontSize:'0.85rem'}}>Create a template in Outreach to preview it here</div>
            </div>
        );
    }

    return (
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:10,padding:16}}>
            <div style={{fontSize:'0.72rem',color:'var(--text-tertiary)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Template Preview</div>
            <div style={{display:'flex',gap:8,marginBottom:12}}>
                {templates.map(t => (
                    <button key={t.id} className={'btn-xs' + (selected?.id === t.id ? ' btn-xs-accent' : '')} onClick={() => setSelected(t)} style={{fontSize:'0.72rem'}}>{t.name}</button>
                ))}
            </div>
            {selected && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                    <div>
                        <div style={{fontSize:'0.68rem',color:'var(--text-tertiary)',marginBottom:4}}>Variables</div>
                        <div style={{display:'flex',flexDirection:'column',gap:4}}>
                            {Object.keys(SAMPLE_DATA).map(key => (
                                <div key={key} style={{display:'flex',alignItems:'center',gap:6}}>
                                    <span style={{fontSize:'0.68rem',color:'var(--text-tertiary)',width:80,flexShrink:0,textOverflow:'ellipsis',overflow:'hidden',whiteSpace:'nowrap'}}>{'{{' + key + '}}'}</span>
                                    <input className="field-input" style={{flex:1,height:26,fontSize:'0.72rem'}} value={vars[key] || ''} onChange={e => setVar(key, e.target.value)} />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div style={{fontSize:'0.68rem',color:'var(--text-tertiary)',marginBottom:4}}>Preview</div>
                        {selected.subject && (
                            <div style={{marginBottom:6,padding:'6px 8px',background:'var(--bg-sunken)',borderRadius:6}}>
                                <span style={{fontSize:'0.65rem',color:'var(--text-tertiary)'}}>Subject: </span>
                                <span style={{fontSize:'0.78rem',fontWeight:500}}>{replaceVars(selected.subject)}</span>
                            </div>
                        )}
                        <div style={{padding:'8px 10px',background:'var(--bg-sunken)',borderRadius:6,fontSize:'0.82rem',whiteSpace:'pre-wrap',lineHeight:1.7,minHeight:80}}>
                            {replaceVars(selected.body)}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
