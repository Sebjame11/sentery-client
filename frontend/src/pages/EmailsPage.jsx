import { useState, useEffect, useMemo } from 'react';
import useStore from '../store/useStore';
import { api } from '../utils/meetings';
import { esc, sanitizeEmailHtml, renderPlainText } from '../utils/helpers';
import { showToast } from '../components/Toast';
import ComposeEmailModal from '../components/ComposeEmailModal';

export default function EmailsPage() {
  const workspace = useStore(s => s.workspace);
  const companies = useStore(s => s.companies);
  const prospects = useStore(s => s.prospects);
  const [emails, setEmails] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(null);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [companyFilter, setCompanyFilter] = useState('all');
  const [contactFilter, setContactFilter] = useState('all');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeContact, setComposeContact] = useState(null);

  const loadEmails = async () => {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams({ workspace_id: workspace.id, limit: '100' });
      if (direction !== 'all') qs.set('direction', direction);
      if (search) qs.set('subject', search);
      if (companyFilter !== 'all') qs.set('company', companyFilter);
      if (contactFilter !== 'all') qs.set('contact_id', contactFilter);
      const r = await api(`/emails/search?${qs}`, { auth: true });
      setEmails(r.data || []);
      if (selectedId && !(r.data || []).some(e => e.id === selectedId)) setSelectedId(null);
    } catch (e) {
      setEmails([]);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    setSelectedId(id);
    try {
      const r = await api(`/emails/messages/${id}?workspace_id=${workspace?.id}`, { auth: true });
      setDetail(r.data);
    } catch {
      setDetail(null);
    }
  };

  useEffect(() => {
    if (!workspace?.id) return;
    api(`/emails/status?workspace_id=${workspace.id}`, { auth: true })
      .then(r => setConnected(r.connected && r.data ? r.data : null))
      .catch(() => setConnected(null));
    loadEmails();
  }, [workspace?.id]);

  useEffect(() => { loadEmails(); }, [direction, companyFilter, contactFilter]);

  const companyOptions = useMemo(() => {
    const names = new Set(companies.map(c => c.name));
    prospects.forEach(p => { if (p.company) names.add(p.company); });
    return [...names].sort();
  }, [companies, prospects]);

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    if (d.getFullYear() === today.getFullYear()) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const threadMessages = useMemo(() => {
    if (!detail) return [];
    return [detail, ...(detail.thread_messages || [])].sort((a, b) => (a.sent_at || '').localeCompare(b.sent_at || ''));
  }, [detail]);

  const bodyOf = (m) => m.body_html || m.body_text || m.snippet || '';
  const bodyIsHtml = (m) => !!m.body_html;

  if (connected === null) {
    return <div style={{ padding: '60px 32px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>Checking email connection...</div>;
  }

  if (!connected) {
    return (
      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: -0.4, margin: 0 }}>Emails</h1>
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', maxWidth: 420, padding: '48px 40px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--bg-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="26" height="26"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>No email account connected</div>
            <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginBottom: 18, lineHeight: 1.6 }}>
              Connect your Gmail to see all conversations with your contacts here — sent, received, threads, and company conversations. Emails are matched automatically.
            </div>
            <button className="btn-primary" onClick={() => useStore.getState().setAppPage('settings')}>Connect Gmail in Settings</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', height: '100%', animation: 'fadeSlideUp 0.3s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 650, color: 'var(--text-primary)', letterSpacing: -0.4, margin: 0 }}>Emails</h1>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 2 }}>{connected.email} · {emails.length} conversations</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="mac-btn" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} onClick={loadEmails}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
          <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => { setComposeContact(null); setComposeOpen(true); }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="13" height="13"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Compose
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320 }}>
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)', pointerEvents: 'none' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search subject..." value={search} onChange={e => { setSearch(e.target.value); if (!e.target.value) loadEmails(); }} onKeyDown={e => { if (e.key === 'Enter') loadEmails(); }}
            style={{ width: '100%', padding: '8px 10px 8px 32px', fontSize: 13, background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
        </div>
        <select className="field-input" value={direction} onChange={e => setDirection(e.target.value)} style={{ width: 120, padding: '8px 10px', fontSize: 12 }}>
          <option value="all">All mail</option>
          <option value="sent">Sent</option>
          <option value="received">Received</option>
        </select>
        <select className="field-input" value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} style={{ width: 200, padding: '8px 10px', fontSize: 12 }}>
          <option value="all">All companies</option>
          {companyOptions.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="field-input" value={contactFilter} onChange={e => setContactFilter(e.target.value)} style={{ width: 180, padding: '8px 10px', fontSize: 12 }}>
          <option value="all">All contacts</option>
          {prospects.filter(p => p.email).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 14, flex: 1, minHeight: 0 }}>
        <div style={{ flex: selectedId ? '0 0 380px' : '1', minWidth: 0, display: 'flex', flexDirection: 'column', transition: 'flex 0.2s' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', flex: 1, paddingRight: 2 }}>
            {loading && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>Loading emails...</div>}
            {!loading && emails.length === 0 && (
              <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" width="34" height="34" style={{ opacity: 0.25, marginBottom: 10 }}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>No emails found</div>
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{search ? 'Try a different search' : 'Emails matching your contacts will appear here after sync'}</div>
              </div>
            )}
            {emails.map(e => (
              <div key={e.id} onClick={() => loadDetail(e.id)} style={{
                padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                background: selectedId === e.id ? 'var(--accent-tint)' : 'var(--bg-surface)',
                border: selectedId === e.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                transition: 'all 0.12s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3, background: e.direction === 'sent' ? 'var(--bg-sunken)' : 'var(--accent-tint)', color: e.direction === 'sent' ? 'var(--text-tertiary)' : 'var(--accent)', whiteSpace: 'nowrap' }}>{e.direction === 'sent' ? 'Sent' : 'Received'}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 650, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{e.from_name || e.from_email}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{fmt(e.sent_at)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{e.subject || '(no subject)'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.snippet}</div>
              </div>
            ))}
          </div>
        </div>

        {selectedId && (
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '20px 24px' }}>
            {!detail ? (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading...</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.3, marginBottom: 4 }}>{esc(detail.subject || '(no subject)')}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{threadMessages.length} message{threadMessages.length > 1 ? 's' : ''} in thread</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {detail.from_email && (
                      <button className="mac-btn" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => { const c = prospects.find(p => p.email && p.email.toLowerCase() === detail.from_email.toLowerCase()); setComposeContact(c || null); setComposeOpen(true); }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="12" height="12"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                        Reply
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {threadMessages.map(m => (
                    <div key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--bg-canvas)', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ width: 26, height: 26, borderRadius: 7, background: m.direction === 'sent' ? 'var(--bg-sunken)' : 'var(--accent-tint)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: m.direction === 'sent' ? 'var(--text-tertiary)' : 'var(--accent)', flexShrink: 0 }}>{(m.from_name || m.from_email || '?')[0].toUpperCase()}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.from_name || m.from_email || 'Unknown'} <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>&lt;{m.from_email}&gt;</span></div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>To: {(m.to_emails || []).join(', ')}{(m.cc_emails || []).length ? ' · CC: ' + m.cc_emails.join(', ') : ''}</div>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>{new Date(m.sent_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                      </div>
                      <div style={{ padding: '12px 14px', fontSize: 13, lineHeight: 1.65, color: 'var(--text-primary)', wordBreak: 'break-word' }}
                        dangerouslySetInnerHTML={{ __html: bodyIsHtml(m) ? sanitizeEmailHtml(bodyOf(m)) : `<div style="white-space:pre-wrap">${esc(bodyOf(m))}</div>` }} />
                    </div>
                  ))}
                </div>

                {(detail.touchpoints || []).length > 0 && (
                  <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-tertiary)' }}>
                    Linked to: {detail.touchpoints.map(t => t.prospect?.name || t.prospect_id).join(', ')}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {composeOpen && <ComposeEmailModal contact={composeContact} onClose={() => setComposeOpen(false)} onSent={() => { setTimeout(loadEmails, 1500); }} />}
    </div>
  );
}