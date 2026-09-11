import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { SenteryWordmark } from '../components/SenteryLogo';

const SCOPE_LABELS = {
  'sentery:read': 'Read your pipeline, prospects, and meetings',
  'sentery:write': 'Update prospects, log touchpoints, run sequences',
};

function scopeDescription(scope) {
  return scope
    .split(/\s+/)
    .filter(Boolean)
    .map(s => SCOPE_LABELS[s] || `Access: ${s}`);
}

export default function McpConsent() {
  const [params, setParams] = useState(null);
  const [error, setError] = useState('');
  const [clientName, setClientName] = useState('this app');
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const p = {
      client_id: q.get('client_id'),
      redirect_uri: q.get('redirect_uri'),
      response_type: q.get('response_type'),
      code_challenge: q.get('code_challenge'),
      code_challenge_method: q.get('code_challenge_method'),
      scope: q.get('scope'),
      state: q.get('state'),
    };
    setParams(p);
    if (!p.client_id || !p.redirect_uri || !p.code_challenge || p.response_type !== 'code') {
      setError('Invalid authorization request — missing required parameters.');
      setLoading(false);
      return;
    }
    fetch(`/api/mcp/client?client_id=${encodeURIComponent(p.client_id)}`)
      .then(r => r.ok ? r.json() : null)
      .then(c => { if (c?.client_name) setClientName(c.client_name); })
      .catch(() => {});
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
  }, []);

  const deny = () => {
    const base = params.redirect_uri;
    const sep = base.includes('?') ? '&' : '?';
    window.location.href = `${base}${sep}error=access_denied${params.state ? `&state=${encodeURIComponent(params.state)}` : ''}`;
  };

  const allow = async () => {
    if (!session) return;
    setSubmitting(true);
    try {
      const resp = await fetch('/api/mcp/auth/consent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          client_id: params.client_id,
          redirect_uri: params.redirect_uri,
          state: params.state,
          code_challenge: params.code_challenge,
          scope: params.scope,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to authorize');
      window.location.href = data.redirect_url;
    } catch (err) {
      setSubmitting(false);
      setError(err.message);
    }
  };

  const signIn = async (e) => {
    e.preventDefault();
    setSigningIn(true);
    setAuthError('');
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    setSigningIn(false);
    if (err) { setAuthError(err.message); return; }
    setSession(data.session);
  };

  const handleGoogle = async () => {
    setSigningIn(true);
    setAuthError('');
    const { data, error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (err) { setSigningIn(false); setAuthError(err.message); }
  };

  const cardStyle = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 32,
    width: '100%',
    maxWidth: 440,
    boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-canvas)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={cardStyle}>
        <SenteryWordmark height={30} style={{ marginBottom: 24 }} />
        {error && (
          <div style={{ fontSize: 13.5, color: 'var(--danger)', lineHeight: 1.5 }}>{error}</div>
        )}

        {!error && loading && (
          <div style={{ fontSize: 13.5, color: 'var(--text-tertiary)' }}>Loading…</div>
        )}

        {!error && !loading && !session && (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: -0.3 }}>
              Sign in to Sentery
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 18px', lineHeight: 1.5 }}>
              To connect <strong style={{ color: 'var(--text-secondary)' }}>{clientName}</strong>, sign in to the workspace you want to grant access to.
            </p>
            <button type="button" onClick={handleGoogle} disabled={signingIn} style={{
              width:'100%',padding:'10px 0',fontSize:13,fontWeight:500,
              background:'#fff',color:'#1f1f1f',
              border:'1.5px solid var(--border)',borderRadius:10,
              cursor: signingIn ? 'default' : 'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',gap:9,
              marginBottom:12,fontFamily:'inherit',
            }}>
              <svg viewBox="0 0 48 48" width="16" height="16">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/>
              </svg>
              {signingIn ? 'Redirecting to Google\u2026' : 'Continue with Google'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>or continue with email</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                className="field-input" type="email" required placeholder="Email" value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <input
                className="field-input" type="password" required placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)}
              />
              {authError && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{authError}</div>}
              <button className="btn-primary" type="submit" disabled={signingIn} style={{ width: '100%' }}>
                {signingIn ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        )}

        {!error && !loading && session && params && (
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', letterSpacing: -0.3 }}>
              Connect {clientName}?
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 16px', lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>{clientName}</strong> wants access to your Sentery
              workspace{clientName !== 'this app' ? ` (${session.user.email})` : ''}. It will be able to:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {scopeDescription(params.scope || 'sentery:read sentery:write').map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" width="14" height="14" style={{ flexShrink: 0 }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  {s}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" onClick={allow} disabled={submitting} style={{ flex: 1 }}>
                {submitting ? 'Connecting…' : 'Allow'}
              </button>
              <button className="btn-secondary" onClick={deny} disabled={submitting} style={{ flex: 1 }}>
                Deny
              </button>
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-tertiary)', margin: '16px 0 0', lineHeight: 1.5 }}>
              Sentery only shares data for the actions above. You can revoke access anytime in Settings → AI &amp; MCP.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
