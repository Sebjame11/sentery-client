import { useState, useMemo, useEffect, useRef } from 'react';
import useStore from '../store/useStore';

export default function CompanyPicker({ value, onChange, placeholder = 'Select or type a company...' }) {
  const companies = useStore(s => s.companies);
  const prospects = useStore(s => s.prospects);
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(-1);
  const ref = useRef(null);

  const options = useMemo(() => {
    const names = new Set(companies.map(c => c.name));
    prospects.forEach(p => { if (p.company) names.add(p.company); });
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [companies, prospects]);

  const q = (value || '').trim().toLowerCase();
  const matches = q ? options.filter(n => n.toLowerCase().includes(q)).slice(0, 10) : options.slice(0, 10);
  const exact = !!q && options.some(n => n.toLowerCase() === q);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const pick = (name) => { onChange(name); setOpen(false); setHl(-1); };

  const onKeyDown = (e) => {
    const last = matches.length + (q && !exact ? 1 : 0) - 1;
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHl(h => (h + 1) > last ? 0 : h + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHl(h => (h - 1) < 0 ? last : h - 1); }
    else if (e.key === 'Enter') {
      if (open && hl >= 0) { const target = q && !exact ? (hl === 0 ? value.trim() : matches[hl - 1]) : matches[hl]; if (target) { e.preventDefault(); pick(target); return; } }
      if (q && !exact && value.trim()) { pick(value.trim()); }
    }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="field" style={{gridColumn: undefined, position: 'relative'}} ref={ref}>
      <label className="field-label">Company</label>
      <input
        className="field-input"
        value={value || ''}
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onKeyDown={onKeyDown}
      />
      {open && (
        <div style={{
          position:'absolute', top:'100%', left:0, right:0, zIndex:30,
          background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:8,
          marginTop:4, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', maxHeight:220, overflowY:'auto', padding:4,
        }}>
          {q && !exact && (
            <div
              onClick={() => pick(value.trim())}
              onMouseEnter={() => setHl(0)}
              style={{
                padding:'8px 10px',fontSize:13,cursor:'pointer',borderRadius:6,
                background: hl === 0 ? 'var(--accent-tint)' : 'transparent',
                color:'var(--accent)',fontWeight:600,display:'flex',alignItems:'center',gap:6,
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12" style={{flexShrink:0}}><path d="M12 5v14M5 12h14"/></svg>
              Create New "{value.trim()}"
            </div>
          )}
          {matches.map((n, i) => {
            const idx = q && !exact ? i + 1 : i;
            return (
              <div
                key={n}
                onClick={() => pick(n)}
                onMouseEnter={() => setHl(idx)}
                style={{
                  padding:'8px 10px',fontSize:13,cursor:'pointer',borderRadius:6,
                  background: hl === idx ? 'var(--bg-sunken)' : 'transparent',
                  color:'var(--text-primary)',display:'flex',alignItems:'center',gap:6,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="12" height="12" style={{flexShrink:0,color:'var(--text-tertiary)'}}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                {n}
              </div>
            );
          })}
          {matches.length === 0 && !q && (
            <div style={{padding:'8px 10px',fontSize:12,color:'var(--text-tertiary)'}}>No companies yet — type a name to create one</div>
          )}
        </div>
      )}
      {q && !exact && value.trim() && (
        <div style={{fontSize:11,color:'var(--accent)',marginTop:4,fontWeight:500}}>New company — will be created in your CRM</div>
      )}
    </div>
  );
}