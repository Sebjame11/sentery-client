import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../store/AuthContext';
import useStore from '../store/useStore';
import { SenteryWordmark } from '../components/SenteryLogo';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';

const FEATURES = [
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>, label: 'Enterprise security', desc: 'End-to-end encrypted' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>, label: 'AI deal intelligence', desc: 'Real-time insights' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: 'Team sync', desc: 'Collaborate in real-time' },
  { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="14" height="14"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>, label: 'Smart analytics', desc: 'Data-driven decisions' },
];

const TESTIMONIALS = [
  { text: 'Sentery transformed how our team tracks deals. Pipeline visibility went from zero to 100.', name: 'Sarah Chen', role: 'VP of Sales, TechFlow' },
  { text: 'The AI insights alone saved us hours every week. Game changer.', name: 'Marcus Rivera', role: 'Head of Revenue, CloudScale' },
  { text: 'We closed 30% more deals in the first quarter using Sentery.', name: 'Emily Nakamura', role: 'Sales Director, DataSync' },
];

const METRICS = [
  { value: '$2.3B', label: 'Deals tracked' },
  { value: '94%', label: 'Uptime SLA' },
  { value: '12K+', label: 'Teams' },
];

function Particles({ count = 25 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    const particles = Array.from({length:count}, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.5 + 0.5,
      o: Math.random() * 0.25 + 0.08,
    }));
    window.addEventListener('resize', resize);
    const draw = () => {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width; if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height; if (p.y > canvas.height) p.y = 0;
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle = `rgba(215, 119, 87, ${p.o})`;
        ctx.fill();
      });
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0}} />;
}

function FloatingOrb({ size, top, left, color, delay = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let start = Date.now();
    const anim = () => {
      const t = (Date.now() - start) / 1000;
      el.style.transform = `translate(${Math.sin(t * 0.35 + delay) * 20}px, ${Math.cos(t * 0.25 + delay) * 15}px)`;
      animId = requestAnimationFrame(anim);
    };
    let animId = requestAnimationFrame(anim);
    return () => cancelAnimationFrame(animId);
  }, []);
  return (
    <div ref={ref} style={{
      position:'absolute',width:size,height:size,top,left,
      borderRadius:'50%',background:color,
      filter:`blur(${size * 0.35}px)`,opacity:0.25,
      pointerEvents:'none',willChange:'transform',
    }} />
  );
}

