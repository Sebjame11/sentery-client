import { useState, useEffect } from 'react';
import { api } from '../utils/meetings';
import { esc, sanitizeEmailHtml, renderPlainText } from '../utils/helpers';
import useStore from '../store/useStore';

export default function EmailDetailModal({ messageId, onClose }) {
  const workspace = useStore(s => s.workspace);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workspace?.id) return;
    api(`/emails/messages/${messageId}?workspace_id=${workspace.id}`, { auth: true })
      .then(r => setData(r.data))
      .catch(e => setError(e.message));
  }, [messageId, workspace?.id]);

  const fmt = (iso) => {
    if (!iso) return '';
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const bodyHtml = data?.body_html
    ? sanitizeEmailHtml(data.body_html)
    : renderPlainText(data?.body_text || data?.snippet || '');

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:680,width:'95%',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{data?.subject || 'Email'}</h3>
          <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        {error && <div style={{fontSize:13,color:'var(--danger)',padding:16}}>{error}</div>}
        {!data && !error && <div style={{fontSize:13,color:'var(--text-tertiary)',padding:16}}>Loading...</div>}

        {data && (
          <>
            <div style={{display:'flex',flexDirection:'column',gap:4,padding:'12px 14px',background:'var(--bg-canvas)',border:'1px solid var(--border)',borderRadius:10,fontSize:12,marginBottom:12}}>
              <div><span style={{color:'var(--text-tertiary)',width:70,display:'inline-block'}}>From</span><span style={{color:'var(--text-primary)'}}>{data.from_name ? data.from_name + ' ' : ''}<span style={{color:'var(--text-secondary)'}}>&lt;{data.from_email}&gt;</span></span></div>
              <div><span style={{color:'var(--text-tertiary)',width:70,display:'inline-block'}}>To</span><span style={{color:'var(--text-primary)'}}>{(data.to_emails || []).join(', ')}</span></div>
              {(data.cc_emails || []).length > 0 && <div><span style={{color:'var(--text-tertiary)',width:70,display:'inline-block'}}>CC</span><span style={{color:'var(--text-primary)'}}>{data.cc_emails.join(', ')}</span></div>}
              <div><span style={{color:'var(--text-tertiary)',width:70,display:'inline-block'}}>Date</span><span style={{color:'var(--text-primary)'}}>{fmt(data.sent_at)}</span></div>
              {data.direction && <div><span style={{color:'var(--text-tertiary)',width:70,display:'inline-block'}}>Type</span><span style={{color:'var(--text-primary)',textTransform:'capitalize'}}>{data.direction}</span></div>}
              {(data.touchpoints || []).length > 0 && (
                <div><span style={{color:'var(--text-tertiary)',width:70,display:'inline-block'}}>Contacts</span>
                  <span style={{color:'var(--accent)'}}>{data.touchpoints.map(t => t.prospect?.name || t.prospect_id).join(', ')}</span>
                </div>
              )}
            </div>

            <div style={{flex:1,overflowY:'auto',padding:'16px',background:'var(--bg-canvas)',borderRadius:10,border:'1px solid var(--border)'}} className="email-body" dangerouslySetInnerHTML={{__html: bodyHtml}} />

            {data.thread_messages?.length > 0 && (
              <div style={{borderTop:'1px solid var(--border)',marginTop:12,paddingTop:10}}>
                <div style={{fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:6,letterSpacing:0.2,textTransform:'uppercase'}}>Thread · {data.thread_messages.length + 1} messages</div>
                <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:180,overflowY:'auto'}}>
                  {[data, ...data.thread_messages].sort((a,b) => (a.sent_at||'').localeCompare(b.sent_at||'')).map(m => (
                    <div key={m.id} style={{fontSize:12,padding:'6px 10px',borderRadius:8,background:'var(--bg-sunken)',display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:3,background:m.id === data.id ? 'var(--accent-tint)' : 'var(--bg-canvas)',color:m.id === data.id ? 'var(--accent)' : 'var(--text-tertiary)',whiteSpace:'nowrap'}}>{m.direction === 'sent' ? 'Sent' : 'Received'}</span>
                      <span style={{color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{m.subject || '(no subject)'}</span>
                      <span style={{color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>{fmt(m.sent_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
