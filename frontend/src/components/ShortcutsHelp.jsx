import { useState, useEffect } from 'react';
import useStore from '../store/useStore';

const SHORTCUTS = [
    { keys: ['Cmd', 'K'], desc: 'Open command palette' },
    { keys: ['?'], desc: 'Show keyboard shortcuts' },
    { keys: ['Esc'], desc: 'Close modal / palette' },
    { keys: ['1'], desc: 'Go to Dashboard' },
    { keys: ['2'], desc: 'Go to Daily Digest' },
    { keys: ['3'], desc: 'Go to Pipeline' },
    { keys: ['4'], desc: 'Go to Prospects' },
    { keys: ['5'], desc: 'Go to Outreach' },
    { keys: ['6'], desc: 'Go to Analytics' },
    { keys: ['7'], desc: 'Go to Reminders' },
    { keys: ['8'], desc: 'Go to Deal Rooms' },
    { keys: ['9'], desc: 'Go to Win/Loss' },
    { keys: ['0'], desc: 'Go to Competitors' },
    { keys: ['N'], desc: 'New prospect' },
    { keys: ['/'], desc: 'Focus search' },
    { keys: ['D'], desc: 'Toggle dark mode' },
    { keys: ['H'], desc: 'Go home' },
];

export default function ShortcutsHelp({ open, onClose }) {
    const { setAppPage, setTheme, theme, setPage } = useStore();

    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    useEffect(() => {
        if (open) return;
        const handler = (e) => {
            if (e.target.matches('input,textarea,select')) return;
            const key = e.key;
            if (key === '?') { e.preventDefault(); return; }
            const numMap = { '1': 'dashboard', '2': 'digest', '3': 'pipeline', '4': 'prospects', '5': 'outreach', '6': 'analytics', '7': 'reminders', '8': 'dealrooms', '9': 'winloss', '0': 'competitors' };
            if (numMap[key]) { e.preventDefault(); setAppPage(numMap[key]); }
            if (key === 'n' || key === 'N') { e.preventDefault(); document.dispatchEvent(new CustomEvent('openAddProspect')); }
            if (key === 'd' || key === 'D') { e.preventDefault(); setTheme(theme === 'dark' ? 'light' : 'dark'); }
            if (key === 'h' || key === 'H') { e.preventDefault(); setPage('home'); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, setAppPage, setTheme, theme, setPage, onClose]);

    if (!open) return null;

    return (
        <div className="cmd-overlay" onClick={onClose}>
            <div className="cmd-palette" onClick={e => e.stopPropagation()} style={{width:480}}>
                <div className="cmd-input-wrap" style={{borderBottom:'1px solid var(--border)',padding:'14px 18px'}}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{width:18,height:18,color:'var(--text-tertiary)',flexShrink:0}}>
                        <rect x="2" y="4" width="20" height="16" rx="2" ry="2"/><path d="M6 8h.001M10 8h.001M14 8h.001M18 8h.001M8 12h.001M12 12h.001M16 12h.001M7 16h10"/>
                    </svg>
                    <span style={{fontSize:'0.92rem',fontWeight:500,color:'var(--text-primary)'}}>Keyboard Shortcuts</span>
                    <span className="cmd-hint" style={{cursor:'pointer'}} onClick={onClose}>ESC</span>
                </div>
                <div style={{padding:'8px 12px',maxHeight:360,overflowY:'auto'}}>
                    {SHORTCUTS.map((s, i) => (
                        <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',borderRadius:6}}>
                            <span style={{fontSize:'0.82rem',color:'var(--text-secondary)'}}>{s.desc}</span>
                            <div style={{display:'flex',gap:4}}>
                                {s.keys.map(k => (
                                    <kbd key={k} style={{
                                        display:'inline-block',padding:'2px 7px',fontSize:'0.7rem',fontFamily:'monospace',
                                        background:'var(--bg-sunken)',border:'1px solid var(--border)',borderRadius:4,
                                        color:'var(--text-primary)',lineHeight:'1.4',whiteSpace:'nowrap'
                                    }}>{k}</kbd>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