export default function SignIn() {
  const { user, signIn, signUp, signInWithGoogle, oauthError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [testiIdx, setTestiIdx] = useState(0);
  const [pendingEmail, setPendingEmail] = useState('');
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (oauthError) setError(oauthError);
  }, [oauthError]);

  useEffect(() => {
    if (user) useStore.getState().setPage('app');
  }, [user]);

  useEffect(() => {
    const iv = setInterval(() => setTestiIdx(i => (i + 1) % TESTIMONIALS.length), 5000);
    return () => clearInterval(iv);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password.trim()) { setError('Email and password required'); return; }
    if (isSignUp && !displayName.trim()) { setError('Display name required'); return; }
    setLoading(true);
    try {
      if (isSignUp) {
        const data = await signUp(email.trim(), password, displayName.trim());
        if (!data.session) {
          setPendingEmail(email.trim());
          setError('');
          toast.success('Confirmation link sent — check your email');
        }
      } else {
        await signIn(email.trim(), password);
        toast.success('Signed in');
      }
    } catch (err) {
      const msg = err.message || 'Something went wrong';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      await signInWithGoogle();
    } catch (err) {
      setGoogleLoading(false);
      const msg = err.message || 'Google sign-in failed';
      setError(msg);
      toast.error(msg);
    }
  };

  const toggleMode = () => {
    setTransitioning(true);
    setTimeout(() => {
      setIsSignUp(v => !v);
      setError('');
      setPendingEmail('');
      setTransitioning(false);
    }, 150);
  };

  const resetLocalSession = async () => {
    try { await supabase.auth.signOut(); } catch {}
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') && k.endsWith('-auth-token'))
      .forEach(k => localStorage.removeItem(k));
    localStorage.removeItem('vn_currentPage');
    localStorage.removeItem('vn_appPage');
    window.location.reload();
  };

  const inputStyle = {
    width:'100%',padding:'11px 13px',fontSize:13.5,fontWeight:400,
    background:'var(--bg-canvas)',color:'var(--text-primary)',
    border:'1.5px solid var(--border)',borderRadius:10,
    outline:'none',transition:'border-color 0.2s, box-shadow 0.2s',
    boxSizing:'border-box',fontFamily:'inherit',
  };

  if (user) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      style={{
        display:'flex',height:'100vh',overflow:'hidden',
        background:'var(--bg-canvas)',position:'relative',
      }}
    >
      <Toaster position="bottom-center" toastOptions={{duration:4000,style:{background:'var(--bg-surface)',color:'var(--text-primary)',border:'1px solid var(--border)',borderRadius:12,fontSize:13,padding:'12px 18px',boxShadow:'0 4px 20px rgba(0,0,0,0.08)'}}} />

      <Particles />
      <FloatingOrb size={550} top="-10%" left="30%" color="var(--accent)" delay={0} />
      <FloatingOrb size={400} top="50%" right="-5%" color="var(--accent)" delay={2} />
      <FloatingOrb size={300} bottom="-5%" left="40%" color="var(--accent)" delay={4} />

      <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:0}}>
        <svg style={{width:'100%',height:'100%',opacity:0.015}}>
          <defs>
            <pattern id="dg2" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="14" cy="14" r="0.6" fill="currentColor"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dg2)" />
        </svg>
      </div>

      <div style={{display:'flex',width:'100%',maxWidth:1120,margin:'0 auto',alignItems:'center',gap:0,position:'relative',zIndex:1,padding:'0 40px',height:'100vh'}}>
        {/* left */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{flex:'0 0 460px',paddingRight:48,display:'flex',flexDirection:'column',justifyContent:'center',height:'100vh',paddingTop:24,paddingBottom:24,boxSizing:'border-box'}}
        >
          <div style={{flexShrink:0}}>
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              style={{marginBottom:22}}
            >
              <SenteryWordmark height={42} />
            </motion.div>
          </div>

          <div style={{flexShrink:0,marginBottom:16}}>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              style={{fontSize:36,fontWeight:700,color:'var(--text-primary)',letterSpacing:-0.7,lineHeight:1.12,marginBottom:10}}
            >
              Intelligence that<br />
              <span style={{color:'var(--accent)'}}>closes deals</span>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              style={{fontSize:13.5,color:'var(--text-tertiary)',lineHeight:1.5}}
            >
              AI-powered pipeline management, competitive tracking, and team collaboration in one place.
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14,flexShrink:0}}
          >
            {FEATURES.map((f, i) => (
              <div key={i} style={{padding:'10px 13px',borderRadius:10,background:'var(--bg-surface)',border:'1px solid var(--border)'}}>
                <div style={{display:'flex',alignItems:'center',gap:7,marginBottom:2}}>
                  <span style={{color:'var(--accent)',flexShrink:0,display:'inline-flex'}}>{f.icon}</span>
                  <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{f.label}</span>
                </div>
                <div style={{fontSize:11.5,color:'var(--text-tertiary)',marginLeft:21}}>{f.desc}</div>
              </div>
            ))}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            style={{padding:'14px 18px',borderRadius:12,background:'var(--bg-surface)',border:'1px solid var(--border)',flexShrink:0,marginBottom:14,minHeight:96,position:'relative',overflow:'hidden'}}
          >
            <svg style={{position:'absolute',top:14,left:16,opacity:0.08}} width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9.983 3v7.391c0 5.704-3.731 9.57-8.983 10.609l-.995-2.151c2.432-.917 3.995-3.638 3.995-5.849h-4v-10h9.983zm14.017 0v7.391c0 5.704-3.748 9.571-9 10.609l-.996-2.151c2.433-.917 3.996-3.638 3.996-5.849h-3.983v-10h9.983z"/></svg>
            <div style={{position:'relative',paddingLeft:4}}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={testiIdx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <div style={{fontSize:12.5,color:'var(--text-primary)',lineHeight:1.55,marginBottom:10,fontWeight:400}}>
                    &ldquo;{TESTIMONIALS[testiIdx].text}&rdquo;
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:11.5}}>
                <span style={{fontWeight:600,color:'var(--text-primary)'}}>{TESTIMONIALS[testiIdx].name}</span>
                <span style={{color:'var(--text-tertiary)',marginLeft:5}}>{TESTIMONIALS[testiIdx].role}</span>
              </div>
              <div style={{display:'flex',gap:4}}>
                {TESTIMONIALS.map((_, i) => (
                  <div key={i} onClick={() => setTestiIdx(i)} style={{width:5,height:5,borderRadius:'50%',background: i === testiIdx ? 'var(--accent)' : 'var(--border)',transition:'background 0.3s',cursor:'pointer'}} />
                ))}
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.4 }}
            style={{display:'flex',gap:28,flexShrink:0}}
          >
            {METRICS.map((m,i) => (
              <div key={i}>
                <div style={{fontSize:18,fontWeight:700,color:'var(--text-primary)',letterSpacing:-0.2}}>{m.value}</div>
                <div style={{fontSize:11,color:'var(--text-tertiary)'}}>{m.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>

        {/* right */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{
            flex:1,maxWidth:400,marginLeft:'auto',
            opacity: transitioning ? 0 : 1,
            transform: transitioning ? 'translateY(8px) scale(0.98)' : 'translateY(0) scale(1)',
            transition:'opacity 0.2s ease, transform 0.2s ease',
          }}
        >
          <div style={{
            background:'var(--glass-bg)',
            backdropFilter:'var(--glass-blur)',
            WebkitBackdropFilter:'var(--glass-blur)',
            border:'1px solid var(--glass-border)',
            borderRadius:16,
            boxShadow:'var(--glass-shadow)',
            overflow:'hidden',position:'relative',
          }}>
            <div style={{
              position:'absolute',top:0,left:0,right:0,bottom:0,pointerEvents:'none',zIndex:0,
              background:'var(--glass-highlight)',
              borderRadius:16,
            }} />
            <div style={{
              position:'absolute',top:0,left:0,right:0,height:1,
              background:'linear-gradient(90deg, transparent, var(--accent), transparent)',
              opacity:0.25,pointerEvents:'none',zIndex:1,
            }} />

            <div style={{padding:'28px 28px 14px',textAlign:'center',position:'relative',zIndex:1}}>
              <div style={{
                width:44,height:44,borderRadius:12,
                border:'1.5px solid var(--border)',
                display:'flex',alignItems:'center',justifyContent:'center',
                margin:'0 auto 12px',
                color:'var(--accent)',
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" width="18" height="18"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div style={{fontSize:18,fontWeight:600,color:'var(--text-primary)',letterSpacing:-0.2}}>
                {isSignUp ? 'Create your account' : 'Welcome back'}
              </div>
              <div style={{fontSize:12.5,color:'var(--text-tertiary)',marginTop:3}}>
                {isSignUp ? 'Free trial — no credit card needed' : 'Sign in to continue'}
              </div>
            </div>

            {error && (
              <div style={{
                margin:'0 28px 8px',padding:'9px 12px',
                background:'var(--danger-tint)',color:'var(--danger)',
                borderRadius:8,fontSize:12.5,lineHeight:1.4,
                display:'flex',alignItems:'center',gap:7,
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="14" height="14" style={{flexShrink:0}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error}
              </div>
            )}

            <div style={{padding:'2px 28px 0'}}>
              <button type="button" onClick={handleGoogle} disabled={googleLoading} style={{
                width:'100%',padding:'10px 0',fontSize:13,fontWeight:500,
                background:'#fff',color:'#1f1f1f',
                border:'1.5px solid var(--border)',borderRadius:10,
                cursor: googleLoading ? 'default' : 'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:9,
                transition:'opacity 0.2s, box-shadow 0.2s',
                opacity: googleLoading ? 0.7 : 1,
                fontFamily:'inherit',
              }}
                onMouseEnter={e => { if (!googleLoading) e.currentTarget.style.boxShadow = '0 1px 6px rgba(0,0,0,0.12)'; }}
                onMouseLeave={e => { if (!googleLoading) e.currentTarget.style.boxShadow = 'none'; }}>
                <svg viewBox="0 0 48 48" width="17" height="17">
                  <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.1 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.1-2.6-.4-3.9z"/>
                </svg>
                {googleLoading ? 'Redirecting to Google\u2026' : 'Continue with Google'}
              </button>
              <div style={{display:'flex',alignItems:'center',gap:10,margin:'14px 0 2px'}}>
                <div style={{flex:1,height:1,background:'var(--border)'}} />
                <span style={{fontSize:11,color:'var(--text-tertiary)',whiteSpace:'nowrap'}}>or continue with email</span>
                <div style={{flex:1,height:1,background:'var(--border)'}} />
              </div>
            </div>

            {pendingEmail ? (
              <div style={{padding:'16px 28px 24px',textAlign:'center'}}>
                <div style={{
                  width:44,height:44,borderRadius:12,border:'1.5px solid var(--border)',
                  display:'flex',alignItems:'center',justifyContent:'center',
                  margin:'0 auto 12px',color:'var(--accent)',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>
                </div>
                <div style={{fontSize:15,fontWeight:600,color:'var(--text-primary)',letterSpacing:-0.2,marginBottom:6}}>Confirm your email</div>
                <div style={{fontSize:12.5,color:'var(--text-tertiary)',lineHeight:1.55,marginBottom:16}}>
                  We sent a confirmation link to<br />
                  <b style={{color:'var(--text-primary)',wordBreak:'break-all'}}>{pendingEmail}</b><br />
                  Click it to activate your account, then sign in.
                </div>
                <button type="button" disabled={resending} onClick={async () => {
                  setResending(true);
                  try {
                    await supabase.auth.resend({ type: 'signup', email: pendingEmail });
                    toast.success('Confirmation link resent');
                  } catch (e) {
                    toast.error(e.message || 'Could not resend');
                  }
                  setResending(false);
                }} style={{
                  width:'100%',marginBottom:8,padding:'11px 0',fontSize:13,fontWeight:600,
                  background: resending ? 'var(--accent-tint)' : 'var(--accent)',
                  color:'#fff',border:'none',borderRadius:10,
                  cursor: resending ? 'default' : 'pointer',
                  opacity: resending ? 0.7 : 1,fontFamily:'inherit',
                }}>{resending ? 'Sending\u2026' : 'Resend confirmation link'}</button>
                <button type="button" onClick={() => setPendingEmail('')} style={{
                  width:'100%',padding:'10px 0',fontSize:12.5,fontWeight:500,
                  background:'none',border:'1.5px solid var(--border)',borderRadius:10,
                  color:'var(--text-tertiary)',cursor:'pointer',fontFamily:'inherit',
                }}>Back to sign in</button>
              </div>
            ) : (
            <form onSubmit={handleSubmit} style={{padding:`${error ? '4px' : '10px'} 28px 12px`,display:'flex',flexDirection:'column',gap:3}}>
              {isSignUp && (
                <div>
                  <div style={{fontSize:10.5,fontWeight:600,color:'var(--text-tertiary)',marginBottom:3,letterSpacing:0.4,textTransform:'uppercase'}}>Name</div>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your full name" autoFocus={isSignUp} style={inputStyle}
                    onFocus={e => Object.assign(e.target.style, {borderColor:'var(--accent)',boxShadow:'0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)'})}
                    onBlur={e => Object.assign(e.target.style, {borderColor:'var(--border)',boxShadow:'none'})} />
                </div>
              )}
              <div>
                <div style={{fontSize:10.5,fontWeight:600,color:'var(--text-tertiary)',marginBottom:3,letterSpacing:0.4,textTransform:'uppercase'}}>Email</div>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoFocus={!isSignUp} autoComplete="email" style={inputStyle}
                  onFocus={e => Object.assign(e.target.style, {borderColor:'var(--accent)',boxShadow:'0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)'})}
                  onBlur={e => Object.assign(e.target.style, {borderColor:'var(--border)',boxShadow:'none'})} />
              </div>
              <div>
                <div style={{fontSize:10.5,fontWeight:600,color:'var(--text-tertiary)',marginBottom:3,letterSpacing:0.4,textTransform:'uppercase'}}>Password</div>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isSignUp ? 'Create a strong password' : 'Enter your password'} autoComplete={isSignUp ? 'new-password' : 'current-password'} style={inputStyle}
                  onFocus={e => Object.assign(e.target.style, {borderColor:'var(--accent)',boxShadow:'0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent)'})}
                  onBlur={e => Object.assign(e.target.style, {borderColor:'var(--border)',boxShadow:'none'})} />
              </div>
              <button type="submit" disabled={loading} style={{
                width:'100%',marginTop:10,padding:'12px 0',fontSize:13.5,fontWeight:600,
                background: loading ? 'var(--accent-tint)' : 'var(--accent)',
                color:'#fff',border:'none',borderRadius:10,
                cursor: loading ? 'default' : 'pointer',
                transition:'opacity 0.2s, transform 0.1s',
                opacity: loading ? 0.7 : 1,
                letterSpacing:0.1,fontFamily:'inherit',
              }}
                onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.92'; }}
                onMouseOut={e => { if (!loading) e.currentTarget.style.opacity = '1'; }}>
                {loading ? (
                  <span style={{display:'inline-flex',alignItems:'center',gap:10}}>
                    <span style={{width:15,height:15,border:'2.5px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.6s linear infinite',display:'inline-block'}}></span>
                    {isSignUp ? 'Creating account\u2026' : 'Signing in\u2026'}
                  </span>
                ) : isSignUp ? 'Create Account' : 'Sign In'}
              </button>
            </form>
            )}

            <div style={{borderTop:'1px solid var(--border)',padding:'12px 28px',display:'flex',justifyContent:'center',background:'color-mix(in srgb, var(--bg-canvas) 50%, transparent)'}}>
              <button onClick={toggleMode} style={{
                background:'none',border:'none',cursor:'pointer',
                color:'var(--text-tertiary)',fontSize:12.5,fontFamily:'inherit',
                transition:'color 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}
                <span style={{fontWeight:600,marginLeft:3}}>{isSignUp ? 'Sign in' : 'Sign up'}</span>
              </button>
            </div>

            <div style={{padding:'8px 28px 14px',textAlign:'center'}}>
              <button onClick={resetLocalSession} style={{
                background:'none',border:'none',cursor:'pointer',
                color:'var(--text-tertiary)',fontSize:11,fontFamily:'inherit',
                textDecoration:'underline',textUnderlineOffset:3,opacity:0.6,
              }}>
                Trouble signing in? Reset session
              </button>
            </div>
          </div>

          <div style={{textAlign:'center',marginTop:16,fontSize:11,color:'var(--text-tertiary)',opacity:0.4}}>
            End-to-end encryption &middot; &copy; 2026 Sentery
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}