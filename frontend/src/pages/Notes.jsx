import { useState } from 'react';
import useStore from '../store/useStore';
import { showToast } from '../components/Toast';
import { openModalFn } from '../components/Modal';
import { encrypt, decrypt } from '../utils/crypto';

export default function Notes() {
    const { notes, addNote, deleteNote } = useStore();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [password, setPassword] = useState('');
    const [hint, setHint] = useState('');

    const strength = (() => { let s=0; if (password.length >= 8) s++; if (password.length >= 12) s++; if (/[A-Z]/.test(password) && /[a-z]/.test(password)) s++; if (/[0-9]/.test(password)) s++; return Math.min(s,4); })();
    const strengthColors = ['var(--border)','var(--danger)','var(--warning)','var(--success)','var(--success)'];
    const strengthLabels = ['','Weak','Fair','Good','Strong'];

    const createNote = async () => {
        if (!title.trim() || !content.trim() || !password) { showToast('Fill all fields'); return; }
        try { const encrypted = await encrypt(content, password); addNote({ title:title.trim(), hint:hint.trim(), encrypted, createdAt:new Date().toISOString().slice(0,10) }); setTitle(''); setContent(''); setPassword(''); setHint(''); showToast('Note saved'); } catch { showToast('Encryption failed'); }
    };

    const unlockNote = async (note) => {
        const pw = prompt('Enter password:'); if (!pw) return;
        try { const text = await decrypt(note.encrypted, pw); openModalFn(note.title, '<div style="font-size:0.82rem;color:var(--text-tertiary);margin-bottom:8px">'+note.createdAt+'</div><div style="font-size:0.88rem;white-space:pre-wrap;line-height:1.7">'+text.replace(/</g,'&lt;')+'</div>'); } catch { showToast('Wrong password'); }
    };

    return (
        <div className="mac-page">
            <div className="mac-page-header">
                <div className="mac-flex" style={{gap:8}}>
                    <h1 className="mac-page-title">Secure Notes</h1>
                    <span className="mac-tag" style={{fontSize:10}}>AES-256 encrypted</span>
                </div>
                <span className="mac-text-muted" style={{fontSize:'0.78rem'}}>{notes.length} notes</span>
            </div>

            <div className="mac-group" style={{marginBottom:20}}>
                <div className="mac-group-header">New Note</div>
                <div className="mac-group-body" style={{padding:'12px 16px'}}>
                    <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Title</div><input className="mac-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Note title" /></div>
                    <div className="mac-input-wrap" style={{marginBottom:10}}><div className="mac-label">Content</div><textarea className="mac-textarea" value={content} onChange={e => setContent(e.target.value)} placeholder="Write your note..." rows={3} /></div>
                    <div className="mac-grid-2" style={{gap:10,marginBottom:10}}>
                        <div className="mac-input-wrap"><div className="mac-label">Password</div><input className="mac-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" /></div>
                        <div className="mac-input-wrap"><div className="mac-label">Hint (optional)</div><input className="mac-input" value={hint} onChange={e => setHint(e.target.value)} placeholder="Password hint" /></div>
                    </div>
                    <div className="mac-flex" style={{gap:8,marginBottom:10}}>
                        {[1,2,3,4].map(i => <div key={i} style={{flex:1,height:4,borderRadius:2,background:strength>=i?strengthColors[strength]:'var(--border)',transition:'background 0.2s'}} />)}
                        {password.length > 0 && <span style={{fontSize:'0.72rem',color:strengthColors[strength]}}>{strengthLabels[strength]}</span>}
                    </div>
                    <button className="mac-btn mac-btn-primary" onClick={createNote}>Save Note</button>
                </div>
            </div>

            {notes.length === 0 && <div className="mac-group"><div className="mac-empty"><div className="mac-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="32" height="32"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></div><div className="mac-empty-title">No notes yet</div><div className="mac-empty-desc">Create your first encrypted note above.</div></div></div>}

            <div className="mac-grid-4">
                {notes.map(n => (
                    <div key={n.id} className="mac-group" style={{marginBottom:0}}>
                        <div className="mac-group-body" style={{padding:'12px 16px'}}>
                            <div style={{fontWeight:500,fontSize:'0.82rem',marginBottom:4}}>{n.title}</div>
                            <div style={{fontSize:'0.68rem',color:'var(--text-tertiary)',marginBottom:4}}>{n.createdAt}</div>
                            {n.hint && <div style={{fontSize:'0.68rem',color:'var(--text-muted)',fontStyle:'italic',marginBottom:8}}>Hint: {n.hint}</div>}
                            <div className="mac-gap-sm">
                                <button className="mac-btn mac-btn-ghost mac-btn-xs" onClick={() => unlockNote(n)}>View</button>
                                <button className="mac-btn mac-btn-ghost mac-btn-xs" style={{color:'var(--danger)'}} onClick={() => { if(confirm('Delete?')) { deleteNote(n.id); showToast('Note deleted'); } }}>Delete</button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
