import { useState } from 'react';
import useStore from '../store/useStore';
import { showToast } from './Toast';

const TAG_COLORS = [
    { name: 'Red', bg: '#FBEAEA', fg: '#C4433A', darkBg: '#351F1D', darkFg: '#E07268' },
    { name: 'Orange', bg: '#F3E4DB', fg: '#D97757', darkBg: '#33241D', darkFg: '#E0885F' },
    { name: 'Yellow', bg: '#FDF6E3', fg: '#B98900', darkBg: '#2E2613', darkFg: '#D6A94E' },
    { name: 'Green', bg: '#EAF2EC', fg: '#4B7B5B', darkBg: '#1F2E23', darkFg: '#6FA482' },
    { name: 'Blue', bg: '#E8F0FA', fg: '#5B8DEF', darkBg: '#1D2640', darkFg: '#7BA4F0' },
    { name: 'Purple', bg: '#F0EAF8', fg: '#9B6BC4', darkBg: '#2A1F3D', darkFg: '#B088D6' },
    { name: 'Gray', bg: '#F0EFEB', fg: '#6B6862', darkBg: '#2A2724', darkFg: '#9C988F' },
];

export default function TagManager({ prospectId, onUpdate }) {
    const { prospects, updateProspect } = useStore();
    const prospect = prospects.find(p => p.id === prospectId);
    const [showPicker, setShowPicker] = useState(false);
    const [newTagName, setNewTagName] = useState('');

    if (!prospect) return null;
    const tags = Array.isArray(prospect.tags)
        ? prospect.tags
        : typeof prospect.tags === 'string' ? (() => { try { return JSON.parse(prospect.tags); } catch { return []; } })()
        : [];

    const saveTags = (updated) => {
        updateProspect(prospectId, { tags: updated });
    };

    const addTag = (tag) => {
        if (tags.find(t => t.name === tag.name && t.color === tag.color)) return;
        const updated = [...tags, tag];
        saveTags(updated);
        showToast('Tag added');
    };

    const removeTag = (idx) => {
        const updated = tags.filter((_, i) => i !== idx);
        saveTags(updated);
    };

    const addCustomTag = () => {
        if (!newTagName.trim()) return;
        const color = TAG_COLORS[tags.length % TAG_COLORS.length];
        addTag({ name: newTagName.trim(), color: color.name });
        setNewTagName('');
        setShowPicker(false);
    };

    return (
        <div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4,alignItems:'center'}}>
                {tags.map((tag, i) => {
                    const tc = TAG_COLORS.find(c => c.name === tag.color) || TAG_COLORS[6];
                    return (
                        <span key={i} onClick={() => removeTag(i)} style={{
                            display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',borderRadius:4,
                            fontSize:'0.68rem',fontWeight:500,cursor:'pointer',
                            background:tc.bg,color:tc.fg,lineHeight:'1.6'
                        }} title="Click to remove">
                            {tag.name}
                            <span style={{opacity:0.5,fontSize:'0.6rem'}}>&times;</span>
                        </span>
                    );
                })}
                <button className="btn-xs" onClick={() => setShowPicker(!showPicker)} style={{fontSize:'0.65rem',padding:'1px 6px'}}>+ Tag</button>
            </div>
            {showPicker && (
                <div style={{marginTop:6,padding:8,background:'var(--bg-sunken)',borderRadius:8,border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:6}}>
                        {TAG_COLORS.map(tc => (
                            <div key={tc.name} onClick={() => { addTag({ name: tc.name, color: tc.name }); setShowPicker(false); }}
                                style={{width:24,height:24,borderRadius:4,background:tc.bg,border:'2px solid ' + tc.fg,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                                <span style={{fontSize:'0.5rem',color:tc.fg,fontWeight:600}}>{tc.name[0]}</span>
                            </div>
                        ))}
                    </div>
                    <div style={{display:'flex',gap:4}}>
                        <input className="field-input" style={{flex:1,height:28,fontSize:'0.75rem'}} placeholder="Custom tag..." value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomTag()} />
                        <button className="btn-xs btn-xs-accent" onClick={addCustomTag}>Add</button>
                    </div>
                </div>
            )}
        </div>
    );
}
