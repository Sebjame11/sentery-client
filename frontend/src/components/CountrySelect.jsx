import { useState, useRef, useEffect } from 'react';
import { ALL_COUNTRIES, countryFlag } from '../utils/helpers';

export default function CountrySelect({ value = [], onChange, placeholder = 'Type to select countries...' }) {
    const [input, setInput] = useState('');
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    const filtered = input
        ? ALL_COUNTRIES.filter(c => c.toLowerCase().includes(input.toLowerCase()) && !value.includes(c))
        : ALL_COUNTRIES.filter(c => !value.includes(c));

    const add = (country) => {
        if (!value.includes(country)) {
            onChange([...value, country]);
        }
        setInput('');
        setOpen(false);
    };

    const remove = (country) => {
        onChange(value.filter(c => c !== country));
    };

    useEffect(() => {
        const handle = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            {value.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                    {value.map(c => (
                        <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 6px', background: 'var(--accent-tint)', color: 'var(--accent)', borderRadius: 4, fontSize: '0.78rem' }}>
                            {countryFlag(c) && <span className={countryFlag(c)} style={{ fontSize: 12 }}></span>}
                            {c}
                            <button type="button" onClick={() => remove(c)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, fontSize: '0.85rem', lineHeight: 1, opacity: 0.6 }}>&times;</button>
                        </span>
                    ))}
                </div>
            )}
            <input
                className="field-input"
                type="text"
                placeholder={value.length === 0 ? placeholder : ''}
                value={input}
                onChange={e => { setInput(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
                style={{ width: '100%', boxSizing: 'border-box' }}
            />
            {open && filtered.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, maxHeight: 180, overflowY: 'auto', background: 'var(--glass-bg)', backdropFilter: 'blur(12px)', border: '1px solid var(--glass-border)', borderRadius: 8, boxShadow: 'var(--glass-shadow)', marginTop: 4 }}>
                    {filtered.map(c => (
                        <div key={c} onClick={() => add(c)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text)' }}>
                            {countryFlag(c) && <span className={countryFlag(c)} style={{ fontSize: 14 }}></span>}
                            {c}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
