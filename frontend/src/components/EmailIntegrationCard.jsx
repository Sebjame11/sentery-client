import { useState, useEffect } from 'react';
import { api } from '../utils/meetings';
import { showToast } from './Toast';
import useStore from '../store/useStore';

export default function EmailIntegrationCard() {
  const workspace = useStore(s => s.workspace);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = async () => {
    try {
      const r = await api(`/emails/status?workspace_id=${workspace?.id}`, { auth: true });
      setStatus(r);
    } catch (e) {
      setStatus({ connected: false, google_configured: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email');
    if (emailParam === 'connected') {
      showToast('Gmail connected — syncing recent emails');
      window.history.replaceState({}, '', window.location.pathname);
    } else if (emailParam === 'error') {
      showToast('Gmail connection failed: ' + (params.get('reason') || 'Unknown error'), 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (workspace?.id) load();
  }, [workspace?.id]);

  const connect = async () => {
    setConnecting(true);
    try {
      const r = await api(`/emails/connect?workspace_id=${workspace?.id}`, { auth: true });
      window.location.href = r.url;
    } catch (e) {
      showToast(e.message || 'Failed to start Gmail connection');
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect Gmail? Synced email history will be removed from the CRM.')) return;
    await api(`/emails/disconnect?workspace_id=${workspace?.id}`, { method: 'POST', auth: true, body: { workspace_id: workspace?.id } });
    showToast('Gmail disconnected');
    load();
  };

  const saveConfig = async (updates) => {
    await api(`/emails/config?workspace_id=${workspace?.id}`, { method: 'POST', auth: true, body: { ...updates, workspace_id: workspace?.id } });
    load();
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const r = await api(`/emails/sync?workspace_id=${workspace?.id}`, { method: 'POST', auth: true, body: { workspace_id: workspace?.id } });
      showToast(r.ok ? `Sync complete — ${r.stats?.created || 0} emails logged` : 'Sync issue: ' + (r.error || 'unknown'));
      load();
    } catch (e) {
      showToast('Sync failed: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const acc = status?.data;
  const needsAttention = acc?.needs_attention;

  return (
    <div className="settings-card" style={{ padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--bg-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" width="17" height="17"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/></svg>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Gmail Integration
              <span style={{ fontSize: 10, fontWeight: 500, padding: '2px 8px', borderRadius: 4, marginLeft: 8, background: acc ? (needsAttention ? 'var(--warning-tint)' : 'var(--success-tint)') : 'var(--bg-sunken)', color: acc ? (needsAttention ? 'var(--warning)' : 'var(--success)') : 'var(--text-tertiary)' }}>
                {loading ? '...' : !status?.google_configured ? 'Not configured' : needsAttention ? 'Needs attention' : acc ? 'Connected' : 'Not connected'}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Automatic email logging + MCP email intelligence</div>
          </div>
        </div>
        {acc && (
          <button className="btn-secondary" onClick={disconnect} style={{ fontSize: 11 }}>Disconnect</button>
        )}
      </div>

      {!status?.google_configured && (
        <div style={{ fontSize: 13, color: 'var(--warning)', padding: '10px 0' }}>
          Gmail OAuth is not configured on the server yet. Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET and enable the Gmail API.
        </div>
      )}

      {!acc && status?.google_configured && (
        <div style={{ background: 'var(--bg-canvas)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Connect Gmail</div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Emails sent and received on this mailbox are automatically logged against your CRM contacts, companies, and deals — even from Gmail app or mobile. You can also send from the CRM and let Claude read conversations.
            </div>
          </div>
          <button className="btn-primary" onClick={connect} disabled={connecting} style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {connecting ? 'Redirecting...' : 'Connect Gmail'}
          </button>
        </div>
      )}

      {acc && (
        <>
          {needsAttention && (
            <div style={{ background: 'color-mix(in srgb, var(--warning) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: 'var(--warning)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span>Gmail connection needs attention — access was revoked or expired.</span>
              <button className="btn-secondary" onClick={connect} style={{ fontSize: 11 }}>Reconnect</button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--bg-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{acc.email[0]?.toUpperCase()}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.email}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {acc.last_sync_at ? 'Last synced ' + timeAgo(acc.last_sync_at) : 'Not synced yet'}
              </div>
            </div>
            <button className="btn-secondary" onClick={syncNow} disabled={syncing} style={{ fontSize: 11 }}>
              {syncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {acc.last_sync_error && (
            <div style={{ fontSize: 11, color: 'var(--warning)', padding: '8px 0 0' }}>Last sync error: {acc.last_sync_error}</div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Automatic Email Logging</div>
              <button
                onClick={() => saveConfig({ auto_logging: !acc.auto_logging })}
                style={{
                  width: 38, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', padding: 0, transition: 'background 0.15s',
                  background: acc.auto_logging ? 'var(--accent)' : 'var(--border)', position: 'relative',
                }}
              >
                <span style={{
                  position: 'absolute', top: 2, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.15s',
                  left: acc.auto_logging ? 20 : 2, boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                }} />
              </button>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{acc.auto_logging ? 'On — new emails are logged automatically' : 'Off — emails are not logged'}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 6 }}>Initial Sync Window</div>
              <select
                className="field-input"
                value={acc.sync_window_days}
                onChange={e => { saveConfig({ sync_window_days: Number(e.target.value) }); showToast('Sync window updated'); }}
                style={{ padding: '6px 8px', fontSize: 12, width: '100%' }}
              >
                {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>Applies on the next full sync</div>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 10 }}>
            Scope: read + send on this mailbox. Emails are only logged when they match a CRM contact by email address.
          </div>
        </>
      )}
    </div>
  );
}

function timeAgo(iso) {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs / 60) + ' min ago';
  if (secs < 86400) return Math.floor(secs / 3600) + ' hr ago';
  return Math.floor(secs / 86400) + ' days ago';
}