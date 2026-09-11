import { useState, useEffect } from 'react';
import { getEmailAccounts, sendEmail, isApolloConfiguredAsync } from '../utils/apollo';
import { api } from '../utils/meetings';
import useStore from '../store/useStore';
import { showToast } from './Toast';

export default function ComposeEmailModal({ contact, onClose, onSent }) {
  const workspace = useStore(s => s.workspace);
  const [configured, setConfigured] = useState(null);
  const [gmail, setGmail] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [bookingLink, setBookingLink] = useState('');

  useEffect(() => {
    if (contact?.email) setTo(contact.email);
    if (workspace?.id) {
      api(`/meetings/status?workspace_id=${workspace.id}`, { auth: true })
        .then(r => setBookingLink(r.data?.booking_url || ''))
        .catch(() => {});
    }
    api(`/emails/status?workspace_id=${workspace.id}`, { auth: true })
      .then(r => { setGmail(r.connected && r.data ? r.data : null); })
      .catch(() => setGmail(null));
    isApolloConfiguredAsync().then(c => {
      setConfigured(c);
      if (c && !gmail) loadAccounts();
    });
  }, [contact, workspace?.id]);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const resp = await getEmailAccounts();
      const accs = resp.data || [];
      setAccounts(accs);
      if (accs.length === 1) setSelectedAccount(accs[0].id);
    } catch (err) {
      showToast('Failed to load email accounts: ' + err.message);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleSend = async (asDraft = false) => {
    if (!to) { showToast('Enter a recipient email'); return; }
    if (!subject) { showToast('Enter a subject'); return; }
    if (!body) { showToast('Enter email body'); return; }
    if (!selectedAccount && accounts.length > 0) { showToast('Select an email account'); return; }

    setSending(true);
    try {
      if (gmail) {
        await api('/emails/send', {
          method: 'POST',
          auth: true,
          body: { workspace_id: workspace.id, to, subject, body, prospect_id: contact?.id },
        });
        showToast('Email sent to ' + to);
        if (onSent) onSent();
        onClose();
        return;
      }
      const emailData = {
        email_account_id: selectedAccount || undefined,
        to_email: to,
        contact_id: contact?.customFields?.apollo_id || undefined,
        first_name: contact?.name?.split(' ')[0] || '',
        last_name: contact?.name?.split(' ').slice(1).join(' ') || '',
        company: contact?.company || '',
        title: contact?.title || '',
        subject,
        body,
      };

      if (asDraft) {
        showToast('Draft saved');
      } else {
        await sendEmail(emailData);
        showToast('Email sent to ' + to);
        if (onSent) onSent();
      }
      onClose();
    } catch (err) {
      showToast('Failed: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  if (configured === null) {
    return (
      <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:32,maxWidth:400,width:'95%',textAlign:'center'}}>
          <div style={{fontSize:13,color:'var(--text-tertiary)'}}>Checking Apollo...</div>
        </div>
      </div>
    );
  }

  if (!configured && !gmail) {
    return (
      <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:32,maxWidth:400,width:'95%',textAlign:'center'}}>
          <div style={{width:48,height:48,borderRadius:12,background:'var(--bg-sunken)',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 16px'}}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="24" height="24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
          </div>
          <div style={{fontSize:16,fontWeight:600,color:'var(--text-primary)',marginBottom:6}}>No Email Connected</div>
          <div style={{fontSize:13,color:'var(--text-tertiary)',marginBottom:16}}>Connect Gmail in Settings → Email Integrations (or add an Apollo API key) to send emails.</div>
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{position:'fixed',inset:0,zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)'}} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{background:'var(--bg-surface)',border:'1px solid var(--border)',borderRadius:16,padding:24,maxWidth:600,width:'95%',maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Compose Email</h3>
          <button className="btn-icon-sm" onClick={onClose}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>

        {contact && (
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:14,padding:'10px 12px',background:'var(--bg-sunken)',borderRadius:8}}>
            <div style={{width:32,height:32,borderRadius:8,background:'var(--accent-tint)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'var(--accent)',flexShrink:0}}>
              {contact.name?.[0] || '?'}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text-primary)'}}>{contact.name}</div>
              <div style={{fontSize:11,color:'var(--text-tertiary)'}}>{contact.email}{contact.title ? ` · ${contact.title}` : ''}{contact.company ? ` @ ${contact.company}` : ''}</div>
            </div>
          </div>
        )}

        <div style={{display:'flex',flexDirection:'column',gap:10,flex:1,overflow:'auto'}}>
          <div>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>From</label>
            {gmail ? (
              <div style={{padding:'8px 10px',fontSize:13,background:'var(--bg-sunken)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <span>{gmail.email}</span>
                <span style={{fontSize:10,fontWeight:600,padding:'2px 6px',borderRadius:4,background:'var(--success-tint)',color:'var(--success)'}}>Gmail</span>
              </div>
            ) : loadingAccounts ? (
              <div style={{fontSize:12,color:'var(--text-tertiary)',padding:'8px 0'}}>Loading accounts...</div>
            ) : accounts.length === 0 ? (
              <div style={{fontSize:12,color:'var(--warning)',padding:'8px 0'}}>No email accounts connected in Apollo. Connect one in Apollo Settings first.</div>
            ) : (
              <select value={selectedAccount} onChange={e => setSelectedAccount(e.target.value)}
                style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}}>
                <option value="">Select email account</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name} &lt;{a.email}&gt;</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>To</label>
            <input value={to} onChange={e => setTo(e.target.value)}
              style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}}
              placeholder="recipient@email.com" />
          </div>

          <div>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)}
              style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box'}}
              placeholder="Email subject" />
          </div>

          <div style={{flex:1}}>
            <label style={{display:'block',fontSize:11,fontWeight:600,color:'var(--text-tertiary)',marginBottom:4}}>Body</label>
            {bookingLink && (
              <button type="button" onClick={() => setBody(b => b + (b ? '\n\n' : '') + `You can book a time directly here: ${bookingLink}`)}
                style={{marginBottom:6,fontSize:11,padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:'var(--bg-surface)',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit'}}>
                Insert booking link
              </button>
            )}
            <textarea value={body} onChange={e => setBody(e.target.value)}
              style={{width:'100%',padding:'8px 10px',fontSize:13,background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:8,outline:'none',boxSizing:'border-box',resize:'vertical',minHeight:150,fontFamily:'inherit',lineHeight:1.5}}
              placeholder="Write your email here..." />
          </div>
        </div>

        <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16,paddingTop:14,borderTop:'1px solid var(--border)'}}>
          <button className="btn-secondary" onClick={() => handleSend(true)} disabled={sending} style={{fontSize:13}}>Save Draft</button>
          <button className="btn-primary" onClick={() => handleSend(false)} disabled={sending} style={{display:'flex',alignItems:'center',gap:6}}>
            {sending ? 'Sending...' : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
