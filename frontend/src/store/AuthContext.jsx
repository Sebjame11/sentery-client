import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import useStore from './useStore';

const AuthContext = createContext(null);

let authDiagSeq = 0;
const authDiag = (step, detail) => {
  authDiagSeq++;
  const entry = { seq: authDiagSeq, t: new Date().toISOString(), step, detail, url: window.location.href.slice(0, 140) };
  console.debug('[auth-diag]', JSON.stringify(entry));
  fetch('/api/auth-diag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [oauthError, setOauthError] = useState(null);
  const codeExchanged = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');

    const apply = (session) => {
      if (cancelled) return;
      authDiag('apply', session ? 'session:' + (session.user?.email || '?') : 'null');
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    };

    const oauthErr = url.searchParams.get('error');
    const oauthErrDesc = url.searchParams.get('error_description');
    if (oauthErr || oauthErrDesc) {
      authDiag('boot-oauth-error', oauthErr + ' / ' + oauthErrDesc);
      setOauthError(oauthErrDesc || ('Google sign-in failed: ' + oauthErr));
      url.searchParams.delete('error');
      url.searchParams.delete('error_code');
      url.searchParams.delete('error_description');
      window.history.replaceState(window.history.state, '', url.toString());
    }

    (async () => {
      try {
        if (code && !codeExchanged.current) {
          codeExchanged.current = true;
          authDiag('boot-code-found', 'exchanging code');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          authDiag('boot-exchange-result', error ? 'ERROR: ' + error.message : 'ok session:' + (data.session ? 'yes' : 'no'));
          if (error) throw error;
          apply(data.session);
          // Hard redirect to app after successful OAuth
          if (data.session) {
            localStorage.setItem('vn_currentPage', 'app');
            window.location.replace('/');
          }
        } else {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            authDiag('boot-stored-session', 'validating with getUser');
            const { error: userErr } = await supabase.auth.getUser();
            if (userErr) {
              authDiag('boot-stored-session-invalid', userErr.message);
              try { await supabase.auth.signOut(); } catch {}
              Object.keys(localStorage)
                .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
                .forEach(k => localStorage.removeItem(k));
              apply(null);
              return;
            }
          }
          apply(data.session);
        }
      } catch (err) {
        authDiag('boot-catch', err?.message || String(err));
        const { data } = await supabase.auth.getSession();
        apply(data.session);
      } finally {
        if (code) {
          url.searchParams.delete('code');
          url.searchParams.delete('state');
          window.history.replaceState(window.history.state, '', url.toString());
        }
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        authDiag('event-SIGNED_OUT', 're-reading storage');
        const { data } = await supabase.auth.getSession();
        apply(data.session);
      } else {
        authDiag('event-' + event, session ? 'session' : 'null');
        apply(session);
      }
    });

    return () => { cancelled = true; subscription?.unsubscribe(); };
  }, []);

  const signUp = async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
      setLoading(false);
    }
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (/not confirmed/i.test(error.message)) {
        throw new Error('Email not confirmed yet — click the confirmation link we sent you (check spam too).');
      }
      throw error;
    }
    if (data.session) {
      setSession(data.session);
      setUser(data.session.user);
      setLoading(false);
    }
    return data;
  };

  const signInWithGoogle = async () => {
    const redirectUrl = window.location.origin + '/signin';
    authDiag('google-click', 'redirectTo=' + redirectUrl);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl },
    });
    if (error) { authDiag('google-error', error.message); throw error; }
    authDiag('google-oauth-url', data.url.slice(0, 160));
    return data;
  };

  const signOut = async () => {
    localStorage.removeItem('vn_currentPage');
    localStorage.removeItem('vn_appPage');
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, oauthError, signUp, signIn, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
